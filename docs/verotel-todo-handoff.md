# Verotel to-dos

Written 30 August 2026. Worktree `/Volumes/good/Cruushv2-verotel-billing`,
branch `feat/verotel-billing`. Companion to `docs/verotel-buildout-plan.md`,
which carries the reasoning; this file is the checklist.

## Read this before deploying anything

`scripts/release-main-coolify.mjs` **pushes the `--source` branch to
`origin/main`** before it deploys. Staging and production both build from
`main`; only the deploy step is separated. There is no staging-only source
branch.

As of writing, `feat/verotel-billing` is **28 commits behind `origin/main` and 0
ahead**, with 27 uncommitted files. Running the release script from this branch
would rewind `main` by 28 commits. Do not run it here.

To get this work onto staging: rebase or merge `origin/main` into the branch,
commit, merge to `main` through normal review, and only then release.

## If you are picking up both rails, read this first

You own the checkout page and the crypto rail. This section is what the card rail
hands you, and the four things that are expensive to rediscover.

### What you inherit, already built and tested

The card rail is finished server-side: 51 tests passing, typecheck and build
clean, migration applied against local Postgres. You should not need to write
Verotel code. Files are listed under "Done, in this worktree" below.

### Four things that will bite

**1. The postback must return the literal body `OK`.** Verotel automatically
refunds any sale whose postback is not acknowledged with `OK` inside 30 seconds.
`routes/verotel.ts` does this with `reply.code(200).type("text/plain").send("OK")`.
If that route gets normalised into the JSON envelope the rest of the API uses,
every card payment will be charged, granted, and then silently refunded, with no
error anywhere to explain it. This was a real bug in the first version.

**2. Migrations live in an explicit array in `server/src/migrate.ts`.** It is not
a directory scan. Your `097_crypto_payment_intents_multi_asset.sql` needs an
entry there or it silently never runs and the tables just do not exist. This
already cost a debugging cycle with `096`.

**3. `startCheckout(planId)` in `src/app/lib/billingApi.ts` is the shared entry
point.** It returns `{ action: 'redirect', session, orderUrl }` when a live
processor is configured, and `{ action: 'complete_in_app', session }` otherwise.
It deliberately does not navigate on its own, because where the buyer is sent
from is a product decision. Crypto should extend this as a third case rather than
running a parallel path, so one function decides what a purchase does.

**4. Verotel FlexPay signing has two non-obvious details**, both ported from
Verotel's own PHP client and pinned by tests in `verotel-flexpay.test.ts`. Key
ordering is **case-sensitive** (`ksort($params, SORT_REGULAR)`), and verification
must accept **legacy SHA-1** as well as SHA-256, because their own
`validate_signature` does. Getting either wrong rejects legitimate postbacks.

### Where the two rails collide

| Surface | Card rail | Crypto rail | Note |
| --- | --- | --- | --- |
| `billing_checkout_sessions.processor` | `'verotel'` | `'crypto'` | Constraint widened in `096` to `('fake','verotel')`. Crypto needs its own widening. |
| `grantCruushPlusForCheckoutSession` | calls it | should call it | Extracted from `completeFakeCheckoutSession` so both rails grant identically, including founder redemptions, badges and `bankActivePromotionForPaidSubscription`. Do not write a second grant path. |
| `src/app/lib/billingApi.ts` | types widened, `startCheckout` added | rail selector | Both branches edit this. Expect a conflict. |
| The checkout page | `CruushPlusPlans.tsx` at `/upgrade` | `CruushPlusStore.tsx` | **Delete `CruushPlusPlans.tsx`.** It was built before its author knew `CruushPlusStore.tsx` existed. Keep yours. |
| Migration numbers | `096` | `097` | No clash, but nobody else should claim `097`. |

### What not to change without asking

- The fake processor. `createFakeCheckoutSession` and
  `completeFakeCheckoutSession` are what local development runs on.
- The idempotency constraint on
  `(processor, sale_id, event_type, event_key)`. It is the only thing stopping a
  redelivered postback granting cruush+ twice.
- The fail-closed behaviour in `verifyFlexPaySignature`. It must never fail open.

### Merge situation

Both branches are behind `origin/main`. Card rail is `feat/verotel-billing` in
`/Volumes/good/Cruushv2-verotel-billing`, 28 commits behind with 27 uncommitted
files. Crypto is `feature/v2-crypto-processor-20260822`. Whoever merges second
reconciles `billingApi.ts` and the checkout page.

## Blocked on Julien

- [ ] **Sign the Yoursafe Business Application Form.** AdobeSign, sent by email,
      reference `500567515`. Nothing in Yoursafe unblocks until this is signed.
- [ ] **Settle the ownership answer before signing.** The IRS EIN notice says
      `JULIEN LENAZ SOLE MBR`; the founders' agreement gives Hazel Fjeld 20%.
      Whichever is true must be answered identically to Yoursafe, Verotel, Vendo
      and CommerceGate. A mismatch reads as an undisclosed beneficial owner.
- [ ] **Upload Yoursafe onboarding documents.** The "Resolve" action does nothing
      until the form above is signed. Files are ready in
      `Internal-Offload/Downloads`: EIN assignment letter, NY 2026 filing
      evidence, NY LLC information request.
