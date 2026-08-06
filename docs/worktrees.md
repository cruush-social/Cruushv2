# Worktrees

Per `docs/CRUUSH-RULES.md` J1: every worktree is logged here — branch, purpose, which agent,
current state, merged or not.

| Branch | Base | Purpose | Agent | State | Merged |
| --- | --- | --- | --- | --- | --- |
| `claude/error-fixes-c9dgs3` | `codex/urgent-bugfix-safety-release` @ `cfde0fb` | Stream-outage fallbacks for text and feed images, moderation dashboard header overlap, bug button docked into the bottom nav, first-run notices no longer suppressed by a notices-API error | Claude Code | Pushed | No |

## Branch layout as of 2026-08-06

Production runs `codex/urgent-bugfix-safety-release`, not `main`. The two have diverged:
`main` carries 13 commits that are not deployed, and the codex branch carries 14 commits that
are not on `main`. Confirmed from production: `GET https://api.cruush.app/api/meta` returns no
`build` field, which only exists on `main` (commit `4e830c1`), and the deployed user-facing
copy "We could not check this text for harmful content" only exists on the codex branch
(commit `cfde0fb`).

Anything meant to reach users has to land on the deployed branch. A fix branched from `main`
would either never ship or would revert the 14 deployed commits.
