# NetMirror Glass

An unpacked Manifest V3 Chrome extension with an Apple TV-inspired glass skin for **NetMirror on https://net77.cc**, plus separate, optional skins for **Netflix** and **Prime Video** on their official websites. It keeps each site's own catalog, navigation and player.

## Install

1. In Chrome, open `chrome://extensions`.
2. Enable **Developer mode** (top right).
3. Choose **Load unpacked** and select this `netmirror-glass` folder (not the parent workspace or `dist`).
4. Open https://net77.cc/home and refresh. Complete the site's normal verification if prompted.
5. Pin **NetMirror Glass** from Chrome's puzzle-piece menu. Its NetMirror switch controls the skin on `net77.cc` independently of the official-site switches.

After changing the extension files, click **Reload** on its extension card, then refresh the catalog tab you want to update.

### Official Netflix and Prime Video

Both official-site options start **off**. Enable the service in the extension popup and grant Chrome's requested access for that service. Each option is independent: turning NetMirror off does not turn either official-site option off, and vice versa.

- Netflix requests only `https://netflix.com/*` and `https://www.netflix.com/*`. Its signed-in catalog adapter is **experimental**; the current authenticated layout has not been verified.
- Prime Video requests only `https://primevideo.com/*` and `https://www.primevideo.com/*`. Its adapter adds glass to recognized catalog navigation and overlays while retaining native layout and scrolling. Amazon shopping domains and regional Amazon Video pages are not included.

On a recognized official catalog, use the floating **Liquid glass** button for settings or **Turn off for this site**. Sign-in, account and playback routes are excluded. An enabled switch does not force styling onto an unrecognized page.

### Adjust the glass

The popup and each active page's settings share two saved sliders:

- **Transparency: 0–90%** — lower values make glass surfaces more solid; higher values reveal more behind them.
- **Blur: 0–48px** — lower values keep the background sharper; higher values make it more frosted.

Changes apply live to supported glass surfaces across enabled sites without fading text or controls. **Reset glass** restores 52% transparency and 28px blur. NetMirror exposes these controls through its settings shortcut; official sites use the floating Liquid glass button.

## Design and behavior

- On NetMirror, Netflix and Prime Video catalog rows support left/right trackpad gestures or Shift+mouse wheel. Prime delegates movement to its existing Swiper carousel, including its boundaries and animation. Ordinary up/down gestures scroll the page, and existing arrow buttons still work.
- Hover previews and title dialogs use translucent glass, including metadata, episodes, recommendations and About sections. Original playback iframe contents remain unchanged.
- Continuous charcoal canvas, full-width featured scenes, floating shortcut rail, frosted controls, system typography and provider dock inspired by the supplied screenshots.
- Actual NetMirror posters and catalog. No invented movie data or substitute login.
- Shortcut controls delegate to the site's existing search, watchlist and provider controls. Changing provider retains the site's existing reload behavior.
- Existing detail dialogs, episodes, pagination and player handlers are preserved. Player iframe contents are not skinned.
- Theme attributes and added controls are removed on disable. Original source nodes are not moved or replaced.
- Uses `storage` for preferences and `scripting` to register optional official-site adapters. NetMirror has the exact `https://net77.cc/*` content-script match; official-site access is requested separately for the exact hosts listed above. All scripts run only in the top frame. No analytics, remote extension code, cookie access, request interception, Apple assets, or new-tab override.

## Testing

With Node.js and Google Chrome installed, run `npm ci && npm test` from this folder. The six suites use isolated fixtures. Set `CHROME_PATH` to a Chrome executable if it is installed in a custom location. Review screenshots are written to the system temporary directory.

## Compatibility

Version 1.6.0 validation uses isolated Chrome fixtures and mocked extension APIs for persisted glass controls, independent site switches, permission/registration behavior, native Prime wheel delegation, route/fullscreen guards and cleanup, alongside the existing NetMirror contracts. Fixtures test behavior and structure; they do not establish compatibility with every live catalog or player.

Official Prime Video catalog selectors were observed on the public site on 2026-10-28. Its native horizontal rails are preserved. Official Netflix redirected anonymous browsing to sign-in, so its authenticated adapter remains experimental and unverified against the current signed-in site. Playback has not been tested for this release. Earlier live NetMirror checks are recorded in the version history below.

NetMirror adapters target its separately inspected Netflix and Prime layouts. Unsupported layouts and verification pages remain unchanged. The site advertises periodic domain changes: a new confirmed domain requires updating the manifest match and reloading the extension. This does not grant access to arbitrary sites.

This is an independent visual theme, not affiliated with Apple or NetMirror. Its design was informed by the supplied screenshots and desktop Apple TV observations.

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

Official websites use separate opt-in adapters and exact optional host permissions. Additions should retain native navigation and scrolling, avoid account and playback surfaces, and document which live layouts have actually been inspected. A registered hostname or passing fixture test does not establish full service compatibility.

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
- Removed obsolete standalone `dist` demos and stale image captures; the active unpacked extension stays in this folder. The pre-existing REA tooling folder was retained at that point; the tests now use this project's own development dependency.

### 1.6.0 — adjustable glass and optional official sites (2026-10-28)
- Added shared, persisted Transparency and Blur sliders in the popup and page settings, with live updates, keyboard controls and Reset glass.
- Added horizontal trackpad and Shift+wheel navigation to NetMirror's Prime catalog using its native Swiper controls, preserving vertical page scrolling and releasing gestures at row boundaries.
- Added independent, default-off official Netflix and Prime Video switches. Chrome requests exact service host access when enabled; the extension registers only the enabled, permitted adapter.
- Official Prime applies conservative decorative glass to observed public catalog surfaces and retains its native rails. Official Netflix requires its candidate catalog header and rows, reports experimental status, and remains unverified on the current signed-in layout.
- Isolated fixture checks cover settings synchronization, optional-site lifecycle, cleanup, guards, original-node preservation and scrolling behavior. Playback was not exercised.


### 1.7.0 — refined liquid glass (2026-10-30)
- Unified neutral glass surfaces, fine reflective edges and shadows across NetMirror, the optional official-site adapters, and shared controls. Quieter header tabs and a clear selected-provider pill let artwork lead.
- Rebuilt the popup with native accessible switches, consistent sliders, readable labels, and a layout that fits Chrome’s popup height. Functional slider tracks and off-switch boundaries exceed 3:1 contrast against the popup surface.
- Added a close button to in-page settings; Close and Escape restore focus and update the trigger’s expanded state. Kept saved glass values and service choices.
- Consolidated the accumulated skin CSS while preserving native nodes, catalog geometry, hero clipping, scrolling, provider delegation, and player exclusions. No additional permissions.
- All six unchanged regression suites passed. Hallmark static review reported no open failures or reflex findings. Its Puppeteer render tier was unavailable; Playwright fixture screenshots and live Chrome inspection were used instead. Independent finish review found one control-contrast issue, now resolved.
- Reloaded version 1.7.0 in the user’s Chrome and verified the Netflix and Prime layouts on NetMirror, native switching, settings, and the popup. Existing playback tabs were left untouched and receive the new styles when refreshed. Authenticated official Netflix/Prime pages and playback were not exercised in this update.
