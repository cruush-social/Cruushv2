import { DEFAULT_EMAIL_TEMPLATE_VERSION } from "./email-template.js";
import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { runTransaction, type DbClient } from "./db.js";
import { loadLocationEnvelope, locationPayloadToCoordinates } from "./location-privacy.js";
import { sendOutOfSightWelcomeEmail, sendSinnersWelcomeEmail } from "./mailer.js";
import { decryptOosState, type EncryptedOosState, type OosState } from "./oos-state-crypto.js";
import { isWithinServiceArea } from "./service-area.js";
import {
  decryptServiceAreaEmailPayload, encryptServiceAreaEmailPayload,
  type ServiceAreaEmailKind, type ServiceAreaEmailOutboxRow
} from "./service-area-email-outbox.js";

type Member = { email: string; code_of_conduct_accepted_version: string | null };
type StateRow = EncryptedOosState & { user_id: string };
type Candidate = ServiceAreaEmailOutboxRow & { claim_token: string };
const RECONCILIATION_AFTER_MS = 23 * 60 * 60 * 1000;

async function lockEligibleMember(db: DbClient, userId: string) {
  const result = await db.query<Member>(
    `select u.email, u.code_of_conduct_accepted_version from app_users u
     join profiles p on p.id = u.id
     where u.id = $1 and u.account_status = 'active' and u.email_verified_at is not null
       and p.display_name is not null and p.year_of_birth is not null
     for share of u`, [userId]
  );
  return result.rows[0] ?? null;
}

async function lockStoredState(app: FastifyInstance, db: DbClient, userId: string): Promise<OosState | null> {
  const result = await db.query<StateRow>(
    `select user_id::text, state_ciphertext, state_nonce, state_auth_tag,
            wrapped_state_dek, state_dek_nonce, state_dek_auth_tag, state_key_version
       from oos_service_area_state where user_id = $1 for update`, [userId]
  );
  return result.rows[0] ? decryptOosState(app.config, userId, result.rows[0]) : null;
}

async function canDeliver(
  app: FastifyInstance, db: DbClient, userId: string,
  kind: ServiceAreaEmailKind, member: Member, state: OosState | null, eventId: string
) {
  if (kind === "outside_entry") {
    if (state?.is_outside !== true || state.current_event_id !== eventId) return false;
    // Delivery may defer for missing/expired/unreadable physical GPS or an
    // inside fix. Only the accepted GPS writer changes state or queues mail.
    const location = await loadLocationEnvelope({ config: app.config, db }, userId);
    if (!location || location.source !== "GPS" || location.expiresAtMs <= Date.now()) return false;
    const coordinates = locationPayloadToCoordinates(location);
    return Number.isFinite(coordinates.lat) && Number.isFinite(coordinates.lng)
      && Math.abs(coordinates.lat) <= 90 && Math.abs(coordinates.lng) <= 180
      && !isWithinServiceArea(coordinates);
  }
  return Boolean(member.code_of_conduct_accepted_version?.trim());
}

function needsReconciliation(startedAt: string | Date | null) {
  if (!startedAt) return false;
  const startedMs = new Date(startedAt).getTime();
  return !Number.isFinite(startedMs) || Date.now() - startedMs >= RECONCILIATION_AFTER_MS;
}

async function markForReconciliation(db: DbClient, eventId: string, claimToken: string) {
  await db.query(
    `update service_area_email_outbox set reconciliation_required_at = now()
     where event_id = $1 and claim_token = $2 and email_sent_at is null`, [eventId, claimToken]
  );
}

const RETURNING = `event_id::text, user_id::text, payload_ciphertext, payload_nonce, payload_auth_tag,
  wrapped_payload_dek, payload_dek_nonce, payload_dek_auth_tag, payload_key_version,
  email_started_at, email_sent_at, claim_token`;

