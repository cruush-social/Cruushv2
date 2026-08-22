import type { FastifyInstance } from "fastify";
import { distanceMiles } from "./beta-access.js";
import { createAppNotification } from "./notification-service.js";
import { getRelationshipPermissions } from "./match-relationships.js";
import { getNotificationPreferences, isWithinQuietHours, sendPushForNotification } from "./push-service.js";

/**
 * Who hears about a Pulse.
 *
 * The radius decides who can *see* a Pulse on the map. A notification is a much
 * tighter thing, because a notification interrupts someone:
 *
 *   - mutuals only, so a Pulse never reaches a stranger's phone
 *   - the ten nearest of them, so a dense night does not become a broadcast
 *   - never twice from the same person in a day
 *   - never more often than every four hours per recipient, whoever sent it
 *   - never during a recipient's quiet hours, and the record still lands so
 *     nothing is lost, it just does not light up a phone
 *
 * Every one of those caps is counted against `map_ping_notifications` rather
 * than against the notification rows, so clearing a notification does not let
 * the same Pulse through a second time.
 */

export const PULSE_NOTIFICATION_RECIPIENT_LIMIT = 10;
export const PULSE_NOTIFICATION_PER_SENDER_COOLDOWN_MS = 24 * 60 * 60 * 1000;
export const PULSE_NOTIFICATION_PER_RECIPIENT_COOLDOWN_MS = 4 * 60 * 60 * 1000;

type PulseCandidateRow = {
  user_id: string;
  latitude: number | null;
  longitude: number | null;
};

type SentRow = { recipient_user_id: string };

export type PulseNotificationInput = {
  pingId: string;
  senderUserId: string;
  radiusMiles: number;
};

type SenderRow = {
  display_name: string | null;
  latitude: number | null;
  longitude: number | null;
};

/**
 * The sender's name and position, read from the same columns the candidates are
 * read from so both sides of the distance comparison come from one source.
 */
async function loadSender(app: FastifyInstance, userId: string) {
  const result = await app.db.query<SenderRow>(
    `select display_name,
            coalesce(lat, fuzzy_lat) as latitude,
            coalesce(lng, fuzzy_lng) as longitude
     from profiles
     where id = $1
     limit 1`,
    [userId]
  );
  const row = result.rows[0];

  if (!row || !Number.isFinite(row.latitude) || !Number.isFinite(row.longitude)) {
    return null;
  }

  return {
    name: row.display_name?.trim() || "Someone",
    source: { lat: row.latitude as number, lng: row.longitude as number }
  };
}

/**
 * Candidates are people with a location the sender could plausibly reach. The
 * expensive checks, mutuality and preferences, run only on this set.
 */
async function loadNearbyCandidates(
  app: FastifyInstance,
  input: PulseNotificationInput & { source: { lat: number; lng: number } }
): Promise<PulseCandidateRow[]> {
  // A degree of latitude is about 69 miles; longitude shrinks with latitude.
  // The box is a cheap prefilter and the exact distance is checked below.
  const latitudeSpan = input.radiusMiles / 69;
  const longitudeSpan = input.radiusMiles / Math.max(1, 69 * Math.cos((input.source.lat * Math.PI) / 180));

  const result = await app.db.query<PulseCandidateRow>(
    `select profiles.id::text as user_id,
            coalesce(profiles.lat, profiles.fuzzy_lat) as latitude,
            coalesce(profiles.lng, profiles.fuzzy_lng) as longitude
     from profiles
     join app_users on app_users.id = profiles.id
     where profiles.id <> $1
       and coalesce(app_users.account_status, 'active') = 'active'
       and coalesce(profiles.lat, profiles.fuzzy_lat) between $2 and $3
       and coalesce(profiles.lng, profiles.fuzzy_lng) between $4 and $5
       and not exists (
         select 1
         from user_blocks block
         where (block.blocker_user_id = $1 and block.blocked_user_id = profiles.id)
            or (block.blocker_user_id = profiles.id and block.blocked_user_id = $1)
       )`,
    [
      input.senderUserId,
      input.source.lat - latitudeSpan,
      input.source.lat + latitudeSpan,
      input.source.lng - longitudeSpan,
      input.source.lng + longitudeSpan
    ]
  );

  return result.rows;
}

