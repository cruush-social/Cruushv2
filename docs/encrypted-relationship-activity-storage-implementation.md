# Encrypted Relationship & Activity Storage Implementation

This document explains the encrypted relationship and activity storage implementation: what changed, how it works, why this approach was chosen, and how it was verified.

## Summary

Cruush relationship edges are now stored through a generic encrypted ledger instead of being read and written through plaintext relationship tables at runtime.

The protected ledger supports:

- incoming and sent cruushes
- mutual cruushes
- profile views
- dismissed cruushes
- removed cruushes
- blocks

Current product routes wire the existing flows: one-way cruushes, mutual cruushes, profile views, match revocation/removal, discovery mutual badges, mutual map, profile visibility checks, and DM permission checks. Block and dismiss product APIs are not added in this pass, but the encrypted ledger can store those record types when the UI/API exists.

## Storage Model

Migration `server/sql/019_encrypted_relationship_storage.sql` adds:

- `encrypted_relationship_records`
  Stores encrypted relationship/activity payloads plus blind indexes.

- `encrypted_relationship_tokens`
  Stores encrypted, signed, short-lived match tokens bound to an encrypted relationship record.

The new relationship table stores:

- encrypted payload ciphertext, nonce, auth tag, and encryption key version
- HMAC blind indexes for actor, target, ordered pair, participants, record lookup, type, status, and dedupe bucket
- operational timestamps and optional expiry

It does not store plaintext:

- actor user id
- target user id
- relationship type
- relationship status
- target snapshots
- profile-view viewer/target pairs
- match-token user bindings

The old plaintext tables still exist for migration compatibility, but runtime cruush relationship reads and writes now use the encrypted ledger.

## Crypto Design

`server/src/encrypted-relationships.ts` owns the crypto boundary.

Relationship records use:

- AES-256-GCM for authenticated encryption
- per-record random 96-bit nonces
- `RELATIONSHIP_ENCRYPTION_KEY_VERSION`
- HMAC-SHA-256 blind indexes with `RELATIONSHIP_INDEX_KEY_VERSION`

Match tokens use:

- AES-256-GCM encrypted token payloads
- HMAC-SHA-256 token signatures
- existing `MATCH_TOKEN_*` key settings
- short expiry and revocation checks

The database can locate rows by blind index, but a database-only attacker cannot directly read who acted on whom or what type/status the row represents without the server-side keys.

## Runtime Changes

`server/src/match-relationships.ts` now resolves mutual cruush permissions through encrypted `mutual_cruush` records and verified encrypted tokens. Message permission, protected profile field visibility, and precise mutual location access still remain server-side decisions.

`server/src/routes/cruush.ts` now:

- writes one-way cruushes as encrypted `cruush` records
- detects reciprocal cruushes by blind record lookup
- creates encrypted `mutual_cruush` records and encrypted match tokens
- reads incoming, sent, mutual, and profile-view activity from encrypted records
- records removals as encrypted `removed_cruush` activity

`server/src/routes/profiles.ts` continues to return the same `viewer_relationship` response shape, but relationship checks and profile-view logging now use encrypted records.

`server/src/routes/users.ts` no longer joins `cruush_matches` during discovery. It loads candidate profiles first, then resolves mutual relationship metadata through the relationship helper.

`server/src/dev-seed-profiles.ts` now seeds encrypted cruush activity instead of inserting plaintext rows into `cruushes`.

## Backfill And Cutover

`server/src/backfill-encrypted-relationships.ts` provides the migration bridge.

The new `server/package.json` script is:

```bash
npm run relationships:backfill
```

Modes:

- Dry run by default:
  Reports legacy row counts without writing encrypted records.

- Apply:
  `npm run relationships:backfill -- --apply`

- Apply and purge:
  `npm run relationships:backfill -- --apply --purge`

The script backfills:

- `cruushes` into encrypted `cruush` records
- `cruush_matches` into encrypted active/removed `mutual_cruush` records
- active match permissions with freshly generated encrypted tokens
- `profile_view_events` into encrypted `profile_view` records

Purging deletes legacy relationship rows only after the encrypted write pass completes inside the transaction.

## Configuration

New backend environment variables:

- `RELATIONSHIP_ENCRYPTION_KEY`
- `RELATIONSHIP_INDEX_KEY`
- `RELATIONSHIP_ENCRYPTION_KEY_VERSION`
- `RELATIONSHIP_INDEX_KEY_VERSION`

Production config now requires strong dedicated relationship keys. Development and test can fall back to `SESSION_SECRET`, matching the existing profile and match-token local-dev pattern.

The values are documented in `server/.env.example`.

## Testing

Added coverage:

- relationship encryption round trips
- non-deterministic ciphertext for identical payloads
- stable blind indexes within one key version
- changed blind indexes across key versions
- tamper failure for encrypted records
- match-token signature verification
- rejection of tampered, expired, or revoked tokens
- assertion that storage insert params do not contain raw user ids, relationship types, statuses, or target snapshots
- backfill dry-run counts
- encrypted route fixtures for DM permission, discovery, cruush activity, reciprocal matches, and profile-view logging

Final verification:

- `npm --prefix server test`
  7 test files, 97 tests passed.

- `npm --prefix server run build`
  Server TypeScript build passed.

- `corepack pnpm test`
  26 test files, 165 tests passed.

- `corepack pnpm build`
  Frontend production build passed. Vite reported the existing large chunk warning.

- `corepack pnpm security:check`
  The package script could not start because local `bash` resolves to the Windows WSL launcher and `/bin/bash` is unavailable in this environment.

- `"C:\Program Files\Git\bin\bash.exe" scripts/security-check.sh`
  The same security script passed through Git Bash.

## Why This Approach

A single encrypted ledger avoids building separate privacy implementations for cruushes, matches, views, removals, dismissals, and blocks. It gives every relationship-like record the same storage shape, key-version behavior, and lookup model.

Blind indexes preserve the exact-match lookups the backend needs while removing readable social-graph edges from database rows. The API still returns the same shaped responses to the frontend, so the privacy change is mostly isolated to the backend storage and relationship-resolution layer.

This is not end-to-end encryption. The backend can decrypt relationship records after authorization. The threat model is database-only access without server secrets.

## Residual Risks And Follow-Ups

The database can still observe operational metadata such as row counts, timestamps, token expiry, and repeated blind-index access patterns. HMAC indexes are not reversible without the key, but they are still stable lookup handles.

Direct-message pair metadata is not included in this pass. `conversation_members` and `dm_key` can still reveal messaging pairs to a database-only attacker. That should be handled in a separate encrypted messaging-envelope migration.

Legacy plaintext relationship tables remain in the schema until the backfill purge step is run. Production rollout should treat `--apply --purge` as the cutover point after backups and validation.
