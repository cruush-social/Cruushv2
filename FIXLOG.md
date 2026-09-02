# FIXLOG

- 2026-09-01: GitHub #140. Visibility Controls Apply no longer returns `Request validation failed`
  for profiles using canonical app-owned `/api/media/profile-photos/<uuid>.<ext>` photos. Regression
  coverage: `server/src/profile-schema.test.ts` and `server/src/app.test.ts`.
- 2026-09-01: Heart and saved-badge borders now resolve from one identity tone. Active MHC units use
  `#77B9DA` across Feed, Messages, cruush activity, profile hearts, Spots, and the map. `Far far away`
  stays inside its metadata column. Rendered assertion: populated Android-width cards showed identical
  heart and badge strokes on relationship and MHC states.
