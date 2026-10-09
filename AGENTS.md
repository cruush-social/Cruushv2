# cruush — start here

**Before doing anything, read `docs/CRUUSH-RULES.md` in full. It overrides your defaults.**

That file is the single source of truth for shipping, verification, scope, layout
invariants, the design system, product invariants, third-party integrations, secrets,
branches, planning, tests, and communication. Then read `HANDOFF.md` for the current
branch's context. Do not ask Julien to repeat anything documented in either file.

For every request in this checkout, also read `DESIGN_DECISIONS.md` and
`docs/design-master.md`. For processor work, read the current section of
`CODEX_HANDOFF.md`; its latest owner scope supersedes historical `HANDOFF.md`
processor status. Runtime architecture is in `docs/master-architecture.md`.

# AWS Guidance

- Prefer the AWS MCP Server for AWS interactions - it provides sandboxed
  execution, observability, and audit logging. If unavailable, use the
  AWS CLI directly.
- Before starting a task, check whether a relevant AWS skill is available.
  Load the skill with `retrieve_skill` and prefer its guidance over
  general knowledge.
- When uncertain about specific AWS details (API parameters, permissions,
  limits, error codes), verify against documentation rather than guessing.
  State uncertainty explicitly if you cannot confirm.
- When creating infrastructure, prefer infrastructure-as-code (AWS CDK or
  CloudFormation) over direct CLI commands.
- When working with infrastructure, follow AWS Well-Architected Framework
  principles.
- Do not use em dashes in AWS resource names or descriptions. Use
  hyphens instead.

## Secret Safety

- MUST load the `aws-secrets-manager` skill first for any secret,
  credential, API key, token, or password task. MUST NOT call
  `secretsmanager get-secret-value` or `batch-get-secret-value`, and MUST
  NOT hit the Secrets Manager Agent daemon directly. MUST use
  `{{resolve:secretsmanager:secret-id:SecretString:json-key}}` with
  `asm-exec` so the secret resolves at runtime without entering context.


# Product naming

- The product name is always `cruush`, all lowercase, in UI, copy, docs,
  tests, comments, commit messages, and agent responses.
- Do not capitalize or title-case the product name. Preserve legal entity names
  exactly as legally written when they are explicitly provided.
- Before finalizing work, run `pnpm check:cruush-casing` and correct any
  product-name casing errors it reports.

## Current project documents

On every project request, read `docs/CRUUSH-RULES.md`, `HANDOFF.md`,
`DESIGN_DECISIONS.md`, and `docs/design-master.md` in this checkout.
For backend or infrastructure work, consult `docs/master-architecture.md` and
the applicable source. Current explicit user instructions override older decisions.

## Mistakes
- 2026-10-09: Used an unverified database helper interface in the ignored review launcher; corrected it to resolve the API-owned pg Pool, then completed the isolated migration and restarted only the review API.
- 2026-10-09: Recorded a browser handoff before checking command success; corrected the queue to the actual user-takeover hard stop and waited for explicit continuation.
- 2026-10-09: A delegated queue entry mislabeled internal implementation instructions as Julien quotations; corrected the attribution and retained the actual user requests as the scope authority.
- 2026-10-09: The v2 settings replay dropped existing standalone Feed map-pin option descriptions; restored their original text and class only when not embedded, preserving the new layout and privacy gate, then passed the 32 Feed tests.
- 2026-10-09: Introduced a malformed notification-type array while adding OOS privacy enforcement; corrected it before release and reran the six focused notification-visibility tests successfully.
- 2026-10-09: Replayed a source-only Push prompt test over the richer production test file during v2 integration; restored the original permission, iOS, account, dismissal, and error coverage before release.
- 2026-10-09: Reverted the shared cruush+ and Rewards header after an incomplete queue-only review; restored the shared title when the later explicit approval in DESIGN_DECISIONS.md was checked.
- 2026-10-08: Expanded a short Git commit ID by guessing its remaining characters when pinning Coolify, causing one frontend deployment to fail and one invalid API deployment to queue; canceled the invalid job, derived the full SHA from `git rev-parse`, corrected both pins, and verified both production services on the exact remote SHA.
- 2026-10-08: Briefly removed the requested periods from shared-message preview text after misreading its literal target; restored them immediately and recorded the scope in the correct v2 session queue.
- 2026-10-08: Seeded the isolated local admin with the test-profile credential instead of Julien's established dev-admin password, causing his login to fail; reseeded only the isolated database from the existing dev credential without exposing or changing it and verified login returned 200.
- 2026-10-08: Handed off the local review server without implementing Julien's requested larger mobile landing-page text; added the missing request to the queue and corrected the phone-only typography before continuing.
- 2026-10-08: Asked Julien to enter a local admin password even though the repository's seeded review path needs no user credential; closed the prompt, reverted the temporary launcher edit, and used the isolated local seed instead.
- 2026-10-08: Pinned Coolify to an unverified completed SHA, causing two frontend deployment failures; cancelled the invalid queued API deployment, read the actual full commit with `git rev-parse HEAD`, repinned both apps, and verified the matching production SHA.
- 2026-10-07: Wrote uppercase cruush in a design-decision quote despite the lowercase product rule; normalized it before shipping.
- 2026-10-07: Started a LAN dev server for phone review whose separate local auth state rejected the expected admin login; stopped both added servers and returned phone verification to the real deployed site.

- 2026-10-07: Misread “Make a new club page directs to checkout” as a requested redirect instead of a report that the redirect was the bug; removed the redirect so New Club opens the existing composer.
- 2026-10-07: Misread “Cruushes page” as the full profile-detail `ProfileCard` after an earlier wrapper attempt; restored that component and extracted the exact compact Cruushes-page heart row into one `CruushesProfileCard` used by unlocked Cruushes rows and all three choosers.
- 2026-10-07: Misidentified a stale fake billing scaffold as the current cruush+ processor; switched to current `origin/main` and reused the real in-house Bitcoin Store and processor.
- 2026-10-07: Logged a local development admin password while preparing browser verification; rotated it in a private worktree-local environment file, reseeded the local-only admin, and kept production and the shared environment unchanged.
