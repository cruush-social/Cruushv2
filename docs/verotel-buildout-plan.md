# Verotel build-out plan

Written 30 August 2026, worktree `feat/verotel-billing`.

## The decision that shapes everything: Flowguard or FlexPay

Verotel website `#137362` is currently provisioned as **Type: Flowguard API**. The
integration already built in this worktree is **FlexPay v3.2**. These are not old
and new versions of the same thing. Both are current products and Yoursafe
documents them side by side:

| | Flowguard | FlexPay |
| --- | --- | --- |
| Model | Embedded checkout, no redirect | Hosted order pages, buyer redirects out |
| Where the buyer pays | On cruush.app | On Verotel's page |
| Design control | Full, and therefore a design job | None needed |
| PCI scope | Higher, card fields render on our origin | Lower |
| Built today | No | Yes, and tested |

**Recommendation: switch the website type to FlexPay.**

Three reasons. The integration exists and passes 51 tests. Card data never
touches cruush's origin, which matters for a first merchant account in a Tier 1
high-integrity-risk category. And Flowguard's advantage is design control over
the payment step, which is a design job, and Julien is the only designer on
cruush; taking it on now trades weeks for a conversion gain nobody has measured.

Flowguard remains a sensible upgrade later, once revenue justifies the work.

**Action:** change the type on `#137362` via Edit website in the Control Center,
or ask `merchantsupport@verotel.com` to switch it. A FlexPay website exposes a
"FlexPay options" page in place of "Flowguard API options"; that page is where
the postback URL is set.

## Staging: use what already exists

`test.cruush.app` does not need to be built. cruush already has a full staging
environment and the release tooling already targets it.

- `staging.cruush.app` — frontend, `COOLIFY_STAGING_FRONTEND_UUID`
- `api-staging.cruush.app` — API, `COOLIFY_STAGING_API_UUID`, reports
  `stage: staging` at `/api/build`
- `scripts/release-main-coolify.mjs --target staging` deploys both and polls
  until the deployed SHA matches

Both hosts currently return **503**. The Coolify applications and DNS exist; the
containers are not running. Bringing staging up is a deploy, not a build.

Staging is what makes a real Verotel test possible at all. Verotel posts server
to server and cannot reach a laptop, so the postback can only be exercised
against a public URL.

## What is already done

In this worktree, building and passing 51 tests:

- `server/src/verotel-flexpay.ts` — order URLs and signature handling, ported
  from Verotel's own PHP client rather than from a summary. Case-sensitive key
  ordering, and legacy SHA-1 accepted on verification as their client does.
- `server/src/verotel-webhook.ts` — postback handling. Verifies before trusting,
  records before applying, and the unique constraint on
  `billing_processor_events` is what stops a redelivery granting twice.
- `server/src/routes/verotel.ts` — the postback endpoint, which returns the
  literal body `OK`. Verotel automatically refunds any sale whose postback is
  not acknowledged with `OK` inside 30 seconds.
- `server/src/verotel-checkout.ts` — real checkout sessions returning a signed
  order URL, with automatic fallback to the fake processor when unconfigured.
- `server/src/payment-monitoring.ts` and
  `GET /api/internal/payments/monitoring` — the VIRP transaction monitoring,
  with a warning logged at 0.75% chargeback ratio, below Verotel's 1.0%
  surcharge trigger.
- `server/sql/096_verotel_billing.sql` — additive schema, applied and verified.

## Sequence

Ordered by what unblocks what. Owners are marked because several of these are
not engineering.

### 1. Yoursafe onboarding — Julien

Reference `500567515`. Sign the AdobeSign Business Application Form sent by
email, then upload onboarding documents. The EIN assignment letter, the NY
filing evidence and the LLC information request are all in
`Internal-Offload/Downloads`. Personal identity verification happens in the
Yoursafe app with a passport.

Settle the ownership question before signing. The IRS notice says
`JULIEN LENAZ SOLE MBR`; the founders' agreement gives Hazel Fjeld 20%. Answer
consistently across Yoursafe, Verotel, Vendo and CommerceGate.

### 2. Switch the website to FlexPay — Julien or Verotel support

See above. Everything downstream assumes FlexPay.

### 3. Bring staging up — deploy

`--target staging` against the existing Coolify apps. Needs a staging database
that is not production's, and `APP_DEPLOYMENT_STAGE=staging` so `/api/build`
reports correctly.

### 4. Configure Verotel for staging

On the FlexPay options page, set the postback URL to
`https://api-staging.cruush.app/api/billing/verotel/postback` and the success
URL to a staging return page. Both are Control Center settings, not per-order
parameters.

Set `VEROTEL_SHOP_ID` and `VEROTEL_SIGNATURE_KEY` on the staging API only. Never
on a local development environment that is publicly exposed.

### 5. First end-to-end test — with the test card

Verotel issued a test card against `#137362`: `9999994923665549`, any 3-digit
CVV, any future expiry, valid only on cruush's own websites. This means the
whole flow can be exercised **before** approval.

What a pass looks like: a checkout session is created, the buyer reaches
Verotel's order page, the test card completes, the postback arrives and verifies,
`billing_processor_events` records it once, cruush+ is granted through
`grantCruushPlusForCheckoutSession`, and a replayed postback changes nothing.

### 6. Checkout page — Fable

Fable owns `src/app/components/CruushPlusStore.tsx` and the crypto rail. The card
path needs only `startCheckout(planId)` from `src/app/lib/billingApi.ts`, which
returns `{ action: 'redirect', orderUrl }` on a live processor and
`{ action: 'complete_in_app' }` on the fake one. It deliberately does not
navigate on its own.

Collision note: `src/app/components/CruushPlusPlans.tsx` is currently routed at
`/upgrade` from this worktree and duplicates Fable's page. One of the two should
go before these branches meet.

### 7. Request authorization — Julien

`#137362` reads "New - Testing mode". The Control Center has a
**Request authorization** button that submits it for the compliance review. Do
this after cruush.app shows prices, because the reviewer will look for them.

### 8. Production

Set the two secrets on the production API, set the production postback URL,
deploy, and take one real low-value payment before announcing anything.

## Open decisions

1. **Flowguard or FlexPay.** Recommended above, not yet made.
2. **Unmatched postbacks.** The endpoint currently withholds `OK` when it cannot
   match a checkout session, so Verotel refunds rather than leaving a buyer
   charged with nothing. The alternative is to acknowledge and reconcile by hand.
   Policy, not engineering.
3. **Which of the two plans pages survives.**
4. **Staging database.** A staging deploy needs its own, and production data must
   not be reachable from it.

## Still unverified

- No real Verotel postback has ever reached this code. Impossible on localhost.
- Whether Verotel Basic includes FlexPay at all. Their price chart says yes for
  both plans; their plan-selection page says no for Basic. Unresolved, and it is
  question 2 in the email already sent to `merchantsupport@verotel.com`.
- Which Verotel entity contracts cruush, the Amsterdam B.V. or the New York Inc,
  and where the acquiring sits. Question 1 in the same unanswered email.
