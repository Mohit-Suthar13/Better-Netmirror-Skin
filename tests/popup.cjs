// Popup consent and registration contracts; Chrome APIs are mocked, with no live host access.
const {chromium, launchOptions, screenshotPath} = require('./browser.cjs');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname,'..');
const read = name=>fs.readFileSync(path.join(root,name),'utf8');
const netflix = ['https://www.netflix.com/*','https://netflix.com/*'];
const prime = ['https://www.primevideo.com/*','https://primevideo.com/*'];

(async()=>{
  const browser = await chromium.launch(launchOptions);
  const errors = [];
  async function createPopup(seed = {}) {
    const page = await browser.newPage({viewport:{width:360,height:600},reducedMotion:'reduce'});
    page.on('pageerror',error=>errors.push(error.message));
    await page.setContent(read('popup.html').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<link\b[^>]*>/gi,''));
    await page.evaluate(seed=>{
      const listeners = [];
      const state = window.testState = {
        prefs:{enabled:true,netflixEnabled:false,primeEnabled:false,glassTransparency:52,glassBlur:28,...seed.prefs},
        grants:[],calls:[],requestAllowed:true,failWrites:0,failSyncs:0,
        activeURL:seed.activeURL || 'https://www.netflix.com/browse',hasStatus:false,
        injectFails:false
      };
      const publish = patch=>{
        const changes = {};
        for(const [key,newValue] of Object.entries(patch)){
          changes[key]={oldValue:state.prefs[key],newValue};state.prefs[key]=newValue;
        }
        listeners.forEach(listener=>listener(changes,'local'));
      };
      window.publish = publish;
      let release;
      const ready = seed.holdGet ? new Promise(resolve=>release=resolve) : Promise.resolve();
      window.releasePrefs=()=>release?.();
      window.chrome={
        storage:{local:{
          get:async defaults=>{await ready;return {...defaults,...state.prefs};},
          set:async patch=>{
            state.calls.push(['storage',patch]);
            if(state.failWrites>0){state.failWrites--;throw new Error('Storage unavailable');}
            publish(patch);
          }
        },onChanged:{addListener:listener=>listeners.push(listener)}},
        permissions:{
          request:async request=>{
            state.calls.push(['request',request]);
            if(!state.requestAllowed)return false;
            state.grants=[...new Set([...state.grants,...request.origins])];return true;
          },
          remove:async request=>{
            state.calls.push(['remove',request]);
            state.grants=state.grants.filter(origin=>!request.origins.includes(origin));return true;
          }
        },
        runtime:{sendMessage:async message=>{
          state.calls.push(['sync',message]);
          if(state.failSyncs>0){state.failSyncs--;return {ok:false,error:'Registration unavailable'};}
          return {ok:true};
        }},
        tabs:{
          query:async()=>[{id:7,url:state.activeURL}],
          sendMessage:async (id,message)=>{
            state.calls.push(['status',id,message]);
            if(!state.hasStatus)throw new Error('No receiver');
            return {status:'Glass active on the current site'};
          }
        },
        scripting:{
          insertCSS:async options=>{state.calls.push(['insertCSS',options]);},
          executeScript:async options=>{
            state.calls.push(['executeScript',options]);
            if(state.injectFails)throw new Error('Tab navigated');
            state.hasStatus=true;
          }
        }
      };
    },seed);
    for(const file of ['glass-controls.css','popup.css'])await page.addStyleTag({content:read(file)});
    for(const file of ['glass.js','sites.js','popup.js'])await page.addScriptTag({content:read(file)});
    return page;
  }
  const state = page=>page.evaluate(()=>window.testState);
  async function ready(page){await page.waitForFunction(()=>!document.querySelector('#enabled').disabled);}
  async function setToggle(page,key,checked){
    if (await page.locator(`#${key}`).isChecked() !== checked) await page.locator(`#${key}`).click();
    await page.waitForFunction(key=>!document.getElementById(key).disabled,key);
  }
  const checked = (page,key)=>page.locator(`#${key}`).isChecked();
  const slidersDisabled = page=>page.locator('[data-glass="glassBlur"]').isDisabled();
  try{
    const page=await createPopup({holdGet:true});
    for(const key of ['enabled','netflixEnabled','primeEnabled'])assert.equal(await page.locator(`#${key}`).isDisabled(),true);
    assert.equal(await slidersDisabled(page),true);
    await page.evaluate(()=>window.releasePrefs());await ready(page);
    assert.equal(await checked(page,'enabled'),true);
    assert.equal(await checked(page,'netflixEnabled'),false);
    assert.equal(await checked(page,'primeEnabled'),false);
    assert.equal(await slidersDisabled(page),false);

    // Denial does not persist opt-in, request registration, or inject into the active tab.
    await page.evaluate(()=>{testState.requestAllowed=false;testState.calls=[];});
    await setToggle(page,'netflixEnabled',true);
    let s=await state(page);
    assert.equal(s.prefs.netflixEnabled,false);
    assert.equal(await checked(page,'netflixEnabled'),false);
    assert.match(await page.locator('#status').textContent(),/not granted/);
    assert.deepEqual(s.calls,[['request',{origins:netflix}]]);

    // Exact origin consent precedes registration and one-time application to an already-open tab.
    await page.evaluate(()=>{testState.requestAllowed=true;testState.calls=[];});
    await setToggle(page,'netflixEnabled',true);
    s=await state(page);
    assert.deepEqual(s.calls[0],['request',{origins:netflix}]);
    assert.deepEqual(s.calls.find(call=>call[0]==='sync'),['sync',{type:'nmg-sync-sites'}]);
    assert.deepEqual(s.calls.find(call=>call[0]==='insertCSS'),['insertCSS',{target:{tabId:7},files:['glass-controls.css','official.css']}]);
    assert.deepEqual(s.calls.find(call=>call[0]==='executeScript'),['executeScript',{target:{tabId:7},files:['glass.js','official.js']}]);
    assert.equal(s.prefs.netflixEnabled,true);
    assert.match(await page.locator('#status').textContent(),/Glass active/);

    // All three switches are independent; shared sliders stay active for any enabled site.
    await setToggle(page,'enabled',false);
    assert.equal(await checked(page,'netflixEnabled'),true);
    assert.equal(await slidersDisabled(page),false);
    await setToggle(page,'primeEnabled',true);
    s=await state(page);
    assert.deepEqual(s.calls.filter(call=>call[0]==='request').at(-1),['request',{origins:prime}]);
    assert.equal(s.calls.filter(call=>call[0]==='executeScript').length,1,'Prime opt-in must not inject into a Netflix tab');
    await setToggle(page,'netflixEnabled',false);
    assert.equal(await checked(page,'primeEnabled'),true);
    assert.equal(await slidersDisabled(page),false);
    s=await state(page);
    assert.deepEqual(s.grants,prime);
    assert.deepEqual(s.calls.filter(call=>call[0]==='remove').at(-1),['remove',{origins:netflix}]);
    await setToggle(page,'primeEnabled',false);
    assert.equal(await slidersDisabled(page),true);
    assert.deepEqual((await state(page)).grants,[]);

    // A page with a responder is not injected twice, even after opt-out/opt-in.
    await setToggle(page,'netflixEnabled',true);
    assert.equal((await state(page)).calls.filter(call=>call[0]==='executeScript').length,1);
    await page.evaluate(()=>window.publish({netflixEnabled:false,primeEnabled:true,glassBlur:17}));
    assert.equal(await checked(page,'netflixEnabled'),false);
    assert.equal(await checked(page,'primeEnabled'),true);
    assert.equal(await page.locator('[data-glass="glassBlur"]').inputValue(),'17');
    assert.equal(await slidersDisabled(page),false);

    // Save failures restore a NetMirror toggle and expose a useful retry status.
    await page.evaluate(()=>{testState.failWrites=1;});
    await setToggle(page,'enabled',true);
    assert.equal(await checked(page,'enabled'),false);
    assert.equal((await state(page)).prefs.enabled,false);
    assert.match(await page.locator('#status').textContent(),/Could not save/);

    // Failed optional opt-in must not leave its preference enabled.
    await page.evaluate(()=>{testState.failWrites=1;});
    await setToggle(page,'netflixEnabled',true);
    assert.equal(await checked(page,'netflixEnabled'),false);
    assert.equal((await state(page)).prefs.netflixEnabled,false);
    assert.match(await page.locator('#status').textContent(),/Could not update Netflix/);
    assert.equal((await state(page)).grants.some(origin=>netflix.includes(origin)),false,'Storage failure must revoke newly granted host access');
    await page.evaluate(()=>{testState.failSyncs=1;});
    await setToggle(page,'netflixEnabled',true);
    assert.equal(await checked(page,'netflixEnabled'),false);
    assert.equal((await state(page)).prefs.netflixEnabled,false);
    assert.match(await page.locator('#status').textContent(),/Could not update Netflix/);
    assert.equal((await state(page)).grants.some(origin=>netflix.includes(origin)),false,'Registration failure must revoke newly granted host access');

    // Turning off must revoke host access even if the worker cannot unregister immediately.
    await setToggle(page,'netflixEnabled',true);
    await page.evaluate(()=>{testState.failSyncs=1;});
    await setToggle(page,'netflixEnabled',false);
    assert.equal((await state(page)).prefs.netflixEnabled,false);
    assert.equal((await state(page)).grants.some(origin=>netflix.includes(origin)),false,'Disable must revoke access after a registration error');
    assert.match(await page.locator('#status').textContent(),/Could not update Netflix/);

    // Consent/registration may succeed while the selected tab navigates away; offer refresh.
    const navigated=await createPopup();await ready(navigated);
    await navigated.evaluate(()=>testState.injectFails=true);
    await setToggle(navigated,'netflixEnabled',true);
    assert.equal((await state(navigated)).prefs.netflixEnabled,true);
    assert.match(await navigated.locator('#status').textContent(),/Refresh its tab/);

    // HTTP or lookalike hosts are never eligible for one-time injection.
    const elsewhere=await createPopup({activeURL:'https://www.netflix.com.example.test/browse'});await ready(elsewhere);
    await setToggle(elsewhere,'netflixEnabled',true);
    assert.equal((await state(elsewhere)).calls.some(call=>call[0]==='executeScript'),false);

    const preview=await createPopup({prefs:{netflixEnabled:true,primeEnabled:true},activeURL:'https://net77.cc/home'});await ready(preview);
    const popupSize=await preview.evaluate(()=>({width:document.documentElement.scrollWidth,height:document.body.scrollHeight,footerBottom:document.querySelector('footer').getBoundingClientRect().bottom}));
    assert.ok(popupSize.width<=360,`Popup must not overflow horizontally: ${JSON.stringify(popupSize)}`);
    assert.ok(popupSize.height<=600 && popupSize.footerBottom<=600,`Typical popup must fit Chrome's 600px height: ${JSON.stringify(popupSize)}`);
    await preview.screenshot({path:screenshotPath('nmg-popup-review.png'),fullPage:true});
    assert.deepEqual(errors,[]);
    console.log('PASS: popup loading, denied/exact host consent, three independent switches, shared sliders, storage sync, registration/storage errors, one-time active-tab injection, host restriction, permission removal, and popup render.');
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
