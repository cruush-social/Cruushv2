import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import type { DbClient } from "./db.js";
import { isWithinServiceArea } from "./service-area.js";
import { queueSinnersReturnWelcomeEmail } from "./sinners-welcome-email.js";
import { decryptOosState, encryptOosState, type EncryptedOosState, type OosStateCryptoConfig } from "./oos-state-crypto.js";
import type { OutOfSightStatus } from "./out-of-sight-location.js";
import { queueServiceAreaEmail } from "./service-area-email-outbox.js";
import { deliverServiceAreaEmail, startServiceAreaEmailScheduler, sweepServiceAreaEmails } from "./service-area-email-delivery.js";

type EntryState = { is_outside: boolean; current_event_id: string | null };
type StateRow = EncryptedOosState & { user_id: string };

/** Display metadata for already-authorized profiles, never a map-access decision. */
export async function loadStoredOutOfSightStatuses(
  context: { config: OosStateCryptoConfig; db: Pick<DbClient, "query"> },
  userIds: string[]
): Promise<Map<string, OutOfSightStatus>> {
  const ids = [...new Set(userIds)];
  const statuses = new Map<string, OutOfSightStatus>(ids.map((id) => [id, "unknown"]));
  if (ids.length === 0) return statuses;
  const result = await context.db.query<StateRow>(
    `select user_id::text, state_ciphertext, state_nonce, state_auth_tag,
            wrapped_state_dek, state_dek_nonce, state_dek_auth_tag, state_key_version
       from oos_service_area_state where user_id = any($1::uuid[])`, [ids]
  );
  for (const row of result.rows) {
    if (!statuses.has(row.user_id)) continue;
    try {
      const state = decryptOosState(context.config, row.user_id, row);
      statuses.set(row.user_id, state.is_outside ? "out_of_sight" : "in_area");
    } catch {
      // A missing or corrupt state cannot be asserted as in-area.
    }
  }
  return statuses;
}
function validCoordinates(location: { lat: number; lng: number }) {
  return Number.isFinite(location.lat) && Number.isFinite(location.lng)
    && Math.abs(location.lat) <= 90 && Math.abs(location.lng) <= 180;
}

async function lockEntryState(db: DbClient, config: OosStateCryptoConfig, userId: string) {
  const result = await db.query<StateRow>(
    `select user_id::text, state_ciphertext, state_nonce, state_auth_tag,
            wrapped_state_dek, state_dek_nonce, state_dek_auth_tag, state_key_version
       from oos_service_area_state where user_id = $1 for update`, [userId]
  );
  return result.rows[0] ? decryptOosState(config, userId, result.rows[0]) : null;
}

async function storeEntryState(db: DbClient, config: OosStateCryptoConfig, userId: string, state: EntryState) {
  const encrypted = encryptOosState(config, userId, state);
  await db.query(
    `update oos_service_area_state set state_ciphertext = $2, state_nonce = $3,
       state_auth_tag = $4, wrapped_state_dek = $5, state_dek_nonce = $6,
       state_dek_auth_tag = $7, state_key_version = $8, updated_at = now()
     where user_id = $1`,
    [userId, encrypted.state_ciphertext, encrypted.state_nonce, encrypted.state_auth_tag,
      encrypted.wrapped_state_dek, encrypted.state_dek_nonce, encrypted.state_dek_auth_tag,
      encrypted.state_key_version]
  );
}

async function cancelPendingEntries(db: DbClient, userId: string, eventId: string | null) {
  if (!eventId) return;
  await db.query(
    `update service_area_email_outbox set cancelled_at = coalesce(cancelled_at, now())
     where user_id = $1 and event_id = $2 and email_sent_at is null and cancelled_at is null`, [userId, eventId]
  );
}

// Caller supplies the accepted GPS transaction. Store only classification,
// not coordinates, city, IP, or MHC location.
export async function queueOutOfSightWelcomeEmail(db: DbClient, userId: string, location: { lat: number; lng: number }, config: OosStateCryptoConfig) {
  if (!validCoordinates(location)) return null;
  const initial = encryptOosState(config, userId, { is_outside: false, current_event_id: null });
  await db.query(
    `insert into oos_service_area_state (user_id, state_ciphertext, state_nonce, state_auth_tag,
       wrapped_state_dek, state_dek_nonce, state_dek_auth_tag, state_key_version)
     select id, $2, $3, $4, $5, $6, $7, $8 from app_users where id = $1
     on conflict (user_id) do nothing`,
    [userId, initial.state_ciphertext, initial.state_nonce, initial.state_auth_tag,
      initial.wrapped_state_dek, initial.state_dek_nonce, initial.state_dek_auth_tag, initial.state_key_version]
  );
  const previous = await lockEntryState(db, config, userId);
  if (!previous) return null;
  const outside = !isWithinServiceArea(location);
  const eventId = outside ? (previous.is_outside ? previous.current_event_id : randomUUID()) : null;
  if (outside && !previous.is_outside) {
    await queueServiceAreaEmail(db, config, {
      eventId: eventId!, userId, kind: "outside_entry", providerIdempotencyKey: "oos-welcome/" + eventId
    });
  }
  if (!outside && previous.is_outside && previous.current_event_id) {
    await queueSinnersReturnWelcomeEmail(db, config, userId, previous.current_event_id);
  }
  await storeEntryState(db, config, userId, { is_outside: outside, current_event_id: eventId });
  if (!outside) await cancelPendingEntries(db, userId, previous.current_event_id);
  return eventId;
}

export async function deliverOutOfSightWelcomeEmail(app: FastifyInstance, userId: string) {
  if (!app.config.RESEND_API_KEY || !app.config.MAIL_FROM) return false;
  const result = await app.db.query<StateRow>(
    `select user_id::text, state_ciphertext, state_nonce, state_auth_tag,
            wrapped_state_dek, state_dek_nonce, state_dek_auth_tag, state_key_version
       from oos_service_area_state where user_id = $1`, [userId]
  );
  const state = result.rows[0] ? decryptOosState(app.config, userId, result.rows[0]) : null;
  if (!state?.is_outside || !state.current_event_id) return false;
  return deliverServiceAreaEmail(app, userId, state.current_event_id, "outside_entry");
}

export async function sendPendingOutOfSightWelcomeEmails(app: FastifyInstance) {
  return sweepServiceAreaEmails(app);
}

export function startOutOfSightWelcomeEmailScheduler(app: FastifyInstance, intervalMs = 15 * 60 * 1000) {
  return startServiceAreaEmailScheduler(app, intervalMs);
}
