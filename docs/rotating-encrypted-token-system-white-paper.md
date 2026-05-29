# Rotating Encrypted Token System White Paper

## Executive summary

cruush needs to protect sensitive identity, intimacy, and health data while still supporting the product's core map discovery, crowd visibility, and profile filtering workflows. Fully encrypting profile records as opaque blobs would protect data at rest, but it would also break discovery, matching, visibility rules, and moderation. The rotating encrypted token system solves that tension by separating private content from queryable matching signals.

The system stores sensitive profile values inside authenticated encrypted payloads and stores only keyed, non-reversible token hashes for the small set of sensitive attributes that must remain matchable. For short-lived visibility modes, such as crowd mode, the token input also includes a daily time bucket so the queryable signal rotates over time. The database can answer "does this viewer share the required protected attribute?" without storing the underlying attribute in plaintext.

This is not end-to-end encryption. The backend can decrypt protected profile payloads when authorized. The system is application-layer encryption with blind token indexes, key versioning, and rotation hooks designed to reduce database exposure while preserving product behavior.

## Product problem

cruush relies on fast local discovery. Users need to filter and reveal profiles by identity, crowds, kinks, and health-related choices, and some of those choices are sensitive. The backend also needs enough metadata to enforce safety rules, visibility settings, moderation, rate limits, abuse prevention, deletion, and data export.

The privacy goal is not to make every database column opaque. The goal is to prevent sensitive profile facts from being stored or queried as plaintext unless they are intentionally public, while still letting the backend enforce rules such as:

- only show this profile in a selected crowd context
- find users with a matching protected crowd or kink value
- reveal sensitive fields only to the configured audience
- avoid leaking raw sensitive values through SQL logs, backups, query params, or filter indexes
- support key rotation and future re-encryption

## Current repo implementation

The current implementation already contains the main building blocks:

- `server/src/profile-sensitive.ts` encrypts sensitive profile payloads with AES-256-GCM and stores nonce, auth tag, and key version metadata.
- `server/src/profile-sensitive.ts` creates HMAC-based blind tokens for sensitive matchable values.
- `server/sql/015_profile_sensitive_tokens.sql` adds encrypted profile columns and the `profile_sensitive_tokens` lookup table.
- `server/sql/016_profile_visibility_rules.sql` adds encrypted visibility rule columns and `trans_crowds_changed_at`.
- `server/src/routes/profiles.ts` encrypts sensitive profile data and visibility rules on profile save, then syncs derived token hashes.
- `server/src/routes/users.ts` applies token filters during discovery for protected crowd and kink searches.
- `server/src/profile-visibility.ts` evaluates decrypted visibility rules against a viewer profile in backend code.
- `server/src/config.ts` defines `PROFILE_ENCRYPTION_KEY`, `PROFILE_TOKEN_KEY`, and `PROFILE_TOKEN_KEY_VERSION`.

The current sensitive encrypted payload contains:

- trans status
- crowds
- kinks and kink interests
- HIV status
- custom HIV status

The current blind token set can represent:

- `trans:true`
- `crowd:<normalized-crowd>`
- `kink:<normalized-kink>`
- `hiv:<normalized-status>`
- `crowd-mode:<normalized-crowd>:<yyyy-mm-dd>`

The crowd-mode token is the rotating portion: the token value includes today's date bucket and the previous day's date bucket. That gives the backend a short overlap window for active crowd visibility without keeping a long-lived plain query key for the active mode.

## Data model

The model has three layers.

### 1. Encrypted payload

The encrypted payload is the source of truth for private values. It is stored on `profiles` as:

- `profile_sensitive_ciphertext`
- `profile_sensitive_nonce`
- `profile_sensitive_auth_tag`
- `profile_sensitive_key_version`
- `profile_sensitive_token_key_version`

Visibility rules follow the same pattern:

- `profile_visibility_ciphertext`
- `profile_visibility_nonce`
- `profile_visibility_auth_tag`
- `profile_visibility_key_version`
- `profile_visibility_token_key_version`

These columns allow the backend to decrypt the value only when it needs to render a user's own profile, evaluate viewer-specific visibility, run moderation tooling, process export, or perform migration work.

### 2. Blind token index

The token table stores derived lookup tokens:

```sql
profile_sensitive_tokens (
  user_id uuid,
  token_hash text,
  token_key_version text,
  updated_at timestamptz
)
```

Each token hash is an HMAC-SHA-256 output generated from a normalized token value and a server-side token key. The database never stores `T4T`, `leather`, `undetectable`, or similar raw values in the token table. Query code generates the same token hash for a selected filter and checks whether a row exists.

### 3. Public and operational envelope

The profile row still keeps non-sensitive and operational fields queryable. Examples include display name, photos, approximate coordinates, timestamps, coarse discovery metadata, and moderation state. This is intentional. The product cannot function if routing, ownership, visibility status, and location envelopes are hidden from the backend.

## Token lifecycle

### Write path

1. The client submits a strict profile payload to `PUT /api/profiles/me`.
2. The backend validates the payload at the route boundary.
3. Sensitive profile values are copied into a private payload.
4. Sensitive values are removed from the normal profile columns where needed.
5. The backend encrypts the private payload with the active profile encryption key version.
6. The backend derives blind tokens from the matchable sensitive fields.
7. The backend writes the encrypted payload and replaces the user's token rows.

### Read path

1. Discovery queries use normal public filters plus blind token filters when protected values are selected.
2. The database compares token hashes, not plaintext values.
3. Candidate profiles are loaded with encrypted columns.
4. The backend decrypts only the fields required for the response and viewer authorization decision.
5. The API returns only the plaintext the viewer is allowed to see.

### Rotation path

There are two rotation concepts.

Daily visibility-token rotation:

- Crowd-mode tokens include a date bucket.
- The backend creates tokens for the current day and previous day.
- Queries generated on the current token key version can match only the current overlap window.
- Old crowd-mode tokens should be cleaned up by scheduled maintenance once outside the allowed window.

Key-version rotation:

- `PROFILE_TOKEN_KEY_VERSION` selects the active token key version.
- New writes use the active token key version.
- Token rows store `token_key_version`.
- Queries include `token_key_version`, which prevents accidental cross-version matches.
- A rotation job should rederive token rows for active profiles under the new token key before retiring the old key.

Encryption-key rotation:

- Encrypted payloads store their encryption key version separately.
- A re-encryption job can decrypt rows with an old key version and write them back with the new key version.
- Token rotation and ciphertext rotation can happen independently.

## Security properties

The system provides these protections:

- Sensitive values are not stored as plaintext in primary profile columns when marked private.
- Token indexes are non-reversible without the server-side token key.
- Token queries do not expose raw sensitive filter values to the database.
- AES-GCM provides confidentiality and tamper detection for encrypted payloads.
- Key versions make rotation possible without breaking old records immediately.
- Daily bucketed tokens limit the useful lifetime of active crowd-mode query signals.

The system does not provide these guarantees:

- It does not prevent the backend from decrypting data.
- It does not hide access patterns from the database.
- It does not make low-cardinality values impossible to guess if the token key is compromised.
- It does not replace authorization checks.
- It does not remove the need for moderation, abuse reporting, and audit logs.
- It does not make cruush an end-to-end encrypted system.

## Threat model

### Reduced risks

Database-only exposure:

An attacker with a database dump sees ciphertext, nonces, auth tags, key versions, and token hashes. They do not see raw sensitive values in the encrypted payload or token table unless they also obtain the server-side keys.

Accidental analytics or logs:

Because sensitive filter values are converted to token hashes in backend code, logs and SQL traces are less likely to contain raw protected values.

Internal query browsing:

Operators inspecting token tables cannot directly read sensitive identities, kinks, or health values from those rows.

### Remaining risks

Backend compromise:

If the application server or key store is compromised, the attacker may be able to decrypt payloads and generate token dictionaries.

Small value dictionaries:

Many sensitive values come from known option sets. HMAC protects them only while the token key remains secret. This is why key management matters.

Metadata leakage:

Profile existence, update timestamps, location envelopes, relationship edges, moderation states, and message routing metadata may still reveal behavior. These require separate minimization and retention controls.

Authorization mistakes:

Encryption does not automatically enforce visibility. The backend must still check mutual cruushes, mutual crowds, viewer profile attributes, and audience rules before returning plaintext.

## Operational requirements

Key management:

- Store `PROFILE_ENCRYPTION_KEY` and `PROFILE_TOKEN_KEY` outside the repo.
- Do not fall back to `SESSION_SECRET` in production deployments.
- Keep separate keys per environment.
- Maintain a key-version registry with created, active, deprecated, and retired states.
- Log key-version usage, not raw keys.

Rotation jobs:

- Add a scheduled job that removes expired daily crowd-mode tokens.
- Add a token backfill job for `PROFILE_TOKEN_KEY_VERSION` changes.
- Add an encrypted payload rewrap job for profile encryption key changes.
- Keep rotation idempotent so it can resume after partial failure.

Audit controls:

- Log moderator and admin access to decrypted sensitive fields.
- Log re-encryption job counts and failures.
- Alert on decryption failures, auth tag failures, or unexpected key versions.
- Avoid logging plaintext payloads in error paths.

Testing:

- Assert sensitive raw values are absent from insert parameters for profile rows and token rows.
- Assert token queries include `token_key_version`.
- Assert daily crowd-mode tokens include only the current and previous bucket.
- Assert old key versions remain readable until migration is complete.
- Assert unauthorized viewers receive redacted or empty sensitive fields.

## Implementation roadmap

### Phase 1: production key separation

- Require `PROFILE_ENCRYPTION_KEY` in production.
- Require `PROFILE_TOKEN_KEY` in production.
- Remove production fallback from both keys to `SESSION_SECRET`.
- Document key generation and storage in deployment docs.

### Phase 2: rotation registry

- Add a small key-version registry or config convention.
- Track active token key version and active encryption key version separately.
- Keep old key material available only while records still reference it.

### Phase 3: token expiry and cleanup

- Add a cleanup job for stale `crowd-mode` token rows.
- Consider storing a token purpose or expiry timestamp if cleanup by hash alone is not enough.
- Keep stable sensitive tokens, such as crowd and kink membership, separate from rotating visibility-mode tokens.

### Phase 4: backfill and rewrap tools

- Build a token rederive job that reads encrypted profile payloads, decrypts them with the stored encryption key version, and writes token rows with the new token key version.
- Build a ciphertext rewrap job that decrypts old payloads and writes new ciphertext with the active encryption key version.
- Add dry-run mode, row counts, retry behavior, and failure reporting.

### Phase 5: broaden coverage

- Apply the same envelope/body split to messages.
- Apply the same pattern to feed posts where search and moderation requirements allow it.
- Keep routing metadata queryable, but encrypt message and post bodies.
- Add moderation-only access paths with audit logs.

## Recommended architecture target

The long-term architecture should use:

- application-layer AES-GCM encryption for private payloads
- HMAC-based blind indexes for exact-match protected filters
- short-lived bucketed tokens for active temporary visibility modes
- separate key versions for encryption and tokenization
- scheduled token expiry cleanup
- idempotent key rotation and re-encryption jobs
- strict API schemas at every route boundary
- viewer-specific authorization before plaintext leaves the backend

This gives cruush a practical privacy model: sensitive user facts are not casually readable from the database, discovery still works, and the system has a path to rotate keys and reduce the lifetime of queryable protected signals.

