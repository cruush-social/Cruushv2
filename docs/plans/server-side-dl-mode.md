# Server-side DL Mode

**Plan only. No code has been written.**
Version 1.0 · 2026-08-06

---

## The problem

DL Mode is entirely client-side. `src/app/lib/dlMode.ts` reads and writes
`localStorage`; the server has never heard of it. Every discovery and profile
endpoint therefore returns the explicit photo URL to every viewer, and the client
merely declines to *render* it (`MapView.tsx:964`, `MapHome.tsx:2074`).

Two consequences:

1. **The URL is in the browser.** It sits in the network response and in React
   props. Anyone who opens devtools can read and open it. The comment at
   `MapView.tsx:958` states the intent — "Never resolve or attach an explicit
   URL" — but the current architecture cannot honour it.
2. **The control is bypassable.** DL Mode is a `localStorage` value. Any user can
   set it to `false` in the console and receive unmasked photos, because nothing
   server-side is enforcing anything.

Moving enforcement to the server fixes both. The client toggle becomes a
*preference the server obeys* rather than the only thing standing between a
viewer and the image.

## What is already correct, and must not regress

Missing or unclassified photo data already resolves to "explicit" at every layer.
This is fail-closed and stays exactly as it is:

| Layer | Rule | Location |
| --- | --- | --- |
| SQL classification | `explicit_classification is distinct from 'non_explicit'` — anything not *proven* clean counts as explicit | `cruush.ts:354` |
| SQL null-handling | `coalesce(…, true)` — no media row at all counts as explicit | `cruush.ts:361` |
| Client | `explicit === false ? false : true` — unknown counts as explicit | `MapHome.tsx:216`, `:1326`, `:1372` |
| DL Mode default | `storedValue === null ? true` — DL Mode is **on** for new users | `dlMode.ts:8-16` |

The recent refactor that centralised masking into `shouldMaskPhoto` and moved it
to render time is a genuine improvement and should be kept — this plan changes
*where the URL is withheld*, not how explicitness is decided.

## Design decision: mask in SQL, not in the response mapper

Photos are mapped into responses at nine call sites in `cruush.ts` alone
(`:214`, `:230`, `:250`, `:431`, `:530`, `:590`, `:667`, `:698`, `:730`) plus
`/api/users` in `users.ts`. Masking at each site means ten places to keep in
step, and the failure mode of missing one is silent: a leaked URL nobody notices
until someone reads a network log.

**Mask in the SQL projection instead**, with the viewer's DL Mode passed as a
bound parameter:

```sql
case
  when $dlMode and <explicit-expression> then null
  else profiles.photos
end as photos
```

The URL then never enters the result set, so it cannot be forwarded by a mapper
that forgot. The explicit *flag* is still returned, because the client needs it
to render the masked treatment.

This is the same reasoning the spec applies to `backdrop-filter`: withhold the
thing structurally rather than relying on every consumer to behave.

## Steps

### 1. Migration — `server/sql/065_dl_mode_server_side.sql`

The latest migration is `064_feed_post_media_attachments.sql`, so the next free
number is **065**. Per R15, never edit an existing migration.

```sql
alter table user_privacy_settings
  add column if not exists dl_mode_enabled boolean not null default true;
```

`default true` is deliberate and matches the client's current default. Every
existing row backfills to DL Mode **on**, which is the fail-closed direction: an
account that has never expressed a preference gets masking, not exposure.

### 2. API — `GET` / `PUT /api/privacy/dl-mode`

Mirror the existing map-presence endpoints in `server/src/routes/privacy.ts`
(`:242` and `:261`), which already establish the pattern — read from
`user_privacy_settings`, upsert with `on conflict (user_id) do update`, return
the normalised value.

- `GET` returns `{ data: { enabled: boolean } }`, defaulting to `true` when no
  row exists.
- `PUT` takes `{ enabled: boolean }`, upserts, returns the stored value.
- `PUT` uses `getActiveAccountUserId` (as map-presence does), not
  `getAuthenticatedUserId`, so a suspended account cannot change it.

### 3. Thread the viewer's DL Mode into the queries

Every endpoint that returns another user's photo must load the *viewer's*
`dl_mode_enabled` and bind it into the projection above. Affected:

