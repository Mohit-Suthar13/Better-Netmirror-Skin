'use strict';
importScripts('sites.js');

const siteDefaults = Object.fromEntries(NMGSites.map(site => [site.key,false]));
const ownedIds = NMGSites.map(site => site.registrationId);
let reconciliation = Promise.resolve();

function registration(site) {
  return {
    id:site.registrationId,
    matches:[...site.origins],
    js:['glass.js','official.js'],
    css:['glass-controls.css','official.css'],
    runAt:'document_idle',
    allFrames:false,
    persistAcrossSessions:true,
    world:'ISOLATED'
  };
}
function sameRegistration(current, expected) {
  const sameList = (a,b) => Array.isArray(a) && a.length === b.length && a.every((value,index) => value === b[index]);
  return sameList(current.matches,expected.matches) && sameList(current.js,expected.js) &&
    sameList(current.css,expected.css) && current.runAt === expected.runAt &&
    (current.allFrames ?? false) === false && (current.persistAcrossSessions ?? true) === true &&
    (current.world ?? 'ISOLATED') === 'ISOLATED' && !current.excludeMatches?.length;
}
async function reconcileSites() {
  const [prefs, registered] = await Promise.all([
    chrome.storage.local.get(siteDefaults),
    chrome.scripting.getRegisteredContentScripts({ids:ownedIds})
  ]);
  const existing = new Map(registered.filter(item => ownedIds.includes(item.id)).map(item => [item.id,item]));
  const enabled = await Promise.all(NMGSites.map(async site => (
    prefs[site.key] === true && await chrome.permissions.contains({origins:[...site.origins]})
  )));
  const remove = NMGSites.filter((site,index) => !enabled[index] && existing.has(site.registrationId)).map(site => site.registrationId);
  if (remove.length) await chrome.scripting.unregisterContentScripts({ids:remove});
  const add = [];
  const update = [];
  NMGSites.forEach((site,index) => {
    if (!enabled[index]) return;
    const expected = registration(site);
    const current = existing.get(site.registrationId);
    if (!current) add.push(expected);
    else if (!sameRegistration(current,expected)) update.push({...expected,excludeMatches:[]});
  });
  if (update.length) await chrome.scripting.updateContentScripts(update);
  if (add.length) await chrome.scripting.registerContentScripts(add);
}
function syncSites() {
  // All entry points share the same queue, including an event raised mid-request.
  const current = reconciliation.then(reconcileSites,reconcileSites);
  reconciliation = current.catch(() => {});
  return current.then(() => ({ok:true}),error => ({ok:false,error:error?.message || String(error)}));
}
chrome.runtime.onInstalled.addListener(() => { void syncSites(); });
chrome.runtime.onStartup.addListener(() => { void syncSites(); });
chrome.storage.onChanged.addListener((changes,area) => {
  if (area === 'local' && NMGSites.some(site => Object.hasOwn(changes,site.key))) void syncSites();
});
chrome.permissions.onAdded.addListener(() => { void syncSites(); });
chrome.permissions.onRemoved.addListener(() => { void syncSites(); });
chrome.runtime.onMessage.addListener((message,sender,respond) => {
  if (message?.type !== 'nmg-sync-sites') return;
  syncSites().then(respond);
  return true;
});
// A worker may wake after Chrome restored persistent registrations.
void syncSites();
