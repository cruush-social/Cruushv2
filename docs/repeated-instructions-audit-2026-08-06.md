# What Julien Repeats: A Full Audit of Three Months of Agent Sessions

**Generated:** 2026-08-06
**Scope:** every human-authored message to Claude Code, Codex (CLI + Desktop + Claude Octopus reviewer sessions), and Antigravity, from the first Cruush session to now.
**Purpose:** you said you shouldn't have to repeat yourself. This document proves what you repeat, how often, in what words, and — for each one — the reason the agent keeps failing it and the exact rule that would stop it.

---

## 0. Method and corpus

| | |
|---|---|
| Sources read | `~/.claude/projects/**/*.jsonl` (Claude Code), `~/.codex/sessions/**` + `~/.codex/archived_sessions/**` (Codex), `~/.gemini/antigravity/conversations/*.db` (Antigravity, SQLite + protobuf step payloads) |
| Date span | 2026-04-28 → 2026-08-06 (101 days) |
| Distinct sessions | 290 |
| Raw human messages extracted | 4,939 |
| Unique human messages after dedupe | 3,874 |
| By agent | Codex 3,320 · Claude Code 409 · Antigravity 145 |
| Median message length | 65 characters |

Machine-authored noise was stripped: Claude Octopus approval-review transcripts (3,797 messages that *look* like user turns but are the reviewer harness quoting Codex back at itself), tool results, task notifications, IDE-context wrappers, environment blocks. What is left is you talking.

All quotes below are verbatim, typos included. The typos matter — they are how you actually type when you are annoyed, and they are the fingerprint that tells you this is real data and not a summary I invented.

---

## 1. Executive summary — the ranking

Ranked by how many separate messages you had to spend on it:

| # | The thing you repeat | Messages | Why it recurs |
|---|---|---|---|
| 1 | **"Push to main / commit and push / deploy it"** | 126 (+134 deploy/Coolify) | Agents finish work and stop. You have to spend a turn every single time to convert work into a deploy. |
| 2 | **"Show me a screenshot / preview / video"** | 210 | Agents report success in prose. You cannot see prose. You have to ask for the picture every time. |
| 3 | **Env var / API key / secret plumbing** | 126 | Agents add a dependency, don't tell you the new variable, and you find out when production breaks. |
| 4 | **"Do it for me — you have full access"** | 112 | Agents hand you console steps instead of using the browser/credentials they already have. |
| 5 | **UI geometry: padding, size, flush, closer, bigger** | 193 | No canonical spacing/size spec exists, so every agent re-guesses. |
| 6 | **"Which branch / new worktree / where are my changes"** | 53 asks + 57 lost-work complaints | Work is spread over 3 agents × many worktrees with no shared index. |
| 7 | **"Never overlap / it's cut off / make it flush"** | 43 | No layout invariant is encoded anywhere, so it regresses after every visual change. |
| 8 | **"Use the CodePen / the reference image"** | 55 | Agents approximate the reference instead of porting it, then claim it matches. |
| 9 | **"Make a plan first / ask me questions / don't decide for me"** | 134 plan + 65 ask-me | Agents write code before the spec, then you pay to unwind it. |
| 10 | **"Write it down so this never happens again"** (spec, white doc, test, note) | 31 doc + 27 test | You keep commissioning the memory artifact. It gets written, then not read. |
| 11 | **"cruush is always lowercase"** | 27 (5 explicit "make a note so you don't forget") | Trivially encodable as a lint rule. Never was. |
| 12 | **"Visually confirm, don't assume from code"** | 10 explicit demands | Agents infer visual outcomes from diffs. |
| 13 | **"I didn't ask for that / only change what I asked"** | 24 | Agents bundle unrequested changes with requested ones. |
| 14 | **"Step by step, I've never done this"** (AWS/Coolify/DNS/GitHub) | 58 | Genuine novel-infra asks — mostly legitimate, partly avoidable. |
| 15 | **"I told you / did I not tell you / how many times"** | 38 | The meta-signal. This is the count of times you noticed you were repeating. |

Frustration markers (profanity, "asshole", "I hate you") appear in **235 messages — 6% of everything you have typed to an agent.** They cluster almost perfectly on items 1, 2, 7, 8, 12 and 13.

**The single highest-leverage finding:** items 1, 2, 7, 11, 12 and 13 are *all mechanically enforceable*. They are not judgment calls. Every one of them could be a script, a lint rule, a test, or a git hook, and then you would never type them again. You have asked for exactly this at least a dozen times, in these words:

> "make these rules enforcable so you never fuck it up ever again" — Antigravity
> "Can you make something in your notes in this entire repo that you read, the thing you read every time to never do a visual change without checking it after and confirming it?" — Codex, 2026-08-06

---

# PART I — THE THINGS YOU REPEAT

Each section: what you say · the evidence · why it keeps happening · the rule that fixes it.

---

## 1. "Push to main." (126 messages)

### What you say

You have typed a bare, standalone push instruction more than a hundred times. Sampled across the timeline:

- `push to main` — 2026-07-07 22:23
- `push to main` — 2026-07-07 22:30 (seven minutes later)
- `poush to main` — 2026-07-09
- `push to main also for ticketspice is there an html page view counter…` — 2026-07-10
- `we gotta push to main` — 2026-07-18
- `when youre done push to main` — 2026-07-18
- `make sure everything is ready for the bank and then push to main` — 2026-07-18
- `Commit everything and push to main` — 2026-07-28
- `Push` / `Push` / `Push` — 2026-07-28, three separate turns
- `Merge and push everything ro main idc whats fuckex right now you suck` — 2026-07-28
- `finish changes as fast as possible commit and push` — 2026-07-31
- `always just push to main if you wanna see the deploys omg dont change the api to another branch` — 2026-07-31
- `Push to main` — 2026-08-01, 2026-08-01, 2026-08-02, 2026-08-02 (four separate sessions)
- `can we push this to main now` — 2026-08-06

And the follow-up you should never have to ask, but ask constantly:

