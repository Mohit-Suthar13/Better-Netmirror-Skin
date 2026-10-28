// Isolated behavioral contract for the MAIN-world Prime wheel adapter.
// The fixture models only the observed Swiper API; no upstream JS is executed.
const {chromium, launchOptions} = require('./browser.cjs');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const script = fs.readFileSync(path.join(__dirname, '..', 'prime-scroll.js'), 'utf8');
(async () => {
  const browser = await chromium.launch(launchOptions);
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setContent(`<html data-nmg="glass" data-nmg-layout="prime"><body>
      <div id="row" class="prime-slider-main" style="width:500px"><div class="swiper-wrapper" style="transform:translateX(-10px)"><button id="card">Original title</button><input id="input"><div contenteditable><span id="editable">Edit text</span></div></div></div>
      <div ranger="ranger_section_banner"><div id="banner" class="prime-slider-main"><button id="banner-card">Hero</button></div></div>
      <div id="unmounted" class="prime-slider-main"><button id="unmounted-card">Not mounted</button></div>
      <button id="outside">Outside</button>
    </body></html>`);
    await page.evaluate(() => {
      window.clock = 1000;
      Object.defineProperty(performance, 'now', {value:() => window.clock});
      window.calls = [];
      window.originalCard = document.querySelector('#card');
      window.originalWrapper = document.querySelector('.swiper-wrapper');
      window.makeSwiper = id => {
        const el = document.getElementById(id);
        return el.swiper = {el,enabled:true,initialized:true,isLocked:false,isBeginning:false,isEnd:false,animating:false,
          params:{loop:false,rewind:false},isHorizontal:() => true,
          slideNext(speed) {calls.push({id, direction:'next', speed:speed ?? null});},
          slidePrev(speed) {calls.push({id, direction:'prev', speed:speed ?? null});}};
      };
      makeSwiper('row'); makeSwiper('banner');
      window.sendWheel = (target, options = {}, elapsed = 200) => {
        window.clock += elapsed;
        const event = new WheelEvent('wheel', {bubbles:true,cancelable:true,deltaX:80, ...options});
        document.getElementById(target).dispatchEvent(event);
        return event.defaultPrevented;
      };
    });
    await page.addScriptTag({content:script});
    const wheel = (target='card', options={}, elapsed=200) => page.evaluate(({target,options,elapsed})=>sendWheel(target,options,elapsed),{target,options,elapsed});
    assert.equal(await wheel(), true);
    assert.deepEqual(await page.evaluate(()=>calls), [{id:'row',direction:'next',speed:null}]);
    for (let i=0; i<12; i++) assert.equal(await wheel('card',{},16),true);
    assert.equal(await page.evaluate(()=>calls.length),1, 'momentum must not race through the row');
    assert.equal(await wheel('card',{deltaX:-80},16),true);
    assert.equal(await page.evaluate(()=>calls.at(-1).direction),'prev', 'reversing is a new gesture');
    await wheel('card',{deltaX:0,deltaY:5,deltaMode:1,shiftKey:true});
    assert.equal(await page.evaluate(()=>calls.at(-1).direction),'next');
    await wheel('card',{deltaX:0,deltaY:-1,deltaMode:2,shiftKey:true});
    assert.equal(await page.evaluate(()=>calls.at(-1).direction),'prev');
    const before = await page.evaluate(()=>calls.length);
    for (const options of [{deltaX:0,deltaY:80},{deltaX:10,deltaY:80},{ctrlKey:true},{metaKey:true},{cancelable:false}]) {
      assert.equal(await wheel('card',options),false);
    }
    for (const target of ['input','editable','banner-card','unmounted-card','outside']) assert.equal(await wheel(target),false);
    assert.equal(await page.evaluate(()=>calls.length),before);
    // Boundary release, lock/disable guards, and fail-closed API discovery.
    for (const patch of [{isEnd:true},{allowSlideNext:false},{isLocked:true},{enabled:false},{initialized:false},{destroyed:true}]) {
      await page.evaluate(patch=>Object.assign(document.getElementById('row').swiper,patch),patch);
      assert.equal(await wheel(),false);
      await page.evaluate(()=>makeSwiper('row'));
    }
    await page.evaluate(()=>document.getElementById('row').swiper.isBeginning=true);
    assert.equal(await wheel('card',{deltaX:-80}),false);
    await page.evaluate(()=>makeSwiper('row').slideNext=null);
    assert.equal(await wheel(),false);
    await page.evaluate(()=>makeSwiper('row').isHorizontal=()=>false);
    assert.equal(await wheel(),false);
    await page.evaluate(()=>makeSwiper('row').el=document.body);
    assert.equal(await wheel(),false);
    await page.evaluate(()=>Object.assign(makeSwiper('row'),{isEnd:true,params:{rewind:true}}));
    assert.equal(await wheel(),true, 'native rewind rows can advance from their end');
    await page.evaluate(()=>makeSwiper('row'));
    for (const attr of ['data-nmg-player','data-nmg-detail']) {
      await page.evaluate(attr=>document.documentElement.setAttribute(attr,''),attr);
      assert.equal(await wheel(),false);
      await page.evaluate(attr=>document.documentElement.removeAttribute(attr),attr);
    }
    await page.evaluate(()=>document.documentElement.removeAttribute('data-nmg'));
    assert.equal(await wheel(),false);
    await page.evaluate(()=>document.documentElement.dataset.nmg='glass');
    await page.evaluate(()=>document.documentElement.dataset.nmgLayout='netflix');
    assert.equal(await wheel(),false);
    await page.evaluate(()=>document.documentElement.dataset.nmgLayout='prime');
    // Small deltas accumulate; native animation is respected.
    const smallBefore = await page.evaluate(()=>calls.length);
    await wheel('card',{deltaX:8}); await wheel('card',{deltaX:8},20);
    assert.equal(await page.evaluate(()=>calls.length),smallBefore);
    await wheel('card',{deltaX:8},20);
    assert.equal(await page.evaluate(()=>calls.length),smallBefore+1);
    await page.evaluate(()=>document.getElementById('row').swiper.animating=true);
    await wheel();
    assert.equal(await page.evaluate(()=>calls.length),smallBefore+1);
    await page.evaluate(()=>document.getElementById('row').swiper.animating=false);
    await page.emulateMedia({reducedMotion:'reduce'});
    await wheel();
    assert.equal(await page.evaluate(()=>calls.at(-1).speed),0);
    await page.evaluate(()=>document.getElementById('row').swiper.rtlTranslate=true);
    await wheel();
    assert.equal(await page.evaluate(()=>calls.at(-1).direction),'prev');
    // Already handled input and duplicate injection must not add navigation.
    await page.evaluate(()=>document.getElementById('card').addEventListener('wheel', event=>event.preventDefault(),{once:true}));
    const handledBefore = await page.evaluate(()=>calls.length);
    await wheel();
    assert.equal(await page.evaluate(()=>calls.length),handledBefore);
    await page.addScriptTag({content:script});
    await wheel();
    assert.equal(await page.evaluate(()=>calls.length),handledBefore+1);
    assert.equal(await page.evaluate(()=>document.getElementById('card')===originalCard && document.querySelector('.swiper-wrapper')===originalWrapper),true);
    assert.equal(await page.locator('.swiper-wrapper').getAttribute('style'),'transform:translateX(-10px)');
    assert.deepEqual(errors,[]);
    console.log('PASS: Prime native Swiper delegation, horizontal/Shift wheel, momentum limiting, reversal, edge release, vertical/zoom preservation, disabled/player/detail/input guards, animation, reduced motion, RTL, duplicate injection and original node/transform preservation.');
  } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;});
