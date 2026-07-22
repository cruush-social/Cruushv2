# cruush Codeveloper Handoff

Start here when opening this branch in Codex.

## Current Branch

`codex/beta-launch-codeveloper-handoff`

## Primary Plan

Read this file completely before editing code:

`docs/plans/2026-07-21-beta-launch-codeveloper-handoff.md`

Treat that document as the implementation source of truth for the next beta-launch work. It covers DL Mode, NSFW blur, suggested nearby profiles, The Chocolate Factory party-code flow, party feed/chat access, dense venue map handling for 500-600 people, and the beta UI readiness pass.

## Codex Prompt

Use this prompt:

```text
Read docs/plans/2026-07-21-beta-launch-codeveloper-handoff.md completely. Treat it as the implementation handoff. Start with Task 1 and follow the document in order. Preserve the non-negotiables. Do not ask Julien what is next unless the document explicitly says a production value like event time, coordinates, radius, or staff emails is missing.
```

## Rules

- Keep `cruush` lowercase.
- Do not add fake accounts, fake profiles, fake messages, fake DMs, fake groups, or fake bank/reviewer content.
- Do not put secrets in frontend `VITE_*` variables.
- Do not make private media buckets public.
- Do not claim end-to-end encryption, real identity verification, or physical safety guarantees.
- Use focused tests for touched code first, then full test/build before release readiness.

## Developer Stop Point

The work is not done until a user can open the map, see suggested nearby profiles, use DL Mode, keep NSFW photos blurred unless opted in, tap The Chocolate Factory warehouse pin, enter a staff-generated 6-digit code, access the party feed/chat after redemption, and use the map at party density without inaccessible overlapping heart pins.
