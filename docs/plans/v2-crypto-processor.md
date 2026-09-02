# cruush v2 crypto processor plan

Last updated 2026-09-01. This revision records the current multi-rail,
account-linked checkout, disabled-by-default settlement path, and local
software-wallet boundary.

This is an engineering plan. It does not establish licensing, tax, sanctions,
consumer-protection, banking, or payment-provider conclusions. Those questions
require current professional review before real payments are enabled.

## Product outcome

The `/store` page sells fixed terms of cruush+ through one payment. A signed-in
member chooses a term and a concrete source, receives one unique address for
the server-selected stablecoin rail, sends the quoted amount, and sees status
updates on the same page. Nothing renews automatically.

Checkout stays linked to the member account so confirmed payment can grant the
selected term without a voucher, code, or second redemption step.

Card payment is a separate future integration. No card processor, approval,
timeline, API contract, or commercial term is assumed in this plan. cruush must
never collect raw card numbers or CVVs.

## Current authoritative state, 2026-09-01

Worktree: `/Volumes/good/Cruushv2-crypto-release`

Branch: `feat/crypto-pricing`

Publication target: `origin/feat/crypto-pricing` only. The remote feature
branch exists. This plan does not establish the final commit or push state;
record fresh SHA and ahead/behind evidence after final verification. This plan
does not authorize a merge, `main` push, deployment, live funds, or processor
activation.

The processor, watcher, settlement, and support implementation exist but stay
disabled by default. Readiness is per rail: processor enabled, valid xpub,
watcher enabled, and that rail's chain RPC URL are all required before an
intent may be created. Global readiness means at least one rail is ready, not
that every rail can accept funds.

Visible source mappings are fixed:

| Checkout source | Rail |
| --- | --- |
| Cash App | `usdc_arbitrum` |
| PayPal | `pyusd_arbitrum` |
| A crypto wallet | `usdc_base` |

`pyusd_ethereum` remains hidden fallback capacity. Do not expose "Something
else" or "Other payment options". These labels provide no useful crypto
direction.

For plans of at least one month, checkout displays the monthly equivalent
prominently on the right and the total as the left-side subtitle. Weekly and
lifetime retain their one-payment amount.

| Term | Total | Monthly equivalent |
| --- | ---: | ---: |
| Six months | $65.94 | $10.99/month |
| Annual | $119.99 | $10.00/month |
| Founder annual | $99.99 | $8.33/month |

The checkout advertises these seven verified release benefits:

1. Who has a cruush on you: see your full incoming cruush and profile-view lists.
2. More Pulses: send more Pulses throughout the day.
3. Mile High Club: drop a pin where you are visiting and cruise from there.
4. Feed+: add up to three photo hearts, post to a specific Crowd, and choose when your post expires.
5. Cruise carousel: spin through nearby profiles and browse again.
6. All seeking and visibility controls: use all seeking filters, combine more visibility controls, and add up to 10 searchable profile tags. Basic includes 3.
7. Dark Room: browse the map without appearing on it.

Dark Room and Ghost Mode are separate. Never call Dark Room Stealth Mode or
Ghost Mode. Basic members can browse nearby profiles, post text to the local
feed, and spin Cruise Carousel; those are not paid benefits.

Settlement is fail-closed. An exact positive transfer is stored and moves an
awaiting intent to `confirming` atomically. Every candidate transfer gets an
authoritative block timestamp whose block number and hash must match the log.
Only exact-rail evidence mined at or before `expires_at` may count, and legacy
evidence with a null timestamp never grants. A scheduler-expired intent may
settle only that on-time evidence if confirmation finished after the checkout
window; a transfer mined after expiry never grants. Failed and cancelled
intents never auto-settle or grant. A confirming intent that remains unsettled
seven days after quote expiry becomes `failed`, with transfer evidence
preserved. Configured supported chains also retain known wrong-chain and
wrong-token transfers as non-creditable evidence. Terminal intents return no
retired payment address, payment URI, or QR.
The moderator-only receipt-recovery route handles supported token transfers
first presented after the bounded watch window. A supplied transaction hash is
only a lookup key. The server independently verifies the canonical receipt and
reuses the same exact-rail, origin, expiry, confirmation, and atomic settlement
rules. Unknown tokens never grant.

cruush+ is an ongoing interactive digital service, not immediate digital
content. Immediate access plus a checkbox does not generally erase an EU
consumer's 14-day withdrawal right before full performance. EU/EEA sales remain
blocked until a jurisdiction-specific compliant service-withdrawal flow is
reviewed and complete, or those consumers are excluded server-side. No generic
voluntary refund tooling is planned, but legally required withdrawals, refunds,
remedies, and forced reversals remain possible and must be recorded truthfully.
Checkout and the billing policy link to a prefilled `/support?refund=1` review
request. It does not promise a refund or execute a refund transaction.

## Hard safety boundaries

- The cruush browser application, API server, database, deployment environment,
  logs, and support tools must never accept, request, store, or transmit a seed
  phrase, private key, extended private key, or wallet signing credential.
