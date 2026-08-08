# DL Mode and messaging repair plan

Branch: `fix/dl-mode-coverage-and-chat`. Written 2026-08-05 from a six-area code audit
(45 findings). Every claim below cites the file it came from. Confidence is marked where
it is not `high`.

The headline number: **DL Mode covers 10 of 26 live user-image surfaces.** Sixteen render
user-supplied photos without consulting DL Mode at all.

---

## 0. Rules

These are not preferences. Every step below is checked against them, and any future change
to an image surface has to satisfy them.

### R1 — Fail closed, always

Unknown explicit status means masked. Never the reverse.

Every current default does the opposite:

- `HeartPhoto`'s `masked` prop defaults to `false`, and 11 of its 14 call sites omit it.
- `coalesce(<explicit subquery>, false)` in `users.ts:574` turns "no classification row"
  into "safe".
- `usersApi.ts` maps `photoExplicit: profile.photoExplicit === true`, so `undefined`
  becomes `false`.

Each of these is a place where *missing data reads as safe*. Invert all of them.

Corollary: the `masked` prop must become **required**, not optional-with-default. A missing
prop has to be a type error, because a forgotten prop is currently an unmask.

### R2 — One masking mechanism per surface

Two mechanisms exist today and they cancel each other on the map: `MapHome` replaces the
photo with `null`, and `MapView` overlays a gradient gated on `hasPhoto`. The replace runs
first, so the overlay is unreachable dead code.

Pick **replace, not overlay**, everywhere:

- Overlay leaks. The `MapView` overlay renders at `opacity: 0.96` — it would show **4% of
  the explicit image** if it ever ran.
- Replace means the explicit URL is never put in `src`, which is a prerequisite for R3.

So: `HeartPhoto`'s `showPhoto = photo && !masked` is the correct pattern. Delete the
overlay path in `MapView` rather than repairing it.

### R3 — Masking must prevent the fetch, not just the paint

DL Mode is currently cosmetic: explicit bytes are fetched, cached, and sit in devtools and
the browser cache regardless of the setting. Anyone who turns DL Mode on to avoid explicit
imagery on their screen still has it on their disk.

A masked surface must never construct the image URL. `resolveMediaUrl(photo)` must not be
called when `masked` is true — check `HeartPhoto` does this before the `<img>`/`<image>`
is built, not just conditionally render the element.

Out of scope for this pass, note for later: the server could refuse to serve explicit media
to a client that has DL Mode on, but DL Mode is a client-local setting today and making it
server-known is a bigger change. Record the limitation, do not silently imply it is solved.

### R4 — Every image surface declares its explicit status

A surface may not render a user-supplied image unless its data carries an explicit flag.
If the flag is unavailable, the surface renders masked (R1), and the missing flag is a
server bug to be fixed, not a client workaround.

### R5 — No new surface without a test

Each surface fixed gets a test asserting: DL Mode on + explicit ⇒ no image element and no
image URL anywhere in the rendered output. Asserting "the gradient is present" is not
sufficient — assert the **absence of the URL**.

### R6 — SQL must be executed by Postgres in tests, not stubbed

Three separate high-confidence findings say the same thing: the entire test suite stubs
`app.db.query`, so no SQL is ever parsed. This is why a route that **always 500s** shipped
(see §6.3). Any fix touching SQL needs at least one test that runs it against a real
Postgres.

---

## 1. Surface inventory

26 surfaces render user-supplied images. Current state:

