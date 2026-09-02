# Design QA: Android message composer and bottom navigation

## Visual source

- User screenshot: `/tmp/codex-remote-attachments/01a059ff-61ed-7551-aa78-5efc21dfbc6b/ac415cce-2015-48db-b878-eb9d049a495b/1-Photo-1.jpg`.
- Rendered fixed route: `/private/tmp/cruush-message-composer-android-after.png`.
- Normalized before-and-after comparison: `/private/tmp/cruush-message-composer-before-after.png`.

## Verified state

- Authenticated local one-to-one conversation with `jay`.
- Android Chrome-sized content viewport: `412 x 740` CSS pixels.
- Closed keyboard: composer bottom `652px`; bottom-navigation pill top `652px`; gap `0px`.
- Message-input shell and composer both meet the navigation pill without overlap.
- Document width stayed `412px` with no horizontal overflow.
- Keyboard-open positioning retains its existing keyboard inset and bottom padding.

## Fidelity review

- The supplied screenshot and fixed route were normalized into one comparison image.
- The message controls, input shape, bottom-navigation visuals, typography, and colors remain unchanged.
- Only the closed-keyboard gap beneath the message input was removed.
- Focused tests passed 37 cases across PrivateGroupChat, FeelingLucky, and ProfileCard.
- Browser console: no error-level messages in the inspected route.

final result: passed

---

# Design QA: Pop-ups profile actions

## Rendered state

- The authenticated populated mari profile rendered in the movable map popup.
- cruush, disabled Pin, and Message stayed on one row in exact order.
- Message replaced the profile with the direct conversation in the same dock.

## Interaction

- The map remained visible throughout the profile-to-thread transition.
- No second popup opened.
- The prior Full screen layout preference was restored afterward.
- No relationship, profile, message, or account data changed.

final result: passed

---

# Design QA: Spot request isolation

## Interaction coverage

- Switching Spots invalidates the prior detail and first-board-page request.
- Switching Spots invalidates an in-flight board pagination request.
- Switching Spots invalidates a delayed geolocation callback before it can post a check-in.

## Test evidence

- `src/app/components/PlaceDetail.test.tsx`: 3 tests passed.
- Focused run completed in 65.16 seconds.
- Real-device proximity and rendered scrollbar interaction remain unverified.

final result: passed

---

# Design QA: Crowd Mode 1.6 no-change rollback

## Preserved state

- No dedicated Crowds sheet remains.
- No Hydra Crowd asset remains.
- The existing Crowd Mode controls stay inside Visibility Controls.
- The existing active Crowd notice opens Visibility Controls.
- The shared icon map again uses `crowds-colored.svg` and `crowds-white.svg`.

## Rendered and automated proof

- At 390 x 844 CSS pixels, the authenticated map opened Visibility Controls with the existing
  Crowd Mode section and no separate Crowds dialog.
- No profile, Crowd, visibility, or account setting was changed.
- MapHome, MapVisibilitySurface, and MapControlsTutorial passed 93 focused tests.
- The production client build passed with 2077 transformed modules.
- `git diff --check` passed.

final result: passed

---

# Design QA: Populated Recently Active

## Rendered state

- Existing authenticated local map with ten viewer-authorized profiles.
- Mobile viewport: 390 x 844 CSS pixels.
- Desktop viewport: 1280 x 720 CSS pixels.
- The open unit retained its translucent black-glass container, hidden
  scrollbar chrome, existing profile tiles, map layering, and navigation.
- Desktop showed exactly five complete profile tiles before horizontal scroll.
  Mobile retained its narrower responsive tile count without overflow.

## Interaction and tests

- Opened Recently Active from its collapsed state in the real map.
- Scrolled from the first profile group to the final profile group and back.
- All ten profile controls remained present and horizontally reachable.
- Focused `MapHome` coverage passed for the ten-profile cap, five-card desktop
  width, mouse-wheel scrolling, and pointer-drag scrolling.
- The complete client suite passed 96 files and 657 tests.

final result: passed

---

# Design QA: Survey sign-in return and age-appeal dashboard

## Visual source

- User-supplied legacy Bug reports screenshots:
  `/tmp/codex-remote-attachments/01a059ff-61ed-7551-aa78-5efc21dfbc6b/bbd0e25e-744b-4d49-b6e4-0be4a9703430/1-Photo-1.jpg`
  and
  `/tmp/codex-remote-attachments/01a059ff-61ed-7551-aa78-5efc21dfbc6b/bbd0e25e-744b-4d49-b6e4-0be4a9703430/2-Photo-2.jpg`.
- Rendered local route: the existing authenticated cruush 1.6 app at
  `http://localhost:5173/`.
- Inspected viewports: 412 x 740 CSS pixels and 1280 x 720 CSS pixels.

## Verified state