- A separate local operator tool is the only component permitted to handle
  recovery words. It accepts them only through a hidden interactive terminal,
  keeps them only for the current process, and never accepts them through a
  command argument, environment variable, file, pipe, or agent session.
- The local operator tool never stores a recovery phrase, private key, xprv, or
  signing credential. The operator keeps the recovery words physically.
- No model, agent, screen share, support session, issue, log, screenshot, or
  source file may observe real recovery words, a private key, or an xprv.
- Server configuration may contain only a watch-only receive-chain xpub.
- Treat the xpub as privacy-sensitive server configuration. It reveals a branch
  of public addresses even though it cannot sign transactions.
- Derive a unique receiving address for every payment intent.
- Never reuse an address after it has been assigned to an intent.
- Browser input and browser redirects are display-only. They never mark a
  payment confirmed and never grant cruush+.
- Keep `CRYPTO_PROCESSOR_ENABLED=false` until every real-money gate in this
  document passes.
- Never enable a test-vector xpub outside automated tests.
- Until an explicit later review enables mainnet, the local tool may sign only
  Base Sepolia transactions and may never broadcast them.

An xpub alone cannot authorize a spend. That does not make a compromised server
harmless: an attacker controlling the application could redirect future
checkout addresses or falsify display state. Address verification, chain-source
validation, reconciliation, and deployment integrity remain required.

## Current local implementation

The authoritative worktree, branch, and publication boundary are recorded in
the dated state section above. Historical SHAs and old worktree paths below are
verification context only. They are not current publication evidence. Nothing
in this document establishes deployment or production activation.

Implemented locally:

- Migrations `116` through `123` are the complete ordered crypto schema slice:
  `116` creates intents and event intake, `117` adds the multi-asset/network
  rails, `118` adds observed transfers, cursors, settlement constraints, and
  paid-access references, `119` adds Arbitrum, and `120` adds the durable
  intended-chain watch-start block. `121` adds per-intent origins and cursors
  for every supported chain plus authoritative transfer block timestamps. `122`
  changes the database fallback for new order windows to 60 minutes. `123`
  identifies cruush+ versus Ping pack intents and adds the permanent Ping grant
  ledger. `server/src/migrate.ts` lists all eight.
- `server/src/crypto-wallet.ts` validates a depth-4 public receive-chain xpub,
  rejects xprv-shaped input, derives non-hardened public children, converts them
  to checksummed Ethereum addresses, fingerprints the configured xpub, and
  quotes USD cents as supported six-decimal stablecoin atomic units.
- Server wallet derivation uses `@scure/bip32` and `@noble/hashes`. It includes
  no mnemonic, private-key, transaction-signing, or broadcast capability. The
  watcher RPC client is separate and read-only.
- `server/src/crypto-payments.ts` allows one active intent per member, reuses a
  compatible open intent, reserves the derivation index before deriving the
  address, and moves a new intent from `pending` to `awaiting_payment` inside
  one transaction. Payment QR work is cached in a 256-entry bounded cache.
- `server/src/routes/crypto-payments.ts` exposes authenticated status, intent
  creation, cancellation, `GET /api/crypto/payment-intents/current`, and ownership-scoped
  intent lookup. Before address allocation it verifies the selected endpoint's
  chain ID and reads its head, which is persisted by migration `120` as the
  intended-chain watch origin. Creation is limited to 5 requests per member per
  minute; current and ID lookup share 30 reads per member per minute. Pricing
  always comes from the existing server billing catalog.
- `server/src/crypto-watcher.ts` catches an intended chain up from the durable
  per-intent chain origin or cursor in bounded block ranges. Before every active
  scan it verifies `eth_chainId`; a mismatch aborts before the head, logs, or
  cursor writes. Every configured supported chain scans every bounded watchable
  address for the known tokens on that chain, splitting recipient filters into
  batches of at most 100. Known wrong-chain and wrong-token transfers are
  retained as non-creditable evidence. Exact positive evidence is recorded with
  the awaiting-to-confirming transition in one database statement.
- `server/src/billing.ts` stacks finite crypto grants atomically from the later
  current subscription end, entitlement end, or now. It refuses duplicate
  lifetime access, blocks every new crypto purchase after lifetime access is
  active, and atomically closes `pending` and `awaiting_payment` crypto intents
  after a successful shared lifetime grant. It preserves `confirming` intents
  so already observed funds can settle. Founder annual and lifetime founder
  reservation and grant checks remain serialized against their 1,000 and 1,000
  supply caps. Regular lifetime cruush+ costs $1,999.99 and remains hidden and
  server-blocked until all 1,000 real lifetime founder spots are redeemed.
- `server/src/ping-packs.ts` and migration `123` keep Ping packs separate from
  cruush+ grants. The fixed catalog is 3 Pings for $2.99, 10 for $7.99, and 25
  for $14.99. Each settled order creates one idempotent, member-linked
  `ping_pack_purchases` row. Purchased credits do not expire. Included daily
  Pings are used first, and every activated Pulse still lasts 30 minutes.
- `src/app/components/PingPackStore.tsx` renders the account-linked
  `/ping-packs` flow and reuses the same protected order, payment-source,
  cancellation, exact transfer-guide, billing-policy, and legal-review
  boundaries as cruush+ checkout.
