# Handoff: Mile High Club

Mile High Club is the feature. This historical handoff retains legacy `travel` names only where
they are existing branch names, filenames, routes, database fields, or code identifiers. There is
no separate Mile High Club product feature.

Worktree: `/Volumes/good/Cruushv2-carousel-photo-gallery-20260820`
Branch: `codex/carousel-photo-gallery-20260820`
Mile High Club commits: `6185039` (the feature) and `1514ed0` (the browse radius it exists to lift)
Task contract: `AI_TASK.json`, status `active`

**Read this first: nothing on this branch is on `origin/main` and nothing is deployed.**
`origin/main` is `b4621d5`; this branch is 12 commits ahead of it and has not been rebased.
The root `HANDOFF.md` describes a different branch (`feat/free-feed-board`) and does not
apply here.

**There is no staging environment.** `pnpm ship` pushes to `main` and deploys; main is the
deploy target. A second environment does not exist in this repo (no `vercel.json`,
`render.yaml`, or `fly.toml`; the only workflow is `regression-gates.yml`).

**There is one known gap that must be closed before this ships. See "Blocking" below.**

---

## What Mile High Club is

A member visiting another place drops a pin where they are. The map shows them at that pin
instead of at their device location, and discovery serves them the area around that pin.

The pin holds for three hours before it can be moved again. That wait is the whole point: a
pin that can be dragged freely is a scammer's tool, so the cooldown is enforced at the
database boundary rather than in the interface.

## Decisions this implements

Taken from the session on 2026-08-22. Where a later instruction replaced an earlier one, the
later one is what is built and the earlier one is noted so nobody reinstates it.

- **Browse radius is 50 miles from your own location.** Not from the city centre. An earlier
  version of this rule measured from the NYC centre and was removed before it shipped.
- **Mile High Club is how you look further than 50 miles.** It works by moving where you are, so
  the same single rule covers both the local case and the travelling case. There is no second
  gate.
- **The service area is 100 miles around New York.** That is who may join and be on the map,
  and it is a separate number from the browse radius.
- **Pulse is refused while travelling.** A Pulse from a dropped pin would call people to a
  place its sender is not standing in.
- **Ghost Mode keeps working while travelling** and fuzzes the travel pin exactly the way it
  fuzzes a home location.
- **Kelpie Mode is meant to be refused while travelling.** A borrowed location plus an unseen
  viewer is the combination to deny. This is stated in the interface copy but is not enforced,
  because Kelpie Mode does not exist yet.

## Files

### `server/sql/097_travel_pins.sql` (new)

`user_travel_pins`, one row per member: `user_id` primary key, `latitude`, `longitude`,
`label`, `set_at`, `updated_at`, with range checks on the coordinates and an index on
`set_at desc`. Registered in `server/src/migrate.ts`. **This migration has not been run
against any deployed database.**

Mile High Club being on is the existence of a row. There is no boolean.

### `server/src/travel-pins.ts` (new, 120 lines)

- `TRAVEL_PIN_MOVE_COOLDOWN_MS` is three hours.
- `getTravelPin` / `loadTravelPins` read one or many. Both return a `movableAtMs` derived from
  `set_at`, so the interface never computes the cooldown itself.
- `setTravelPin` reads the existing pin first and throws `TravelPinCooldownError` when the
  cooldown has not elapsed. The error carries `movableAtMs`.
- `clearTravelPin` deletes. **Turning Mile High Club off is always allowed**; only moving a pin
  waits. Somebody who lands and wants their real location back should never be held for three
  hours.

### `server/src/routes/privacy.ts`

`GET`, `PUT`, and `DELETE` on `/api/privacy/travel`. The `PUT` catches
`TravelPinCooldownError` and returns `409` with code `TRAVEL_PIN_COOLDOWN` and `movableAtMs`.
Label is trimmed and capped at `TRAVEL_LABEL_MAX_LENGTH` (60).

### `server/src/routes/users.ts`

Two changes, and the ordering between them matters.

1. Travel pins are loaded for the viewer and every candidate, then written over
   `encryptedLocations` before anything else reads it. From that point on, a traveller's
   location *is* their pin, everywhere in the request: the visibility check, the distance
   label, the Pulse radius check, and the viewer's own position.

