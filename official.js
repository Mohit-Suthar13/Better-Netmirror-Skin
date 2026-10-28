(() => {
  'use strict';
  if (globalThis.__nmgOfficial) return;
  globalThis.__nmgOfficial = true;
  const host = location.hostname;
  const site = ['netflix.com','www.netflix.com'].includes(host) ? 'netflix'
    : ['primevideo.com','www.primevideo.com'].includes(host) ? 'prime' : null;
  if (!site) return;
  const key = `${site}Enabled`;
  const root = document.documentElement;
  let enabled = false;
  let prefs = {...NMGGlass.defaults};
  let timer;
  let status = 'Official-site skin is off';
  function clear() {
    root.removeAttribute('data-nmg-official');
    NMGGlass.clear(root);
    document.querySelectorAll('[data-nmg-official-header]').forEach(el => el.removeAttribute('data-nmg-official-header'));
    document.getElementById('nmg-official-controls')?.remove();
  }
  function recognize() {
    if (document.fullscreenElement || /\/(?:watch|player|login|signin|auth|account|profiles|signup|checkout|purchase)(?:\/|$)/i.test(location.pathname)) return null;
    if (site === 'prime') {
      if (!document.querySelector('[data-testid="landingpage"] [data-testid="card-container-list"]')) return null;
      return document.getElementById('pv-navigation-bar');
    }
    // Experimental: require both catalog rows and the catalog header, never just appMountPoint.
    if (!/^\/(?:browse|search|title)(?:\/|$)/.test(location.pathname) || !document.querySelector('#appMountPoint .lolomoRow')) return null;
    return document.querySelector('#appMountPoint .pinning-header .main-header');
  }
  function mount() {
    if (document.getElementById('nmg-official-controls')) return;
    const controls = document.createElement('aside');
    controls.id = 'nmg-official-controls';
    controls.innerHTML = '<button type="button" class="nmg-open-glass" aria-expanded="false" aria-controls="nmg-official-panel">Liquid glass</button><section id="nmg-official-panel" hidden><fieldset></fieldset><button type="button" class="nmg-disable-site">Turn off for this site</button></section>';
    const button = controls.querySelector('.nmg-open-glass');
    const panel = controls.querySelector('section');
    button.addEventListener('click', () => {
      panel.hidden = !panel.hidden;
      button.setAttribute('aria-expanded', String(!panel.hidden));
      if (!panel.hidden) panel.querySelector('input').focus();
    });
    controls.addEventListener('keydown', event => {
      if (event.key !== 'Escape' || panel.hidden) return;
      panel.hidden = true;button.setAttribute('aria-expanded','false');button.focus();event.stopPropagation();
    });
    NMGGlass.mount(controls.querySelector('fieldset'), prefs, patch => {
      prefs = NMGGlass.normalize({...prefs,...patch});
      NMGGlass.apply(root,prefs);NMGGlass.sync(controls,prefs);
      chrome.storage.local.set(patch).catch(() => NMGGlass.error(controls));
    });
    controls.querySelector('.nmg-disable-site').addEventListener('click', () => {
      chrome.storage.local.set({[key]:false}).catch(() => NMGGlass.error(controls));
    });
    document.body.append(controls);
  }
  function update() {
    const header = enabled && recognize();
    if (!header) {
      status = enabled ? 'Waiting for a supported catalog; sign-in and playback stay unchanged' : 'Official-site skin is off';
      clear();return;
    }
    root.setAttribute('data-nmg-official',site);
    document.querySelectorAll('[data-nmg-official-header]').forEach(el => { if (el !== header) el.removeAttribute('data-nmg-official-header'); });
    header.setAttribute('data-nmg-official-header','');
    NMGGlass.apply(root,prefs);mount();
    status = `${site === 'prime' ? 'Prime Video' : 'Netflix'} glass active${site === 'netflix' ? ' (experimental)' : ''}`;
  }
  chrome.storage.local.get({[key]:false,...NMGGlass.defaults}).then(saved => {
    enabled = saved[key] === true;prefs = NMGGlass.normalize(saved);update();
  });
  chrome.storage.onChanged.addListener((changes,area) => {
    if (area !== 'local') return;
    if (changes[key]) enabled = changes[key].newValue === true;
    const patch = {};
    for (const name of Object.keys(NMGGlass.defaults)) if (changes[name]) patch[name] = changes[name].newValue;
    prefs = NMGGlass.normalize({...prefs,...patch});
    update();
    const controls = document.getElementById('nmg-official-controls');
    if (controls) NMGGlass.sync(controls,prefs);
  });
  chrome.runtime.onMessage.addListener((message,sender,respond) => {
    if (message.type === 'nmg-status') respond({enabled,status});
  });
  new MutationObserver(records => {
    if (!records.some(record => !record.target.closest?.('#nmg-official-controls'))) return;
    clearTimeout(timer);timer = setTimeout(update,150);
  }).observe(document.body,{childList:true,subtree:true});
  addEventListener('popstate',update);
  document.addEventListener('fullscreenchange',update);
})();
