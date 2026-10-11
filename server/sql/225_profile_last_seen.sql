-- When a signed-in member last used the app. The "last active" label used to
-- read the last location save, which only moves when someone taps locate, so
-- people who were in the app for hours still looked long gone.
alter table profiles
  add column if not exists last_seen_at timestamptz;