- `src/app/components/CruushPlusStore.tsx` renders the account-linked `/store`
  flow. It has no voucher, asset, or network picker. It asks for a concrete
  payment source and maps it to server-fixed Arbitrum or Base metadata. PYUSD
  on Ethereum remains hidden fallback capacity. It restores the current active
  intent, displays the server expiry countdown, hides payable details after
  expiry, and locks plan and source selectors while an open or paid intent owns
  checkout. A restored unavailable rail remains selected and locked through
  `paid`, so a readiness change cannot discard or switch payment state.
  New intents use a 60-minute server deadline. A member can cancel only while
  the intent is `pending` or `awaiting_payment`; cancellation retains the row
  and member link, closes the deadline, and never reuses the assigned address.
  The next source creates a new intent. `confirming` and `paid` intents cannot
  be cancelled.
- The existing `/upgrade` route keeps its prior destination. `/store` is added
  without replacing the existing rewards checkout flow.
- `tools/cruush-wallet` is an isolated local operator package. It validates and
  inspects the active public descriptor, derives public addresses, atomically
  configures only the public xpub in a local server environment, prepares
  bounded Base Sepolia or supported-mainnet gas-funding and stablecoin sweep
  bundles, signs them offline, and broadcasts only after exact confirmation.
  Recovery words, private keys, and xprv data must never enter an agent, file,
  argument, environment variable, pipe, log, screenshot, or chat.

## Evidence boundary

Final focused tests, builds, rendered screenshots, and branch SHA are recorded
from the exact published tree in `AI_TASK.json`. The first untrusted public
descriptor remains quarantined. Its replacement was written only after hidden
exact re-entry of all 24 recovery words and passed public permission,
fingerprint, address, and secret-field validation. No controlled mainnet
receipt, transaction broadcast, production configuration, deployment, or live
payment is established by this document.

## Watch-only wallet contract

Current code expects `CRYPTO_PROCESSOR_WALLET_XPUB` to be the public
receive-chain node at `m/44'/60'/0'/0`, which is depth 4. The server derives one
non-hardened child index below that node for each intent.

Before any real address is shown to a customer:

1. Export the receive-chain xpub directly into server configuration. Do not send
   it through chat, issue text, logs, or screenshots.
2. Derive several indexed addresses in the application and independently on the
   selected wallet.
3. Confirm every address matches exactly, including checksum casing.
4. Confirm the wallet can locate and spend from those child paths without
   importing signing material into the server.
5. Record the verified wallet software, export path, and recovery procedure in
   a private operational document.

If the selected wallet cannot export or later spend from this receive-chain
structure reliably, stop. Change the address-allocation design before enabling
payments. Do not work around it by importing an xprv or seed phrase.

## Zero-cost software wallet contract

The session checks are accident guards, not a security boundary. They require
direct TTY input/output, refuse recognized agent/CI environments, remote
shells, and common terminal recorders, and require an unpredictable live
presence response before any recovery word is written. A deliberate same-user
process or pseudo-terminal driver can still bypass heuristics and capture the
raw stream.

The operational boundary is therefore human-controlled: use a normal local
macOS Terminal; close Codex, Claude, screen sharing, terminal recording, and
remote-control apps before answering the live-presence challenge; keep them
closed until the alternate recovery-word screen clears and Terminal closes;
write the words only on paper; never use clipboard, screenshots, files, chat,
arguments, environment variables, pipes, or redirection. No agent may answer
the challenge, observe the recovery screen, or inspect Terminal output.

The approved wallet is a local operator tool under `tools/cruush-wallet`. It is
not part of the cruush client, server, container image, or deployment. No
hardware wallet or paid custody provider is required for this development
slice.

The operator tool uses the standard Ethereum derivation layout:

- Receive-chain public node: `m/44'/60'/0'/0`
- Treasury address: `m/44'/60'/0'/0/0`
- Payment-intent addresses: `m/44'/60'/0'/0/i`, where `i` starts at `1`

The database identity sequence starts at `1`, reserving child index `0` for the
treasury address. The server receives only the depth-4 receive-chain xpub and
continues deriving payment addresses without signing capability.

Initial setup generates recovery words locally and displays them only in an
interactive terminal. The operator writes them down physically, then re-enters
all 24 words at a hidden prompt. The tool writes nothing unless that backup
exactly matches the generated wallet. It emits only the public xpub, its
fingerprint, and public addresses after the recovery words are no longer
displayed. After private verification, it writes an allowlisted descriptor to
`/Users/julienlenaz/Library/Application Support/cruush/operator-wallet/public-descriptor.json`.
The fixed current-user path is preflighted before entropy generation. Its
wallet directories must be owned by the current user with mode `0700`; the
descriptor is a no-clobber regular file with mode `0600`. Existing targets,
links, unsafe permissions, ownership changes, and detected directory swaps are
refused. Node cannot make a final path unlink conditional on inode identity,
so a published descriptor is never unlinked after ambiguous validation
failure. The current same-UID macOS user remains the filesystem trust boundary.
The file contains no recovery words, private key, or xprv. An agent may test
this path only with public deterministic vectors. An agent may prepare and
launch the dedicated normal-Terminal initializer, but must stop before the
live-presence response and must never inspect its output. Julien alone answers
the challenge, records the recovery words, confirms them, and closes Terminal.

