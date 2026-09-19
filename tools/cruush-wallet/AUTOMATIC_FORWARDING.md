# Automatic forwarding to ELLIPAL

The website creates a unique receiving address for each order. After payment qualifies, the separate forwarding service sends the balance to cruush's ELLIPAL destination automatically. No per-order command or approval is required.

The website holds public address-derivation keys only. The forwarding service holds private receive-chain keys for the processor wallet. It never needs the ELLIPAL recovery words. This is the real signing and broadcast implementation used in production as well as local integration testing.

## One-time owner setup, after code review

Julien explicitly deferred Bitcoin wallet setup until code completion. The existing EVM cold destination is `0x929dbb0E43D1CfD62632c21387f1a248c4c85501`. A Bitcoin destination has not yet been supplied.

1. In the existing ELLIPAL account, enable Bitcoin if it is not listed, select Bitcoin, and open Receive. Verify the receiving address on the hardware device. Bitcoin is already a supported ELLIPAL asset; this does not require buying another wallet. [ELLIPAL setup and receiving guide](https://www.ellipal.com/pages/titan-wallet-setup), [Bitcoin support](https://www.ellipal.com/pages/bitcoin-wallet).
2. On the owner's private terminal, build `tools/cruush-wallet` with `npm ci` and `npm run build`.
3. Create a private directory outside the repository, website directory and Docker build context. Run `node dist/cli.js setup-forwarding /absolute/private/path/forwarding.json`. Supply the public Bitcoin address and the existing **processor software-wallet** recovery words at the hidden prompt. Never use ELLIPAL words here. The command checks that these words match the existing public processor descriptor before writing anything.
4. The command writes a new mode-0600 file containing only the EVM and Bitcoin receive-chain private keys and the public Bitcoin destination. Keep a protected backup. It prints the public `CRYPTO_PROCESSOR_BITCOIN_WALLET_XPUB` value for the website; it does not print private keys.
5. Configure the application and forwarding service as listed below. The existing public EVM xpub stays unchanged. Bitcoin uses the new BIP84 public receive-chain key, not the Base address.

The default public descriptor is at `~/Library/Application Support/cruush/operator-wallet/public-descriptor.json`. The private setup must run as its owner. Never put the generated private file into Git, app logs, chat, or a frontend environment variable.

## Application configuration

Set these on the API service that creates orders and observes payments:

| Variable | Value |
| --- | --- |
| `CRYPTO_PROCESSOR_ENABLED` | `true` |
| `CRYPTO_PROCESSOR_WATCHER_ENABLED` | `true` |
| `CRYPTO_PROCESSOR_WALLET_XPUB` | Existing EVM public receive-chain xpub |
| `CRYPTO_PROCESSOR_BITCOIN_WALLET_XPUB` | Public xpub printed by setup, derived at `m/84'/0'/0'/0` |
| `CRYPTO_PROCESSOR_BITCOIN_ESPLORA_URL` | Bitcoin mainnet Esplora API base URL, for example `https://blockstream.info/api` |
| `CRYPTO_PROCESSOR_BASE_RPC_URL` | Base mainnet JSON-RPC endpoint |
| `CRYPTO_PROCESSOR_ARBITRUM_RPC_URL` | Arbitrum One mainnet JSON-RPC endpoint |
| `CRYPTO_PROCESSOR_ETHEREUM_RPC_URL` | Ethereum mainnet JSON-RPC endpoint |
| `CRYPTO_PROCESSOR_INTENT_TTL_MINUTES` | `1440` |

Run application migrations through 127 before starting this revision. Bitcoin always requires six confirmations. Stablecoin confirmation thresholds retain their existing values. Empty network configuration means that route has no functioning network connection; this is a genuine setup requirement, not a separate demo implementation.

## Forwarding service

The supplied `deploy/compose.yml` builds and runs the real service with automatic restart. It needs `DATABASE_URL` for the same processor ledger, the same mainnet endpoint variables, and `CRUUSH_FORWARDING_KEY_FILE` pointing to the private file on that host. It exposes no public port.

The container runs as the Node user, UID 1000. The mounted file must be owned by that service user and have mode 0600; its parent should be private. Provision the file through the owner's existing private server access, not through the website. Docker mounts it read-only at `/run/cruush/forwarding.json`.

Start with `docker compose -f deploy/compose.yml up -d --build` from `tools/cruush-wallet`, after supplying the environment. Alternatively, the same implementation runs directly as `node dist/cli.js forward /absolute/private/path/forwarding.json` under a persistent service manager. Startup begins real collection of qualifying paid orders.

For stablecoins, the processor's index-0 address needs native ETH on each supported EVM network. The service uses that balance to fund receiving addresses automatically. Customers reimburse the estimated value through the collection fee in their payment; stablecoin cannot itself pay an ETH transaction. This is a working gas balance to replenish, not manual withdrawal of individual orders. Bitcoin takes its forwarding network fee directly from the received BTC.

## Persistence and retries

`crypto_payment_collections` records each collection job. The service stores the exact signed bundle before broadcast, checks existing receipts on retry, and rebroadcasts the same transaction after restart. PostgreSQL advisory locks serialize each wallet/network's work so two service instances cannot allocate conflicting treasury nonces.

The destination is validated again before broadcast. EVM transfers pay the pinned ELLIPAL address. Bitcoin creates one output to the configured ELLIPAL Bitcoin address and validates the input transactions, scripts, values, canonical blocks and six confirmations before signing.

If the current collection cost exceeds the customer's stored budget, or required ETH is unavailable, the job remains waiting and retries automatically. A long delay or a payment split into many Bitcoin outputs may need operational attention because a quote cannot guarantee future network prices. Receiving addresses remain controlled by the processor keys while waiting; money is not lost when an order timer ends.

This service does not convert assets between networks or automatically replenish ETH through an exchange. ELLIPAL receives each supported asset on the network where the customer paid. Enable the relevant asset/network in its app to view it.

## Evidence boundary

Real signature construction and destination validation were exercised with public, unfunded test keys. Native Bitcoin settlement was exercised against PostgreSQL with controlled chain evidence for both cruush+ and Pulse. This session has not handled owner private keys, broadcast a mainnet collection, or verified funds arriving in the owner's Bitcoin wallet. Those runtime checks depend on the one-time setup Julien deferred.
