# Session intent: finish feat/crypto-pricing

**Updated:** 2026-09-01

## Job statement

Finish every branch-safe part of the disabled crypto processor, rebuild `/store`
for conversion, remove generic payment choices, create the local software wallet
through a user-only recovery-word flow, verify the real local checkout, and push
only `feat/crypto-pricing` for developer review.

## Success criteria

- The recommended plan, payment source choices, and CTA fit in the first phone viewport.
- Weekly is $10.99, matching the live Sniffies weekly tier minus $1, with no monthly equivalent.
- Six months is $65.94 total and is shown as $10.99/month.
- Annual remains $119.99 and founder annual remains $99.99 because Sniffies has no annual tier.
- For every term of at least one month, the monthly rate occupies the prominent right side and the charged total sits under the term on the left.
- The checkout names seven benefits implemented in this branch without selling unmerged Mile High Club or Feed+, free map, feed-text, or basic nearby-browsing behavior.
- The activity benefits use the exact phrase Who has a cruush on you and separately include profile views.
- The browse-without-appearing benefit is called Dark Room. Ghost Mode is separate.
- Cash App, Venmo or PayPal, and a crypto wallet are the only visible payment sources.
- A restored intent keeps its original payment source and locked selectors
  through paid even when that rail becomes unavailable.
- Every active watcher scan verifies chain ID before advancing its durable
  per-intent chain position. Candidate transfer time comes from a matching
  canonical block, not the watcher clock.
- Settlement re-sums locked, confirmed, pre-expiry exact-rail evidence in the
  paid-and-grant transaction. Transfers mined after expiry never grant.
- Active lifetime access blocks new crypto purchases. A successful shared
  lifetime grant closes pending and awaiting-payment intents while preserving
  confirming intents with observed funds.
- Confirmed-money reconciliation uses the settlement tolerance of 50 basis
  points, capped at $0.25, on the exact rail.
- Wallet recovery words and private keys never enter agent-visible output or storage.
- Focused tests, builds, rendered desktop/mobile inspection, and the payment-source interaction pass.
- The verified slice is committed and pushed only to `origin/feat/crypto-pricing`.

## Boundaries

- No merge to main, production deployment, processor activation, transaction broadcast, or real payment.
- Processor and watcher remain disabled.
- The user alone handles the wallet live-presence challenge and recovery-word screen.
- Legal approval, hardware-wallet migration, mainnet signing, and real settlement remain separate gates.
