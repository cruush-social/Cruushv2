# Handoff: feat/crypto-only

Worktree: `/Volumes/good/Cruushv2-crypto-release`
Branch: `feat/crypto-only`, five commits, branched from `origin/main` at `cad6048f`
Task contract: `AI_TASK.json`, status `active`

Nothing has been pushed. The branch does not exist on the remote, and no deployment
has been run. Crypto work must not reach production main.

This branch carries the in-house crypto payment processor and nothing else. The Pulse
pack interface, the map Pulse changes, and unrelated page edits that had been committed
alongside it on `feat/crypto-pricing` are deliberately excluded, so the processor can be
reviewed on its own.

---

## What actually works

Settlement is **proven end to end on a live chain**, which is the thing that had never
been true before. On Base Sepolia, a real faucet transfer was matched and granted:

| | |
|---|---|
| transfer | `confirmed`, 20000000 atomic, chain 84532, block 46318066 |
| tx | `0xf0e6bca084b5407d…` |
| intent | `896c8580-0c60-48e2-b9da-103d5d23cc60`, moved to `paid` |
| grant | `ping_3`, 3 pings, 299¢, granted 2026-09-02 23:02:59 |

That exercised the whole path: derive a watch-only address, quote the exact atomic
amount, read a real ERC-20 `Transfer` log, confirm it, settle idempotently, grant the
entitlement. It also covered the overpayment branch, since 20 USDC against a 2.99 order
settles as `settled_overpaid` and grants.

All five rail token addresses were verified against their live chains: correct symbol
and 6 decimals each, which matters because `quoteUsdCentsAsStablecoinAtomic` assumes 6.
The mainnet watcher is live and advancing (Arbitrum cursor moved 727467 to 729226 in 70
seconds).

## What is still unproven

**No mainnet transfer has ever been matched.** Everything upstream of that is verified,
and the settlement code that ran on Base Sepolia is the same code, but the final mainnet
step needs about $1 of USDC on Arbitrum. It lands in the treasury, so only gas is spent.

## Two bugs the test suite could not see

Both were found by running a real order against a real database and a real chain. The
suite was green throughout, before and after. This is the strongest argument for testing
this component live rather than trusting the tests.

1. **`41bc32d2`** — the watcher back-fills its own watch positions when it sweeps a
   chain, inserting a row for every open intent regardless of rail. Scoping the watch set
   at intent creation did not close the hole because the watcher rewrote it. It was
   symmetric, so a real mainnet order would have been watched on Base Sepolia, where USDC
   is free from a faucet. Anyone who noticed could have paid a genuine order with
   worthless tokens.

2. **`59dfe7f2`** — the watcher's chain list is a hardcoded array of the three mainnet
   rails. The new testnet rail advertised itself as ready and accepted a real order with a
   real address, but nothing ever read that chain, so the order could never settle. An
   offered rail must be a watched rail; there is now a test pinning that.

## Safety posture

The processor is off unless `CRYPTO_PROCESSOR_ENABLED` is set. Enabling it without a
valid xpub fails configuration validation at boot, and the watcher refuses to start
without a deliberately configured RPC endpoint.

The Base Sepolia rail is gated behind `CRYPTO_PROCESSOR_TESTNET_ENABLED`, which
configuration validation **refuses in production**, exactly as it already refuses
`BILLING_TEST_CHECKOUT_ENABLED`. With the flag off the rail is not advertised by the
status endpoint and both intent routes reject it. Testnet and mainnet watch sets are kept
strictly apart in both directions.

## Running it locally

```bash
npm run dev:local           # or: cd server && PORT=3022 npm run dev
cd server && DATABASE_URL="$(grep -hE '^DATABASE_URL=' .env.local | cut -d= -f2-)" npm run migrate:dev
```

The frontend expects the API at the port in `.env.local` (`VITE_API_BASE_URL`). Note that
`server/.env.local` sets `PORT=3031` while the frontend calls `3022`, so `dev:local`
starts the API on a port the frontend does not use. Start the API on 3022 with
`CORS_ORIGIN` set to the frontend origin, or reconcile the two values.

Sign in locally as `admin@cruush.local` / `admin-password`. The store is at `/store`.

To exercise settlement again, set `CRYPTO_PROCESSOR_TESTNET_ENABLED=true` and
`CRYPTO_PROCESSOR_BASE_SEPOLIA_RPC_URL=https://sepolia.base.org`, create a `ping_3` order
on rail `usdc_base_sepolia`, and fund the address from `faucet.circle.com` (Base Sepolia,
no account needed, 20 USDC per address per 2 hours).

## What is needed from Julien

- **The treasury xpub is software-generated.** `server/.env.local` holds an xpub created
  by `tools/cruush-wallet` on this Mac, not by a hardware device. The tool never wrote the
  seed to disk and cleared it from memory, but the words passed through this machine.
  Fine for testing; regenerate on the hardware device and swap
  `CRYPTO_PROCESSOR_WALLET_XPUB` before the address holds real money. It is a
  one-variable change and `configure-server-xpub` exists for it.
- **The mainnet proof**, if wanted: about $1 of USDC on Arbitrum, recoverable.
- Verotel credentials and reply, EU consent copy, and settlement policy sign-off remain
  outstanding from earlier and are unchanged by this branch.

## Test baseline

`tsc` clean. Server suite 1138 passing, 16 failing. Those 16 also fail on `origin/main`,
which is the commit production runs: they sit in `places.ts` and `routes/places.ts`, both
byte-identical to main here, and this branch's only `app.ts` change is crypto route
registration. The frontend suite has 79 pre-existing failures on the same basis. This
branch adds no new failure and fixes none of main's.

## Environment variables

New on this branch, both server-only:

| variable | default | note |
|---|---|---|
| `CRYPTO_PROCESSOR_BASE_SEPOLIA_RPC_URL` | empty | read-only JSON-RPC; may carry a key, never log it |
| `CRYPTO_PROCESSOR_TESTNET_ENABLED` | `false` | **refused in production** |

Both are documented in `server/.env.example`. Nothing was changed in any live service.
