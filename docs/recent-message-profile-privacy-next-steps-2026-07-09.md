# Recent Message, Profile, and Privacy Updates

Date: 2026-07-09

## Recent Commits

- `0355098` is the current `main` baseline for the latest crowd, profile, and message work.
- `f2b3a6b` documented crowd visibility bank-readiness details.
- `9bfe083` refined crowd visibility and message permission behavior.
- `aa71d23` made the auth legal links discreet instead of showing full forms on sign-in.
- The next commit improves blocked-message recovery, profile navigation, and discoverability for precise-location privacy controls.

## This Commit

- DM chat has an `Open profile` path, so a user is not trapped in a stale or blocked message thread.
- `MUTUAL_CRUUSH_REQUIRED` send failures now explain that a mutual cruush is needed and point the user back to the profile to send a cruush first.
- Map profile previews include `View profile`.
- Profile cards stop trying to open messages when `canMessage` is false and show `Mutuals only`.
- Settings includes `Privacy -> Location privacy`, which links to the existing Ghost Mode page with the mutual precise-location sharing control.

## Next Steps

- Deploy staging from `main`.
- Smoke-test `julienlenaz96@gmail.com` message sending on staging with API logs open.
- Confirm non-mutual DMs show the controlled mutual-cruush message instead of a 500.
- Confirm profile previews route to full profiles from map and chat surfaces.
- Confirm the Settings location privacy route controls mutual precise-location sharing.
- Do not create fake messages or profile data on bank or reviewer accounts.
