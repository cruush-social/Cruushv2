# feat/crypto-pricing

## Vision

A disabled-by-default, watch-only in-house crypto checkout for cruush+ that
another developer can review locally before any production decision.

## Requirements

- Account-linked payment intents with unique receiving addresses.
- Arbitrum-first USDC and PYUSD rails selected by payment app.
- Confirmed chain evidence is the only automatic entitlement trigger.
- Idempotent settlement, reconciliation, and moderator support lookup.
- Conversion-focused `/store` with exact real prices and no generic payment choice.
- Seven branch-present benefits. Browse-without-appearing is Dark Room; Ghost
  Mode remains separate. Unmerged v1.6 work is not advertised.
- Every visible payment rail must be independently ready before it can be
  selected or accepted.
- Every active watcher scan verifies chain ID before advancing a durable
  per-intent chain position.
- Only confirmed exact-rail transfers authoritatively timestamped by quote
  expiry may grant. Post-expiry and wrong-token transfers never grant access.
- Settlement re-sums locked exact-rail evidence in the paid-and-grant
  transaction; reconciliation uses the same 50-basis-point, $0.25-capped
  threshold.
- Active lifetime access blocks new crypto purchases. A successful shared
  lifetime grant closes pending and awaiting-payment intents but preserves
  confirming intents with observed funds.
- A restored unavailable payment rail remains selected and locked through paid.
- Recovery words and private keys never enter cruush or agent-visible state.

## Constraints

- Zero-dollar provider budget.
- No main merge, production deployment, processor activation, or live payment.
- Current feature-branch publication target only: `origin/feat/crypto-pricing`.
