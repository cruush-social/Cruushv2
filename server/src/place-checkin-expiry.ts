import type { FastifyInstance } from "fastify";
import { createAppNotificationAndPush } from "./notification-service.js";

const EXPIRY_BATCH_SIZE = 200;

type ExpiredPlaceCheckin = {
  user_id: string;
  place_id: string;
  checked_in_at: string | Date;
  place_name: string;
};

export async function expirePlaceCheckins(
  app: Pick<FastifyInstance, "db" | "config" | "log">,
  batchSize = EXPIRY_BATCH_SIZE
) {
  const expired = await app.db.query<ExpiredPlaceCheckin>(
    `select
       checkin.user_id::text,
       checkin.place_id::text,
       checkin.checked_in_at,
       place.name as place_name
     from place_checkins checkin
     join places place on place.id = checkin.place_id
     where checkin.expires_at <= now()
     order by checkin.expires_at asc
     limit $1`,
    [batchSize]
  );

  let notified = 0;
  for (const checkin of expired.rows) {
    try {
      const checkedInAt = new Date(checkin.checked_in_at).toISOString();
      await createAppNotificationAndPush(app, {
        userId: checkin.user_id,
        type: "place_checkin_expired",
        title: `Check-in ended at ${checkin.place_name}`,
        body: "Check in again to view the Pink Book.",
        linkUrl: `/places/${checkin.place_id}`,
        dedupeKey: `place-checkin-expired:${checkin.place_id}:${checkedInAt}`,
        metadata: { placeId: checkin.place_id }
      });
      await app.db.query(
        `delete from place_checkins
         where user_id = $1 and place_id = $2 and checked_in_at = $3 and expires_at <= now()`,
        [checkin.user_id, checkin.place_id, checkin.checked_in_at]
      );
      notified += 1;
    } catch (error) {
      app.log.error({ err: error, userId: checkin.user_id, placeId: checkin.place_id }, "Spot check-in expiry notification failed");
    }
  }

  return notified;
}

export function startPlaceCheckinExpiryScheduler(
  app: Pick<FastifyInstance, "db" | "config" | "log">,
  intervalMs = 60 * 1000
) {
  const run = () => {
    void expirePlaceCheckins(app).catch((error) => {
      app.log.error({ err: error }, "scheduled Spot check-in expiry sweep failed");
    });
  };
  const timer = setInterval(run, intervalMs);
  timer.unref();
  run();
  return () => clearInterval(timer);
}