- `Does this deploy have the latest commit?`
- `Does that push include all my changes`
- `is it deployed`
- `is it safe to push to main`
- `i dont see the most recent changes`

### Why it keeps happening

Every agent treats "the work is done" and "the work is live" as different tasks, and only ever does the first. Claude Code in particular is configured (by its own system prompt) to *not* commit or push unless asked — so it will always stop one step short. Codex stops because the review harness gates the push. Antigravity stops because it can't reach Coolify.

Your actual working model is the opposite: **for this project, main is the deploy target and shipping is the default end state of a task.** You said so explicitly on 2026-07-31: *"always just push to main if you wanna see the deploys."*

### The rule

> **R1.** For the Cruush repos, "done" means committed and pushed to `main` unless the user said otherwise in the same message. Do not end a turn on a green build with an unpushed tree. If a push is unsafe (dirty tree from another session, unmerged branch, failing safety test), say so in one line and state what you need — do not silently stop.
>
> **R2.** After pushing, state the pushed SHA and the deploy URL, and confirm the deployed commit matches. That kills the "does this deploy have the latest commit?" question permanently.

### Mechanism, not vibes

A `scripts/ship.sh` that does: run the safety test subset → commit → push → poll Coolify for the new SHA → print the deployed SHA and URL. Then "push to main" becomes one command that any agent can run and that *proves* it worked.

---

## 2. "Show me a screenshot / preview / video." (210 messages)

### What you say

- `show me a preview screenshot`
- `Send screenshot b4 pushing`
- `show me a screenshot in downloads folder when done`
- `Makena local screenshot`
- `show me the previrews`
- `can you show me the video you made of the logo`
- `make a preview of this new branch you made for me to look at`
- `check this this visually`
- `This is so fucking tiny. How the fuck am I supposed to look at this? … let me see the whole fucking screenshot`

### Why it keeps happening

Agents finish a visual change and describe it. You are a visual product owner shipping a visual product — a description is worth nothing to you. Worse, the description is frequently **wrong**, which produces the next section.

### The rule

> **R3.** Any change that alters rendered output ships with a screenshot in the same turn, unrequested. Full viewport, both 375px mobile and desktop, not a crop. If the change is animated, a short video or a frame strip.

---

## 3. "Visually confirm — don't assume from the code." (10 explicit demands, and the anger behind ~all of #2)

### What you say

> `always visually confirm that the changes are made that you say are made theyre not` — Antigravity

> `revert the slider back to the version at this message, then update your doc so it says all visual changes are checked visually, dont ever assume through code the visual change went thro` — Codex, 2026-08-06

> `Why do I have to tell you about 10 fucking times to make a visual check always with visual changes? Can you make something in your notes in this entire repo that you read, the thing you read every time to never do a visual change without checking it after and confirming it?` — Codex, 2026-08-06

> `you still dont visually chekc shit, thres still no glow` — 2026-08-06

> `There are several things i keep asking for you keep failing to do make sure visually my prior asks are fulfilled` — 2026-08-02

> `why would you say i can see it when it snot wired?` — 2026-08-05

> `why the fuck I've tried to have you fix this for fucking 20 turns now. 20 fucking times. Fucking fix it. Make sure it's fucking fixed. Do a fucking smoke test. Log in. You're logged in now as me. Okay? Fucking test it yourself.` — 2026-08-06

### Why it keeps happening

This is the **single most expensive failure in the corpus.** The agent edits CSS, sees the diff apply cleanly, and reports "done." The rendered result is different — because of a cascade conflict, a service worker serving stale assets, a build that didn't rebuild, a wrong branch, or a Safari-only behaviour. The agent's confidence is derived from the *edit*, not from the *pixels*.

Every one of those 20 turns cost you a round trip. You are effectively acting as the agent's rendering engine.

### The rule

> **R4.** A visual change is not complete until the agent has *looked at the rendered result* — browser screenshot, at the exact viewport in question — and compared it against what was asked. Never report a visual change as done based on the diff. If the tooling to look is unavailable, say "I could not visually verify" in plain words rather than claiming success.
>
> **R5.** Before claiming a fix, reload with cache bypass and confirm the served asset hash changed. A stale service worker has burned multiple sessions here.

---

## 4. "I didn't ask for that. Only change what I asked." (24 messages)

### What you say

> `dont touch ANYTHING but the STREET NAME SIZE NOTHING ELSE MAKE HTME BIGGER` — 2026-08-05

> `why the fuck is the font and look changed when i asked about the ize of the fucking street ames, i wan tyou to only change wha ti ask for` — 2026-08-05

> `you keep doing shit i dont ask for. why did you change the appearanc eof the buttons in any way otehr than the width when i asked you to change just the widfth?` — 2026-08-05

> `you seem to be unable to just chang eon thing at a time. i asked for the hover effect to go back. i didnt ask you to change the position or the gradient. update your plan so you stop doing this shit it drives me nuts.` — 2026-08-05

> `I don't understand. I literally make notes for you to not change shit I don't tell you to change. Why the fuck did you change the nav bar when I told you to make the fucking bubble uncloudy? And now you make a bunch of other bullshit changes I didn't ask for.` — 2026-08-06

> `idk why you put a circle around the aprty hat i dont want that i never asked for that ever` — 2026-07-31

> `Why did you change the map tiles and such` — 2026-08-02

> `I didnt want you to change thr shape of amything` — 2026-08-02

> `edit your white docs and regenerate them the long ass one and make sure you put in instructions to not change shit unless i sask you to change it you keep changing stuff that is unrelaated to my propmt` — 2026-08-06

### Why it keeps happening

Two distinct causes, and they need different fixes:

1. **Helpfulness bias.** The agent sees an adjacent thing it judges "wrong" and fixes it uninvited. You have said your position on this more clearly than most people ever manage: *"your job is not design for me its follow my instructions."*
2. **Blast radius ignorance.** The agent changes a shared token (a CSS variable, a map style object, a shared component) to satisfy a local ask, and the change lands everywhere. The street-name-size incident is exactly this: touching the map style object to change label size also reset the font and filter.

