# Travel Mode and the onboarding cruush+ week

**Branch:** `travel-mode` (off `origin/main` @ `f00fb48`)
**Date:** 2026-08-21
**Status:** awaiting sign-off. No code written yet.

## What Julien asked for

1. Keep the beta radius at 50 miles around NYC.
2. Let people outside that radius finish onboarding. Do not mention the NYC-only limit
   until onboarding is complete, because stopping them at the location step costs signups.
3. At the end of onboarding, every new account sees an animated cruush+ card. They accept
   it and receive free cruush+ time.
4. The grant is one week, not one day, and it goes to all new accounts, not only the ones
   that turn on 2FA. There is no real payment processor yet, so there is nothing to sell
   them in the meantime.
5. Travel mode is a cruush+ feature. Accepting the card is what unlocks it.
6. Someone who does not have cruush+ and is outside the radius gets a "sorry" screen with
   three offers: get cruush+, join the newsletter, and suggest a different city.
7. Map pings currently expire too fast. Raise them.

## What already exists

Most of the reward machinery for this is already built, and an almost identical feature
shipped once before and was deliberately switched off.

### The 7-day first-login trial already existed and was revoked

`server/sql/073_revoke_post_aug7_automatic_cruush_plus_trials.sql:8` reverses grants whose
idempotency key matches `first-login-cruush-plus-7d:%` for every account created on or
after 2026-08-07. The header comment reads "Automatic first-login trials ended on August 7,
2026."

So the exact grant being requested, a seven-day automatic cruush+ trial on first login,
existed and was turned off three weeks ago. Reinstating it is a policy reversal, not a new
invention. It needs Julien's explicit confirmation, and the new grant must use a new
idempotency key prefix so migration 073 cannot claw it back on replay.

### The current free day is gated behind 2FA

`server/sql/082_two_factor_cruush_plus_reward.sql` sets `two_factor_promo_reward_days = 1`.
The onboarding copy at `src/app/components/ProfileOnboarding.tsx:94` says "Optional. New
accounts can receive one free day of cruush+ when 2FA is enabled," and line 758 confirms
the grant after the fact. `src/app/components/Changelog.tsx:30,45` repeat the claim
publicly.

Moving to "one week for everyone" makes this 2FA reward redundant or duplicative. Decide
whether the 2FA day stacks on top of the week, is replaced by it, or stays as a separate
later reward. Do not delete it silently (rule C7).

### Grant, bank, and activate are all implemented

- `grantPromotionalDaysInTransaction()` — `server/src/rewards-service.ts:211`
- `grantPromotionalDays()` — `server/src/rewards-service.ts:307`
- `activateBankedPromotion()` — `server/src/rewards-service.ts:697`
- `promotional_cruush_plus_entitlements` table — `server/sql/042_rewards_and_two_factor.sql:141`
- `getCruushEntitlement()` already merges promotional access with subscriptions, lifetime
  access, and entitlements — `server/src/match-relationships.ts:260`
- `requireCruushPlus()` — `server/src/billing.ts:239`

Because `getCruushEntitlement()` already reads promotional entitlements, every existing
`requireCruushPlus()` call site starts passing for a user with an active promotional week
without any change to those call sites.

Note that `getRewardSummary()` calls `activateBankedPromotion()` at
`server/src/rewards-service.ts:834`, so banked days auto-activate on any rewards fetch.
That is why the plan below grants at accept time rather than banking at signup: banking
first would let the week start itself before the user ever taps the card.

### The reward guard does not block this

`enforce_activity_reward_earned_boundary()` (`server/sql/079_daily_check_in_rewards.sql:14`,
restated from `078_activity_reward_earned_guard.sql`) returns early for any grant whose
`source` is not `activity_recurring`, and hard-fails `activity_long_bonus`. A new
`onboarding_welcome` source passes through untouched. `server/sql/080_reward_invariants.sql`
locks the daily check-in settings only.

The AI contract still requires that new grants cannot become unearned recurring credit. A
once-per-account idempotency key satisfies that, and a migration should assert it.

### There is no payment processor