Signing is deliberately manual. An online process prepares a bounded unsigned
transaction plan. The operator disconnects the signing computer from the
network, enters the recovery words through hidden terminal input, verifies the
displayed source, destination, amount, fee ceiling, chain, and token contract,
and signs. The signed bundle returns to a fresh online Terminal for a separate
broadcast step. The broadcaster verifies the current descriptor and signed
transactions, checks the RPC chain ID, sends child gas funding only when needed,
waits for its successful receipt, then sends the full token-balance sweep and
waits for that receipt. Supported rails are Base Sepolia USDC, Arbitrum USDC and
PYUSD, Base USDC, and Ethereum PYUSD.

Software custody cannot remove host-compromise risk. Malware present while the
recovery words are entered can steal them. Minimum operating controls before a
recovery drill are FileVault, the current `julienlenaz` macOS user, current
operating-system patches, no cloud-synced secret material, no remote-control or
screen-share session, and a disconnected network during secret entry. A
separate offline computer would reduce risk but is not required by the current
zero-dollar build scope.

Every derived payment address needs the chain's native gas before it can send
its stablecoin to treasury. The planner funds only the missing bounded amount.
Production RPC selection, gas-budget approval, hardware-wallet migration, and a
disposable-wallet broadcast drill remain pre-production gates. Customer checkout
can remain seamless while those operator actions remain manual. No generic
voluntary refund-signing workflow is planned. Exceptional or legally required
withdrawals, refunds, remedies, and forced reversals still need a truthful
operator procedure.

## Payment lifecycle

Current states:

1. `pending`: database intent reserved; no address returned yet.
2. `awaiting_payment`: unique address and exact rail amount assigned.
3. `confirming`: a positive exact-chain, exact-token transfer mined by
   `expires_at` was recorded; the total may still be short or below the
   confirmation target.
4. `paid`: configured confirmation target reached and settlement checks passed.
5. `expired`: the checkout window closed. It may settle only exact-rail evidence
   whose authoritative block timestamp proves the funds arrived by
   `expires_at`; transfers mined later never grant.
6. `failed` or `cancelled`: no entitlement grant.
7. `refunded`: not a normal product path. It exists so an exceptional, legally
   required, or forced refund can be recorded truthfully.

Allowed transitions are explicit and forward-only. A scheduler-expired intent
can become `paid` only for on-time exact-rail evidence that finished confirming
after expiry. The watcher may retain later evidence during the bounded window,
but a post-expiry transfer never grants. A `confirming` intent that has not
settled seven days after its quote expired becomes `failed`, while its transfer
rows remain available to support.

Only one active intent may exist per member. A compatible open intent is reused
instead of allocating another address, and
`GET /api/crypto/payment-intents/current` restores it after reload. An address
does not become payable until the selected endpoint identifies the intended
chain and its current head is stored as the durable watch origin. The watcher
can then advance an open intent through `confirming` to `paid` and call the
shared entitlement grant, but all live gates remain disabled by default.

## Next implementation slices

### 0. Local software wallet

- Generate recovery words from operating-system cryptographic randomness only.
- Refuse secret input unless both input and output are interactive terminals.
- Refuse secret-bearing commands inside detected Codex, Claude, or CI sessions.
- Never accept recovery words through arguments, environment variables, files,
  pipes, or redirected input.
- Derive the depth-4 receive-chain xpub and independently match public addresses
  at indices `0`, `1`, and multiple nontrivial test indices.
- Sign only strictly validated Base Sepolia gas-funding and USDC sweep plans.
- Never include an RPC client or broadcast command in the signing package.
- Keep signing dependencies outside the production server package and image.
- Require independent cybersecurity review before a recovery drill or testnet
  transaction.

### 1. Chain source and watcher

Built 2026-08-30, disabled by default. `server/src/crypto-chain-source.ts` is a
read-only JSON-RPC client, `server/src/crypto-watcher.ts` is the watcher, and
`server/src/crypto-watcher-runtime.ts` schedules it.

Request and response shapes were taken from the current official Ethereum
JSON-RPC documentation, which Base implements, and are quoted in the header of
`crypto-chain-source.ts`:

- `eth_blockNumber` request `{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":83}`,
  response `{"id":83,"jsonrpc":"2.0","result":"0x4b7"}`.
- `eth_chainId` request `{"jsonrpc":"2.0","method":"eth_chainId","params":[],"id":84}`,
  response `{"id":84,"jsonrpc":"2.0","result":"0x2105"}`.
- `eth_getBlockByNumber` reads the authoritative timestamp for a candidate log.
  The watcher requires the returned block number and hash to match the log
  before the timestamp may make that evidence creditable.
- `eth_getLogs` takes a filter object with `fromBlock`, `toBlock`, `address`,
  and `topics`; each returned log carries `address`, `topics`, `data`,
  `blockNumber`, `transactionHash`, `transactionIndex`, `blockHash`,
  `logIndex`, and `removed`, where `removed` is documented as "true when the log
  was removed, due to a chain reorganization".

