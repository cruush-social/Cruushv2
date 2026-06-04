# Recent Security Hardening

This document summarizes the security-related work in the last two commits and the current key-derivation hardening work.

Scope covered:

- `ad2da0c` - `new rate limits, nounded limit query, other limits`
- `4612f55` - `mobile and deployment fixes`
- Current uncommitted encryption hardening work

## Summary

The recent changes harden three areas:

- API abuse controls: bounded list queries and per-user write rate limits.
- XSS and unsafe URL defense: stricter public URL validation and HTML escaping for email links.
- Login/session protection: explicit 256-bit session-token entropy and 256-bit stored token hashes.
- Encrypted storage robustness: HKDF-based key derivation for new encryption versions, tamper-detection tests, nonce tests, and explicit key-version behavior.

The app still uses server-side encryption, not end-to-end encryption. The backend can decrypt authorized data because it holds the server-side keys. The main database threat model is protection against database-only disclosure without access to application secrets.

## API Abuse Controls

Commit `ad2da0c` added explicit limits to message and post flows.

### Bounded Read Queries

Conversation and message history endpoints now parse strict query schemas:

- `GET /api/conversations`
  - `limit` is coerced to an integer.
  - Allowed range: `1` to `50`.
  - Default: `50`.

- `GET /api/messages/:conversationId`
  - `limit` is coerced to an integer.
  - Allowed range: `1` to `100`.
  - Default: `50`.

Message history now fetches the newest bounded rows first and then reorders them ascending for the response. This keeps response order stable while preventing unbounded database reads.

### Write Rate Limits

The server now applies per-user limits for high-write flows:

- Direct conversation creation:
  - key: `conversation-dm:user:{userId}`
  - max: `20`
  - window: `60 seconds`

- Message creation:
  - key: `message-create:user:{userId}`
  - max: `30`
  - window: `60 seconds`

- Post creation:
  - key: `post-create:user:{userId}`
  - max: `10`
  - window: `15 minutes`

These limits use the app-level rate limiter, which keeps route logic consistent with the existing rate-limit infrastructure.

### Verification

Tests cover:

- Query limits are passed into SQL.
- Oversized conversation list limits are rejected before querying.
- Bounded message history requests use the requested safe limit.
- Message creation is rate-limited after the allowed attempts.
- Post creation is rate-limited after the allowed attempts.

## XSS And Unsafe URL Defense

Commit `4612f55` added stricter URL validation and output escaping.

### Shared Public HTTPS URL Schema

`server/src/input-schema.ts` now exposes `publicHttpsUrlSchema`.

It accepts only public HTTPS URLs and rejects:

- non-HTTPS protocols such as `http:`, `javascript:`, and `data:`
- embedded URL credentials
- `localhost`
- `.local` hostnames
- cloud metadata hosts such as `169.254.169.254` and `metadata.google.internal`
- private IPv4 ranges
- IPv6 loopback, link-local, and unique-local ranges

This schema is now used for:

- profile photo URLs in `server/src/profile-schema.ts`
- cruush snapshot photo URLs in `server/src/cruush-schema.ts`

The frontend cruush snapshot normalizer was also aligned with the server contract. It drops snapshot photos that are not public HTTPS before sending `POST /api/cruush`.

### Email HTML Escaping

Verification and password-reset email links are escaped before interpolation into HTML.

This prevents malformed or attacker-controlled URL fragments from breaking out of an email `href` attribute. Plain-text email bodies still include the raw URL because they are not HTML.

### Test Runner Hygiene

`server/vitest.config.ts` now excludes `dist/**` so compiled output and platform metadata files are not accidentally loaded as test files after a build.

### Verification

Tests cover:

- `javascript:` cruush snapshot photos are rejected before querying.
- `localhost` cruush snapshot photos are rejected before querying.
- private-network profile photo URLs are rejected before querying.
- public domains that begin with letters like `fc` are not confused with IPv6 private ranges.
- IPv6 loopback and unique-local hosts are rejected.
- verification and password-reset URLs are escaped in HTML email.

## Mobile Security-Relevant UX Fixes

Commit `4612f55` also fixed mobile interaction problems that could block privacy controls from opening.

The map view now:

- uses `100dvh` and `max-h-[100dvh]` to avoid mobile browser chrome causing the entire app shell to scroll
- applies `overscroll-none` to the map shell
- marks empty top chrome as `pointer-events-none`
- restores pointer events only on the actual top action buttons
- raises the Seeking and Visibility controls above the decorative chrome layer
- keeps the Recently Active panel fixed on mobile
- constrains Recently Active tray gestures to horizontal panning with `touch-action: pan-x`

