# Handoff: European payment processor

Current crypto worktree: `/Volumes/good/Cruushv2-crypto-release`

Current crypto branch: `feat/crypto-pricing`

The remote feature branch exists. This handoff does not establish the final
commit or push state. Verify fresh SHA and ahead/behind evidence before
coordinating publication. Do not assume these changes are on `main` or
deployed.

## Shared entitlement boundary

Use `grantCruushPlusPlan` in `server/src/billing.ts`. Do not create a second
entitlement implementation.

The function applies a grant after payment has already been proven. It does not
verify money. Add a provider-specific source variant and database reference,
then prove settlement independently through the provider's signed evidence.
Browser redirects never qualify as payment proof.

Migrations `096` through `101` are already used by the crypto branch. Before an
address becomes payable, the route verifies the selected endpoint's
`eth_chainId` against the server-fixed rail, reads its head, and migration
`100_crypto_payment_watch_start.sql` provides the durable head-origin column.
Migration `101_crypto_payment_chain_positions.sql` adds a durable origin and
cursor for every intent on every supported chain, plus authoritative transfer
block timestamps. Active watcher passes verify chain ID before the head or log
read, and a mismatch aborts before cursor advancement.
Resolve the next available migration number from the current target branch
before editing. `server/src/migrate.ts` uses an explicit ordered list, and its
drift test must include every SQL migration.

For finite crypto grants, the shared function atomically extends access from
the later current subscription end, entitlement end, or now. Existing fake
checkout replacement behavior is unchanged. Crypto lifetime access cannot be
purchased twice, and active lifetime access blocks every new crypto purchase.
A successful shared lifetime grant atomically closes the member's `pending`
and `awaiting_payment` crypto intents, while preserving `confirming` intents so
already observed funds can finish settlement. Founder annual and lifetime
founder reservation and final grant checks are transactionally serialized
against the 1,000 and 250 supply caps. Preserve those source-specific semantics
when adding a European source.

## Legal correction

cruush+ is an ongoing interactive digital service, not immediate digital
content. EU consumers generally have a 14-day withdrawal right. Immediate
access, prior consent to begin service, or an acknowledgement does not by
itself erase that right before the service is fully performed. Do not implement
a checkbox described as making the purchase non-refundable.

cruush does not offer generic voluntary refunds for cruush+. That does not
override legally required withdrawal, refund, remedy, chargeback, or forced
reversal outcomes. Keep those outcomes reconcilable and decide entitlement
treatment with Julien before implementation. Do not add generic refund tooling
or refund-offering copy unless he names that scope.

EU/EEA sales remain blocked until jurisdiction-specific legal review and a
compliant service-withdrawal flow are complete, or those consumers are excluded
server-side. The crypto checkout has not solved this gate for a card or SEPA
processor.

Never collect raw card numbers or CVVs. Use hosted checkout or hosted fields.
Confirm adult-category eligibility, merchant-of-record responsibility,
descriptor, reserve, settlement, chargeback, privacy, retention, and geographic
terms in writing before integrating a provider.

## Shared pricing and checkout layout

`CRUUSH_PLUS_PLANS` in `server/src/billing.ts` is the only source for term,
amount, founder supply, and badge data. Never accept an amount from a client.

Current price facts:

| Term | Total | Monthly equivalent |
| --- | ---: | ---: |
| Six months | $65.94 | $10.99/month |
| Annual | $119.99 | $10.00/month |
| Founder annual | $99.99 | $8.33/month |

The former six-month pricing inversion is resolved. On every term of at least
one month, `/store` shows the monthly equivalent prominently on the right and
the total as the left-side subtitle. Weekly and lifetime show the one-payment
amount because they have no monthly rate.

The current crypto source picker shows only "Cash App", "Venmo or PayPal", and
"A crypto wallet". It intentionally has no "Something else" or "Other payment
options" item. A future card or SEPA choice must be concrete and must not
reintroduce a generic crypto label.

## cruush+ benefit truth

The checkout represents these seven paid capabilities:

1. Who has a cruush on you.
2. See who viewed your profile.
3. Send up to 3 Pulses every 24 hours.
4. Land on a nearby profile in Cruise Carousel, then browse again.
5. Use more than 3 seeking filter categories at once.
6. Use more than 3 visibility filters at once.
7. Use Dark Room to browse without appearing on the map.

Mile High Club and Feed+ are not implemented in this branch. They may be
advertised only after the corresponding v1.6 release-line work is merged and
verified.