Status of each item:

- Select and document the JSON-RPC source. **Arbitrum's own public endpoint,
  `https://arb1.arbitrum.io/rpc`, decided 2026-09-01 after Dwellir was tried and
  rejected on evidence.**

  Dwellir was recommended and an account was created, on arithmetic about
  request volume: roughly 2,900 requests a day on this chain, far inside their
  free allowance. That reasoning was wrong, because volume was never the binding
  constraint. Their free plan refuses the method:

  ```
  HTTP 403  Your current plan does not support the eth_getLogs method.
  ```

  `eth_getLogs` is not incidental here, it is the only thing the watcher does.
  A provider that gates it cannot run this workload at any volume. The lesson is
  narrow and worth keeping: check that a plan permits the method before sizing
  the request count.

  Arbitrum's public endpoint answers the same query with no account and no key,
  verified 2026-09-01 returning 2,264 real USDC transfers across a 1,000-block
  range. It carries no availability guarantee, which is the trade being made
  knowingly: nothing is being paid for, and switching to a paid provider later
  is one environment variable because nothing in the code is provider-specific.

  **The chain source was verified against it end to end on 2026-09-01**, the
  first time this code had spoken to a real node rather than a fake. Reading a
  200-block range of the pinned USDC contract returned 456 logs, all 456 of
  which decoded as valid ERC-20 transfers with the expected token address and
  six-decimal amounts. Before this, every test used an injected fake source, so
  the JSON-RPC client, the hex parsing, the topic filter, and the transfer
  decoder had never been exercised against production data.

  **The disabled and idle paths make no RPC request.** Three things bound the
  active read workload:

  1. **No payment in progress means no request at all**, not even a head read.
     A pass checks the database for watchable intents and returns before
     touching the chain if there are none. Assigned addresses may remain in the
     ledger, but none is inside an automatic-settlement or bounded-evidence
     watch state. Cost scales with relevant checkouts, not with uptime.
  2. **Abandoned checkouts stop being watched** seven days after they expire.
     This closes the largest long-run leak in the design: accepting late
     payment without a bound means every abandoned checkout is watched forever,
     so the watch set only ever grows and the watcher polls for eternity on
     payments that will never arrive. A post-expiry transfer never grants; a
     scheduler-expired intent may settle only exact-rail evidence whose
     authoritative timestamp proves arrival by `expires_at`. Evidence not
     ingested during the bounded window needs a separate verified support path;
     a member-supplied hash is not enough.
  3. **The poll is 60 seconds, not 30.** The confirmation target dominates the
     member's wait anyway (about 60 seconds on Base, about 2.4 minutes on
     Ethereum), so polling twice as often would halve nothing anyone would
     notice while doubling requests.

  Before an address is issued, the create route checks the selected endpoint's
  `eth_chainId`, then reads `eth_blockNumber`. Migration
  `120_crypto_payment_watch_start.sql` stores that head in the same
  address-allocation update. Migration
  `121_crypto_payment_chain_positions.sql` gives every intent a durable origin
  and cursor on every supported chain. The intended chain keeps the exact
  pre-address head. Before address publication, each secondary chain uses its
  verified current head when it is configured. The allocation path does not use
  a global cursor because it can be stale after a long idle period. A configured
  secondary failure or chain-ID mismatch blocks issuance. An unconfigured
  secondary falls back to block zero and is not watchable, leaving a
  wrong-network evidence gap until a source is configured and catches up. All
  rows are inserted atomically with address allocation, and only blocks strictly
  after each origin can count. A watcher pass verifies `eth_chainId` again before
  the head or logs and aborts without advancing a cursor on mismatch. After an
  outage, each per-intent chain position resumes in ranges of at most 2,000
  blocks until it catches up.

  Arbitrum currently uses its public no-key endpoint. It carries no uptime or
  capacity guarantee. Dwellir's free plan is not a fallback because it rejects
  `eth_getLogs` with HTTP 403. Select a replacement only after proving that the
  exact plan permits `eth_getLogs` and documenting cost, privacy, and retention
  terms. Base and Ethereum each need their own configured source before their
  rails can become ready.

  Any third-party RPC source can observe queried addresses and correlate them
  with payment activity. Removing that disclosure requires self-hosting, which
  is outside this zero-cost scope.

- Read current official documentation before adding any chain ID, contract
  address, RPC request, or event shape. Done for the JSON-RPC shapes and the
  ERC-20 `Transfer` topic above. The current fixed contracts are:
  - USDC on Arbitrum `0xaf88d065e77c8cC2239327C5EDb3A432268e5831`,
    Circle's native USDC deployment.
  - PYUSD on Arbitrum `0x46850aD61C2B7d64d08c9C754F45254596696984`,
    Paxos' deployment announced with PayPal.
  - USDC on Base `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`, from Circle's
    own contract-address documentation. Circle lists a single native USDC on
    Base, so there is no bridged-USDbC ambiguity to resolve.
  - PYUSD on Ethereum `0x6c3ea9036406852006290770BEdFcAbA0e23A0e8`, from
    PayPal's own material and Etherscan's verified token page.
  All four use 6 decimals, which is what `quoteUsdCentsAsStablecoinAtomic` assumes;
  `decimals` is now recorded in the rail so the assumption is checkable.

  Worth knowing rather than acting on: PYUSD is issued by **Paxos Trust
  Company, a US entity**. Given the standing preference for European payment
  rails, the PayPal-compatible rail is the least European part of this design.
  It is still only a token transfer, not a processor relationship, so nothing
  is changed here, but it should not come as a surprise later.
