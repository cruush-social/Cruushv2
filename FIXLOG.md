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