| # | Surface | File | Masks? | Flag available? |
|---|---|---|---|---|
| 1 | Discovery map pins | `MapView.tsx` | yes (accidentally, via null-photo) | yes |
| 2 | Mutual-cruush map pins | `MapView.tsx` via `/api/cruush/mutual-map` | **no** | **no** |
| 3 | Map profile popup | `MapProfilePopup.tsx` | partial | partial |
| 4 | Local feed author avatars | `LocalFeed.tsx` | yes | yes |
| 5 | Cruise carousel | `CruiseCarouselSlot.tsx` | yes | yes |
| 6 | Recently-active tray | map tray | yes | yes |
| 7 | Profile view | `ProfileView.tsx` | yes | yes |
| 8 | **Profile editor** | `ProfileEdit.tsx` | **no** | **yes — pure wiring gap** |
| 9–12 | cruush activity: received, sent, mutuals, message picker | `CruushActivity.tsx` | **no** | **no** |
| 13 | Conversation list avatars | `DirectMessages.tsx` | **no** | **no** |
| 14 | Chat header avatar | `PrivateGroupChat.tsx` | **no** | **no** |
| 15 | Per-message sender avatars | `PrivateGroupChat.tsx` | **no** | **no** |
| 16 | **Chat photo attachments** | `PrivateGroupChat.tsx` | **no** | yes (partly — see §3) |
| 17 | Member/mutual pickers | messaging | **no** | **no** |
| 18 | Blocked users list | `BlockedUsersPage.tsx` | **no** | **no** |
| 19 | Privacy audit viewers | `PrivacyAudit.tsx` | **no** | **no** |
| 20 | Moderator review | `ModeratorReview.tsx` | **no** | n/a (see edge case E7) |
| 21 | Event attendees | event detail | **no** | **no** |
| 22 | Favorites gallery | favorites | yes | yes |
| 23 | Quick-access gallery | chat composer | yes | yes |
| 24 | Legacy discovery fallback | `users.ts` legacy query | **no** | **no** |
| 25 | `HeartPin.tsx` | unused duplicate | **no** | n/a |
| 26 | Onboarding preview | `OnboardingPreview.tsx` | inherits | inherits |

---

## 2. Phase A — invariants first

Nothing else lands until these do, because every later step depends on the defaults being
safe.

### A1. Make `masked` required and fail-closed

`src/app/components/HeartPhoto.tsx`:
- Change `masked?: boolean` → `masked: boolean`. Remove the `= false` default.
- Move the `resolveMediaUrl` call behind the mask check (R3).
- Fix all 14 call sites. Any site without a real flag passes `masked` — see R4.

This will produce type errors at every unmasked call site. That is the point: the compiler
becomes the coverage checklist.

### A2. Delete the dead overlay

`src/app/components/MapView.tsx`:
- Delete `showExplicitGradientOverlay` and the `marker-explicit-overlay` path.
- Keep `data-testid` naming for the masked state on whatever replaces it, so tests can
  target it.

### A3. Delete `HeartPin.tsx`

Unused unmasked duplicate of `HeartPhoto`. It has no importers; it exists only to be
accidentally adopted later. Remove it. If something does import it, migrate to
`HeartPhoto`.

### A4. Invert the server defaults

`server/src/routes/users.ts:574` — `coalesce(..., false)` → `coalesce(..., true)`.

**Edge case E1:** this makes every unclassified photo mask, including legitimately safe
ones and legacy rows (see §3.3). Expect a visible jump in masked content the moment this
lands. That is correct behaviour under R1, but it must ship *together* with §3.3's
backfill or the app will look broken. Do not ship A4 alone.

---

## 3. Phase B — classification correctness

The flag itself is wrong in four ways. Masking correctly on a wrong flag achieves nothing.

### B1. Message photos are never nudity-classified

Only profile photos get `DetectModerationLabels`. `message_photo` rows are written
`non_explicit` structurally, almost always.

Fix: run the same classifier on the `message_photo` upload path.

**Edge case E2:** this adds a Rekognition call to every photo send. Check the latency
budget on the send path — if it pushes send over the acceptable time, classify
asynchronously and treat `pending` as explicit (R1) until it resolves.

### B2. The alpha-test bypass discards labels

The upload bypass throws away all provider labels, forcing `non_explicit`.

Fix: preserve labels through the bypass. The bypass should skip *blocking*, not skip
*classification*.

### B3. `explicit_classification` is write-once

No moderator override, no re-classification job, no backfill. A misclassification is
permanent and unfixable.

Fix: add a re-classification entry point. At minimum a moderator override column, so a
human can correct a wrong call. Needs SQL migration — **next free number is 063** (061 and
062 are taken by the ghost-rotation work on this branch).

### B4. Migration 037 mislabeled all legacy photos

Every pre-existing approved photo was written `non_explicit` at migration time. All legacy
imagery is invisible to DL Mode.

Fix: a backfill job that re-classifies legacy rows. Must ship with A4 (see E1).

