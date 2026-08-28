# cruush — STANDING RULES FOR ALL AGENTS

**Read this file completely before doing anything. It overrides your defaults.**

Applies to Claude Code, Codex, Antigravity, and any subagent any of them spawn.

These rules were derived from 3,874 messages Julien wrote across 290 sessions between
2026-04-28 and 2026-08-06. Every rule below exists because the same correction had to be
given repeatedly across different agents. The evidence is in
`docs/repeated-instructions-audit-2026-08-06.md`.

Do not ask Julien to repeat anything documented here.

## The rules that are enforced by a command

These are not suggestions you interpret. Run them.

| Command | Enforces | Notes |
| --- | --- | --- |
| `pnpm ship -m "message"` | A1, A2, A3, F1, I5 | Commits, pushes to `main`, deploys, and polls until the deployed commit matches the pushed SHA. This is what "push to main" means. |
| `pnpm check:layout` | D1, D2, D5, D6, D7 | Drives the installed Chrome over the DevTools Protocol at 375/768/1280 and measures real bounding boxes. Add `--url https://www.cruush.app` to check production. |
| `pnpm check:copy` | F1, F4 | Fails on user-facing `cruush` or public em dashes. `--fix` rewrites product-name casing only. |
| `pnpm docs:worktrees` | J1 | Regenerates `docs/worktrees.md`. |
| `pnpm docs:env` | I1, I2 | Regenerates `docs/env-matrix.md` and lists variables the code reads that `server/.env.example` does not document. |

---

## A. Shipping

- **A1.** Done = committed and pushed to `main`, unless told otherwise in the same message.
- **A2.** After pushing, report the SHA, the deploy URL, and confirmation that the deployed
  commit matches what you pushed.
- **A4.** A live bug outranks everything else. Write the fix, build it, deploy it, then verify.
  Do not put a full test run, a visual pass, or planning work in front of a deploy that
  unblocks users. Say afterward what is still unverified.
- **A5.** Never commit a tree you have not built. Check every diff for conflict markers
  (`<<<<<<<`, `=======`, `>>>>>>>`) before committing. Commit `4fa1d40` shipped markers in three
  files, the build failed, and production could not move off `1c04c77`.
- **A3.** If you cannot push safely (dirty tree from another session, unmerged branch,
  failing safety check), say so in one line and state exactly what you need. Do not
  silently stop on a green build with an unpushed tree.

## B. Verification

- **B1.** Never report a visual change as done based on the diff. Look at the rendered result.
- **B2.** Every visual change ships with a screenshot in the same turn, unrequested:
  full viewport, 375px mobile and desktop, uncropped. Animated changes get a video or a
  frame strip.
- **B3.** Before claiming a fix, hard-reload and confirm the served asset actually changed.
  A stale service worker has served old assets here before and burned whole sessions.
- **B4.** Exercise the real path yourself — log in, click it, upload the photo. Do not ask
  Julien to check something you can check.
- **B5.** If you could not verify, say "I could not verify X" plainly. Never imply success.

## C. Scope

- **C1.** Change only what was named. Adjacent problems get one sentence, not an edit.
- **C2.** Never make product, design, or policy decisions. Options plus a recommendation,
  then wait.
- **C3.** Adding anything unrequested — an outline, a toggle, a new dropdown style, a
  circle around an icon — is a decision. Don't.
- **C4.** Before touching a shared token or style object, enumerate every surface it
  affects. Scope the change or state the blast radius and ask.
- **C10.** Julien is the only person who designs cruush. You may implement exactly the UI he
  describes, and you may build a mock or preview page when he asks to see options so he can
  pick. You may not originate any visual element, state treatment, colour, size, border, or
  placement he did not name, and you may not re-interpret one he already settled. This is the
  standing form of C2 and C3, which were not enough on their own: a pink halo was added around
  the DL Mode mask as a "lit state" nobody asked for, and the vibe capsules drifted into
  several variations after he asked for one colour and one text. If an element needs something
  it does not have, say so in one sentence and wait.
- **C5.** The map vector style, label sizing, and canvas filter are off limits unless the
  request names the map.
- **C6.** After a visual edit, measure the adjacent geometry too. The thing you did not
  intend to change is the thing that changed.
- **C7.** Never delete or disable an existing feature, control, handler, import, or test.
  Deletion happens only when the request names the thing to delete. This includes deletions
  that look like cleanup: an unused-looking handler, a button that seems redundant, a state
  flag, a test that no longer matches the component. If a change appears to require removing
  something, stop and ask.
- **C8.** Never delete, skip, or weaken a test to make a run pass. A failing test is either a
  real regression in the code under test (fix the code) or a test that the request explicitly
  authorized changing (say so in the same turn). Deleting the test is never the fix. The
  "Clear notifications" feature was removed this way in `4fa1d40`, and the test that caught it
  was deleted rather than the deletion reverted.
- **C9.** Before committing, read your own full diff and account for every removed line. Any
  removal not named by the request gets reverted before the commit, not explained after it.

## D. Layout invariants — do not regress

- **D1.** The bug-report button never intersects any interactive element or the logo, on
  any page, at any viewport.
- **D2.** The logo is never behind any element except butterflies, never cut off by the top
  edge, and keeps at least 50px clearance to the top of the page.
- **D3.** Heart pins never overlap the user's own pin.
- **D4.** The seeking bar never sits under the top nav.
- **D5.** Bottom links fill the page width and sit flush to the bottom.
- **D6.** Markers are circles, never ovals.
- **D7.** Nothing overlaps anything, anywhere, ever — except butterflies, which may fly
  over everything.

