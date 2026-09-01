# Session Plan: rebuild the cruush+ checkout for conversion

**Created:** 2026-09-01
**Intent contract:** `.claude/session-intent.md`
**Target:** `src/app/components/CruushPlusStore.tsx` on `feat/crypto-pricing`

**Current status:** DELIVER verified. Seven branch-present benefit labels, one
visible recommended plan, collapsed comparison, three named payment sources,
CTA, then the crypto explainer. Monthly rates are prominent on the right and
charged totals sit under the term on the left. Restored unavailable rails stay
selected and locked through paid. The watcher now uses durable per-intent chain
positions, canonical block timestamps, chain-ID preflight, and an atomic
exact-rail evidence re-sum. Lifetime and reconciliation races are closed. Final
focused tests, builds, security review, PostgreSQL checks, and rendered desktop
and mobile checkout inspection passed. Wallet handoff and feature-branch
publication remain.

## What you end up with

One phone screen where a member can see what cruush+ gives them, see a
recommended price, and pay, without scrolling. Every change below is tied either
to published benchmark evidence or to a decision that is explicitly yours.

## What the research says

Sources: RevenueCat's State of Subscription Apps 2026, Adapty's 2026 paywall
analysis, and Airbridge's structural paywall work.

| Finding | Number | What it implies for /store |
| --- | --- | --- |
| Dating apps convert at a median 5.2% with no trial, 8.7% with one | 5.2% vs 8.7% | A trial is the single largest lever available, and cruush has none |
| Price anchoring showing a savings percentage | +14 to 22% | Already built and working; keep it |
| Feature comparison on the paywall itself | doubles trial starts | The benefits list belongs on this page, which it is |
| Weekly plans now carry 55.6% of subscription revenue | 55.6% | The weekly plan is an asset, not a decoy, and should not be buried |
| Apps running 14+ paywall experiments a year | up to 40x revenue | Whatever ships first is a starting point, not an answer |

Two things the research does **not** support, and which I will not do unless you
ask: inventing social proof, and adding a countdown or any manufactured urgency.
The founder counters already on the page are real scarcity, which is different.

## The problems, in order of what they cost

1. **Prices are below the fold.** Six full-width gradient benefit tiles occupy
   the entire first screen at 390px. The first price is clipped at the bottom
   edge. This is the largest single problem on the page.
2. **Nothing is recommended.** Seven options presented flat. The research is
   consistent that a recommended tier is what moves buyers up.
3. **Seven equal-weight gradient bars.** Everything shouts, so nothing reads. This
   one is my doing: you asked for the full list visible and I gave every item
   identical maximum emphasis.
4. **"Why cruush takes crypto" sits between the pitch and the prices**, pushing
   prices further down. It answers an objection, so it belongs after the ask.

## Phases

DISCOVER ████ 10%
Done. The research above.

DEFINE ████████████ 30%
Your decisions, before any code. Four questions in the section below.

DEVELOP ████████████████ 40%
Rebuild the page order and hierarchy against those answers.

DELIVER ████████ 20%
Render at 390x844, screenshot, and confirm prices sit above the fold. Update the
conversion tests that pin default selection, savings maths, and scarcity.

## Debate checkpoint: closed 2026-09-01

The question was whether a trial is worth adding, since the benchmark gap
between no trial and trial is the largest single number in the research, 5.2%
against 8.7%.

Julien closed it, correctly: a trial converts by charging automatically when it
ends, and the crypto rail cannot renew. The page says so in its own copy,
"nothing is billed to you again". A trial on this rail would be free access that
expires with no mechanism to convert, leaving a manual re-purchase as the only
path, which is a worse funnel than selling the term outright.

Two consequences worth carrying forward. First, the trial benchmark does not
apply to cruush on crypto, so the structural levers below are the whole toolkit
rather than the consolation prize. Second, this is a property of the rail and
not of cruush: the Verotel card rail does support recurring billing, so a trial
becomes a real option there. If a trial is ever wanted, it belongs to the card
rail and should be designed with it, not retrofitted here.

The deeper business consequence is worth stating plainly: with one-time payments
only, cruush has no recurring revenue on this rail. Every renewal is a fresh
conversion that has to be won again. That raises the value of the longer terms
considerably, and is an argument for making the annual and lifetime options more
prominent rather than less.

## Answers, from research rather than from asking

These were put to Julien as questions. He pointed out, correctly, that research
could answer them, and that asking him was offloading work.

**1. Order of the screen.** Apphud's paywall guidance is explicit: "Start with
the headline (value), followed by a few visual feature highlights, then pricing,
and finally a strong CTA," and "keep important info above the fold." So benefits
do come before prices, but the operative phrase is *a few*. The current page
fails on the second half, not the first: six full-width tiles are not a few, and
they push the price off the screen.

**2. Recommended plan.** Same source: "make the recommended plan visually
dominant" and "default to the plan that delivers the most value." Currently the
default is correct in code but invisible on screen, since every tile is styled
identically apart from a thin border. The recommendation is the founder year at
$99.99: the best per-month figure, real scarcity, and, given that this rail has
no recurring revenue, a year of not having to win the sale again.

**3. How many benefits.** The guidance is "use bullet points, icons, or short
feature highlights" and "keep total text under 100 to 150 words, ideally less."
The seven branch-present benefit categories were full sentences rendered as tall gradient
blocks. The word count was inside the budget; the vertical space was not. Keep
all seven, but make each compact enough that the price stays near the first
viewport. Do not sell free text posting or basic nearby-profile browsing as
paid features.

**4. Trial.** Closed by Julien. No trial; the crypto rail cannot renew.

## The finding that outranks all of the above

Adapty's experiments playbook puts pricing experiments at up to 80% uplift and
visual optimisation at up to 30%, and warns that "visual-only tests have the
lowest win rate of any category. When you optimize visual conversion before
finding the right price, you're routing more users to a potentially underpriced
offer." It also argues the success metric should be ARPU, not conversion rate.

Julien resolved the pricing issue directly: six months is **$65.94 total,
$10.99/month**. Regular annual remains **$119.99 total, $10.00/month** and
founder annual remains **$99.99 total, $8.33/month**. For terms of at least one
month, the monthly comparison now gets the prominent right-hand position and
the exact charged total sits under the term on the left. Weekly and lifetime
show their one-payment price because a monthly equivalent would mislead.

## Provider availability

🔴 Codex CLI: Available ✓
🧭 Antigravity CLI: Available ✓
🟤 OpenCode: Available ✓
🟢 Copilot CLI: Not installed ✗
🟠 Qwen CLI: Not installed ✗
⚫ Ollama: Available ✓
🔵 Claude: Available ✓
🟣 Perplexity: Not configured ✗

## Success criteria

- Prices visible without scrolling at 390x844
- One plan visually recommended and pre-selected
- No invented copy, no manufactured urgency, no fabricated social proof
- Existing conversion tests still pass, updated deliberately where behaviour
  changes rather than weakened

## Next step

Launch the wallet's Julien-only initialization step and verify only its public
descriptor after he finishes it. The verified implementation is already
published only to `origin/feat/crypto-pricing`.
