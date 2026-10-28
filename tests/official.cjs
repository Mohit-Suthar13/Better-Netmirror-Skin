// Isolated adapter contracts against fixtures, not authenticated compatibility tests.
// Prime fixtures use observed public catalog markers; Netflix candidates remain experimental.
const {chromium, launchOptions} = require('./browser.cjs');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const props = ['--nmg-glass-opacity', '--nmg-glass-radius', '--nmg-dialog-opacity'];
const primeFixture = `<!doctype html><style>
  #pv-navigation-bar {height:72px;background:rgb(10,20,30)}
  [data-testid="card-container-list"] {display:flex;overflow-x:scroll;width:500px;padding:0}
  [data-testid="card-container-list"] > li {flex:0 0 300px}
  [data-testid="card"] {width:300px;height:160px}
  </style><header id="pv-navigation-bar"><nav data-testid="pv-navigation-bar"><div id="pv-nav-container"><a href="/">Prime Video</a></div></nav></header>
  <main data-testid="landingpage"><section data-testid="top-hero">Original hero</section>
  <ul data-testid="card-container-list"><li><article data-testid="card"><button id="original-action">Original action</button><div data-testid="card-overlay">Title one</div></article></li><li><article data-testid="card">Title two</article></li><li><article data-testid="card">Title three</article></li></ul>
  <button data-testid="left-arrow">Previous</button><button data-testid="right-arrow">Next</button></main>`;
const netflixFixture = `<!doctype html><style>.main-header{height:72px;background:rgb(10,20,30)}</style>
  <div id="appMountPoint"><div class="pinning-header"><header class="main-header"><a href="/browse">Netflix</a></header></div>
  <main><section class="lolomoRow"><div class="slider"><button class="handle">Next</button><button id="original-action">Original action</button></div></section></main></div>`;