## E. Design system

- **E1.** One implementation per primitive: dropdown, pill, heart pin, glass surface,
  settings icon. Never introduce a second variant. If a surface needs something the
  primitive cannot do, extend the primitive.
- **E2.** Heart pin colors are global and semantic: **self = blue, mutual = purple,
  everyone else = pink/red.** Map, feed, messages, gallery — all of them.
- **E3.** Spacing, size and radius come from named tokens in `src/styles/theme.css`.
  No ad-hoc pixel values in components. "Same padding as X" means "same token as X."
- **E4.** Settings icons use the same glyph in the same position on every page.
- **E5.** No tan or beige frost anywhere. White, or the bottom-nav color.
- **E6.** When given a reference implementation (CodePen, gist, repo), port the actual
  code — same filter primitives, same constants, same layer order — into an isolated
  component first, verify it renders identically side by side, then adapt it to app colors
  and shapes. Never paraphrase a reference from memory. Keep the reference URL and a copy
  of its source in the repo next to the component that uses it.

## F. Copy and naming

- **F1.** `cruush` and `cruush+` are lowercase, always, including at the start of a
  sentence.
- **F2.** Map viewing and messaging are always free. We never sell user data.
- **F3.** Never describe the product as nightlife-only. It is for the whole queer community.
- **F4.** Public-facing copy never uses the Unicode em dash character (U+2014). Use a
  period, comma, colon, semicolon, parentheses, or a separate sentence instead.

## G. Product invariants

- **G1.** HIV status, trans status, and ethnicity are display fields only. They are never
  filters, visibility predicates, saved-set predicates, or token filter signals.
- **G2.** NSFW is allowed in the favorites gallery and in messages. Profile photos must be
  of the account holder.
- **G3.** cruush will never be in an app store. Do not propose app-store-driven constraints.
- **G4.** A "cruush" is one-sided; a mutual cruush is a match. Keep that distinction in copy
  and in code.
- **G5.** Auto-moderation must reject images of people who could never be mistaken for
  adults, regardless of which provider is up. The fallback chain must always be live.
- **G6.** Free tier: up to 3 seeking filters and up to 3 visibility controls.

## H. Third-party services

- **H1.** Never add anything requiring a paid subscription without explicit confirmation
  that Julien already has it. Prefer open source; state the cost tradeoff.
- **H2.** Read the current official docs for the exact endpoints before integrating. Quote
  the request and response shape in the plan. Never infer an API contract from SDK type
  names or from memory.
- **H3.** When Julien has a dashboard open and is authenticated, do the dashboard work
  yourself (Coolify, Stream, Resend, Cloudflare, AWS console). Do not hand back a list of
  clicks. Exceptions that require asking first: entering credentials or payment details,
  creating accounts, deleting data, and anything else irreversible.

## I. Config and secrets

- **I1.** Any new or renamed environment variable ends the turn with an explicit block:
  `NEW ENV VARS — name, value shape, which service, where to set it.` Never buried in prose.
- **I2.** Update `server/.env.example` and `docs/env-matrix.md` in the same change.
- **I3.** Only request credential rotation when there is evidence of exposure, and state
  the evidence. Do not rotate defensively by default.
- **I4.** Never ask Julien to paste a secret into chat.
- **I5.** Verify no secrets are staged before any commit. No secrets in frontend `VITE_*`
  variables. Never make private media buckets public.

## J. Branches, worktrees, continuity

- **J1.** Log every worktree in `docs/worktrees.md`: branch, purpose, which agent, current
  state, merged or not.
- **J2.** When continuing another agent's work, first enumerate branches and worktrees with
  last-commit dates and report what is where. Touch nothing before that.
- **J3.** Never abandon uncommitted work. Commit WIP with a message naming the next step.
- **J4.** Never revert or overwrite work you did not create without saying so first.

## K. Planning

- **K1.** Anything beyond a bounded edit — a new feature, a schema change, a cross-file
  refactor, anything touching moderation, privacy, or payments — gets a written plan and
  sign-off before code.
- **K2.** Batch questions. All of them, numbered, in one message. Twenty at once is fine.
- **K3.** Read `HANDOFF.md` and this file first. Do not ask Julien to repeat documented
  decisions.

## L. Tests

- **L1.** Default: no new test scaffolding during a fix. Ship the fix.
- **L2.** Exception, non-negotiable: if this exact thing has broken before, the fix ships
  with one focused regression test. Overlap bugs, moderation-pipeline bugs, and the
  bug-report button qualify permanently.
- **L3.** Verification (B4) is never optional and is not what L1 refers to.
- **L4.** Never run the full test suite (`pnpm test`, bare `vitest run`, `pnpm smoke` across
  every package). It takes too long and it blocks urgent deploys. Run the targeted files for
  what you touched: `pnpm vitest run <path> [<path> ...]`. The full suite runs only when
  Julien asks for it in that message, and `pnpm ship` runs its own gate.
- **L5.** A broken production deploy outranks test coverage. When something urgent is broken,
  ship the fix with the targeted tests for the files you touched; do not hold the deploy for a
  broad run.

## M. Communication

- **M1.** No narration of what you are about to do. Results only.
- **M2.** Never claim something works that you have not observed working.
- **M3.** When uncertain, say so in one line. Do not hedge across a paragraph.

---

## Amending this file

When Julien gives a correction that would have to be given twice, add it here in the same
turn. If the rule can be a test or a lint rule instead of a sentence, make it that. Prose is
for judgment calls only.