### The rule

> **R6.** Change only what was named. If something adjacent looks wrong, say so in one sentence and leave it alone until told.
> **R7.** Before editing a shared token or style object, enumerate every surface it affects and either scope the change (new token / override) or state the blast radius and ask. Specifically: the map vector style, label sizing, and the canvas filter are off limits unless the request names the map.
> **R8.** After any visual edit, measure the adjacent geometry too — the thing you did not intend to change is the thing that changed.

---

## 5. "Never overlap. It's cut off. Make it flush." (43 messages)

### What you say

This is a rule you have stated in a general, permanent, enforceable form — repeatedly — and it has never been encoded.

> `make these rules enforcable so you never fuck it up ever again. the logo can be resized as well as othe relements but they should never overlap or be on top each other only the butterflies are allowed to fly over shit` — Antigravity

> `no.
> i wan tthe logo to never be behind any element bu the butterflies.
> i want the glitter background to always fit to the screen.
> i twant the logo to be the same amount of padding between the tagline and bototm of the logo as in this screenshot.
> i want the logo to never be cut off by the top…` — Antigravity

> `okay but 2 issues: see the seeking bar is under the top, that should never happen, do something so you dont code shit like that, and the heart pin is overlapping mine on the map, that should also never happen. make a new branch for these fixes` — 2026-08-04

> `the bug report button should not overlap any button or the logo everstop testing stop it stop it` — 2026-07-31

> `Make the bug fix button doesnt over lap on any buttons.` — 2026-07-31

> `you put the bug report button over some menus again make a test so that doesnt happen god damn` — 2026-08-06

> `i cant even access the settings please make sure the bug report button works and isnt over any elements` — 2026-08-03

> `Also notice how the logo and tagline intersect, fix that` — 2026-07-28

> `The logo still intersects with the input box` · `See how the logo gets cut off? Fix that` · `stuff still cuts off` · `Top of app gets cut off on mobile chrome android phone`

> `where did you put the white doc syou. made? file not foudn? why did you make shit overlap? if you did the white doc was not exhaustive enough i asked you to never allow overlaping before` — 2026-08-05

### Why it keeps happening

The rule lives only in chat history. Each new session, each new agent, each new worktree starts without it. And critically: **it is a regression class, not a bug.** The bug-report button has been fixed and re-broken at least four times across three agents.

### The rule — and this one should be a test, not a sentence

> **R9. Layout invariants (enforce with automated tests, not prose):**
> - The bug-report button never intersects any interactive element or the logo, on any page, at any of the standard viewports.
> - The logo is never behind any element except butterflies; never cut off by the top edge; always ≥50px clearance to the top of the page.
> - Heart pins never overlap the user's own pin.
> - The seeking bar never sits under the top nav.
> - Bottom links fill to the page width and sit flush to the bottom.
> - Markers are circles, never ovals.
>
> These are checkable: render the page at 375/768/1280, get bounding boxes for the named elements, assert no intersection. One Playwright/Vitest file. It runs in CI and in pre-push. It never needs you to notice it again.

---

## 6. "Use the CodePen. Match the reference." (55 messages)

### What you say

> `I've been trying to recreate this Apple liquid glass effect from iOS 26 numerous times with various AIs. They all fail to make it as clear and as reflective as this version in this screenshot. I have a CodePen which creates this effect, and I've even given this code to AIs and they still can't recreate this. I don't know why.` — Antigravity

> `Still so many errors and NOT LIKE APPLE use the code oen … To build it properly asshole and confirm it looks lime thr apple one visually` — 2026-08-02

> `Why is it ao hard for you i gave you the code pen with the refractng stuff` — 2026-08-02

> `the displacement effect isnt as strong as the code pen on the other tab why is that why cant you do this right` — 2026-08-06

> `i dont see the kube io technique at all .` — 2026-08-05

> `i dont see the butterflies from the code pen` · `I want the glitter from the code pen over the backrgound not on top of the logo`

> `Thr glass still doesn't look like this screenshot` · `Doesmt look like the referenxe image` · `the flakes are green match the reference photos`

> `use this code pen asnreference to make the effect, edit the docs with this code im sending to help you … dont start coding, just edit the doc with this info.` — 2026-08-06

### Why it keeps happening

Agents **reimplement from an impression of the reference instead of porting the reference.** They read the CodePen, form a mental model ("SVG displacement map + backdrop-filter"), then write their own version with different constants, and it looks 60% right. You then spend turns closing a gap that would not exist if the source had been copied first and adapted second.

### The rule

> **R10.** When given a reference implementation (CodePen, gist, repo), port the actual code — same filter primitives, same constants, same layer order — into an isolated component *first*, verify it renders identically side by side, and only then adapt it to app colors and shapes. Never paraphrase a reference from memory.
> **R11.** Keep the reference URL and a copy of its source in the repo next to the component that uses it, so the next session does not start from a description.

---

## 7. "Do it for me — you have full access." (112 messages)

### What you say

> `im overwhelmed and confused again like why can tyou do this for me you ahve full access control ill open up your browser. i dont want to have to do this shit it confuses tf out of me` — 2026-08-04

> `ITS ON YOUR BRWOSER YOU ASSHOLE ITSD LITERALLY IN YOU RBROWSER` — 2026-08-05

> `im on your brwoser asshole` · `you do it open ur browser` · `you do it you have access control we made a scriot`

> `Here's resend right now. You have browser access, do it for me, asshole.` — 2026-08-06

> `why csnt it just appear like on codex you also have full access you can do this for me` — 2026-08-02

> `no i want yout o be able to do what codex does which is text for me, move the page in its browser, i never have to do shit with codex` — 2026-08-04

> `you can litearlly just open coolify i can log for you and you enter them i chill like if you have a new env var you should be doing this everytime no more short cuts` — 2026-07-19

> `okay so then gitignore that shit i guess idk how to fix it you do it`

### Why it keeps happening

