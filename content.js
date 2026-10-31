(() => {
  'use strict';
  if (globalThis.__netmirrorGlass) return;
  globalThis.__netmirrorGlass = true;
  const root = document.documentElement;
  let enabled = true;
  let glassPrefs = {...NMGGlass.defaults};
  let timer;
  let layout = '';
  // Provider identity is separate from layout-specific DOM behavior.
  // Add verified providers here; the native picker exposes all other services.
  const providers = {
    nf: {name:'Netflix', layout:'netflix', match:/netflix/i},
    pv: {name:'Prime Video', layout:'prime', match:/prime(?:\s*video)?/i}
  };
  const currentProvider = () => Object.values(providers).find(provider => provider.layout === layout);
  let switchTimer;
  let providerObserver;
  let railTimer;
  let status = 'Waiting for NetMirror';
  let scrollTimer;
  let hoveredScroller;
  document.addEventListener('mouseover', event => {
    const scroller = event.target.closest?.('.lolomoRow .sliderContent');
    if (scroller) hoveredScroller = scroller;
  }, {passive:true});
  // The site's desktop arrows use scrollLeft, but its CSS disables wheel scrolling.
  // Keep that same scroller and let horizontal trackpad gestures stay native.
  function syncRow(scroller) {
    const slider = scroller.closest('.slider');
    if (!slider) return;
    const max = scroller.scrollWidth - scroller.clientWidth;
    const position = Math.max(0, scroller.scrollLeft);
    slider.querySelector('.handlePrev')?.classList.toggle('active', position > 1);
    const pages = [...slider.querySelectorAll('.pagination-indicator li')];
    const page = position >= max - 1 ? pages.length - 1 : Math.round(position / scroller.clientWidth);
    pages.forEach((item, index) => item.classList.toggle('active', index === Math.max(0, Math.min(pages.length - 1, page))));
  }
  document.addEventListener('wheel', event => {
    if (!enabled || !root.hasAttribute('data-nmg') || root.hasAttribute('data-nmg-player') || event.defaultPrevented || event.ctrlKey || event.metaKey) return;
    // Up/down always scrolls the page. Only left/right or Shift+wheel moves rows.
    if (!event.shiftKey && Math.abs(event.deltaX) <= Math.abs(event.deltaY)) return;
    if (event.target.closest?.('#modal-main, #player, [data-nmg-owned], input, textarea, select, [contenteditable="true"]')) return;
    const preview = event.target.closest?.('#actionMenu');
    const row = event.target.closest?.('.lolomoRow');
    const previewOwner = preview && hoveredScroller?.isConnected && [...hoveredScroller.querySelectorAll('[data-post]')].some(card => card.dataset.post === preview.dataset.post);
    const scroller = previewOwner ? hoveredScroller : row?.querySelector('.sliderContent');
    if (!scroller || scroller.scrollWidth <= scroller.clientWidth + 1) return;
    // Normal row gestures stay native; forward only when a hover preview covers it.
    if (!previewOwner) return;
    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? scroller.clientWidth : 1;
    const delta = (previewOwner && Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY) * unit;
    const max = scroller.scrollWidth - scroller.clientWidth;
    if (!delta || (delta < 0 && scroller.scrollLeft <= 1) || (delta > 0 && scroller.scrollLeft >= max - 1)) return;
    // Preserve native handling at the row boundaries.
    if (!event.cancelable) return;
    event.preventDefault();
    scroller.scrollLeft = Math.max(0, Math.min(max, scroller.scrollLeft + delta));
  }, {passive:false});
  document.addEventListener('scroll', event => {
    if (!enabled || !root.hasAttribute('data-nmg') || !event.target.matches?.('.lolomoRow .sliderContent')) return;
    syncRow(event.target);
    root.setAttribute('data-nmg-scrolling', '');
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(() => root.removeAttribute('data-nmg-scrolling'), 220);
  }, true);
  const icons = {
    home: '<path d="m3 11 9-8 9 8M5 10v11h5v-7h4v7h5V10"/>',
    search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
    grid: '<rect x="3" y="3" width="6" height="6" rx="1"/><rect x="15" y="3" width="6" height="6" rx="1"/><rect x="3" y="15" width="6" height="6" rx="1"/><rect x="15" y="15" width="6" height="6" rx="1"/>',
    list: '<path d="M5 4h14v17l-7-4-7 4z"/>',
    settings: '<circle cx="12" cy="12" r="4"/><path d="M12 2v3m0 14v3M2 12h3m14 0h3M5 5l2 2m10 10 2 2M5 19l2-2M17 7l2-2"/>'
  };
  function svg(name) {
    return '<svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + icons[name] + '</svg>';
  }
  function proxy(selector) {
    const target = document.querySelector(selector);
    if (target) target.click();
  }
  function removeUI() {
    root.removeAttribute('data-nmg');
    root.removeAttribute('data-js-nmg');
    NMGGlass.clear(root);
    root.removeAttribute('data-nmg-player');
    root.removeAttribute('data-nmg-layout');
    root.removeAttribute('data-nmg-scrolling');
    root.removeAttribute('data-nmg-detail');
    clearTimeout(scrollTimer);
    hoveredScroller = null;
    document.querySelectorAll('[data-nmg-header]').forEach(el => el.removeAttribute('data-nmg-header'));
    document.querySelectorAll('[data-nmg-brand]').forEach(el => el.removeAttribute('data-nmg-brand'));
    clearTimeout(switchTimer);
    clearTimeout(railTimer);
    providerObserver?.disconnect();
    providerObserver = null;
    document.querySelectorAll('[data-nmg-owned]').forEach(el => el.remove());
  }
  function openServices() {
    const prime = document.querySelector('[ranger="ranger_ott"]');
    // Prime opens on focus; focus followed by click would immediately close it.
    if (prime) {
      if (document.activeElement !== prime) prime.focus({preventScroll:true});
      else if (!document.querySelector('.ott-item')) prime.click();
    } else proxy('#main-header .moreOTT');
  }
  function isVisible(element) {
    return !!element && element.getClientRects().length > 0 && getComputedStyle(element).visibility !== 'hidden';
  }
  function isPlaying() {
    return isVisible(document.querySelector('#player:not(.hide)')) ||
      (layout === 'prime' && /\/player(?:\/|$)/.test(location.pathname));
  }
  function primeProvider(id) {
    const name = providers[id]?.match;
    if (!name) return;
    return [...document.querySelectorAll('.ott-item')].find(item =>
      name.test([item.textContent, item.getAttribute('aria-label'), ...[...item.querySelectorAll('img')].map(img => `${img.alt} ${img.getAttribute('src')}`)].join(' ')));
  }
  function switchProvider(id, button, dock, label) {
    if (dock.getAttribute('aria-busy') === 'true') return;
    const reset = () => {
      clearTimeout(switchTimer);
      providerObserver?.disconnect();
      providerObserver = null;
      dock.removeAttribute('aria-busy');
      button.textContent = label;
      button.removeAttribute('aria-label');
    };
    dock.setAttribute('aria-busy', 'true');
    button.textContent = 'Switching…';
    button.setAttribute('aria-label', `Switching to ${label}`);
    switchTimer = setTimeout(reset, 8000);
    const native = document.querySelector(`.setOTT[data-ott="${id}"]`);
    if (native) { native.click(); return; }
    if (layout !== 'prime') { reset(); return; }
    // React mounts its choices only after the native picker opens.
    const select = () => {
      const item = primeProvider(id);
      if (!item) return false;
      providerObserver?.disconnect();
      providerObserver = null;
      item.click();
      return true;
    };
    if (select()) return;
    providerObserver = new MutationObserver(select);
    providerObserver.observe(document.body, {childList:true,subtree:true});
    openServices();
    select();
  }
  function mount(header) {
    if (document.getElementById('nmg-rail')) return;
    const edge = document.createElement('div');
    edge.id = 'nmg-edge';
    edge.setAttribute('data-nmg-owned', '');
    const handle = document.createElement('button');
    handle.id = 'nmg-rail-toggle';
    handle.type = 'button';
    handle.setAttribute('aria-label', 'Show shortcuts');
    handle.setAttribute('aria-controls', 'nmg-rail');
    handle.setAttribute('aria-expanded', 'false');
    const setRailOpen = open => {
      clearTimeout(railTimer);
      edge.toggleAttribute('data-open', open);
      handle.setAttribute('aria-expanded', String(open));
      handle.setAttribute('aria-label', 'Show shortcuts');
    };
    edge.addEventListener('pointerenter', event => { if (event.pointerType !== 'touch') setRailOpen(true); });
    edge.addEventListener('pointerleave', () => {
      railTimer = setTimeout(() => {
        if (!edge.matches(':focus-within') && settings.hidden) setRailOpen(false);
      }, 450);
    });
    edge.addEventListener('focusin', () => setRailOpen(true));
    edge.addEventListener('focusout', () => {
      railTimer = setTimeout(() => {
        if (!edge.matches(':hover, :focus-within') && settings.hidden) setRailOpen(false);
      }, 450);
    });
    // The edge handle remains reachable by touch and keyboard when the rail hides.
    handle.addEventListener('click', () => setRailOpen(true));
    const rail = document.createElement('nav');
    rail.id = 'nmg-rail';
    rail.setAttribute('data-nmg-owned', '');
    rail.setAttribute('aria-label', 'NetMirror shortcuts');
    rail.innerHTML = `<a href="/home" title="Home" aria-label="Home">${svg('home')}</a>
      <button type="button" data-action="search" title="Search" aria-label="Search">${svg('search')}</button>
      <button type="button" data-action="services" title="Streaming services" aria-label="Streaming services">${svg('grid')}</button>
      <button type="button" data-action="list" title="My List" aria-label="My List">${svg('list')}</button>
      <button type="button" data-action="settings" title="Skin settings" aria-label="Skin settings" aria-controls="nmg-settings" aria-expanded="false">${svg('settings')}</button>`;
    rail.addEventListener('click', event => {
      const action = event.target.closest('[data-action]')?.dataset.action;
      if (action === 'search') { proxy(layout === 'prime' ? '#root a[href="/search"]' : '#main-header .searchTab'); document.querySelector('#searchInput')?.focus(); }
      if (action === 'services') openServices();
      if (action === 'list') proxy(layout === 'prime' ? '#root a[href="/watch-list"]' : '#main-header .navigation-tab .mylist');
      if (action === 'settings') {
        const panel = document.getElementById('nmg-settings');
        panel.hidden = !panel.hidden;
        rail.querySelector('[data-action="settings"]').setAttribute('aria-expanded', String(!panel.hidden));
        if (!panel.hidden) panel.querySelector('input').focus();
      }
    });
    const settings = document.createElement('section');
    settings.id = 'nmg-settings';
    settings.hidden = true;
    settings.setAttribute('data-nmg-owned', '');
    settings.setAttribute('aria-label', 'Glass appearance');
    settings.innerHTML = '<div class="nmg-settings-heading"><strong>NetMirror Glass</strong><button type="button" data-close-settings aria-label="Close glass settings"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></button></div><fieldset></fieldset><button type="button" data-restore>Restore original appearance</button>';
    settings.querySelector('[data-close-settings]').addEventListener('click', () => {
      settings.hidden = true;
      const trigger = rail.querySelector('[data-action="settings"]');
      trigger.setAttribute('aria-expanded', 'false');
      trigger.focus();
    });
    NMGGlass.mount(settings.querySelector('fieldset'), glassPrefs, patch => {
      glassPrefs = NMGGlass.normalize({...glassPrefs, ...patch});
      NMGGlass.apply(root, glassPrefs);
      NMGGlass.sync(settings, glassPrefs);
      chrome.storage.local.set(patch).catch(() => NMGGlass.error(settings));
    });
    settings.querySelector('[data-restore]').addEventListener('click', () => chrome.storage.local.set({enabled:false}));
    edge.append(handle, rail, settings);
    document.body.append(edge);

    const label = document.createElement('span');
    label.id = 'nmg-heading';
    label.setAttribute('data-nmg-owned', '');
    label.textContent = currentProvider()?.name || 'NetMirror';
    if (layout === 'prime') {
      const home = [...header.querySelectorAll('a[href]:not([ranger])')].find(link => link.getAttribute('href') === '/home' || link.pathname === '/home') || header.querySelector('[ranger="ranger_header_home"]');
      if (home) home.setAttribute('data-nmg-brand', '');
      (home || header).prepend(label);
    } else header.prepend(label);
    const dock = document.createElement('nav');
    dock.id = 'nmg-dock';
    dock.setAttribute('aria-label', 'Streaming providers');
    dock.setAttribute('data-nmg-owned', '');
    // Only expose service choices actually present in the source page.
    for (const [id, provider] of Object.entries(providers)) {
      const labelText = provider.name;
      if (layout !== 'prime' && !document.querySelector(`.setOTT[data-ott="${id}"]`)) continue;
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = labelText;
      button.dataset.provider = id;
      if (provider.layout === layout) {
        button.setAttribute('aria-current', 'true');
        button.disabled = true;
      } else button.addEventListener('click', () => switchProvider(id, button, dock, labelText));
      dock.append(button);
    }
    const allServices = document.createElement('button');
    allServices.type = 'button';
    allServices.textContent = 'All services';
    allServices.dataset.action = 'services';
    allServices.addEventListener('click', openServices);
    dock.append(allServices);
    document.body.append(dock);
  }
  function update() {
    const challenge = /\/verify|\/cdn-cgi\//.test(location.pathname) || /just a moment/i.test(document.title);
    const primeTrigger = document.querySelector('#root [ranger="ranger_ott"]');
    const header = document.querySelector('#main-header') || primeTrigger?.closest('.fixed');
    const nextLayout = primeTrigger ? 'prime' : 'netflix';
    const compatible = !!header && (nextLayout === 'prime' || !!document.querySelector('.lolomoRow, .billboard-row, #searchPage'));
    if (!enabled || challenge || !compatible) {
      status = !enabled ? 'Skin switched off' : challenge ? 'Waiting for site verification' : 'This page layout is not supported yet';
      removeUI();
      return;
    }
    if (layout !== nextLayout) removeUI();
    layout = nextLayout;
    root.setAttribute('data-nmg', 'glass');
    root.setAttribute('data-js-nmg', '');
    root.setAttribute('data-nmg-layout', layout);
    header.setAttribute('data-nmg-header', '');
    const playing = isPlaying();
    root.toggleAttribute('data-nmg-player', !!playing);
    const selecting = isVisible(document.querySelector('#modal-main:not(.hide)')) || isVisible(document.querySelector('[ranger="ranger_details_page"]'));
    root.toggleAttribute('data-nmg-detail', selecting);
    mount(header);
    NMGGlass.apply(root, glassPrefs);
    const edge = document.getElementById('nmg-edge');
    document.getElementById('nmg-rail-toggle')?.setAttribute('aria-expanded', String(!selecting || edge?.hasAttribute('data-open')));
    status = playing ? 'Player open — skin controls hidden' : 'Glass skin active';
  }
  chrome.storage.local.get({enabled:true, ...NMGGlass.defaults}).then(prefs => { enabled = prefs.enabled !== false; glassPrefs = NMGGlass.normalize(prefs); update(); });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    const patch = {};
    for (const key of Object.keys(NMGGlass.defaults)) if (changes[key]) patch[key] = changes[key].newValue;
    if (Object.keys(patch).length) {
      glassPrefs = NMGGlass.normalize({...glassPrefs, ...patch});
      if (root.hasAttribute('data-nmg')) NMGGlass.apply(root, glassPrefs);
      const settings = document.getElementById('nmg-settings');
      if (settings) NMGGlass.sync(settings, glassPrefs);
    }
    if (changes.enabled) { enabled = changes.enabled.newValue !== false; update(); }
  });
  chrome.runtime.onMessage.addListener((message, sender, respond) => {
    if (message.type === 'nmg-status') respond({enabled,status});
  });
  // Existing nodes, click handlers, source attributes, and player are never replaced.
  new MutationObserver(records => {
    if (!records.some(r => !r.target.closest?.('[data-nmg-owned]') && (r.type === 'childList' || r.target.id === 'player' || r.target.id === 'modal-main' || r.target.classList?.contains('modal-main')))) return;
    clearTimeout(timer);
    timer = setTimeout(update, 150);
  }).observe(document.body, {subtree:true,childList:true,attributes:true,attributeFilter:['class']});
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || event.repeat || event.defaultPrevented || !enabled || !root.hasAttribute('data-nmg') || document.fullscreenElement || isPlaying()) return;
    const panel = document.getElementById('nmg-settings');
    if (panel && !panel.hidden) {
      panel.hidden = true;
      const trigger = document.querySelector('#nmg-rail [data-action="settings"]');
      trigger?.setAttribute('aria-expanded', 'false');
      trigger?.focus();
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    // Let native menus, search and season pickers handle their own Escape first.
    if ([...document.querySelectorAll('[role="menu"], [role="listbox"], [aria-haspopup="menu"][aria-expanded="true"]')].some(menu => isVisible(menu) && (menu.contains(document.activeElement) || menu.closest('#modal-main, [ranger="ranger_details_page"]')))) return;
    let close = [...document.querySelectorAll('#modal-main .previewModal-close')].find(isVisible);
    const detail = document.querySelector('[ranger="ranger_details_page"]');
    if (!close && layout === 'prime' && isVisible(detail)) {
      close = [...detail.querySelectorAll('button[aria-label="Close"], [role="button"][aria-label="Close"]')].find(isVisible);
      // Prime's full-screen details keep the catalog URL and return through its native navigation.
      close ||= [...document.querySelectorAll('#root [data-nmg-header] a[href]')].find(link => link.getAttribute('href') === location.pathname)
        || document.querySelector('#root a[ranger="ranger_header_home"]');
    }
    if (!close) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    close.click();
  }, true);
})();
