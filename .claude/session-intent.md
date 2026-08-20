# Session intent: staged cruush 1.5 update

## Goal

Release the current cruush V1 production line as cruush 1.5 without importing stale or V2 work. Reconcile still-relevant fixes, compatible dependency security updates, production configuration evidence, and GitHub state.

## In scope

- Compare recent dirty issue worktrees with current `origin/main` and rescue only missing, current V1 fixes and tests.
- Apply compatible security, patch, and minor dependency updates in the first V1 batch.
- Isolate breaking major dependency migrations on a separate non-production branch.
- Audit production configuration and correct only proven drift when authenticated access exists.
- Verify and reconcile open GitHub issues and pull requests. Preserve remote branches unless separately authorized for deletion.
- Update operational documentation affected by the verified work.

## Explicitly out of scope

- V2 Liquid Glass, V2 crypto processor, Instagram marketing, corrupt-migration, and recovery work entering `main` or production.
- Wholesale merges from stale or dirty worktrees.
- Secret rotation, provider changes, billing changes, paid-service activation, production-data edits, or privacy reductions.
- Closing issues or pull requests without focused and live evidence.

## Definition of done

- Current V1 fixes are either rescued and verified or documented as already present or intentionally superseded.
- Compatible dependency security drift is resolved and breaking upgrades are isolated from production.
- Full V1 verification passes, affected UI is rendered and exercised, GitHub CI is green, and live V1 deployment serves the exact published SHA.
- Production configuration is verified or the exact authentication blocker is recorded.
- GitHub issues and pull requests are reconciled from evidence.
- V2 worktrees and branches remain unchanged and undeployed.