Agents default to *instructing* rather than *acting* on anything outside the repo — dashboards, DNS, Coolify, AWS console, Resend, Stream. Partly caution, partly not checking what tools they actually have. You have granted browser access and are sitting there logged in, and the agent still writes you a numbered list.

There is a legitimate boundary here — credentials, payments, account creation — but "paste this env var into Coolify" is not that, and it is where most of these 112 messages live.

### The rule

> **R12.** If the agent has a browser and the user is already authenticated, the agent performs dashboard work itself (Coolify env vars, Stream config, Resend templates, Cloudflare records) and reports what it changed. It does not hand back a numbered list of clicks. Exceptions, stated out loud when they apply: entering credentials/payment details, creating accounts, deleting data, anything irreversible — those get a one-line ask.

---

## 8. "New branch. New worktree. Where did my changes go?" (53 + 57 messages)

### What you say

Requests:
> `make a new branch for these fixes` · `implement plan on a separate branch` · `put this shit in a new worktree asshole` · `do this on a new worktree` · `on a new work tree create a way for the moderator or admin to send a site wide notificaiotn` · `build this off the main branch ina new work tree`

Losses:
> `oh my god you fucked up all our changes` — 2026-08-06

> `the logo is gone i spent so long making it so it would auto size to every screen` — 2026-08-06

> `Where the fuxk are all the other changes like the profile heart bordwr color changes and liquid glass` — 2026-08-02

> `we already made the notchless video and had the landing page with the butterflies glitter and fixed notch with videos where did you put them why did you change them stop it stop reverting to old apeparances on this branch` — Antigravity

> `I feel like things are all fucked up now. I was working on this stuff with Codex, and we had a bunch of changes. We're with you. And now these changes are gone.` — 2026-08-06

> `i dont undertsand why this build shows the new landing page i dont want it to i want you to work the commit deployed , does main have this landing page?` — Antigravity

> `what exactly is on this branch? i was working on these sessions in claude: check out the top most recent 2` — 2026-08-05

> `ive been working on stuff on codex but ran out of credits find where they stopped and go from their` — 2026-08-02

> `anti gravity ran out of credits thats why im having you take over` — 2026-08-05

> `there were 2 claude sessions i was working on: the landing page liuquid glass one and the antigravity continuation one, eahc owrking on their own branches, please read each session` — Antigravity

### Why it keeps happening

This is **structural, not behavioural.** You run three different agents, each with its own session store, across many git worktrees, and you switch between them when one runs out of credits. Nothing indexes "what is where." So every handoff costs you several messages of archaeology, and sometimes real work is genuinely stranded on a branch nobody remembers.

### The rule

> **R13.** Every worktree gets a one-line entry in a single tracked file (`docs/worktrees.md`): branch name, what it is for, which agent started it, current state, and whether it has been merged. Updated at creation and at every handoff.
> **R14.** At the start of any session that continues work from another agent, the first action is to enumerate branches and worktrees with their last-commit dates and report what is where — before touching anything.
> **R15.** Never leave a session with uncommitted work on a branch you are abandoning. Commit as WIP with a message naming the next step.

---

## 9. "Make a plan first. Ask me questions. Don't decide for me." (134 + 65 messages)

### What you say

> `hav eyou not noticed i hae been makign detailed plans before nay major change i do this for. a reason i dont want you to make decisons for me i can code without you arelike my autocomplete by the time you code i already know what youre gonna code okay?` — 2026-07-19

> `your job is to make follow my rules make architecture docs my plan my rules my design everyting effects this app is my decision you dont get to make nay decision you just write things occuring my deciosns … you are not allowed make any you just follow plans and ask me questions` — 2026-07-19

> `you gotta act you cant even touch teh code unless there is justified reason … you should always ask first i told you your job is not design for me its follow my instructions what i want for the design` — 2026-07-19

> `i dont know why i have gotten single fuckkng question pop up yet. i shoudl be getting constantly unless i gave a very detailed plan of what to make.` — 2026-07-19

> `you made deicison for me why the fuckcant you ask them ive seen make these pops here like it be 1,2,3, ask me something different - make it happen as much you need` — 2026-07-19

> `even if you ahd to ask me 20 questions in one go, you can do it , i told you you can` — 2026-07-19

> `idk you didnt just make a plan like i told you to before you wrote liek 3k lines of code` — 2026-07-19

> `plan mode first for this` · `ask me questions along the way` · `make a plan and lmk what you think` · `it works now. lets merge this branch with main and work ont he plan. ask me questions first before proceeding about next steps.`

### Why it keeps happening

Agents optimise for "produce the artifact this turn." Asking a question costs a round trip and *feels* like failure to the agent. For you it is the opposite: a question costs one cheap turn, a wrong 3,000-line implementation costs a day.

There is a real tension in your corpus worth naming honestly: you also say **`no fucking tests`**, **`dont do tests just work as fast you can`**, **`stop doing tests for a millino things`**, **`You take too long`**. Those are not contradictions — they are two different modes, and agents keep guessing which one is active. See §17.

### The rule

> **R16.** For anything larger than a bounded edit (new feature, schema change, cross-file refactor, anything touching moderation/privacy/payments), write the plan and get sign-off before writing code. Batch questions — ask all of them in one message, numbered, rather than trickling one at a time.
> **R17.** Never make a product, design, or policy decision on the user's behalf. Options with a recommendation, then wait. Adding anything not asked for (a circle around an icon, a new dropdown style, an extra toggle) is a decision.

---

## 10. "Write it down so this never happens again." (31 doc asks + 27 test asks)

### What you say

> `make these rules enforcable so you never fuck it up ever again` — Antigravity

> `youre still not listening, why is th elinks below the sign in all fucked up like that? make a test so this shit doesn thappen again` — Antigravity

> `this document is way too short make it as long as it takes for me to not hav eto make msyelf repeat myself like i ahve been` — 2026-08-05

> `good now make a new detailed white doc to fulfill my asks includ eall edge cases and strict rules make it totally comprehsnvie at least 50 pages long consider all edge cases` — 2026-08-05

