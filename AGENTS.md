# cruush — start here

**Before doing anything, read `docs/CRUUSH-RULES.md` in full. It overrides your defaults.**

That file is the single source of truth for shipping, verification, scope, layout
invariants, the design system, product invariants, third-party integrations, secrets,
branches, planning, tests, and communication. Then read `HANDOFF.md` for the current
branch's context. Do not ask Julien to repeat anything documented in either file.

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