`server/sql/027_cruush_plus_billing.sql:15-16` constrains
`billing_checkout_sessions.processor` to `check (processor in ('fake'))`. No Stripe,
Paddle, LemonSqueezy, or RevenueCat reference exists anywhere in `server/`, `src/`, or
either `package.json`. Julien is right that there is nothing to charge with, which is what
makes a free week cost nothing today.

This has a consequence for item 6: the "sorry" screen cannot actually sell cruush+ yet. It
can only collect intent.

### The geofence currently blocks signup

`server/src/routes/auth.ts:497-501` calls `assertBetaAccessAllowed()` during signup, which
throws `403 BETA_ACCESS_OUTSIDE_RADIUS` with the message "NYC open beta"
(`server/src/beta-access.ts:90-96`). `BETA_LAUNCH_RADIUS_MILES = 50` and the NYC center are
hardcoded at `server/src/beta-access.ts:5-9`.

`isWithinBetaLaunchArea()` is also used by map pings at `server/src/map-pings.ts:349` and
`540-541`, so pings are geofenced independently of signup.

### Ping duration

- `MAP_PING_ACTIVE_MS = 10 * 60 * 1000` — `server/src/map-pings.ts:38`
- `MAP_PING_SENDER_LOCATION_MAX_AGE_MS = 15 * 60 * 1000` — `server/src/map-pings.ts:41`

Pings are ten minutes today, not fifteen. The fifteen-minute constant is a staleness guard
on the sender's own location fix. Raising ping lifetime without raising that guard means a
ping sent from a twenty-minute-old location is rejected.

### The animated card was not found

A repository-wide search did not locate an animated cruush+ card component. What exists is
`.cruush-plus-shimmer-button` (`src/styles/theme.css:538-593`, keyframes at line 571), used
once on the map header at `src/app/components/MapHome.tsx:2122`. `CruushPlusCheckout.tsx`,
`CruushPlusSuccess.tsx`, and `CruushPlusUpgrade.tsx` are five-line redirects to `/rewards`.

Searching the last 400 commits across all branches for a `.tsx` file matching card, gift,
trial, celebration, confetti, unlock, or claim returned only `ProfileCard.tsx`.

Julien needs to point at the card he remembers, or confirm it should be built new from the
existing shimmer treatment and the cruush gradient tokens.

## Proposed build

### Phase 1 — move the geofence out of signup

Delete nothing. Move the gate.

- Stop calling `assertBetaAccessAllowed()` in the signup handler. Instead record the
  result: store the account's home region and an `out_of_area` flag.
- Onboarding proceeds identically for everyone. No NYC copy appears at the location step.
- The gate moves to map entry, after onboarding completes.

### Phase 2 — region table, so California is a row and not a deploy

Replace the hardcoded constants at `server/src/beta-access.ts:5-9` with a `launch_regions`
table: `slug, name, center_lat, center_lng, radius_miles, status ('live' | 'waitlist'),
launched_at`. Seed NYC with center `40.6828509, -73.9521325` and radius 50, exactly the
current values, so behavior does not change on the day this ships.

`isWithinBetaLaunchArea()` becomes `resolveRegionForLocation(lat, lng)`, returning the
matching live region or null. Keep the old function as a thin wrapper so the two map-ping
call sites keep working.

Opening California becomes an insert. The same table backs the travel-mode destination
picker and the "suggest a different city" form, so a suggested city and a launched city are
the same record at different statuses.

### Phase 3 — the onboarding cruush+ week

At the end of onboarding, every new account sees the animated card. Accepting it calls a
new endpoint that runs `grantPromotionalDaysInTransaction()` with:

- `days: 7`
- `source: 'onboarding_welcome'`
- `idempotencyKey: 'onboarding-welcome-cruush-plus-7d:<userId>'`

The idempotency key guarantees exactly one grant per account for all time. The prefix
deliberately differs from `first-login-cruush-plus-7d:` so migration 073 cannot reverse it.

Granting at accept time, rather than banking at signup, keeps the week from starting itself
through the auto-activation path in `getRewardSummary()`.

A migration should add a constraint or trigger asserting that `onboarding_welcome` grants
are at most one per user and exactly seven days, so the grant can never become recurring.

### Phase 4 — travel mode

