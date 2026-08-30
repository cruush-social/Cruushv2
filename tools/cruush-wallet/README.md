# cruush local operator wallet

Status: development-only, Base Sepolia signing only, no broadcast support.

This zero-cost software wallet keeps the cruush server watch-only. The server
receives only the public node at `m/44'/60'/0'/0`. Recovery words and private
keys never enter the cruush client, API, database, environment, logs, or
container images.

## Safety boundary

- Never run a secret-bearing command through Codex, Claude, CI, a pipe, output
  redirection, screen sharing, or remote control.
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
```

Do not run the following commands until the independent security review is
complete. Run them later from a normal macOS Terminal, never an agent terminal:

```sh
npm run wallet -- init --acknowledge-software-wallet-risk
npm run wallet -- verify EXPECTED_LOWERCASE_XPUB_FINGERPRINT
npm run wallet -- sign-gas /safe/path/gas-plan.json /safe/path/gas-signed.json
npm run wallet -- sign-sweep /safe/path/sweep-plan.json /safe/path/sweep-signed.json
```

`init` displays recovery words once in the terminal's alternate screen. After
physical recording and confirmation, it displays only a public descriptor:
the receive-chain xpub, its SHA-256 fingerprint, the treasury address, and sample
child addresses.

Signing commands accept strict Base Sepolia plans, require visible confirmation,
then prompt for recovery words with terminal echo disabled. Signed artifacts
must be written outside every Git checkout. They contain a signed transaction
that can be broadcast, but no recovery words or private key.

There is intentionally no RPC client and no broadcast command. Mainnet chain ID
and mainnet USDC signing are deliberately unsupported in this slice.

## Remaining gates

- Independent review of implementation and operator procedure
- Disposable-wallet recovery drill while offline
- Independent address matching at multiple indices
- Base Sepolia gas funding and USDC sweep
- Gas budget and batch-sweep policy
- Refund procedure
- Mainnet support as a separate, explicitly authorized change

Until those gates pass, keep `CRYPTO_PROCESSOR_ENABLED=false`.
