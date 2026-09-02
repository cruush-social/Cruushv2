# cruush local operator wallet

Status: local custody tool. Public wallet inspection plus pinned testnet and
mainnet sweep planning, offline signing, and explicit broadcast support.

This zero-cost software wallet keeps the cruush server watch-only. The server
receives only the public node at `m/44'/60'/0'/0`. Recovery words and private
keys never enter the cruush client, API, database, environment, logs, or
container images.

## Safety boundary

- Never run a secret-bearing command through Codex, Claude, CI, a pipe, output
  redirection, screen sharing, or remote control.
- Close Codex, Claude, screen sharing, terminal recording, and remote-control
  apps before answering the live-presence challenge. Keep them closed until the
  recovery-word screen has cleared and Terminal is closed.
- Never provide recovery words through command arguments, environment
  variables, files, chat, screenshots, or clipboard history.
- Write recovery words on paper and keep physical backups secure. This tool
  deliberately provides no digital secret vault.
- Disconnect the Mac from every network before entering recovery words for a
  signing command.
- Software custody cannot protect recovery words from malware already running
  on the Mac. Independent cybersecurity review is required before a recovery
  drill or testnet transaction.
- Never use the public test recovery words found in automated tests for funds.

The tool refuses secret input unless both input and output are direct terminals.
It also refuses secret-bearing commands when common Codex, Claude, or CI session
variables are present.

## Derivation layout

- Receive-chain xpub: `m/44'/60'/0'/0`
- Treasury: `m/44'/60'/0'/0/0`
- Payment addresses: `m/44'/60'/0'/0/i`, starting at `i = 1`

The migration identity sequence starts at `1`, so the application never assigns
treasury index `0` to a payment intent.

## Install and build

Installation uses only free open-source packages:

```sh
npm install --ignore-scripts --legacy-peer-deps
npm test
npm run build
```

The npm resolver currently needs `--legacy-peer-deps` because npm 10.9.8 fails
while resolving Vitest's optional browser peers. Runtime dependencies do not use
install scripts.

## Commands

Run help safely in any terminal:

```sh
npm run wallet -- --help
npm run wallet -- status
npm run wallet -- address 1
npm run wallet -- configure-server-xpub /Volumes/good/Cruushv2-crypto-release/server/.env.local
```

`status` and `address` read and validate only the fixed current-user public
descriptor. They show no recovery words, private key, xprv, or receive-chain
xpub. Index `0` is treasury. Payment addresses start at index `1`.

`configure-server-xpub` atomically places only the validated public receive-chain
xpub into an existing server environment file with mode `0600`. It does not
print the xpub and does not change either processor enable flag.

Do not run the following commands until the independent security review is
complete. Run them later from a normal macOS Terminal, never an agent terminal:

```sh
npm run wallet -- init --acknowledge-software-wallet-risk
npm run wallet -- verify EXPECTED_LOWERCASE_XPUB_FINGERPRINT
npm run wallet -- sign-gas /safe/path/gas-plan.json /safe/path/gas-signed.json
npm run wallet -- sign-sweep /safe/path/sweep-plan.json /safe/path/sweep-signed.json
```

## Sweep workflow

Customer funds already belong to this wallet when they reach a derived payment
address. Sweeping only consolidates them from payment index `i` into treasury
index `0`.

Supported rails:

- `usdc_base_sepolia`
- `usdc_arbitrum`
- `pyusd_arbitrum`
- `usdc_base`
- `pyusd_ethereum`

Create an unsigned plan while online. Use a normal Terminal and provide the RPC
URL without placing it in chat or a committed file:

```sh
cd /Volumes/good/Cruushv2-crypto-release/tools/cruush-wallet
read -rs "CRUUSH_WALLET_RPC_URL?RPC URL: "
export CRUUSH_WALLET_RPC_URL
npm run wallet -- plan-sweep usdc_arbitrum 1 /safe/path/unsigned-sweep.json
unset CRUUSH_WALLET_RPC_URL
```

The planner checks the RPC chain ID, reads the complete token balance, estimates
gas, enforces a hard fee cap, and includes treasury-to-child gas funding only
when required.

Disconnect the Mac from every network. Close Codex, Claude, remote-control,
screen-sharing, and terminal-recording apps. Then use a fresh normal Terminal:

```sh
cd /Volumes/good/Cruushv2-crypto-release/tools/cruush-wallet
npm run wallet -- sign-bundle /safe/path/unsigned-sweep.json /safe/path/signed-sweep.json
```

Close that Terminal before reconnecting. In another fresh normal Terminal,
inspect and broadcast the already signed bundle:

```sh
cd /Volumes/good/Cruushv2-crypto-release/tools/cruush-wallet
read -rs "CRUUSH_WALLET_RPC_URL?RPC URL: "
export CRUUSH_WALLET_RPC_URL
npm run wallet -- broadcast-bundle /safe/path/signed-sweep.json
unset CRUUSH_WALLET_RPC_URL
```

Broadcast prints the exact transaction hashes and maximum fees, requires a
network-specific typed confirmation, sends gas first when needed, waits for its
successful receipt, then sends the token sweep and waits for that receipt.

`init` preflights a fixed current-user output before creating wallet entropy:
`~/Library/Application Support/cruush/operator-wallet/public-descriptor.json`.
There is no command-line or environment-variable output override. The private
wallet-specific parent directories are mode `0700`; the public descriptor is an atomic,
no-clobber, regular mode `0600` file. Every existing directory from the current
user's home to the target is checked for ownership, type, permissions, and inode
continuity. Existing files, detected links, unsafe ownership, unsafe permissions,
and detected directory swaps are refused. A final path is never unlinked after
publication, because Node cannot atomically condition an unlink on inode identity.
An ambiguous post-publication validation failure therefore preserves the path and
aborts. Temporary cleanup uses an unpredictable exclusive name and repeated inode
checks, but a malicious same-user process can still race Node's final path-based
unlink; the current macOS user is the trust boundary.

Recovery words appear once in the terminal's alternate screen. After physical
recording and confirmation, the operator must re-enter all 24 words at a hidden
prompt. The tool writes the allowlisted public descriptor only when that backup
exactly matches the generated wallet. The terminal then prints only the
descriptor path, xpub fingerprint, and an instruction to close Terminal.

Signing commands accept strict pinned plans, require visible confirmation, then
prompt for recovery words with terminal echo disabled. Signed artifacts must be
written outside every Git checkout. They contain signed transactions, but no
recovery words or private key. `CRUUSH_WALLET_RPC_URL` is used only by this local
operator tool for planning and broadcasting. Never set it in the cruush client
or API environment.

## Remaining gates

- Independent review of implementation and operator procedure
- Disposable-wallet recovery drill while offline
- Independent address matching at multiple indices
- One disposable-wallet Base Sepolia gas funding and USDC sweep
- Production RPC selection and gas budget approval
- Exceptional and legally required withdrawal, refund, remedy, and forced-reversal procedure
- Hardware-wallet migration before holding material balances

Until those gates pass, keep `CRYPTO_PROCESSOR_ENABLED=false`.
