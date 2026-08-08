# cruush — working specification

**Version 2.2 · 2026-08-06**
Subject branch `feature/landing-page-liquid-glass-antigravity`, worktree
`/Volumes/corrupt/Cruushv2-1.worktrees/landing-page-liquid-glass-antigravity`
This copy is maintained at `.claude/worktrees/spec-work` on branch
`worktree-spec-work`.

**What 2.2 adds.** Everything below Part I was already here. 2.2 folds in the
standing rules that live in `docs/CRUUSH-RULES.md` (Part 0), the evidence behind
them (Part XII), four new hard rules for the repeats that cost the most (R15–R18),
the test policy that was previously only implicit (Part IX §37.8), and a corrected
branch topology (Part X). The title is lowercase from this version on, because
rule F1 says `cruush` is always lowercase and this document was breaking it.

---

## What this document is

This is the single source of truth for the work outstanding on the liquid-glass
line of the cruush app: the glass system, the landing page, the map pins, the
teaser, and the application-logic asks that arrived alongside them.

It exists because a long working session produced repeated regressions, several
claims of completion that were not verified, and changes outside the scope of
what was asked. Everything here is written so that the next person — or the next
session — can execute without re-deriving context and without repeating those
mistakes.

Version 2.0 replaces the 1.0 draft. It is written from the code rather than from
memory: every value, selector and file reference below was read out of the
working tree at the time of writing. Where something could not be substantiated
it is marked `Unverified:` rather than asserted.

**Provenance, stated honestly.** Parts II–V and VII–X were each drafted by
reading the relevant source files directly. A second, independent fact-checking
pass over those parts was started and did not complete, so treat their line
numbers as a guide rather than a guarantee — file contents move, line references
rot, and these were not re-confirmed. Values quoted with a `path:line` citation
should be spot-checked against the file before being relied on for a decision.
Parts I, VI and XI were written and checked directly against the source.

**Read Part I before touching anything.** Part I is not preamble; it is the part
that stops the same four failures recurring.

---

## Contents

| Part | Subject |
| --- | --- |
| **0** | Standing rules for every agent — the enforced commands, and the A–M ruleset |
| **I** | Governance — hard rules, definition of done, verification protocol |
| **II** | The glass engine — three implementations, and the one that should survive |
| **III** | The `backdrop-filter` blocker, and the experiment that resolves it |
| **IV** | Heart pins and map markers |
| **V** | The map — a hard scope boundary |
| **VI** | The landing page — layout contract, controls, and captcha |
| **VII** | The teaser — logo loops, glitter, and butterflies |
| **VIII** | Navigation chrome, onboarding, and application logic |
| **IX** | Testing — what the suites assert, and what they cannot |
| **X** | Branch state, integration, and the regression log |
| **XI** | Sequencing — execution order and acceptance criteria |
| **XII** | The repeat ledger — what Julien has already said, how often, and where it is now enforced |
| **Appendices** | Glossary; the two mechanisms worth memorising; file map |

## How to use it

| If you are about to… | Read |
| --- | --- |
| Start a session, on any branch, for any task | Part 0 |
| Commit, push, deploy, or answer "is it live?" | Part 0 §1, Part 0 §2 A |
| Add a dependency, a key, or an environment variable | Part 0 §2 I |
| Ask Julien to do something in a browser or a dashboard | Part 0 §2 H, R17 |
| Change anything at all | Part I |
| Touch a glass surface | Part I, Part II, Part III |
| Touch the map, its tiles, or its labels | Part I §1 R1, Part V |
| Touch a heart pin or a marker | Part IV |
| Touch the landing page | Part VI |
| Touch the logo video or the background | Part VII |
| Touch the nav, onboarding, or server logic | Part VIII |
| Write or fix a test | Part IX |
| Merge, branch, or commit | Part X |
| Decide what to do next | Part XI |
| Recognise a familiar-looking visual bug | Appendix B |
| Wonder whether Julien has already told you this | Part XII |

---

# Part 0 — Standing rules for every agent

## 0. Where the rules actually live

`docs/CRUUSH-RULES.md` is the single standing-rules file for this repository. It
applies to Claude Code, Codex, Antigravity, and any subagent any of them spawn.
It is on `origin/main` (added in `6d7f569`, enforced by `750bc70`), so it is
present in every fresh checkout and every new worktree. `CLAUDE.md`, `AGENTS.md`
and `HANDOFF.md` are pointers at it and carry no rules of their own.

**Precedence.** Where this specification and `CRUUSH-RULES.md` disagree,
`CRUUSH-RULES.md` wins and this document is the thing that gets corrected. The
mirror in §2 below is one line per rule so that a reader of this specification
does not have to fetch a second file to know what the rules are — it is
deliberately not the full text, because two full copies would drift.

**The one conflict, resolved.** Rule A1 says done means committed and pushed to
`main`. Part X of this document says never push the glass branch to `main`.
Both are correct and the scope is what separates them: A1 is the default for
ordinary work; the prohibition in Part X is specific to
`feature/landing-page-liquid-glass-antigravity`, which carries 102 unreviewed
commits, an out-of-scope map label change and an SQL revert, and must be merged
deliberately rather than pushed. When a branch carries that kind of freight, say
so in one line and state what you need (A3). Do not silently stop.

**Amending.** When Julien gives a correction that would otherwise have to be
given twice, append it to `CRUUSH-RULES.md` in the same turn, and add a line to
§2 here. If the rule can be a test, a lint rule or a script instead of a
sentence, make it that — prose is for judgement calls only.

## 1. The rules that are enforced by a command

These are not suggestions to interpret. Run them. All five exist in
`package.json` on `origin/main` and were verified present at the time of writing.

| Command | Enforces | What it does |
| --- | --- | --- |
| `pnpm ship -m "message"` | A1, A2, A3, F1, I5 | Commits, pushes to `main`, deploys, and polls until the deployed commit matches the pushed SHA. This is what "push to main" means. |
| `pnpm check:layout` | D1, D2, D5, D6, D7 | Drives the installed Chrome over the DevTools Protocol at 375/768/1280 and measures real bounding boxes. `--url https://www.cruush.app` checks production. |
| `pnpm check:copy` | F1 | Fails on user-facing `cruush`. `--fix` rewrites it. |
| `pnpm docs:worktrees` | J1 | Regenerates `docs/worktrees.md`. |
| `pnpm docs:env` | I1, I2 | Regenerates `docs/env-matrix.md` and lists variables the code reads that `server/.env.example` does not document. |
| `pnpm security:check` | I5 | Staged-secret scan before commit. |

A rule with a command behind it is not satisfied by intending to follow it. If
the command was not run, the rule was not met.

## 2. The ruleset, one line each

Full text in `docs/CRUUSH-RULES.md`. Derived from 3,874 messages Julien wrote
across 290 sessions between 2026-04-28 and 2026-08-06; every entry exists because
the same correction had to be given repeatedly to different agents.

**A — Shipping.** A1 done = committed and pushed to `main` unless told otherwise
in the same message · A2 report the SHA, the deploy URL, and that the deployed
commit matches what was pushed · A3 if you cannot push safely, say so in one line
and state exactly what you need.

**B — Verification.** B1 never report a visual change from the diff · B2 every
visual change ships a screenshot in the same turn, unrequested, full viewport,
375px and desktop, uncropped; animation gets a video or a frame strip · B3
hard-reload and confirm the served asset changed — a stale service worker has
burned whole sessions here · B4 exercise the real path yourself; do not ask
Julien to check what you can check · B5 if you could not verify, say "I could not
verify X" plainly.

**C — Scope.** C1 change only what was named; adjacent problems get a sentence,
not an edit · C2 never make product, design or policy decisions — options plus a
recommendation, then wait · C3 adding anything unrequested is a decision · C4
before touching a shared token or style object, enumerate every surface it
affects · C5 the map vector style, label sizing and canvas filter are off limits
unless the request names the map · C6 after a visual edit, measure the adjacent
geometry too.

**D — Layout invariants.** D1 the bug-report button never intersects an
interactive element or the logo, at any viewport · D2 the logo is never behind
anything except butterflies, never cut off at the top, and keeps ≥50px clearance
· D3 heart pins never overlap the user's own pin · D4 the seeking bar never sits
under the top nav · D5 bottom links fill the page width and sit flush to the
bottom · D6 markers are circles, never ovals · D7 nothing overlaps anything,
anywhere, ever — except butterflies, which may fly over everything.

**E — Design system.** E1 one implementation per primitive; extend it, never fork
it · E2 heart pin colours are global and semantic — self = blue, mutual = purple,
everyone else = pink/red, on map, feed, messages and gallery alike · E3 spacing,
size and radius come from named tokens in `src/styles/theme.css`; "same padding
as X" means "same token as X" · E4 settings icons use the same glyph in the same
position on every page · E5 no tan or beige frost anywhere — white, or the
bottom-nav colour · E6 port a reference implementation's actual code into an
isolated component and verify it side by side before adapting it; never
paraphrase a reference from memory; keep the URL and a copy of the source next to
the component.

**F — Copy and naming.** F1 `cruush` and `cruush+` are lowercase always,
including at the start of a sentence · F2 map viewing and messaging are always
free, and we never sell user data · F3 never describe the product as
nightlife-only — it is for the whole queer community.

**G — Product invariants.** G1 HIV status, trans status and ethnicity are display
fields only — never filters, visibility predicates, saved-set predicates or token
filter signals · G2 NSFW is allowed in the favourites gallery and in messages;
profile photos must be of the account holder · G3 cruush will never be in an app
store · G4 a cruush is one-sided, a mutual cruush is a match — keep the
distinction in copy and in code · G5 auto-moderation must reject images of people
who could never be mistaken for adults regardless of which provider is up; the
fallback chain is always live · G6 free tier is up to 3 seeking filters and up to
3 visibility controls.

**H — Third-party services.** H1 never add anything requiring a paid
subscription without explicit confirmation that Julien already has it · H2 read
the current official docs for the exact endpoints before integrating and quote
the request and response shape in the plan · H3 when Julien has a dashboard open
and authenticated, do the dashboard work yourself — Coolify, Stream, Resend,
Cloudflare, AWS. Ask first only for credentials, payment details, account
creation, deletion, and anything else irreversible.

**I — Config and secrets.** I1 any new or renamed environment variable ends the
turn with an explicit `NEW ENV VARS — name, value shape, which service, where to
set it` block, never buried in prose · I2 update `server/.env.example` and
`docs/env-matrix.md` in the same change · I3 only request credential rotation
with stated evidence of exposure · I4 never ask Julien to paste a secret into
chat · I5 verify no secrets are staged before any commit; no secrets in `VITE_*`;
never make private media buckets public.

**J — Branches, worktrees, continuity.** J1 log every worktree in
`docs/worktrees.md` · J2 when continuing another agent's work, enumerate branches
and worktrees with last-commit dates and report what is where before touching
anything · J3 never abandon uncommitted work — commit WIP naming the next step ·
J4 never revert or overwrite work you did not create without saying so first.

**K — Planning.** K1 anything beyond a bounded edit — a feature, a schema change,
a cross-file refactor, anything touching moderation, privacy or payments — gets a
written plan and sign-off before code · K2 batch questions: all of them, numbered,
in one message; twenty at once is fine · K3 read `HANDOFF.md` and the rules file
first, and do not ask Julien to repeat documented decisions.

**L — Tests.** L1 default is no new test scaffolding during a fix; ship the fix ·
L2 exception, non-negotiable: if this exact thing has broken before, the fix
ships with one focused regression test — overlap bugs, moderation-pipeline bugs
and the bug-report button qualify permanently · L3 verification (B4) is never
optional and is not what L1 refers to.

**M — Communication.** M1 no narration of what you are about to do; results only
· M2 never claim something works that you have not observed working · M3 when
uncertain, say so in one line rather than hedging across a paragraph.

## 3. The one rule that is not in `CRUUSH-RULES.md`

**Infrastructure is genuinely new to Julien, and that is not repetition.** The
audit counted 58 "step by step, I've never done this" messages across AWS,
Coolify, Hetzner, DNS/MX/DKIM, GitHub tokens, PhotoDNA and Cloudflare R2. Those
are first-time infrastructure asks and they are legitimate — do not treat them as
something a document should have prevented. What the document can prevent is the
part that is avoidable: handing back a list of console clicks for work you have
the access to do yourself (H3). When a step genuinely must be done by hand,
give the exact path — the console, the page, the field, the value — not a summary
of the concept.

---

# Part I — Governance

## 1. Hard rules

These are not preferences. Breaking one is a defect regardless of how good the
result looks. Each rule is followed by the specific failure it exists to prevent;
the rules are not abstract good practice, they are scar tissue.

### R1 — Never touch the map

The custom map tiles and the map's own rendering are out of scope unless the
request names the map explicitly. The full boundary is enumerated in Part V §1.

**Prevents:** a canvas `brightness` value that predated the session was changed
in response to a question about why the map looked dark, and a
`.cruush-map-shell` background override was added while chasing a warm cast.
Neither was asked for; both had to be reverted.

### R2 — A question is not an instruction

"Why is the map dark?", "why is it tan?", "why did that move?" are questions.
Answer with the cause and where it lives. Do not change the thing. Offer the
change as a follow-up question and wait for a yes.

**Prevents:** "why the fuck did you make the map so dark" produced an edit rather
than the answer, which was that the value had not been touched at all.

### R3 — Change only what was named

If asked to change a size, change the size. Do not also change the colour, the
spacing, or a neighbouring element that looked off while you were in there.

**Corollary — magnitude is part of scope.** Doubling a value is a look change
even if only one property moved. When a change has no specified magnitude, prefer
the smallest change that satisfies the ask, and say what you picked so it can be
adjusted.

**Prevents:** asked to enlarge street names, place names were enlarged too, and
street names went up roughly 75% in one step. Same property, wrong targets and
wrong magnitude. The result read as "you changed the font".

### R4 — No live experiments in the user's browser

Do not mutate the DOM, inline styles, or stylesheets through the console to test
a hypothesis. The user is looking at that screen. Test in code behind a reload,
or in an isolated scratch page.

**Prevents:** removing a filter's region attributes through the console to test a
theory left a visibly broken dock on screen for minutes, which read as a broken
build.

### R5 — Verify before claiming

No item is reported complete without evidence appropriate to its type — see §4.
Computed styles prove a property is set; they do not prove it renders.

**Prevents:** "it's live on the bottom nav, you can see it" — based only on the
computed `backdrop-filter` string. The filter was not rendering.

### R6 — Report scope honestly

If part of a task is blocked, incomplete, or was skipped, say so explicitly in
the same message that reports the rest. Never let the user discover it.

**Prevents:** a signal-tag fix reported complete twice; both times it was
measured at rest and never hovered, which is the only state where it fails.

### R7 — One surface before roll-out

Visual systems change on one component first, get confirmed, then roll out.

**Prevents:** glass changes applied across every surface at once produced several
rounds of "it looks worse" with no way to isolate which change caused it.

### R8 — One agent per checkout

Two sessions must never write to the same working tree. Use a worktree per agent.

**Prevents:** a working tree was overwritten repeatedly by another session's
branch switches and commits, so completed fixes appeared to vanish and were
re-implemented several times.

### R9 — Measure in the state that fails

Geometry is measured in every relevant state: hovered as well as resting, sign-up
as well as sign-in, captcha present as well as absent, error banner shown as well
as hidden.

**Prevents:** two "fixed" reports on an overlap that only occurs while the pin is
hover-scaled.

### R10 — Nothing on the landing page ever overlaps

No element on the landing page may paint over another, in any state, at any
viewport size. When the stack cannot fit, things yield in this order and no
other: first the logo band shrinks (to zero if it must), then the page scrolls.
Overlap is never the rendered result, and "it fits on my window" is not
verification — the failing states are the short window with the error capsule
and the captcha both present.

**Prevents:** with a fixed-height shell and an unclamped band expression, error
capsule + active captcha on a short window pushed the card straight over the
footer contacts and legal links (regression 16).


### R11 — Side effects are scope, and the browser is the user's screen

A requested change's side effects count as unasked changes. Narrowing a button
that then silently parks itself on the left edge is a placement change nobody
asked for, even though only `width` was named. After any layout edit, measure
the changed property **and** the adjacent geometry — position, centring,
siblings' gaps — before reporting.

The same applies to verification itself: the Browser pane is the user's screen.
Any state mutated to reproduce a condition — viewport size, navigation, form
mode, scroll position — is restored before the turn ends.

**Prevents:** the preview viewport was resized to 900×640 to reproduce an
overlap and left that way; and the narrowed sign-in button shipped hugging the
left edge because `inline-block` zeroes auto margins.

### R12 — One ask, one edit, one report

A message names one thing. Change that one thing and stop. Do not carry work
forward from a previous message into the current edit, do not bundle a second
improvement because the file is already open, and do not fix an adjacent defect
you noticed on the way — note it and ask.

The test before every edit: **which words in the current message authorise this
line?** If none, the line does not go in. This applies even when the extra edit
is required to make the asked-for change work; in that case say so and let the
user decide, rather than shipping both and explaining afterwards.

When several asks arrive in one message, do them as separate edits and report
them as a numbered list, so any one of them can be reverted without disturbing
the others.

**Prevents:** a request to restore a hover effect that arrived alongside gradient
and footer work, where all three landed together and the user could no longer
tell which change caused what. Also the width request that shipped a placement
change with it (R11), and the label restyle that shipped with a copy change.

### R13 — Restate the ask before editing; revert means revert

Before any edit, restate the ask in one sentence — the literal words, not an
interpretation of what would be better. If the restatement contains a second
verb ("and also", "which needs"), that is a second ask and it does not happen.

Specific obligations:

- **"Revert" means restore the previous bytes**, not "reimplement something
  similar". Find the exact prior value and put it back. If the prior value is
  not recoverable from the session, say so and ask, rather than approximating.
- **"Put X back" is a revert, not a redesign.** It never authorises tuning X
  while restoring it.
- **A complaint is not a brief.** "This looks wrong" authorises diagnosis and a
  proposal, not a fix that changes values the user has already approved.
- **Never explain a rejected change by re-litigating who asked for it.** Revert
  first, discuss after, and only if asked.

**Prevents:** repeated rounds where a one-line ask returned a multi-property
change, and where "revert" produced a new variant instead of the previous one,
so the user had to describe the same target three times.

### R14 — Runtime integrity is a release gate

The page is not considered running because Vite served JavaScript. The frontend
and API are one system, and the browser must never be left with a broken shell
because an API dependency failed or a lazy component resolved to `undefined`.

Before visual acceptance or login acceptance, the exact frontend origin used by
the browser must pass all of these checks:

1. `GET /health` returns a successful, parseable response from the API actually
   serving the Vite proxy.
2. `GET /api/meta` returns HTTP 200 and the complete typed metadata contract;
   it must not depend on an optional provider, missing migration, or an
   unhandled database/configuration exception.
3. `POST /api/auth/login` is exercised with a known test account and returns a
   documented auth result or a documented 4xx policy response. An unexpected
   5xx is a release blocker.
4. The frontend handles metadata failure as an explicit unavailable state with
   a user-facing recovery path. Fallback values may preserve safe rendering,
   but they must not conceal a broken API in verification output.
5. Every `lazy()` import, route element, preview entry, and dynamically chosen
   component is resolved in a production build and in the signed-out browser
   path. No React render may receive `undefined` where a component is required.

The browser console is part of the acceptance evidence. A minified React error,
an uncaught render exception, or an unexpected 500 from `/api/*` fails the run
even if the page eventually paints. The server log and response body must be
captured for the first 5xx; never diagnose a minified client error in isolation.

**Prevents:** the landing page appearing to load while `/api/meta` and
`/api/auth/login` returned 500, followed by Minified React error #130 because a
rendered value was `undefined`.


### R15 — Done is deployed, not committed

Work that is finished and unpushed is work Julien has to spend a turn on. The
default end state of a task is `pnpm ship -m "message"`: committed, pushed to
`main`, deployed, and polled until the deployed commit matches the pushed SHA.
Report the SHA, the URL, and the match. If the branch cannot be pushed safely —
this one cannot, see Part X — say so in one line and state exactly what you
need, in the same message that reports the work.

**Prevents:** 126 separate messages asking for a push, and 134 more asking
whether it deployed. Authority: `CRUUSH-RULES.md` A1–A3.

### R16 — The screenshot ships unrequested

Every visual change is reported with a screenshot in the same turn, without being
asked: full viewport, uncropped, at 375px and at desktop width. Animated changes
get a video or a frame strip. A description of a visual result is not a report of
one.

**Prevents:** 210 messages asking to be shown the thing. This is the single most
repeated request in the corpus, and it is the cheapest to obey. Authority: B2.

### R17 — Full access means use it

Where the credentials, the dashboard session or the browser are already
available — Coolify, Stream, Resend, Cloudflare, AWS, the app itself — do the
work. Do not return a list of clicks for something you can perform. Log in,
click it, upload the photo, read the log. Ask first only for the four
irreversible classes: entering credentials or payment details, creating
accounts, deleting data, and anything else that cannot be undone.

**Prevents:** 112 messages of the form "do it for me, you have full access", and
the whole class of verification that was handed back rather than performed.
Authority: H3, B4.

### R18 — A new environment variable ends the turn with a block

Any new or renamed environment variable, key or secret ends the turn with an
explicit block — `NEW ENV VARS — name, value shape, which service, where to set
it` — never mentioned in passing inside prose. `server/.env.example` and
`docs/env-matrix.md` are updated in the same change. Run `pnpm docs:env` to find
what the code reads and the example does not document.

**Prevents:** 126 messages of environment and key plumbing, most of them
discovered when production broke rather than when the variable was added.
Authority: I1, I2.

*R15–R18 are the four most-repeated asks in the corpus by message count, restated
here because Part I is the part that gets read. Their authority is the lettered
rule cited under each; the rest of the ruleset is in Part 0 §2.*

## 2. Definition of done

An item is done when **all** of the following hold:

1. The change is in code, not in the browser.
2. Evidence appropriate to the change type has been captured — see §3. A visual
   change without a screenshot in the same message has not captured it (R16).
3. Tests pass, and any test that asserted the old behaviour has been updated with
   a comment explaining why the expectation changed.
4. Nothing outside the named scope changed, confirmed by reading the diff line by
   line rather than trusting recollection.
5. The user has been told what changed, what did not, and what remains.
6. It is shipped — committed, pushed, deployed, and the deployed SHA confirmed to
   match (R15) — or the reason it cannot be is stated in the same message.

A change that satisfies 1–4 but not 5 is not done. A change that satisfies 1, 3,
4 and 5 but not 2 is a claim, not a result. A change that satisfies 1–5 but not 6
is a change Julien now has to spend a turn on, which is the most repeated turn in
the entire history of this project.

## 3. Verification protocol by change type

### 3.1 Geometry — position, size, spacing, overlap

Measure with `getBoundingClientRect` in a real browser. Assert the number. Never
infer geometry from CSS.

Measure in every relevant state (R9). A hover-scaled pin is a different geometry
from a resting pin. A sign-up form is a different height from a sign-in form. A
captcha slot is a different height when occupied.

Required output: the actual numbers — `gap: 24px`, `overlap: none`,
`offset from centre: 0px`.

### 3.2 Rendering — does the effect appear

Screenshot. Computed style is necessary but not sufficient: a filter can be
correctly referenced and still not execute.

When an effect does not appear, isolate it — apply it in a context where it is
known to work (for example as `filter` rather than `backdrop-filter`) to
determine whether the problem is the effect or the application.

### 3.3 Colour

State plainly that hue cannot be sampled from a screenshot programmatically. Do
not claim a colour is fixed on the basis of looking at it. Instead remove the
cause by construction — `saturate()` at or below 1 cannot amplify a warm backdrop
— and say that is what was done.

### 3.4 Behaviour — clicks, state, navigation

Drive it in the browser. Confirm the state changed, not merely that a handler
exists. Where a control appears dead, check `document.elementFromPoint` at the
click location before touching the handler: an invisible overlay eating clicks
has caused this exact symptom before.

### 3.5 Scope

`git diff` the touched files and read every changed line before reporting.

## 4. Communication rules

- Lead with what changed and the evidence.
- Name the root cause when one was found. "The band was centred on the same path
  as the border, so the border covered it exactly" is useful; "fixed the glass"
  is not.
- When a previous claim was wrong, correct it in one sentence and move on.
- List what was **not** done in the same message.
- Do not repeat context the user already has.
- No narration of what you are about to do. Results only (M1).
- Batch questions. All of them, numbered, in one message — twenty at once is
  fine, and far cheaper than twenty round trips (K2).
- Never make a product, design or policy decision. Present the options with a
  recommendation, then wait (C2). Adding something unrequested — an outline, a
  toggle, a new dropdown style, a circle around an icon — is a decision (C3).
- When uncertain, say so in one line. Do not hedge across a paragraph (M3).

---

# Part II — The glass engine — three implementations, and the one that should survive

All paths below are relative to the worktree root `/Volumes/corrupt/Cruushv2-1.worktrees/landing-page-liquid-glass-antigravity` (branch `feature/landing-page-liquid-glass-antigravity`).

### 1. Inventory

Three distinct glass mechanisms exist in the tree at once. They do not share code, and only one of them is on a shipping surface.

| # | Implementation | Files | Tracked by git? | Wired to |
|---|---|---|---|---|
| A | Six shared bitmap presets + one heart preset | `src/app/components/LiquidGlassFilters.tsx` (294 lines) | Yes (modified) | `theme.css:526`, `:527`, `:1195-1196` |
| B | Per-element kube.io generator | `src/app/lib/liquidGlass.ts` (279), `src/app/components/LiquidGlassSurface.tsx` (181) | **No — both untracked (`??`)** | Nothing. Zero importers outside itself |
| C | CSS-only blur/saturate token stack | `src/styles/theme.css:449-530` | Yes (modified) | Every `.cruush-glass-*` class |

Implementation A is mounted three times in the same document: `src/main.tsx:12` (unconditional, sibling of `<App/>`), `src/app/App.tsx:239` (signed-out router) and `src/app/App.tsx:336` (signed-in router). At least two copies of every `<filter id>` are therefore always live. `url(#id)` resolves to the first match in document order, so the visual result is identical, but the ids are duplicated and every `feImage` data URL is decoded twice. **Rule: mount `LiquidGlassFilters` once, at the root.** Without this, a future preset edit that lands in only one of the three call sites will silently lose to whichever copy renders first.

Implementation C is what actually paints most of the app. Token consumers:

| Token | Value (`:root`) | Consumed by |
|---|---|---|
| `--cruush-glass-backdrop` | `blur(22px) saturate(1.48) brightness(1.06) contrast(1.01)` (`:464`) | `.cruush-glass`, `-panel`, `-bar`, `-pill`, `-soft`, `-menu`, `-control`, `-input` (`:549-567`); `.cruush-glass-menu-toggle` (`:632`) |
| `--cruush-glass-backdrop-soft` | `blur(17px) saturate(1.36) …` (`:465`) | `.cruush-glass-soft` (`:620`), `.cruush-recently-active-toggle` (`:667`) |
| `--cruush-glass-dock-backdrop` | `blur(20px) saturate(1.44) …` (`:466`) | `.cruush-liquid-glass-dock` (`:689`), `[data-map-marker-pin] .cruush-glass-soft` (`:1107`), `.cruush-heart-pin-cluster-glass` (`:1148`) |
| `--cruush-glass-current-backdrop` | `blur(12px) saturate(1.28) …` (`:467`) | `.cruush-bottom-nav-indicator-surface` (`:769`) |
| `--cruush-glass-field-backdrop` | `blur(18px) saturate(1.4) …` (`:468`) | **Nothing.** Defined at `:468`, overridden at `:516`, referenced by no rule |

The `@supports` block at `theme.css:501` inverts the obvious expectation. It probes `backdrop-filter: url("#cruush-liquid-glass-panel")`, and *when the browser supports it* it replaces the lens-capable tokens with `--cruush-glass-plate-backdrop: blur(12px) saturate(0.86) contrast(0.9) brightness(0.82)` (`:486`) plus a dark fill `rgba(7, 11, 20, 0.64)` (`:482`) on almost everything. Only two tokens keep a real filter: `--cruush-glass-dock-backdrop` and `--cruush-glass-current-backdrop` (`:526-527`). The reason is recorded in the comment at `:509-513` — the displacement lens needs textured backdrop to bend, and over flat lists it warped text instead. **`@supports` tests syntax, not reference resolution: deleting `#cruush-liquid-glass-panel` would leave the probe passing.** Nothing would break loudly; the guard would simply stop meaning what its name says.

### 2. The shared-preset recipe as implemented

`createDisplacementMap` (`LiquidGlassFilters.tsx:97-128`) emits an SVG data URL with exactly four painted elements, in this order:

1. `<rect …  fill="black"/>` — full-bleed plate at `0,0,width,height`.
2. `<rect … rx="{radius}" fill="url(#red)"/>` — horizontal ramp, gradient vector `x1="100%" → x2="0%"`, stops `#000 → red`. Red is 255 at the left edge, 0 at the right.
3. `<rect … rx="{radius}" fill="url(#blue)" style="mix-blend-mode: difference"/>` — vertical ramp, `y1="0%" → y2="100%"`, stops `#000 → blue`.
4. `<rect x="{inset}" y="{inset}" … rx="{radius}" fill="hsl(0 0% {lightness}% / {alpha})" style="filter:blur({blur}px)"/>` — the block-out.

`difference` is load-bearing rather than decorative. The red layer carries B = 0 and the blue layer carries R = 0, so `|a − b|` per channel preserves both single-channel ramps in one image. `screen` or `normal` would clobber one with the other and the map would carry only a single axis.

`inset = Math.min(width, height) * (border * 0.5)` (`:107`), i.e. `min(w,h) × 0.035` at `border: 0.07`.

The `BASE` config (`:139-149`) is the CodePen `base` preset with one deliberate departure:

| Key | Value | Note |
|---|---|---|
| `scale` | `-180` | |
| `radius` | per preset | |
| `border` | `0.07` | |
| `lightness` | `50` | |
| `alpha` | `0.93` | |
| `blur` | `11` | |
| `displace` | `0` | becomes `feGaussianBlur stdDeviation` (`:264`) |
| `blend` | `difference` | |
| xChannelSelector | `R` (`:213`) | |
| yChannelSelector | `B` (`:214`) | green never sampled |
| `greenOffset` / `blueOffset` | `0` / `0` | **pen ships 10 / 20** |

The rainbow was rejected. The pen's `r 0 / g 10 / b 20` splits the backdrop into three copies sampled at different scales and screened back together; the comment at `:130-137` states it plainly and says do not reintroduce non-zero offsets. The three `feDisplacementMap` passes and the two `feBlend mode="screen"` recombinations remain in the graph (`:208-263`) but with all offsets zero they are three identical samples re-screened into the original — dead cost, kept for shape parity with the reference.

Why `lightness 50 / alpha 0.93` and not the pen's `free` preset: the block-out composites its green channel to `0.93 × 127.5 = 118.575`, and its red and blue to `0.93 × 127.5 + 0.07 × ramp`, which is exactly 127.5 at the plate's centre. 127.5/255 = 0.5, and `feDisplacementMap` displaces by `scale × (channel/255 − 0.5)` — so the centre is provably zero. The pen's `free` (`lightness 60`, `alpha 0.74`) composites the centre to `0.74 × 153 + 0.26 × 127.5 = 146.4` on both R and B, which is 18.9/255 above neutral, i.e. `−180 × 0.0741 = −13.3px` of displacement on each axis in the dead centre of the panel. That is the whole-surface smear the comment at `:160-163` records.

### 3. Preset table

| Preset | Filter id | w × h | radius | displace | blur | scale | derived inset | Referenced by |
|---|---|---|---|---|---|---|---|---|
| dock | `cruush-liquid-glass-dock` | 368 × 80 | 40 | 0.2 | 11 | −180 | 2.8 | `--cruush-glass-dock-backdrop` (`theme.css:526`) |
| bubble | `cruush-liquid-glass-bubble` | 72 × 72 | 36 | 0 | 11 | −180 | 2.52 | `--cruush-glass-current-backdrop` (`theme.css:527`) |
| pill | `cruush-liquid-glass-pill` | 224 × 56 | 28 | 0 | 11 | −180 | 1.96 | **nothing** |
| field | `cruush-liquid-glass-field` | 288 × 46 | 10 | 0 | 11 | −180 | 1.61 | **nothing** |
| panel | `cruush-liquid-glass-panel` | 336 × 220 | 28 | 0 | 11 | −180 | 7.7 | `@supports` probe string only (`theme.css:501`) |
| heart | `cruush-liquid-glass-heart` | 64 × 64 | 0 | 0 | **0** | **−58** | n/a | `.cruush-heart-pin-shell::before` (`theme.css:1195`) |

The heart is the one preset that does not use `createDisplacementMap`. `createHeartDisplacementMap` (`:53-95`) paints a flat `hsl(0 0% 50%)` base — neutral, not black — then strokes the two ramps along `HEART_PIN_PATH` with `stroke-width = HEART_PIN_RING_OUTER * 2 = 14` (`heartPin.ts:30`, `LiquidGlassFilters.tsx:284`). Flat grey is zero displacement; black would be a full negative offset, which is why the base differs from the rect recipe. Its `scale` is −58 rather than −180 because the band is only ~4.3 units wide (inner 2.7 → outer 7); at −180 the backdrop is dragged clean across the band and back over itself (`:167-169`).

### 4. `preserveAspectRatio="none"` — the smear mechanism

`feImage` is emitted with `x="0" y="0" width="100%" height="100%" preserveAspectRatio="none"` (`:207`). Every preset is therefore stretched from its authored size to whatever box the class lands on.

The general principle, stated as cause then effect: **a displacement map bends light through the *gradient* of its channel values, not through their absolute values.** Stretching a 224×56 plate across a 600px panel divides the same 0→255 ramp over ~2.7× the distance, so the per-pixel derivative falls by the same factor. Neighbouring output pixels then sample source pixels that are almost — but not exactly — the same place. That is not refraction; that is a soft, direction-biased resample, and a soft direction-biased resample is optically indistinguishable from a blur. The blur reads as fog, and over the map's warm-grey street fill it reads as a tan cast, because a smear averages a warm neighbourhood into every pixel. The root-cause note is at `liquidGlass.ts:6-12`.

The corollary is the sizing rule: **a shared preset is only honest on an element whose aspect ratio and corner radius match the preset it references.** Violate it and you get fog, not a wrong-looking lens — which is why the failure was originally misdiagnosed as "too much blur" rather than "wrong plate size".

Two further consequences of `preserveAspectRatio="none"`:

- The black plate survives outside the rounded rect, so the four corner wedges between the element's own `border-radius` and the preset's `rx` sit at R = 0, B = 0, i.e. `−180 × (0 − 0.5) = +90px` on both axes. If a surface's CSS radius is smaller than its preset's `rx`, those wedges paint a 90px jump. Nothing clips them except the element's own `border-radius` and `overflow: hidden`.
- The shared `<filter>` elements set no `x/y/width/height` (`:206`), so the filter region defaults to `-10% -10% 120% 120%`. *Unverified:* whether `width="100%"` on the primitive resolves against the filter region or the viewport differs between engines; verified by rendering a known checkerboard behind a dock-class element in WebKit and Blink and measuring where the map's left edge lands.

### 5. The kube.io generator (`src/app/lib/liquidGlass.ts`)

This builds the map from optics instead of drawing it, at the element's own pixel size, so nothing is ever stretched.

**Surface profiles** — `surfaceHeight(x, profile)` (`:46-64`), `x` clamped to [0,1], 0 at the outer edge of the bezel and 1 where it meets the flat middle. `convex = Math.sqrt(1 - (1 - clamped) ** 2)`.

| Profile | Formula as written |
|---|---|
| `convex` | `convex` |
| `squircle` (default) | `(1 - (1 - clamped) ** 4) ** 0.25` |
| `concave` | `1 - convex` |
| `lip` | `convex * (1 - smootherstep(clamped)) + (1 - convex) * smootherstep(clamped)` |

`smootherstep(x) = x*x*x*(x*(x*6-15)+10)` (`:40`).

**Refraction** — `refractionOffset` (`:73-92`) differentiates numerically with `delta = 0.001` using a centred difference, `(h(x+δ) − h(x−δ)) / (2δ)`. The normal is `Math.atan2(1, -slope)`; incidence is `Math.PI / 2 - normalAngle`; Snell gives `sinRefracted = Math.sin(incidence) / refractiveIndex` with `refractiveIndex = 1.5` by default. Past the critical angle it returns `Math.sign(sinRefracted)` — there is no total internal reflection in this prototype, only a clamp (`:86-88`). The return is `Math.tan(incidence - refracted)`, a dimensionless horizontal travel per unit thickness.

**Why the flat middle cannot displace** — `createLiquidGlassMap` skips any pixel where `edgeDistance <= 0 || edgeDistance >= bezel` (`:231-233`), leaving its offset at the `Float32Array` zero it was initialised to. Zero offsets encode to exactly 128. The middle is glass-clear by construction, not by tuning, which is precisely the property the shared presets have to buy with a blurred block-out rect.

**Signed distance** — `distanceToEdge` (`:98-110`) is the standard rounded-box SDF, negated so inside is positive: `qx = |px − w/2| − (w/2 − r)`, `qy` likewise, `−(hypot(max(qx,0), max(qy,0)) + min(max(qx,qy),0) − r)`, with `r = Math.min(radius, halfWidth, halfHeight)`. Its gradient is sampled at `step = 1` on each axis (`:240-247`) to get the inward direction, normalised by `Math.hypot(gradientX, gradientY) || 1`.

**Encoding** — `image.data[pixel] = 128 + (offsets[…] / scale) * 127`, green likewise, blue pinned to 128, alpha 255 (`:263-266`). 128 is zero; the channels carry [−1, 1] mapped onto [1, 255].

**`maximumDisplacement`** — the loop tracks the largest `|dx|` or `|dy|` in dimensionless units (`:254`), divides by it when encoding (`:258`), then returns `maximumDisplacement * bezel` (`:275`), converting slope to pixels via the bezel thickness. `LiquidGlassSurface` passes that straight to `feDisplacementMap scale` (`:139`, `:157`). **Discrepancy to record:** `feDisplacementMap` displaces by `scale × (channel/255 − 0.5)`, and the peak encoded value is 255, giving `scale × 0.5`. The doc comment at `liquidGlass.ts:117-119` calls the returned figure "peak displacement in pixels"; the real peak is half of it. Anyone tuning `bezel` against a measured pixel offset will be out by 2× until this is reconciled.

**The zoom map** — `createLiquidGlassZoomMap` (`:138-192`) is a second, separate field: `dx = (x + 0.5 − centreX) * strength` inside the shape, 0 outside, with `maximumDisplacement = Math.max(centreX, centreY) * strength` and `strength = 0.18` by default. **Derived-from-code finding:** on the right half of the element `dx > 0`, and `scale` is positive, so the sampled coordinate `x + scale × (R/255 − 0.5)` moves *away* from the centre. That minifies. The comment at `:130-136` states the intent as magnification, which requires the opposite sign. *Unverified visually* — it has never rendered; verified by putting a ruled grid behind a `LiquidGlassSurface` and measuring whether gridlines widen or narrow.

### 6. The `LiquidGlassSurface` contract

| Prop | Default | Effect |
|---|---|---|
| `target` | — (required) | `HTMLElement \| null`; its `getBoundingClientRect()` drives the map |
| `radius` | `24` | fed to the SDF |
| `bezel` | `14` | reach in from the edge, px |
| `profile` | `'squircle'` | |
| `refractiveIndex` | `1.5` | |
| `zoom` | `0.18` | `strength` for the zoom map; 0 disables |
| `specularOpacity` | `0` | rim light; 0 omits the three primitives entirely |

`useId()` is sanitised with `rawId.replace(/[^a-zA-Z0-9]/g, '')` (`:47`) because React ids are `:r0:` and colons are not valid in a CSS `url(#…)` fragment.

Rebuild path: `build()` runs once, then on every `ResizeObserver` callback on `target` (`:96-97`), with `observer.disconnect()` on cleanup. Dependencies are `[target, radius, bezel, profile, refractiveIndex, zoom]` (`:100`) — `specularOpacity` is correctly absent, since it changes only the filter graph, not the maps.

The `<2px` guard (`:65-67`): `if (rect.width < 2 || rect.height < 2) return;`. Trigger — a collapsed or `display: none` target, or a mount before layout. Symptom without it — `createLiquidGlassMap` would build a 1×1 canvas whose SDF is degenerate and whose `maximumDisplacement` is 0, producing `scale = 0` and a wasted `toDataURL`. Correct handling as written: bail and leave `map` at its previous value. **Edge case the guard does not cover:** it returns *without clearing* `map`, so an element that shrinks below 2px keeps its last filter and its `--cruush-liquid-glass-filter` property, now sized for a box that no longer exists. Correct handling would be `setMap(null)` on that branch.

Publication: a second effect sets `--cruush-liquid-glass-filter: url(#<id>)` as an inline style on the target (`:107`) and removes it on cleanup (`:110`). CSS then stays declarative: `backdrop-filter: var(--cruush-liquid-glass-filter)`. Because `build()` returns a fresh object every tick, `map` changes identity on every resize, so the property is removed and re-set on each — same-commit, so no paint between, but two mounted surfaces sharing one target will fight, last mount wins.

`specularOpacity` defaults to 0 for a concrete reason, and the root cause is worth recording rather than the fix. The specular branch (`:160-176`) runs `feGaussianBlur in="bezelMap" stdDeviation="1.4"`, then an `feColorMatrix` whose R, G and B rows are `0 0 0 0 1` — constant white, ignoring the map's own RGB entirely — and whose alpha row is `0 0 0 {specularOpacity} 0`, i.e. `specularOpacity × A_in`. The map writes `alpha = 255` at every pixel (`liquidGlass.ts:266`). The result is therefore a uniform white sheet at `specularOpacity` alpha over the whole element, screened on top. It cannot light a rim because it carries no spatial variation at all. The comment at `:41-44` describes the symptom ("washes the entire surface into a grey slab"); the cause is the constant-1 RGB rows combined with the map's constant alpha. **Rule: a specular pass needs its own map, or an alpha row keyed off R/G rather than A.**

### 7. Decision table

| Surface | Use | Why |
|---|---|---|
| Bottom nav dock (`.cruush-liquid-glass-dock`) | A, `dock` preset | Fixed 23rem × 5rem box (`BottomNav.tsx:84`, `theme.css:679`) close to the preset's 368×80; sits over the live map, which has the texture the lens needs |
| Nav switcher bubble (`.cruush-bottom-nav-indicator-surface`) | A, `bubble` preset | Near-square, fully rounded; graded identically to the dock (`theme.css:527`) so it does not read as frosted plastic inside clear glass |
| Heart pin rim / cluster | A, `heart` preset | The glass is a band following a silhouette, not a box; only a path-stroked map puts displacement where the ring is |
| Panels, sheets, lists, inputs | C, plate tokens | Flat backdrops give the lens nothing to bend; it only warps text and edges (`theme.css:509-513`) |
| Any surface of arbitrary or animated size over textured backdrop | B, once wired and its two sign/scale defects are settled | The map is rebuilt at the element's own size, so nothing stretches and nothing smears |
| Anything on the map tiles themselves | — | Out of scope by standing instruction; do not alter tile styling to serve glass |

Implementation B is the one that should survive. It is the only one that answers the sizing problem structurally rather than by adding presets, and its flat-middle guarantee is a property of the maths rather than of a tuned block-out alpha. It is not shippable today: both files are untracked, unimported, untested, and carry the two defects above (returned `scale` off by 2×, zoom sign inverted). Cost also has to be measured — a 336×220 panel is 73,920 pixels, each touched by one SDF evaluation plus four more inside the bezel band, then a second full encoding pass, then a PNG `toDataURL`, and again for the zoom map, on every `ResizeObserver` tick.

### 8. Wired to nothing today

| Thing | Status |
|---|---|
| `src/app/lib/liquidGlass.ts` | Untracked; only importer is `LiquidGlassSurface.tsx` |
| `src/app/components/LiquidGlassSurface.tsx` | Untracked; **zero importers anywhere in `src/`** |
| `pill` preset | Generated into the DOM, referenced by no CSS |
| `field` preset | Generated into the DOM, referenced by no CSS |
| `panel` preset | Appears only inside the `@supports` condition string (`theme.css:501`); never applied as a value |
| `--cruush-glass-field-backdrop` | Defined (`:468`) and overridden (`:516`); consumed by no rule |
| `greenOffset` / `blueOffset` plumbing, green + blue `feDisplacementMap` passes, both `feBlend mode="screen"` | Still in the graph, but with both offsets 0 they are identity work |

### 9. Test state — two verified failures on this branch

Both were reproduced with `npx vitest run src/app/components/LiquidGlassFilters.test.tsx src/styles/theme.test.ts`: `Test Files 2 failed (2) / Tests 2 failed | 6 passed (8)`.

**`src/app/components/LiquidGlassFilters.test.tsx:41`** expects the dock's green channel at `scale="-170"` and receives `"-180"`; line 42 expects blue at `"-160"`. Root cause: the rainbow was removed by setting `greenOffset: 0, blueOffset: 0` in `BASE` (`LiquidGlassFilters.tsx:143`, `:146`), but the test's expectations *and* its comment at line 39 ("offsets from the reference base config: r 0, g 10, b 20") still encode the pen's values. The test was never migrated with the decision it was meant to lock.

**`src/styles/theme.test.ts:53`** expects `--cruush-glass-backdrop: url("#cruush-liquid-glass-dock") brightness(1.12) saturate(0.9);`, which no longer exists — `theme.css:514` sets it to `var(--cruush-glass-plate-backdrop)`. Lines 54 and 59 assert the same for `-backdrop-soft` and `-field-backdrop`, which are also now `var(--cruush-glass-plate-backdrop)` (`:515`, `:516`). Root cause: the lens was deliberately narrowed to the dock and the nav bubble, and the assertions describing the old global lens were left in place alongside the new plate assertions at lines 51-52 — the file now asserts two mutually exclusive values for the same property.

**Rule: a token assertion must name the block it lives in.** Both `:root` (`theme.css:449`) and the `@supports` block (`:502`) declare `--cruush-glass-backdrop`, and `toContain` on the raw stylesheet text cannot distinguish them — which is exactly how the file ended up asserting both values at once and passing until one of them changed.

### 10. Remaining edge cases

| Trigger | Symptom | Correct handling |
|---|---|---|
| Browser lacks `url()` in `backdrop-filter` (historically WebKit) | `@supports` at `:501` fails; every surface, dock included, falls back to the `:root` blur stack at `:464-468` | Intended. Note that the fallback is the *richer*-looking option; do not "fix" the fallback to match the lens |
| `prefers-reduced-transparency: reduce` | Only `.cruush-heart-pin-shell::before` drops its backdrop filter (`:1210-1216`). Dock, nav bubble, cluster glass and every `.cruush-glass-*` keep theirs | Extend the media query to the dock and bubble, or accept and document the gap. Currently an accessibility hole |
| Element radius < preset `rx` | Corner wedges sample the black plate → +90px displacement on both axes | Match the CSS radius to the preset, or add `overflow: hidden` |
| Two `LiquidGlassSurface` instances on one `target` | Both write `--cruush-liquid-glass-filter`; last effect wins, first leaks its `<filter>` until unmount | One surface per target; assert it in the component |
| Target shrinks below 2×2 | Stale filter retained (`LiquidGlassSurface.tsx:65-67`) | `setMap(null)` on the guard branch |
| `LiquidGlassFilters` rendered from `main.tsx` and `App.tsx` simultaneously | Duplicate element ids for all six filters | Single root mount |


---

# Part III — The `backdrop-filter` blocker, and the experiment that resolves it

**Status: unresolved. Nothing in Part II ships until it is settled.**

All paths below are relative to the worktree root `/Volumes/corrupt/Cruushv2-1.worktrees/landing-page-liquid-glass-antigravity` (branch `feature/landing-page-liquid-glass-antigravity`).

The three facts that define the problem are unchanged and are confirmed against the code: the generated graph is valid, because applied as a plain CSS `filter` the element visibly warps; applied as `backdrop-filter` nothing renders at any zoom strength up to 0.6; and the shipped bitmap presets do work as `backdrop-filter` while also using `feImage` with a data URI, so `feImage` alone is not disqualifying.

### 9.1 Precise diff of the two graphs

| Property | Presets — `src/app/components/LiquidGlassFilters.tsx` | Generated — `src/app/components/LiquidGlassSurface.tsx` |
| --- | --- | --- |
| `<filter>` element | line 206 | line 121 |
| `colorInterpolationFilters` | `"sRGB"` (206) | `"sRGB"` (121) — **identical, not a variable** |
| `filterUnits` | absent → default `objectBoundingBox` | absent → default `objectBoundingBox` |
| Filter region | absent → default `-10% / -10% / 120% / 120%` | `x="0" y="0" width="100%" height="100%"` (121) — exactly the border box, zero bleed |
| `primitiveUnits` | absent → `userSpaceOnUse` | absent → `userSpaceOnUse` |
| Primitive count | 10 (207–264) | 4 by default; 7 when `specularOpacity > 0` (160–176) |
| `feImage` count | 1 (207) | 2 (128, 144) |
| `feImage` subregion | `x="0" y="0" width="100%" height="100%"` + `preserveAspectRatio="none"` (207) | `x="0" y="0"` with absolute pixel `width`/`height` from the map (131–133, 147–149); no `preserveAspectRatio` → default `xMidYMid meet` |
| Map media type | `data:image/svg+xml,…` (line 127; heart map line 94) | `data:image/png;base64,…` via `canvas.toDataURL()` (`src/app/lib/liquidGlass.ts:187`, `:272`) |
| Channel selectors | `xChannelSelector="R" yChannelSelector="B"` (212–213, 230–231, 248–249) | `xChannelSelector="R" yChannelSelector="G"` (140–141, 156–157) |
| Graph topology | fan-out tree: three `feDisplacementMap` branches all rooted at `SourceGraphic`, rejoined by two `feBlend mode="screen"` (262–263) | strict serial chain: `feImage → feDisplacementMap(SourceGraphic) → feImage → feDisplacementMap(magnified)` |
| Displacement fed into displacement | never | yes — `in="magnified"` at line 152 consumes the output of the displacement at 136 |
| `scale` | `-180` for all presets (`BASE`, line 148); `-58` for the heart (line 182) | `map.zoomScale` = `max(cx,cy) × strength` (`liquidGlass.ts:166`) and `map.scale` = `maximumDisplacement × bezel` (`liquidGlass.ts:275`) |

The channel-selector difference is not cosmetic. `createLiquidGlassMap` writes dx to R, dy to G and a constant 128 to B (`liquidGlass.ts:263–265`); `createLiquidGlassZoomMap` does the same (`liquidGlass.ts:177–179`). A preset-style `yChannelSelector="B"` fed a generated map would read a flat 128 and produce zero vertical displacement. Any experiment that swaps one graph's map into the other's shape must swap the selectors with it, or it will report a false negative.

#### DOM placement

Both `<svg>` elements carry `className="cruush-liquid-glass-filters"` (LiquidGlassFilters.tsx:271, LiquidGlassSurface.tsx:119), styled at `src/styles/theme.css:541-547` as `position: fixed; width: 0; height: 0; overflow: hidden; pointer-events: none`.

The presets are mounted at the React root in `src/main.tsx:12`, as a sibling immediately before `<App />`, and again inside `src/app/App.tsx:239` and `src/app/App.tsx:336`. That is two live copies of every preset `id` in the document at once. `url(#…)` resolves to the first match in document order, and today both copies are byte-identical so nothing breaks — but the moment per-instance filters are emitted into a shared root, duplicate ids stop being harmless.

`LiquidGlassSurface` returns its `<svg>` from its own render position (line 119), so the filter lands wherever the component is mounted — by design, next to or inside the target.

**Unverified:** the mount point used in the failing experiment is not in the tree. `LiquidGlassSurface` is untracked (`git status` reports `?? src/app/components/LiquidGlassSurface.tsx`), nothing imports it, and no CSS reads `--cruush-liquid-glass-filter` — grep finds that token only inside `LiquidGlassSurface.tsx` itself (lines 30, 32, 107, 110). What verifies it: add a call site and a CSS consumer, per E0 below, and record the resulting DOM ancestry with `document.querySelector('.cruush-bottom-nav-pill').contains(filterEl)`.

### 9.2 Candidate causes, ranked

**(a) SVG placement — most likely.** The presets resolve from one shared, root-level `<svg>`; the generated filter resolves from an `<svg>` inside the filtered element's own ancestor. `backdrop-filter` makes the element a backdrop root and forces Chromium to snapshot everything painted below it before painting the element's subtree. A filter whose definition lives inside that subtree has to be resolved while the subtree's paint is what is being deferred. Chromium's documented behaviour when a filter reference cannot be resolved is to drop the effect, not to error — which is exactly "nothing renders", with a valid computed string. The `position: fixed` on `.cruush-liquid-glass-filters` compounds it: an ancestor with `backdrop-filter` becomes the containing block for fixed descendants, so the definition `<svg>` is anchored inside the very element being filtered.

