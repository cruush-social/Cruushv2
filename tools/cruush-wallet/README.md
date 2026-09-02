# cruush local operator wallet

Status: development-only, Base Sepolia signing only, no broadcast support.

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
```

Do not run the following commands until the independent security review is
complete. Run them later from a normal macOS Terminal, never an agent terminal:

```sh
npm run wallet -- init --acknowledge-software-wallet-risk
npm run wallet -- verify EXPECTED_LOWERCASE_XPUB_FINGERPRINT
npm run wallet -- sign-gas /safe/path/gas-plan.json /safe/path/gas-signed.json
npm run wallet -- sign-sweep /safe/path/sweep-plan.json /safe/path/sweep-signed.json
```

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
- Exceptional and legally required withdrawal, refund, remedy, and forced-reversal procedure
- Mainnet support as a separate, explicitly authorized change

Until those gates pass, keep `CRYPTO_PROCESSOR_ENABLED=false`.