Dark Room is not Ghost Mode, and it is never Stealth Mode. Basic members can
browse nearby profiles, post text to the local feed, and spin Cruise Carousel.
Do not present those basic actions as cruush+ benefits.

Keep one shared benefit source when the crypto and European payment work meet.
Do not let the surface that takes money drift from the v1.6 product rules.

The crypto page reloads the member's current active intent. It displays the
server expiry countdown, hides payable details when the window closes, and
locks plan and source selectors while an open or paid intent owns checkout.
If the restored intent's rail is unavailable, it stays selected and locked
through `paid`; readiness changes do not discard or switch payment state. A
European checkout needs equivalent server-owned expiry and selector locks.

## Crypto state to coordinate around

The crypto processor includes server-fixed rails, unique watch-only addresses,
a read-only watcher, settlement, the shared entitlement grant, and moderator
reconciliation. It is disabled by default.

Readiness is per rail. A crypto intent requires processor enabled, valid xpub,
watcher enabled, and an RPC URL for that rail's chain. Global readiness means
at least one rail is ready, not that every rail may accept funds.

An exact positive transfer is recorded and moves an awaiting intent to
`confirming` atomically. The watcher reads each candidate log's authoritative
block timestamp and validates its block number and hash. Only exact-rail funds
mined at or before `expires_at` can count; legacy evidence with no authoritative
timestamp never grants. A scheduler-expired intent may therefore settle an
on-time transfer that was still awaiting confirmations, but a transfer mined
after expiry never grants. Failed and cancelled intents never auto-settle or
grant. A confirming intent that remains unsettled seven days after quote expiry
becomes `failed`, while its transfer rows stay available to support. Terminal
intents return no payment URI or QR.

Every configured supported chain scans all bounded watchable addresses for the
known token contracts on that chain. Known wrong-chain and wrong-token
transfers are retained as non-creditable support evidence and never settle.
Unknown tokens and transfers first presented after the bounded watch still
need independent receipt ingestion. Transaction-hash input alone does not
solve that launch blocker.

The crypto path allows one active intent per member and reuses a compatible
open intent. `GET /api/crypto/payment-intents/current` restores it after a
reload. Create requests are limited to 5 per member per minute; the current and
intent-ID reads share 30 per member per minute. Watcher recipient queries batch
100 addresses at a time, and its QR cache is bounded at 256 entries.

Settlement locks member, intent, exact-rail confirmed transfer rows, then any
limited-plan supply lock. The locked transfer rows are re-summed inside the
same paid-and-grant transaction. Reconciliation's
`confirmed_money_not_settled` query uses that exact rail and the settlement
threshold of 50 basis points capped at 250000 atomic units ($0.25).

The visible crypto mappings are:

| Source | Rail |
| --- | --- |
| Cash App | USDC on Arbitrum |
| Venmo or PayPal | PYUSD on Arbitrum |
| A crypto wallet | USDC on Base |

PYUSD on Ethereum remains a hidden fallback. Dwellir's free plan is not the
selected watcher source because it rejected `eth_getLogs` with HTTP 403.
Arbitrum's public endpoint was exercised against real USDC logs, while Base and
Ethereum still require their own RPC URLs before those rails can be ready.

## Reconciliation shape

Crypto support routes are moderator-gated:

- `GET /api/crypto/support/payments`
- `GET /api/crypto/support/reconciliation`

They cover paid-without-entitlement, entitlement-without-payment,
confirmed-money-that-never-settled, orphan transfers, and flagged settlement.
Build the card or SEPA equivalent around the same concepts so support gets one
mental model. Preserve provider-native receipt evidence separately from
browser redirects.

Database constraints, not application checks alone, must prevent duplicate
grants and an entitlement without confirmed payment. Migration `098` is the
crypto reference.

## Decisions still required before European acceptance

1. Provider selection and written confirmation that the adult dating category
   is supported in each intended country.
2. Merchant-of-record, tax, sanctions, privacy, data-retention, reserve,
   settlement, dispute, chargeback, and forced-reversal responsibilities.
3. A compliant service-withdrawal flow and evidence model, reviewed for each
   intended jurisdiction.
4. Entitlement treatment after a lawful withdrawal, remedy, chargeback, or
   forced reversal.
5. Whether card, SEPA, or crypto leads for a European member.
6. Server-side EU/EEA exclusion until the legal flow is complete.

Do not claim processor approval, legal compliance, production readiness, or
deployment from this handoff.