- Opening `/survey` while signed out rendered the existing Sign In screen and
  did not expose the survey form.
- Signing in through that rendered screen returned directly to the survey.
- The survey remained inside the viewport at desktop and mobile sizes. Its
  existing typography, controls, navigation, and spacing were unchanged.
- Bug reports exposed an `Age suspension appeals` filter. Selecting it changed
  the total label and empty state to the filtered category on desktop and
  mobile without clipping or overlap.
- The local test account did not have moderator access to request records, so a
  populated appeal card and private evidence links could not be rendered in
  this pass. Their data mapping remains covered by focused component and route
  tests.

## Interaction and tests

- Signed out, reopened `/survey`, signed in, and observed the survey as the
  immediate destination.
- Selected the age-suspension appeal filter in the rendered Bug reports page.
- Survey and Bug reports component tests passed 7 cases.
- The focused App routing test passed.
- Support route tests passed 11 cases.
- The survey uniqueness migration test passed.
- The automatic age-suspension notification test passed.
- Client and server production builds passed.

final result: passed for the survey route and empty appeal-filter state;
populated appeal evidence remains visually unverified

---

# Design QA: Message settings timer dropdown

## Visual source

- User rejection reference: `/var/folders/cs/ckc4b_8j28x6gttwjkpcyk4c0000gn/T/TemporaryItems/NSIRD_screencaptureui_59RNwC/Screenshot 2026-08-21 at 3.15.24 AM.png`
- Existing cruush dropdown reference: `/tmp/cruush-existing-message-dropdown-mobile.png`
- Implemented desktop state: `/tmp/cruush-message-settings-dropdown-desktop.png`
- Implemented mobile state: `/tmp/cruush-message-settings-dropdown-mobile.png`
- Side-by-side comparison: `/tmp/cruush-message-dropdown-comparison.png`

## Verified state

- Authenticated seeded conversation with `jay`.
- Conversation settings open and disappearing-timer menu expanded.
- Selected option: `1 hour`.
- Desktop viewport: 1280 x 720 CSS pixels.
- Mobile viewport: 390 x 844 CSS pixels.
- Mobile document width remained 390 CSS pixels with no horizontal overflow.

## Fidelity review

- Typography matches the existing cruush serif menu treatment.
- Trigger and menu use the established rounded dark-glass surfaces.
- Selected and focused options use the existing subdued primary tint instead of the operating system's blue native-select highlight.
- Option spacing, checkmark placement, borders, shadow, and blur match the existing message-composer dropdown.
- The settings variant remains full width for clarity while preserving the same component language.
- The menu remains inside the viewport and does not overlap the header, bug-report control, composer, or bottom navigation.

## Interaction and tests

- Opened the menu and selected an option in the rendered route.
- The local API rejected persistence with the existing `Request origin is not allowed.` environment message. Component behavior remains covered by the focused test.
- `src/app/components/PrivateGroupChat.test.tsx`: 28 tests passed.
- `git diff --check`: passed.

## Result

Passed for the requested visual change. No actionable P0, P1, or P2 visual mismatch found. No commit or deployment performed.

---

# Design QA: 1.6 map Pulse and Dark Room controls

## Visual source

- Source implementation: `/Volumes/good/Cruushv2-visual/src/app/components/MapHome.tsx`, served by the localhost:5195 Vite process from commit `d3edc20`.
- Target implementation: `src/app/components/MapHome.tsx`, `src/app/components/MapPingSheet.tsx`, `src/app/components/MapView.tsx`, and `src/app/components/DarkRoomMark.tsx`.
- Rendered target state: authenticated local map at 644 x 938 CSS pixels with Dark Room active.

## Fidelity review

- The map Pulse control uses the exact localhost:5195 button treatment: full-size existing `PulseLedIcon`, solid map-control background, ping-green inactive and active color, and active halo.
- Rendered Pulse control measured 48 x 48 CSS pixels; its SVG measured 46 x 46 CSS pixels. Rendered color was `rgb(200, 255, 49)` and background was `rgb(8, 8, 8)`.
- The active Dark Room navigation glyph keeps the approved chapel housing and now matches the adjacent controls' apparent footprint.
- The current user's Dark Room heart keeps its prior heart shape, size, and border. Only the exact black keyhole and shared eye geometry are added; the eye uses the same three-stop Dark Room gradient as the navigation icon.
- No P0, P1, or P2 visual mismatch was found in the inspected rendered target state.

## Interaction and tests

- Pulse remains a fitted bottom sheet on mobile.
- Desktop Pulse opens at a stable stored position below the top navigation, moves from its header, resizes from its lower-right grip, and clamps above the bottom navigation.
- `src/app/components/MapPingSheet.test.tsx`: 8 tests passed.
- Focused `src/app/components/MapHome.test.tsx`: 2 tests passed; 69 skipped.
- Focused `src/app/components/MapView.test.tsx`: 1 test passed; 54 skipped.
- Client production build passed with one pre-existing duplicate `strokeOpacity` warning outside this scope.

