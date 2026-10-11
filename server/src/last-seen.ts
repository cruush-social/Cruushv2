import type { FastifyInstance } from "fastify";

// One write per member per minute is enough for a label that reads in minutes.
const TOUCH_INTERVAL_MS = 60_000;
const MAX_TRACKED_MEMBERS = 50_000;
const lastTouchedAtMs = new Map<string, number>();

/**
 * Records that a signed-in member is using the app right now. Never awaited by
 * the request and never allowed to fail it: this only feeds the last-active
 * label. Location, pin presence and profile edit times are left alone.
 */
export function touchLastSeen(app: FastifyInstance, userId: string, nowMs = Date.now()) {
  const previous = lastTouchedAtMs.get(userId);
  if (previous !== undefined && nowMs - previous < TOUCH_INTERVAL_MS) {
    return;
  }

  if (lastTouchedAtMs.size >= MAX_TRACKED_MEMBERS) {
    lastTouchedAtMs.clear();
  }
  lastTouchedAtMs.set(userId, nowMs);

  void Promise.resolve()
    .then(() => app.db.query(
      `update profiles
       set last_seen_at = now()
       where id = $1
         and (last_seen_at is null or last_seen_at < now() - interval '1 minute')`,
      [userId]
    ))
    .catch(() => undefined);
}

export function resetLastSeenThrottleForTests() {
  lastTouchedAtMs.clear();
}