**Edge case E3:** the backfill is a bulk Rekognition spend. Batch it, make it resumable,
and log a count of reclassified rows. Do not run it inline in a migration.

---

## 4. Phase C — the map

### C1. Add the explicit flag to `/api/cruush/mutual-map`

This is the defect the user can actually see. `server/src/routes/cruush.ts` has no
reference to `explicit` at all.

- Server: add the first-photo lateral join. Copy the pattern from `users.ts:564-574`, or
  reuse `profilePhotoMetadataSelect` from `profiles.ts:267-283`.
- Carry it on `MutualCruushRow`.
- `src/app/lib/cruushApi.ts`: map it through.
- `src/app/components/MapHome.tsx`: the `DiscoveryUser` adapter currently **drops**
  `photoExplicit` — restore it.

### C2. Remove `getDlModeSafeMarkerPhoto`

Per R2 the replace strategy wins, but it must live in **one** place. Today `MapHome` nulls
the photo, which also destroys the per-profile identity gradient — every masked pin looks
identical because `getProfileGradientStops` is skipped when there is no photo.

Fix: keep the photo on the marker, pass `photoExplicit` and DL Mode state into
`MarkerHeart`, and let it decide. `hasPhoto` goes back to meaning "has a photo" and stops
doubling as the masking signal.

**Edge case E4:** `hasPhoto` is overloaded — it currently drives (a) gradient identity,
(b) the `data-has-photo` attribute, and (c) masking. Separating these is the actual work;
check each of the three consumers after the change.

### C3. `MapProfilePopup` fail-closed while loading

It paints the photo it already has before `photo_metadata` arrives, and permanently for
demo profiles. Confidence: medium.

Fix: default `explicit: true` while `profileLoading`, per R1.

### C4. Legacy discovery fallback

The schema-compatibility fallback query returns photos with no flag, silently disabling
DL Mode across map, tray, cards, and carousel. Confidence: medium.

Fix: either add the flag to the fallback query, or have the fallback mark everything
masked. Prefer the latter — a fallback path is by definition already degraded.

---

## 5. Phase D — messaging surfaces

All of these need server work first; they cannot be fixed client-side.

### D1. Expose an explicit flag on message participants

Conversation list, chat header, per-message sender, member/mutual pickers. The messages
API returns no explicit flag for any avatar.

### D2. Chat photo attachments

`PrivateGroupChat` never imports `dlMode`. The flag partly exists (the send statement
selects `explicit`), but see §6.1 — it comes back wrong.

### D3. cruush activity — 4 surfaces

`CruushActivity.tsx` never imports `dlMode`, and no flag is served.

### D4. Blocked users, privacy audit, event attendees

Same shape: no flag served, no masking.

### D5. Profile editor

The only one that is **pure client wiring** — the explicit metadata is already in the
payload the component holds. Cheapest win in this phase; do it first.

**Edge case E5:** `PUT /api/profiles/me` returns a profile with **no** `photo_metadata`,
and the client fallback marks everything safe — so **saving your profile unmasks all your
own photos** until a refetch. Fix the response to include the metadata, and make the
fallback mask (R1).

---

## 6. Phase E — the three chat bugs

### 6.1 Photos do not appear until refresh

The existing diagnosis doc (`main-photo-message-immediate-render-backport-2026-08-05.md`)
is **wrong for this branch** — it patches `server/src/message-photo-send.ts` and
`sendApprovedPhotoMessage()`, neither of which exists here. Do not follow it.

Actual defect: `attachments[0].url` comes back **NULL**. The send statement `UPDATE`s
`media_objects.public_url` in a data-modifying CTE and then reads it back in the same
statement — which sees the **pre-update snapshot**. `attachments` is present; the URL
inside it is null.

The same statement returns `explicit: false` for genuinely explicit photos, so the
just-sent message is also unmasked until refresh.

Fix: read the URL after the update completes, not in the same statement's snapshot.

**Edge case E6:** the identical stale read exists in the favorite-message-image upload
route, where a fallback in the mapper silently papers over it. That is why favorites
appear to work and message photos do not. Fix both; do not rely on the fallback.

### 6.2 The "once" toggle does nothing

