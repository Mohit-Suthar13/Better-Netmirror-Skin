// Local contract fixture; does not claim an authenticated NetMirror session.
const { chromium } = require('../../REA repo/node_modules/playwright-core');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
assert.equal(manifest.manifest_version, 3);
assert.deepEqual(manifest.permissions, ['storage']);
assert.deepEqual(manifest.content_scripts[0].matches, ['https://net77.cc/*']);
for (const file of [...manifest.content_scripts[0].js, ...manifest.content_scripts[0].css, manifest.action.default_popup]) assert(fs.existsSync(path.join(root, file)));
const script = fs.readFileSync(path.join(root,'content.js'),'utf8');
const css = fs.readFileSync(path.join(root,'skin.css'),'utf8');
const mock = () => {
  const callbacks = [];
  let enabled = true;
  window.chrome = {
    storage: {
      local: {
        get: async () => ({enabled}),
        set: async value => { const oldValue = enabled; enabled = value.enabled; callbacks.forEach(fn => fn({enabled:{oldValue,newValue:enabled}},'local')); }
      },
      onChanged:{addListener:fn => callbacks.push(fn)}
    },
    runtime:{onMessage:{addListener:fn => { window.statusReceiver = fn; }}}
  };
};
(async () => {
  const browser = await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
  try {
    const page = await browser.newPage({viewport:{width:1280,height:900}});
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setContent(`<!doctype html><title>Home - NetMirror fixture</title>
      <style>body{margin:0;background:#141414}.main-header{display:flex;align-items:center}.secondary-navigation{margin-left:auto}.billboard{width:100%}.billboard-row{padding-bottom:40%}.lolomo.is-fullbleed{margin-top:-70px}.billboard-presentation-tracking{position:relative}.pinning-header{height:70px}.hero-image-wrapper{background:linear-gradient(110deg,#192e3f,#6e939d)}.billboard .info{position:absolute;color:white}.lolomoRow{padding:0 4%}.sliderContent{display:flex;overflow:auto}.slider-item{min-width:24%}.boxart-container{height:130px;background:linear-gradient(120deg,#182d3c,#7d8280)}.hide{display:none!important}.tabbed-primary-navigation{display:flex;list-style:none}.title-logo{height:65px}.rowTitle{color:white}</style>
      <div id="main-header" class="main-header"><a class="logo">NETMIRROR</a><ul class="tabbed-primary-navigation"><li class="navigation-tab"><a href="/home">Home</a></li><li class="navigation-tab"><a href="/movies">Movies</a></li><li class="navigation-tab"><a class="mylist">My List</a></li></ul><div class="secondary-navigation"><button class="searchTab">Search</button><input id="searchInput"><button class="moreOTT">Services</button></div></div>
      <main role="main"><div id="bodyPage" class="lolomo is-fullbleed"><div class="billboard-row" role="region" aria-label="Featured Content"><div class="billboard"><div class="hero-image-wrapper"></div><div class="info meta-layer"><h1>Catalog fixture</h1><div class="synopsis">Original content and controls are preserved.</div><div class="billboard-links"><button class="color-primary">Play</button><button class="color-secondary">More Info</button></div></div></div></div><div class="lolomoRow"><h2 class="rowHeader"><a class="rowTitle">Trending now</a></h2><div class="sliderContent">${Array.from({length:6},(_,i)=>`<div class="slider-item open-modal" data-post="${i}"><a class="slider-refocus"><div class="boxart-container boxart-rounded"></div></a></div>`).join('')}</div></div></div></main>
      <div hidden><button class="setOTT" data-ott="nf">Netflix</button><button class="setOTT" data-ott="pv">Prime Video</button><button class="setOTT" data-ott="dp">Disney+</button></div><div id="player" class="hide"></div>`);
    await page.evaluate(mock);
    await page.evaluate(() => {
      window.originalCard = document.querySelector('.open-modal');
      window.invocations = [];
      document.querySelectorAll('.searchTab,.mylist,.moreOTT,.setOTT,.open-modal').forEach(el=>el.addEventListener('click',()=>window.invocations.push(el.className)));
    });
    await page.addStyleTag({content:css});
    await page.addScriptTag({content:script});
    await page.waitForSelector('html[data-nmg="glass"]');
    assert.equal(await page.locator('#nmg-dock button').count(),3);
    assert.deepEqual(await page.locator('#nmg-dock button').allTextContents(),['Netflix','Prime Video','All services']);
    assert.equal(await page.locator('#nmg-heading').textContent(),'Netflix');
    assert.equal(await page.locator('#nmg-heading span').count(),0);
    assert.equal(await page.locator('#nmg-dock [data-provider="nf"]').isDisabled(),true);
    await page.locator('#nmg-dock [data-action="services"]').click();
    assert.deepEqual(await page.evaluate(()=>window.invocations),['moreOTT']);
    await page.evaluate(()=>window.invocations=[]);
    // Real wheel input against the site's desktop overflow contract. No cloned cards.
    await page.evaluate(() => {
      const scroller = document.querySelector('.sliderContent');
      const slider = document.createElement('div');
      slider.className = 'slider scroll-active';
      scroller.before(slider);
      slider.innerHTML = '<span class="handlePrev"></span><ul class="pagination-indicator"><li class="active"></li><li></li></ul>';
      slider.append(scroller);
      scroller.style.overflow = 'hidden';
      scroller.querySelectorAll('.slider-item').forEach(card => card.style.flexShrink = '0');
    });
    const row = page.locator('.sliderContent');
    await row.scrollIntoViewIfNeeded();
    await row.hover();
    await page.mouse.wheel(180,0);
    await page.waitForFunction(() => document.querySelector('.sliderContent').scrollLeft > 100);
    assert.equal(await page.locator('.handlePrev').evaluate(el=>el.classList.contains('active')),true);
    const wheelLeft = await row.evaluate(el=>el.scrollLeft);
    await page.mouse.wheel(-70,0);
    await page.waitForFunction(left => document.querySelector('.sliderContent').scrollLeft < left,wheelLeft);
    // Up/down never moves rows, in any wheel unit; zoom remains native too.
    const wheelContracts = await row.evaluate(el => {
      const fire = options => { const e = new WheelEvent('wheel',{bubbles:true,cancelable:true,...options});el.dispatchEvent(e);return e.defaultPrevented; };
      el.scrollLeft=0;
      const start=fire({deltaY:-100});
      const line=fire({deltaY:3,deltaMode:1}); const linePosition=el.scrollLeft;
      const zoom=fire({deltaY:100,ctrlKey:true}); const zoomPosition=el.scrollLeft;
      const page=fire({deltaY:1,deltaMode:2});
      const end=fire({deltaY:100});
      return {start,line,linePosition,zoom,zoomPosition,page,end};
    });
    assert.deepEqual(wheelContracts,{start:false,line:false,linePosition:0,zoom:false,zoomPosition:0,page:false,end:false});
    await page.evaluate(()=>{const spacer=document.createElement('div');spacer.id='scroll-test-space';spacer.style.height='1500px';document.body.append(spacer);});
    await row.hover();
    const pageTop=await page.evaluate(()=>window.scrollY);
    await page.mouse.wheel(0,180);
    await page.waitForFunction(top=>window.scrollY>top,pageTop);
    assert.equal(await row.evaluate(el=>el.scrollLeft),0);
    await page.locator('#scroll-test-space').evaluate(el=>el.remove());
    await row.evaluate(el=>el.scrollLeft=0);
    // Dynamically inserted preview and detail panels include opaque upstream layers.
    await page.evaluate(() => {
      const container = document.createElement('div');
      container.id='dialog-fixture';
      container.innerHTML='<div id="actionMenu"><div class="previewModal--info" style="background:#181818"><div class="previewModal--metadatAndControls" style="background:#181818"><button class="color-supplementary pop-btn">+</button></div></div></div><div id="modal-main" class="hide" style="background:#000000b2"><div class="modal-body"><div class="previewModal--info" style="background:#181818"><select class="season-box"><option>Season 1</option></select><div class="titleCardList--container episode-item">Episode</div></div></div></div>';
      document.body.append(container);
    });
    assert.match(await page.locator('#actionMenu').evaluate(el=>getComputedStyle(el).backdropFilter),/blur\(32px\)/);
    assert.equal(await page.locator('#actionMenu .previewModal--info').evaluate(el=>getComputedStyle(el).backgroundColor),'rgba(0, 0, 0, 0)');
    assert.equal(await page.locator('#actionMenu .previewModal--metadatAndControls').evaluate(el=>getComputedStyle(el).backgroundColor),'rgba(0, 0, 0, 0)');
    await page.evaluate(() => {
      document.querySelector('#actionMenu').dataset.post='0';
      document.querySelector('.sliderContent').dispatchEvent(new MouseEvent('mouseover',{bubbles:true}));
      for (const className of ['previewModal--detailsMetadata','episodeSelector','moreLikeThis--wrapper','about-wrapper']) {
        const part=document.createElement('div');part.className=className;part.style.background='#181818';
        document.querySelector('#modal-main .previewModal--info').append(part);
      }
    });
    const previewWheel = await page.locator('#actionMenu').evaluate(el=>{
      const scroller=document.querySelector('.sliderContent');scroller.scrollLeft=0;
      const e=new WheelEvent('wheel',{bubbles:true,cancelable:true,deltaX:90});el.dispatchEvent(e);
      return {handled:e.defaultPrevented,left:scroller.scrollLeft};
    });
    assert.deepEqual(previewWheel,{handled:true,left:90});
    assert.deepEqual(await page.locator('#actionMenu').evaluate(el=>{
      const scroller=document.querySelector('.sliderContent');
      const e=new WheelEvent('wheel',{bubbles:true,cancelable:true,deltaY:100});el.dispatchEvent(e);
      return {handled:e.defaultPrevented,left:scroller.scrollLeft};
    }),{handled:false,left:90});
    for (const selector of ['.previewModal--detailsMetadata','.episodeSelector','.moreLikeThis--wrapper','.about-wrapper']) {
      assert.equal(await page.locator('#modal-main '+selector).evaluate(el=>getComputedStyle(el).backgroundColor),'rgba(0, 0, 0, 0)');
    }
    await page.locator('#modal-main').evaluate(el=>el.classList.remove('hide'));
    assert.match(await page.locator('#modal-main .modal-body').evaluate(el=>getComputedStyle(el).backdropFilter),/blur\(32px\)/);
    assert.equal(await page.locator('#modal-main .season-box').evaluate(el=>{const e=new WheelEvent('wheel',{bubbles:true,cancelable:true,deltaY:100});el.dispatchEvent(e);return e.defaultPrevented;}),false);
    await page.evaluate(() => {
      const hiddenMenu=document.createElement('div');hiddenMenu.setAttribute('role','menu');hiddenMenu.hidden=true;document.body.append(hiddenMenu);
      const backgroundMenu=document.createElement('div');backgroundMenu.setAttribute('role','menu');backgroundMenu.textContent='Background notifications';document.body.append(backgroundMenu);
      window.detailCloses=0;
      const close=document.createElement('button');close.className='previewModal-close';
      close.addEventListener('click',()=>{window.detailCloses++;document.querySelector('#modal-main').classList.add('hide');});
      document.querySelector('#modal-main .modal-body').append(close);
    });
    await page.keyboard.press('Escape');
    assert.equal(await page.evaluate(()=>window.detailCloses),1);
    await page.keyboard.press('Escape');
    assert.equal(await page.evaluate(()=>window.detailCloses),1);
    await page.evaluate(()=>{document.querySelector('#modal-main').classList.remove('hide');document.querySelector('#player').classList.remove('hide');document.querySelector('#player').style.height='200px';});
    await page.keyboard.press('Escape');
    assert.equal(await page.evaluate(()=>window.detailCloses),1);
    await page.evaluate(()=>document.querySelector('#player').classList.add('hide'));
    await page.evaluate(()=>chrome.storage.local.set({enabled:false}));
    await page.keyboard.press('Escape');
    assert.equal(await page.evaluate(()=>window.detailCloses),1);
    assert.equal(await page.locator('#actionMenu').evaluate(el=>getComputedStyle(el).backdropFilter),'none');
    assert.equal(await page.locator('#actionMenu .previewModal--info').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(24, 24, 24)');
    assert.equal(await row.evaluate(el=>{el.scrollLeft=0;const e=new WheelEvent('wheel',{bubbles:true,cancelable:true,deltaY:100});el.dispatchEvent(e);return e.defaultPrevented;}),false);
    await page.locator('#dialog-fixture').evaluate(el=>el.remove());
    await page.evaluate(()=>chrome.storage.local.set({enabled:true}));
    const geometry = await page.evaluate(() => {
      const row = document.querySelector('.billboard-row');
      const hero = document.querySelector('.billboard');
      return {padding:getComputedStyle(row).paddingBottom, margin:getComputedStyle(document.querySelector('#bodyPage')).marginTop,
        height:row.getBoundingClientRect().height,heroHeight:hero.getBoundingClientRect().height,overflow:getComputedStyle(row).overflow};
    });
    assert.equal(await page.locator('.billboard-row').evaluate(el=>getComputedStyle(el).borderRadius),'0px');
    assert.equal(await page.locator('[role="main"]').evaluate(el=>getComputedStyle(el).borderTopWidth),'0px');
    assert.equal(await page.locator('.billboard-row').evaluate(el=>getComputedStyle(el,'::after').pointerEvents),'none');
    assert.equal(geometry.padding,'0px');
    assert.equal(geometry.margin,'0px');
    assert.equal(geometry.overflow,'hidden');
    assert.equal(geometry.height,geometry.heroHeight);
    assert(geometry.height <= 840);
    assert.equal(await page.locator('.billboard .info').evaluate(el=>getComputedStyle(el).zIndex),'10');
    await page.emulateMedia({reducedMotion:'reduce'});
    assert.equal(await page.locator('#nmg-dock').evaluate(el=>getComputedStyle(el).animationName),'none');
    await page.emulateMedia({reducedMotion:'no-preference'});
    // Browsing pins the rail. A selection makes it retract, with hover/focus access.
    await page.mouse.move(600,200);
    assert.equal(await page.locator('#nmg-rail').evaluate(el=>getComputedStyle(el).opacity),'1');
    await page.evaluate(()=>{
      const detail=document.createElement('div');detail.id='modal-main';detail.style.cssText='position:fixed;inset:0;z-index:1000';detail.textContent='Movie selection';document.body.append(detail);
    });
    await page.waitForSelector('html[data-nmg-detail]');
    await page.mouse.move(600,200);
    await page.waitForFunction(()=>getComputedStyle(document.querySelector('#nmg-rail')).opacity==='0');
    assert.equal(await page.evaluate(()=>document.elementFromPoint(8,300).id),'nmg-rail-toggle');
    await page.mouse.move(8,300);
    await page.waitForFunction(()=>getComputedStyle(document.querySelector('#nmg-rail')).opacity==='1');
    await page.mouse.move(600,200);
    await page.waitForFunction(()=>getComputedStyle(document.querySelector('#nmg-rail')).opacity==='0');
    await page.locator('#nmg-rail-toggle').focus();
    await page.waitForFunction(()=>getComputedStyle(document.querySelector('#nmg-rail')).opacity==='1');
    await page.locator('#modal-main').evaluate(el=>el.remove());
    await page.waitForSelector('html:not([data-nmg-detail])');
    await page.locator('#nmg-rail [data-action="search"]').click();
    assert.equal(await page.evaluate(()=>document.activeElement.id),'searchInput');
    await page.locator('#nmg-rail [data-action="list"]').click();
    await page.locator('#nmg-dock [data-provider="pv"]').click();
    assert.deepEqual(await page.evaluate(()=>window.invocations),['searchTab','mylist','setOTT']);
    await page.evaluate(()=>document.querySelector('#player').classList.remove('hide'));
    await page.waitForSelector('html[data-nmg-player]');
    assert.equal(await page.locator('#nmg-rail').isVisible(),false);
    await page.evaluate(()=>document.querySelector('#player').classList.add('hide'));
    await page.waitForSelector('#nmg-rail',{state:'visible'});
    await page.setViewportSize({width:1440,height:900});
    await page.screenshot({path:'/private/tmp/netmirror-glass-desktop.png'});
    await page.setViewportSize({width:768,height:900});
    await page.screenshot({path:'/private/tmp/netmirror-glass-tablet.png'});
    await page.setViewportSize({width:390,height:844});
    await page.screenshot({path:'/private/tmp/netmirror-glass-mobile.png'});
    await page.evaluate(()=>chrome.storage.local.set({enabled:false}));
    await page.waitForSelector('#nmg-rail',{state:'detached'});
    assert.equal(await page.evaluate(()=>document.documentElement.hasAttribute('data-nmg')),false);
    assert.equal(await page.evaluate(()=>document.querySelector('.open-modal')===window.originalCard),true);
    await page.evaluate(()=>chrome.storage.local.set({enabled:true}));
    await page.waitForSelector('#nmg-rail');
    await page.addScriptTag({content:script});
    assert.equal(await page.locator('#nmg-rail').count(),1);
    await page.evaluate(()=>{ document.title='Just a moment...'; document.body.append(document.createElement('div')); });
    await page.waitForSelector('#nmg-rail',{state:'detached'});
    assert.equal(await page.evaluate(()=>document.documentElement.hasAttribute('data-nmg')),false);
    // Prime renders after document_idle and uses focus to open its picker.
    await page.evaluate(() => {
      document.title='Prime fixture';
      document.body.innerHTML='<div id="root"><main><main><div class="fixed"><a id="prime-brand" href="/home"><h1>NetMirror</h1></a><a ranger="ranger_header_home" href="/home">Home</a><a href="/search">Search</a><a href="/watch-list">Watch List</a><div ranger="ranger_ott" tabindex="0">Services</div></div></main><section ranger="ranger_section_banner">Prime catalog</section></main></div>';
      window.primeFocus=0; window.primeClicks=0;
      const trigger=document.querySelector('[ranger="ranger_ott"]');
      trigger.addEventListener('focus',()=>{
        window.primeFocus++;
        setTimeout(()=>{
          const item=document.createElement('button');item.className='ott-item';item.innerHTML='<img alt="Netflix">';
          item.addEventListener('click',()=>window.netflixSwitches=(window.netflixSwitches||0)+1);
          document.body.append(item);
        },100);
      });
      trigger.addEventListener('click',()=>window.primeClicks++);
    });
    await page.waitForSelector('html[data-nmg-layout="prime"]');
    assert.equal(await page.locator('#prime-brand #nmg-heading').textContent(),'Prime Video');
    assert.equal(await page.locator('[ranger="ranger_header_home"]').textContent(),'Home');
    assert.equal(await page.locator('[ranger="ranger_section_banner"]').evaluate(el=>getComputedStyle(el).borderRadius),'0px');
    assert.equal(await page.locator('#root > main').evaluate(el=>getComputedStyle(el).borderTopWidth),'0px');
    await page.locator('#nmg-dock [data-provider="nf"]').click();
    await page.waitForFunction(()=>window.netflixSwitches===1);
    assert.deepEqual(await page.evaluate(()=>[window.primeFocus,window.primeClicks]),[1,0]);
    assert.equal(await page.locator('#nmg-rail').count(),1);
    assert.equal(await page.locator('#nmg-dock [data-provider="pv"]').isDisabled(),true);
    await page.evaluate(()=>{
      const detail=document.createElement('section');detail.setAttribute('ranger','ranger_details_page');detail.textContent='Prime title and episodes';document.querySelector('#root').append(detail);
      window.primeReturns=0;
      document.querySelector('[ranger="ranger_header_home"]').addEventListener('click',event=>{event.preventDefault();window.primeReturns++;detail.remove();});
    });
    await page.keyboard.press('Escape');
    assert.equal(await page.evaluate(()=>window.primeReturns),1);
    await page.keyboard.press('Escape');
    assert.equal(await page.evaluate(()=>window.primeReturns),1);
    await page.evaluate(()=>chrome.storage.local.set({enabled:false}));
    assert.equal(await page.locator('[data-nmg-header]').count(),0);
    assert.deepEqual(errors,[]);
    console.log('PASS: Netflix/Prime Escape and player/disabled guards, rail proximity reveal/retraction and keyboard focus, two-provider dock with delayed Prime-to-Netflix delegation; native horizontal wheel, vertical page scrolling, vertical line/page preservation, edge release, zoom preservation, pagination, dynamic glass panels and disable restoration; hero geometry, reduced motion, late Prime mounting and focus-only picker, manifest files, theme activation, real-handler delegation, provider filtering, player isolation, node identity, duplicate guard, verification guard, no runtime errors.');
  } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;});