This matters because the Visibility and Seeking controls are privacy/security controls. Empty overlay layers should not intercept taps and prevent users from changing those settings on a phone.

The same commit also restored the desktop profile-preview behavior in `BottomNav` while preserving mobile navigation to the full profile page.

## Login And Session Protection

The current auth hardening makes the login session-token contract explicit.

On successful login, the server now has test coverage proving:

- the browser session cookie carries a 32-byte random token, equivalent to 256 bits of raw entropy
- the database stores only the SHA-256 digest of that token, also 32 bytes
- the stored value is a 64-character lowercase hex digest, not the raw bearer token
- the session cookie remains `HttpOnly`

The production behavior remains deployment-compatible because this documents and enforces the existing storage shape instead of introducing a new database column or token format.

## Encryption Key Derivation Hardening

The current encryption hardening work adds a shared key derivation helper in `server/src/crypto-keys.ts`.

### Previous Behavior

Encryption-specific modules previously derived 32-byte AES/HMAC keys with:

```text
SHA-256("{purpose}:{keyVersion}:{secret}")
```

That provided purpose and version separation, but HKDF is a better standard key-derivation construction for deriving subkeys from a high-entropy application secret.

### New Behavior

`deriveKey(secret, purpose, keyVersion)` now uses:

- legacy SHA-256 derivation for `v1`
- HKDF-SHA256 for non-`v1` key versions

Keeping `v1` legacy behavior is intentional. It preserves decryption for existing database rows that were encrypted before the HKDF change.

New HKDF-derived keys are separated by:

- secret
- purpose
- key version
- HKDF salt/info strings scoped to `cruush`

### Version Defaults

Encryption-only versions now move forward to `v2`:

- profile sensitive data encryption: `v2`
- profile visibility encryption: `v2`
- relationship record encryption default: `v2`
- match-token encryption default: `v2`

Blind-index versions remain at `v1`:

- `PROFILE_TOKEN_KEY_VERSION`
- `RELATIONSHIP_INDEX_KEY_VERSION`

This is deliberate. Rotating blind indexes requires a backfill/search migration because queries must be able to find rows by the indexed value. Encryption payload versions can move independently because the stored row carries the key version needed for decryption.

### Tamper Detection

The encrypted payloads use AES-256-GCM, so ciphertext, nonce, and auth-tag metadata are authenticated together. Tests now prove tampering fails for:

- profile-sensitive encrypted payload auth tags
- profile visibility ciphertext metadata
- encrypted relationship records
- encrypted match-token auth tags or signatures

### Nonce Behavior

Tests now prove encrypting the same logical payload twice produces different nonces and ciphertext for:

- profile-sensitive data
- profile visibility rules
- relationship records
- match tokens

### Key-Version Behavior

Tests now prove:

- `v1` derivation stays compatible with the legacy SHA-256 derivation
- `v2` HKDF keys differ from `v1`
- different purposes produce different HKDF keys
- different key versions produce different HKDF keys
- encrypted payloads decrypt using their stored key version
- forcing the wrong key version fails decryption or token verification
- blind token hashes remain stable for `v1` and change when an explicit rotated version is requested

## Operational Notes

### Deployment Compatibility

The HKDF change is designed to be backwards-compatible:

- existing `v1` encrypted rows remain decryptable
- new encryption writes use `v2`
- no database migration is required for the encryption-version change
- no new environment variables are required

If production explicitly sets `RELATIONSHIP_ENCRYPTION_KEY_VERSION` or `MATCH_TOKEN_KEY_VERSION` to `v1`, it will continue writing `v1` records until those env values are changed.

### Index Rotation Is Separate

Do not change `PROFILE_TOKEN_KEY_VERSION` or `RELATIONSHIP_INDEX_KEY_VERSION` casually.

Those versions affect blind indexes used for lookup. Rotating them should be handled as a planned migration with:

- dual-read or backfill strategy
- index regeneration
- production verification
- a rollback plan

### Public-Key Encryption

Public-key encryption is not part of these changes.

It would be useful if the app needed client-side end-to-end encryption, such as:

- encrypted direct messages that the server cannot read
- encrypting profile fields to specific users or devices
- device-bound identity keys
- sealed data where only a recipient can decrypt

That would add product and operational complexity: key recovery, multi-device sync, lost-device handling, abuse review, and migration strategy. The current implementation remains a server-side encrypted storage model.

## Verification Commands

Recent verification has used Node 22 to match the repo and deployment baseline:

```bash
PATH=/opt/homebrew/opt/node@22/bin:$PATH npm test
PATH=/opt/homebrew/opt/node@22/bin:$PATH npm run build
```

Current server verification after the encryption hardening:

- `12` server test files passed
- `118` server tests passed
- TypeScript server build passed