**(b) Two `feImage` primitives, and a displacement chained into a displacement.** The presets never feed a displacement output into another displacement; the generated graph does (line 152, `in="magnified"`). For `filter`, `SourceGraphic` is a finished raster and the chain is trivially evaluable. For `backdrop-filter`, `SourceGraphic` is the backdrop snapshot, and Chromium's backdrop path has historically been the less complete of the two implementations. A second async-decoded `feImage` inside that path is a plausible bail-out.

**(c) Explicit filter region — least likely as a total cause.** `x="0" y="0" width="100%" height="100%"` removes the default 10% bleed. Mechanically this clips: a `zoomScale` of `184 × 0.18 = 33.12px` on a 368-wide dock samples up to 33px outside a region that stops at the border box. That produces hard edges and dead corners, not a completely absent effect. It cannot on its own explain "nothing at any strength". It stays on the list only because clearing the attributes live has already been tried and did not fix it — and that test was confounded by (a).

#### Confounds that must be held constant

The presets' map is an SVG data URI; the generated map is a PNG data URI from `canvas.toDataURL()`. PNG decode is asynchronous, and a filter whose image resource resolves after first paint depends on a repaint invalidation that the backdrop path may not issue. Every protocol below must therefore include a forced repaint (toggle `opacity` on the target) before the observation is recorded. Without it, a genuine fix reads as a failure on first paint and a success on the second, and the result is unreproducible.

### 9.3 Experiment protocols

**E0 — precondition, run once.** Import `LiquidGlassSurface` into `BottomNav.tsx`, pass the pill element from `src/app/components/BottomNav.tsx:84` as `target`, and add to `src/styles/theme.css` inside the existing `@supports` block: `.cruush-liquid-glass-dock { backdrop-filter: var(--cruush-liquid-glass-filter, var(--cruush-glass-dock-backdrop)); }`. Set `zoom={0.6}`. The `var()` fallback is mandatory: an undefined custom property makes the declaration invalid at computed-value time, which resolves `backdrop-filter` to `none` and silently removes the dock's frost as well — a regression indistinguishable from the bug being studied.

**E1 — placement (run first).** Lift the `<filter>` out of `LiquidGlassSurface`'s own `<svg>` and portal it, via `createPortal`, into the root `<svg>` rendered by `LiquidGlassFilters` (LiquidGlassFilters.tsx:271–292). Keep every attribute byte-identical. *Confirms:* the dock's backdrop visibly warps. *Refutes:* it does not, with the filter provably present in the root `<svg>` and the computed string unchanged. *Cost:* roughly an hour; requires an id registry on `LiquidGlassFilters` and touches `main.tsx`/`App.tsx` mount duplication.

**E2 — primitive count.** Pre-compose the zoom and bezel fields into a single map inside `createLiquidGlassMap` by summing the two offset fields before the 128-centred encode at `liquidGlass.ts:260-267`, and emit one `feImage` + one `feDisplacementMap`. *Confirms:* warping appears. *Refutes:* it does not — which also proves the second `feImage` was never the issue. *Cost:* half a day; the summed field must be renormalised against a single `maximumDisplacement`, or the encoded fractions clip at 0 and 255 and the map goes flat at the rim.

**E3 — filter region.** Delete `x`, `y`, `width` and `height` from LiquidGlassSurface.tsx:121 in the source file. Do not do this from the console: R4 exists because removing region attributes through DevTools left a visibly broken dock on screen for minutes (`docs/plans/cruush-spec.md:162` records the equivalent failure for R5). *Confirms:* warping appears. *Refutes:* it does not. *Cost:* minutes, but only meaningful after E1 has run.

Run E1 → E2 → E3 in that order, changing one variable at a time. Running two together produced the earlier confounded region test and cost a full re-run.

### 9.4 Evidence standards

Computed style is necessary but not sufficient. `getComputedStyle(el).backdropFilter` returns the specified string whether or not Chromium resolved the reference at paint time, because resolution happens during paint and never writes back to computed style. Claiming success from that string is the exact failure recorded as R5 — "it's live on the bottom nav, you can see it", when the filter was not rendering.

Proof requires all four of:

| # | Requirement | Failure it prevents |
| --- | --- | --- |
| 1 | A **structured** backdrop under the surface — the map's streets, or an injected 8px checkerboard. | Over a flat panel a lens warps nothing visible, so absence of warp proves nothing. |
| 2 | A screenshot showing a straight line crossing the surface rim with a lateral break. | "Looks glassy" is frost, blur or a keyline, none of which is displacement. |
| 3 | An A/B pair, same scroll position, filter present vs `backdrop-filter: none`, visibly different at the rim. | Ambient rim shadows from `--cruush-liquid-shadow` (theme.css:459) read as an effect when nothing is filtering. |
| 4 | A forced repaint between applying the change and capturing. | A PNG-decode race reports a working fix as a failure. |

At `zoom={0.6}` on a 368px dock the predicted break is ~110px. If the break is under 5px, treat the result as refuted, not as "subtle".

### 9.5 Fallbacks, in order of preference

1. **Pre-composed per-size maps at build time.** Generate one map per surface size at build, ship them as assets, keep `backdrop-filter`. *Cost:* loses continuous resize fidelity; every new size needs a build; reintroduces the stretch-and-smear failure documented at `liquidGlass.ts:5-12` for any surface whose runtime size differs from its baked size.
2. **`filter` on a duplicated backdrop layer.** Known to work — the graph warps as `filter`. *Cost:* every glass surface needs a synchronised duplicate of what is behind it, which is unbuildable over the map canvas and doubles paint cost.
3. **Blur-based frost.** *Cost:* abandons the lens entirely; this is the non-Chromium path, not a target.

### 9.6 Browser support

`backdrop-filter: url(#…)` is Chromium-only. The guard in `src/styles/theme.css:501` reads verbatim:

```css
@supports ((backdrop-filter: url("#cruush-liquid-glass-panel")) or (-webkit-backdrop-filter: url("#cruush-liquid-glass-panel"))) {
```

Outside it, every token holds a blur fallback — `--cruush-glass-backdrop: blur(22px) saturate(1.48) brightness(1.06) contrast(1.01)` (theme.css:464) and `--cruush-glass-dock-backdrop: blur(20px) saturate(1.44) brightness(1.06) contrast(1.02)` (theme.css:466) — and both are asserted in `src/styles/theme.test.ts:41-42`.

One surface is not guarded. `.cruush-heart-pin-shell::before` sets `backdrop-filter: url("#cruush-liquid-glass-heart")` at theme.css:1195-1196, outside the `@supports` block, over `background: transparent` (theme.css:1186). On Safari and Firefox the declaration is discarded and the band renders as nothing at all. The `prefers-reduced-transparency` rule at theme.css:1210-1216 supplies `rgba(255, 255, 255, 0.14)` for that case but does not fire for non-Chromium browsers. Move line 1195 inside the guard and give the unguarded path the same 0.14 fill — otherwise the pin's glass rim is simply invisible for most non-Chromium users, and no test catches it.


---

# Part IV — Heart pins — anatomy, geometry, and the five ways the band broke

Every person, cluster and photoless placeholder on the map is the same silhouette: `HEART_PIN_PATH` at `src/app/lib/heartPin.ts:2`. Its bounding box is x 8→56, y 8→56 inside a `0 0 64 64` viewBox — a 48×48 shape with exactly 8 units of margin on every side. That margin is the entire budget the glass band has to live in, and every constant below is derived from it.

### 1. Anatomy and the stacking invariant

A pin is a CSS shell wrapping one SVG. The shell owns the glass; the SVG owns the artwork. They are separate because `backdrop-filter` is a CSS property that only applies to a box — it cannot be attached to an SVG path (`src/styles/theme.css:1080-1085`).

| Layer | Where | Stacking |
| --- | --- | --- |
| `.cruush-heart-pin-shell` | `theme.css:1152-1159`, `MapView.tsx:976` | `position: relative`, `isolation: isolate` |
| `::before` — the glass band | `theme.css:1181-1197` | `z-index: -1`, `inset: 0` |
| `::after` — the rim keyline | `theme.css:1202-1208` | `z-index: -1`, `inset: 0`, paints above `::before` by source order |
| Neon gel `<rect>` | `MapView.tsx:1022-1031` | first SVG child, auto |
| `.cruush-heart-glass-base` (gradient fill) | `MapView.tsx:1035` | above the neon |
| `<image>` photo, clipped | `MapView.tsx:1036-1045` | above the base |
| DL-mode explicit overlay | `MapView.tsx:1048-1056` | above the photo |
| `.cruush-heart-glass-refraction/-rim/-edge/-lip/-specular` | `MapView.tsx:1058-1064` | present in DOM, `display: none` at `theme.css:1305-1311` |
| `.cruush-heart-glass-theme-border` | `MapView.tsx:1059` | `display: none` at `theme.css:1297-1299` |
| Side badges | `MapView.tsx:881` | `z-20` |
| Signal tag | `MapView.tsx:1174` | `z-30` |
| Cluster count | `MapView.tsx:1109` | `z-10`, above `.cruush-heart-pin-cluster-glass` (auto) |

**Invariant: the glass pseudo-elements must sit at `z-index: -1` inside a shell that establishes its own stacking context.** `isolation: isolate` (`theme.css:1158`) is load-bearing — without it, `z-index: -1` escapes the shell and the band paints behind the marker's ancestors, i.e. behind the map, and disappears entirely. Without the `-1`, the failure is worse and is recorded below as failure (b).

**Invariant: the ring mask's inner half is hidden only by opaque artwork.** `heartOutlineMask` (`heartPin.ts:19-24`) uses `fill="none"` on both strokes, so the 14-unit white stroke covers 7 units *inside* the path as well as outside, and the 5.4-unit black stroke only knocks out ±2.7. The band therefore also exists from 2.7 to 7 units inside the silhouette. It is invisible solely because the SVG's gradient base and photo are opaque and stack above it. Making the base translucent would immediately reveal a second refracting ring under the photo's edge. Contrast the neon mask at `MapView.tsx:1018`, whose black path carries `fill="#000"` and does knock the interior out.

### 2. Geometry constants

| Constant | Value | Source | Controls |
| --- | --- | --- | --- |
| `HEART_PIN_RING_INNER` | `2.7` | `heartPin.ts:29` | inner edge of the band, in units from the path |
| `HEART_PIN_RING_OUTER` | `7` | `heartPin.ts:30` | outer edge; also the displacement map's band radius |
| ring white stroke-width | `14` (`outer * 2`) | `heartPin.ts:21` | outer extent, ±7 units |
| ring black stroke-width | `5.4` (`inner * 2`) | `heartPin.ts:22` | knock-out, ±2.7 units |
| rim inner | `6.3` (`outer - 0.7`) | `heartPin.ts:60` | rim is 0.7 units thick |
| neon mask blur | `1.15` user units | `heartPin.ts:51` | falloff of `HEART_PIN_NEON_MASK` |
| marker neon blur | `stdDeviation="1.35"` | `MapView.tsx:1007` | falloff of the shipped gel |
| marker neon strokes | white `12` (±6), black `6.8` (±3.4) + `fill="#000"` | `MapView.tsx:1014,1018` | gel sits 3.4→6 units out, inside 2.7→7 |
| neon opacity | `0.3`, fill = `markerTheme.border` | `MapView.tsx:1027,1029` | relationship colour intensity |
| heart filter scale | `-58` (BASE is `-180`) | `LiquidGlassFilters.tsx:182` | bend strength |
| heart map band | `HEART_PIN_RING_OUTER * 2` = `14` | `LiquidGlassFilters.tsx:284` | ramps land exactly on the band |
| badge box | `1.5625rem` = 25px | `MapView.tsx:902` | badge diameter |
| badge offset | `1.1rem` = 17.6px, `top-[42%]` | `MapView.tsx:880-881` | side clearance |
| marker boxes | outer `88×103px`, scale box `80×103px` | `MapView.tsx:1157-1158` | hit area and transform box |

**Unit-to-pixel conversion.** On the map the SVG is `h-20 w-20` (5rem = 80px) over a 64-unit viewBox (`MapView.tsx:981,986-988`): **80 ÷ 64 = 1.25 px per unit**. So the band runs 3.375px→8.75px outside the outline and is 5.375px thick; the rim is 0.875px; the neon gel spans 4.25px→7.5px. This is the ratio behind the comment "about 9px at this size" at `MapView.tsx:879`. `PeopleClusterMarker` uses the same 80px box (`MapView.tsx:1098`), so 1.25 as well. `HeartPin.tsx` is the exception: its shell is `w-12 h-12` = 48px (`HeartPin.tsx:21`) and the SVG's `h-full w-full` (line 30) overrides its own `width="71" height="71"` attributes (lines 26-27), giving **0.75 px per unit**. Those `71`s are dead values and should be deleted; leaving them invites someone to size the band against 1.109 px/unit and get a band 48% too thick.

Also at 0.75 px/unit: `.cruush-heart-glass-base` carries `vector-effect: non-scaling-stroke` (`theme.css:1289`), so `strokeWidth="3.2"` (`HeartPin.tsx:49`) is 3.2 CSS px, reaching 1.6px outside the path, while the band starts at 2.7 × 0.75 = 2.03px. Clearance is 0.43px. Any stroke wider than 4.06px buries the border under the glass. The comment at `heartPin.ts:26` ("the pin's own border is 4.8 wide … reaches 2.4 units out") no longer describes any shipped call site — MapView passes `stroke="none"` (`MapView.tsx:1035`) — and should be corrected rather than trusted.

### 3. The two-stroke mask, and why a scaled copy fails

`heartOutlineMask(inner, outer)` paints a wide white stroke centred on the path, then a narrower black stroke over it. A centred stroke of width *w* reaches *w/2* either side, so white at 14 reaches ±7 and black at 5.4 reaches ±2.7; what survives is a band from 2.7 to 7. The alternative — one stroke of width 8.6 offset outward — does not exist in SVG: strokes are always centred. A single centred stroke of the band's width would put half the band under the pin's own coloured border, which is exactly failure (c).

The other tempting construction is: fill the heart white, fill a uniformly scaled copy black, keep the difference. This produces an **uneven** band, and the reason is geometric. A uniform scale about the box centre (32, 32) moves each point radially by `(s−1)·d`, where *d* is its distance from the centre. Band thickness is the component of that displacement along the outline's *normal*, i.e. `(s−1)·d·cos θ` between radius and normal.

- Left extreme (8, 23.75): d = 25.38, tangent vertical, normal horizontal, cos θ = 0.946 → thickness **24.0(s−1)**.
- Top lobe apex (22, 8): d = 26, tangent horizontal, normal vertical, cos θ = 0.923 → thickness **24.0(s−1)**.
- Bottom point (32, 56): d = 24, but the flanks leave the point along (−1.45, −1.33) (control point `33.45 54.67` → `32 56`), so the radius is nearly parallel to the surface; cos θ = 0.737 → thickness **17.7(s−1)**.

The bottom flank is 26% thinner than everywhere else. Hence the rule recorded at `theme.css:1164-1168`: **the pseudo-element is `inset: 0`, never scaled.** Centred on the path, the band's width *is* the stroke width, constant all the way round.

### 4. The five recorded failures

**(a) The slab.** *Cause:* every other preset builds its displacement map from a rounded rect sized to the element box (`createDisplacementMap`, `LiquidGlassFilters.tsx:97-128`). Stretched over a heart, the ramps and the blocked-out inset follow the *box's* edges, so the refraction ran along four straight sides nowhere near the heart's outline and read as a rectangular pane behind the artwork. *Fix:* `createHeartDisplacementMap` (`LiquidGlassFilters.tsx:53-95`) paints the ramps as a stroke along `HEART_PIN_PATH` over a flat `hsl(0 0% 50%)` plate. Flat grey is zero displacement; black would read as full negative offset, which is why the neutral fill is 50% lightness and not `#000` (`LiquidGlassFilters.tsx:86`).

**(b) The distorted photo.** *Cause:* the ring layer sat above the pin (the pattern still visible on the map logo, `.cruush-map-logo-glass { z-index: 1 }`, `theme.css:1261-1265`). `backdrop-filter` samples everything painted below the element, so the pin's own gradient, photo and border were part of the band's backdrop and were displaced with the map. *Fix:* `z-index: -1` on both pseudo-elements (`theme.css:1176`), so the only thing behind the band is the map.

**(c) The invisible band.** *Cause:* the band was a single centred stroke on the same path and at the same width as the pin's own coloured border, so it was drawn precisely where the border already covered it. *Fix:* the two-stroke mask starting at 2.7 units — outside the border's reach.

**(d) The uneven band.** *Cause:* a uniformly scaled copy of the heart, thinning to 73.7% of nominal at the bottom point per the arithmetic above. *Fix:* `inset: 0` plus a centred stroke.

**(e) The fog.** *Cause:* two compounding blurs. A blurred ramp displaces neighbouring pixels by slightly different amounts, which smears the backdrop instead of bending it, and the trailing `feGaussianBlur in="output"` (`LiquidGlassFilters.tsx:264`) blurred the result again. *Fix:* `HEART_FILTER` sets `blur: 0` and `displace: 0` (`LiquidGlassFilters.tsx:180-181`) — the dock keeps `displace: 0.2` (line 153) and is the only surface that frosts. `background: transparent` on `::before` (`theme.css:1186`) is part of the same rule: any veil over the band is frost.

### 5. Colour

| Theme | Border | Gradient stops | Source |
| --- | --- | --- | --- |
| `current` | `#0BA8FF` | `#00B8FF`, `#0A7DF4`, `#3236D4` | `heartPin.ts:63-66` |
| `mutual` | `#6f00ff` | `#A64DFF`, `#6f00ff`, `#3B00A8` | `heartPin.ts:67-70` |
| `nearby` | `#FF0072` | `#FF0072`, `#DA045D`, `#B40849` | `heartPin.ts:71-74` |

Stops are placed at 0% / 52% / 100% on a `userSpaceOnUse` gradient from (10, 9) to (55, 56) (`MapView.tsx:992-996`). Theme selection: current user or `npcGhostDemo` → `current`; `relationship.kind === 'mutual_cruush'` → `mutual`; otherwise `nearby` (`MapView.tsx:958`).

**A marker with no photo, that is neither you nor the demo ghost, takes `getProfileGradientStops(marker.userId ?? marker.id)` instead** (`MapView.tsx:964-966`; the palette is the eight triples at `src/app/lib/profileGradient.ts:1-9`, selected by FNV-1a hash modulo 8). This is main's behaviour, restored deliberately, and is where the greens, yellows and teals come from. It is asserted in `MapView.test.tsx:249-251`. Do not "fix" it to the relationship colour.

**The neon rect's fill must be the solid `markerTheme.border`, not `url(#gradientId)`** (`MapView.tsx:1027`). A gradient paint server referenced from a masked full-box rect is resolved in the gradient's own user space, not the mask's, so the colour would not track the band; and at `opacity="0.3"` behind a blurred mask the three stops average to mud. The concrete failure is a gel that reads grey-brown on the mutual theme instead of purple.

The badge borders hard-code the same three hexes with `/80` alpha (`MapView.tsx:892-896`) rather than reading `HEART_PIN_THEMES`. Any palette change must be applied in both places or badges and pins drift apart.

### 6. Cluster pins

`PeopleClusterMarker` (`MapView.tsx:1093-1114`) reuses the shell and both masks, adds `--cruush-heart-pin-solid-mask` (`HEART_PIN_SOLID_MASK`, `heartPin.ts:36-38` — the filled silhouette), and renders `.cruush-heart-pin-cluster-glass` (`theme.css:1141-1150`): the whole heart masked to clear glass with `--cruush-glass-dock-bg` (`hsl(0 0% 100% / 0.06)`, `theme.css:478`) and `--cruush-glass-dock-backdrop`, which resolves to `url("#cruush-liquid-glass-dock") brightness(1.12) saturate(0.9)` where SVG backdrop filters are supported (`theme.css:526`). No fill, no border. The count sits in `.cruush-logo-font` — UnifrakturMaguntia (`theme.css:300-302`) — at `text-2xl`, `-translate-y-1`, capped at `999+` by `formatMapCountMarkerLabel` (`MapView.tsx:1072-1074`). The silhouette must not become a circle: a circle beside hearts reads as a different kind of object (`MapView.tsx:1089-1092`). `VenueClusterMarker` and `LaunchPartyMarker` are deliberately *not* hearts — they are 4rem opaque pills (`MapView.tsx:1070`).

### 7. Badges

`MarkerBadge` (right side) and `MarkerRelationshipBadge` (left) are 25px circles offset `1.1rem` = 17.6px outside the 103px wrapper, centred at `top-[42%]` with `-translate-y-1/2` (`MapView.tsx:877-881`). **The offset must clear the band, not the artwork.** Worst case: the silhouette's leftmost point is x = 8 units, the band reaches x = 1 unit = 1.25px inside the 80px box, and the box is centred in the 103px wrapper (left edge at 11.5px), so the band's outer extreme is at 12.75px. The badge spans −17.6px to +7.4px, leaving 5.35px. The previous `0.6rem` = 9.6px offset put the badge's inner edge at 15.4px — a 2.65px overlap on the glass, which is the recorded symptom at `MapView.tsx:878-879`.

Hover is the unresolved case. The scaled element is `h-20 w-[103px] origin-bottom` with `group-hover:scale-150` (`MapView.tsx:1158,1146`). With a bottom origin, `scale(1.5)` raises the top edge by 0.5 × 80 = **40px**. The signal tag compensates by 20px (`theme.css:1128`), a figure derived from an explicit centre-origin assumption in the comment at `theme.css:1115-1119`. The comment and the class disagree; the tag under-compensates by 20px on hover. Badges are inside the scaled box, so they scale with it and keep their clearance — but the tag does not. Separately, `[data-pin-scale='110']` (`theme.css:1133-1136`) is never emitted by any component (grep returns only `theme.css`), so the 4px branch is dead and a `scale-110` mobile-signal pin still takes the full 20px lift on hover.

*Correct handling:* drive the lift from the actual origin — 40px at 1.5 and 8px at 1.1 with `origin-bottom` — or change the scale box to `origin-center` and keep 20px/4px. Do not adjust one without the other.

### 8. The outstanding target design

Not yet built. The target is **one continuous glass surface**, not a band plus a separate rim: no clear gap between the photo edge and the glass, which today is the 0→2.7-unit strip left bare by the black knock-out. The neon must be **biased inward** — brightest where it meets the photo, fading to nothing before the outer rim — modelled on the sign-in button's gel at `src/app/components/Auth.css:403-419`: `inset: 0.18rem`, `filter: blur(0.26rem) saturate(2.1) brightness(1.35)`, opacity 1. The lesson recorded there is directly transferable: "Blur is what kills neon — it spreads the same light over more area, so the peak drops. Keep it tight and let `saturate` carry the intensity." Today's gel is the opposite shape — it sits 3.4→6 units *outward* of the silhouette and never touches the photo. The surface must also take zoom displacement like every other glass surface; `HEART_FILTER` is currently a single static definition with no zoom dimension. *Unverified:* whether a per-zoom filter is affordable at party density. Verified by instrumenting `createMarkerElement` (`MapView.tsx:1205-1306`) with a frame-time trace at 40+ visible markers across a pinch-zoom.

### 9. Performance

Every marker is a pin, and each one is a React root mounted with `flushSync` into a DOM element handed to the map (`MapView.tsx:1294-1303`). The masks are module-level constants evaluated once (`heartPin.ts:32,36,60`), and the displacement filters are a single shared `<defs>` block (`LiquidGlassFilters.tsx:269-294`) referenced by id — no per-marker filter is generated. Preserve this: **filters and maps must be cached and shared by their full parameter tuple (width, height, radius, bezel/`border`, profile, zoom).** Minting a `feImage` data URI per marker means one SVG decode per pin, which at 40 pins is a visible stall on marker churn.

Two live hazards. First, `LiquidGlassFilters` is mounted twice — `src/main.tsx:12` and `src/app/App.tsx:239`/`336` — so every filter id, including `cruush-liquid-glass-heart`, exists twice in the document. `url(#id)` resolves to the first in document order, so the second set is dead weight that still costs its decodes. Second, each badge is `.cruush-glass-soft` overridden to the dock backdrop inside `[data-map-marker-pin]` (`theme.css:1105-1109`), so a pin with two badges is three backdrop-filtered surfaces, not one.

### 10. Edge cases

