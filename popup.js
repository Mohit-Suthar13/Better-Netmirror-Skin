'use strict';
const toggle = document.querySelector('#enabled');
const status = document.querySelector('#status');
async function refresh() {
  const prefs = await chrome.storage.local.get({enabled:true});
  toggle.checked = prefs.enabled !== false;
  toggle.disabled = false;
  try {
    const [tab] = await chrome.tabs.query({active:true,currentWindow:true});
    const result = await chrome.tabs.sendMessage(tab.id, {type:'nmg-status'});
    status.textContent = result.status;
  } catch {
    status.textContent = toggle.checked ? 'Enabled. Open NetMirror and refresh its tab to apply.' : 'Skin switched off. The original site is unchanged.';
  }
}
toggle.addEventListener('change', async () => {
  toggle.disabled = true;
  try {
    await chrome.storage.local.set({enabled:toggle.checked});
    status.textContent = toggle.checked ? 'Skin enabled on supported NetMirror pages.' : 'Original appearance restored.';
  } catch { status.textContent = 'Could not save. Please reopen this popup.'; }
  toggle.disabled = false;
});
refresh().catch(() => { status.textContent = 'Settings unavailable. Reload the extension.'; });
