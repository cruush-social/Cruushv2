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