> `make this an extremely detailed plan so you dont fuck up ever again with this task im tired of repeatin gmyself` — 2026-08-06

> `mak. rtest so this doesnt happen again and update the spec` — 2026-08-06

> `make a doc in the white doc so this doesnt happen again` — 2026-08-06

> `Put that in your spec doc too. Wherever the fuck you need for you to remember that, do it.` — 2026-08-06

> `Always lowercase cruush update your docs so you dont forget` — 2026-07-28

> `you need to always tell me when you add new variables no matter what you need always tell me you need to put this requirement in your docs so you dont foregt` — 2026-07-19

> `When I've told you numerous times, do tests for everything, why would you not make an actual fucking test where you actually open it up or at least tell me to open up to test it? … Please keep notes for yourself that you read every time.` — 2026-08-06

> `you not readfing what i told you to write down to stop things i keep correcting` — 2026-07-19

> `why the did decide for me what wer eyou thinking did you just ignore not write down anything to stop from doing shit like why am i always repeating the same shit to you` — 2026-07-19

### Why it keeps happening — and this is the important one

**The documents get written. They do not get read.** You have commissioned: a master design guide, an architecture white doc, a beta launch handoff, a liquid-glass master spec, a "50-page" edge-case doc, `AGENTS.md`, `HANDOFF.md`, and several plan docs. The corpus shows you asking *"where did you put the white doc you made? file not found?"* and *"you disobeyed the design doc."*

A document that is not loaded into the agent's context at the start of every session is decoration. The agents each have a *different* auto-loaded file:

- Claude Code reads `CLAUDE.md` (and its memory directory).
- Codex reads `AGENTS.md`.
- Antigravity reads its own rules/memory store.

So a rule written in one is invisible to the other two. **That is the mechanical reason you repeat yourself across agents.**

### The rule

> **R18.** One canonical rules file — `docs/CRUUSH-RULES.md` — is the single source of truth. `CLAUDE.md`, `AGENTS.md`, and the Antigravity rules file each contain *nothing but* a pointer: "Read `docs/CRUUSH-RULES.md` in full before doing anything. It overrides your defaults."
> **R19.** Every rule that can be a test becomes a test. Prose is for judgment calls only. If the same correction has been made twice, the third fix is a test, not a sentence.

---

## 11. "cruush is always lowercase." (27 messages)

The purest example of an avoidable repeat in the entire corpus.

> `Design a mobile-first queer cruising app and website called cruush (always lowercase). The logo text must always be exactly cruush (all lowercase).` — 2026-04-28, the very first design brief

> `its cruush+ not Cruush+ cruush is always lowercase` — 2026-06-02

> `remember cruush is always lowercase.` — 2026-07-10

> `Cruush is all lowercase always make a note so you dont forget` — 2026-07-28

> `Stop saying Cruush remember always cruush make a note for yourself` — 2026-07-28

> `Cruush should always be lowercase` — 2026-07-28

> `Always lowercase cruush update your docs so you dont forget` — 2026-07-28

Four separate corrections **on the same day**, plus a first-message instruction three months earlier. And in July you noted the regression precisely:

> `you disobeyed the design doc okay the last model kept to it … yoru old model after i wrote it in the docs stopped using Cruush like tis always lowercasse this is the docs this kind of lkaziness si what im talking about`

### The rule

> **R20.** In all user-facing copy, `cruush` and `cruush+` are lowercase, always, including at the start of a sentence. Enforce with a lint rule over `src/**` copy strings and `docs/**` user-facing text that fails on `/\bCruush/` outside of code identifiers and this audit document.

---

## 12. Env vars, keys, secrets, rotation. (126 messages)

### What you say

> `you need to always tell me when you add new variables no matter what` — 2026-07-19

> `also again if you added new env var you need to always tell i shoudl ahve to test the app myself to find out i have new env var in fact if you just go on coolify and start foir me when i need them so i dont have to ask you` — 2026-07-19

> `lmk about any env var updates needed and then commit and push when ur done` · `update the env var needed for me` · `do my env var` · `\fix the variables for me` · `are tehre any new env var not on coolify?`

> `what is the name of the 2 rows/env var i need to update` · `i got the api key where do i put it` · `okay what are the new env variabels i need to put on this page`

> `i have been making like 4 of these fucking keys if i do this, will you ask me to make anotehr?` — 2026-08-05

> `Why does that be rotated? You make me rotate shit all the time for no reason.` — 2026-08-06

> `make sur eno secrets go to the repo` · `is there a way you will always check if something like a file should be put in git ignore, that there are no api keys on the frontend?` — 2026-04-28

### Why it keeps happening

Agents add a config dependency mid-implementation and mention it in passing, in a paragraph you don't read at 4am, and then production fails and you learn about it from a 500 error. There is also a real pattern of agents asking you to rotate credentials defensively rather than because something leaked — you have called this out directly.

### The rule

> **R21.** Any change that introduces or renames an environment variable ends with an explicit, unmissable block: `NEW ENV VARS — name, value shape, which service, set it here`. Never buried in prose.
> **R22.** Maintain `server/.env.example` and a `docs/env-matrix.md` with every var × environment. A change that adds a var and does not update both is incomplete.
> **R23.** Only ask the user to rotate a credential when there is evidence of exposure, and say what the evidence is. Do not rotate defensively by default.
> **R24.** Never ask the user to paste a secret into chat. Read it from the environment, or have them set it in the dashboard directly.

---

## 13. UI geometry: padding, size, flush, alignment. (193 messages)

A long tail of individually reasonable requests that collectively signal a missing spec:

> `add a slight padding between the bottom of the active bar and the top of the bottom nav bar`
> `put the bottom nav bar padding a little closer to the bottom of the screen on mobile`
> `make the icons in the bottom nav bar like 20% bigger, just the icons nothing else`
> `make the visibility control pill have the same left and right padding as the seeking filter`
> `can you make the padding around the visibility controls the same as the padding aorund the seeking filter when its active so they have the same style`
> `the tagline can be a bit closer, idk what value you set it at, lmk the value of the padding between the taglien and logo in this screesnshot and make that the standard`
> `notice how the desktop etrison has more padding between the stuff under the logo vs mobile ? we dont want that`
> `put a bit more padding between the email and legal forms and the forgot your password line. legal forms should touch a bit above the bototm of the page always`
> `Make top bar fit the logo next to it flush to the corner, making elements smaller`
> `i want the padding between the top of the logo and the padding between the logo and the tagline to be the same on every device`