- Poll ERC-20 `Transfer` logs for assigned addresses. Done. Every configured
  supported chain queries every bounded watchable address and all known token
  contracts configured on that chain. Recipient topics are split into batches
  of at most 100. This retains known wrong-chain and wrong-token transfers as
  non-creditable support evidence without letting them advance or settle an
  intent. Unknown token contracts and transfers first presented after the
  seven-day watch window still need independent receipt ingestion.
- Read authoritative block time before deciding whether a transfer arrived by
  expiry. Done. `eth_getBlockByNumber` must return the requested block number
  and the same block hash as the log. Only timestamps at or before `expires_at`
  count, and null legacy timestamps never grant.
- Pin the expected chain ID and token contract. Done, server-side, in
  `CRYPTO_PAYMENT_RAILS`. A client can name a rail, never a contract. Every
  active pass rechecks the endpoint's chain ID before the head or logs; a
  mismatch leaves every durable cursor unchanged.
- Deduplicate by chain ID, transaction hash, and log index. Done, and enforced
  by a unique constraint in migration `098`, not only in code.
- Persist observed block number, amount, sender, receiver, token contract, and
  transaction hash. Done, in `crypto_payment_transfers`. Recording a positive
  exact-chain, exact-token transfer and moving `awaiting_payment` to
  `confirming` occur atomically.
- Handle timeouts, duplicate logs, and chain reorganization. Done: bounded
  scan ranges, a re-read window behind the cursor, `removed` logs ignored, and
  a sweep that marks vanished transfers `reorganized` without deleting them so
  support can still see them. Settlement locks and re-sums the intent's
  confirmed, pre-expiry, exact-chain and exact-token transfer rows inside the
  grant transaction. The lock order is member, intent, evidence, then any
  limited-plan supply lock. A concurrent reorganization therefore cannot
  invalidate a total after it grants. **RPC disagreement between two providers
  is not handled; there is only one endpoint per chain.**
- Never trust an unverified browser transaction hash as settlement evidence.
  Done. No route accepts a transaction hash as input to settlement; the only
  writer is the watcher.

### 2. Amount, timing, and confirmation policy

The mechanism is in `server/src/crypto-settlement-policy.ts`, which is pure: no
database, no clock, no configuration beyond the policy passed in. Every value
lives in one object, so changing the policy never means touching the watcher.

**Decided 2026-08-30**, on Julien's instruction to pick rather than present
options. These are now the defaults, not placeholders.

| Decision | Value | Reasoning |
| --- | --- | --- |
| Confirmation target, Arbitrum | `240` (~60s) | Arbitrum produces blocks much faster than Base. The per-rail target provides about the same one-minute wait as 30 Base blocks. |
| Confirmation target, Base | `30` (~60s) | Per rail, not global: this was the bug. Base builds an L2 block about every 2 seconds, so the original `1` bought about 2 seconds of protection on a grant with no revoke path. Base's own finality documentation puts reorg risk at "near 0%" once a transaction is in an L2 block and "effectively 0%" once the batch reaches L1 about 2 minutes later; 30 blocks sits well past the first and heads toward the second, for a minute of member waiting. |
| Confirmation target, Ethereum | `12` (~2.4m) | Ethereum blocks are ~12 seconds and finality is 2 epochs, 64 blocks, about 12.8 minutes. 12 is the ordinary exchange-grade bar for crediting a stablecoin deposit. |
| Underpayment tolerance | `50` bps, capped at `250000` atomic ($0.25) | Not zero, which was wrong. An ERC-20 transfer pays gas separately, so a self-custody sender pays the exact amount, but a custodial sender (PayPal or an exchange) can deduct its withdrawal fee from the amount. With zero tolerance that member pays, gets nothing, and has to contact support while cruush holds the money. The absolute cap exists so the $999 lifetime plan does not forgive $5 where the $10.99 weekly plan forgives about $0.05. |
| Overpayment flag | `100` bps (1%) | Grant an otherwise valid open intent and record the exception. Someone who overpays should appear in reconciliation rather than disappear into treasury accounting. Any legally required remedy or exceptional owner action remains separate from automatic settlement. |
| Payment after expiry | evidence only | A transfer mined after `expires_at` never grants. A scheduler-expired intent may settle only exact-rail evidence authoritatively timestamped by `expires_at`, because the on-time transfer may still have been awaiting confirmations when the checkout window closed. |

`CRYPTO_PROCESSOR_CONFIRMATION_TARGET` is kept, but now acts as a **floor**: an
operator can demand more confirmations than a rail asks for, never fewer. That
preserves the existing knob without letting it reintroduce the one-number bug.

