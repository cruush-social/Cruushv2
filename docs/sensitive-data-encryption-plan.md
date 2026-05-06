# Sensitive Data Encryption Plan

This document outlines a practical path for encrypting sensitive profile information, messages, and feed posts without breaking the product's core discovery and moderation flows.

## Goal

Protect sensitive user data at rest and in transit while preserving:

- map discovery
- profile filtering
- message delivery
- moderation workflows
- abuse prevention

The key constraint is that cruush depends on queryable profile attributes for nearby discovery. If a field must be filtered, sorted, or matched, it cannot live only as opaque encrypted text.

## Core principle

Split data into three classes:

1. **Public / queryable**
   - fields needed for discovery, filtering, and rendering
   - stored in normal relational columns or derived index tables

2. **Private / encrypted**
   - free text
   - sensitive profile details
   - message bodies
   - post bodies when feasible

3. **Operational metadata**
   - timestamps
   - moderation state
   - delivery state
   - route ownership
   - device/session linkage

Do not encrypt the entire record as one blob if the backend still needs to search it.

## Step 1: Classify every field

Start by labeling each field as one of:

- public
- queryable
- encrypted
- derived
- moderation-only

### Profiles

Keep queryable:

- display name
- age or year of birth
- approximate location
- identities
- presentation
- sexuality
- body type
- position
- looking for
- availability
- hosting/travel
- vibes
- kinks
- hobbies
- drugs
- 420
- smoking
- drinking
- condoms

Encrypt:

- bio text
- safety notes
- any free-text field that is not required for search or rendering

### Messages

Encrypt:

- direct-message bodies
- group-message bodies
- attachment metadata that reveals sensitive context, if it is not needed for indexing

Keep queryable:

- conversation membership
- sender
- recipient / group id
- timestamps
- read state
- moderation state

### Feed posts

If possible, encrypt:

- post body text
- private attachment captions
- any free-text extras

Keep queryable:

- author
- expiration
- audience / visibility
- location context
- moderation state
- reply/thread linkage
- media references

If feed posts must be searchable or moderated by text content, keep a derived index or a moderation copy instead of exposing the plaintext broadly.

## Step 2: Define the storage model

Use separate tables or columns for sensitive fields:

- `*_public` or normal columns for queryable data
- `*_encrypted` for ciphertext
- `*_iv` / nonce fields where needed
- `*_key_version` to support re-encryption later
- `*_indexed` or join tables for filterable tags

Recommended pattern:

- profiles: normal relational profile table plus encrypted detail payload
- messages: message envelope table plus encrypted content column
- feed posts: post envelope table plus encrypted body column

## Step 3: Preserve filter performance

Do not put filterable values behind opaque encryption.

Use these mechanisms instead:

- normalized join tables for multi-select tags
- coarse buckets for age and age range
- fuzzed coordinates for map discovery
- blind indexes only for exact-match private values when absolutely necessary

Examples:

- body type, identities, vibes, kinks, etc. stay queryable as normalized option values
- bio text is encrypted because it is not required for filtering
- exact location stays separate from displayed location

## Step 4: Introduce application-layer encryption

Encrypt sensitive fields in the backend before storage.

Requirements:

- keys stay on the server or in a key management system
- never place encryption keys in frontend code
- use authenticated encryption
- version keys so data can be re-encrypted later

Recommended behavior:

- encrypt on write
- decrypt only in the backend when needed
- return only the minimum plaintext required to the frontend

## Step 5: Add a key hierarchy

Use a key strategy that allows rotation:

- one master key per environment
- derived data-encryption keys per data class or table
- key version stored with each encrypted record

Avoid:

- a single hardcoded global secret for everything
- keys in the browser
- secrets committed to the repo

## Step 6: Handle search and moderation explicitly

Encryption changes how moderation works.

Plan for:

- moderation-only decrypted access in backend tooling
- text search limited to fields intentionally left queryable
- separate moderation views for sensitive content
- audit logs for moderator access

If you need abuse detection on encrypted text, do not rely on plaintext search. Use:

- user reports
- rate limits
- metadata signals
- derived moderation indexes
- manual review tools

## Step 7: Migrate in slices

Do not flip everything at once.

Suggested order:

1. **Profiles**
   - encrypt bio and private notes first
   - keep discovery tags queryable

2. **Messages**
   - encrypt direct-message bodies
   - then group-message bodies

3. **Feed posts**
   - encrypt post text if the feed can still function with metadata-only filtering
   - otherwise keep a moderation copy and encrypt the user-facing body

4. **Attachments and media metadata**
   - protect metadata that exposes sensitive context
   - keep only what rendering requires public

## Step 8: Build for re-encryption and deletion

Add support for:

- key rotation
- re-encryption jobs
- export
- delete
- per-user cryptographic cleanup

This matters because encrypted data is only useful long term if it can be moved to a new key and fully removed on request.

## Recommended implementation order

### Phase A: groundwork

- define field classes
- add encryption helpers in the backend
- add key version columns
- add encryption test coverage

### Phase B: profiles

- encrypt bio/private notes
- keep filterable fields queryable
- add migration paths for legacy plaintext rows

### Phase C: messages

- encrypt direct messages
- encrypt group messages
- keep envelope metadata queryable

### Phase D: feed posts

- decide whether post text is encrypted or moderation-only
- preserve search and moderation requirements
- encrypt any free-text extras

### Phase E: ops

- add key rotation
- add encrypted-data export/delete support
- add moderation access auditing

## Tradeoffs

Encryption will not preserve all current product behavior for free.

Accept that:

- fully encrypted text cannot be filtered directly
- exact search on encrypted content requires special handling
- moderation tooling becomes more important
- some data should remain queryable by design

Do not claim end-to-end encryption unless the server truly cannot decrypt the data and the keys are user-held.

## Success criteria

The plan is working when:

- discovery filters still work
- messages still deliver normally
- moderators can review abuse reports
- encrypted fields are not stored in plaintext
- key rotation is possible
- local dev and staging still work with the same schema shape

## Bottom line

Encrypt free text and sensitive details. Keep the attributes required for discovery and moderation queryable. That is the only practical way to harden cruush without breaking the filter and map experience.