(async () => {
  const browser = await chromium.launch(launchOptions);
  const pages = [];
  const errors = [];
  const stored = {enabled:true}; // The NetMirror switch must not enable either official site.
  async function publish(patch, area = 'local') {
    const changes = {};
    for (const [key, value] of Object.entries(patch)) {
      changes[key] = {oldValue:stored[key],newValue:value};
      if (area === 'local') stored[key] = value;
    }
    await Promise.all(pages.map(page => page.evaluate(({changes,area}) => {
      for (const callback of storageListeners) callback(changes,area);
    }, {changes,area})));
  }
  async function fixture(url, html) {
    const page = await browser.newPage({viewport:{width:1280,height:900},reducedMotion:'reduce'});
    page.on('pageerror', error => errors.push(error.message));
    // Every request is intercepted. These tests cannot reach the real services.
    await page.route('**/*', route => route.request().isNavigationRequest()
      ? route.fulfill({contentType:'text/html',body:html}) : route.abort());
    await page.goto(url);
    await page.exposeFunction('__readStorage', () => ({...stored}));
    await page.exposeFunction('__writeStorage', patch => publish(patch));
    await page.evaluate(() => {
      window.storageListeners = [];
      window.messageListeners = [];
      window.chrome = {
        storage:{
          local:{
            get:async defaults => {
              const saved = await __readStorage();
              if (defaults == null) return saved;
              if (typeof defaults === 'string') return {[defaults]:saved[defaults]};
              if (Array.isArray(defaults)) return Object.fromEntries(defaults.map(key=>[key,saved[key]]));
              return Object.fromEntries(Object.entries(defaults).map(([key,value])=>[key,Object.hasOwn(saved,key)?saved[key]:value]));
            },
            set:patch => __writeStorage(patch)
          },
          onChanged:{addListener:callback=>storageListeners.push(callback)}
        },
        runtime:{onMessage:{addListener:callback=>messageListeners.push(callback)}}
      };
      window.originalHeader = document.querySelector('#pv-navigation-bar,.main-header,header');
      window.originalAction = document.querySelector('#original-action');
      window.originalRow = document.querySelector('[data-testid="card-container-list"],.lolomoRow');
      window.actionCalls = 0;
      originalAction?.addEventListener('click',()=>actionCalls++);
      window.readStatus = () => new Promise(resolve => {
        for (const callback of messageListeners) callback({type:'nmg-status'}, {}, resolve);
      });
    });
    pages.push(page);
    for (const file of ['glass-controls.css','official.css']) await page.addStyleTag({content:read(file)});
    for (const file of ['glass.js','official.js']) await page.addScriptTag({content:read(file)});
    await page.waitForFunction(()=>messageListeners.length===1);
    return page;
  }
  async function active(page, site, transparency=52, blur=28) {
    await page.waitForFunction(({site,transparency,blur}) => {
      const root = document.documentElement;
      return root.getAttribute('data-nmg-official')===site &&
        root.style.getPropertyValue('--nmg-glass-opacity')===String((100-transparency)/100) &&
        root.style.getPropertyValue('--nmg-glass-radius')===`${blur}px` &&
        document.querySelectorAll('#nmg-official-controls').length===1;
    }, {site,transparency,blur});
    const header = page.locator('[data-nmg-official-header]');
    assert.equal(await header.count(),1);
    assert.match(await header.evaluate(el=>getComputedStyle(el).backdropFilter),new RegExp(`blur\\(${blur}px\\)`));
    assert.equal(await header.evaluate(el=>getComputedStyle(el).opacity),'1','Glass must not fade content');
  }
  async function inactive(page) {
    await page.waitForFunction(()=>!document.documentElement.hasAttribute('data-nmg-official') && !document.querySelector('#nmg-official-controls'));
    assert.equal(await page.locator('[data-nmg-official-header]').count(),0);
    assert.deepEqual(await page.evaluate(props=>props.map(name=>document.documentElement.style.getPropertyValue(name)),props),['','','']);
  }
  async function spa(page, pathname) {
    await page.evaluate(pathname => {
      history.pushState({},'',pathname);
      const marker = document.createElement('i');marker.hidden=true;document.body.append(marker);marker.remove();
    },pathname);
  }
  try {
    const prime = await fixture('https://www.primevideo.com/',primeFixture);
    const netflix = await fixture('https://www.netflix.com/browse',netflixFixture);
    await inactive(prime);await inactive(netflix);
    assert.equal((await prime.evaluate(()=>readStatus())).enabled,false);
    assert.equal((await netflix.evaluate(()=>readStatus())).enabled,false);

    const beforeLayout = await prime.locator('[data-testid="card-container-list"]').evaluate(el=>({width:el.clientWidth,scrollWidth:el.scrollWidth,overflow:getComputedStyle(el).overflowX}));
    await publish({primeEnabled:true});
    await active(prime,'prime');await inactive(netflix);
    assert.match((await prime.evaluate(()=>readStatus())).status,/Prime Video glass active/);
    assert.deepEqual(await prime.locator('[data-testid="card-container-list"]').evaluate(el=>({width:el.clientWidth,scrollWidth:el.scrollWidth,overflow:getComputedStyle(el).overflowX})),beforeLayout,'Native rails must retain sizing and scrolling');
    assert(beforeLayout.scrollWidth>beforeLayout.width);
    await prime.locator('[data-testid="card-container-list"]').evaluate(el=>{el.scrollLeft=120;});
    assert.equal(await prime.locator('[data-testid="card-container-list"]').evaluate(el=>el.scrollLeft),120);
    await publish({netflixEnabled:true});
    await active(netflix,'netflix');await active(prime,'prime');
    assert.match((await netflix.evaluate(()=>readStatus())).status,/experimental/);

    // Keyboard slider changes affect rendered glass, persist, and synchronize another site.
    await prime.locator('.nmg-open-glass').click();
    assert.equal(await prime.locator('.nmg-open-glass').getAttribute('aria-expanded'),'true');
    const transparency = prime.locator('[data-glass="glassTransparency"]');
    await transparency.press('ArrowRight');
    await active(prime,'prime',53,28);await active(netflix,'netflix',53,28);
    assert.equal(stored.glassTransparency,53);
    assert.equal(await transparency.getAttribute('aria-valuetext'),'53%');
    const blur = prime.locator('[data-glass="glassBlur"]');
    await blur.fill('12');await blur.dispatchEvent('input');
    await active(prime,'prime',53,12);await active(netflix,'netflix',53,12);
    assert.equal(stored.glassBlur,12);
    assert.equal(await netflix.locator('[data-glass="glassBlur"]').inputValue(),'12');
    await blur.press('Escape');
    assert.equal(await prime.locator('#nmg-official-panel').isVisible(),false);
    assert.equal(await prime.locator('.nmg-open-glass').evaluate(el=>document.activeElement===el),true);
    await prime.locator('.nmg-open-glass').click();
    await prime.locator('[data-glass-reset]').click();
    await active(prime,'prime');await active(netflix,'netflix');

    // Site-off is scoped, reversible and removes all owned material; original nodes survive.
    await prime.locator('.nmg-disable-site').click();
    await inactive(prime);await active(netflix,'netflix');
    assert.equal(stored.primeEnabled,false);assert.equal(stored.netflixEnabled,true);assert.equal(stored.enabled,true);
    assert.equal(await prime.evaluate(()=>originalHeader===document.querySelector('#pv-navigation-bar') && originalAction===document.querySelector('#original-action') && originalRow===document.querySelector('[data-testid="card-container-list"]')),true);
    assert.equal(await prime.locator('#pv-navigation-bar').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(10, 20, 30)');
    await prime.locator('#original-action').click();assert.equal(await prime.evaluate(()=>actionCalls),1);
    await publish({primeEnabled:true});await active(prime,'prime');
    await publish({primeEnabled:false,glassBlur:3},'sync');await active(prime,'prime');
    await publish({netflixEnabled:false});await inactive(netflix);await active(prime,'prime');

    // SPA route guards must tear down immediately after the host changes content.
    for (const pathname of ['/watch/123','/player/123','/login','/signin','/account','/profiles','/signup','/checkout','/purchase']) {
      await spa(prime,pathname);await inactive(prime);
      assert.match((await prime.evaluate(()=>readStatus())).status,/Waiting for a supported catalog/);
      await spa(prime,'/');await active(prime,'prime');
    }
    await prime.evaluate(()=>{window.detachedCatalog=document.querySelector('[data-testid="landingpage"]');detachedCatalog.remove();});
    await inactive(prime);
    await prime.evaluate(()=>document.body.append(detachedCatalog));await active(prime,'prime');
    // Exercise the fullscreen event guard without entering the user's desktop fullscreen.
    await prime.evaluate(()=>{
      Object.defineProperty(document,'fullscreenElement',{configurable:true,get:()=>window.fixtureFullscreen||null});
      window.fixtureFullscreen=originalRow;document.dispatchEvent(new Event('fullscreenchange'));
    });
    await inactive(prime);
    await prime.evaluate(()=>{window.fixtureFullscreen=null;document.dispatchEvent(new Event('fullscreenchange'));});
    await active(prime,'prime');

    await publish({netflixEnabled:true});await active(netflix,'netflix');
    for (const pathname of ['/','/watch/123','/login','/profiles']) {
      await spa(netflix,pathname);await inactive(netflix);
      await spa(netflix,'/browse');await active(netflix,'netflix');
    }
    await spa(netflix,'/search');await active(netflix,'netflix');
    await netflix.evaluate(()=>{window.detachedRow=document.querySelector('.lolomoRow');detachedRow.remove();});
    await inactive(netflix);
    await netflix.evaluate(()=>document.querySelector('main').append(detachedRow));await active(netflix,'netflix');
    assert.equal(await netflix.evaluate(()=>originalHeader===document.querySelector('.main-header') && originalRow===document.querySelector('.lolomoRow')),true);

    // An unrelated header or incomplete site shell never activates.
    const generic = await fixture('https://www.primevideo.com/', '<!doctype html><header id="pv-navigation-bar">Header only</header><main>Marketing</main>');
    await inactive(generic);
    const netflixShell = await fixture('https://www.netflix.com/browse','<!doctype html><div id="appMountPoint"><header class="main-header">Header only</header></div>');
    await inactive(netflixShell);
    // Duplicate injections must not attach more handlers or controls.
    await prime.addScriptTag({content:read('official.js')});
    assert.equal(await prime.evaluate(()=>messageListeners.length),1);
    assert.equal(await prime.locator('#nmg-official-controls').count(),1);
    await publish({primeEnabled:false,netflixEnabled:false});
    await Promise.all(pages.map(inactive));
    assert.deepEqual(errors,[]);
    console.log('PASS: default-off official adapters, independent site switches, rendered/live glass and storage sync, keyboard and reset controls, disable cleanup and original nodes, native Prime scrolling, SPA catalog/path/fullscreen guards, experimental Netflix status, generic-shell rejection, duplicate injection, and no runtime errors. Authenticated upstream compatibility is not asserted.');
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
