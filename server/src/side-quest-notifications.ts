import type { FastifyInstance } from "fastify";
import { createAppNotificationAndPush } from "./notification-service.js";
import { getSideQuests } from "./side-quests.js";

/**
 * Side Quests used to interrupt with a dialog on the map. They arrive as a
 * reward notification instead, which means a member who does not want them can
 * turn Reward updates off in Notification settings and never see one again.
 *
 * At most one a day per member, held by the dedupe key, so finishing several
 * quests in an afternoon is still a single nudge.
 */
const SWEEP_BATCH_SIZE = 200;
const SWEEP_INTERVAL_MS = 60 * 60 * 1000;
/** Only members who have opened the app lately; a dormant account gets nothing. */
const RECENT_ACTIVITY_DAYS = 7;

function dayKey(value: Date) {
  return value.toISOString().slice(0, 10);
}

export async function notifyClaimableSideQuests(
  app: Pick<FastifyInstance, "db" | "config" | "log">,
  batchSize = SWEEP_BATCH_SIZE
) {
  // The same timestamps the profile payload reads for "last online".
  const candidates = await app.db.query<{ user_id: string }>(
    `select p.id::text as user_id
       from profiles p
      where coalesce(p.location_updated_at, p.updated_at) >= now() - ($1 || ' days')::interval
      order by coalesce(p.location_updated_at, p.updated_at) desc
      limit $2`,
    [String(RECENT_ACTIVITY_DAYS), batchSize]
  );

  const today = dayKey(new Date());
  let notified = 0;

  for (const candidate of candidates.rows) {
    try {
      const sideQuests = await getSideQuests(app, candidate.user_id);

      if (!sideQuests.claimingAvailable) {
        continue;
      }

      const claimable = sideQuests.quests.filter((quest) => quest.completed && !quest.claimed);

      if (claimable.length === 0) {
        continue;
      }

      const created = await createAppNotificationAndPush(app, {
        userId: candidate.user_id,
        type: "reward",
        title: claimable.length === 1
          ? "A Side Quest is ready to claim"
          : `${claimable.length} Side Quests are ready to claim`,
        body: "Open Rewards to claim it.",
        linkUrl: "/rewards",
        dedupeKey: `side-quests-ready:${candidate.user_id}:${today}`,
        metadata: { claimableCount: claimable.length }
      });

      if (created) {
        notified += 1;
      }
    } catch (error) {
      app.log.error({ err: error, userId: candidate.user_id }, "Side Quest notification failed");
    }
  }

  return notified;
}

export function startSideQuestNotificationScheduler(
  app: Pick<FastifyInstance, "db" | "config" | "log">,
  intervalMs = SWEEP_INTERVAL_MS
) {
  const timer = setInterval(() => {
    void notifyClaimableSideQuests(app).catch((error) => {
      app.log.error({ err: error }, "Side Quest notification sweep failed");
    });
  }, intervalMs);

  timer.unref?.();

  return () => clearInterval(timer);
}
