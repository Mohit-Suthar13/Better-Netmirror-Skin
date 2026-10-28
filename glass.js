(() => {
  'use strict';
  const defaults = {glassTransparency:52, glassBlur:28};
  function normalize(prefs = {}) {
    const number = (key, max) => Number.isFinite(prefs[key]) ? Math.round(Math.max(0, Math.min(max, prefs[key]))) : defaults[key];
    return {glassTransparency:number('glassTransparency', 90), glassBlur:number('glassBlur', 48)};
  }
  const properties = ['--nmg-glass-opacity', '--nmg-glass-radius', '--nmg-dialog-opacity'];
  function apply(root, prefs) {
    const value = normalize(prefs);
    const opacity = (100 - value.glassTransparency) / 100;
    root.style.setProperty(properties[0], String(opacity));
    root.style.setProperty(properties[1], `${value.glassBlur}px`);
    root.style.setProperty(properties[2], String(Math.min(1, opacity * 1.4)));
  }
  function clear(root) { properties.forEach(name => root.style.removeProperty(name)); }
  function sync(host, prefs) {
    const value = normalize(prefs);
    for (const [key, amount] of Object.entries(value)) {
      const input = host.querySelector(`[data-glass="${key}"]`);
      if (!input) continue;
      input.value = amount;
      const unit = key === 'glassBlur' ? 'px' : '%';
      input.setAttribute('aria-valuetext', `${amount}${unit}`);
      host.querySelector(`[data-glass-output="${key}"]`).textContent = `${amount}${unit}`;
    }
  }
  function mount(host, prefs, change) {
    host.classList.add('nmg-glass-controls');
    host.innerHTML = `<legend>Liquid glass</legend>
      <label>Transparency <output data-glass-output="glassTransparency"></output>
        <input type="range" data-glass="glassTransparency" min="0" max="90" step="1" aria-label="Glass transparency">
      </label>
      <div class="nmg-range-hints"><span>Solid</span><span>Clear</span></div>
      <label>Blur <output data-glass-output="glassBlur"></output>
        <input type="range" data-glass="glassBlur" min="0" max="48" step="1" aria-label="Glass blur">
      </label>
      <div class="nmg-range-hints"><span>Sharp</span><span>Frosted</span></div>
      <p>Updates glass panels on Netflix and Prime Video.</p>
      <button type="button" data-glass-reset>Reset glass</button>
      <p class="nmg-glass-error" role="status" hidden></p>`;
    host.addEventListener('input', event => {
      const key = event.target.dataset.glass;
      if (Object.hasOwn(defaults, key)) change({[key]:Number(event.target.value)});
    });
    host.querySelector('[data-glass-reset]').addEventListener('click', () => change({...defaults}));
    sync(host, prefs);
  }
  function error(host) {
    const message = host?.querySelector('.nmg-glass-error');
    if (message) { message.hidden = false; message.textContent = 'Could not save. Reload the extension and try again.'; }
  }
  globalThis.NMGGlass = {defaults, normalize, apply, clear, sync, mount, error};
})();
