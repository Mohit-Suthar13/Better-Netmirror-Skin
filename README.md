# NetMirror Glass

An unpacked Manifest V3 Chrome extension that applies an Apple TV-inspired glass skin to **the real https://net77.cc website**. It is not a new-tab replacement or a standalone streaming app.

## Install

1. In Chrome, open `chrome://extensions`.
2. Enable **Developer mode** (top right).
3. Choose **Load unpacked** and select this `netmirror-glass` folder (not the parent workspace or `dist`).
4. Open https://net77.cc/home and refresh. Complete the site's normal verification if prompted.
5. Pin **NetMirror Glass** from Chrome's puzzle-piece menu. Its popup switches the skin on/off immediately.

After changing the extension files, click **Reload** on its extension card, then refresh NetMirror.

## Design and behavior

- Netflix catalog rows scroll with left/right trackpad gestures or Shift+mouse wheel. Ordinary up/down gestures scroll the page, including over previews. Existing arrow buttons still work.
- Hover previews and title dialogs use translucent glass, including metadata, episodes, recommendations and About sections. Original playback iframe contents remain unchanged.
- Frosted blue-gray panel, floating shortcut rail, rounded cinematic hero, softened cards, system typography and provider dock inspired by the supplied screenshots.
- Actual NetMirror posters and catalog. No invented movie data or substitute login.
- Shortcut controls delegate to the site's existing search, watchlist and provider controls. Changing provider retains the site's existing reload behavior.
- Existing detail dialogs, episodes, pagination and player handlers are preserved. Player iframe contents are not skinned.
- Theme attributes and added controls are removed on disable. Original source nodes are not moved or replaced.
- Only `storage` permission, only the exact `https://net77.cc/*` match, only the top frame. No analytics, remote extension code, cookie access, request interception, Apple assets, or new-tab override.

## Compatibility

Validation: Chrome contract tests pass wheel input, edge release, preview forwarding, pagination, glass layers and restoration, plus the original activation/delegation/player-isolation checks. The installed extension was reloaded in Chrome and live catalog scrolling, hover previews, title details, episodes, recommendations and About surfaces were visually checked. Playback and alternate-provider wheel behavior remain unverified. The fixture is a structural test, not a replica of the live catalog.

Targets the catalog layout inspected on 2026-10-23. Unsupported layouts and verification pages remain unchanged. The site advertises periodic domain changes: a new confirmed domain requires updating the match in the manifest and reloading the extension. This does not grant access to arbitrary sites.

This is an independent visual theme, not affiliated with Apple or NetMirror. Desktop Apple TV resource observations and integration findings are documented in [the design notes](../analysis/GLASS-DESIGN.md).

### 1.1.0 fixes (2026-10-23)
- Reset Netflix's inherited hero padding, negative catalog margin, and header spacer; clip the hero at its rounded boundary.
- Add entrance fades, hover/press transitions, and provider-switch feedback with reduced-motion support.
- Support the separate Prime React/Swiper layout, including late rendering, search/watchlist shortcuts, and a Switch service button that opens the native provider picker via focus.
- Verified live Netflix → Prime → Netflix switching in the installed Chrome extension. Playback was not tested.
- Regression checks cover hero geometry, reduced motion, delayed Prime mounting, focus-only picker activation, existing delegation and reversibility.

### 1.2.0 — glass and title navigation (2026-10-24)
- Consistent translucent header, rail, settings, and provider dock: finer light edges, restrained shadows, quieter catalog tint, and reduced-transparency fallback. Refined using the user-supplied Taste skill's component and visual critique guidance; the explicit glass brief overrides that skill's default ban on glass.
- The side rail stays open while browsing. During movie/title selection it slides away, returning near the left edge or on keyboard focus/touch. Reduced motion removes the travel. The edge target stays above Netflix's dialog scrim.
- Escape clicks Netflix's native close control; Prime's full-screen selection returns via its native catalog navigation. Background notifications do not block Escape. Active menus, playback, fullscreen, and disabled-skin behavior are guarded.
- Bottom shortcuts show only Netflix and Prime Video. Prime's Netflix shortcut opens its native picker and selects Netflix after React mounts it.
- Validation: isolated Chrome contract checks pass, including delayed provider choices, rail hover/focus, modal stacking, home pinning, Escape, and restoration. Live Prime → Netflix → Prime switching and Escape on both title interfaces were verified. Desktop live views and 1440/768/390 structural fixture captures were reviewed. Playback and full upstream mobile layout remain outside this validation; Taste's standalone inspector was not run against the third-party application.

### 1.3.0 — provider names and service access (2026-10-28)
- Replaced the Netflix layout's “For You” heading and decorative star with “Netflix”. Prime keeps its native header.
- Centralized supported provider names, layout identities, and native-picker matching in the `providers` registry in `content.js`.
- Netflix and Prime Video shortcuts mark the current provider as selected. “All services” opens NetMirror's native picker for its remaining offerings.
- Validation: Chrome structural contract suite passed, including heading text, logo removal, All services delegation, and existing navigation/restoration checks. This release has not been checked on the live site.

### Extending to more OTTs
Keep the shared glass styles and controls, and add an adapter for each verified DOM layout (activation, header, search, watchlist, provider switching, details, and player detection). Register its provider identity separately. Native service-picker access does not imply that every resulting catalog layout is skinned.

The official Netflix and Prime Video websites are separate integrations: each needs its own inspected layout adapter, explicit manifest host match, and validation. The current extension applies only to NetMirror on net77.cc.

### 1.4.0 — frameless featured scenes (2026-10-28)
- Removed the outer catalog frame and rounded hero inset on both Netflix and Prime layouts. Featured artwork fills the content area's width, with broad glass reflections and a soft fade into the page.
- Frosted secondary Netflix actions and Prime banner buttons retain native handlers. Decorative overlays do not intercept pointer events, and reduced-transparency preferences simplify the material.
- Prime's native home link displays “Prime Video” in place of its original branding; disabling the skin restores it.
- Chrome fixture suite passed, including both layouts' frame removal, Prime heading, provider switching, navigation, and restoration. Live artwork and the full Prime layout still need visual verification after extension reload.

### 1.5.0 — Apple TV reference and clipping correction (2026-10-28)
- Continuous charcoal canvas and full-width featured scenes on Netflix and Prime, with viewport-aware height, top-aligned artwork and soft fades into the catalog.
- Fixed Netflix's title/actions being painted underneath its artwork. Prime's fade now sits below its controls; the provider heading replaces its brand instead of its Home navigation item.
- Consistent catalog gutters, quieter notice styling, section typography and frosted secondary controls. Native cards, provider handlers and playback remain intact.
- REA bundle findings and screenshot-derived design choices are recorded in `analysis/GLASS-DESIGN.md`. Chrome contract suite passed; saved real markup was visually reviewed offline. Playback was not exercised.
- Removed obsolete standalone `dist` demos and stale image captures; the active unpacked extension stays in this folder. The pre-existing REA tooling folder remains because the test runner depends on it.
# Better-Netmirror-Skin
