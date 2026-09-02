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
- 2026-09-02: A valid suspended-account sign-in now opens a dedicated suspended screen with logout and the reason-appropriate public appeal link instead of returning the generic sign-in error.
- 2026-09-02: Color-blind mode now remaps shared brand, relationship, Pulse, Mile High Club, Dark Room, destructive, chart, focus, badge, selected-navigation, SVG, and logo colors while leaving member photos and map tiles unchanged.
- 2026-09-02: cruush+ Pulse allowance is now 5 per rolling day without a sender cooldown. Optional recipient alerts retain the 4-hour interruption cap and same-sender daily deduplication.
- 2026-09-02: Group owners and admins can now spend one of their own Pulses to alert active group members. Group Pulses share the recipient opt-out, quiet-hours, mute, 4-hour interruption, and same-sender daily limits used by individual Pulses.
# 2026-09-02

- Mobile Notifications header now keeps Back, title, Settings, and Bug visible on its first row; bulk actions sit below instead of squeezing out the title.