- [ ] **Personal identity check in the Yoursafe app.** Passport, not a licence.
      Even light, no glare. If it fails twice, stop and email
      `merchantsupport@verotel.com` rather than looping; the documented failure
      mode is people resubmitting ten-plus times over weeks.
- [ ] **Decide Flowguard or FlexPay.** Website `#137362` is provisioned Flowguard
      API; everything built here is FlexPay v3.2. Recommendation and reasoning
      are in the build-out plan. Everything downstream assumes FlexPay.
- [ ] **Set the billing descriptor to `cruush.app`** on the website record. It
      must match what the pricing page states, and must never change once live.
- [ ] **Press "Request authorization"** on `#137362` to leave "New - Testing
      mode". Do this only after cruush.app shows prices, because the reviewer
      will look for them.
- [ ] **Answer the two questions already sent** to `merchantsupport@verotel.com`:
      which legal entity contracts cruush, Amsterdam B.V. or New York Inc, and
      whether Verotel holds the Visa VIRP Tier 1 dating registration on the
      merchant's behalf.

## Blocked on infrastructure

- [ ] **Bring staging up.** `staging.cruush.app` and `api-staging.cruush.app`
      both return 503. The Coolify applications and DNS already exist and
      `--target staging` already knows them. Read the deploy warning above first.
- [ ] **Give staging its own database.** Production data must not be reachable
      from it.
- [ ] **Set `APP_DEPLOYMENT_STAGE=staging`** so `/api/build` reports the stage
      correctly; the release script asserts on it.
- [ ] **Set `VEROTEL_SHOP_ID` and `VEROTEL_SIGNATURE_KEY` on staging only.**
      Never on a local environment that is publicly reachable. Both are
      documented in `server/.env.example`.
- [ ] **Set the postback URL in the Control Center** to
      `https://api-staging.cruush.app/api/billing/verotel/postback`, and a
      success URL to a staging return page. Both are Control Center settings on
      the FlexPay options page, not per-order parameters.

## Engineering, not started

- [ ] **Rebase this branch onto `origin/main`.** 28 commits behind. Do this
      before anything else touches it.
- [ ] **Resolve the duplicate plans page.** `src/app/components/CruushPlusPlans.tsx`
      is routed at `/upgrade` from this branch and duplicates Fable's
      `CruushPlusStore.tsx`. One must go before the branches meet.
- [ ] **Wire the checkout entry point.** `startCheckout(planId)` in
      `src/app/lib/billingApi.ts` returns `{ action: 'redirect', orderUrl }` on a
      live processor and `{ action: 'complete_in_app' }` on the fake one. It
      deliberately does not navigate on its own. Fable owns the page that calls
      it.
- [ ] **Build the return page.** `/checkout/success` currently redirects to
      `/rewards`, so a buyer coming back from Verotel sees no confirmation. The
      postback is the source of truth for entitlement, so this page should read
      billing status rather than trust the redirect.
- [ ] **First end-to-end test with the Verotel test card.** `9999994923665549`,
      any 3-digit CVV, any future expiry, valid only on cruush's own websites.
      A pass means: session created, order page reached, card completes,
      postback verifies, `billing_processor_events` records it once, cruush+
      granted, and a replayed postback changes nothing.

## Done, in this worktree

51 tests passing, typecheck and build clean, migration applied and verified
against local Postgres.

- FlexPay signing and verification, ported from Verotel's own PHP client.
  Case-sensitive key ordering; legacy SHA-1 accepted on verification.
- Postback endpoint returning the literal body `OK`. **Verotel automatically
  refunds any sale whose postback is not acknowledged with `OK` within 30
  seconds.** This was a live bug and is fixed.
- Idempotency through a unique constraint on
  `(processor, sale_id, event_type, event_key)`, so a redelivery cannot grant
  twice.
- Real checkout sessions returning a signed order URL, falling back to the fake
  processor when unconfigured, so nothing changes until the secrets are set.
- VIRP transaction monitoring at `GET /api/internal/payments/monitoring`, with a
  warning logged at a 0.75% chargeback ratio, below Verotel's 1.0% surcharge
  trigger.
- Migration `096_verotel_billing.sql`, additive, plus its entry in the manifest
  in `server/src/migrate.ts`, which is easy to forget and silently skips the
  migration if missed.

## Open decisions

1. Flowguard or FlexPay.
2. Unmatched postbacks: the endpoint currently withholds `OK` so Verotel refunds
   rather than leaving a buyer charged with nothing. The alternative is to
   acknowledge and reconcile by hand. Policy, not engineering.
3. Which plans page survives.
4. Whether cruush ever moves to an EU entity, which would change acquiring,
   settlement currency and pricing together.

## Still unverified

- No real Verotel postback has ever reached this code. It cannot be exercised on
  localhost; Verotel posts server to server and cannot reach a laptop.
- Whether Verotel Basic includes FlexPay at all. Their price chart says yes for
  both plans; their plan-selection page says no for Basic.
- Which Verotel entity would contract cruush, and where the acquiring sits.