/** One delivery path for all service-area mail. Accepted GPS writes, never this function, change state. */
export async function deliverServiceAreaEmail(
  app: FastifyInstance, userId: string, eventId: string, expectedKind?: ServiceAreaEmailKind
) {
  if (!app.config.RESEND_API_KEY || !app.config.MAIL_FROM) return false;
  const claimToken = randomUUID();
  let claimed = false;
  try {
    const candidate = await runTransaction(app.db, async (db) => {
      // Parent account, then encrypted state, then outbox. GPS and account
      // deletion use the same parent-first order.
      const member = await lockEligibleMember(db, userId);
      if (!member) return null;
      const state = await lockStoredState(app, db, userId);
      const claimedRow = await db.query<Candidate>(
        `update service_area_email_outbox set claim_token = $3,
           claimed_until = now() + interval '5 minutes'
         where event_id = $1 and user_id = $2 and email_sent_at is null
           and cancelled_at is null and reconciliation_required_at is null
           and (claimed_until is null or claimed_until <= now())
         returning ${RETURNING}`, [eventId, userId, claimToken]
      );
      const row = claimedRow.rows[0];
      if (!row) return null;
      claimed = true;
      const payload = decryptServiceAreaEmailPayload(app.config, row);
      if (expectedKind && payload.kind !== expectedKind) return null;
      if (!await canDeliver(app, db, userId, payload.kind, member, state, eventId)) return null;
      if (needsReconciliation(row.email_started_at) || (row.email_started_at && (!payload.emailTo || payload.templateVersion !== DEFAULT_EMAIL_TEMPLATE_VERSION))) {
        await markForReconciliation(db, eventId, claimToken);
        app.log.warn("Service-area email needs delivery reconciliation");
        return null;
      }
      const emailTo = payload.emailTo ?? member.email;
      if (!emailTo) return null;
      const frozen = { ...payload, emailTo, templateVersion: DEFAULT_EMAIL_TEMPLATE_VERSION };
      const encrypted = encryptServiceAreaEmailPayload(app.config, userId, eventId, frozen);
      await db.query(
        `update service_area_email_outbox set email_started_at = coalesce(email_started_at, now()),
           payload_ciphertext = $3, payload_nonce = $4, payload_auth_tag = $5,
           wrapped_payload_dek = $6, payload_dek_nonce = $7, payload_dek_auth_tag = $8,
           payload_key_version = $9
         where event_id = $1 and claim_token = $2 and email_sent_at is null and cancelled_at is null`,
        [eventId, claimToken, encrypted.payload_ciphertext, encrypted.payload_nonce,
          encrypted.payload_auth_tag, encrypted.wrapped_payload_dek, encrypted.payload_dek_nonce,
          encrypted.payload_dek_auth_tag, encrypted.payload_key_version]
      );
      return { kind: payload.kind, emailTo, idempotencyKey: payload.providerIdempotencyKey };
    });
    if (!candidate) return false;

    return await runTransaction(app.db, async (db) => {
      const member = await lockEligibleMember(db, userId);
      if (!member) return false;
      const state = await lockStoredState(app, db, userId);
      const selected = await db.query<Candidate>(
        `select ${RETURNING} from service_area_email_outbox
         where event_id = $1 and user_id = $2 and claim_token = $3
           and claimed_until > now() and email_sent_at is null and cancelled_at is null
           and reconciliation_required_at is null for update`, [eventId, userId, claimToken]
      );
      const row = selected.rows[0];
      if (!row) return false;
      const payload = decryptServiceAreaEmailPayload(app.config, row);
      if (payload.kind !== candidate.kind || (expectedKind && payload.kind !== expectedKind)
        || !await canDeliver(app, db, userId, payload.kind, member, state, eventId) || !payload.emailTo
        || payload.emailTo !== candidate.emailTo
        || payload.providerIdempotencyKey !== candidate.idempotencyKey) return false;
      if (needsReconciliation(row.email_started_at) || payload.templateVersion !== DEFAULT_EMAIL_TEMPLATE_VERSION) {
        await markForReconciliation(db, eventId, claimToken);
        app.log.warn("Service-area email needs delivery reconciliation");
        return false;
      }
      const send = payload.kind === "outside_entry" ? sendOutOfSightWelcomeEmail : sendSinnersWelcomeEmail;
      const result = await send({
        config: app.config, email: payload.emailTo,
        idempotencyKey: payload.providerIdempotencyKey, logger: app.log
      });
      if (result.accepted) {
        const encrypted = encryptServiceAreaEmailPayload(app.config, userId, eventId, {
          ...payload, emailTo: null, providerMessageId: result.providerMessageId
        });
        await db.query(
          `update service_area_email_outbox set email_sent_at = now(),
             payload_ciphertext = $3, payload_nonce = $4, payload_auth_tag = $5,
             wrapped_payload_dek = $6, payload_dek_nonce = $7, payload_dek_auth_tag = $8,
             payload_key_version = $9
           where event_id = $1 and claim_token = $2 and email_sent_at is null`,
          [eventId, claimToken, encrypted.payload_ciphertext, encrypted.payload_nonce,
            encrypted.payload_auth_tag, encrypted.wrapped_payload_dek, encrypted.payload_dek_nonce,
            encrypted.payload_dek_auth_tag, encrypted.payload_key_version]
        );
      }
      return result.accepted;
    });
  } finally {
    if (claimed) await app.db.query(
      "update service_area_email_outbox set claimed_until = now() where event_id = $1 and claim_token = $2",
      [eventId, claimToken]
    );
  }
}

export async function sweepServiceAreaEmails(app: FastifyInstance, userId: string | null = null) {
  if (!app.config.RESEND_API_KEY || !app.config.MAIL_FROM) return 0;
  const candidates = await app.db.query<{ user_id: string; event_id: string }>(
    `with sweep_candidates as (
       select w.event_id from service_area_email_outbox w
       join app_users u on u.id = w.user_id join profiles p on p.id = u.id
       where ($1::uuid is null or w.user_id = $1) and w.email_sent_at is null
         and w.cancelled_at is null and w.reconciliation_required_at is null
         and (w.claimed_until is null or w.claimed_until <= now())
         and u.account_status = 'active' and u.email_verified_at is not null
         and p.display_name is not null and p.year_of_birth is not null
       order by coalesce(w.claimed_until, w.queued_at), w.queued_at, w.event_id
       limit 200 for update of w skip locked
     )
     update service_area_email_outbox w set claimed_until = now()
     from sweep_candidates c where w.event_id = c.event_id
     returning w.user_id::text, w.event_id::text`, [userId]
  );
  for (const event of candidates.rows) {
    try { await deliverServiceAreaEmail(app, event.user_id, event.event_id); }
    catch { app.log.warn("Service-area email delivery failed; will retry"); }
  }
  return candidates.rows.length;
}

const schedulers = new WeakMap<FastifyInstance, { stop: () => void; users: number }>();
export function startServiceAreaEmailScheduler(app: FastifyInstance, intervalMs = 15 * 60 * 1000) {
  const existing = schedulers.get(app);
  if (existing) {
    existing.users += 1;
    return () => { if (--existing.users === 0) { existing.stop(); schedulers.delete(app); } };
  }
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try { await sweepServiceAreaEmails(app); }
    catch { app.log.error("Service-area email sweep failed"); }
    finally { running = false; }
  };
  const timer = setInterval(() => { void run(); }, intervalMs);
  timer.unref();
  void run();
  const entry = { users: 1, stop: () => clearInterval(timer) };
  schedulers.set(app, entry);
  return () => { if (--entry.users === 0) { entry.stop(); schedulers.delete(app); } };
}
