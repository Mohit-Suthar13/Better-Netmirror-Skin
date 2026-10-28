'use strict';
const toggle = document.querySelector('#enabled');
const status = document.querySelector('#status');
const glassControls = document.querySelector('#glass-controls');
const defaults = {enabled:true, ...Object.fromEntries(NMGSites.map(site => [site.key,false])), ...NMGGlass.defaults};
let prefs = {...defaults};
let glassPrefs = {...NMGGlass.defaults};

function syncControls() {
  toggle.checked = prefs.enabled !== false;
  for (const site of NMGSites) document.getElementById(site.key).checked = prefs[site.key] === true;
  glassControls.disabled = !toggle.checked && !NMGSites.some(site => prefs[site.key] === true);
  glassPrefs = NMGGlass.normalize(prefs);
  NMGGlass.sync(glassControls, glassPrefs);
}
NMGGlass.mount(glassControls, glassPrefs, patch => {
  prefs = {...prefs,...patch};
  syncControls();
  chrome.storage.local.set(patch).catch(() => NMGGlass.error(glassControls));
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  for (const key of Object.keys(defaults)) if (changes[key]) prefs[key] = changes[key].newValue ?? defaults[key];
  syncControls();
});

async function syncSites() {
  const result = await chrome.runtime.sendMessage({type:'nmg-sync-sites'});
  if (!result?.ok) throw new Error(result?.error || 'Could not update site access.');
}
async function applyToActiveSite(site) {
  const [tab] = await chrome.tabs.query({active:true,currentWindow:true});
  if (!tab?.id || !tab.url) return false;
  const hosts = site.origins.map(origin => new URL(origin).hostname);
  const url = new URL(tab.url);
  if (url.protocol !== 'https:' || !hosts.includes(url.hostname)) return false;
  try {
    await chrome.tabs.sendMessage(tab.id,{type:'nmg-status'});
  } catch {
    // A tab open before opt-in has no registered script yet. Apply without reload.
    await chrome.scripting.insertCSS({target:{tabId:tab.id},files:['glass-controls.css','official.css']});
    await chrome.scripting.executeScript({target:{tabId:tab.id},files:['glass.js','official.js']});
  }
  const result = await chrome.tabs.sendMessage(tab.id,{type:'nmg-status'});
  status.textContent = result.status;
  return true;
}

for (const site of NMGSites) {
  const input = document.getElementById(site.key);
  input.addEventListener('change', async () => {
    const enabled = input.checked;
    input.disabled = true;
    try {
      // Permission requests must start in the user's toggle gesture.
      if (enabled && !await chrome.permissions.request({origins:[...site.origins]})) {
        input.checked = false;
        status.textContent = `${site.label} is off. Site access was not granted.`;
        return;
      }
      await chrome.storage.local.set({[site.key]:enabled});
      prefs[site.key] = enabled;
      syncControls();
      if (!enabled) {
        try { await syncSites(); }
        finally { await chrome.permissions.remove({origins:[...site.origins]}); }
        status.textContent = `${site.label} glass switched off.`;
      } else {
        await syncSites();
        status.textContent = `${site.label} enabled. Open the site or refresh an existing tab.`;
        try { await applyToActiveSite(site); } catch {
          status.textContent = `${site.label} enabled. Refresh its tab to apply.`;
        }
      }
    } catch {
      // Roll back both the UI and registration if enabling could not finish.
      if (enabled) {
        prefs[site.key] = false;
        await chrome.storage.local.set({[site.key]:false}).catch(() => {});
        await syncSites().catch(() => {});
        await chrome.permissions.remove({origins:[...site.origins]}).catch(() => {});
      }
      syncControls();
      status.textContent = `Could not update ${site.label}. Reopen the popup and try again.`;
    } finally { input.disabled = false; }
  });
}
toggle.addEventListener('change', async () => {
  const enabled = toggle.checked;
  toggle.disabled = true;
  try {
    await chrome.storage.local.set({enabled});
    prefs.enabled = enabled;
    syncControls();
    status.textContent = enabled ? 'Skin enabled on supported NetMirror pages.' : 'NetMirror’s original appearance restored.';
  } catch {
    syncControls();
    status.textContent = 'Could not save. Please reopen this popup.';
  }
  toggle.disabled = false;
});

async function refresh() {
  prefs = await chrome.storage.local.get(defaults);
  syncControls();
  toggle.disabled = false;
  for (const site of NMGSites) document.getElementById(site.key).disabled = false;
  try {
    const [tab] = await chrome.tabs.query({active:true,currentWindow:true});
    const result = await chrome.tabs.sendMessage(tab.id, {type:'nmg-status'});
    status.textContent = result.status;
  } catch {
    status.textContent = 'Choose where to use glass. Official sites are enabled separately.';
  }
}
refresh().catch(() => { status.textContent = 'Settings unavailable. Reload the extension.'; });