2. The browse radius gate (`DISCOVERY_BROWSE_RADIUS_MILES = 50`) compares the requested map
   centre against `viewerCoordinates`, which by then is already the travel pin when the viewer
   is travelling. **This is why Mile High Club needs no gate of its own.** Do not add one.

   When the centre is further out, the route returns an empty `profiles` array plus
   `browseRadiusMiles` and `outsideBrowseRadius: true`.

### `server/src/map-pings.ts`

`createMapPing` refuses with `403 FEATURE_RESTRICTED` when the sender has a travel pin:
"Pulse is unavailable in Mile High Club. Turn off Mile High Club to send one."

### `server/src/routes/profiles.ts`

`loadProfileData` attaches `travelling: true` and `travelLabel` when a pin exists. The lookup
is wrapped in `.catch(() => null)` so a profile still loads if the table is missing, which
matters for any environment where migration 097 has not run.

### `src/app/components/TravelModeSettings.tsx` (new, route `/settings/travel`)

Its own page, reached from Settings under a `Plane` icon. Turning it on opens
`TRAVEL_MODE_TERMS` first: six lines stating what Mile High Club does and does not allow, then a
label field and the drop control. Julien asked for this explicitly. **Do not collapse it into
a bare toggle.**

While on, the page shows the label and either "Your pin can be moved now" or a countdown.

### `src/app/components/ProfileView.tsx` and `BadgeGlyphs.tsx`

`TravelPinGlyph`, a plane over a dropped pin, renders beside the age when `travelling` is
true, with the label in its title. The name and age moved into a flex row to make space; the
name still truncates and the glyph never shrinks.

### `server/src/dev-seed-profiles.ts`

Seeded profile index 2 gets a pin in the West Village labelled "In from Chicago". Every other
seeded profile has its pin deleted, so reseeding does not leave stale travellers behind.

---

## Blocking

**The client ignores `outsideBrowseRadius`.** `1514ed0` made discovery return an empty list
when the map is pointed more than 50 miles from the viewer, and nothing on the client reads
that flag. Today, panning far enough shows an empty map with no explanation instead of an
invitation to turn Mile High Club on. This is the first thing to fix and it is a regression
introduced by that commit, not a pre-existing gap.

The response already carries what the interface needs: `browseRadiusMiles` and
`outsideBrowseRadius`.

## Also not done

- **Kelpie Mode is not enforced while travelling.** The copy promises it. Kelpie Mode itself
  does not exist; the existing gate still says "Lurker". Either build the mode and the
  restriction together, or cut that line from `TRAVEL_MODE_TERMS` until it is true.
- **A traveller's distance should read "Far far away"** on approximate labels, their miles if
  they have set precise, and never a city or country name. Nothing renders this yet, and the
  wider distance label work it belongs to is also unbuilt.
- **No way to hide from travellers on vibe search.** Asked for, not designed.
- **The travel pin is not marked on the map**, only on the profile. A pin that reads as normal
  presence on the map but travelling on the profile is inconsistent.
- **No admin view of travel pins.** Worth having before this is public, because a cooldown is
  only as good as the ability to see who is working around it.

## Verification status

Honest accounting, since none of this has been through a deploy.

Passing: `server/src/app.test.ts` (297), `server/src/beta-access.test.ts`,
`src/app/components/Settings.test.tsx`, `src/app/components/ProfileView.test.tsx`,
`src/app/components/MapView.test.tsx`, `src/app/components/MapHome.test.tsx`. Client build
clean, server typecheck clean.

**No test covers Mile High Club itself.** No test for the three hour cooldown, the Pulse refusal,
the discovery override, or the browse radius gate. For a feature whose entire safety argument
is "the cooldown is enforced at the database boundary", that gap should be closed before it
ships. Three tests would cover it: cooldown rejects an early move, clearing is always allowed,
and a travelling viewer's discovery centre is their pin.

**Never exercised against a real database.** Migration 097 has not run anywhere. The pin flow
has not been clicked through in a browser: the settings page was built and compiled but not
rendered, because the preview pane's map would not load tiles during the session.

## Environment

No environment variables were added, removed, or changed.

Two migrations are pending on this branch and both must run before the server starts:
`096_notification_quiet_hours.sql` (from the notifications work) and `097_travel_pins.sql`.