## Result

final result: passed

---

# Design QA: Supplied Ghost Mode asset

## Visual source

- Exact user-supplied asset: `/Volumes/good/ghost-blue.svg`
- Active asset: `src/app/assets/ui-icons/ghost-colored.svg`
- Shared renderer: `GhostColoredIcon` in `src/app/components/CruushIconImage.tsx`
- Fly-out consumer: `GhostRotationFlyIcon` in `src/app/components/MapView.tsx`

## Source and build evidence

- The active asset contains the supplied silhouette, view box, path, and
  four-stop vertical gradient. Its only byte difference from the supplied file
  is a final newline.
- Both the active top-navigation state and the fly-out call the same
  `GhostColoredIcon`, so no second approximation remains in source.
- `git diff --check` passed.
- The client production build passed after the asset replacement.

## Blocker

- The existing Vite process at `127.0.0.1:5173` is the correct 1.6 worktree.
- No API process is listening at the configured `127.0.0.1:3016` target.
- `/health` and `/api/auth/me` through Vite both return `500 Internal Server Error`.
- The active authenticated Ghost state and timed fly-out cannot be rendered or
  compared while the API is unavailable. The task contract forbids starting,
  restarting, stopping, killing, or replacing a development server without an
  explicit process instruction.

final result: blocked

---

# Design QA: Signup agreements

## Rendered state

- Local signup rendered from the existing cruush 1.6 app at `http://127.0.0.1:5173/`.
- Required Terms of Service and Privacy Policy checkboxes sit directly below Confirm Password.
- The optional cruush product-updates checkbox follows the legal agreements in the same compact panel.
- Terms of Service and Privacy Policy remain direct links.

## Interaction and tests

- Required legal checkboxes start unchecked and both accept checked state in the rendered form.
- Product updates starts unchecked and remains optional.
- Signup is blocked until both legal agreements are accepted.
- `src/app/components/Auth.test.tsx`: 18 tests passed.
- `git diff --check`: passed.
- No account was created. No commit, push, or deployment was performed.

final result: passed

---

# Design QA: Map globe scale and Ghost Mode icon

## Visual source

- Oversized-globe reference: `/var/folders/cs/ckc4b_8j28x6gttwjkpcyk4c0000gn/T/TemporaryItems/NSIRD_screencaptureui_omRQVW/Screenshot 2026-08-28 at 7.17.39 PM.png`
- Exact Ghost Mode fly-out source: `/tmp/cruush-ghost-rotation-fly-icon.svg`
- Rendered authenticated map: `/tmp/cruush-1.6-map-globe-ghost-after.png`
- Before-and-after map comparison: `/tmp/cruush-map-globe-before-after.png`

## Verified state

- Authenticated seeded 1.6 map at 834 x 938 CSS pixels.
- Map globe reduced from a 57.6 px visible footprint to a balanced 48 px canvas.
- Active Ghost Mode top-navigation glyph uses the exact fly-out silhouette and six-stop electric-blue fade.
- Both changes hot-reloaded in the existing local app without altering navigation behavior.

## Fidelity review

- The globe no longer dominates the Feed, cruush, Messages, and Profile glyphs.
- The Ghost Mode glyph matches the fly-out path, view box, color stops, and opacity stops.
- No resting gray icon circle appears in the top or bottom navigation.
- No P0, P1, or P2 visual mismatch was found in the inspected rendered state.

## Interaction and tests

- `src/app/components/MapHome.test.tsx`: changed Ghost Mode asset assertion passed.
- `src/app/components/BottomNav.test.tsx`: 17 tests passed.
- Ghost Mode SVG parsed successfully with `xmllint`.
- `git diff --check`: passed.
- No commit, push, or deployment performed.

final result: passed

---

# Design QA: Mobile top navigation

## Rendered state

- Authenticated 1.6 map rendered at 390 x 844 CSS pixels.
- The top navigation had no resting grey circle behind its visible icon buttons.

## Interaction

- Map Controls opened and closed from the mobile map.
- Settings opened from the top navigation and Back returned directly to the map.
- No profile, visibility, or account setting was changed.

final result: passed

---

# Design QA: Message composer submission

## Rendered state

- The authenticated seeded direct-message thread rendered at desktop and 390 x 844.
- Pressing Send moved the text into one message bubble and left the composer empty.
- The existing composer and bottom-navigation placement stayed unchanged.

## Interaction and tests

- Duplicate clicks remain blocked while the first text request is in flight.
- A failed request restores the submitted draft only when no replacement draft exists.
- All 29 `PrivateGroupChat` tests passed.
- The production client build passed with 2077 transformed modules.
- Both temporary local verification messages were deleted afterward.

final result: passed
