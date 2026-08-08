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

# cruush Visual Change Rules

- For visual/UI changes, inspect the actual rendered page after the change
  before calling the work done. Source diffs, computed styles, and verbal
  reasoning are not acceptance proof.
- Save a named local screenshot/checkpoint for every rendered visual state that
  may need to be compared or restored later. If the user asks to go back to a
  point before or after a prior message, treat that as a literal history
  checkpoint request, not a design interpretation.
- Change only the files/properties needed for the user-requested visual change.
  Do not alter adjacent nav bars, backgrounds, effects, copy, spacing, or
  unrelated components unless explicitly asked.
- If visual verification is blocked, say exactly what blocked it and do not
  claim the visual result is verified.
- When Julien asks for a preview or comparison of UI/code states, prefer live
  rendered code on a page over static screenshots. Use screenshots as evidence
  or fallback only, unless screenshots are explicitly requested.

# Product naming

- The product name is always `cruush`, all lowercase, in UI, copy, docs,
  tests, comments, commit messages, and agent responses.
- Do not capitalize or title-case the product name. Preserve legal entity names
  exactly as legally written when they are explicitly provided.
- Before finalizing work, run `pnpm check:cruush-casing` and correct any
  product-name casing errors it reports.
