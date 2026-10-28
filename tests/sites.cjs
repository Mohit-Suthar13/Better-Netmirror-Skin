// Worker contract checks: no real permissions, network, tabs, or script injection.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname,'..');
const clone = value => structuredClone(value);
const event = () => {
  const listeners = [];
  return {addListener:listener=>listeners.push(listener),emit:(...args)=>listeners.forEach(listener=>listener(...args)),listeners};
};
function worker({prefs = {}, grants = [], registrations = []} = {}) {
  const data = {...prefs};
  const permissions = new Set(grants);
  const scripts = new Map(registrations.map(item=>[item.id,clone(item)]));
  const calls = [];
  let failure;
  const checkFailure = method => {
    if (failure?.method === method) {
      const message = failure.message;
      failure = null;
      throw new Error(message);
    }
  };
  const chrome = {
    storage:{local:{get:async defaults=>{checkFailure('get');return {...defaults,...data};}},onChanged:event()},
    permissions:{
      contains:async({origins})=>{checkFailure('contains');return origins.every(origin=>permissions.has(origin));},
      onAdded:event(),onRemoved:event()
    },
    scripting:{
      getRegisteredContentScripts:async ({ids})=>{
        calls.push(['get',clone(ids)]);checkFailure('list');
        return [...scripts.values()].filter(item=>ids.includes(item.id)).map(clone);
      },
      registerContentScripts:async list=>{
        calls.push(['register',clone(list)]);checkFailure('register');
        for (const item of list) {
          assert(!scripts.has(item.id),`Duplicate registration ${item.id}`);
          scripts.set(item.id,clone(item));
        }
      },
      updateContentScripts:async list=>{
        calls.push(['update',clone(list)]);checkFailure('update');
        for (const item of list) {assert(scripts.has(item.id));scripts.set(item.id,{...scripts.get(item.id),...clone(item)});}
      },
      unregisterContentScripts:async ({ids})=>{
        calls.push(['unregister',clone(ids)]);checkFailure('unregister');
        for (const id of ids) scripts.delete(id);
      }
    },
    runtime:{onInstalled:event(),onStartup:event(),onMessage:event()}
  };
  const context = vm.createContext({chrome});
  context.importScripts = file => {
    assert.equal(file,'sites.js');
    vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),context,{filename:file});
  };
  vm.runInContext(fs.readFileSync(path.join(root,'background.js'),'utf8'),context,{filename:'background.js'});
  const sync = () => new Promise(resolve=>{
    const keepOpen = chrome.runtime.onMessage.listeners[0]({type:'nmg-sync-sites'},{},result=>resolve(clone(result)));
    assert.equal(keepOpen,true,'Async response channel must remain open');
  });
  return {
    chrome,data,permissions,scripts,calls,context,sync,
    fail:(method,message)=>{failure={method,message};},
    set:async patch=>{
      const changes = {};
      for(const [key,newValue] of Object.entries(patch)){changes[key]={oldValue:data[key],newValue};data[key]=newValue;}
      chrome.storage.onChanged.emit(changes,'local');
      return sync();
    }
  };
}
const netflix = ['https://www.netflix.com/*','https://netflix.com/*'];
const prime = ['https://www.primevideo.com/*','https://primevideo.com/*'];
const nfId = 'nmg-official-netflix';
const pvId = 'nmg-official-prime';
const unrelated = {id:'another-feature',matches:['https://example.com/*'],js:['unrelated.js']};
(async()=>{
  const w = worker({grants:[...netflix,...prime],registrations:[unrelated]});
  assert.deepEqual(await w.sync(),{ok:true});
  assert.deepEqual([...w.scripts.keys()],['another-feature'],'Official sites must start disabled, even if permission exists');
  assert.deepEqual(clone(w.context.NMGSites).map(site=>({id:site.id,key:site.key,label:site.label,origins:site.origins})),[
    {id:'netflix',key:'netflixEnabled',label:'Netflix',origins:netflix},
    {id:'prime',key:'primeEnabled',label:'Prime Video',origins:prime}
  ]);
  assert.equal(w.chrome.runtime.onMessage.listeners[0]({type:'unrelated'},{},()=>{throw new Error('Unexpected response');}),undefined);

  await w.set({netflixEnabled:true});
  assert.deepEqual(w.scripts.get(nfId),{
    id:nfId,matches:netflix,js:['glass.js','official.js'],css:['glass-controls.css','official.css'],
    runAt:'document_idle',allFrames:false,persistAcrossSessions:true,world:'ISOLATED'
  });
  // Multiple triggers during pending reconciliation must not register the same id twice.
  const registeredBefore = w.calls.filter(call=>call[0]==='register').length;
  w.chrome.runtime.onStartup.emit();
  w.chrome.runtime.onInstalled.emit();
  const outcomes = await Promise.all(Array.from({length:12},()=>w.sync()));
  assert(outcomes.every(result=>result.ok));
  assert.equal(w.calls.filter(call=>call[0]==='register').length,registeredBefore);
  await w.set({primeEnabled:true});
  assert.deepEqual(w.scripts.get(pvId).matches,prime);
  await w.set({netflixEnabled:false});
  assert.equal(w.scripts.has(nfId),false);
  assert.equal(w.scripts.has(pvId),true);
  assert.deepEqual(w.scripts.get('another-feature'),unrelated);

  // Loss of either declared origin revokes the whole provider registration.
  w.permissions.delete(prime[0]);
  w.chrome.permissions.onRemoved.emit({origins:[prime[0]]});
  await w.sync();
  assert.equal(w.scripts.has(pvId),false);
  w.permissions.add(prime[0]);
  w.chrome.permissions.onAdded.emit({origins:[prime[0]]});
  await w.sync();
  assert.equal(w.scripts.has(pvId),true);
  assert.equal(w.scripts.has(nfId),false,'Permission restoration must not override a disabled preference');

  const denied = worker({prefs:{netflixEnabled:true,primeEnabled:true},grants:[netflix[0]],registrations:[unrelated]});
  await denied.sync();
  assert.deepEqual([...denied.scripts.keys()],['another-feature']);
  assert.equal(denied.calls.some(call=>call[0]==='register'),false,'Missing or rejected permissions must not register scripts');
  denied.chrome.runtime.onInstalled.emit();
  await denied.sync();
  assert.equal(denied.scripts.has(nfId),false);

  // Restore persisted scripts only when both preference and host grants still allow them.
  const stale = worker({prefs:{netflixEnabled:true},grants:netflix,registrations:[
    {...w.scripts.get(pvId)},
    {id:nfId,matches:['https://old.example/*'],js:['old.js'],css:[],runAt:'document_start',allFrames:true,world:'MAIN',excludeMatches:['https://www.netflix.com/watch/*']},
    unrelated
  ]});
  await stale.sync();
  assert.equal(stale.scripts.has(pvId),false);
  assert.equal(stale.scripts.get(nfId).allFrames,false);
  assert.equal(stale.scripts.get(nfId).world,'ISOLATED');
  assert.deepEqual(stale.scripts.get(nfId).matches,netflix);
  assert.deepEqual(stale.scripts.get(nfId).excludeMatches,[]);
  assert.deepEqual(stale.scripts.get('another-feature'),unrelated);

  // A failed call reports its error and does not poison future reconciliation.
  await denied.sync();
  denied.fail('list','Script registry unavailable');
  assert.deepEqual(await denied.sync(),{ok:false,error:'Script registry unavailable'});
  assert.deepEqual(await denied.sync(),{ok:true});
  netflix.forEach(origin=>denied.permissions.add(origin));
  denied.fail('register','Registration rejected');
  assert.deepEqual(await denied.sync(),{ok:false,error:'Registration rejected'});
  assert.equal(denied.scripts.has(nfId),false);
  assert.deepEqual(await denied.sync(),{ok:true});
  assert.equal(denied.scripts.has(nfId),true);
  assert(denied.calls.every(call=>call[0]!=='unregister'||call[1].every(id=>[nfId,pvId].includes(id))));
  console.log('PASS: exact optional hosts, default-off registration, serialized lifecycle/message reconciliation, idempotence, independent site toggles, missing permissions, revoke/regrant, persisted-script repair, unrelated-script preservation, and error recovery.');
})().catch(error=>{console.error(error);process.exitCode=1;});
