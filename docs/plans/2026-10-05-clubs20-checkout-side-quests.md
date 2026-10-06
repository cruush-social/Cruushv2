# CLUBS20 checkout coupon and Club Side Quests plan

Date: 2026-10-05
Branch: `feat/clubs20-checkout-20261005`
Base: deployed `origin/main` at `3357b80da4ceace08d97c7f5c200c4169a863fe8`

## Authorized request

- “lets add a coupon code for this new update lets do 20% off”
- “and also lets add a checkout code thing for thecheckout”
- “clubs20”
- “lets add sidequests for clubs too”

## Existing state to preserve

- `/store` and `/store/pulse` share the existing checkout component and server-owned price catalog.
- Bitcoin and Cash App quotes are created from integer USD cents on the server.
- Existing Rewards promo codes grant cruush+ time; they are not purchase discounts and remain unchanged.
- Club membership records are encrypted and indexed through the existing Club enrollment layer.
- Side Quests are claimed once, with one claim per day and the current weekly cruush+ reward cap.
- Preserve every unrelated checkout, Club, Rewards, privacy, moderation, payment, and presentation behavior.

## Confirmed product behavior

- `CLUBS20` applies to both cruush+ and Pulse checkout products.
- The code can be redeemed once per account after a paid order.
- The code has no expiration or global redemption cap.
- Add two Club Side Quests:
  - `join_club`: “Join a Club”, 1 Pulse.
  - `send_club_message`: “Send your first Club message”, 1 Pulse.

Julien confirmed this exact setup with “sounds good” on 2026-10-05.

## Implementation plan

1. Add a server-owned checkout coupon definition for `CLUBS20`, calculate 20% off in integer cents, and never accept a client-provided price or percentage.
2. Add persistent coupon reservation/redemption state so one-use enforcement is atomic and an abandoned unpaid order does not permanently consume the code.
3. Add coupon validation/quote handling to both crypto intent routes, include audit-safe discount metadata on the order, and preserve payment idempotency and incompatible-intent checks.
4. Add the existing-style checkout code field and Apply control to the shared checkout surface. Show the original and discounted totals without changing unrelated layout or payment controls.
5. Add the confirmed Club quest keys to the existing catalog, completion lookup, API type, migration constraint, Rewards list, and Side Quest documentation.
6. Verify focused server/client tests, production builds, migration ordering, `git diff --check`, and the actual local checkout and Rewards UI at mobile and desktop sizes.

## Planned checkout copy

- Field label: `Coupon code`
- Placeholder: `Enter code`
- Button: `Apply`
- Applied state: `CLUBS20 applied. 20% off.`
- Invalid state: `That coupon code is not valid.`
- Used state: `This coupon code has already been used.`

## Deployment boundary

No commit, push, merge, migration run, or deployment is included until explicitly requested. No new environment variables are planned.
