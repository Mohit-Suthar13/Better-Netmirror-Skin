// Runs in MAIN world so wheel gestures can delegate to the site's own Swiper.
// No catalog nodes, transforms, native listeners, or Swiper settings are replaced.
(() => {
  'use strict';
  if (globalThis.__nmgPrimeWheel) return;
  globalThis.__nmgPrimeWheel = true;
  const gestures = new WeakMap();
  const root = document.documentElement;
  document.addEventListener('wheel', event => {
    if (root.dataset.nmg !== 'glass' || root.dataset.nmgLayout !== 'prime' ||
        root.hasAttribute('data-nmg-player') || root.hasAttribute('data-nmg-detail') ||
        event.defaultPrevented || !event.cancelable || event.ctrlKey || event.metaKey) return;
    if (!event.shiftKey && Math.abs(event.deltaX) <= Math.abs(event.deltaY)) return;
    if (event.target.isContentEditable || event.target.closest?.('input,textarea,select,[data-nmg-owned],#player,[ranger="ranger_details_page"],[ranger="ranger_section_banner"],video,iframe')) return;
    const row = event.target.closest?.('.prime-slider-main');
    const swiper = row?.swiper;
    if (!swiper || swiper.el !== row || swiper.destroyed || swiper.enabled === false ||
        swiper.initialized === false || swiper.isLocked ||
        typeof swiper.isHorizontal !== 'function' || !swiper.isHorizontal() ||
        typeof swiper.slideNext !== 'function' || typeof swiper.slidePrev !== 'function') return;
    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? row.clientWidth : 1;
    const raw = (Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY) * unit;
    if (!Number.isFinite(raw) || !raw) return;
    const delta = swiper.rtlTranslate ? -raw : raw;
    const next = delta > 0;
    // Release outward gestures at either end, matching the native row boundaries.
    const wraps = swiper.params?.loop || swiper.params?.rewind;
    if ((next && (swiper.allowSlideNext === false || (!wraps && swiper.isEnd))) ||
        (!next && (swiper.allowSlidePrev === false || (!wraps && swiper.isBeginning)))) {
      gestures.delete(row);
      return;
    }
    const now = performance.now();
    let gesture = gestures.get(row);
    // A trackpad gesture includes a momentum tail. Advance at most once per burst;
    // a direction change or a short pause starts a fresh gesture.
    if (!gesture || now - gesture.at > 180 || gesture.next !== next) {
      gesture = {at:now,next,total:0,fired:false};
      gestures.set(row, gesture);
    }
    gesture.at = now;
    gesture.total += Math.abs(delta);
    event.preventDefault();
    if (gesture.fired || gesture.total < 24 || swiper.animating) return;
    gesture.fired = true;
    const speed = matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : undefined;
    if (next) swiper.slideNext(speed);
    else swiper.slidePrev(speed);
  }, {passive:false});
})();