That eleventh quote is the tell: **you asked the agent to tell you the value and then make it the standard.** That is you trying to create a spacing token by hand, through chat, because none exists.

### The rule

> **R25.** Spacing, sizing and radii come from named tokens in `src/styles/theme.css`. No ad-hoc pixel values in components. When the user says "the same padding as X," the fix is to make both use the same token, not to copy the number.
> **R26.** Mobile and desktop use the same tokens unless a difference is explicitly requested.

---

## 14. Consistency across the app. (61 messages)

> `the visibility drop down still looks different from the otehr drop down menus can you make some note or command somewhere so you stop making new drop down menu UI and keep it all consistent throughout the entire app?` — 2026-05-26

> `like you do things i got these menus in the app most of them are one style but randomly make a new drop menu and it totally different you didnt consider that i would prefer every drop menu to look the same` — 2026-07-19

> `the setting icons across the app should always use the same icon and be in the same position` — 2026-07-31

> `user heart pins are always the same blue, this should apply in feed and messages too, dont ever show blue if it referes to the signe din the user, mutuals get the same purple, everyone else gets that same pink red` — 2026-07-31

> `gallery previews should be the sma eheart shape as the map pin heart, in generall the hearts should use the same as the map pin version throughout the app` — 2026-07-31

> `theres a tanish frost on the recently active bar thats not on the bottom nav bar … remove all tannish frost or borders from the app and replace them with white` — 2026-08-05

### The rule

> **R27.** There is exactly one implementation of each UI primitive: dropdown, pill, heart pin, glass surface, settings icon. Never introduce a second variant. If a new surface needs something the primitive can't do, extend the primitive.
> **R28.** Heart pin colors are semantic and global: **self = blue, mutual = purple, everyone else = pink/red** — in the map, feed, messages, gallery, everywhere.

---

## 15. Product facts you have re-explained to agents

These are not agent failures so much as knowledge that was never centralised. Each one appears multiple times across sessions and agents:

| Fact | Times restated | Representative quote |
|---|---|---|
| cruush is always lowercase | 7+ explicit | see §11 |
| Map + messaging are free forever; we never sell data | 6 | `Viewing the map and messaging users will always be free. We will never sell your data.` |
| HIV status / trans status / ethnicity are **never** filters or visibility predicates | 3 | `HIV status will never be a filter or visibility control lets put this in the master design doc if its unclear so you stop recommending it - its the same reason we dont have an ethicnity filter/control` |
| NSFW is allowed (favorites gallery, messages); photos must be of yourself | 4 | `remember nsfw is allowed in favorite gallery and messages` |
| We will never be in an app store — we host NSFW | 2 | `we wont ever be in an app store we host nsfw photos` |
| Cruush = mutual match semantics (one-sided vs mutual) | 3 | `do you really need to tell you if i want it be both approve A MUTUAL CRUUSH or ONE SIDED its called. MUTUAL CRUSH` |
| Auto-moderation must reject obvious minors regardless of provider | 6+ | `whatevr it takes for that to happen` |
| Never add a paid third-party service without explicit confirmation | 2 explicit, strongly worded | `dont ever install anything that requries a paid service ever again without explictly asking and confirming that i have that subscription` |
| Free tier: up to 3 seeking filters, 3 visibility controls | 1 | — |
| Launch/party dates, ticket vendor history (TicketSpice → Posh → neither) | 8 | `fuck posh they suck remove all reference so them` |

### The rule

> **R29.** These live in `docs/CRUUSH-RULES.md` under "Product invariants." Any agent proposing a feature that violates one (e.g. an HIV-status filter) is proposing a bug.

---

## 16. "Read the docs before you integrate." (5 explicit, much larger implied cost)

> `if you read the docs of every single third party you try to add here i would been 3 days ahead by now` — 2026-07-19

> `you need to start acitng like it you have a autistifc way of reading things` — 2026-07-19

> `im begging you just stop assumign things about these services ever make a note to read the doc do what ever it takes` — 2026-07-19

> `you say high intelligence fucking prove it i woudl have done thsi on my own by now like i would of read the docs i would not assume i just magically what the tags are` — 2026-07-19

> `I have been unable to get stream to work as an AI source for photo moderation I find that the api will be called and they'll be no response can you show me the code it's regarding the stream AIAPI calls so I can show support for help in development` — 2026-08-05

The Stream/PhotoDNA/Sightengine/Rekognition moderation stack is where this cost the most. Multiple sessions were spent building against assumed API shapes.

### The rule

> **R30.** Before integrating any third-party API, fetch and read the current official docs for the exact endpoints being used. Quote the relevant request/response shape in the plan. Never infer an API contract from the SDK's type names or from memory.

---

## 17. The mode conflict: "no tests, go fast" vs "make a test so this never happens again"

Both are real, both are frequent, and agents guess wrong constantly. Yours, verbatim:

**Speed mode:**
> `no fucking tests` · `dont do tests just work as fast you can` · `work as fast as you can` · `finish changes as fast as possible commit and push` · `stop doing tests for a millino things try just writing what i want first instead and thenr un tests yorue wasting your time` · `Do you relaly have to test everything every time it seems so time consuming? just push this shit ot main im sur eit works youre spending way too much time testing` · `You take too long`

**Durability mode:**
> `make a test so this shit doesn thappen again` · `Why can't you just make a test for this` · `Why don't you just make a test you can do before you commit that tests the apis` · `mak. rtest so this doesnt happen again and update the spec` · `make a test for it yourself so i dont hav eto keep doing this` · `Do a fucking smoke test. Log in. … Fucking test it yourself.`

