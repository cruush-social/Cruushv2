# FIXLOG

- 2026-09-01: GitHub #140. Visibility Controls Apply no longer returns `Request validation failed`
  for profiles using canonical app-owned `/api/media/profile-photos/<uuid>.<ext>` photos. Regression
  coverage: `server/src/profile-schema.test.ts` and `server/src/app.test.ts`.
