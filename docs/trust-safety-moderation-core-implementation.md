# Trust, Safety, And Moderation Core Implementation

> Update (2026-07-21): human moderation is now product UI for authorized moderators. User reports and ordinary non-allowed content reviews share one paginated queue with context, decisions, enforcement, and audit history. The historical gap statement below is superseded by `docs/moderation.md`.

This document summarizes the implementation pass based on `Cruush_Trust_Safety_Moderation_Developer_Spec_v4-1.pdf`.

## Implemented In This Pass

- Added moderation foundation storage in `server/sql/022_moderation_foundation.sql`.
- Added internal trust profiles, immutable trust events, content reviews, moderation history, evidence events, suspensions, and feature restrictions.
- Backfilled `user_trust_profiles` for existing users and created trust profiles during sign-up.
- Added moderation environment variables to `.env.example` and server config.
- Added a replaceable moderation provider interface with a launch-safe mock provider.
- Added a policy mapper that converts normalized provider labels into Cruush decisions instead of letting provider labels directly change trust.
- Added a trust engine that writes evidence, moderation history, trust events, caps, suspensions, feature restrictions, and recalculates trust from events.
- Added a protected internal endpoint: `GET /api/internal/users/:userId/trust`, enabled only when `INTERNAL_API_SECRET` is configured.
- Added report weighting and report-driven evidence events for existing report creation.
- Added pre-storage moderation gates for:
  - `POST /api/posts`
  - `POST /api/messages`
  - `POST /api/profile-photos`
- Added feature gates for feed posting, direct messages, group messages, and photo uploads based on trust/suspension/restriction state.
- Added fixture-style policy mapper tests, trust calculation tests, and route-level rejection tests.

## Important Behavior

- Allowed feed posts, messages, and profile photos now create a `content_reviews` row as part of the same database write that stores the content.
- Rejected feed posts/messages/photos do not reach the existing content tables or disk-backed profile photo storage.
- Drug sales are rejected, create evidence/history/trust events, apply a trust cap, and suspend the account.
- PnP discussion is allowed in direct/group messages but rejected from the feed.
- Commercial sex solicitation is rejected with trust impact and a cap.
- Underage sexual content, bestiality, and revenge porn set trust to zero and permanently suspend.
- Adult 18+ content labels are allowed outside the public feed unless paired with a prohibited category.
- Normal users still never receive trust score data.

## Known Remaining Gaps

- Real third-party provider integrations are not implemented; `MODERATION_PROVIDER=mock` is the only working provider.
- RabbitMQ workers, retries, dead-letter queues, and provider failover are not implemented.
- The existing message/photo storage model is not fully converted to post-moderation encrypted storage.
- Provider raw-result encryption is represented by schema support, but raw provider payloads are not stored.
- Trust decay scheduling is not implemented.
- Group creation/ownership transfer, ban-evasion signal ingestion, and crowd-specific restriction enforcement remain future work.
- Human moderation and appeals remain schema-compatible future work, not product UI.

## Validation

These commands passed after implementation:

```bash
npm --prefix server test
npm --prefix server run build
corepack pnpm test
corepack pnpm build
```

The frontend production build still emits the existing large-chunk warning.
