# Session handoff — 2026-08-06

Everything a fresh session needs to continue. Written at the end of a long
session; state below was read from the tree, not from memory.

---

## Where things are

- **Checkout:** `/Volumes/corrupt/Cruushv2-1`
- **Branch:** `feature/moderation-dashboard-full-access`
- **HEAD:** `f205530` "Restore the notchless spinning logo loop on the landing page"
- **`node_modules`: ABSENT.** Removed during disk cleanup. **A reinstall is the
  first thing that must happen** — no tests, no dev server, no build until then.

```bash
pnpm install --no-frozen-lockfile
```

`--no-frozen-lockfile` is required: `three@0.160.1` is committed in
`package.json` at HEAD but recorded in **neither** `pnpm-lock.yaml` nor
`package-lock.json`. Any frozen install fails, which also means CI would fail on
a clean clone. Worth fixing properly by committing the updated lockfile.

## The disk problem, and what was done about it

**Root cause: `/Volumes/corrupt` is exFAT, which has no hard links.** pnpm's
whole design is hard-linking from a global store; without it, pnpm physically
copies every file of every package into every worktree. With ~44 registered
worktrees, that is where the space went.

| Volume | FS | Hard links |
| --- | --- | --- |
| `/Volumes/corrupt` | exfat | **no** |
| `/Volumes/Untitled` | apfs | yes |
| `/` (Macintosh HD) | apfs | yes |

Done this session:

- Deleted a 32 GB wrecked `node_modules` and a 13 GB partial one
- Swept `node_modules` from inactive worktrees (excluded `sunny-twirling-cherny`,
  `spec-work`, `repeated-instructions-audit`)
- Disk went from **777 GB used to 692 GB** and was still dropping
- Set `pnpm config set store-dir /Volumes/corrupt/.pnpm-store`

**That store setting is now wrong and should be changed.** It was set before
discovering the volume is exFAT, where a same-volume store still cannot
hard-link. It should point at an APFS volume, or better, the repo should move.

**Recommended (user was mid-decision):** move the repo to `/Volumes/Untitled`
(APFS, 4.5 TB free, hard links work) and put the store there too. That ends the
slow-install problem permanently rather than managing it. Caveat: git records
absolute paths for all ~44 worktrees, so a move breaks every registration —
they need pruning or re-adding deliberately.

## Git safety — the important one

**Only 62 refs exist on origin; ~56 local branches exist nowhere else.** Among
them, branches carrying 100+ unique commits each:

| Branch | Commits only local |
| --- | --- |
| `codex/github-issues-aug6` | 122 |
| `codex/revert-unwanted-ui-20260806` | 122 |
| `integrate/ui-consolidation` | 108 |
| `feature/landing-page-liquid-glass-antigravity` | 104 |
| `codex/instagram-ad-landing-loop` | 104 |
| `codex/v1-1-liquid-glass-magnifying-lens` | 102 |

The only copy of all of this is an exFAT external volume named `corrupt`.
**Pushing was verified safe** and is half-done:

- Pushed one canary (`docs/iam-production-warning`) — production did **not**
  rebuild. Coolify's trigger is branch-specific. Verified against `etag` and
  `last-modified` on `https://cruush.app`, not assumed.
- No GitHub Actions exist in any branch — pushing triggers no CI
- No secrets tracked — only `.env.example`; `.gitignore` covers `.env*`
- 92 candidate branches, minus 36 already merged into `main` = **56 left to push**
- **`codex/publish-map-previews-main` will be rejected** — it carries
  `downloads/swisstransfer-cruush-logo-ad/cruush-event-logos.zip` at **253 MB**,
  over GitHub's 100 MB hard limit. Skip it or strip the file from that branch.

That folder also holds four 65–88 MB `.mov` files (warnings, not rejections),
all on that one branch.

**Next action: push the remaining 56.** The user approved the canary and was
weighing whether to filter the list further.

## The logo work — DONE and approved

The user's verdict: *"That re-rendered logo is perfect. Don't touch it."*

Both loops in `public/teasers/` are **uncommitted** and must not be regenerated:

| | desktop | mobile |
| --- | --- | --- |
| Dimensions | 1340×1340 | 720×720 |
| Frames / rate | 400 @ 60fps | 400 @ 60fps |
| Duration | 6.667s | 6.667s |
| Artwork on row 0 | **0 of 400** | **0 of 400** |
| Alpha | intact | intact |

### What took so long, so nobody repeats it

- **The notch and the clipping are different defects.** A row-0 alpha scan
  measures whether artwork touches the frame edge. The notch is missing geometry
  where the wordmark crosses the flame. **No clipping test can detect a notch.**
- **`df7cc9e`'s commit message is wrong.** It says "Use notchless VP9 video
  loops"; that render *has* the notch.
- Four renders existed in git: two 16:9 that don't clip but carry the notch, one
  square that is notchless but clips, and a fourth variant. **None was both.**
- **`cropdetect` under-reports extent** — 1064×1048 where a per-frame scan gave
  1146×1211. Cropping to its figure re-cut the logo. Measure by scanning.
- **Decoding VP9 alpha needs an explicit `-c:v libvpx-vp9`**; the default decoder
  drops alpha silently and every measurement comes out wrong.
- **Encoding needs `-auto-alt-ref 0 -lag-in-frames 0`** or alpha is lost and the
  clip composites as an opaque black square.

The fix was the camera margin in `scripts/logo-render/logoRender.ts:340`:
`1.04 → 1.45`. 1.04 fits the camera to the *static* SVG bounds, ignoring that
the logo grows taller as it turns side-on — exactly where it was clipping.

