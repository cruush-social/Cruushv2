# FIXLOG

- 2026-09-02: The billing policy and checkout now link to a prefilled refund-review request for legally required withdrawal, refund, price-reduction, or other billing remedies without promising voluntary refunds.
- 2026-09-02: The seven checkout benefit capsules now fill exactly three balanced rows; no public cruush+ benefit claims saved visibility sets.
- 2026-09-02: Cancelled, expired, failed, paid, and refunded payment responses no longer expose a retired order address.
- 2026-09-02: The cruush+ checkout now uses the current v1.6 benefit set, removes the nonexistent visibility-sets claim, and keeps the exact “Who has a cruush on you” title.
- 2026-09-02: Members can cancel an unsent crypto order or cancel it to change payment method; the PostgreSQL attempt remains recorded, its address is never reused, and confirming or paid orders cannot be cancelled.
- 2026-09-02: New crypto orders now use a 60-minute window, and Venmo is no longer advertised because its current official documentation does not confirm Arbitrum support.
- 2026-09-01: The cruush+ checkout now labels the browse-without-appearing benefit as Dark Room and no longer shows the meaningless Something else crypto payment choice.
- 2026-09-01: The checkout now lists seven benefits implemented in this branch, explains Dark Room, and no longer sells unmerged Mile High Club or Feed+, basic feed posting, or nearby-profile browsing as paid features.
- 2026-09-01: Plan cards now show the monthly rate prominently on the right and the exact charged total under the term on the left; six months is $65.94 total and $10.99/month.
- 2026-09-01: The activity benefit now uses the exact product phrase “Who has a cruush on you.”
- 2026-09-01: Transfers mined after quote expiry cannot grant cruush+, terminal intents expose no payment URI or QR code, and transfers of the wrong token cannot count; a scheduler-expired intent may settle only exact-rail evidence authoritatively timestamped by expiry.
- 2026-09-01: Crypto readiness is enforced per payment rail, and an unavailable payment source can no longer appear selected in the disabled checkout.
- 2026-09-01: The browse-without-appearing feature is labeled Dark Room across current user-facing app, legal, changelog, and server error copy; Ghost Mode remains separate.
- 2026-09-01: Restored crypto payments keep their original source selected and their plan and source selectors locked even when that rail becomes unavailable, including after the intent becomes paid.
- 2026-09-01: Crypto watching now uses durable per-intent positions on every supported chain, verifies chain ID before each active scan, validates authoritative block timestamps against log hashes, and re-sums locked exact-rail evidence inside settlement.
- 2026-09-01: Active lifetime access blocks new crypto purchases; a successful shared lifetime grant closes pending and awaiting-payment intents atomically while preserving confirming intents with observed funds.
- 2026-09-01: Confirmed-money reconciliation now uses the same exact-rail underpayment tolerance as settlement: 50 basis points, capped at $0.25.
- 2026-09-01: A transfer can count only from a block strictly after its address's verified pre-publication origin; every configured secondary chain is verified at checkout, and an unconfigured chain never receives a guessed origin.
- 2026-09-01: A database advisory lock now serializes reorganization detection, evidence updates, settlement, and cursor advancement across watcher processes so a stale transfer cannot grant access.
- 2026-09-01: Limited founder and lifetime quotes retain their supply reservation through the seven-day evidence window; an authoritative duplicate lifetime payment is recorded for support without a second grant or a blocked watcher pass.
- 2026-09-01: Support transfer records now include authoritative block hash and timestamp, and reconciliation excludes pre-origin and post-expiry evidence from missed-settlement findings.
- 2026-09-01: Wallet initialization now requires hidden exact re-entry of all 24 recovery words before writing a public descriptor.

- 2026-09-01: GitHub #140. Visibility Controls Apply no longer returns `Request validation failed`
  for profiles using canonical app-owned `/api/media/profile-photos/<uuid>.<ext>` photos. Regression
  coverage: `server/src/profile-schema.test.ts` and `server/src/app.test.ts`.
- 2026-09-01: Heart and saved-badge borders now resolve from one identity tone. Active MHC units use
  `#77B9DA` across Feed, Messages, cruush activity, profile hearts, Spots, and the map. `Far far away`
  stays inside its metadata column. Rendered assertion: populated Android-width cards showed identical
  heart and badge strokes on relationship and MHC states.
- 2026-09-01: cruush activity and Messages action trios now use 36px controls with 4px gaps. cruush
  centers identity, last active, and distance beside the heart; Messages preserves its preview spacing.
- 2026-09-01: Larger text no longer clips Notifications, Cruushes, Bug reports, Cruise Carousel, or
  the open Mile High Club picker at 390x844. Rendered assertion: each affected route showed its full
  heading, controls, and labels; Mile High Club kept address search, actions, map, and bottom nav on one screen.
- 2026-09-01: The Pulse sheet no longer accepts mobile drag input. Rendered assertion: a 75px diagonal
  drag left its mobile sheet rectangle unchanged at x=12, y=124.625, width=366, height=619.375.
- 2026-09-01: The current user's map pin now opens its signal preview on mobile tap. Rendered assertion:
  tapping the owner pin set its pressed state and displayed the signal above the heart.
- 2026-09-01: The current user's regular and Ghost Mode decoy previews now stay open after a mobile
  tap instead of closing on touch pointer-leave; tapping the same heart again closes the preview.
- 2026-09-02: GitHub #142. Onboarding now matches the server's 35-character Signal limit and names the invalid field instead of only showing `Request validation failed`; skipping optional 2FA remains supported.