- Gate: `requireCruushPlus()`. The promotional week satisfies it, so no call-site changes.
- Storage: one location row per user today. Add `travel_region_id`, `travel_lat`,
  `travel_lng`, `travel_expires_at`. Real GPS keeps writing the existing envelope. A single
  resolver returns travel coordinates while a session is live and real coordinates
  otherwise, so a user is never present in two places.
- Visibility: the user appears at the travel destination and disappears from their real
  location. They always appear somewhere. Being invisible remains stealth mode, which is
  already a separate cruush+ feature.
- Destination: pick a live region from `launch_regions`, not an arbitrary map point.
- Map pings while travelling must read the resolved location, or the geofence checks at
  `server/src/map-pings.ts:349,540-541` will reject a traveller who is virtually in NYC.

### Phase 5 — the out-of-area screen

Shown when a user without active cruush+ reaches the map from outside every live region:

- get cruush+ (which today can only register intent, since the processor is `fake`)
- join the newsletter
- suggest a different city, writing to `launch_regions` as a `waitlist` row or to a
  companion `region_requests` table with a coarse location

### Phase 6 — ping duration

Raise `MAP_PING_ACTIVE_MS` and raise `MAP_PING_SENDER_LOCATION_MAX_AGE_MS` to at least
match. Recommendation is 30 minutes rather than 60: at beta density, an hour fills the map
with people who left, and a ping stops meaning "here now."

## Decisions from Julien, 2026-08-21

1. Travel mode is cruush+ only. Basic accounts do not get a metered allowance.
2. Stealth mode and travel mode are mutually exclusive. Enabling one disables the other,
   enforced server side, not only in the UI.
3. The destination is any point the user drops inside an active region, not the region
   centre. Today that is the 50 mile NYC circle.
4. Map pings last 30 minutes.
5. Reinstate the seven-day grant, but fix the defect that caused its removal. The previous
   implementation re-granted on every login. The new grant fires once per account, ever, on
   completion of onboarding, and is not renewable.
6. The 2FA reward stays exactly as it is: one day, unchanged.
7. The seven-day check-in streak bonus stays exactly as it is: one day, unchanged.
8. Referral rewards stay as they are: one week per person who signs up through the
   referrer's link and completes 2FA at signup.
9. Add a short human-typeable referral code that resolves to the same referral identity as
   the link, so a friend can enter it manually when a link fails.
10. Installing the app to a phone home screen grants one free day.
11. When a user's own region later opens, they receive another free week at that moment.
12. A traveller interacts in the destination region as a local, but carries a travel-mode
    icon next to their name.
13. The newsletter goes to the same Resend audience as cruush.app, so travellers receive
    the same broadcasts.
14. Travel mode is named **Layover**.
15. The referral surface offers both a copyable link and a copyable code, each with its own
    clipboard control plus a share control. Neither is hidden behind a truncation: the user
    sees the exact text that will be copied. Copying the code also copies short instructions
    for signing up and applying it.
16. Referral codes rotate weekly, switching on Sunday, for every user.
17. Ping icons use the existing ping green, not the pink primary.
18. The ping sheet should preview the animation that plays when a ping goes out.
19. Ping copy should explain the prominence a ping gives you on the map.

## Ping green

The ping green already exists as the literal `#c8ff31`, used seven times in
`src/app/components/MapPingSheet.tsx` (lines 186, 203, 235, 268, 271, 286, 315) and once on
the map ping button at `src/app/components/MapHome.tsx:2556`. It is not a named token, so
this change should also promote it to one in `src/styles/theme.css` rather than adding a
ninth hardcoded hex.

Two ping icons currently render in the pink primary rather than the ping green:

- `src/app/components/MapControlsTutorial.tsx:119` renders `<Radio className="h-5 w-5
  text-primary" />` for the ping tutorial step.
- `src/app/components/CruushPlusGateNotice.tsx` renders a `text-primary` chevron, and the
  ping sheet embeds that component at `src/app/components/MapPingSheet.tsx:300`.

`CruushPlusGateNotice` is shared by three surfaces: `MapPingSheet.tsx:300`,
`MapFiltersSurface.tsx:143`, and `MapVisibilitySurface.tsx:201`. Recolouring it directly
would turn the filters and visibility notices green as well. Extend the primitive with a
tone prop instead of forking it, per rule E1, and leave the other two surfaces unchanged.

