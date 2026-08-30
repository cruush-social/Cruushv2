# Handoff: European payment processor

For whoever is building the European card/SEPA processor. Written 2026-08-30
from the crypto-processor branch `feature/v2-crypto-processor-20260822`, which
is **unpushed and not merged**. Read this before you touch billing, because we
overlap in exactly one dangerous place.

## The one thing that will break if you ignore this handoff

**Use `grantCruushPlusPlan` in `server/src/billing.ts`. Do not write your own
grant.**

There used to be one entitlement grant, inlined in `completeFakeCheckoutSession`.
This branch extracted it so the crypto path and the test-checkout path share it:

```ts
export type CruushPlusGrantSource =
  | { kind: "checkout_session"; sessionId: string; testMode: boolean }
  | { kind: "crypto_payment_intent"; intentId: string };

export async function grantCruushPlusPlan(app, userId, plan, source)
```

Add your own variant to `CruushPlusGrantSource` (something like
`{ kind: "card_payment"; paymentId: string }`) and a matching nullable column on
the paid-access tables, the way `crypto_payment_intent_id` was added in
migration `098`. Three implementations of "give someone cruush+" will drift, and
when they drift someone pays and gets nothing.

That function does **not** verify payment. It applies a grant already earned.
Proving the money is real is your job, same as it is the watcher's.

## Merge conflict warning

This branch modifies `server/src/billing.ts`, `server/src/config.ts`,
`server/src/errors.ts`, `server/src/index.ts`, `server/src/migrate.ts`, and
`src/app/components/CruushPlusStore.tsx`. If you are also in billing or config,
expect conflicts. Nothing is on `origin` yet, so coordinate with Julien on merge
order rather than assuming this will be there.

Migrations `096` through `099` are taken. Start at `100`. `migrate.ts` uses a
hardcoded ordered list, not directory discovery, and a migration that is not in
that list silently never runs. There is a test that catches the drift
(`migrate.test.ts`); it caught exactly that bug on this branch.

## Things already decided that constrain you

**cruush does not refund cruush+.** Recorded as product invariant **G7** in the
standing rules doc under `docs/`. It is a digital good delivered immediately.
Do not build refund flows or refund-offering copy.

**This is your problem more than it was ours.** In the EU a consumer buying
digital content has a 14-day right of withdrawal. The exemption cruush relies on
is conditional: it needs the consumer's **prior express consent** to performance
beginning immediately **and their acknowledgement** that this loses the
withdrawal right, both captured at checkout and retained as evidence. A line in
the terms is generally not enough. `/store` captures neither today. It is a
listed payment-launch gate in `docs/plans/v2-crypto-processor.md`.

A card processor also makes this sharper in a way crypto did not: **chargebacks
are refunds you do not get to refuse.** G7 governs what cruush offers, not what
a card network forces. Your reconciliation needs to handle a forced reversal and
decide what happens to the entitlement, and that is a policy question for Julien,
not an implementation detail.

**Never collect raw card data.** Hosted checkout or hosted fields only. cruush
must never receive a card number or CVV. This predates us and is in the plan doc.

**Prices come from the billing catalog only.** `CRUUSH_PLUS_PLANS` in
`server/src/billing.ts` is the single source of terms, amounts, founder supply
limits, and badges. Never accept an amount from a client. The crypto route
derives the price server-side from `planId` alone; do the same.

## What already exists that you should extend, not rebuild

**`/store`** (`src/app/components/CruushPlusStore.tsx`) is the checkout page. It
was reworked for conversion on 2026-08-30 and the choices are deliberate:

- The full cruush+ benefit list leads, as bright gradient tiles matching the
  rewards page. One implementation per surface.
- Every plan tile shows a per-month equivalent and a saving against the monthly
  price, so a longer term reads as a better deal rather than a bigger number.
- Founder scarcity counters are shown because they are real.
- The default selection is the best-value available term, never the cheapest,
  and never a sold-out one.