/** Recipients this sender has already reached inside the daily window. */
async function loadRecentlyReached(app: FastifyInstance, senderUserId: string, nowMs: number) {
  const result = await app.db.query<SentRow>(
    `select distinct recipient_user_id::text as recipient_user_id
     from map_ping_notifications
     where sender_user_id = $1
       and created_at > $2`,
    [senderUserId, new Date(nowMs - PULSE_NOTIFICATION_PER_SENDER_COOLDOWN_MS).toISOString()]
  );

  return new Set(result.rows.map((row) => row.recipient_user_id));
}

/** Recipients who have heard any Pulse recently, whoever sent it. */
async function loadRecentlyInterrupted(app: FastifyInstance, recipientIds: string[], nowMs: number) {
  if (recipientIds.length === 0) {
    return new Set<string>();
  }

  const result = await app.db.query<SentRow>(
    `select distinct recipient_user_id::text as recipient_user_id
     from map_ping_notifications
     where recipient_user_id = any($1::uuid[])
       and created_at > $2`,
    [recipientIds, new Date(nowMs - PULSE_NOTIFICATION_PER_RECIPIENT_COOLDOWN_MS).toISOString()]
  );

  return new Set(result.rows.map((row) => row.recipient_user_id));
}

export async function notifyPulseRecipients(
  app: FastifyInstance,
  input: PulseNotificationInput,
  nowMs = Date.now()
) {
  const sender = await loadSender(app, input.senderUserId);
  if (!sender) {
    return { notified: 0 };
  }

  const candidates = await loadNearbyCandidates(app, { ...input, source: sender.source });

  const withinRadius = candidates
    .filter((row) => Number.isFinite(row.latitude) && Number.isFinite(row.longitude))
    .map((row) => ({
      userId: row.user_id,
      miles: distanceMiles(sender.source, { lat: row.latitude as number, lng: row.longitude as number })
    }))
    .filter((row) => row.miles <= input.radiusMiles)
    .sort((a, b) => a.miles - b.miles);

  if (withinRadius.length === 0) {
    return { notified: 0 };
  }

  const alreadyReached = await loadRecentlyReached(app, input.senderUserId, nowMs);
  const recentlyInterrupted = await loadRecentlyInterrupted(
    app,
    withinRadius.map((row) => row.userId),
    nowMs
  );

  const eligible: string[] = [];

  for (const candidate of withinRadius) {
    if (eligible.length >= PULSE_NOTIFICATION_RECIPIENT_LIMIT) {
      break;
    }

    if (alreadyReached.has(candidate.userId) || recentlyInterrupted.has(candidate.userId)) {
      continue;
    }

    // Mutuality is the gate that keeps a Pulse off a stranger's phone. It is
    // checked one at a time, but only on people already inside the radius and
    // still under the caps, so the list is short by the time it runs.
    const relationship = await getRelationshipPermissions(app, input.senderUserId, candidate.userId)
      .catch(() => null);

    if (relationship?.isMutualCruush !== true) {
      continue;
    }

    eligible.push(candidate.userId);
  }

  let notified = 0;

  for (const recipientUserId of eligible) {
    const preferences = await getNotificationPreferences(app, recipientUserId).catch(() => null);
    if (preferences && preferences.pulseEnabled === false) {
      continue;
    }

    // Claim the slot first. If two Pulses land at once, the unique index on
    // (ping_id, recipient_user_id) means only one of them notifies.
    const claim = await app.db.query(
      `insert into map_ping_notifications (ping_id, sender_user_id, recipient_user_id)
       values ($1, $2, $3)
       on conflict (ping_id, recipient_user_id) do nothing
       returning id`,
      [input.pingId, input.senderUserId, recipientUserId]
    );

    if (claim.rows.length === 0) {
      continue;
    }

    const notification = await createAppNotification(app, {
      userId: recipientUserId,
      actorUserId: input.senderUserId,
      type: "pulse",
      title: `${sender.name} is out`,
      body: "Open the map to see where.",
      linkUrl: "/map",
      dedupeKey: `pulse:${input.pingId}:${recipientUserId}`,
      metadata: { pingId: input.pingId }
    }).catch(() => null);

    if (!notification) {
      continue;
    }

    notified += 1;

    // Quiet hours silence the phone, not the notification. It is already
    // written; it simply does not ring.
    if (preferences && isWithinQuietHours(preferences, nowMs)) {
      continue;
    }

    void sendPushForNotification(app, notification).catch(() => undefined);
  }

  return { notified };
}