## Existing systems that already satisfy part of this

### The newsletter is already wired

`server/src/resend-audience.ts:11` defines `syncVerifiedMemberToResendAudience()`, which
adds a verified member to `RESEND_CRUUSH_APP_AUDIENCE_ID`. It is called on email
verification at `server/src/routes/auth.ts:1270`. Every verified account, in area or not,
already lands in the cruush.app audience and receives its broadcasts.

Two caveats. The function returns early unless `APP_DEPLOYMENT_STAGE === "production"`, so
it is inert locally. And whether `RESEND_CRUUSH_APP_AUDIENCE_ID` is actually populated in
the production environment has not been verified from this session.

Because the sync already happens, the newsletter offer on the out-of-area screen is either
redundant or should be reframed as a separate marketing opt-in with its own consent.

### Referral codes exist but are too long to type

`server/src/referrals-service.ts:11` and `server/src/auth-schema.ts:51` both constrain the
referral code to `^[A-Za-z0-9_-]{16,64}$`. Sixteen to sixty-four characters is a link tail,
not something a person reads aloud or types from a phone screen.

The referral identity lives in `referral_identities.code`, referenced by
`server/sql/042_rewards_and_two_factor.sql:69`. The client already picks a code out of the
URL and stashes it in session storage at `src/app/components/Auth.tsx:55-65`, then submits
it at line 227.

Shortening the existing column would break every link already in circulation. The safe move
is to add a short alias, six to eight characters from an unambiguous alphabet, on the same
referral identity row, so both the long link tail and the short spoken code resolve to one
referrer.

### PWA install already has hooks

`src/app/components/MobileInstallPrompt.tsx` is mounted at `src/app/App.tsx:595`. The app
fires a `cruush:install-requested` event from `src/app/components/Settings.tsx:225` and
`src/app/components/MapHome.tsx:777`. Standalone display detection already exists at
`src/app/components/NotificationSettings.tsx:13-16`.

An install reward needs a server-verified signal, not just a client claim, plus a
once-per-account idempotency key.

## Remaining open questions

1. Where is the animated cruush+ card? Not found in the repository or in the last 400
   commits across all branches. Build it new from the existing shimmer treatment?
2. If a user declines the card, is the week gone forever or claimable later?
3. Does the out-of-area screen still need a newsletter button, given verified accounts are
   already synced to the audience automatically?
4. Is `RESEND_CRUUSH_APP_AUDIENCE_ID` set in production?
5. Travel mode name: keep it, or rename.

## Settled design, 2026-08-22

The feature is named **Mile High Club**, title case. `cruush` and `cruush+` stay lowercase
around it.

### The reward card

`BetaLaunchCruushPlusOffer` is restored from `d9a1776` and reworked. Interactive prototype:
https://claude.ai/code/artifact/018e88a0-a5c8-4c7f-bafe-ada3c1b033af

- The card is **portrait**, `aspect-ratio: 2 / 3`, and the dialog is full screen rather than
  a small centred panel.
- It arrives under a **scratch-off foil** painted on canvas. Dragging erases it with
  `destination-out`. Past roughly half cleared the remainder dissolves and confetti fires.
- **Tapping the card turns it over.** The benefits are printed on the back. A press that
  travels more than 7px counts as a drag and only tilts the card.
- Both faces carry the same moiré. The back adds a veil so the type stays readable.
- `cruush+` and the day count are cut from one **iridescent chrome ramp**: blue sky, a hard
  dark horizon, a white specular, magenta ground. The dark band is what keeps the type
  legible while the colour moves.
- The moiré rings follow the cruush ramp, magenta to violet to blue. The card's hue cycle is
  held to 46 degrees. Both were changed from the original, which used cyan and gold and swept
  145 degrees, dragging the card through greens and yellows.
- The activate button uses the gradient from `Auth.css` line 19, not the one in
  `theme.css` line 13. `.launch-login-auth-shell` redefines `--cruush-gradient` locally, so
  the sign-in button has never used the global value. It carries the landing page hover
  sweep from `Auth.css` lines 334 to 364.