The toggle is **state-only with no action wired to it**. It never opens the file picker,
and the main Send button ignores `photoViewOnce` entirely. Toggling "once" and pressing
send does nothing at all — exactly as reported.

Fix:
- Wire the toggle to open the file picker, or make Send honour it.
- Clear `photoViewOnce` on the text-send path — it currently persists across messages and
  can silently mark a **later, unrelated** photo as view-once.
- The sender's own bubble renders as an unopened "Open view-once photo" button instead of
  the photo they just sent. Senders should see what they sent.

**Edge case E8:** with DL Mode on, opening an explicit view-once photo **spends the single
view on a gradient** — the photo is consumed and can never be seen. Either block opening
view-once photos while DL Mode is on with an explanatory message, or do not count a masked
open against the allowance. Confidence: medium.

**Edge case E9:** the "once" pill's text relies on implicit label-to-button forwarding
rather than an explicit handler, so tapping the word may not toggle. Add an explicit
handler and a test. Confidence: low.

### 6.3 The disappearing timer does nothing

`PATCH /api/conversations/:conversationId/disappearing-timer` sends SQL that **PostgreSQL
refuses to parse** — a `$1` parameter collision. The route always 500s. The timer is never
written. This is why nothing happens.

The same collision breaks:
- `PATCH /api/conversations/groups/:conversationId` (group rename + timer)
- `POST /api/conversations/:conversationId/clear-for-everyone`

Fix the parameter numbering in all three.

Then, separately: **expiry is never enforced.** It is a read-time filter only. Nothing
deletes expired messages, their ciphertext, or their media. "Disappearing" messages persist
in the database indefinitely. Add a sweeper.

**Edge case E10:** changing the timer only affects messages sent *afterwards*. Already-sent
messages keep the `expires_at` they were stamped with, including `NULL`. The UI gives no
indication. Either say so in the UI or restamp on change — decide deliberately.

**Edge case E11:** the client never re-evaluates expiry while a chat is open, so an expired
message stays on screen until a refetch. Add a client-side timer.

---

## 7. Testing

### T1. Real Postgres for SQL

R6. Three findings independently concluded the suite cannot catch these bugs because
`app.db.query` is stubbed everywhere. A route that always 500s passed CI.

Stand up a real Postgres (testcontainer or pglite) for the routes touched here. At minimum:
the three timer routes, the photo send statement, and the explicit-flag joins.

### T2. Per-surface masking tests

Per R5, for each of the 26 surfaces: DL Mode on + explicit ⇒ assert **no image URL** in the
output. Not "a gradient exists".

### T3. The e2e the user asked for

Full-stack: seed a profile with a known-explicit photo, load the map with DL Mode off,
assert the photo renders; toggle DL Mode on, assert the pin renders a gradient and the
explicit URL is absent from the DOM. Screenshot both states.

**Note:** seeded profiles use `createSeedPhoto`, which returns a `data:image/svg+xml`
placeholder, not a photograph. The e2e needs a real uploaded-and-classified photo, or a
fixture that inserts a `media_objects` row with `explicit_classification = 'explicit'`
directly. The latter is faster and sufficient — it tests the masking pipeline, which is
what is broken.

---

## 8. Ordering

Strict. Later steps depend on earlier ones.

1. **A1–A3** — fail-closed invariants, dead code removal. Compiler now lists every gap.
2. **B4 backfill + A4** — ship together (E1).
3. **C1–C2** — the visible map bug.
4. **6.3** — timer SQL, one-line class of fix, currently 500s.
5. **6.1** — photo render stale read.
6. **6.2** — view-once wiring.
7. **D5** — profile editor, cheapest surface.
8. **D1–D4** — messaging and activity surfaces, server flag first.
9. **C3, C4** — fallback paths.
10. **B1–B3** — classification correctness and re-classification.
11. **T1–T3** — tests alongside each, not at the end.

---

## 9. Known limits to state, not hide

- DL Mode remains client-local and cosmetic with respect to the network: bytes are fetched
  unless R3 is enforced, and even then the server does not know the setting.
- The DL Mode settings screen currently claims it covers "messages and favorites" only.
  That text is wrong in both directions — it understates existing map/profile/feed coverage
  and hides the gaps. Rewrite it once coverage is actually known, and not before.