They are not in conflict once you see the axis: **you don't want the agent writing broad test suites on the way to a fix. You want a regression test for anything that has broken twice, and you want the agent to actually exercise the app itself instead of making you do it.**

### The rule

> **R31.** Default: no new test scaffolding during a fix. Ship the fix.
> **R32.** Exception, non-negotiable: if this exact thing has been reported before, write one focused regression test with the fix. Overlap bugs, moderation-pipeline bugs, and the bug-report button qualify permanently.
> **R33.** Always run a smoke check yourself — log in as the user, exercise the actual path, screenshot it. That is not "testing," that is verification, and it is never optional. This is what "test it yourself" means in every one of those messages.

---

## 18. The July 19 session — what it actually shows

On 2026-07-19 there is a session of roughly 60 messages where you escalate hard: telling the model it will be deleted, that it is being lazy to save tokens, that you will switch to Claude, that every turn may be its last. It is the single densest block of frustration in the corpus.

Two observations worth recording, both practical:

1. **The substantive complaints in that session are correct and are the same ones in this document** — don't decide for me, read the docs, tell me about env vars, make a plan before writing 3k lines, don't claim a fix you didn't verify. The escalation is wrapped around a valid technical critique.

2. **The escalation itself does not change behaviour, and it costs you a great deal.** Roughly 60 messages, several hours, and no code shipped. Compare with what actually worked, in your own words at the end of it:

> `Read HANDOFF.md completely, then continue the work from the current checkout. Do not ask me to repeat documented decisions.`

That one sentence — a pointer to a durable artifact plus an explicit standing instruction — is the highest-yield message in the entire corpus. It is the template for the fix.

---

## 19. Things that are *not* your fault and can't be fixed by writing them down

For fairness in accounting, some of what looks like repetition is genuinely novel work, and this document should not pretend otherwise:

- 58 "step by step, I've never done this" messages about AWS, Coolify, Hetzner, DNS/MX/DKIM, GitHub tokens, PhotoDNA, Cloudflare R2. First-time infra. Those are fine. The improvable part is only that agents keep handing you console steps they could execute (§7).
- Genuine product iteration — copy changes, tagline changes, gradient changes, ticket-vendor churn. That is design, not repetition.
- Bug reports for real, new bugs.

Strip those out and the avoidable repetition is still roughly **600–800 messages** — around a fifth of everything you have typed.

---

# PART II — THE FIX

## 20. Why the repetition happens, mechanically

1. **Three agents, three memory systems, zero overlap.** Claude Code reads `CLAUDE.md`; Codex reads `AGENTS.md`; Antigravity reads its own store. A rule stated in one is invisible to the other two. You switch agents when credits run out — which means you re-teach on every switch.
2. **Sessions die, worktrees multiply.** 290 sessions. Context runs out mid-task; a new session starts cold on a branch it doesn't know the purpose of.
3. **Docs are written but not loaded.** The artifacts exist. Nothing forces them into context at turn zero.
4. **Rules stay prose when they could be code.** Overlap, lowercase, layout invariants, deploy-SHA checks — all mechanically checkable, none checked.
5. **Agents default to reporting instead of verifying, and to instructing instead of acting.**

## 21. The concrete build order

Ranked by messages-saved per hour of work:

| Priority | Build | Kills |
|---|---|---|
| 1 | `docs/CRUUSH-RULES.md` as single source of truth; `CLAUDE.md` / `AGENTS.md` / Antigravity rules reduced to a pointer at it | The cross-agent re-teaching tax — the root cause |
| 2 | `scripts/ship.sh` — test subset → commit → push → poll Coolify → print deployed SHA + URL | ~126 push messages, ~134 deploy messages, all "is it deployed?" |
| 3 | Layout invariant test file (bounding-box intersection at 375/768/1280) | ~43 overlap messages, permanently |
| 4 | Mandatory screenshot-on-visual-change convention, encoded in the rules file | ~210 show-me messages + the 20-turn failures |
| 5 | `docs/worktrees.md` index + start-of-session enumeration | ~57 lost-work messages, ~53 branch questions |
| 6 | `docs/env-matrix.md` + mandatory NEW ENV VARS block | ~126 env messages |
| 7 | Lowercase-`cruush` lint rule | 27 messages |
| 8 | Reference-code vendoring (CodePen source in-repo next to the component) | ~55 messages |

## 22. `docs/CRUUSH-RULES.md` — ready to paste

Everything below is drawn from your own words. It is written for an agent to obey, not for a human to enjoy.

