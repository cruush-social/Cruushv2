import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { runTransaction, type DbClient } from "./db.js";
import type { OosStateCryptoConfig } from "./oos-state-crypto.js";
import { queueServiceAreaEmail } from "./service-area-email-outbox.js";
import { deliverServiceAreaEmail, startServiceAreaEmailScheduler, sweepServiceAreaEmails } from "./service-area-email-delivery.js";

// One statement: lock the prior version, persist acceptance, enqueue only the
// first acceptance, and commit all or none. Later versions never create mail.
export function acceptCodeOfConductAndQueueSinnersWelcome(
  app: Pick<FastifyInstance, "config" | "db">, userId: string, version: string
) {
  return runTransaction(app.db, async (db) => {
    const prior = await db.query<{ id: string; code_of_conduct_accepted_version: string | null }>(
      `select id::text, code_of_conduct_accepted_version from app_users where id = $1 for update`, [userId]
    );
    const member = prior.rows[0];
    if (!member) return { rows: [] as Array<{ id: string }> };
    const accepted = await db.query<{ id: string }>(
      `update app_users set code_of_conduct_accepted_version = $2,
         code_of_conduct_accepted_at = now() where id = $1 returning id::text`, [userId, version]
    );
    if (!member.code_of_conduct_accepted_version?.trim()) {
      const eventId = randomUUID();
      await queueServiceAreaEmail(db, app.config, {
        eventId, userId, kind: "first_coc", providerIdempotencyKey: "sinners-welcome/first-coc/" + userId
      });
    }
    return accepted;
  });
}

// Called only inside the accepted GPS transaction, while the existing OOS
// state row is locked. A new excursion has a new outside-event ID. No GPS or
// display location is copied into this outbox; history is never cancelled.
export async function queueSinnersReturnWelcomeEmail(
  db: DbClient, config: OosStateCryptoConfig, userId: string, priorOutsideEventId: string
) {
  await queueServiceAreaEmail(db, config, {
    eventId: randomUUID(), userId, kind: "service_return", priorOutsideEventId,
    providerIdempotencyKey: "sinners-welcome/return/" + priorOutsideEventId
  });
}

export async function deliverSinnersWelcomeEmail(app: FastifyInstance, userId: string, eventId: string) {
  return deliverServiceAreaEmail(app, userId, eventId);
}

export async function sendPendingSinnersWelcomeEmails(app: FastifyInstance, userId: string | null = null) {
  return sweepServiceAreaEmails(app, userId);
}

// Profiles owner: invoke best-effort only after the accepted GPS transaction
// commits. Mail failures must not change the location-save response.
export function deliverPendingSinnersWelcomeEmailsForUser(app: FastifyInstance, userId: string) {
  return sendPendingSinnersWelcomeEmails(app, userId);
}

export function startSinnersWelcomeEmailScheduler(app: FastifyInstance, intervalMs = 15 * 60 * 1000) {
  return startServiceAreaEmailScheduler(app, intervalMs);
}