| Endpoint | File |
| --- | --- |
| `GET /api/users` (map discovery) | `server/src/routes/users.ts:921` |
| `GET /api/cruush/mutual-map` | `server/src/routes/cruush.ts:804` |
| `GET /api/cruush/me` | `server/src/routes/cruush.ts:756` |
| `GET /api/cruush/:userId` | `server/src/routes/cruush.ts:847` |
| Profile reads that return `photos` | `server/src/routes/profiles.ts` |

**The viewer's own photos are never masked.** DL Mode hides other people's
explicit photos from you; it does not hide your own from yourself. Any query
returning the current user's profile must exempt `profiles.id = $viewerId`.

Read the setting once per request and pass it down, rather than issuing a lookup
per endpoint.

### 4. Client — server becomes authoritative

`src/app/lib/dlMode.ts` keeps `localStorage`, but only as a paint-time cache:

- On load, read `localStorage` for instant first paint (avoids a flash of the
  wrong state), then fetch the server value and reconcile.
- **The server value always wins.** If they disagree, overwrite local.
- `setDlModeEnabled` writes to the server via `PUT`, and updates local only on
  success. A failed write must not leave the UI claiming DL Mode is off while
  the server still has it on.
- `shouldMaskPhoto` stays exactly as it is. The client still masks — belt and
  braces — because a masked render over a null URL is harmless, and it keeps
  the UI correct during the moment before the server value arrives.

Add `dlModeEnabled` to the privacy settings client (`src/app/lib/privacyApi.ts`)
alongside the existing ghost-mode and map-presence calls.

### 5. Tests

| Test | Asserts |
| --- | --- |
| Migration applies cleanly, column defaults `true` | Existing rows backfill fail-closed |
| `GET /api/privacy/dl-mode` with no row | Returns `enabled: true` |
| `PUT` then `GET` round-trip | Persists |
| Discovery with viewer DL Mode **on**, target photo explicit | `photos` is `null` **in the response body** |
| Same, target photo non-explicit | `photos` present |
| Discovery with viewer DL Mode **off**, explicit photo | `photos` present |
| Viewer's own explicit photo, DL Mode on | `photos` present — never mask your own |
| Photo with **no** media row | Treated as explicit and masked — the fail-closed case |
| `localStorage` says off, server says on | Server wins; response is masked |

The last two matter most. The no-media-row case is the one that silently
regresses if someone "simplifies" the `coalesce`, and the localStorage case is
the bypass this whole change exists to close.

## Edge cases

| Trigger | Risk | Handling |
| --- | --- | --- |
| Viewer toggles DL Mode off | Cached responses still masked, or vice versa | Any cache key covering these endpoints must include the viewer's DL Mode state, or masked and unmasked responses will be served interchangeably |
| Service worker cache | `public/sw.js` caches same-origin GETs outside `/api/`, so API responses are not cached — but confirm before relying on it | Verify `/api/` stays excluded |
| Photo classified explicit *after* a viewer loaded the page | Stale unmasked URL already in the client | Accepted. Re-classification is asynchronous; the next fetch masks it |
| DL Mode on, user opens their own profile from the map | Own photo masked — looks like a bug | The `profiles.id = $viewerId` exemption in step 3 |
| Request without a session | No viewer, so no setting | Default to masking. Anonymous or unauthenticated reads take DL Mode **on** |

## What this does not do

It does not remove explicit photos from the database, from moderation surfaces,
or from the owner's own view. It withholds them from *other viewers* who have DL
Mode on. Moderators and the photo's owner are unaffected.

It also does not make the URL unguessable — masking is authorisation, not
obscurity. If media URLs are public and predictable, that is a separate concern
worth its own review.

## Order of work

1. Migration `065` (isolated, reversible, ships alone)
2. `GET`/`PUT` endpoints plus tests (no behaviour change yet)
3. SQL masking, one endpoint at a time, verifying the response body per endpoint
4. Client reconciliation last, once the server is already enforcing

Steps 1–3 are safe to ship without step 4: the server starts enforcing the
default (**on**) for everyone, which is the conservative direction. Step 4 only
gives users the ability to turn it off.

**Blocked on:** `node_modules` was removed during the disk cleanup, so no test
suite can run until the reinstall completes. Nothing here should be written until
tests can be executed against it — this is a safety feature, and untested is not
done.