### Where the card appears

The same component, with the duration and two lines of copy driven by the grant:

- end of onboarding, before the map, seven days
- a tapped notification for a login streak, one day
- a tapped notification for a referral that completed 2FA, seven days
- a redeemed coupon, whatever the coupon carries
- the 2FA reward, one day

### Marks

- Feature icon: a **pilot wings badge** in chrome, white rather than a new hue.
- Traveller marker: the existing heart pin with **chrome wings on both sides**. The heart
  colour is unchanged, because colour encodes relationship and wings encode location.
  Adding a fifth heart colour would make colour mean two things at once.
- White is chosen over amber or teal because it reads as airline and pilot metal, matches
  the card's chrome, and cannot be confused with any pin colour.

### Open

- The Profile tab icon is already a winged heart. Same two ingredients as the traveller
  marker, different context. Worth a look before it ships.
- Whether a Mile High Club member can send a ping from a borrowed location, and whether the
  wings ride along on that ping. Current answer is yes and yes.

## Icon rules, 2026-08-22

Every icon in `src/app/assets/ui-icons/` ships as a pair and uses one of exactly two
finishes. Nothing else.

- `<name>-white.svg` is **flat white**, `fill="#ffffff"`, a single colour, no gradient.
- `<name>-colored.svg` is the **cruush gradient**, the same stops as
  `--cruush-gradient`, applied as a `linearGradient` across the glyph.

There is no third finish. Chrome, metal ramps, silver and multi-stop speculars belong to
the card type and nowhere else. An icon drawn in chrome is wrong even when it looks good on
its own, because it will not sit beside `ghost-white.svg`, `crowds-white.svg` or
`dl-mode-white.png` in the map rail.

Existing pairs to match: `ghost-white.svg` / `ghost-colored.svg`,
`crowds-white.svg` / `crowds-colored.svg`, `dl-mode-white.png` / `dl-mode-colored.png`.

The existing SVGs carried a title with the wrong product spelling. <!-- ai-contract-allow-product-example -->
They have since been corrected to the lowercase product name, and `MapHome.test.tsx` follows.
New assets should use `<title>cruush icon - ...</title>`.

### Naming

- Travel mode is **Mile High Club**, title case.
- Stealth Mode is renamed **Dark Room Mode**.
- Both are title case. `cruush` and `cruush+` stay lowercase around them.

## Mode names swapped, 2026-08-22

The two privacy modes trade names, because each one was on the wrong feature.

| Feature | Was | Now |
| --- | --- | --- |
| Browse the map without appearing on it. cruush+ only. | Stealth Mode | **DL Mode** |
| Your photos and identifying detail stay hidden while you are on the map. | DL Mode | **Dark Room** |

The reasoning: being "on the DL" is about not being seen at all, which is the invisible
browsing feature. A dark room is somewhere you are physically present while faces stay
hidden, which is the photo-discretion feature.

This is a rename of two existing, shipped features. `DlModeSettings.tsx` and
`src/app/lib/dlMode.ts` currently implement the photo-discretion feature and would become
Dark Room. The stealth code paths in `match-relationships.ts` and `GhostModeSettings.tsx`
would become DL Mode. Nothing about the behaviour changes, only the labels, and both need
a full copy sweep before shipping so no screen carries the old pairing.

Ghost Mode is untouched and keeps its name.

## Marker rule, 2026-08-22

Supersedes the icon-finish rule for map markers only. Rail icons are unchanged: still flat
white or the cruush gradient, still a pair.

**Map markers are outlined, not filled.** A marker decoration takes its colour from the pin
it sits on, so it cannot ship as a fixed-colour asset.

- Fill is the map ground, not a colour.
- Outline is the heart's own border colour, whatever that pin resolves to: pink for nearby,
  purple for a mutual cruush, blue for you.
- **No interior detail. Final.** Bat wing bones were drawn from anatomy, tested at size and
  dropped: they turn to mush below 72px and fight the badge language. The three concave
  membrane scallops carry the read on their own.