- The payment picker asks **which app you are paying from**, not which chain or
  coin. Naming the token was tried and removed: it is the jargon the picker
  exists to eliminate. If you add a card option, add it as another entry in
  `PAYMENT_SOURCES` in the same voice, not as a separate concept.

There are tests locking the conversion behaviour in
`src/app/components/CruushPlusStore.test.tsx`. If you change the defaults you
will fail them; that is the point. Update them deliberately, do not loosen them.

**Support and reconciliation** already exist in
`server/src/crypto-reconciliation.ts`, exposed moderator-gated at
`GET /api/crypto/support/payments` and `GET /api/crypto/support/reconciliation`.
The exception report covers paid-without-entitlement,
entitlement-without-payment, confirmed-money-that-never-settled, orphan
transfers, and flagged settlements. Build the card equivalent to the same shape
so support has one mental model, and consider a combined view rather than a
second dashboard.

**Idempotency is enforced in the database, not just in code.** Look at migration
`098` before designing yours: a check constraint refuses an entitlement record
on an intent that is not paid, another refuses a paid intent with no confirmed
amount, and unique partial indexes stop a second subscription or lifetime record
being created for the same payment. Application-level guards alone were
considered insufficient for money. Copy the approach.

## Business context you will otherwise rediscover the hard way

**There is a pricing inversion, unfixed.** 6 months at $59.94 is $9.99/month;
1 year at $119.99 is $10.00/month. The annual plan is *worse per month* than the
half-year plan, so there is no rational reason to buy it, and the per-month
figures are now displayed on the checkout page where customers can see it.
Fixing it is Julien's pricing decision, not ours. Raise it with him.

**The crypto rails lean American, which is the opposite of the mandate you are
under.** PYUSD is issued by Paxos Trust Company, a US entity. The rails were
chosen for reach into Cash App, Venmo, and PayPal, which are US consumer apps.
Your European processor is the counterweight to that, and it is probably the
primary rail for European members rather than a secondary option. Worth agreeing
with Julien which audience each rail is actually for before you design the
checkout hierarchy.

**Julien has no budget for paid APIs or usage-based services right now.** Pick
free tiers, and state the arithmetic rather than saying something is cheap. If a
processor needs a paid plan or a card on file to start, say so before building
on it.

**What cruush+ actually does is changing.** Julien is building new cruush+
capabilities on a different branch. The benefit list is currently duplicated:
`PLUS_BENEFITS` in `CruushPlusStore.tsx` and `CRUUSH_PLUS_FEATURES` in
`Rewards.tsx`. Two hardcoded lists on two pages, one of which takes money. When
his new work lands, whoever gets there first should collapse these into one
shared source. Flagged, not fixed, because it is his copy.

## Current state of the crypto side

Disabled end to end. Processor off, no wallet xpub, no chain endpoints, watcher
off, and configuration refuses to start the watcher unless the processor is
enabled and an endpoint is set. Creating an intent returns
`503 CRYPTO_PROCESSOR_NOT_READY`. It has never made a live RPC call.

Rails are USDC and PYUSD on Arbitrum (primary), PYUSD on Ethereum (fallback),
USDC on Base (last; it reaches none of Cash App, Venmo, or PayPal). Contract
addresses were verified against Circle's and Paxos' own documentation, not
block explorers.

Full detail, including every settlement policy decision and its reasoning, is in
`docs/plans/v2-crypto-processor.md`. Branch state and open blockers are in
`FABLE_HANDOFF.md`.

## Open questions worth putting to Julien together

1. Which rail leads for a European member: card/SEPA or crypto? The checkout
   currently assumes crypto is the only option.
2. What happens to an entitlement on a chargeback, given G7.
3. Whether the withdrawal-right consent flow is built once for both processors,
   which seems obviously right, and who writes the copy. Julien writes cruush's
   copy; neither of us should invent it.