| Late-arrival evidence window | `7` days past expiry | Bounds abandoned-intent scanning. Post-expiry transfers observed during this window remain evidence only and never grant. A transfer never ingested during the bounded watch is not automatically discoverable from a member-supplied hash. |

The same seven-day bound terminalizes an unresolved `confirming` intent as
`failed`. Its transfer evidence and settlement note remain stored for support;
the failed intent does not settle or grant later.

Still open: receipt evidence verification and support handling for funds found
outside the bounded watch. Do not hand-make a grant from an unverified hash.
The owner must decide how changed quotes and confirmed post-expiry funds are
handled before launch.

### 3. Entitlement grant

Built 2026-08-30.

- Grant only after the watcher moves the intent to `paid`. Done. `settleIntent`
  is the only caller, and it grants only in the same pass that successfully
  claimed the `paid` transition.
- Use the existing cruush+ billing catalog. Done, and more strongly than
  before: the grant body was extracted out of `completeFakeCheckoutSession`
  into `grantCruushPlusPlan` in `server/src/billing.ts`, so the test checkout
  path and the crypto path are now literally the same code and cannot drift on
  what a plan grants. The existing checkout behaviour is unchanged.
- Idempotent at the database boundary. Done: the paid claim matches only an
  open, ungranted row and the grant plus `entitlement_granted_at` update run in
  the same transaction. A check constraint refuses a grant marker on an intent
  that is not `paid` or `refunded`.
- Settlement takes locks in one order: member, intent, exact-rail transfer
  evidence, then any limited-plan supply lock. The watcher re-sums locked,
  confirmed, pre-expiry evidence for the intent's exact chain and token inside
  the transaction that claims `paid` and grants access.
- Record the payment intent ID on the paid access record. Done, via new
  `crypto_payment_intent_id` columns. The existing `checkout_session_id` is
  untouched and stays null for crypto.
- Finite crypto purchases stack atomically. The next term starts from the later
  of now, the current subscription end, or the current entitlement end. The
  existing fake-checkout replacement behavior remains unchanged.
- A crypto lifetime grant uses no-overwrite insertion, and active lifetime
  access blocks every fresh crypto purchase. A successful shared lifetime grant
  atomically closes that member's `pending` and `awaiting_payment` crypto
  intents while preserving `confirming` intents, because those already have
  observed funds. If authoritative on-time evidence later proves an older
  lifetime intent was paid after lifetime access was already active, settlement
  records it as `paid`, makes no duplicate grant, adds an explicit support-review
  note, and continues the chain pass. This record makes no refund promise.
  Member and plan advisory locks serialize intent creation and settlement.
  Founder annual and lifetime founder reservations and grants count unique real
  users transactionally against their 1,000 and 1,000 caps. Regular lifetime
  access costs $1,999.99 and cannot be listed or purchased until all 1,000 real
  lifetime founder spots are redeemed. An expired
  limited-plan intent keeps its supply reservation through the same seven-day
  evidence window, so authoritative on-time payment can still grant without a
  later buyer taking its slot. An evidence-free reservation releases after that
  bound. This means an abandoned limited checkout can hold scarce supply for up
  to seven days. Launch needs monitoring and an explicit reservation-abuse
  response; per-member request throttling alone does not prevent coordinated
  account abuse.
- Never grant from a client poll, copied address, member-supplied transaction
  hash, or intent creation. Done. No route can reach the grant.

### 4. Reconciliation and support

Built 2026-08-30 in `server/src/crypto-reconciliation.ts`, read-only, exposed
at `GET /api/crypto/support/payments` and
`GET /api/crypto/support/reconciliation`, both moderator-gated.

- Look up already ingested evidence by intent ID, member ID, payment address,
  and transaction hash. Done. This does not fetch a never-ingested receipt from
  chain. Evidence verification beyond the bounded watcher window remains open.
- Reconcile assigned addresses against observed transfers and granted
  entitlements. Done. The exception report covers paid-without-entitlement,
  entitlement-without-paid, confirmed-money-that-never-settled, transfers with
  no intent, and anything settlement flagged on the way through.
- `confirmed_money_not_settled` uses only the intent's exact chain and token and
  the same threshold as settlement: 50 basis points capped at 250000 atomic
  units ($0.25). It does not flag a transfer total settlement would still treat
  as insufficient.
- The reconciliation endpoint also reports whether the watcher is actually
  running and, if not, which gate is closed. A silent watcher is the failure
  mode that would otherwise go unnoticed until someone complains.
- cruush does not offer generic voluntary refunds for cruush+. The `refunded`
  state remains for exceptional or legally required outcomes and forced
  reversals. Do not add generic refund tooling or refund-offering copy without
  Julien naming that scope.

  cruush+ is an ongoing interactive digital service, not immediate digital
  content. EU consumers generally retain a 14-day withdrawal right. Immediate
  access, prior consent to begin service, and an acknowledgement do not by
  themselves erase that right before full performance. A checkout checkbox is
  not a no-refund switch.

  EU/EEA sales are blocked until jurisdiction-specific legal review and a
  compliant service-withdrawal flow are complete, or those consumers are
  excluded server-side. No compliant flow or exclusion is established by this
  plan.