- The wing path is the smooth-leading-edge version:
  `M188,96 C204,74 228,56 256,48 Q239,72 249,96 Q224,100 230,128 Q205,126 209,152 Q194,138 188,116 Z`
  An anatomically stricter rewrite that added a wrist kink and closed the root at `188,100`
  was tried and rejected: correct bones, pinched shoulder, worse silhouette.
- Because the colour is inherited, the wings are inline SVG on the marker, not an asset pair.

The Mile High Club rail icon is still a normal pair, `mile-high-club-white.svg` and
`mile-high-club-colored.svg`, solid fill, matching ghost, crowds and dl-mode.

### Ghost flash

Travelling wings participate in the Pepper's ghost cycle. `.cruush-ghost-rotation-wing-membrane`
takes `--cruush-ghost-pepper-filter` and `--cruush-ghost-pepper-opacity`, the same variables
the photo and the badge symbols already read, so a ghosting traveller fades through the wings
and the heart together. `.cruush-ghost-rotation-wing-outline` follows `--cruush-ghost-unit-opacity`.

### Names, final

- Travel: **Mile High Club**, outlined bat wings on the pin.
- Browse unseen: **Voyeur**, eye-in-keyhole gothic lancet. Was Stealth Mode.
- Explicit photos hidden: **DL Mode**, the shipped balaclava. Unchanged from where it started.

## The traveller marker, settled

The travelling marker is the deployed marker with one substitution: the heart's border path is
painted by a contrail instead of a flat colour. Nothing else about the unit changes. The heart
path, its dimensions, the badges and the signal pill are all the deploy's own.

These values were read out of the deployed bundle at `cruush.app`, not out of local source,
after local source was found to have drifted from what ships:

- Unit wrapper: `relative flex h-20 w-[103px] origin-bottom items-center justify-center`. The
  box is 103px wide with the 80px heart centred in it. This is why a badge hung at
  `right-[-0.25rem]` clears the heart rather than overlapping it; a mock built on an 80px box
  overlaps by 9.8px at the badge's height.
- Heart: `HEART_PIN_PATH` in `viewBox="0 0 64 64"` rendered at 80px, `strokeWidth` 3.2, fill
  gradient running diagonally from `x1=10 y1=9` to `x2=55 y2=56`.
- Badge: 25px (`h-[1.5625rem]`), 3.2px border, glyph 15px (`h-[0.9375rem]`), at `top-[62%]`.
- Signal: `rounded-full border border-[3.2px] bg-black/86 px-3 py-1 text-[0.7rem]`, inheriting
  `body { font-family: Spectral, serif }`.
- Neither `--cruush-ghost-surface-alpha` nor `--cruush-ghost-pepper-*` exists in the deployed
  stylesheet. The badge surface does not change on a ghost flash in production, whatever the
  local branch does.

### The contrail

- The trail is the border. It leaves the plane's tail joined to it and runs backward.
- Colour runs white immediately behind the plane, handing over to the brand ramp further back.
  Each band is solid: splitting a band's opacity between a white copy and a gradient copy makes
  both halves faint and the colour never lands anywhere visible.
- Bands widen and soften with age. The freshest is 3.2, matching the border it replaces.
- The plane is white.

**The tip must never touch the trail.** The heart is a closed loop, so a long enough trail wraps
all the way round and comes up in front of the nose. The clearance is subtracted twice, once for
the tail the trail leaves from and once for the nose it must never reach, and the span is capped
at what remains. A request for 90% resolves to 84.9%.

### States

Ghost and pulse change the contrail's **colour only**. Band widths, blur and the per-band alpha
ramp stay exactly as they are, so the trail never changes weight or style between states.

- Ghost: contrail and every other border on the unit flash `#0BA8FF`. The plane stays white. The
  photo takes the Pepper's ghost filter. Badge and signal symbols never fade.
- Pulse: contrail and every border go `#C8FF31`, the plane stays white, and the whole unit
  pulses together from the pin's own anchor, badges and signal included.
- The border cannot be allowed to pick up a tint from the photo beneath it. This is the same
  problem `.cruush-ghost-rotation-vector-border` already solves in the deploy with
  `filter: none !important` and `stroke-opacity: 1 !important`.