| Trigger | Symptom | Correct handling |
| --- | --- | --- |
| Dark map area behind the band (night tiles, water, the heatmap's dark end) | The band vanishes: a clear lens over near-black has nothing to bend, and `background: transparent` (`theme.css:1186`) adds no value of its own | Rely on `::after`'s `rgba(255,255,255,0.16)` rim (`theme.css:1207`) for the silhouette read. Do not raise the `::before` fill — that is failure (e) returning as frost |
| Two pins overlapping | The upper pin's band samples the lower pin's artwork as backdrop and displaces it — the same mechanism as failure (b), between siblings rather than within one pin | Clustering prevents it: `PERSON_CLUSTER_RADIUS_PX = 84` below `PERSON_CLUSTER_MAX_ZOOM = 15.25` (`MapView.tsx:94-95,711`). Co-located markers at 6-decimal precision spiderfy instead (`MapView.tsx:98-100`) |
| Spiderfied or mobile-signal-active pin | Explicit `z-index` is written to the marker element: `30 + index` for spiderfy, `60` for the active signal (`MapView.tsx:1241,1246`) | The shell's `isolation: isolate` keeps the `-1` band inside the marker, so raising the marker raises its glass with it. Never remove the isolation to "fix" ordering |
| Hover scale | Tag/heart collision, per section 7 | Match the lift to `origin-bottom`, or change the origin |
| `prefers-reduced-transparency: reduce` | `::before` drops `backdrop-filter` for `rgba(255,255,255,0.14)` (`theme.css:1210-1216`) | `::after`'s rim is *not* overridden, so the two whites stack to roughly 0.28 on the outer 0.7 units. If the rim reads as a hard keyline under this setting, suppress `::after` rather than lowering `::before` |
| `prefers-reduced-motion: reduce` | `.cruush-heart-glass-specular` animation stops (`theme.css:1416-1421`), and the signal tag's transition is unaffected | No action; the specular layer is `display: none` anyway |
| DL Mode over an explicit photo | Gradient overlay at `opacity: 0.96` above the image (`MapView.tsx:1048-1056`) | It is a `<path>` on `HEART_PIN_PATH`, so it stays inside the silhouette and never touches the band |
| Orphan component | `src/app/components/HeartPin.tsx` is imported only by its own test | It still carries the stale `strokeWidth="3.2"` border and the dead `71`s. Either delete it or bring it onto the MapView geometry before anyone copies it as a reference |


---

# Part V — The map — a hard scope boundary

All paths below are relative to the worktree root `/Volumes/corrupt/Cruushv2-1.worktrees/landing-page-liquid-glass-antigravity` on branch `feature/landing-page-liquid-glass-antigravity`. Line numbers are as read from the working tree, which is dirty relative to `HEAD`; where a value differs between `HEAD` and the working tree this is stated.

### 13.1 The rule

The custom map tiles and the map's own rendering are out of scope unless the request names the map explicitly. Glass work, pin work, layout work and nav work never imply permission to touch the style. If a task appears to require touching one of the surfaces below, stop and ask.

The failure this prevents: a visual change nobody asked for lands in the same commit as one they did, and the user discovers it by looking at the map rather than by reading a message. Two such edits were made in one session (§13.4, §13.6), both to values that predated the session entirely.

Out of bounds, by symbol:

| Surface | Location | Notes |
| --- | --- | --- |
| `createCruushVectorStyle` — whole style object | `src/app/components/MapView.tsx:261-506` | The exported style builder. Signature `(tileJsonUrl = DEFAULT_VECTOR_TILEJSON_URL, glyphsUrl?, enable3dBuildings = false)` |
| `sources.openmaptiles` | `MapView.tsx:270-275` | `type: 'vector'`, `url: tileJsonUrl` |
| `DEFAULT_VECTOR_TILEJSON_URL` | `MapView.tsx:83` | `'https://tiles.openfreemap.org/planet'` |
| `DEFAULT_TILE_URLS`, `DEFAULT_ATTRIBUTION` | `MapView.tsx:76-82` | Raster fallback: four CARTO `dark_all` subdomains |
| `createRasterStyle`, `createConfiguredRasterStyle`, `createDefaultRasterStyle` | `MapView.tsx:200-219`, `237-245`, `221-223` | The fallback path is still the map |
| `create3dBuildingLayer`, `MAP_3D_BUILDING_LIGHT` | `MapView.tsx:116-168`, `170-175` | Includes the seven-stop `fill-extrusion-color` ramp |
| Heatmap layer object and its `paint` | `MapView.tsx:1958-1991` | `maxzoom: 16.75` at `:1962` |
| Layer insertion order helpers | `MapView.tsx:778-784`, `786-797` | `getHeatmapBeforeLayerId`, `get3dBuildingBeforeLayerId` |
| `.cruush-map .maplibregl-canvas { filter: … }` | `src/styles/theme.css:261-264` | |
| `.cruush-map-shell` sizing block | `theme.css:266-277` | |
| `@supports selector(body:has(.cruush-map-shell))` scroll lock | `theme.css:279-288` | |
| `.cruush-map` class application | `MapView.tsx:2114` | |
| `.cruush-map-shell` class application | `src/app/components/MapHome.tsx:1546` | |

Every layer in `createCruushVectorStyle`, in file order, with its `paint`/`layout` blocks frozen:

| # | `id` | `type` | `source-layer` | `minzoom` | Lines |
| --- | --- | --- | --- | --- | --- |
| 1 | `background` | background | — | — | 277-283 |
| 2 | `landcover-base` | fill | `landcover` | — | 284-293 |
| 3 | `landuse-blocks` | fill | `landuse` | — | 294-309 |
| 4 | `building-extrusions-dark` | fill-extrusion | `building` | 12.6 | 310 (conditional), 116-168 |
| 5 | `minor-roads` | line | `transportation` | — | 311-328 |
| 6 | `major-roads` | line | `transportation` | — | 329-346 |
| 7 | `major-road-dashes` | line | `transportation` | — | 347-365 |
| 8 | `road-marking-dashes` | line | `transportation` | 15 | 366-379 |
| 9 | `minor-road-labels` | symbol | `transportation_name` | 12 | 380-407 |
| 10 | `secondary-road-labels` | symbol | `transportation_name` | 12 | 408-434 |
| 11 | `primary-road-labels` | symbol | `transportation_name` | 10 | 435-455 |
| 12 | `prominent-road-labels` | symbol | `transportation_name` | 9 | 456-476 |
| 13 | `place-labels` | symbol | `place` | 8 | 477-503 |

Every typographic property on the five symbol layers is frozen. Only `text-size` is authorised, and only on layers 9-12.

| Layer | `text-font` | `text-color` | `text-halo-color` | `text-halo-width` | `text-letter-spacing` | `text-padding` |
| --- | --- | --- | --- | --- | --- | --- |
| `minor-road-labels` | `MAP_LABEL_FONT_REGULAR` (:397) | `#9c9ca4` (:403) | `#050506` (:404) | `1` (:405) | `0.02` (:399) | `1` (:400) |
| `secondary-road-labels` | `MAP_LABEL_FONT_REGULAR` (:424) | `#b4b4bc` (:430) | `#050506` (:431) | `1.2` (:432) | `0.025` (:426) | `2` (:427) |
| `primary-road-labels` | `MAP_LABEL_FONT_BOLD` (:445) | `#dcdce2` (:451) | `#050506` (:452) | `1.4` (:453) | `0.03` (:447) | `2` (:448) |
| `prominent-road-labels` | `MAP_LABEL_FONT_BOLD` (:466) | `#ffffff` (:472) | `#050506` (:473) | `1.5` (:474) | `0.035` (:468) | `2` (:469) |
| `place-labels` | `MAP_LABEL_FONT_BOLD` (:485) | `#eaeaef` (:499) | `#050506` (:500) | `1.6` (:501) | `0.035` (:495) | `4` (:496) |

`MAP_LABEL_FONT_REGULAR = ['Cormorant Garamond']` and `MAP_LABEL_FONT_BOLD = ['Cormorant Garamond Bold', 'Cormorant Garamond']` at `MapView.tsx:88-89`; the family is loaded through `loadMapLabelFonts` at `MapView.tsx:247-259`.

**Naming trap.** Not every `.cruush-map-*` selector is the map. `.cruush-map-3d-toggle` and `.cruush-map-heatmap-toggle` (`theme.css:636-656`, `1437-1440`) and `.cruush-map-logo-shell` / `.cruush-map-logo-glass` (`theme.css:1218-1268`) are chrome that renders *over* the map and are ordinary glass surfaces. The boundary is the descendant selector `.cruush-map …` and the shell selector `.cruush-map-shell`, not the string prefix. Failure this prevents: refusing an in-scope control fix because its class begins with `cruush-map-`, or, worse, treating a `.cruush-map .maplibregl-canvas` edit as chrome work.

### 13.2 The three authorised changes

Each was requested by name. Values below are read from the working tree.

| Change | Current value | Previous value at `HEAD` | Location |
| --- | --- | --- | --- |
| `minor-road-labels` `text-size` | `['interpolate',['linear'],['zoom'],12,12,16,17,19,21]` | `…,12,9,16,12]` | `MapView.tsx:398` |
| `secondary-road-labels` `text-size` | `['interpolate',['linear'],['zoom'],12,14,16,19,19,23]` | `…,12,11,16,14]` | `MapView.tsx:425` |
| `primary-road-labels` `text-size` | `['interpolate',['linear'],['zoom'],10,15,16,21,19,25]` | `…,10,12,16,15]` | `MapView.tsx:446` |
| `prominent-road-labels` `text-size` | `['interpolate',['linear'],['zoom'],9,17,16,22,19,27]` | `…,9,13,16,16]` | `MapView.tsx:467` |
| `heatmap-radius` | `['interpolate',['linear'],['zoom'],10,18,14,34,16,48]` | `…,10,34,14,68,16,96]` | `MapView.tsx:1969` |
| Canvas filter | `brightness(1.18) contrast(1.06) saturate(1)` | `brightness(0.86) contrast(1.2) saturate(1)` | `theme.css:263` |

Two facts follow from the ramps. Each street tier gains a third stop at zoom 19; before, all four topped out at zoom 16, so names froze at their smallest size while every other feature kept scaling. And the size increases at the shared stops are between +25% (`primary` at zoom 10: 12 → 15) and +42% (`minor` at zoom 16: 12 → 17), not the doubling an earlier attempt reached (§13.3).

**Place names were reverted.** `place-labels` keeps its original two-stop ramp `['interpolate',['linear'],['zoom'],8,13,12,17]` at `MapView.tsx:486-494`, byte-identical to `HEAD`. It is out of the diff entirely. Cause: the ask named street names; place names are settlement labels from the `place` source-layer, a different layer with a different job. Effect of getting this wrong: town and city names grow into the street grid at mid zoom and the map reads as a different design, which is what "the font changed" described.

**Verified defect.** `src/app/components/MapView.test.tsx:683` still asserts `'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 10, 34, 14, 68, 16, 96]`. Running `npx vitest run src/app/components/MapView.test.tsx` in the worktree gives 1 failed / 34 passed, failing at `MapView.test.tsx:677`. The radius change was made without updating its lock. The canvas filter, by contrast, is locked correctly at `src/styles/theme.test.ts:35`. Rule: an authorised map change is not done until its assertion moves with it, otherwise the next unrelated test run reports a red suite and invites someone to "fix" it by reverting the map.

**Stale plan document.** `docs/plans/2026-08-05-cruush-session-plan.md:48-51` records the street tiers as ending at "18/21/23/25" and place names as "17 → 24 → 31". Neither matches the code. `docs/plans/cruush-spec.md:604-609` matches the code exactly. The plan file was written at 14:48 and the spec at 14:57; the plan describes the pre-revert state. Treat `cruush-spec.md` §14 as authoritative and correct the plan, or delete it — a stale ramp table is how a revert gets undone by someone acting in good faith.

### 13.3 Magnitude is part of scope

A change with no specified magnitude must be the smallest change that satisfies the ask, and the magnitude chosen must be stated back to the user. Doubling a value is a look change even though only one property moved.

The failure: asked to enlarge street names, an attempt raised them roughly 75% in a single step and enlarged place names at the same time. The user's report was "the font changed" — not "the labels are too big" — because a jump of that size crosses the threshold at which type reads as a different face rather than the same face at a different size. Recorded at `cruush-spec.md:160` and `:1085`. The surviving ramps land at +25% to +42%, which reads as the same map at a legible size.

*Unverified:* the exact intermediate `text-size` values behind the "~75%" figure are not recoverable from this tree — they were never committed and the working tree holds only the final values. Verified by `git log -S` on the ramp expressions, which returns no commit carrying them. What would verify it: the session transcript, or a stash entry if one was taken.

### 13.4 A question is not an instruction

"Why is X like this?" asks for a cause and a location. It does not authorise changing X. Offer the change as a follow-up and wait for a yes.

The exact failure, recorded at `cruush-spec.md:159` and `2026-08-05-cruush-session-plan.md:16-20`: a question about why the map looked so dark produced an edit to `.cruush-map .maplibregl-canvas`, changing `brightness(0.86)` to `brightness(1.18)`. The correct answer was that `brightness(0.86) contrast(1.2) saturate(1)` predated the session entirely — `git log -S"maplibregl-canvas"` and the diffs of `751c653`, `46bc523` and `e5c635c` all show that value already in place, and `a6d5036` shows an earlier `brightness(1.2) contrast(1.14) saturate(0.9)` before it. Nothing in the session had made the map darker. The root cause was not a bad value judgement; it was answering a question with an edit.

The current value is authorised — Julien picked `brightness(1.18) contrast(1.06) saturate(1)` after comparing against the shipped `0.86`, and the CSS carries his marker at `theme.css:262`: `/* Julien's pick. Do not change this without him asking for it by name. */`. Both facts must survive: the value is legitimate now, and the route by which it first changed was a rule break. Recording only the outcome would teach the wrong lesson.

### 13.5 Outstanding decision: the `.cruush-map-shell` glass-token block

**What it did.** A block scoped to `.cruush-map-shell` overrode background tokens (`bg-background` / `bg-black` / `bg-card`, per `2026-08-05-cruush-session-plan.md:17-19`) so that glass panels sitting on the map took the dock's material rather than the app-wide plate material.

**Why it was removed.** It was added while chasing a tan cast on glass surfaces, not in response to an ask that named the map. Being scoped to `.cruush-map-shell` puts it squarely inside R1. It was reverted along with the canvas filter edit.

**State in the tree.** No `.cruush-map-shell` rule sets any custom property anywhere in `theme.css`; the only `.cruush-map-shell` blocks are the viewport-sizing block at `:266-277` and the scroll lock at `:279-288`. The `@supports` block at `theme.css:501-530` ends with a stray blank line at `:529` before its closing brace at `:530` — the shape a deleted nested block leaves behind. `git log -S"cruush-map-shell"` returns only five commits, all sizing changes, so the block was never committed; it lived only in the working tree.

**What regresses without it.** The tan cast may return on the Recently Active bar and on the Seeking/Visibility pills when they sit over the map, because off-map those surfaces now take `--cruush-glass-plate-bg: rgba(7, 11, 20, 0.64)` with `--cruush-glass-plate-backdrop: blur(12px) saturate(0.86) contrast(0.9) brightness(0.82)` (`theme.css:482-486`, applied at `:514-522`) rather than the dock lens. Over warm-grey street tiles a dark plate reads warmer than it does over a dark page.

*Unverified:* whether the tan actually returns on the current build. What would verify it: a screenshot of the RA bar and the Seeking/Visibility pills over the map at the same zoom and location, with and without the block, at the current canvas filter.

**Why restoring needs explicit approval.** The block is map-scoped. Restoring it is a map change regardless of the fact that its visible effect is on glass. Do not restore it while fixing a glass bug; raise it as its own decision.

### 13.6 Edge cases

| Trigger condition | Symptom | Correct handling |
| --- | --- | --- |
| Heat map toggled on (`heatmapEnabled`, `MapHome.tsx:1680`; layer added at `MapView.tsx:1953-1998`) | Tiles appear darker or bluer. The `heatmap-color` ramp starts at `rgba(17, 129, 255, 0.45)` at density 0.06 (`MapView.tsx:1978`) and `heatmap-opacity` runs 0.34 → 0.58 → 0.52 (`:1970`) | Compare like with like. Toggle the heat map off before judging tile brightness, and say which state a screenshot was taken in. Never adjust the canvas filter to compensate for the heat layer |
| Zoom above 16.75 | Heat map vanishes entirely (`maxzoom: 16.75`, `MapView.tsx:1962`) and the tiles appear to brighten in one step | Expected. Not a rendering bug and not grounds for a filter change |
| Pins clustered at one coordinate | `.cruush-heart-pin-shell::before` applies `backdrop-filter: url("#cruush-liquid-glass-heart")` per pin (`theme.css:1181-1197`) and `::after` paints `rgba(255,255,255,0.16)` (`:1202-1208`). Overlapping rings stack, producing a bright patch that reads as a tile artefact | Diagnose on the pins, not the map. If the halo is too strong, change the rim alpha or the ring mask; the tiles under it are unchanged |
| `prefers-reduced-transparency: reduce` | The ring lens is replaced by flat `rgba(255,255,255,0.14)` (`theme.css:1210-1216`), changing local contrast around every pin | Expected. Do not treat the difference between the two modes as a map regression |
| "The map looks dark" | Perceived darkness has at least four independent sources: the canvas filter (`theme.css:263`), the heat layer, glass plates at 0.64 alpha over the tiles, and pin ring halos | Establish which one before touching anything. Only the first is the map. The distinction between *looking* dark and *being* dark is the whole of §13.4: the filter value predated the session, so nothing in the session had made it darker |
| `VITE_MAP_STYLE_URL` set | `getMapStyle` returns the URL string (`MapView.tsx:509-513`) and `createCruushVectorStyle` never runs | Edits to the style builder have no effect in that environment. Confirm which branch of `getMapStyle` is live before diagnosing a style problem |
| `VITE_MAP_USE_RASTER_TILES` enabled, or vector load fails into the raster fallback | `MAP_DETAIL_LAYER_TYPES` is `new Set(['line', 'symbol'])` (`MapView.tsx:104`); a raster style has neither, so `getHeatmapBeforeLayerId` returns `undefined` and the heat map is appended on top of everything | Expected behaviour of the guarded `if (beforeId)` at `MapView.tsx:1994-1998`. Do not "fix" the ordering by adding a layer id to the raster style |
| 3D buildings enabled | `get3dBuildingBeforeLayerId` inserts the extrusion layer before `minor-roads` by exact id (`MapView.tsx:794`) | Renaming or reordering `minor-roads` silently drops buildings behind the roads. Layer ids are load-bearing, which is why layer order is on the forbidden list |
| No glyphs URL configured | `glyphs` is omitted from the style (`MapView.tsx:268`); `text-font` cannot resolve and labels do not draw | A missing-labels report is a configuration problem, not a `text-size` problem. Check `VITE_MAP_GLYPHS_URL` before touching a ramp |
| Someone proposes tuning the canvas filter to make pins stand out | The filter is scoped to `.cruush-map .maplibregl-canvas` only; markers are DOM overlays outside the canvas and are unaffected — this is what `theme.test.ts:33-38` protects | Adjust the pins or the glass. Changing the filter changes the map for every user and requires being asked by name |


---

# Part VI — The landing page — layout contract, controls, and captcha

All paths are relative to the worktree root. Values below were read from
`src/app/components/Auth.css` (1175 lines), `src/app/components/Auth.tsx` and
`src/app/components/Auth.test.tsx`.

### 1. The layout contract

The screen is one column of three grid rows. Nothing is positioned over anything
else, so the stack can only read top to bottom: logo band, card, footer.

```css
.launch-login-auth-shell {
  display: grid;
  grid-template-rows: var(--cruush-logo-band) minmax(0, 1fr) auto;
  height: 100dvh;
  overflow: hidden;
}
```
`Auth.css:5-18`

| Property | Value | Source |
| --- | --- | --- |
| Top of window to highest flame tip | `max(30px, env(safe-area-inset-top))` | `--cruush-logo-clearance`, `Auth.css:22` |
| Logo bottom to tagline | `30px`, fixed on every device | `--cruush-logo-gap`, `Auth.css:24` |
| Side padding | `max(1.5rem, env(safe-area-inset-left), env(safe-area-inset-right))` | `--cruush-logo-side-pad`, `Auth.css:25` |
| Logo band | `min(100dvw − 2 × side-pad, 100dvh − clearance − gap − stack-reserve)` | `--cruush-logo-band`, `Auth.css:38-41` |
| Card row | `minmax(0, 1fr)`, `align-self: start` | `Auth.css:8`, `:96` |
| Footer row | `auto`, `align-self: end` | `Auth.css:659-662` |
| Page scroll | never | `height: 100dvh; overflow: hidden`, `Auth.css:14-17` |

The band expression is the whole layout in one line: the logo is as large as it
can be, limited by the width between the side margins or by the height left once
the clearance, the 30px gap and the stack below have been paid for — whichever
runs out first. Because the band is derived rather than set per breakpoint,
adding a per-breakpoint `--cruush-logo-band` override reintroduces every geometry
bug this expression exists to prevent. Tune the *reserve* at a breakpoint, never
the band.

**Clearance correction.** The card's top margin is
`calc(var(--cruush-logo-gap) - var(--cruush-logo-band) * 0.0092)` (`Auth.css:101`).
The artwork stops 0.92% short of the video frame's bottom edge, measured across
all 200 frames, so that slack is subtracted or the tagline sits a few pixels low.
If the logo asset is ever re-rendered, this constant must be re-measured; it is
a property of the asset, not of the layout.

### 2. The measured reserve — the rule that keeps the stack off the footer

`--cruush-auth-stack-reserve` must be **measured**, never a constant:

```css
--cruush-auth-stack-reserve: var(--cruush-auth-stack-measured, 21.4rem);
```
`Auth.css:34` — and `26.2rem` when `[data-captcha-slot='reserved']` (`Auth.css:65-67`).

The measurement is a `useLayoutEffect` in `Auth.tsx:97-127`: it queries the card
and the footer, publishes `card.offsetHeight + footer.offsetHeight + 12` onto the
shell as `--cruush-auth-stack-measured`, and keeps it current with a
`ResizeObserver` on both elements plus a `window resize` listener. The `+ 12` is
deliberate slack so the two never touch and a one-line reflow in the footer does
not immediately collide.

**Failure this prevents:** the reserve was once a constant tuned on the sign-in
form. Sign-up adds a third field, so the card outgrew the reserve and the whole
stack fell through the footer. A rem constant cannot survive a form that changes
height, and the states it must survive are: sign-in, sign-up, forgot-password,
captcha rendered, error banner shown, notice banner shown, and any combination.

`Auth.test.tsx:162-163` asserts both halves of this rule — that the reserve reads
from `--cruush-auth-stack-measured`, and that it is **not** a literal number.

### 3. The captcha slot

The slot is present in the markup from first paint whenever a site key is
configured, so the widget lands in reserved space rather than growing the card.
The height for it is given up by the logo band, not by a gap in the middle of the
form.

| State | Attribute | Height |
| --- | --- | --- |
| Configured, not yet needed | `data-captcha-state="reserved"` | `min-height: 0` (`Auth.css:369`) |
| Widget rendering | `data-captcha-state="active"` | `min-height: var(--cruush-captcha-slot, 65px)`, `margin-top: 0.74rem` (`Auth.css:377-380`) |

The shell carries `data-captcha-slot="reserved"` whenever a site key exists
(`Auth.tsx:479`), which is what swaps the fallback reserve from `21.4rem` to
`26.2rem`. The slot's own state comes from `shouldShowCaptcha`
(`Auth.tsx:130-134`): not in forgot-password mode, a site key configured, and
either the captcha was explicitly requested or any of email, password, alpha
password or two-factor code is non-empty.

**The 65px defect, in full, because it is the most instructive failure on this
screen.** The buttons sat visibly low for many rounds. Two separate rules held
the slot open: the base rule, and a rule inside a mobile media query that set
`min-height: 3.9rem` unconditionally. Media queries add no specificity, so
whichever rule came later won — fixing the base rule alone changed nothing that
could be seen. Measured before: password ended at y=649, submit began at y=738,
with the empty slot occupying 661–726. Measured after both rules were gated on
`[data-captcha-state='active']`: the password-to-button gap fell from 78px to
15px, slot height 0, sign-up 8px under the button, forgot-password 5px below
that. A second measurement pass, after the gel and spacing work, recorded 89px →
24px with sign-up 12px below.

The general lesson: when a fix "does not hold", grep for **every** rule that sets
the property before changing the one you already know about. Unlayered CSS and
media queries interact by source order, not by intent.

### 4. Order inside the form

Required order, all five inside `.launch-login-auth-form`, none in the footer:

```
email → password → captcha slot → sign in → sign up capsule → forgot password
```

`Auth.test.tsx:115-152` asserts containment and order, that the captcha slot
starts `reserved`, that `.launch-login-auth-captcha` declares `min-height: 0`,
and that the `active` variant exists.

**The trap this test originally fell into:** an order assertion passed for weeks
while the screen was visibly wrong, because the order was never the defect — the
empty 65px slot was, and no DOM-order assertion can see a gap. The test now
carries the slot-collapse assertion for exactly this reason. See Part IX.

### 5. Buttons and capsules

Sign in and sign up are the **same component**. Same width, same `3rem`
min-height, same glass shell, same rim, same grade. Hierarchy is carried by neon
intensity alone, which is the single difference that says "this is the primary
action" without making the two read as unrelated controls.

| Layer | Sign in | Sign up capsule |
| --- | --- | --- |
| Shell | `border: 1px solid var(--cruush-glass-border-strong, rgba(255,255,255,0.3))`, `border-radius: 999px`, `background: var(--cruush-glass-dock-bg, hsl(0 0% 0% / 0.05))`, `backdrop-filter: var(--cruush-glass-dock-backdrop)` (`Auth.css:341-345`) | identical (`Auth.css:604-613`) |
| Grade | `filter: saturate(1.32) brightness(1.16) contrast(1.04)` (`Auth.css:359`) | identical (`Auth.css:614`) |
| Gel | `background-image: var(--cruush-gradient)`, `filter: blur(0.26rem) saturate(2.1) brightness(1.35)` (`Auth.css:417`) | identical, `inset: 0.18rem`, `opacity: 1` (`Auth.css:574-589`) |
| Hover | `filter: blur(0.2rem) saturate(2.4) brightness(1.5)`, inset tightens (`Auth.css:427`) | same treatment |
| Shadow | `0 1.15rem 2.7rem rgba(0,0,0,0.46)`, `inset 0 1px 0 rgba(255,255,255,0.3)` (`Auth.css:352-354`) | identical (`Auth.css:609-611`) |

Three rules govern the gel, each recording a specific complaint:

1. **The gel is inset, not bled.** Spilling it past the edges fills the whole
   face and the control stops reading as glass; the rim must stay clear.
   `overflow: hidden` plus `isolation: isolate` (`Auth.css:346-347`) keep it
   inside.
2. **Neon comes from saturation, not from spread.** Blur is what kills neon — it
   spreads the same light over more area, so the peak drops. Keep the blur tight
   (`0.26rem`) and let `saturate(2.1) brightness(1.35)` carry the intensity.
   The comment at `Auth.css:413-416` records this.
3. **The grade is load-bearing.** `saturate(1.32) brightness(1.16) contrast(1.04)`
   is the grade the button shipped with when it painted the gradient as a solid
   background. It was silently dropped during the conversion to a glass shell —
   the conversion was asked for, dropping the grade was not. That grade is the
   brightness that "went missing" (`Auth.css:355-358`).

**The z-index detail that broke the label.** The sign-in button lifts its own
label in a `z-10` span; the sign-up capsule's label is a bare text node with
nothing lifting it. So the capsule's gel must sit at `z-index: -1`, with
`isolation: isolate` on the capsule keeping that negative index inside the button
rather than dropping it behind the card (`Auth.css:576-581`). Putting the gel
above the text made the label vanish entirely.

**Label weight matters too.** A thinner, dimmer label lets more of the gradient
through, which made the secondary control read as the *brighter* of the two. The
capsule therefore carries the same `font-weight: 700`, colour and text-shadow as
the sign-in label (`Auth.css:620-625`).

**Forgot password stays a plain link** (`Auth.css:528-529`). Two capsules compete;
the quieter action must not be one.

**Errors and notices** are capsules in the same material, with colour glowing
inside rather than a flat tinted box. Errors swap the brand sweep for
`linear-gradient(90deg, #d11f3a 0%, #ff0072 50%, #d11f3a 100%)` at `opacity: 0.85`
(`Auth.css:564-567`).

### 6. Footer

The footer is row 3, `align-self: end`, so the links are flush to the bottom of
the window whatever the viewport does (`Auth.css:659-662`).

| Rule | Value | Source |
| --- | --- | --- |
| Legal links width | `width: 100%; max-width: 100%` — the full width of the page, always | `Auth.css:671-676` |
| Legal links layout | `flex-wrap: wrap`, `gap: 0.12rem 0.7rem` | `Auth.css:677-682` |
| Desktop ≥ 60rem | `flex-wrap: nowrap`, `white-space: nowrap`, `gap: 0 0.55rem`, `font-size: 0.8rem` | `Auth.css:1156-1163` |
| Contacts row | `gap: 0.2rem 30px` — the two addresses exactly 30px apart | `Auth.css:699-706` |
| Contacts above links | `margin-top: 0.55rem` | `Auth.css:730-732` |
| Footer internal gap | `0.18rem` — the emails and the policy links read as one block | `Auth.css:656` |

**Why the 30px gap kept blowing out.** `margin-inline: auto` on the contact
children absorbs all free space in a flex row, which pushed the two addresses to
opposite ends (measured at 470px apart). The auto margins are zeroed at
`Auth.css:693-697` and the `gap` does the spacing. Capping the link run at a
`max-width` had a matching failure: it stacked the links into a narrow column
with empty space either side, which is why the width is now pinned to 100%
(`Auth.css:673-674`).

### 7. Copy rules

Everything on this page is lowercase **except** `NYC OPEN BETA`.

Done: `sign in`, `sign up` (`Auth.tsx:871`), `create account`, `send reset link`,
`forgot your password?` (`Auth.tsx:881`), loading states.
Outstanding: the footer legal links, and the `NYC OPEN BETA` text colour, which
should match the sign-up capsule's label.

The bug-reports line reads `bug reports: cruush.app` and links to
`mailto:reports@cruush.app`; only the address is underlined, and it is the same
white as the other footer copy (`Auth.css:1143-1151`).

### 8. Edge cases

| # | Trigger | Symptom if unhandled | Correct handling |
| --- | --- | --- | --- |
| 1 | Sign-up mode | Third field grows the card; stack falls through the footer | Measured reserve (§2); verify by switching modes with the observer live |
| 2 | Forgot-password mode | Card shrinks; band grows; logo can exceed its clearance | Band is derived, so this is automatic — but re-measure after any band change |
| 3 | Captcha renders | Button pushed down ~62px | Reserve already paid by the band; confirm nothing overlaps and nothing scrolls |
| 4 | Captcha configured but idle | 65px dead band between password and button | Slot collapses to `min-height: 0` (§3) |
| 5 | Error or notice banner shown | Card taller than any static reserve | Measured reserve; banner is inside the card so the observer sees it |
| 6 | Safe-area insets (notch, home indicator) | Logo clipped at top, links under the home indicator | `env(safe-area-inset-*)` in clearance, side pad and bottom padding (`Auth.css:22`, `:25`, `:48`) |
| 7 | Very short viewport | Band collapses toward zero | Band is a `min()`, so it degrades rather than overflowing; verify the logo does not disappear entirely |
| 8 | Very wide viewport | Logo width-limited, band wastes height | Expected; the width term wins by design |
| 9 | Desktop ≥ 60rem | Links wrap to two lines and climb into the card | `nowrap` rule at `Auth.css:1156-1163` |
| 10 | `prefers-reduced-motion: reduce` | Spinning video still plays | Teaser must take the still path — see Part VII |
| 11 | Autofill | Browser paints its own field background | Overridden by the `-webkit-autofill` block (`Auth.css:319-331`) |
| 12 | Password toggle | Text sits under the toggle button | `padding-right: 3.1rem` on the password input (`Auth.css:263-265`) |

### 9. Outstanding on this screen

1. `NYC OPEN BETA` text colour to match the sign-up capsule's label.
2. Footer legal links to lowercase.
3. Turnstile as a floating popup in a glass capsule with an X in the corner,
   rather than inline. The inline slot is what currently sits between the
   password field and the button; the popup version removes it entirely. Note
   that Cloudflare's `appearance: 'interaction-only'` with `execute` mode is the
   mechanism — the widget takes zero space and renders only when a challenge is
   actually needed.
4. Password policy: at least 8 letters, 1 number, 1 special character, enforced
   on the server in `signUp` with a live checklist in the form. See Part VIII.

Local testing uses Cloudflare's published dummy site keys, which always pass;
they are development-only and must never reach a production environment file.


---

# Part VII — The teaser — logo loops, glitter, and butterflies

The login background is one fixed-position element, `.launch-login-map-teaser`, containing six layers: the glitter stack, the alpha logo video, a WebGL butterfly field, an inert scrub plate, a screen-blend pulse, and a vignette. It is `aria-hidden="true"` and `pointer-events: none` throughout (`src/app/components/LaunchLoginMapTeaser.tsx:382-386`, `.css:16`), so nothing here is ever in the accessibility tree or the hit-test path. That is deliberate: the layer sits above the page background but below the auth card's `z-index: 20`, and a stray pointer target here would swallow taps on the sign-in button.

### 1. Video assets

Probed with `ffprobe` 8.1.2 against the worktree copies in `public/teasers/`.

| File | Dimensions | Codec | Pixel format | Alpha | Rate | Frames | Duration | Bytes | Referenced at |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `cruush-logo-login-alpha-desktop.webm` | 1200×1200 | VP9 Profile 0 | `yuv420p` | `TAG:alpha_mode=1` | 30/1 | 200 | 6.666000 s | 6,510,504 | `LaunchLoginMapTeaser.tsx:13` |
| `cruush-logo-login-alpha-mobile.webm` | 720×1280 | VP9 Profile 0 | `yuv420p` | `TAG:alpha_mode=1` | 30/1 | 200 | 6.666000 s | 3,367,202 | **nothing** |
| `launch-login-teaser-desktop.webm` | 960×600 | VP9 | `yuv420p` | none | 24/1 | 192 | 8.000000 s | 150,466 | **nothing** |
| `launch-login-teaser-mobile.webm` | 320×692 | VP9 | `yuv420p` | none | 24/1 | 192 | 8.000000 s | 85,995 | **nothing** |
| `launch-login-teaser-mobile.mp4` | 320×692 | H.264 | `yuv420p` | none | 24/1 | 192 | 8.000000 s | 201,927 | **nothing** |
| `silver-glitter-background.png` | 2000×1335 | PNG `pal8` | — | — | — | — | — | 1,453,122 | `.css:124` |
| `codepen-butterfly-tex.png` | 1024×512 | PNG `pal8` | — | — | — | — | — | 16,085 | `.tsx:14` |
| `cruush-logo-brand.svg` | viewBox `0 0 654.49 680.6` | — | — | — | — | — | — | 9,883 | `logoRender.ts:18` |

Alpha is carried as a WebM BlockAdditions side-channel, not in the pixel format — `pix_fmt` reads `yuv420p` and the alpha shows only as the container tag `alpha_mode=1`. The encoder tag is `Lavc62.28.102 libvpx-vp9`. `scripts/logo-render/README.md:29-30` records the reason for `-auto-alt-ref 0 -lag-in-frames 0`: VP9 alt-ref frames drop the alpha channel. Encoding without those flags yields a clip that decodes and plays but composites as an opaque black square over the glitter.

Loop period is 200 ÷ 30 = 6.6667 s. The CSS glitter period is `6.66s` in three places (`.css:119`, `:135`, `:146`). The 0.0067 s mismatch means the sheen-synced flake band in the video drifts against the CSS sheen by roughly one frame per 100 cycles. Below the perceptual floor, but it is a real drift, and any change to one period must change the other.

Four of the eight assets are unreferenced: the portrait logo loop plus the entire pre-alpha teaser set, retired by commit `4d7913c`, which consolidated to one square asset. That is 3.6 MB of dead weight shipped in `public/`.

### 2. The notch

The recorded loops these replace had a wedge bitten out of the flame's silhouette where the "c" of the wordmark meets it (`README.md:6-8`). The defect was in the model geometry, not the encode.

Frame-level repainting was attempted and only partly worked. Commit `514602a` records the cause: repainting "only closed gaps up to about 10px, so it stayed visible through most of the rotation". A morphological close bridges a gap only up to its structuring-element size; a kernel tuned to seal the notch at the angle where it presents narrowest leaves it open at every angle where the projected gap exceeds the kernel, and the gap is wider at most angles of a full revolution. Enlarging the kernel to cover the worst angle would round off the flame tips everywhere else. There is no single kernel size that is both large enough at 90° and small enough at 0°.

A second, worse defect could not be patched at all: mid-turn the letters passed through the heart ring and the wordmark broke into separate slabs. Intersecting geometry is not a raster problem.

The shipped asset is a three.js render from the brand SVG, which does not contain the notch. `scripts/logo-render/logoRender.ts:184` loads the SVG through `SVGLoader`; `:248-270` splits paths by class — `cls-2` is the white wordmark (four paths, `fill:#fff`), `cls-1` and `cls-3` are the gradient-filled flame and heart. Every piece is extruded at one shared `EXTRUDE_DEPTH = 58` (`:19`) with `bevelThickness: 4.5`, `bevelSize: 3.2`, `bevelSegments: 3`, `curveSegments: 14` (`:258-263`), and the spin is a single `group.rotation.y` (`:348`). Sharing one depth on one axis is what makes intersection structurally impossible, not merely unobserved.

### 3. The loop

The recorded source never completed its revolution. Commit `514602a` records frame 299 scoring SSIM 0.927 against frame 0 "with the curve still climbing" — the similarity was still rising at the end of the clip, so no trim point existed and no cross-fade could hide the jump.

The render closes by construction. `logoRender.ts:347-348`:

```ts
const phase = index / FRAME_COUNT;
group.rotation.y = phase * Math.PI * 2;
```

At the shipped `FRAME_COUNT` of 200 each frame advances exactly 360 ÷ 200 = 1.8°, and frame 200 would be identical to frame 0. The wrap is therefore the same angular step as every other adjacent pair.

`README.md:14-15` and commit `514602a` quote SSIM 0.965 at the seam against 0.963 and 0.965 for neighbours. Measured directly against the shipped desktop asset (200 decoded RGBA frames, `ffmpeg` `ssim` filter, `All` channel), the absolute values differ:

| Measurement | Value |
| --- | --- |
| Seam, frame 199 → frame 0 | 0.8730 |
| Seam rank among all 200 consecutive pairs (1 = least similar) | 35 |
| Minimum consecutive pair (34 → 35) | 0.8567 |
| Median consecutive pair | 0.8797 |
| Maximum consecutive pair (51 → 52) | 0.9531 |

The structural claim holds: the seam sits inside the distribution rather than at its tail, which is the property that matters. The absolute figures do not match. **Unverified:** which pipeline stage produced 0.965 — the pre-flake render frames, a greyscale or luma-only SSIM, or a different frame count. Verified by re-running `scripts/logo-render/logoRender.ts` at the shipped parameters, keeping the raw PNGs, and scoring them before and after `add_flake.py` with the same tool.

Two consequences of the geometry are visible in the numbers and should not be mistaken for defects: the narrowest silhouette is 146 px at frame index 49, and 1132 px at index 99 — indices 49 and 149 are the 88.2° and 268.2° edge-on positions, where the pair 50 → 51 scores 0.9525 simply because most of the frame is empty.

### 4. The metal-flake pass

Flake is built twice: once in the render as surface response, once over the frames as visible sparkle.

In-render, `buildFlakeNormalMap` (`logoRender.ts:79-117`) rasterises 240,000 discs of radius 0.5–1.1 into a 2048² normal map, each with a random tilt of 0.35–0.85, tiled at `repeat.set(0.012, 0.012)` with `anisotropy: 8`. The scatter uses a fixed LCG seeded `20260804` (`:92-95`) so re-renders are byte-identical; a non-deterministic scatter would make every regeneration a visual diff. The material is `clearcoat: 1, clearcoatRoughness: 0.04, metalness: 0.55, roughness: 0.3, iridescence: 0.22` (`:224-229`).

Over the frames, `scripts/logo-render/add_flake.py` adds two layers:

| Layer | Density | Tail exponent | Seed | Strength | Drift |
| --- | --- | --- | --- | --- | --- |
| Coarse | `DENSITY = 0.19` | 0.8 | 20260804 | `STRENGTH = 1.35` | +1.0 |
| Dust | `DUST_DENSITY = 0.34` | 1.6 | 99173 | `DUST_STRENGTH = 0.5` | −0.6 |

Each flake carries its own phase (`add_flake.py:57`), and `twinkle` is `0.2 + 0.8 * sin(pi * (TWINKLE_CYCLES * t + phase))**2` with `TWINKLE_CYCLES = 3`. Three is an integer for the same reason `DRIFT_PIXELS = 24` is a whole number of pixels: both must complete a whole number of cycles across the sequence or frame N stops matching frame 0 and the closed loop is lost to the flake pass after the render had already earned it.

**The green-flake bug.** Sparkle was originally added per channel. On the magenta flames red and blue reach 1.0 first; green is left alone to define the hue, so every firing flake came out green. `add_flake.py:115-135` decomposes each pixel into peak/floor/chroma, moves only value (`FLAKE_LIFT = 0.62`) and desaturates slightly (`FLAKE_WASH = 0.45`), leaving hue untouched. Commit `497b3de` records the result: mean hue shift 0.63°, 99th percentile 12°, nothing landing in the green band. The rule is: brighten along the paint's own hue, never per-channel — per-channel addition on any saturated primary is a hue rotation the moment a channel clips.

**The sheen-synced band.** `SHEEN_ANGLE = 125` matches the CSS sheen gradient's `125deg` (`.css:143`), and `sheen_response` centres the band at `(1 - cos(2*pi*t)) / 2`, the same 0 → 1 → 0 cycle as the 6.66 s CSS sweep. `SHEEN_GAIN = 3.6`, `SHEEN_WIDTH = 0.19`, `SHEEN_FLOOR = 0.05`. The floor was 0.22 until `f06cea4`: at 0.22 the whole logo sparkled constantly and the travelling light had nothing left to reveal. The band's axis is normalised over the logo's own alpha extent (`build_sweep_axis`, sampled from every tenth frame at alpha > 24), not the frame — commit `9fc5ce5` measured the peak sitting in bins 3–6 of 10 when normalised to the frame, versus sweeping 9 → 1 → 3 → 6 → 0 → 9 end-to-end once scaled to the artwork. The matching in-render light is `positionSheen` (`logoRender.ts:150-161`), travelling x −1500 → 1500 and y 900 → −900 at z 820, intensity `1.8 * exp(-((travel - 0.5)**2) / 0.045)`.

Flake fires only where light already falls: `lit = clip(luma * LIGHT_BIAS, 0, 1) ** 1.4` with `LIGHT_BIAS = 1.9` and Rec. 709 luma coefficients, then masked by the frame's own alpha (`:102-113`). Without that mask the shadowed side of the flames sparkles as brightly as the lit side, which reads as an overlay rather than a surface.

**Past failure: the sliding flake.** Commit `4d7913c` records that flake read as an overlay sliding across the logo, worst as the back face came round. Root cause: the brand ramp was mapped through UVs, which meant overwriting the geometry's own UVs with a constant `v`. The flake normal map then sampled a single row of its texture and smeared into vertical streaks that could not follow the surface. The fix bakes the ramp into vertex colours (`logoRender.ts:272-321`), leaving UVs free so the flake is a real facet in UV space. The lesson generalises: never repurpose a mesh's UV channel for colour when a normal map is sampling the same channel.

Two further colour rules, both with recorded causes. Tone mapping is `NoToneMapping` (`:30`) because ACES pulls saturation out of strong primaries and turned the brand pink and blue into pastels. Shading is multiplicative — no emissive, `AmbientLight` at 0.07, `envMapIntensity: 0.55` (`:125`, `:222`) — because ambient, IBL, specular and emissive all *add* white, which lifts the zeroed channel of a saturated primary. `2f5f75e` measured saturation landing at 0.85/0.87/0.80/0.87 against the brand ramp's 1.00/1.00/0.85/0.93.

### 5. The glitter background

The glitter was three background layers on one element, moved with `background-position`. That property cannot be composited, so Chrome repainted the full-screen layer every frame and pushed it back through two multiplies, an overlay, a color-dodge and a brightness/contrast filter. Commit `fbd550f` records it as the most expensive thing on the landing page, with cost scaling with viewport pixels — worse on a large display, not better.

Each moving layer is now its own child animated with a transform (`.tsx:392-397`). The stack must stay identical, and the mapping is exact: DOM order bottom-to-top matches the old `background-image` order top-to-bottom, and each child's `mix-blend-mode` matches its old `background-blend-mode` entry, with the container retaining `mix-blend-mode: color-dodge` and `filter: brightness(2) contrast(0.8)` (`.css:89-96`).

| Child | Geometry | Blend | Animation |
| --- | --- | --- | --- |
| `__glitter-sweep` | `top: -50%; width: 200%; height: 200%`, `linear-gradient(120deg, black 18%, white, black 82%)` | `overlay` | `launch-login-glitter-sweep 6.66s ease infinite` |
| `__glitter-grain--drift` | `inset: -2px`, `background-size: 80% 80%` | `multiply` | `launch-login-glitter-grain-drift 6.66s` |
| `__glitter-grain` | `inset: -2px`, `background-size: 100% 100%` | `multiply` | none |
| `__glitter-sheen` | `top: -50%; width: 200%; height: 200%`, `linear-gradient(125deg, …)`, `opacity: 0.6` | `hard-light` | `launch-login-glitter-sweep 6.66s` |

**The equivalence requirement.** The sweep child is twice the container width, so translating it `-50%` of itself covers exactly one container width — what `background-position: 0% → 100%` covered at `background-size: 200%`. The first attempt at this failed: commit `fbd550f` records sizing the gradient children `200% × 100%`, when the originals were `background-size: 200% 200%`. On a gradient running at `120deg` the height sets the band's angle and spacing on screen just as much as the width, so halving the height changed the look. Both dimensions must be 200%. The regression was caught only because the old and new versions were rebuilt side by side with both animations pinned to the same position and flipped between — not by inspection.

The grain pair are inset by 2 px so the ±1 px drift travel cannot expose an edge (`.css:132-136`); the two beating against each other is what makes the grain shimmer. `LaunchLoginMapTeaser.test.tsx:27-32` pins the child structure so a future refactor cannot quietly reintroduce an uncompositable property.

One dead rule remains: `@keyframes launch-login-glitter-sheen` (`.css:215-222`) still animates `background-position` and is referenced by nothing. It is harmless but is exactly the pattern the refactor removed, and should be deleted rather than left as a template.

### 6. Framing

| Property | Value | Source |
| --- | --- | --- |
| `top` | `var(--cruush-logo-clearance, max(50px, env(safe-area-inset-top)))` | `.css:31` |
| `width` / `height` | `var(--cruush-logo-band, 30dvh)` — square | `.css:41-42` |
| `object-fit` | `contain` | `.css:44` |
| `z-index` | `6` | `.css:33` |
| `mix-blend-mode` | `normal` | `.css:51` |
| `filter` | `saturate(1.46) contrast(1.16) brightness(0.92)` | `.css:52` |

`contain`, not `cover`, because the asset has alpha. Under `cover` a crop against the frame edge produces no letterbox and no visible seam — the artwork simply ends, and nothing on screen indicates that it was cut. The failure is silent, which is why it survived two rounds (`4d7913c`: "which is the failure mode this went through twice"). A square source in a square box under `contain` fits exactly, so the band the shell reserves is the logo's real size.

`mix-blend-mode: normal` is load-bearing. The clip has a real alpha channel, so ordinary compositing is already correct; `screen` let every bright glitter speck behind the logo punch through the paint, reading as glitter on top of the artwork wherever it was not white (`.css:47-50`).

Measured logo extent, union across all 200 frames of the shipped desktop asset:

| Threshold | Bounding box (l,t,r,b) | Width | Height | Top slack | Bottom slack |
| --- | --- | --- | --- | --- | --- |
| alpha > 24 | 28, 0, 1172, 1190 | 95.33% | 99.17% | 0 px | 10 px (0.833%) |
| alpha > 128 | 28, 0, 1172, 1189 | 95.33% | 99.08% | 0 px | 11 px (0.917%) |

The 0.917% at alpha > 128 is the source of `Auth.css:101`'s `--cruush-logo-band * 0.0092` correction, which removes the asset's bottom slack from the 30 px tagline gap. Left and right slack are symmetric at 28 px each.

The percentages quoted in `logoRender.ts:337-339` — 36% wide / 67% tall on desktop, 60% / 35% on portrait — are from the superseded `object-fit: cover` era. They are stale in the current file and will mislead anyone re-rendering. The live target is `4d7913c`'s square, tightly framed asset. **Rule:** a re-render must reproduce ≈95% × 99% of a square frame, horizontally centred, or the band the shell reserves stops matching the logo.

`.css:31`'s fallback of `max(50px, …)` disagrees with `Auth.css:22`'s authored `max(30px, …)`. It applies only when `--cruush-logo-clearance` is unset — i.e. when the teaser renders outside the auth shell, such as a dev preview route — where it silently drops the logo 20 px lower than production.

### 7. The butterflies

`CodePenButterflyField` (`.tsx:92-334`) renders nine sprites into an orthographic three.js scene (three 0.160.1).

| Constant | Value | Line |
| --- | --- | --- |
| `CODEPEN_BUTTERFLY_TEXTURE` | `/teasers/codepen-butterfly-tex.png` | `:14` |
| `CODEPEN_BUTTERFLY_SIZE` | 150 | `:17` |
| `CODEPEN_BUTTERFLY_COUNT` | 9 (5 at ≤640 px: `ceil(9/2)`) | `:18`, `:135-137` |
| Camera extents | 640 × 480, position `(250, 500, 1000)` | `:19-20`, `:141` |
| Pixel ratio cap | `min(devicePixelRatio, isSmallScreen ? 1 : 2)` | `:140` |
| Geometry | `PlaneGeometry(150, 75, 24, 12)`, rotated −45° on x | `:168-186` |
| Speed | `3.8 + (index % 3) * 0.72`, z recycles past −900 to +900 | `:163`, `:192-194` |

Wing flap is vertex-shader only (`:36-42`): `cos(flapTime) * position.x` for the fold and `sin(flapTime) * abs(position.x)` for the out-of-plane lift, phase-offset per sprite by `index * 2.0`.

**The texture is a hard dependency with a soft fallback.** Commit `67db33b` deleted `codepen-butterfly-tex.png`; `514602a` restored it. In the interim the `TextureLoader` error callback (`.tsx:295-312`) drew the procedural stand-in: a 64×64 canvas with two white ellipses at (20, 24) and (44, 24), radii 16 × 22, rotated −0.2 and +0.2 rad. The field kept animating, so no error appeared anywhere; the butterflies simply rendered as faint white blobs. The fallback is correct behaviour — it must never be treated as evidence the texture is present.

**The WebGL guard** is a `try`/`catch` around the `WebGLRenderer` constructor (`.tsx:118-126`) returning `undefined`. Disabled hardware acceleration, a blocked context, or jsdom must never take the login screen down; the butterflies are decoration.

### 8. Edge cases

| Trigger | Symptom | Correct handling |
| --- | --- | --- |
| `prefers-reduced-motion: reduce` at mount | A logo spinning on a loop is exactly the motion the setting exists to stop | `getTeaserVideoSource` returns `null` (`.tsx:81-83`); the effect sets `''` and `isVideoReady` false (`.tsx:357-361`); the butterfly effect returns early (`:107-109`); CSS forces `animation: none !important` on every descendant (`.css:290-295`). Pinned by test `.test.tsx:78-92` |
| Reduced motion toggled while mounted | Video would otherwise keep playing | `change` listener on the media query re-runs `updateVideoSource` (`.tsx:368`). Regression on record: retiring the mobile recording left this branch unconditional, which put the video back on for everyone (`.tsx:353-356`) |
| No WebGL | Constructor throws | Caught; effect returns `undefined`; canvas stays blank and transparent. No console error, no unmount |
| Missing butterfly texture | 404 on the PNG | Error callback builds the two-ellipse `CanvasTexture`. Plain white blobs, no wing detail — visually degraded, never broken |
| Tab hidden | `requestAnimationFrame` stops; `THREE.Clock.getDelta()` accumulates nothing while paused, so no time jump on return. The `<video>` is paused by the browser | No handler exists and none is needed. Adding a `visibilitychange` pause would be redundant; adding a manual clock reset would introduce the jump that currently cannot happen |
| Video decode failure | `onError` sets `isVideoReady` false | `videoSource` stays set, so the `<video>` element remains mounted and the ambient fallback does **not** appear (`.tsx:398-417`). The screen shows the container's own `#08080b` plate. Acceptable, but note the asymmetry: only reduced motion swaps in the fallback element |
| Stale service-worker cache | `public/sw.js` serves cache-first for every same-origin GET outside `/api/` and `/media/` (`sw.js:139-142`), which includes `/teasers/*` | A re-rendered `.webm` at the same path is served from the old cache indefinitely. Invalidation happens only on `activate` when `CACHE_NAME` changes (`sw.js:29-35`). **Any asset re-render must bump `CACHE_NAME`.** Note `public/sw.js:1` is currently `cruush-app-shell-v6` while `src/serviceWorkerUpdate.test.ts:12` asserts `cruush-app-shell-v20` — the two disagree on this branch |
| High-DPR display | A 3-DPR phone would allocate 9× the fragments for the butterfly canvas | Capped at 1 on ≤640 px and 2 elsewhere (`.tsx:140`). The video is unaffected — it decodes at its own 1200×1200 regardless of DPR |
| Teaser rendered outside the auth shell | `--cruush-logo-band` and `--cruush-logo-clearance` are undefined | Falls back to `30dvh` and `max(50px, …)`. The 50 px disagrees with the shell's authored 30 px; the logo sits 20 px low |
| Reduced motion, fallback styling | `.css:62` is a compound selector (`--video-ready` and `__ambient-fallback` on the *same* element) | It never matches — the modifier is on the parent. The fallback div is fully transparent and the visible background is the container's radial stack at `.css:6-13`. The current appearance is acceptable; the rule is dead code and should be either fixed to a descendant selector or removed |

### 9. Outstanding: the source clip is clipped at the top

Measured across all 200 frames of the shipped desktop asset:

| Metric | Value |
| --- | --- |
| Frames with artwork on row 0 (alpha > 24) | **164 of 200** |
| Frames clean at row 0 | 36 — files 1–6 and 195–200, i.e. only those nearest rotation 0 |
| Widest row-0 run | 122 px (file 150), of which 120 px at alpha > 200, max alpha 255 |
| Files 49–52 and 148–152 | ~121 px run each, flat across rows 0–8 |
| Top slack at every threshold tested (0, 8, 24, 64, 128) | **0 px** |

The taper is diagnostic. File 11 (index 10, 16.2°) has row-0..9 run widths of `[2, 4, 5, 7, 8, 11, 12, 14, 15, 16]` — the exact `2, 4, 5, 7px…` sequence quoted at `docs/plans/cruush-spec.md:778`. The run narrows toward row 0 but never reaches zero, so the flame's apex lies above the frame. Near the edge-on positions the profile is instead a flat 121 px slab for at least nine rows, meaning a substantial vertical section of the extruded side face is missing, not a tip.

The consequence is a contradiction in the layout contract. `cruush-spec.md:713` defines `--cruush-logo-clearance` as "top of window to highest flame tip"; on 82% of frames the highest flame tip is not in the asset. `object-fit: contain` guarantees the *frame* is never cut, and it does that correctly — but the artwork was already cut before the frame reached CSS. As `cruush-spec.md:779` puts it, no CSS can honour "never cut off" against an asset that is already cut. This is also why `Auth.css:101` has a bottom-slack correction of 0.0092 and no top counterpart: top slack is exactly zero, so there is nothing to give back.

The lever is `logoRender.ts:340`, `const margin = Number(params.get('margin') ?? 1.04)`, applied to `Math.max(fitForHeight, fitForWidth)` (`:341`). The camera is fitted to the *static* SVG bounds, so it makes no allowance for the silhouette growing under perspective as parts of the mesh rotate toward the camera — which is precisely what happens at the edge-on angles where the clipping is worst.

**Unverified:** the margin value that clears every frame. Verified by re-rendering with increasing `margin`, decoding all frames to RGBA, and asserting that the maximum alpha on row 0 is 0 across the whole sequence — the same check that produced the table above. Until that assertion passes, "never cut off" is a property of the CSS only, not of the screen, and `cruush-spec.md:782` is right that this is an hours-scale re-render rather than a tweak. The re-render should be folded together with any further flake work, since both require the same capture-and-encode cycle and each pass costs a full 200-frame round trip.


---

# Part VIII — Navigation chrome, onboarding, and application logic

### 1. Top chrome on the map

The map header is one `pointer-events-none` band at `MapHome.tsx:1550-1552` (`absolute inset-x-0 top-0 z-40 px-2 pb-10 pt-2 sm:px-3 sm:pt-3`, `data-testid="map-top-chrome"`). The right-hand control rail is a separate element at `MapHome.tsx:1932-1935`: `pointer-events-auto absolute right-3 top-[4.5rem] z-30 flex flex-col items-end gap-2 sm:right-4 sm:top-[4.75rem]`.

Its children in order are the crowd-active badge (`MapHome.tsx:1936-1949`, rendered only when `activeCrowdNotice` is truthy — `MapHome.tsx:977`), then SEEKING/MUTUALS (`MapHome.tsx:1951-1962`) and VISIBILITY (`MapHome.tsx:1964-1979`), both `h-8 rounded-full ... px-4 text-[11px] uppercase tracking-[0.18em]`.

| Rule | Failure it prevents |
|---|---|
| The rail's top offset and the gap between all three controls come from two custom properties (proposed `--map-rail-top`, `--map-rail-gap`), never from literal Tailwind values repeated per child. | Today the badge is conditional. When a crowd mode is active it is inserted above SEEKING, so SEEKING and VISIBILITY jump down by badge height plus one gap the moment a crowd is enabled — the two buttons visibly move under the user's finger. |
| The badge is flush to the top of the rail: `--map-rail-top` positions the badge, and its slot is reserved (`min-height` on the rail's first row) whether or not the badge renders. | Without a reserved slot, "flush to top" is only true half the time and the layout shifts on every visibility save. |
| The gap between badge→SEEKING and SEEKING→VISIBILITY must be the same computed value, asserted once. | Three hardcoded numbers drift independently across responsive breakpoints; the desktop rail ends up with a 0.5rem gap and the mobile rail 0.375rem. |

`MapHome.test.tsx:820` currently asserts the literal strings `'right-3', 'top-[4.5rem]', 'sm:right-4', 'sm:top-[4.75rem]'`. That test is the measuring test the spec replaces: it pins the hardcoded values in place and will fail the moment the token lands. Rewrite it to assert the token is present on the rail and that the two inter-control gaps resolve equal, rather than re-encoding pixel strings.

**Size increase.** No value was given. Proposal, expressed as one step so it can be adjusted in a single place: raise the pill height from `h-8` (2rem) to `2.25rem`, label from `text-[11px]` to `text-[12px]`, horizontal padding from `px-4` to `px-[1.15rem]`, and the badge from `h-8`/`text-[11px]` to match. That is roughly +12.5%. Show it before adjusting; do not apply the increase to the `size-8 sm:size-9` icon buttons in `map-top-actions` (`MapHome.tsx:1599`, `1611`, `1623`, `1633`, `1648`), because those are already at the edge of the header bar's `p-0.5 sm:p-1` padding at `MapHome.tsx:1580` and enlarging them pushes the bar past the logo column.

**Corner logo.** The map corner mark is not a video: it is `cruush-logo.svg` masked into glass (`MapHome.tsx:1557-1570`, `logoGlassMaskStyle` at `MapHome.tsx:65-66`, styling at `theme.css:1218-1265`). The spinning-video logo is the landing teaser, `/teasers/cruush-logo-login-alpha-desktop.webm` and `cruush-logo-login-alpha-mobile.webm` (`LaunchLoginMapTeaser.tsx:13`). Unverified: which of the two the removal request targets. Screenshot both surfaces before and after removal and decide from the screenshots; do not delete either asset in the same change, so reinstating is a one-line revert.

**Bug button.** It is portalled into the header via the slot at `MapHome.tsx:1652-1656` (`registerBugButtonSlot`, `src/app/lib/bugButtonSlot.ts`), so on the map it is a sibling of the other header controls and cannot overlap them. Off the map it falls back to fixed placement computed in `AlphaBugButton.tsx:43-49`, whose comment records the three overlays it must clear: the header row (`top-0`, z-40), the zoom/locate stack, and the Recently Active panel. It must take the app's glass — currently it is `bg-background/88 ... backdrop-blur-md` (`AlphaBugButton.tsx:252`), not a `cruush-glass-*` class. Failure prevented: a hand-rolled blur diverges from the dock material the moment the glass tokens change, and the button reads as a different app.

### 2. Bottom dock and switcher bubble

The dock is `.cruush-liquid-glass-dock` (`BottomNav.tsx:84`, styles `theme.css:683-715`). The moving bubble is `.cruush-bottom-nav-indicator-surface .cruush-liquid-glass-current` (`BottomNav.tsx:91`, styles `theme.css:759-794`).

They share the material deliberately: `--cruush-glass-current-bg: var(--cruush-glass-frost)` at `theme.css:498`, with the comment recording the cause — "A brighter fill here read as frosted plastic against clear glass." Backdrops are `url("#cruush-liquid-glass-dock")` and `url("#cruush-liquid-glass-bubble")`, both `brightness(1.12) saturate(0.9)` (`theme.css:526-527`).

**Nested-glass rule.** A backdrop filter on a child re-samples what the parent already filtered, so blur and brightness compound. The inner surface therefore takes a lighter treatment or none. Two enforced instances: `theme.css:535-539` strips `backdrop-filter` from the Activity header's count tiles ("A second full-strength pane inside the first read as a stack of dark boxes"), and `theme.css:788-794` sets the bubble's `::after` to `background: none; opacity: 0` ("the white radial + dark scrim that used to live here made the switcher look frosted while the dock around it stayed clear glass"). The active tab itself is fully neutralised at `theme.css:717-723` (`background: transparent; box-shadow: none; backdrop-filter: none`) so only the bubble carries material.

**Lens over lists.** The dock's backdrop is an SVG displacement lens, not a blur. Displacement bends whatever is behind it. Over map tiles the source is low-frequency colour, so the bend is invisible. Over a scrolling list the source is high-contrast glyph edges, so the same displacement folds letterforms at the lens rim and the text under the dock edge appears to buckle as it scrolls. This is why `theme.css:512-518` swaps every off-map glass token to `--cruush-glass-plate-backdrop` while leaving the dock on the lens (`theme.css:523-527`): "over flat panels and lists it only warps text and edges."

### 3. Portalled surfaces

Radix sheets, dialogs, popovers, dropdowns and selects render at the document root and position themselves. **Never set `position` on a portalled `data-slot` surface.** The guard at `theme.css:834-867` must be preserved verbatim; its `:not(...)` list is the load-bearing part:

```css
):not(.fixed, .absolute, .sticky, [data-slot="sheet-content"], [data-slot="dialog-content"], [data-slot="drawer-content"], [data-slot="popover-content"], [data-slot="select-content"], [data-slot="dropdown-menu-content"], [data-slot="dropdown-menu-sub-content"]) {
  /* Never re-position an element that already positions itself.
     This block is unlayered, and unlayered declarations beat every cascade
     layer — including Tailwind's utilities — so `position: relative` here was
     overriding `.fixed` on every Radix sheet, dialog, popover and dropdown.
     Those surfaces then laid out in normal flow, landed below the fold, and
     left their full-screen overlay on top of the app: SEEKING, VISIBILITY, DL
     mode and feed settings all "did nothing" because an invisible overlay was
     eating the clicks. Only give a stacking context to surfaces that have not
     asked for one. */
  position: relative;
  isolation: isolate;
}
```

Root cause of the past failure, recorded rather than merely fixed: `theme.css` is unlayered, and unlayered declarations outrank every `@layer`, including Tailwind utilities. Portalled surfaces still need a stacking context for the glass to composite; that is supplied separately and without positioning at `theme.css:869-881`, which sets `isolation: isolate` only. The same discipline appears at `theme.css:556-560` and in the `.absolute./.fixed./.sticky.` re-assertion blocks at `theme.css:569-600`.

### 4. Dev preview routes

`DevPreviewRoutes.tsx` exposes an index and one slug route.

| Route | Component | Notes |
|---|---|---|
| `/dev` | `DevPreviewIndex` | Lists every entry in `PREVIEWS` (`DevPreviewRoutes.tsx:51-73`) |
| `/dev/onboarding` | `ProfileOnboarding` | `DevPreviewRoutes.tsx:23-26` |
| `/dev/onboarding-oath` | `ProfileOnboarding` with `needsCodeOfConduct`, `codeOfConductVersion="dev-preview"` | `DevPreviewRoutes.tsx:27-36` |
| `/dev/cruush-plus-offer` | `BetaLaunchCruushPlusOffer` | `DevPreviewRoutes.tsx:37-40` |
| `/dev/install-prompt` | `MobileInstallPrompt` | `DevPreviewRoutes.tsx:41-44` |
| `/dev/dl-mode-notice` | `DlModeDefaultNotice` | `DevPreviewRoutes.tsx:45-48` |

Gating: `renderDevPreviewRoutes()` returns `null` unless `import.meta.env.DEV` (`DevPreviewRoutes.tsx:95-98`). It is called five times in `App.tsx` (lines 245, 262, 289, 316, 351) so previews resolve in every router branch — signed out, unverified, onboarding, code-of-conduct gate, and the full app.

Edge case — **a listed component that does not exist on this branch**. Trigger: an entry in `PREVIEWS` naming a module that was renamed or never merged. Symptom: because the imports are `lazy(() => import(...))` at module scope (`DevPreviewRoutes.tsx:4-7`), the failure is a Vite resolution error at import time, not a route-level 404 — the whole route tree fails to build and every route, not just `/dev/*`, goes blank. Correct handling: the unknown-slug branch at `DevPreviewRoutes.tsx:79-86` only covers a missing key, so add a build-time guard — each preview module must exist on the branch before it is listed, and the dev build must be started once after editing `PREVIEWS`. A stale entry is deleted, never left commented as a string key.

### 5. Onboarding

`ProfileOnboarding` currently paints its own opaque field: `min-h-screen flex flex-col items-center justify-center bg-[#050505] p-4` with a `bg-black/82 backdrop-blur` card (`ProfileOnboarding.tsx:588-592`). The requirement is that the rites render **over the landing background** in glass popups until the user enters the map. Cause and effect: `bg-[#050505]` is opaque, so the landing teaser behind it is not merely dimmed, it is destroyed — the user goes from a moving glass landing to a flat black form in one frame, and the transition reads as a different product.

Correct handling: keep the landing background mounted for the whole onboarding branch (`App.tsx:280-303`), drop the opaque body fill, and give the card a `cruush-glass-panel` surface so it composites against the teaser. `App.tsx` already renders onboarding as `path="*"` inside its own router, so the background must live above `<Routes>`, not inside the step component. Only on `handleOnboardingComplete` does the landing unmount and the map mount.

**Progress bar spec.** Current markup is `flex-1 h-1.5 rounded-full` segments, `bg-primary` when `i <= step` else `bg-white/10` (`ProfileOnboarding.tsx:599-605`), with `Rite {step + 1} of {steps.length}` at `ProfileOnboarding.tsx:613` over nine steps (`PROFILE_STEPS`, `ProfileOnboarding.tsx:46-56`).

| Element | Spec |
|---|---|
| Track | Glass on glass: the bar sits on the glass card, so the track takes no backdrop pass of its own — a translucent rim and fill only (see the nested-glass rule, `theme.css:535-539`). |
| Fill | Red neon blur, built the way the sign-in button's gel is built: an inset pseudo-element carrying `--primary` (`#ff0072`, `theme.css:33`), `filter: blur(...) saturate(2.1) brightness(1.35)`, `opacity: 1`, with `overflow: hidden` on the track so the glow stays inside. Pattern and rationale at `Auth.css:400-421` — "Blur is what kills neon… Keep it tight and let saturate carry the intensity." |
| Shell | Frosted like the sign-in button: `border: 1px solid var(--cruush-glass-border-strong)`, `background: var(--cruush-glass-dock-bg)`, `backdrop-filter: var(--cruush-glass-dock-backdrop)` (`Auth.css:333-360`). |
| Rite marks | The per-step tick marks take the same red as the fill, not `bg-white/10`. |

Failure prevented: using `var(--cruush-gradient)` (`theme.css:15`) instead of flat `--primary` makes the fill drift from pink through violet to blue across nine steps, so the bar changes hue as the user progresses and no longer reads as one indicator.

### 6. Ghost mode — plan-first protocol

**No ghost-mode code is touched until the proposal is approved.** Order of work, strictly:

1. Read `src/app/components/GhostModeSettings.tsx` (260 lines) and locate the rim treatment and the jump animation.
2. Record the existing jump animation and send it before anything else. Verified state: there is no keyframe animation in `GhostModeSettings.tsx` and no `ghost` rule in `theme.css`. The only motion in the component is the Radix switch thumb, `transition-transform` with `data-[state=checked]:translate-x-[calc(100%-2px)]` (`src/app/components/ui/switch.tsx:24-26`). Unverified: whether "the jump animation" refers to a marker animation elsewhere. This would be verified by grepping the ghost pin path in `MapView.tsx` (the ghost halo test id is at `MapView.tsx:1163`) and screenshotting a ghosted pin.
3. Screenshot the current rim. The rims in play are the header `border-b border-border bg-card/80 backdrop-blur-sm` (`GhostModeSettings.tsx:102`), the card `rounded-2xl border border-border bg-card` (`GhostModeSettings.tsx:116`), and the radius block `border border-white/10 bg-white/[0.025]` (`GhostModeSettings.tsx:145`).
4. Propose two or three concrete rim options with values, not adjectives.
5. Only then implement.

The implementation includes removing the grey bubble from the selected state so it appears on hover only. The grey bubble is `bg-white/10 ring-1 ring-white/15`, applied when `privacySettings.ghostModeEnabled` at `MapHome.tsx:1610-1613`; the hover state on the same button is already `hover:bg-white/10` (`MapHome.tsx:1611`). Failure prevented: keeping both means the active ghost button has no hover affordance at all — hover and selected paint identically, so the control looks dead.

### 7. Login bonuses

**Award size is constant: every award is 7 days of cruush+. What escalates is the number of consecutive active days required for the next award.**

Existing machinery, all present: `user_activity_streaks` and `daily_activity_credits` (`rewards-service.ts:645-680`), grant emission (`rewards-service.ts:534-580`), milestone predicate `isLoginBonusMilestone` (`rewards-service.ts:582-586`), next-target lookahead `nextLoginBonusTargetStreak` (`rewards-service.ts:588-601`), and the API surface `GET /api/rewards/streak` (`server/src/routes/rewards.ts:103-106`) returning `{ current, longest, todayQualified, nextRecurringInDays, nextLongBonusInDays, nextLoginBonusAtDays }` (`rewards-service.ts:903-913`).

Two changes are required.

First, the award size. `DEFAULT_REWARD_CONFIG` currently sets `recurringStreakRewardDays: 1` and `longStreakBonusDays: 1` (`reward-config.ts:38-41`). Changing those constants alone will not change production: `loadRewardConfig` overlays rows from `reward_settings` on top of the defaults (`reward-config.ts:113-118`), and migration `server/sql/056_daily_login_bonus_rewards.sql` inserts `long_streak_days = 1` and `long_streak_bonus_days = 1`. A new migration must upsert `recurring_streak_reward_days = 7` and `long_streak_bonus_days = 7`, and `clearRewardConfigCache` must be called or the 60 second `CACHE_TTL_MS` waited out (`reward-config.ts:87`).

Second, the schedule. `isLoginBonusMilestone` is periodic, not escalating — it fires every `longStreakDays` after `recurringStreakDays`. Replace it with an explicit table.

| Award # | Consecutive active days required | Grant |
|---|---|---|
| 1 | 7 | 7 days cruush+ |
| 2 | 14 | 7 days |
| 3 | 30 | 7 days |
| 4 | 60 | 7 days |
| 5 | 90 | 7 days |
| 6 | 150 | 7 days |
| 7 | 240 | 7 days |
| 8 | 365 | 7 days |
| 9+ | every further 180 days | 7 days |

Store the schedule in `reward_settings` as a JSON array so it is tunable without a deploy, and derive `nextLoginBonusAtDays` from the first entry strictly greater than `current_streak`.

**Edge cases.**

| Trigger | Symptom | Correct handling |
|---|---|---|
| Timezone definition of a day | Two users acting at the same instant get different calendar dates. | A day is the user's own IANA zone, read from `app_users.timezone` and normalised by `normalizeTimeZone` (`rewards-service.ts:85-96`), which falls back to `"UTC"` on an unparseable zone. The date is `calendarDateInTimeZone` (`rewards-service.ts:98-109`). |
| Streak break | Gap of two or more calendar days. | `daysBetweenCalendarDates(previousDate, activityDate) === 1` is required to increment; anything else resets `current_streak` to 1 (`rewards-service.ts:658-660`). `longest_streak` is preserved via `Math.max` (`rewards-service.ts:661`). A break never revokes an already-granted 7 days. |
| 23:59 then 00:01 | Two actions ninety seconds apart count as two consecutive days. | Accepted and intended — the day boundary is a calendar boundary, not a 24-hour window. Document it; do not add an elapsed-time guard, because doing so would break the legitimate case of an early riser one day and a night owl the next. |
| Clock skew | `occurredAt` supplied by a client could be far in the future and bank a fake streak. | `recordMeaningfulActivity` defaults to server `new Date()` (`rewards-service.ts:626`). Reject any caller-supplied `occurredAt` more than a few minutes ahead of server time; never trust a client timestamp for streak arithmetic. |
| Retroactive award / replay | A retry or a second qualifying action the same day double-grants. | Two independent locks. `daily_activity_credits` has `on conflict (user_id, activity_date) do nothing` and the function returns `{ credited: false }` when no row is inserted (`rewards-service.ts:632-645`), so at most one credit exists per user per day. Grants additionally carry `idempotencyKey` `activity:long:${userId}:${streak}` (`rewards-service.ts:565`), so replaying the same streak value cannot mint a second grant. Retroactive backfills must reuse the same key. |
| Timezone read asymmetry | `last_activity_date` is re-read with `calendarDateInTimeZone(new Date(state.last_activity_date), "UTC")` (`rewards-service.ts:652-654`) while `activityDate` is computed in the user's zone. | For a user who moves west across the date line, the stored `date` value can render as the previous day in UTC and silently break a valid streak. Store and compare the calendar string directly rather than round-tripping through `Date`. |
| Transaction unavailable | Streak credit is skipped. | `recordMeaningfulActivitySafely` logs a warning and returns `{ credited: false }` without blocking the domain action (`rewards-service.ts:686-712`). A missed credit must never fail a cruush or a message send. |

### 8. Password policy

**At least 8 letters, one number, one special character, enforced in `signUp` on the server.** Client-side validation is decorative: `Auth.tsx:226-230` only checks `password.length < 8`, and any client can post directly to `/api/auth/signup` (`server/src/routes/auth.ts:434`).

Current server state is length-only. `auth-schema.ts:20` is `password: z.string().min(8).max(200)`; the same weak rule appears at `auth-schema.ts:48` (reset) and `auth-schema.ts:53` (change). The fix is a single shared `strongPasswordSchema` applied to all three, so a policy change cannot land on sign-up and miss reset.

| Edge case | Trigger | Symptom | Correct handling |
|---|---|---|---|
| Unicode letters | `Ünïcödé1!` or a non-Latin script | An ASCII `[A-Za-z]` class rejects a legitimate password. | Count letters with `\p{L}` under the `u` flag, digits with `\p{Nd}`. |
| Whitespace as "special" | `password 1` | A space satisfies a naive "not alphanumeric" test, so the policy is bypassed. | Define special as a non-letter, non-digit, non-whitespace character. Trailing/leading whitespace is preserved, not trimmed — trimming silently changes a stored password. |
| Existing accounts below the bar | A user created before the policy signs in. | Forcing the rule at sign-in locks out real users. | Enforce on change only: sign-in keeps `min(1)` (`auth-schema.ts:31`), while `changePasswordPayloadSchema.newPassword` and `resetPasswordPayloadSchema.password` take the strong schema. |
| Reset path | A weak password set via the emailed reset token. | The strongest hole in the policy, because it needs no old password. | `resetPasswordPayloadSchema` (`auth-schema.ts:46-49`) uses the same shared schema; a reset is a change. |

The form carries a live checklist — three rows (8+ letters, 1 number, 1 special) evaluated on every keystroke, each satisfying/unsatisfied. Failure prevented: a single "Password must be at least 8 characters" string after submit (`Auth.tsx:227`) tells the user nothing about the two rules they have not yet met, and they retry blind.

### 9. Content removal

A content-removal form posts to `POST /api/support-requests` and is delivered to **`reports@cruush.app`**, the constant at `server/src/mailer.ts:99` (`REPORTS_INBOX_EMAIL`). It is not `hello@cruush.app`, which is the `WEB_PUSH_SUBJECT` default (`server/src/config.ts:186`) and the reply-to shown in outbound email bodies (`mailer.ts:270-274`).

| Edge case | Current value | Rule |
|---|---|---|
| Attachment size | `contentBase64` capped at 5,000,000 base64 characters (`support-schema.ts:31`), roughly 3.7 MB decoded; filename 1–120 chars. | Reject over-size client-side before upload with the byte figure named, not a generic error — a 413 after a slow mobile upload loses the whole report. |
| File-type allow-list | `contentType: z.enum(["image/jpeg", "image/png", "image/webp"])` (`support-schema.ts:29`). | The allow-list is server-side and closed. The bug button only ever produces `image/jpeg` (`AlphaBugButton.tsx:27`, `124`). Never widen to `image/*`. |
| Rate limiting | 5 per 10 minutes for an authenticated user, 3 per 10 minutes per IP otherwise (`server/src/routes/support.ts:31-36`). | Anonymous submitters must supply `contactEmail` or the request is rejected with `VALIDATION_ERROR` (`support.ts:27-29`). |
| Transport failure | The Resend send is fire-and-forget: `.catch(...)` logs `"support inbox email delivery failed"` and the endpoint still returns 201 (`support.ts:94-96`). | The row is already committed, so the report is not lost — but the user is told "sent" when the email did not go. Add a retry queue over the persisted `support_requests` row, and keep the 201: telling the user their report failed when it is safely stored would make them file it twice. |

### 10. Screenshot restrictions

Only the bug report button may capture the screen. Capture is `captureBugScreenshot` in `AlphaBugButton.tsx:74-132`: it calls `navigator.mediaDevices.getDisplayMedia({ audio: false, video: true })`, waits for metadata with a 5000 ms timeout (`AlphaBugButton.tsx:61`), draws one frame to a canvas scaled to at most 1280 px wide (`AlphaBugButton.tsx:104`), encodes JPEG at quality `0.72` (`AlphaBugButton.tsx:115`), and stops every track in a `finally` block (`AlphaBugButton.tsx:130`). Every failure path returns `undefined`, so the report still sends without an attachment (`AlphaBugButton.tsx:213`).

Rules: no other component may call `getDisplayMedia`, `getUserMedia` for video, or any canvas-of-the-viewport routine; the track-stop in `finally` is mandatory. Failure prevented: a stream left open keeps the browser's screen-sharing indicator lit indefinitely, which on a dating app reads as covert recording.

**The honest limitation.** A web app can only decline to expose capture APIs to itself. It cannot stop the operating system's own screenshot, the browser's screenshot, a screen recorder, or a second phone pointed at the display. `getDisplayMedia` is a user-consented prompt, not a capability the page controls. True device-level blocking requires a native wrapper — `FLAG_SECURE` on Android, a secure-surface overlay on iOS — and is out of scope for the web build. Any product copy that promises screenshots are prevented is false and must not ship.


---

# Part IX — Testing — what the suites assert, and what they cannot

### 37.1 Inventory

The worktree carries **68 front-end spec files** and **63 server spec files**. There is no `e2e/` directory, no Playwright config and no Playwright or Cypress binary in `node_modules/.bin` — the only mention anywhere is an aspiration at `docs/master-architecture.md:1301`. **There is no browser-driven test tier on this branch.** Everything below runs in jsdom.

Reproduce the list with `find src -type f \( -name "*.test.ts" -o -name "*.test.tsx" \) ! -name "._*"`. Distribution: `src/app/components` 42, `src/app/lib` 21, `src/app` 1, `src/test` 2, `src/styles` 1, `src` 1.

The files that bear on this branch's surfaces:

| File | What it guards | How it fails |
| --- | --- | --- |
| `src/app/components/Auth.test.tsx` (527 lines) | Landing grid contract, form order, captcha slot state, measured stack reserve, alpha/beta signup gating, 2FA, referral capture | Reads `src/app/components/Auth.css` from disk at line 8 and substring-matches it. A CSS rename or an equivalent rewrite fails it even when the screen is correct |
| `src/styles/theme.test.ts` (105 lines) | Selection policy, overflow lock, map-shell scroll lock, canvas filter, glass tokens, heart-pin fill rules | Same mechanism against `src/styles/theme.css`. **Currently failing at line 53** — see §37.3 |
| `src/app/components/LiquidGlassFilters.test.tsx` (76 lines) | The five displacement maps: `viewBox`, radius, ramp gradients, block-out `hsl(0 0% 50% / 0.93)`, per-channel `scale`, `stdDeviation` | **Currently failing at line 41** — see §37.3 |
| `src/app/components/LaunchLoginMapTeaser.test.tsx` (117 lines) | Video-first background, the `.webm` src, four glitter sub-layers, absence of the retired scene/brand-mark/frosted-glass nodes, reduced-motion fallback, archived rain pane | Any retired `data-testid` reappearing, or the reduced-motion branch going unconditional (regression #14) |
| `src/app/lib/overlaySlots.smoke.test.ts` (115 lines) | Pairwise overlap of the declared floating overlays on both viewports; the bug reporter outranking map chrome; the registry still matching the components | Reads four component files from disk (lines 84–105) and substring-matches Tailwind position classes |
| `src/app/components/MultiSelect.test.tsx` (216 lines) | Badge row after the trigger in document order; upward flip near the viewport bottom; portalled menu `position: fixed` geometry; no full-screen blocker | The only file that fabricates layout, via `mockTriggerRect` at lines 5–17 |
| `src/app/components/MapView.test.tsx` (1526 lines, 35 cases) | MapLibre wiring, marker theming by `data-marker-theme`, clustering, spiderfying, raster fallback, 3D extrusions, style-URL precedence | Marker theming asserts attributes, not hex — deliberately |
| `src/app/components/HeartPin.test.tsx` (19 lines) | Photo clipped to `HEART_PIN_PHOTO_PATH`, theme border `stroke="#FF0072"`, rim present | Only covers the `nearby` theme; `current` and `mutual` borders are unguarded here |
| `src/app/components/BottomNav.test.tsx` (238 lines, 11 cases) | Five labelled tabs, no scrim on any route, sliding indicator without colour swap, desktop vs mobile profile behaviour | Class-presence assertions; a visually identical rewrite fails |
| `src/app/components/MapHome.test.tsx` | Top chrome classes (`gap-0.5`, `p-0.5` at line 818), logo shell mask, glass control classes | Asserts the spacing *class*, never a measured gap |
| `src/test/releaseSmokeAndE2E.test.tsx` (106 lines) | Five filter IDs present; five nav buttons with `aria-current`; `vite:preloadError` reload; `/billing-policy` excluded from `AUTH_POLICY_LINKS` | Despite the name it is jsdom-only and asserts nothing end-to-end |
| `src/test/featuresSmokeAndE2E.test.tsx` (167 lines, 7 groups) | Renders photo upload, DMs, group chat, feed, report modal, bug reporter, filter panel without throwing | A smoke tier by intent; it proves mounting, not behaviour |
| `src/app/components/AlphaBugButton.test.tsx`, `MobileInstallPrompt.test.tsx` | The components whose classes `overlaySlots.smoke.test.ts` mirrors | Drift between the two is caught only by the smoke file, not by these |
| `src/app/App.test.tsx` (26 cases) | Route gating, lazy-module boundaries, onboarding and code-of-conduct gates | Guards regression #13 (`/dev` routes referencing a component that exists only on `main`) |

The remaining ~54 files cover API clients, settings screens, moderation, notifications and profile flows. None of them touch the landing page, the glass system, the pins or the top nav.

### 37.2 The jsdom ceiling

`vitest.config.ts:17` sets `environment: 'jsdom'`. jsdom implements the DOM but **no layout engine**: `getBoundingClientRect()` returns an all-zero `DOMRect`, `offsetWidth`/`offsetHeight` are `0`, and no stylesheet cascade is resolved against geometry. `src/test/setup.ts` is nine lines and stubs only `ResizeObserver`; nothing patches layout. The proof is in the suite itself — `MultiSelect.test.tsx:5` has to `vi.spyOn(button, 'getBoundingClientRect').mockReturnValue(...)` before any positioning logic can be exercised at all.

| Catchable in jsdom | Verified by | Not catchable | Why |
| --- | --- | --- | --- |
| Document order and containment | `Auth.test.tsx:134-139`, `MultiSelect.test.tsx:54` | Overlap between two rendered elements | Both rects are `0,0,0,0`, so every pair either always or never intersects |
| Class and attribute presence | `BottomNav.test.tsx`, `MapView.test.tsx` | Rendered size, gaps, clearance | No box model |
| CSS **source text** | `theme.test.ts`, `Auth.test.tsx:8` | Which rule wins the cascade | jsdom applies no author-origin cascade layering to computed style |
| Inline `style` values on portalled nodes | `MultiSelect.test.tsx:154-165` | Whether a `backdrop-filter` executes | No compositor, no paint |
| State transitions and handler calls | `Auth.test.tsx:459-495` | Colour, hue, saturation | Nothing is rasterised |
| Declared geometry in a hand-maintained registry | `overlaySlots.smoke.test.ts` | Actual geometry | The registry is a model of the components, not a reading of them |

The registry approach in `src/app/lib/overlaySlots.ts` is the one honest workaround: `MOBILE_VIEWPORT = { width: 23.4375, height: 50.75 }` and `DESKTOP_VIEWPORT = { width: 80, height: 50 }` (lines 44–45) are rem, i.e. 375×812 and 1280×800 at a 16px root. It computes overlap arithmetically from declared boxes, then guards the model against the components by grepping their Tailwind classes (lines 84–105). It catches drift; it cannot catch a component whose real box differs from its declaration for any reason other than those four class strings.

### 37.3 Two recorded failures of judgement

**(a) The passing test over a broken screen.** `Auth.test.tsx:115` asserts `password → captcha → sign in → sign up → forgot` by `compareDocumentPosition`, plus containment in `.launch-login-auth-form` and absence from the footer. Every one of those assertions passed while the buttons visibly sat too low. The order was never wrong. The defect was that the captcha slot held **65px** open while empty, inserting a band between the password field and the button — recorded as regression #3 at `docs/plans/cruush-spec.md:1076`, and measured at Appendix C: *password to sign-in button 24px, was 89px with the empty captcha slot*. Root cause: an order assertion is blind to the size of anything between the ordered elements, and in jsdom no assertion can see size. The fix is at `Auth.css:362-372` (`min-height: 0` on the base rule, with the comment recording why) and `Auth.css:377-380` (`min-height: var(--cruush-captcha-slot, 65px)` only under `[data-captcha-state='active']`). The test was then extended at `Auth.test.tsx:148-153` to assert the *state machine* — `data-captcha-state="reserved"` on first paint, `min-height: 0` in the base rule, an `active` rule existing — which is the observable consequence of the collapse, not its rendered height.

**(b) Tests that assert literal CSS source text.** Both current failures are this class of defect, and both fail against code that is correct by intent:

| Failure | Test asserts | Source now says | Cause |
| --- | --- | --- | --- |
| `theme.test.ts:53` | `--cruush-glass-backdrop: url("#cruush-liquid-glass-dock") brightness(1.12) saturate(0.9);` | `theme.css:514` — `--cruush-glass-backdrop: var(--cruush-glass-plate-backdrop);` | Off-map surfaces were deliberately moved to the dark plate because the lens only warped text over flat panels. The dock kept the lens at `theme.css:526`. The *contract* — dock lenses, everything else plates — holds; the literal is gone. The same file asserts both spellings, at lines 51 and 53 |
| `LiquidGlassFilters.test.tsx:41` | `#…-greenchannel` has `scale="-170"`, from a comment claiming "offsets from the reference base config: r 0, g 10, b 20" | `-180`, because `LiquidGlassFilters.tsx:139-149` sets `greenOffset: 0` and `blueOffset: 0` with the note "Do not reintroduce non-zero offsets" | The pen's chromatic split was deliberately dropped. The test encodes the reference pen; the source encodes the decision to depart from it |

Commit `9d12bbd` — "Align the glass token test with the switcher grade it ships" — is this pattern being paid for a third time.

**Rule: assert the contract, not the declaration.** A contract is a statement that stays true across any correct implementation; a declaration is one way of achieving it. Concretely:

| Contract (assert this) | Declaration (do not) |
| --- | --- |
| `grid-template-rows: var(--cruush-logo-band) minmax(0, 1fr) auto;` — three rows, card takes the slack, footer intrinsic | `place-items: center` — already rejected at `Auth.test.tsx:90-91` |
| `--cruush-auth-stack-reserve` resolves through `var(--cruush-auth-stack-measured, …)` and is never a bare number (`Auth.test.tsx:162-163`) | The fallback constant itself — four different ones exist: `Auth.css:34` `21.4rem`, `:66` `26.2rem`, `:900` `22.2rem`, `:905` `26.8rem` |
| `data-marker-theme="mutual"` on the pin (`MapView.test.tsx:807`) | The hex `#6f00ff` inside the gradient stop list |
| The base captcha rule has `min-height: 0` and an `active` rule exists | `min-height: var(--cruush-captcha-slot, 65px)` as a standalone substring — `Auth.test.tsx:524` matches it today only because it appears inside the `active` rule, so the assertion now passes for the opposite of what it was written to check |

The failure this prevents: a suite that turns red on correct refactors and, worse, green on incorrect ones — which is what `Auth.test.tsx:524` currently is.

### 37.4 The glass overlay regression test

**Unverified: `glassOverlayRegression.test.ts` does not exist.** `grep -rn "glassOverlay\|glass-overlay\|GlassOverlay"` across the worktree returns exactly one hit — the prose reference at `docs/plans/cruush-spec.md:558`. Nothing in `src/` matches. It is described in §12.6 as existing; it does not. What would verify: `find src -name "glassOverlayRegression*"` returning a path.

The defect it is meant to encode is regression #1 at `docs/plans/cruush-spec.md:1076`: an **unlayered** `position: relative` in `theme.css` beat Tailwind's cascade layer — unlayered author rules outrank any `@layer` regardless of specificity, and `theme.css` declares only `@layer base` at line 144 — so it overrode `.fixed` on portalled Radix surfaces. Radix renders sheets, dialogs, popovers, dropdowns and selects into a portal at the document root, so a statically-positioned surface laid out **below the fold** at the end of `<body>` while its full-viewport overlay stayed put, invisible and click-eating. Symptom: SEEKING, VISIBILITY, DL mode and feed settings all appeared dead.

What the test must parse and assert, to be equivalent to the guard it replaces:

1. Read `src/styles/theme.css` as text.
2. Extract every rule whose selector matches a portalled surface — `[data-slot]` variants for `sheet-content`, `dialog-content`, `popover-content`, `dropdown-menu-content`, `select-content`.
3. Assert none of those rules declares `position` at any value, and none declares `inset`, `top`, `left`, `right` or `bottom`. The failure it prevents: a control that is present, focusable and event-bound in every DOM assertion, and unreachable on screen.
4. Assert the same for any rule outside `@layer`, since an unlayered rule is what beat the utility in the first place.

Note the ceiling: jsdom cannot confirm the surface actually paints in the viewport. The test can only prove the cause is absent, not the effect present.

### 37.5 Required assertions for the outstanding work

A checklist a future session can execute. Sources: `docs/plans/cruush-spec.md:942-953` and Parts V–VI.

| # | Area | Assertion | Failure it prevents |
| --- | --- | --- | --- |
| 1 | Landing layout | `grid-template-rows: var(--cruush-logo-band) minmax(0, 1fr) auto`; `--cruush-logo-clearance` matches `max(30px, env(safe-area-inset-top))`; `--cruush-logo-gap: 30px`; card margin derived from the gap; `--cruush-logo-band` is a `min()` of width-minus-padding and leftover height; `height: 100dvh` with `overflow: hidden`; footer `align-self: end` | Regression #2 — a constant reserve tuned on sign-in let sign-up's third field push the stack through the footer |
| 2 | Measured reserve | `--cruush-auth-stack-reserve` always reads `var(--cruush-auth-stack-measured, …)` and never a bare literal; the `ResizeObserver` publishes it | The same overflow returning by hardcoding |
| 3 | Button order | `password → captcha → sign in → sign up → forgot`, all five inside `.launch-login-auth-form`, none inside `launch-login-auth-footer` | Capsules rendering after the form and landing beside the footer |
| 4 | Slot collapse | Base rule carries `min-height: 0`; the 65px applies only under `[data-captcha-state='active']`; state flips `reserved → active` on first keystroke and the elements below do not move | Regression #3, the 65px empty band |
| 5 | Pin colours | Border and gradient stops per theme: `current` `#0BA8FF` / `#00B8FF → #0A7DF4 → #3236D4`; `mutual` `#6f00ff` / `#A64DFF → #6f00ff → #3B00A8`; `nearby` `#FF0072` / `#FF0072 → #DA045D → #B40849`; photoless fallback gradient present | Relationship state misread at a glance |
| 6 | No filter on artwork | The `<svg>` and `.cruush-heart-glass-base` carry no `filter`, and no ancestor inside `.cruush-heart-pin-shell` establishes a backdrop the artwork sits inside | Regressions #5 and #9 — ring at `z-index: 1` put the pin's own artwork in its backdrop |
| 7 | Top nav gap equality | One spacing token, not three literals; the measured gap between crowd badge → Seeking equals Seeking → Visibility. **This is a browser assertion, not a jsdom one** | Three hardcoded values drifting |
| 8 | Portalled-surface position guard | §37.4 above | Regression #1 |
| 9 | Teaser reduced motion | With `matchMedia('(prefers-reduced-motion: reduce)')` matching, `launch-login-teaser-video` is absent and `launch-login-ambient-fallback` is present; the guards at `LaunchLoginMapTeaser.tsx:77` and `:345` survive | Regression #14 — retiring the mobile recording left the branch unconditional |

### 37.6 What only a real browser can verify

Per `docs/plans/cruush-spec.md:179-206`:

- **Geometry.** Measure with `getBoundingClientRect` in the page, and report the numbers — `gap: 24px`, `overlap: none`, `offset from centre: 0px`. Measure in **every relevant state**, because each is a different layout: sign-in vs sign-up (third field), captcha empty vs occupied, error banner shown vs not, pin resting vs hover-scaled. A hover-scaled heart is 80px scaled from centre, so `scale(1.5)` lifts the top edge 20px and `scale(1.1)` lifts it 4px — a resting measurement says nothing about the hovered one.
- **Rendering of a filter.** Screenshot. A computed style can name `url(#cruush-liquid-glass-dock)` correctly and the filter still not execute — `backdrop-filter: url(…)` is Chrome-only and outside the CSS spec. When it does not appear, isolate by applying the same filter as `filter` rather than `backdrop-filter` to determine whether the effect or its application is at fault.
- **Colour.** Hue cannot be sampled programmatically from a screenshot. Do not claim a colour is fixed. Remove the cause by construction and say so: `saturate()` at or below 1 cannot amplify a warm backdrop, which is why `theme.css:526` ships `saturate(0.9)` and `theme.test.ts:36-37` asserts `grayscale(1)` and `saturate(0.08)` are absent from the canvas filter.

### 37.7 Running the suites

| Command | Config | Scope |
| --- | --- | --- |
| `pnpm test` | `vitest.config.ts` | All 68 front-end specs. Excludes `**/node_modules/**`, `**/dist/**`, `server/**` |
| `pnpm test:smoke` | `vitest.smoke.config.ts` | `**/*.smoke.test.{ts,tsx}` — front-end membership is currently one file, `src/app/lib/overlaySlots.smoke.test.ts`. Budget: under ~30 seconds |
| `pnpm smoke` | both | `pnpm test:smoke && pnpm --dir server test:smoke` — adds `server/src/photo-upload-availability.smoke.test.ts` |
| `pnpm --dir server test` | `server/vitest.config.ts` | All 63 server specs |
| `npx vitest run <path>` | `vitest.config.ts` | Single file. Do **not** pass `--reporter=basic`; vitest 4.1.8 has no such built-in and fails at startup with `Failed to load custom Reporter from basic` |

Two edge cases in the runner itself:

- **Trigger:** the main checkout's `node_modules` is deleted or moved. **Symptom:** every vitest run in this worktree dies at config load, not at test time. **Cause:** `node_modules` here is a symlink to `/Volumes/corrupt/Cruushv2-1/node_modules`, and `vitest.config.ts:7-8` calls `fs.realpathSync` on `node_modules/maplibre-gl` to alias `@maplibre/maplibre-gl-style-spec`. **Handling:** reinstall in the main checkout; do not add a local `node_modules`.
- **Trigger:** a spec is renamed to `*.smoke.test.ts` without checking its runtime. **Symptom:** the fast tier drifts past ~30 seconds and stops being run. **Handling:** membership is by filename with no list to maintain (`vitest.smoke.config.ts:5-8`); move anything slower back to the full suite.

Current state of the branch: **2 files failing, 2 tests failing, 38 passing** across `Auth.test.tsx`, `theme.test.ts`, `LaunchLoginMapTeaser.test.tsx`, `HeartPin.test.tsx`, `LiquidGlassFilters.test.tsx` and `overlaySlots.smoke.test.ts`. Both failures are the §37.3(b) class and neither indicates a defect in the shipped behaviour.

### 37.4 Runtime-integrity checks

These checks are mandatory before a browser screenshot, login claim, visual
comparison, or deployment claim. They belong in the focused smoke path and must
run against the same frontend/API pair being inspected, not against a different
checkout or a separately started server.

| Check | Required assertion | Failure meaning |
| --- | --- | --- |
| API readiness | `/health` is HTTP 200 and JSON; the response is from the expected API process/port | Do not open the visual acceptance loop yet |
| Metadata contract | `/api/meta` is HTTP 200; required keys include `service`, `auth`, `storage`, `alphaTest`, `photoUploads`, and `moderation` | API/config/migration failure; frontend fallback is not a pass |
| Login contract | A seeded test account gets the expected 2xx or an intentional 4xx; no 5xx | Database, rate limiter, auth schema, or environment failure |
| Render integrity | Signed-out bootstrap and auth render complete without uncaught exceptions; all lazy imports resolve | React #130 or a blank/partial shell is a failure |
| Console/network | No uncaught React error and no unexpected `/api/*` 5xx during the tested flow | Screenshot is invalid evidence even if pixels are visible |

The test harness must log the request URL, status, and sanitized error code for
failures, but never credentials, cookies, session tokens, or raw environment
values. A 500 response must retain its server-side stack trace in the API log
and expose only the stable formatted error envelope to the browser.

The focused smoke command must be run after starting the API and frontend from
the same worktree. It must fail fast when the API is absent, when the proxy
targets a different port, or when the frontend is served from a stale process.
Manual DevTools output may supplement this check; it cannot replace it.


---

### 37.8 When to write a test at all

Julien has said both "no fucking tests, just work as fast as you can" and "make a
test so this doesn't happen again", repeatedly, and agents guess wrong in both
directions. They are not in conflict once the axis is clear: he does not want a
broad suite written on the way to a fix, and he does want a guard on anything
that has broken twice.

| Situation | What to do |
| --- | --- |
| Ordinary fix, nothing recurrent | No new test scaffolding. Ship the fix (L1). |
| This exact thing has broken before | One focused regression test ships with the fix. Non-negotiable (L2). |
| Overlap, moderation pipeline, bug-report button | Permanently in the recurrent class. Always gets the regression test. |
| Any change at all | Exercise the real path yourself — log in, click it, upload the photo, screenshot it. This is verification, not testing, and L1 never excuses skipping it (L3, B4). |

"Test it yourself" in a message from Julien always means L3, never L1. It is a
demand for a smoke check performed by the agent, not a request for a suite.

*Numbering note: this part contains two sections labelled §37.4 — the glass
overlay regression test, and the runtime-integrity checks. Left as-is to keep
existing cross-references valid.*

---

# Part X — Branch state, integration, and the regression log

### Branch topology

All landing-page and glass work lives on `feature/landing-page-liquid-glass-antigravity`, checked out at `/Volumes/corrupt/Cruushv2-1.worktrees/landing-page-liquid-glass-antigravity`. Its tip is `9b1c518` ("fix(landing): enforce perfectly equal top and bottom logo padding on all devices", 2026-08-05 03:13:29 -0400).

| Fact | Value |
| --- | --- |
| Branch | `feature/landing-page-liquid-glass-antigravity` |
| HEAD | `9b1c518` |
| Base (merge-base with `main`) | `2213f9b` "Harden asset delivery, drop billing link from auth footer, ignore AppleDouble files", 2026-08-04 03:00:21 -0400 |
| `main` = `origin/main` | `538fa4b` "fix: correct the DL Mode default assertion and skip agent worktrees", 2026-08-05 13:55:57 -0400 |
| Divergence (`git rev-list --left-right --count main...HEAD`) | 43 on `main` only, 102 on the branch only |
| Upstream | none — `git rev-parse @{u}` returns `fatal: no upstream configured`. Nothing on this branch has ever been pushed. |
| Remote | `origin` → `https://github.com/cruush-social/Cruushv2.git` |
| Registered worktrees | 28 |
| Local branches | 111 |

**Re-measured 2026-08-06 07:10. The table above is the state at the time Part X
was written and is kept for the divergence analysis that follows it; these are
the current numbers.**

| Fact | Value now |
| --- | --- |
| `origin/main` | `1a610a0` "Add Stream policy drift check and Rekognition type fix", 2026-08-06 07:08:13 -0400 |
| Local `main` | `410dd02` "test account deletion end to end", 2026-08-05 23:54:36 -0400 — **12 commits behind `origin/main`.** Fetch before reasoning about what is on `main`; the stale local ref is how a merge list goes wrong. |
| Primary checkout `/Volumes/corrupt/Cruushv2-1` | branch `feature/moderation-dashboard-full-access` at `a12e45f` "Fix messages settings and recently active touch crash" |
| Registered worktrees | 46 (was 28) |
| Local branches | 130 (was 111) |

Four commits landed on `origin/main` since Part X was written that change how
work is supposed to happen here, and they are the reason Part 0 exists:

| Commit | What it added |
| --- | --- |
| `6d7f569` | `docs/CRUUSH-RULES.md` — the single standing-rules file for all three agents |
| `750bc70` | The enforcement scripts: `pnpm ship`, `check:layout`, `check:copy`, `docs:worktrees`, `docs:env` |
| `a5a0c23` | `ship` resolves Coolify app UUIDs by name and warns on branch drift |
| `1a610a0` | Stream image-policy drift check |

`docs/CRUUSH-RULES.md`, `docs/repeated-instructions-audit-2026-08-06.md`,
`docs/worktrees.md` and `docs/env-matrix.md` are all on `origin/main`, so any
worktree branched from it already has them. There is no excuse for an agent not
having read the rules.

Seven worktrees are marked `prunable` (all under `/private/tmp/claude-501/…/scratchpad/`); their branches survive, their checkouts do not. Related work already absorbed into this branch — every tip below is an ancestor of `9b1c518`, verified with `git merge-base --is-ancestor`:

| Worktree branch | Tip | Subject |
| --- | --- | --- |
| `agents/landing-page-video-background-glow` | `cf558cb` | Use looping launch teaser video on landing page and add glow to tagline |
| `feature/logo-loop-notchless` (prunable) | `9d12bbd` | Align the glass token test with the switcher grade it ships |
| `agents/svg-backdrop-displacement-filter`, `agents/screen-lock-behavior`, `agents/push-changes-to-main` | `1d71dce` | Boost map contrast for landmass/roads/labels, add tagline strobe |
| `agents/react-error-130-debugging` | `c401144` | reward service |
| `agents/filter-menu-issue-fix` | `6aa48f6` | major ui overhaul |
| `agents/first-login-match-system-popup` | `09d1b33` | Add MatchSystemIntro modal and show it once after onboarding |

Three worktree tips are **not** ancestors and represent live parallel work: `ed7aaaf` (`fix/bug-button-placement`), `6bdfc86` (`feature/bug-report-triage-queue`), `84963cb` (detached, Coolify hardening).

### Commits on `main` not on this branch

`git cherry HEAD main` reports six of the 43 as already applied by equivalent patch, so they must not be cherry-picked again: `5ccc0f3`, `6f3c5f6`, `1f1145d`, `d22f40d`, `654d110`, `ed7aaaf`. Their branch twins are `7a62ebc`, `a07af16`, `74199c0`, `22f8170`, `0eb3d46`, `4f43753`.

| Candidate | Subject | Recommendation | Reason |
| --- | --- | --- | --- |
| `538fa4b` | correct the DL Mode default assertion and skip agent worktrees | Take in full | Without it Vitest collects specs from all 28 worktrees; the suite is unusable in this repo layout. |
| `168d0eb` | in-app notifications, holographic cruush+ card, test config | Take in full | Feature plus the test config the branch also needs. |
| `409dd63`, `4ed8737`, `2b813ef` | approved photo actually sends; explain empty message insert; photo-upload incident code | Take in full | Server-only; no file overlap with the glass or landing work. |
| `8b95e76`, `e5eb3f5` | widen map discovery to launch radius; configurable presence window | Take in full | Server-side; `059_map_presence_duration.sql` is already sitting untracked in this worktree (see below). |
| `d4ee595`, `a9f90d0`, `0a95592`, `6be0828` | moderation fail-closed chain | Take in full | Correctness, server-only, ordered — splitting them leaves the build broken between steps. |
| `535fae3`, `d3f6ba6`, `b3123df`, `c74b7c1`, `22474bd`, `bd531e6` | DL Mode masking, Rekognition fallback, its tests | Take in full | Coherent unit; the branch already carries `57b28fe` "Mask explicit map pins in DL Mode", so expect a conflict in `MapView.tsx` — resolve, do not re-apply. |
| `6bdfc86` | mirror bug reports into GitHub issues | Cherry-pick | Self-contained server feature; no dependency on anything else in the 43. |
| `afcb495` | open a DM profile from the header heart pin | Cherry-pick | Touches the chat header only. |
| `419c72c` | show the bug report button without the alpha test flag | Cherry-pick | One-line gate change; the branch's own bug-button work (`f79183b`, `0eb3d46`) is elsewhere. |
| `8c38de5` | drop node_modules symlinks that broke the image build | Take in full, urgently | This worktree still has `node_modules` and `server/node_modules` as symlinks into `/Volumes/corrupt/Cruushv2-1`. |
| `bae1346`, `273b9c7` | ignore local Claude Code config | Take in full | Also brings `main`'s `.gitignore`, whose first Node entry is `node_modules` where this branch has `node_modules/`. A trailing slash does not match a symlink, which is exactly why `git status` here lists `node_modules` as untracked. |
| `8aad8b3` | mark the Rekognition IAM user as production | Take in full | Documentation; prevents an operator renaming the live credential. |
| `84963cb` | Harden Coolify deploys against split-brain and misbuilt API | Ignore for this branch | Infra only, no bearing on landing or glass; take it when merging to `main`. |
| `716f6cb` | fan out people who share the exact same map spot | Merge, resolve by hand | The branch already has `58df2c8` "Add map spiderfy and heatmap toggle". Cherry-picking would double-apply spiderfy logic. |
| `43cbddb`, `b0fa8c6` | stack feed delete above pin; keep map overlays uncovered | Merge, resolve by hand | Both edit z-index rules that `theme.css` has since restructured (see regression 1). |
| `5963b5d`, `2b8c3b7` | permanent account bans and moderator lookup (duplicated on `main`) | Ignore both | The branch carries `47ccadd` with the identical subject. Cherry-picking either re-applies the same schema change. |
| `d86063c`, `166bcd9`, `dcc14cb`, `ec336da`, `ca57c22`, `9cb7503`, `991998e` | merge commits | Ignore | No unique content; a single merge of `main` absorbs them. |
| The six `git cherry` matches | — | Ignore | Already applied; re-applying conflicts against identical text. |

One correction to record: `docs/plans/2026-08-05-cruush-session-plan.md:287` states "Three commits are on `main` and not on this branch" and names `6746218`. That commit exists but is on no branch (`git branch -a --contains 6746218` is empty); `main`'s equivalent is `168d0eb`. The real count is 43. The plan section is stale and must not be used as the merge list.

### Uncommitted state of the worktree

Twenty tracked files are modified and eight paths untracked. Nothing is staged.

| Path | Belongs to |
| --- | --- |
| `src/app/components/Auth.tsx`, `Auth.css`, `Auth.test.tsx` | Landing stack: measured reserve published at `Auth.tsx:113`, consumed at `Auth.css:34/66/900/905`; captcha slot at `Auth.css:378`. |
| `src/app/components/LaunchLoginMapTeaser.tsx`, `.css` | Landing plate (`#151518` → `#08080b`), teaser pane `absolute` → `fixed`, reduced-motion branch at `LaunchLoginMapTeaser.tsx:357`. |
| `src/styles/theme.css`, `src/styles/theme.test.ts` | Glass token system, portal stacking fix (`theme.css:855–866`), pin shell (`1152–1210`), canvas brightness (`theme.css:263`). |
| `src/app/components/LiquidGlassFilters.tsx` | Heart displacement preset `HEART_FILTER` (`:170–182`, `blur: 0`, `displace: 0`, `scale: -58`). |
| `src/app/lib/heartPin.ts`, `src/app/components/HeartPin.tsx` | Ring and rim masks; `HEART_PIN_RING_INNER = 2.7`, `HEART_PIN_RING_OUTER = 7` (`heartPin.ts:29–30`). |
| `src/app/components/MapView.tsx`, `MapView.test.tsx` | Pin shell wiring, side-badge offsets `-left-[1.1rem]`/`-right-[1.1rem]`, restored photoless gradient — **and** the street label ramps at `:398/425/446/467`, which are out of scope under rule 1. |
| `src/app/components/MapHome.tsx`, `BottomNav.tsx`, `DebugCruushPlusToggle.tsx` | Callback refs publishing measured geometry for the dock and dev toggle. |
| `src/app/components/CruushActivity.tsx`, `ProfileView.tsx` | Glass control roll-out (plan §1.3 items 5–6). |
| `src/app/App.tsx` | Mounts `renderDevPreviewRoutes()` in all five route trees. |
| `server/sql/036_…sql`, `server/sql/041_…sql` | **Not work in progress — a revert.** Both drop `'ban_user'`/`'unban_user'` from the check-constraint lists, undoing `74199c0`. Discard before committing. |
| `?? docs/plans/cruush-spec.md`, `?? docs/plans/2026-08-05-cruush-session-plan.md` | This specification and its session plan. |
| `?? src/app/components/DevPreviewRoutes.tsx` | `/dev` preview routes. |
| `?? src/app/components/LiquidGlassSurface.tsx`, `?? src/app/lib/liquidGlass.ts` | Per-element generated displacement (kube.io technique). |
| `?? server/sql/059_map_presence_duration.sql`, `?? 060_first_feed_post_prompt_notice.sql` | Byte-identical copies of `main`'s files (md5 `3f3b3214…`, `e158950c…`) — copied in, not merged. Delete and take them with `e5eb3f5`/`535fae3`. |
| `?? node_modules`, `?? server/node_modules` | Symlinks to `/Volumes/corrupt/Cruushv2-1/…`. Never commit; `git add -A` here would try to. |

### Working discipline

**Never push to `main`.** `main` and `origin/main` are identical at `538fa4b`; a force-free push of 102 unreviewed commits would put the whole glass rewrite into production in one step, with the map label ramps and the SQL revert riding along.

**If the current branch is `main`, branch first.** The primary checkout is on `feature/moderation-dashboard-full-access` at `a12e45f`, and `main` is not an ancestor of it — committing to `main` by accident there would strand work on a branch nobody merges.

**Start by enumerating, not by editing.** With 46 registered worktrees and 130 local branches, no agent can assume it knows where the work is. Before touching anything on a continuation task, run `pnpm docs:worktrees`, read `docs/worktrees.md`, and report what is where with last-commit dates (J1, J2). "Where did my changes go?" accounts for 57 messages in the audit and 53 more asking which branch is current; both are answered by that one command.

**Never abandon uncommitted work, and never overwrite someone else's.** Commit WIP with a message naming the next step rather than leaving a dirty tree for the next session to inherit (J3). Do not revert, reset or force over work you did not create without saying so first and getting a yes (J4).

**Commit in coherent units, with the cause in the message.** The branch's own history shows both shapes: `d78057d` "Glow the login copy, rebuild the footer, drop the dev bypass" is three unrelated changes in one commit, while `67db33b` "updates" and `3359479` "realse updated" name nothing at all — and `67db33b` is the commit that deleted `public/teasers/silver-glitter-background.png`. Failure prevented: a deletion with no stated cause cannot be distinguished from an accident during a later bisect.

**Two agents must never share one checkout.** The concrete failure: `/Volumes/corrupt/Cruushv2-1` was recorded at session start with a dirty set that did not include `src/app/components/MapView.test.tsx`; re-reading `git status` in the same session shows it modified. Another session is switching branches and editing files in that tree. When a second session checks out a different branch there, the first session's edits are overwritten or stashed away, and its fixes appear to vanish — the file it "just fixed" reads as unfixed. This worktree makes it worse: its `node_modules` is a symlink into that same checkout, so a dependency install in either session changes the runtime of both. One branch, one checkout, one agent.

### Regression log

| # | Regression | Root cause |
| --- | --- | --- |
| 1 | Four controls dead — Seeking, Visibility, DL mode, feed settings | An unlayered `position: relative` beats every cascade layer including Tailwind's utilities, so it overrode `.fixed` on portalled Radix surfaces; they laid out in normal flow below the fold and left a full-screen overlay eating clicks (`src/styles/theme.css:857–866`). |
| 2 | Landing stack fell through the footer on sign-up | The band's reserve was a constant tuned on the sign-in form; sign-up's third field, the captcha slot and the error banner each overflowed it (`src/app/components/Auth.css:29–34`). |
| 3 | Buttons sat low on the landing page | An empty captcha slot held 65px open between the password field and the button (`Auth.css:365–369`, now `min-height: 0` until `data-captcha-state='active'`). |
| 4 | "You" tag offset left | Tailwind v4's `-translate-x-1/2` sets the standalone `translate` property, which stacked on the class's own `transform` instead of replacing it. Fixed by owning the offset in `.cruush-marker-signal` (`theme.css:1122`). |
| 5 | Pin photo distorted | The ring sat above the pin, so `backdrop-filter` sampled the pin's own artwork as part of its backdrop. Now `z-index: -1` (`theme.css:1176`). |
| 6 | Pin band invisible | The band was centred on the same path as the pin's own 4.8-wide border, at the same width — it was drawn exactly where it could not be seen. Two strokes now define the band (`src/app/lib/heartPin.ts:11–18`). |
| 7 | Pin band thin at the bottom | The mask was scaled outward uniformly. A uniform scale moves the bottom point, furthest from centre, further than the top lobes (`theme.css:1164–1168`). |
| 8 | Panels read tan | The 224×56 `pill` preset stretched over a ~600px panel with `preserveAspectRatio="none"`; a flattened ramp smears the backdrop instead of bending it, and over warm-grey streets the smear reads as beige (`src/app/lib/liquidGlass.ts:5–12`). |
| 9 | Pins foggy | Blurred ramps in the displacement map plus an output blur. `HEART_FILTER` now runs `blur: 0`, `displace: 0` (`LiquidGlassFilters.tsx:180–181`). |
| 10 | Dock a grey slab | Specular was derived as a flat white from the whole bezel map and screened over it; it needs its own map encoding intensity from the normal's angle to a light direction. Currently off. |
| 11 | Map darkened | `brightness(0.86) contrast(1.2)` was changed in response to *a question* about why the map looked dark. Now `brightness(1.18) contrast(1.06)`, commented as the owner's pick (`theme.css:262–263`). |
| 12 | Map "font changed" | Street label sizes raised roughly 75% in a single step. Magnitude is scope: `MapView.tsx:467` went from `9,13 / 16,16` to `9,17 / 16,22 / 19,27`. |
| 13 | `/dev` routes crashed | `DevPreviewRoutes.tsx` referenced a component that existed only on `main`. Recorded, not reproduced here — all four lazy imports resolve in this tree today. |
| 14 | Reduced-motion video regression | Retiring the mobile recording left the source-selection branch unconditional, putting the looping logo back on for users who had asked for no motion (`LaunchLoginMapTeaser.tsx:350–364`). |
| 16 | Landing capsules overlapped the footer on a short window | The shell was a fixed `height: 100dvh` grid and the band expression could go negative. With the error capsule and an active captcha on a short viewport, the card outgrew the window even at band ≈ 0; grid rows cannot push a fixed container, so the card painted straight over the contacts row and the legal links. Fixed structurally: the band is clamped `max(0px, …)` and the shell is `min-height: 100dvh; height: auto`, so when the stack cannot fit the page scrolls instead of overlapping (`Auth.css`, shell block). Overlap is never an acceptable render. |
| 15 | Procedural fallbacks mistaken for rendering bugs | `git diff --name-status HEAD main -- public/teasers/` shows `silver-glitter-background.png`, `codepen-butterfly-tex.png`, `cruush-logo-brand.svg` and both alpha `.webm` loops as `D` — present here, deleted on `main`. `LaunchLoginMapTeaser.tsx:14` points at the butterfly texture and falls back to a `THREE.CanvasTexture` at `:310–311`, so a naive merge of `main` silently swaps the asset for a procedural one. Unverified whether this fallback ever reached a shipped build; loading the landing page with the network panel filtered to `/teasers/` and checking for a 404 on `codepen-butterfly-tex.png` would settle it. |
| 17 | Landing shell painted, then crashed during bootstrap/login | `/api/meta` and `/api/auth/login` returned 500 from the API behind the Vite proxy. The client then surfaced Minified React error #130 (`undefined` rendered as a component/value), leaving an apparently loaded but unusable page. Root cause is not proven from the browser log alone; the first failing server response and server stack trace are required. This regression is now covered by R14 and Part IX §37.4. |

### How work goes wrong here

Three shapes recur.

**Doing more than the ask.** Regressions 11 and 12 are both scope failures on the same surface, and the working tree still carries 12: four `text-size` ramps in `MapView.tsx` are modified against `HEAD` in a branch about the landing page and the glass system. The rule at `docs/plans/2026-08-05-cruush-session-plan.md:9–20` exists because this happened twice in one session. The uncommitted revert of `'ban_user'`/`'unban_user'` in `server/sql/036` and `041` is the same shape in reverse — an unrelated file changed while something else was being done, silently undoing `74199c0`.

**Claiming completion from insufficient evidence.** The plan states at line 46 that "All five ramps now continue to zoom 19: place names 17 → 24 → 31". The place-name ramp at `MapView.tsx:486–493` still stops at zoom 12 with `13 → 17`, in both `HEAD` and the working tree, and none of the four street ramps carries the claimed `18/21/23/25`. The claim was written from intent, not from the file. The document's own opening line concedes the pattern: success was reported from computed styles rather than from looking at the result.

**Measuring in the wrong state.** The "You" tag was reported fixed twice. The second fix derived the lift correctly — 80px heart, `scale(1.5)` raises the top edge by 20px — but was measured with the pin at rest, where the overlap does not occur. The overlap is a hovered-state condition; a resting-state measurement cannot see it, so the fix passed its own check and failed the user's.


---

# Part XI — Sequencing

## 1. Execution order

The order below is chosen so that blocked work does not sit in front of
deliverable work, and so that anything which changes many surfaces at once
happens after the thing it depends on has been confirmed by eye.

| # | Item | Why here |
| --- | --- | --- |
| 1 | Seeking filter menus and any other dead control | Functional beats cosmetic. |
| 2 | The `backdrop-filter` blocker, experiment 1 (Part II) | Blocks the entire glass roll-out. Cheapest experiment first. |
| 3 | Zoom displacement on the dock, confirmed by screenshot | One surface before roll-out (R7). Nothing else moves until this is agreed. |
| 4 | Top navigation: size, flush rule plus test, corner logo removed, bug button glass | Self-contained, no dependency on 2–3. |
| 5 | Glass roll-out in the order given in Part II, screenshotting each | Depends on 3. |
| 6 | Heart pins as one surface with inward neon | Depends on 3; the hardest surface, so it goes last in the roll-out. |
| 7 | Ghost mode: record, show, propose, then build | Plan-first protocol; nothing is touched before approval. |
| 8 | Landing: NYC OPEN BETA colour, footer lowercase, Turnstile popup | Independent of the glass work. |
| 9 | Onboarding over the landing background, progress bar | Larger front-end restyle. |
| 10 | Application logic: login bonuses, password policy, content removal, screenshot restrictions | Server-side; independent of everything above. |
| 11 | Merges from `main` | Do this before the logo re-render so conflicts land on a stable tree. |
| 12 | Logo re-render — glitter and top clipping as one block | Hours, not minutes. Schedule deliberately. |

## 2. Acceptance criteria

| Area | Criterion |
| --- | --- |
| Glass | One implementation. No surface reads tan or foggy. The dock is the reference and every other surface visibly matches it. |
| Pins | One continuous glass surface. No displacement on the photo. Even band the whole way round, including the bottom point. Correct relationship colours. |
| Landing | No overlap in any state — sign in, sign up, forgot, captcha present, error shown. No scrolling. Footer flush. Logo never clipped at the top. |
| Runtime | `/health`, `/api/meta`, and the login contract pass on the exact frontend/API pair under test; signed-out bootstrap has no uncaught React error, no React #130, and no unexpected API 5xx. |
| Top nav | Three controls flush to the top with measurably equal gaps, asserted by a test. |
| Map | Byte-identical to session start except the authorised changes listed in Part V. |
| Controls | Every menu and sheet opens and commits state; a regression test guards the overlay class of bug. |
| Tests | Green, and each asserts a contract rather than a declaration. |
| Reporting | Every completed item was reported with the evidence type its change class requires, including an unrequested screenshot for every visual change (R16). |
| Shipping | Every completed item is committed, pushed and deployed with the deployed SHA confirmed to match (R15) — or the reason it cannot be is stated in the same message. |

---

# Part XII — The repeat ledger

## 1. What this part is

An audit of 3,874 messages Julien wrote to Claude Code, Codex and Antigravity
across 290 sessions between 2026-04-28 and 2026-08-06 established what he has had
to say more than once, and how many times. The full evidence, with verbatim
quotes, is in `docs/repeated-instructions-audit-2026-08-06.md` (on `origin/main`).

This part exists so that no agent has to be told any of it again. If you are
about to ask Julien a question, check this table first — the answer is probably
already here, and asking again is itself the failure being measured.

## 2. The ranking

| # | The repeated ask | Messages | Now enforced by |
| --- | --- | --- | --- |
| 1 | "Show me a screenshot / preview / video" | 210 | R16, B2 — prose only, not yet mechanical |
| 2 | UI geometry: padding, size, flush, closer, bigger | 193 | `pnpm check:layout`, E3 tokens |
| 3 | "Make a plan first / ask me questions / don't decide for me" | 134 + 65 | K1, K2, C2 |
| 4 | "Push to main / commit and push / deploy it" | 126 (+134 deploy) | `pnpm ship`, R15, A1–A3 |
| 5 | Env var / API key / secret plumbing | 126 | `pnpm docs:env`, R18, I1–I5 |
| 6 | "Do it for me — you have full access" | 112 | R17, H3, B4 |
| 7 | "Which branch / new worktree / where are my changes" | 53 + 57 | `pnpm docs:worktrees`, J1–J4 |
| 8 | "Consistency across the app" | 61 | E1, E2, E4 |
| 9 | "Use the CodePen / match the reference" | 55 | E6 |
| 10 | "Step by step, I've never done this" (AWS, Coolify, DNS) | 58 | Not a defect — see Part 0 §3 |
| 11 | "Never overlap / it's cut off / make it flush" | 43 | `pnpm check:layout`, D1–D7, R10 |
| 12 | "I told you / did I not tell you / how many times" | 38 | The meta-signal; this document is the fix |
| 13 | "Write it down so this never happens again" | 31 docs + 27 tests | `CRUUSH-RULES.md`, this document, L2 |
| 14 | "cruush is always lowercase" | 27 | `pnpm check:copy`, F1 |
| 15 | "I didn't ask for that / only change what I asked" | 24 | R3, R12, C1, C3 |
| 16 | "Visually confirm, don't assume from the code" | 10 explicit | R5, R16, B1 |

Frustration markers — profanity, "asshole", "I hate you" — appear in **235
messages, 6% of everything Julien has typed to an agent.** They cluster almost
perfectly on rows 1, 4, 6, 9, 11 and 15. Every one of those rows is mechanically
enforceable. None of them is a judgement call.

Stripping out the genuinely novel work — first-time infrastructure, real product
iteration, real bug reports — the avoidable repetition is still roughly **600–800
messages, about a fifth of everything he has written.**

## 3. Why it kept happening

Five mechanical causes, none of them about intelligence:

1. **Three agents, three memory systems, zero overlap.** Claude Code read
   `CLAUDE.md`, Codex read `AGENTS.md`, Antigravity read its own store. A rule
   taught to one was invisible to the other two, and Julien switches agents when
   credits run out — so he re-taught on every switch. `CRUUSH-RULES.md` is the
   fix, and it only works if all three point at it.
2. **Sessions die, worktrees multiply.** 290 sessions, 46 worktrees, 130
   branches. A new session starts cold on a branch whose purpose it does not know.
3. **Docs were written but not loaded.** The artifacts existed. Nothing forced
   them into context at turn zero.
4. **Rules stayed prose when they could have been code.** Overlap, lowercase,
   layout invariants and deploy-SHA checks are all mechanically checkable.
5. **Agents defaulted to reporting instead of verifying, and to instructing
   instead of acting.**

The highest-yield message in the entire corpus, in Julien's own words, is a
pointer plus a standing instruction: *"Read HANDOFF.md completely, then continue
the work from the current checkout. Do not ask me to repeat documented
decisions."* That is the template. This document and `CRUUSH-RULES.md` exist so
that sentence is all he ever has to type.

## 4. Build status of the fixes

| Priority | Fix | Kills | Status |
| --- | --- | --- | --- |
| 1 | `docs/CRUUSH-RULES.md` as single source of truth, with `CLAUDE.md` / `AGENTS.md` reduced to pointers | The cross-agent re-teaching tax | **Done** — `6d7f569` |
| 2 | `pnpm ship` — commit, push, deploy, poll, print SHA and URL | ~260 push/deploy messages | **Done** — `750bc70`, `a5a0c23` |
| 3 | Layout invariant checks at 375/768/1280 | ~43 overlap messages | **Done** — `pnpm check:layout` |
| 4 | Mandatory screenshot on visual change | ~210 messages | **Prose only** (R16, B2). The largest remaining gap, and the largest single category of repetition. |
| 5 | `docs/worktrees.md` index and start-of-session enumeration | ~110 messages | **Done** — `pnpm docs:worktrees` |
| 6 | `docs/env-matrix.md` and the mandatory `NEW ENV VARS` block | ~126 messages | **Done** — `pnpm docs:env`; the block itself is prose (R18) |
| 7 | Lowercase-`cruush` lint | 27 messages | **Done** — `pnpm check:copy` |
| 8 | Reference-code vendoring — CodePen source in-repo next to the component | ~55 messages | **Not built.** E6 is prose. |

Two gaps remain: the screenshot convention (row 4) and reference vendoring (row
8). Both are prose rules today, and prose rules are the ones that get forgotten.

## 5. Recent acts — what shipped 2026-08-05 to 2026-08-06

`origin/main`, most recent first. This is the line that is actually deployed;
the glass branch in Part X is not on it.

| Commit | Date | Subject |
| --- | --- | --- |
| `1a610a0` | 08-06 | Stream image-policy drift check and Rekognition type fix |
| `a5a0c23` | 08-06 | `ship` resolves Coolify app UUIDs by name, warns on branch drift |
| `750bc70` | 08-06 | The standing rules enforced by commands instead of prose |
| `6d7f569` | 08-06 | `CRUUSH-RULES.md` as the single rules file for all agents |
| `ca1f9b2` | 08-06 | Message photo send route fixed |
| `8c0fc1a` | 08-06 | Coolify release source guardrails |
| `bb30deb` | 08-06 | Feed posting failure error codes |
| `39c4218` | 08-06 | NSFW photo safety error codes documented |
| `91f7adb` | 08-06 | Support reply recipient typing fixed |
| `3e2ddfc` | 08-06 | Bug report replies |
| `4e830c1` | 08-06 | Backend build SHA exposed in metadata |
| `f230afb` | 08-06 | Non-human message images allowed |
| `410dd02` | 08-05 | Account deletion tested end to end |
| `aff33fc` | 08-05 | Account deletion cleanup made retryable |
| `df3fc24` | 08-05 | Moderation migration made replay-safe |
| `6b68225` | 08-05 | Unproven legacy photos kept masked |
| `aeb3421` | 08-05 | Legacy media classification backfill fixed |
| `c896dcd` | 08-05 | Urgent bugfix and safety release |
| `3cf25fa` | 08-05 | Per-user map presence window, DL mode feed masking, onboarding preview |

Not on `origin/main`, live on other branches: permanent account bans and
moderator account lookup (`47ccadd`), the Signal onboarding step and status
broadcast field (`12fd00d`), the messages-settings and recently-active touch
crash fix (`a12e45f`, on `feature/moderation-dashboard-full-access`), and the
whole glass and landing line documented in Parts II–VII.

---

# Appendices

## Appendix A — Glossary

Terms used precisely throughout this document.

| Term | Meaning here |
| --- | --- |
| **Displacement map** | An image whose red and green channels encode a per-pixel offset. 128 means no displacement; 0 and 255 are the extremes of the range. Consumed by `feDisplacementMap`. |
| **Bezel** | The band at the edge of a glass surface where the height function is not flat, and therefore the only region that can refract. |
| **Refraction map** | The displacement map derived from the bezel's surface normal via Snell's law. Bends the backdrop at the rim. |
| **Zoom map** | A second displacement map that pushes every pixel toward the centre by a fraction of its distance from it, magnifying the backdrop. This is the half that makes a surface read as a lens rather than as an edge effect. |
| **Specular** | A highlight layer derived from the surface normal's angle to a light direction, blended with `feBlend mode="screen"`. |
| **Preset** | One of the fixed, shared bitmap displacement maps, stretched to whatever element references it. |
| **Generated map** | A displacement map built at one element's own pixel size, so nothing is stretched. |
| **Frost** | A flat translucent fill behind the glass. Distinct from displacement; it does not bend anything. |
| **Gel** | The blurred neon gradient behind a button's glass shell. |
| **Smear** | The failure mode where a gentle displacement gradient moves neighbouring pixels by nearly the same amount, blurring rather than bending. Reads as fog, or as a warm cast over warm content. |
| **Lens** | The success mode: a steep displacement gradient over a few pixels. |
| **Band** | The visible ring of glass around a heart pin. |
| **Portalled surface** | A Radix sheet, dialog, popover, dropdown or select, which renders at the document root rather than in place. |

## Appendix B — The two mechanisms worth memorising

Most of the visual complaints in this project reduce to one of two mechanisms.
They are stated here separately because recognising them saves hours.

### B.1 Gradient steepness decides lens versus fog

A displacement map's *slope* is what matters, not its amplitude.

- A steep gradient over a few pixels displaces neighbouring pixels by very
  different amounts. Edges in the backdrop are bent. This reads as glass.
- A gentle gradient over many pixels displaces neighbouring pixels by almost the
  same amount. Nothing is bent; everything is nudged. This reads as fog, and over
  warm content it reads as a beige cast.

Three separate defects had this single cause: a small preset stretched over a
large panel, blurred ramps in a generated map, and an output blur on the filter.
Any time a surface looks foggy or tinted rather than glassy, check the slope
before changing anything else.

### B.2 A backdrop-filtered element samples everything painted below it

`backdrop-filter` does not sample "the background". It samples everything painted
beneath the element in paint order.

Therefore an element that must not distort some content has to paint **below**
that content, not above it. The pin's glass ring distorting the profile photo was
this and nothing else: the ring sat above the pin, so the pin's own artwork was
part of the ring's backdrop.

Corollaries: glass on glass double-applies the backdrop, so an inner surface
takes a lighter treatment or none; and displacement over flat colour is invisible
by definition, because there is nothing to bend — that is correct behaviour and
must not be compensated for by raising the scale.

## Appendix C — Quick reference: file map

| Path | Role |
| --- | --- |
| `src/styles/theme.css` | Glass tokens, pin layers, nav dock, map canvas filter, portalled-surface guard |
| `src/app/components/LiquidGlassFilters.tsx` | The shared bitmap presets |
| `src/app/lib/liquidGlass.ts` | Per-element map generation (refraction and zoom) |
| `src/app/components/LiquidGlassSurface.tsx` | Per-element filter component |
| `src/app/lib/heartPin.ts` | Heart path, themes, band masks, geometry constants |
| `src/app/components/MapView.tsx` | Map style, markers, pins, badges, clusters |
| `src/app/components/MapHome.tsx` | Map chrome, Recently Active bar, dev toggle docking |
| `src/app/components/BottomNav.tsx` | The dock and the switcher bubble |
| `src/app/components/Auth.tsx` / `Auth.css` | Landing page |
| `src/app/components/LaunchLoginMapTeaser.tsx` / `.css` | Teaser, glitter, butterflies, logo video |
| `src/app/components/DevPreviewRoutes.tsx` | `/dev` preview routes |
| `src/app/components/GhostModeSettings.tsx` | Ghost mode |
| `docs/plans/cruush-spec.md` | This document |
| `docs/CRUUSH-RULES.md` | **The standing rules. Read first, every session, every agent.** Wins over this document where they disagree |
| `docs/repeated-instructions-audit-2026-08-06.md` | The evidence behind the rules — 290 sessions, verbatim quotes, message counts |
| `docs/worktrees.md` | Worktree index: branch, purpose, agent, state. Regenerate with `pnpm docs:worktrees` |
| `docs/env-matrix.md` | Every environment variable the code reads, and where it is set. Regenerate with `pnpm docs:env` |
| `scripts/ship.mjs` | `pnpm ship` — commit, push, deploy, poll until the deployed SHA matches |
| `scripts/check-layout-invariants.mjs` | `pnpm check:layout` — real bounding boxes at 375/768/1280 |
| `scripts/check-lowercase-cruush.mjs` | `pnpm check:copy` — fails on user-facing `cruush`; `--fix` rewrites |
| `scripts/security-check.sh` | `pnpm security:check` — staged-secret scan before commit |

---

*End of specification.*
