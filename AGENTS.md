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
- 2026-10-07: Wrote uppercase cruush in a design-decision quote despite the lowercase product rule; normalized it before shipping.
- 2026-10-07: Started a LAN dev server for phone review whose separate local auth state rejected the expected admin login; stopped both added servers and returned phone verification to the real deployed site.

- 2026-10-07: Misread “Make a new club page directs to checkout” as a requested redirect instead of a report that the redirect was the bug; removed the redirect so New Club opens the existing composer.
- 2026-10-07: Misread “Cruushes page” as the full profile-detail `ProfileCard` after an earlier wrapper attempt; restored that component and extracted the exact compact Cruushes-page heart row into one `CruushesProfileCard` used by unlocked Cruushes rows and all three choosers.
- 2026-10-07: Misidentified a stale fake billing scaffold as the current cruush+ processor; switched to current `origin/main` and reused the real in-house Bitcoin Store and processor.
- 2026-10-07: Logged a local development admin password while preparing browser verification; rotated it in a private worktree-local environment file, reseeded the local-only admin, and kept production and the shared environment unchanged.