- Flash rate is held under 5Hz. The real driver spreads its acceleration across a full minute;
  any demo that compresses it must not cross the photosensitivity threshold.

### Reduced motion

The same drawing, held. The trail runs to its longest permitted span and the plane parks on the
heart's bottom point, because with nothing moving the outline has to carry the shape on its own.

### Rejected

- Blob and dash "smoke" tails. At 80px puffs read as lumps or as a dotted line, never as vapour.
- Masking the photo back from the border to stop it tinting the trail. It visibly shrinks the
  heart's interior, which is a shape change.
- Any variable border width, blur or glow on the heart itself.

### Contrail parameters, as chosen

Approved on the ghost and pulse cells, which use these values unmodified:

| Parameter | Value | What it controls |
| --- | --- | --- |
| span | 0.50 | Share of the lap the trail covers |
| bands | 16 | Segments the trail is drawn in |
| handover | 0.22 | Where the white stretch behind the plane ends |
| blend | 0.20 | How long the white-to-gradient crossfade takes |
| hold | 0.62 | How far the trail holds full brightness before fading |
| plane | white | Shaded white, three ramps in object bounding box space |
| badge and signal borders | brand gradient | Painted border-box, surface painted padding-box |

Band width grows from 3.2 at the plane to roughly 6.9 at the tail. Blur is applied past 36% of
the trail and heavier past 70%. Alpha holds at 1 until the hold point, then falls to a floor
of 0.12.

A gradient border must not resize the element. Painting the ramp on the border box and the dark
surface on the padding box keeps the badge at its 25px with its 3.2px border; an inset ring
drawn as a masked pseudo-element made gradient badges 31.4px against 25px for solid ones.

### Scope boundary, absolute

Three things change on a travelling marker, and nothing else:

1. the heart's border,
2. the badge borders,
3. the signal border.

Everything else is the deployed marker untouched: the heart path and its dimensions, the photo
and its clip, the fill gradient, the badge boxes and glyphs, the signal pill's box, padding and
type, the layout of the unit. No mask on the photo, no change to any border width, no glow, no
blur on the heart, no repositioning. If a change cannot be expressed as a border colour, it is
out of scope.

## Mile High Club, product rules

- A member of Mile High Club cannot also be in ghost mode or in Voyeur. The three are mutually
  exclusive.
- The Mile High Club icon appears next to the member's name everywhere their name appears, not
  only on the map marker.
- The profile shows the member's **true** location, at state or country granularity and no finer.
  This is an anti-catfishing measure: the map may show where they are travelling, the profile
  always says where they actually are.

### Profile icon

Cut as `mile-high-club-badge-white.svg`, `mile-high-club-badge-colored.svg` and
`mile-high-club-badge-dimensional.svg` in `src/app/assets/ui-icons/`. The airplane-mode glyph
inside a ring, matching the flat-white and gradient finishes every other icon uses, with a third
dimensional variant for larger placements.

Two things to know if these are ever edited:

- The ring is drawn in root user space and the plane inside a `translate(32,32) scale(1.32)`
  group. A `userSpaceOnUse` gradient therefore resolves differently for each: shared between
  them, the plane lands at the far left of the ramp and renders solid pink. The plane carries
  its own `objectBoundingBox` ramp for this reason.
- The dimensional variant builds its form from the brand ramp itself, deepening toward the
  wingtips and lifting at the fuselage, rather than from black and white overlays. Overlays
  desaturate the glyph and it stops reading as a cruush colour.

## Separate from travel mode, raised and not yet addressed

These are app-wide and out of scope for this branch:

- Popups must not cover content at the top or the sides by default. They should be sized to fit.
- Popups should be resizable from any corner, and draggable by any part of their top edge rather
  than only by a narrow title bar.
- Moving the pulse menu on desktop is laggy.
- The desktop pulse menu drags laggily and needs to be made smooth. Worth checking first
  whether the drag writes layout-affecting properties (`top`/`left`/`width`) per pointer event
  rather than a composited `transform`, and whether it re-renders the marker layer while moving.
- The app needs work offloaded off the main thread generally; the pulse menu is one symptom.
- The top bar is currently wonky.

None of these have been investigated. They are listed here only so they are not lost.