Render pipeline was copied into `scripts/logo-render/` (untracked) and a working
isolated build sits in the session scratchpad.

### One outstanding consequence

`src/app/components/Auth.css:101` uses `--cruush-logo-band * 0.0092` to subtract
the asset's bottom slack from the tagline gap. **That constant no longer matches
the asset:**

| | old asset | current |
| --- | --- | --- |
| Bottom slack | 10px = 0.83% | 64px = **4.78%** |

The user said not to touch the video, so **the fix is to update the constant to
~`0.0478`**. The spec sanctions this explicitly: *"If the logo asset is ever
re-rendered, this constant must be re-measured; it is a property of the asset,
not of the layout."* Until then the tagline sits roughly 20px low.

## Map corner mark — awaiting two decisions

`src/app/components/MapHome.tsx` is edited (uncommitted) to swap the corner
`<img src={cruushLogo}>` for `<video src={cruushLogoLoop}>`. Same element box,
same classes, same glass rules.

Blocked on the user:

1. **The glass halo doesn't turn with the mark.** The halo is two pseudo-elements
   masked to the *static* SVG silhouette (`--cruush-map-logo-mask`). The video
   spins inside a halo that stays put — fine face-on, mismatched side-on. Keep it
   static, or drop the mask?
2. **Cost.** It decodes a 1340×1340 60fps clip to paint a ~70px mark. A small
   corner-sized encode is the sane version if the look is approved.

Preview: `https://claude.ai/code/artifact/26e3f94e-a9e4-48dd-add4-a86bce9ce320`

## Server-side DL Mode — planned, approved, not started

Full plan: `docs/plans/server-side-dl-mode.md`. User said to proceed, but wants
tests runnable first.

Summary: DL Mode is `localStorage`-only, so the server always sends explicit
photo URLs and the client merely declines to render them — readable in devtools,
and bypassable by flipping a console value. Plan moves enforcement server-side:
migration `065` adding `dl_mode_enabled boolean not null default true`,
`GET`/`PUT /api/privacy/dl-mode`, and masking **in the SQL projection** rather
than in the ten response mappers, so the URL never enters the result set.

**Already correct and must not regress:** missing photo metadata resolves to
"explicit" at every layer (`coalesce(…, true)`,
`is distinct from 'non_explicit'`, client `=== false ? false : true`, DL Mode
default on).

**A correction on record:** the uncommitted `MapHome.tsx` DL-mode refactor was
initially flagged as a safety regression. That was wrong. It centralises masking
into `shouldMaskPhoto` and flips the unknown-metadata default from "assume safe"
to "assume explicit" — strictly safer. Do not revert it.

## Test suite splitting — proposed, not built

The user asked for faster, scoped test runs.

Current reality: **one suite.** `package.json` has only `test = vitest run`. The
`test:smoke` tier the spec describes does not exist on this branch.

| Area | Files | Needs jsdom? |
| --- | --- | --- |
| `src/app/components` | 44 | yes |
| `src/app/lib` | 21 | **only 2** |
| `src/test` | 2 | yes |
| `server/src` | 67 | separate config already |

**Biggest win: 19 of 21 lib tests don't touch the DOM** yet pay for jsdom.
`vitest.config.ts` caps `maxWorkers: 4` because each fork loads jsdom + React +
maplibre-gl. Splitting those into `environment: 'node'` makes them near-instant
and safely parallel.

Proposed: `vitest.node.config.ts` for lib, plus domain scripts
(`test:safety`, `test:landing`, `test:map`, `test:messaging`), plus restoring the
smoke tier.

**Trap:** a vitest CLI path argument is a *substring filter*, and the worktrees
are whole copies of the repo — which is why the config excludes `.claude/**` and
`.agents/**`. Any new script must inherit those excludes.

## Never delivered

**The running app has never been shown.** Every visual in this session was a
reproduction of the CSS in a standalone page, or a frame extracted with ffmpeg —
never the actual dev server. Two dev-server attempts failed on missing `vite`.
This is still owed once `node_modules` is restored.

Also fixed this session: `.claude/launch.json`'s `cruush-dev` entry had no `cd`,
so the preview shell started in an unreadable directory and `vite` never
resolved. A `cruush-api` entry was added that loads `--env-file=.env
--env-file=.env.local`, without which the API dies on missing `DATABASE_URL`.

Runtime gate (R14) passed earlier when the API was up: `/health` 200,
`/api/meta` 200 with the full contract, `POST /api/auth/login` returning a
documented 401.

## Suggested order for the next session

1. `pnpm install --no-frozen-lockfile` — nothing else works until this lands
2. Start the dev server and finally show the landing page and map corner
3. Fix `Auth.css:101` → `0.0478`, verify the tagline gap in the browser
4. Commit the logo pair (supersedes `f205530`)
5. Push the remaining 56 branches (skip `codex/publish-map-previews-main`)
6. Decide the corner-mark halo and encode-size questions
7. Build the test-suite split
8. Implement server-side DL Mode against a runnable test suite
9. Decide on moving the repo to `/Volumes/Untitled`

## Standing rules that were repeatedly relevant

From `docs/plans/cruush-spec.md` (v2.2, this checkout is authoritative; the copy
in the glass worktree is stale v2.0 and should be overwritten):

- **R1** never touch the map tiles unless named
- **R3** change only what was named; magnitude is part of scope
- **R8** one agent per checkout — two sessions collided in this tree this session
- **R12/R13** one ask, one edit, one report; restate before editing
- **R14** runtime integrity gate before any visual claim
- **R15** never edit a committed SQL migration; add a new numbered one (next: 065)
- **R16** z-index tiers
