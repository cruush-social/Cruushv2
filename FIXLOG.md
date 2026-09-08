# FIXLOG

- 2026-09-01: GitHub #140. Visibility Controls Apply no longer returns `Request validation failed`
  for profiles using canonical app-owned `/api/media/profile-photos/<uuid>.<ext>` photos. Regression
  coverage: `server/src/profile-schema.test.ts` and `server/src/app.test.ts`.
- 2026-09-01: Heart and saved-badge borders now resolve from one identity tone. Active MHC units use
  `#77B9DA` across Feed, Messages, cruush activity, profile hearts, Spots, and the map. `Far far away`
  stays inside its metadata column. Rendered assertion: populated Android-width cards showed identical
  heart and badge strokes on relationship and MHC states.
- 2026-09-01: cruush activity and Messages action trios now use 36px controls with 4px gaps. cruush
  centers identity, last active, and distance beside the heart; Messages preserves its preview spacing.
- 2026-09-01: Larger text no longer clips Notifications, Cruushes, Bug reports, Cruise Carousel, or
  the open Mile High Club picker at 390x844. Rendered assertion: each affected route showed its full
  heading, controls, and labels; Mile High Club kept address search, actions, map, and bottom nav on one screen.
- 2026-09-01: The Pulse sheet no longer accepts mobile drag input. Rendered assertion: a 75px diagonal
  drag left its mobile sheet rectangle unchanged at x=12, y=124.625, width=366, height=619.375.
- 2026-09-01: The current user's map pin now opens its signal preview on mobile tap. Rendered assertion:
  tapping the owner pin set its pressed state and displayed the signal above the heart.
- 2026-09-01: The current user's regular and Ghost Mode decoy previews now stay open after a mobile
  tap instead of closing on touch pointer-leave; tapping the same heart again closes the preview.
- 2026-09-02: GitHub #142. Onboarding now matches the server's 35-character Signal limit and names the invalid field instead of only showing `Request validation failed`; skipping optional 2FA remains supported.
- 2026-09-02: Stream `Flag` no longer rejects harassment-only text. Content publishes while its sexual-harassment label remains flagged for moderator review; mixed threats still reject. Regression coverage: `server/src/policy-mapper.test.ts` and `server/src/moderation-service.test.ts`.

- 2026-09-08: Operator wallet RPC errors now include a bounded, sanitized node error code/message rather than hiding the rejection reason. Focused mocked transport assertion and wallet TypeScript build pass; live sweep rejection remains pending user broadcast.

- 2026-09-08: Sweep-plan CLI normalizes nonce fields to canonical decimal strings before writing. The actual ELLIPAL preview output parsed successfully with an assertion that nonce is a string. No real-wallet signing or broadcast was performed.

- 2026-09-08: Operator sweep retries inspect matching successful receipts before submission, skip mined gas funding, and do no work after a completed sweep. A focused assertion covers partial completion, full completion, and receipt failures; reverted or mismatched receipts fail closed.

- 2026-09-08: Added mandatory live collection fees to new crypto quotes, preserved existing quote amounts, disabled fee-bearing underpayment tolerance, and verified the gas-info tooltip on mobile and desktop; focused settlement and checkout assertions pass.