### 5. Checkout completion

- Done 2026-08-30: payment URIs and QR codes. `buildCryptoPaymentUri` in
  `server/src/crypto-payments.ts` builds an ERC-681 (Final status,
  https://eips.ethereum.org/EIPS/eip-681) `transfer` request URI:
  `ethereum:<tokenContract>@<chainId>/transfer?address=<paymentAddress>&uint256=<atomicAmount>`
 : from metadata already in `CRYPTO_PAYMENT_RAILS`, and only once an address
  and quoted amount exist. `withCryptoPaymentDisplay` renders it to a QR with
  the existing `qrcode` server dependency (same call shape as
  `two-factor.ts`'s `QRCode.toDataURL`, so this is not a second QR
  implementation). Intent create, current, and ID responses return `paymentUri`
  and `qrCodeDataUrl` alongside the intent; `CruushPlusStore.tsx` renders the QR
  image next to the existing copyable address when present. No new
  dependency, no live network call, no change to what is displayed today
  besides the QR image itself. PayPal accepts a pasted address or scanned QR,
  but there is no confirmed evidence it parses a full ERC-681 request URI
  rather than a bare address. The QR remains spec-correct and the full address
  stays visible and copyable as the reliable fallback.
- QR encoding uses a process-local 256-entry bounded cache. Concurrent reads of
  one payment URI share the same pending encode; a failed encode is removed so
  a later request can retry.
- Only an open payable intent may include `paymentUri` or `qrCodeDataUrl`.
  Terminal states return both as `null` so an expired quote cannot keep asking
  for funds.
- Keep the full address visible and copyable.
- Warn clearly that sending another asset or using another network may lose
  funds.
- Preserve one-page checkout and account-linked status polling. Creation is
  limited to 5 requests per member per minute. Current and intent-ID reads
  share a 30 requests per member per minute limit.
- Display the server expiry countdown. After the window closes, hide the
  address and QR and stop treating the quote as payable. Pending or awaiting
  polling stops at expiry; confirming polling has a 20-minute post-expiry
  ceiling. A locally expired pending or awaiting quote offers a fresh-payment
  action. Keep plan and payment-source selectors locked while an open or paid
  intent owns checkout. Restore the current active intent before selecting
  defaults on reload. If the restored intent's original rail is unavailable,
  preserve that rail and its payment state through `paid`; do not switch or
  unlock the checkout.
- Exercise unavailable, ready, pending, confirming, paid, expired, failed, and
  mobile layouts in the real local application. The earlier disabled-state
  render does not prove the redesigned pricing, benefits, per-rail readiness,
  or configured payment states. Record fresh screenshots and interaction
  evidence before calling this gate complete.

## Card track

Card acceptance remains separate from this direct crypto rail. Before any card
code is added:

- Select an actual processor through written commercial review.
- Read its current official API and webhook documentation.
- Confirm adult-category eligibility and the exact merchant, descriptor,
  chargeback, refund, reserve, settlement, data-retention, and geographic terms
  in writing.
- Use hosted checkout or hosted fields so cruush never receives raw card data.
- Keep card settlement evidence separate from browser redirects.

No card-provider name belongs in configuration, user copy, or code until that
selection and documentation exist.

## Gates before accepting real money

- The local wallet package is absent from the client and server runtime images.
- No real recovery words or signing material appear in Git history, files,
  shell history, environment variables, logs, screenshots, or agent transcripts.
- A recovery drill on a disposable software wallet reproduces the xpub,
  treasury address, and several payment child addresses without network access.
- The cybersecurity reviewer approves the local signing tool and operator
  procedure before any mainnet signing support is added.
- Wallet-path derivation independently matches at multiple indices.
- A small controlled receive reaches the wallet and is reconciled to the exact
  intent without exposing signing material to the server.
- Chain ID and USDC contract address come from current official documentation.
- Watcher tests cover confirmation counting, duplicates, reorganization,
  underpayment, overpayment, expiry, and late arrival.
- Entitlement is granted once and only once from confirmed chain evidence.
- Support lookup and reconciliation work before the first customer payment.
- Gas funding and sweeping are tested on Base Sepolia for multiple child
  addresses before any mainnet transaction is signed.
- Checkout copy accurately states asset, network, amount, expiry, and
  non-renewal behavior.
- EU/EEA sales are excluded server-side until jurisdiction-specific review and
  a compliant interactive-service withdrawal flow are complete. Immediate
  access plus acknowledgement does not erase the right before full
  performance.
- Desktop and 360x740 mobile disabled-checkout states are rendered and
  inspected. Configured payment states remain a separate gate.
- Production environment variables are set directly in the server runtime and
  independently verified without exposing values.
- One controlled end-to-end payment passes from intent creation through
  entitlement and reconciliation.
- Legal, tax, sanctions, consumer-protection, privacy, withdrawal, refund,
  remedy, and terms review is complete for every intended launch jurisdiction.

Until every gate passes, the processor stays disabled and the worktree must not
be described as production-ready.
