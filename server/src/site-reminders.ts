import type { FastifyInstance } from "fastify";
import { createAppNotificationAndPush } from "./notification-service.js";

const SWEEP_INTERVAL_MS = 60 * 60 * 1000;
const RECENT_ACTIVITY_DAYS = 30;
const SWEEP_BATCH_SIZE = 500;

const REMINDERS_BY_UTC_DAY = {
  1: {
    kind: "nearby_feed",
    title: "See what's happening nearby",
    body: "Open Confessional to catch up on posts around you.",
    linkUrl: "/feed"
  },
  2: {
    kind: "pulse",
    title: "Send a Pulse",
    body: "Use a Pulse to stand out on the map.",
    linkUrl: "/map"
  },
  3: {
    kind: "affiliate",
    title: "Share cruush with someone you trust",
    body: "Your affiliate link is ready in Rewards.",
    linkUrl: "/rewards"
  },
  4: {
    kind: "feed_post",
    title: "Post to Confessional",
    body: "Share what you're up for with people nearby.",
    linkUrl: "/feed"
  },
  5: {
    kind: "weekend",
    title: "Your weekend map is ready",
    body: "Open cruush to see what's happening nearby.",
    linkUrl: "/map"
  }
} as const;

export function siteReminderForDate(now: Date) {
  return REMINDERS_BY_UTC_DAY[now.getUTCDay() as keyof typeof REMINDERS_BY_UTC_DAY] ?? null;
}

export async function runSiteReminderPass(
  app: Pick<FastifyInstance, "db" | "config" | "log">,
  now = new Date(),
  batchSize = SWEEP_BATCH_SIZE
) {
  const reminder = siteReminderForDate(now);
  if (!reminder) {
    return 0;
  }

  const candidates = await app.db.query<{ user_id: string }>(
    `select profile.id::text as user_id
       from profiles profile
       left join notification_preferences preferences
         on preferences.user_id = profile.id
      where coalesce(preferences.site_reminders_enabled, true) = true
        and coalesce(profile.location_updated_at, profile.updated_at) >= now() - ($1 || ' days')::interval
      order by coalesce(profile.location_updated_at, profile.updated_at) desc
      limit $2`,
    [String(RECENT_ACTIVITY_DAYS), batchSize]
  );
  const dateKey = now.toISOString().slice(0, 10);
  let createdCount = 0;

  for (const candidate of candidates.rows) {
    try {
      const created = await createAppNotificationAndPush(app, {
        userId: candidate.user_id,
        type: "site_reminder",
        title: reminder.title,
        body: reminder.body,
        linkUrl: reminder.linkUrl,
        dedupeKey: `site-reminder:${reminder.kind}:${candidate.user_id}:${dateKey}`,
        metadata: { kind: reminder.kind }
      });
      if (created) {
        createdCount += 1;
      }
    } catch (error) {
      app.log.error({ err: error, userId: candidate.user_id }, "Site reminder delivery failed");
    }
  }

  return createdCount;
}

export function startSiteReminderScheduler(
  app: Pick<FastifyInstance, "db" | "config" | "log">,
  intervalMs = SWEEP_INTERVAL_MS
) {
  const run = () => {
    void runSiteReminderPass(app).catch((error) => {
      app.log.error({ err: error }, "Site reminder sweep failed");
    });
  };
  const timer = setInterval(run, intervalMs);
  timer.unref?.();
  run();
  return () => clearInterval(timer);
}