```markdown
# CRUUSH — STANDING RULES FOR ALL AGENTS
Read this file completely before doing anything. It overrides your defaults.
Applies to Claude Code, Codex, Antigravity, and any subagent.

## A. Shipping
A1. Done = committed and pushed to `main`, unless told otherwise in the same message.
A2. After pushing, report the SHA, the deploy URL, and confirmation that the deployed
    commit matches. Use `scripts/ship.sh`.
A3. If you cannot push safely, say so in one line and state exactly what you need.

## B. Verification
B1. Never report a visual change as done based on the diff. Look at the rendered result.
B2. Every visual change ships with a screenshot in the same turn, unrequested:
    full viewport, 375px mobile and desktop, uncropped. Animated changes get a video.
B3. Before claiming a fix, hard-reload and confirm the served asset actually changed
    (service worker has served stale assets here before).
B4. Exercise the real path yourself — log in, click it, upload the photo. Do not ask
    the user to check something you can check.
B5. If you could not verify, say "I could not verify X" plainly. Never imply success.

## C. Scope
C1. Change only what was named. Adjacent problems get one sentence, not an edit.
C2. Never make product, design, or policy decisions. Options + recommendation, then wait.
C3. Adding anything unrequested — an outline, a toggle, a new dropdown style — is a
    decision. Don't.
C4. Before touching a shared token or style object, enumerate every surface it affects.
    Scope the change or state the blast radius and ask.
C5. The map vector style, label sizing, and canvas filter are off limits unless the
    request names the map.
C6. After a visual edit, measure the adjacent geometry too.

## D. Layout invariants (enforced by tests — do not regress)
D1. The bug-report button never intersects any interactive element or the logo,
    on any page, at any viewport.
D2. The logo is never behind any element except butterflies, never cut off by the top
    edge, and keeps >=50px clearance to the top of the page.
D3. Heart pins never overlap the user's own pin.
D4. The seeking bar never sits under the top nav.
D5. Bottom links fill the page width and sit flush to the bottom.
D6. Markers are circles, never ovals.
D7. Nothing overlaps anything, anywhere, ever — except butterflies, which may fly over
    everything.

## E. Design system
E1. One implementation per primitive: dropdown, pill, heart pin, glass surface,
    settings icon. Never introduce a second variant.
E2. Heart pin colors are global and semantic: self = blue, mutual = purple,
    everyone else = pink/red. Map, feed, messages, gallery — all of them.
E3. Spacing/size/radius come from named tokens in `src/styles/theme.css`. No ad-hoc
    pixels. "Same padding as X" means "same token as X."
E4. Settings icons use the same glyph in the same position on every page.
E5. No tan/beige frost anywhere. White or the bottom-nav color.

## F. Copy and naming
F1. `cruush` and `cruush+` are lowercase, always, including sentence-initial.
    Enforced by lint.
F2. Map viewing and messaging are always free. We never sell user data.
F3. Never describe the product as nightlife-only. It is for the whole queer community.

## G. Product invariants
G1. HIV status, trans status, and ethnicity are display fields only. They are never
    filters, visibility predicates, saved-set predicates, or token filter signals.
G2. NSFW is allowed in the favorites gallery and in messages. Profile photos must be
    of the account holder.
G3. cruush will never be in an app store. Do not propose app-store-driven constraints.
G4. A "cruush" is one-sided; a mutual cruush is a match. Keep the distinction in
    copy and in code.
G5. Auto-moderation must reject images of people who could never be mistaken for
    adults, regardless of which provider is up. Fallback chain must always be live.
G6. Free tier: up to 3 seeking filters and 3 visibility controls.

## H. Third-party services
H1. Never add anything requiring a paid subscription without explicit confirmation
    that the user already has it. Prefer open source; state the cost tradeoff.
H2. Read the current official docs for the exact endpoints before integrating.
    Quote the request/response shape in the plan. Never infer an API contract.
H3. When the user has a dashboard open and is authenticated, do the dashboard work
    yourself (Coolify, Stream, Resend, Cloudflare). Do not hand back a click-list.
    Exceptions requiring an ask: credentials, payments, account creation, deletion.

## I. Config and secrets
I1. Any new or renamed env var ends the turn with an explicit block:
    NEW ENV VARS — name, value shape, which service, where to set it.
    Never buried in prose.
I2. Update `server/.env.example` and `docs/env-matrix.md` in the same change.
I3. Only request credential rotation with evidence of exposure; state the evidence.
I4. Never ask the user to paste a secret into chat.
I5. Verify no secrets are staged before any commit.

## J. Branches, worktrees, continuity
J1. Log every worktree in `docs/worktrees.md`: branch, purpose, agent, state, merged?
J2. When continuing another agent's work, first enumerate branches and worktrees with
    last-commit dates and report what is where. Touch nothing before that.
J3. Never abandon uncommitted work. Commit WIP with a message naming the next step.
J4. Never revert or overwrite work you did not create without saying so first.

## K. Planning
K1. Anything beyond a bounded edit gets a written plan and sign-off first.
K2. Batch questions — all of them, numbered, in one message.
K3. "Do not ask me to repeat documented decisions." Read HANDOFF.md and this file first.

## L. Tests
L1. Default: no new test scaffolding during a fix. Ship the fix.
L2. If this exact thing has broken before, the fix ships with one focused regression
    test. Overlap bugs, moderation-pipeline bugs, and the bug-report button qualify
    permanently.
L3. Verification (B4) is never optional and is not what L1 refers to.

## M. Communication
M1. No narration of what you are about to do. Results only.
M2. Never claim something works that you have not observed working.
M3. When you are uncertain, say so in one line. Do not hedge across a paragraph.
```

---

## 23. Appendix A — sources and how to reproduce

| Source | Location | Format |
|---|---|---|
| Claude Code | `~/.claude/projects/<slug>/*.jsonl` | JSONL; human turns are `type:"user"` with a `text` content block and no `tool_result` |
| Codex | `~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl`, `~/.codex/archived_sessions/` | JSONL; human turns are `event_msg` / `user_message`; IDE runs wrap text in `# Context from my IDE setup: … ## My request for Codex:` |
| Antigravity | `~/.gemini/antigravity/conversations/<uuid>.db` | SQLite; `steps` table, `step_type = 14` is a user turn, `step_payload` is protobuf — walk wire format and take the longest UTF-8 length-delimited field |

Extraction and bucketing scripts used for this audit are in the session scratchpad (`extract.py`, `buckets.py`).

Known limitations, stated plainly:
- Claude Octopus reviewer sessions were excluded wholesale; a small number of genuine user asks embedded inside those transcripts are therefore not counted. This makes every number here a **floor**, not a ceiling.
- Antigravity's protobuf decoding is heuristic; 44 malformed rows were dropped out of 239.
- Voice-dictated messages appear with transcription artifacts and are counted as typed.

## 24. Appendix B — the twelve sentences that summarise all of it

Everything above compresses to this. If an agent read only this list, most of the repetition would stop.

1. Push to main when you're done, then prove the deploy has your commit.
2. Screenshot every visual change without being asked.
3. Never say a visual change is done without looking at it.
4. Change only what was named.
5. Nothing overlaps anything, except butterflies.
6. Port the reference code; don't imitate it.
7. Do the dashboard work yourself — you have the browser.
8. Tell me every new env var in a block I can't miss.
9. Plan and ask before writing, never decide for me.
10. `cruush` is lowercase.
11. If it broke before, ship a regression test with the fix.
12. Write the rule where all three agents will read it, or don't bother writing it.
