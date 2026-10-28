// Isolated extension contract checks. No live NetMirror requests or playback.
const {chromium, launchOptions} = require('./browser.cjs');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const props = ['--nmg-glass-opacity', '--nmg-glass-radius', '--nmg-dialog-opacity'];

(async () => {
  const browser = await chromium.launch(launchOptions);
  const pages = [];
  const errors = [];
  let stored = {enabled:true,glassTransparency:78,glassBlur:14};
  async function publish(patch) {
    const changes = {};
    for (const [key, value] of Object.entries(patch)) {
      changes[key] = {oldValue:stored[key],newValue:value};
      stored[key] = value;
    }
    await Promise.all(pages.map(page => page.evaluate(changes => {
      for (const callback of window.storageListeners) callback(changes, 'local');
    }, changes)));
  }
  async function wire(page, holdGet = false) {
    pages.push(page);
    page.on('pageerror', error => errors.push(error.message));
    await page.exposeFunction('__readStorage', () => ({...stored}));
    await page.exposeFunction('__writeStorage', publish);
    await page.evaluate(holdGet => {
      window.storageListeners = [];
      let release;
      const ready = holdGet ? new Promise(resolve => {release = resolve;}) : Promise.resolve();
      window.releasePrefs = () => release?.();
      window.chrome = {
        storage: {
          local: {
            get: async defaults => {await ready; return {...defaults, ...await window.__readStorage()};},
            set: patch => window.__writeStorage(patch)
          },
          onChanged:{addListener:callback => window.storageListeners.push(callback)}
        },
        runtime:{onMessage:{addListener:()=>{}}},
        tabs:{query:async()=>[{id:1}],sendMessage:async()=>({status:'Glass skin active'})}
      };
    }, holdGet);
  }
  const input = (page, key) => page.locator(`[data-glass="${key}"]`);
  async function expectGlass(page, transparency, blur) {
    await page.waitForFunction(({transparency, blur}) => {
      const root = document.documentElement;
      return root.style.getPropertyValue('--nmg-glass-opacity') === String((100-transparency)/100) &&
        root.style.getPropertyValue('--nmg-glass-radius') === `${blur}px`;
    }, {transparency, blur});
    const header = page.locator('[data-nmg-header]');
    assert.match(await header.evaluate(el=>getComputedStyle(el).backdropFilter), new RegExp(`blur\\(${blur}px\\)`));
    assert.equal(await header.evaluate(el=>getComputedStyle(el).opacity), '1', 'Glass adjustment must not fade text or controls');
  }
  try {
    const page = await browser.newPage({viewport:{width:1280,height:900},reducedMotion:'reduce'});
    await page.setContent(`<!doctype html><style>.hide{display:none!important}</style>
      <header id="main-header"><a class="logo">NetMirror</a></header>
      <main role="main"><section class="lolomoRow">Catalog</section></main><div id="player" class="hide"></div>`);
    await wire(page);
    for (const file of ['glass-controls.css','skin.css']) await page.addStyleTag({content:read(file)});
    for (const file of ['glass.js','content.js']) await page.addScriptTag({content:read(file)});
    await page.waitForSelector('html[data-nmg="glass"]');
    await expectGlass(page,78,14);
    await page.locator('[data-action="settings"]').click();
    assert.equal(await input(page,'glassTransparency').inputValue(),'78');
    assert.equal(await input(page,'glassBlur').inputValue(),'14');

    // Native keyboard range input changes the material and persists without disabling the skin.
    await input(page,'glassTransparency').focus();
    await input(page,'glassTransparency').press('ArrowRight');
    await expectGlass(page,79,14);
    await page.waitForFunction(async()=> (await chrome.storage.local.get({})).glassTransparency===79);
    assert.equal(stored.enabled,true);
    assert.equal(await input(page,'glassTransparency').getAttribute('aria-valuetext'),'79%');
    assert.equal(await page.locator('[data-glass-output="glassTransparency"]').textContent(),'79%');
    await input(page,'glassBlur').fill('36');
    await input(page,'glassBlur').dispatchEvent('input');
    await expectGlass(page,79,36);
    await page.waitForFunction(async()=> (await chrome.storage.local.get({})).glassBlur===36);

    // A popup must keep controls disabled until persisted values have loaded.
    const popup = await browser.newPage({viewport:{width:340,height:650},reducedMotion:'reduce'});
    await popup.setContent(read('popup.html').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<link\b[^>]*>/gi,''));
    await wire(popup,true);
    for (const file of ['glass-controls.css','popup.css']) await popup.addStyleTag({content:read(file)});
    for (const file of ['glass.js','sites.js','popup.js']) await popup.addScriptTag({content:read(file)});
    assert.equal(await popup.locator('#enabled').isDisabled(),true);
    assert.equal(await input(popup,'glassBlur').isDisabled(),true);
    await popup.evaluate(()=>window.releasePrefs());
    await popup.waitForFunction(()=>!document.querySelector('#enabled').disabled);
    assert.equal(await input(popup,'glassBlur').inputValue(),'36');
    assert.equal(await input(popup,'glassTransparency').inputValue(),'79');
    assert.equal(await input(popup,'glassTransparency').isDisabled(),false);
    assert((await input(popup,'glassTransparency').boundingBox()).width>150, 'Popup range must not inherit checkbox dimensions');

    // Popup controls and independent storage events synchronize the already-open page.
    await input(popup,'glassBlur').fill('8');
    await input(popup,'glassBlur').dispatchEvent('input');
    await expectGlass(page,79,8);
    assert.equal(await input(page,'glassBlur').inputValue(),'8');
    await publish({glassTransparency:20,glassBlur:40});
    await expectGlass(page,20,40);
    assert.equal(await input(popup,'glassTransparency').inputValue(),'20');
    assert.equal(await input(popup,'glassBlur').inputValue(),'40');

    await popup.locator('#enabled').uncheck();
    await page.waitForSelector('html:not([data-nmg])');
    assert.deepEqual(await page.evaluate(props=>props.map(name=>document.documentElement.style.getPropertyValue(name)),props),['','','']);
    assert.equal(await page.locator('#nmg-settings').count(),0);
    assert.equal(await input(popup,'glassTransparency').isDisabled(),true);
    await popup.locator('#enabled').check();
    await expectGlass(page,20,40);
    await page.locator('[data-action="settings"]').click();
    assert.equal(await input(page,'glassBlur').inputValue(),'40');

    // A provider remount retains the same saved controls and actual rendered material.
    await page.evaluate(()=>{
      document.body.innerHTML='<div id="root"><main><div class="fixed"><a href="/home"><h1>NetMirror</h1></a><a ranger="ranger_header_home" href="/home">Home</a><div ranger="ranger_ott" tabindex="0">Services</div></div><section ranger="ranger_section_banner">Prime catalog</section></main></div>';
    });
    await page.waitForSelector('html[data-nmg-layout="prime"]');
    await expectGlass(page,20,40);
    await page.locator('[data-action="settings"]').click();
    assert.equal(await input(page,'glassTransparency').inputValue(),'20');
    await page.locator('[data-glass-reset]').click();
    await expectGlass(page,52,28);
    await popup.waitForFunction(()=>document.querySelector('[data-glass="glassBlur"]').value==='28');
    assert.equal(stored.glassTransparency,52);
    assert.equal(stored.glassBlur,28);

    // Imported/corrupt preference values cannot yield invalid CSS or exceed the slider bounds.
    await publish({glassTransparency:200,glassBlur:-12});
    await expectGlass(page,90,0);
    assert.equal(await input(popup,'glassTransparency').inputValue(),'90');
    await publish({glassTransparency:'bad',glassBlur:null});
    await expectGlass(page,52,28);
    assert.equal(await input(popup,'glassBlur').inputValue(),'28');
    assert.deepEqual(errors,[]);
    console.log('PASS: saved glass initialization, native keyboard/input updates and persistence, popup loading and sizing, cross-context storage sync, disable/reenable restoration, Prime remount, reset, malformed preference handling, and no runtime errors.');
  } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;});
