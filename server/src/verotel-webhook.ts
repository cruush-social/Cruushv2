import type { FastifyInstance } from "fastify";
import { createHash } from "node:crypto";
import {
  grantCruushPlusForCheckoutSession,
  loadCheckoutSession,
  mapCheckoutSession,
  type BillingCheckoutSessionRow
} from "./billing.js";
import {
  isGrantingEvent,
  isRevokingEvent,
  normalizePostbackQuery,
  verifyFlexPaySignature
} from "./verotel-flexpay.js";
import { checkChargebackRatioAndAlert, recordPaymentEvent } from "./payment-monitoring.js";

export type VerotelPostbackOutcome =
  | "rejected"
  | "duplicate"
  | "granted"
  | "revoked"
  | "ignored"
  | "unknown_session";

export type VerotelPostbackResult = {
  outcome: VerotelPostbackOutcome;
  saleId: string;
  eventType: string;
};

/**
 * The postback carries no body we control, so the raw client IP is hashed
 * before storage rather than kept in the clear.
 */
function hashIp(ip: string | undefined) {
  if (!ip) {
    return null;
  }

  return createHash("sha256").update(ip, "utf8").digest("hex");
}

async function findSessionRow(app: FastifyInstance, referenceId: string, saleId: string) {
  const row = (await app.db.query<BillingCheckoutSessionRow>(
    `select id, user_id, plan_id, processor, status, test_mode, amount_cents, currency, created_at, expires_at, completed_at
     from billing_checkout_sessions
     where processor = 'verotel'
       and (id::text = $1 or verotel_sale_id = $2)
     order by created_at desc
     limit 1`,
    [referenceId, saleId]
  )).rows[0];

  return row ?? null;
}

/**
 * Handles one Verotel FlexPay postback.
 *
 * Order matters. The signature is checked before anything is trusted, the event
 * is recorded before it is applied, and the unique constraint on
 * billing_processor_events is what makes a re-delivered postback a no-op rather
 * than a second grant.
 */
export async function handleVerotelPostback(
  app: FastifyInstance,
  options: { query: unknown; signatureKey: string; clientIp?: string }
): Promise<VerotelPostbackResult> {
  const params = normalizePostbackQuery(options.query);
  const saleId = params.saleID ?? "";
  const eventType = (params.event ?? "").toLowerCase();
  const eventKey = params.transactionID ?? "";
  const referenceId = params.referenceID ?? "";
  const verified = verifyFlexPaySignature(params, options.signatureKey);
  const ipHash = hashIp(options.clientIp);

  // Recorded whether or not it verifies: an unverified postback is evidence of a
  // tampering attempt and belongs in the monitoring trail.
  const inserted = (await app.db.query<{ id: string }>(
    `insert into billing_processor_events (
       processor,
       sale_id,
       event_type,
       event_key,
       signature_verified,
       payload
     )
     values ('verotel', $1, $2, $3, $4, $5::jsonb)
     on conflict (processor, sale_id, event_type, event_key) do nothing
     returning id`,
    [saleId, eventType, eventKey, verified, JSON.stringify(params)]
  )).rows[0];

  if (!verified) {
    return { outcome: "rejected", saleId, eventType };
  }

  if (!inserted) {
    // Already recorded. Verotel retries until it gets a 2xx, so this is the
    // expected path for a redelivery and must not grant anything again.
    return { outcome: "duplicate", saleId, eventType };
  }

  if (!isGrantingEvent(eventType) && !isRevokingEvent(eventType)) {
    return { outcome: "ignored", saleId, eventType };
  }

  const sessionRow = await findSessionRow(app, referenceId, saleId);

  if (!sessionRow) {
    return { outcome: "unknown_session", saleId, eventType };
  }

  const session = mapCheckoutSession(sessionRow);

  await app.db.query(
    `update billing_processor_events
     set checkout_session_id = $1,
         user_id = $2
     where id = $3`,
    [session.id, session.userId, inserted.id]
  );

  if (isGrantingEvent(eventType)) {
    await app.db.query(
      `update billing_checkout_sessions
       set status = 'completed',
           completed_at = coalesce(completed_at, now()),
           updated_at = now(),
           verotel_sale_id = $2,
           verotel_reference_id = $3
       where id = $1`,
      [session.id, saleId, referenceId]
    );

    await grantCruushPlusForCheckoutSession(app, { ...session, status: "completed" });

    await app.db.query(
      `update billing_processor_events set applied = true, applied_at = now() where id = $1`,
      [inserted.id]
    );

    await recordPaymentEvent(app, {
      userId: session.userId,
      saleId,
      eventType,
      outcome: "approved",
      ipHash,
      amountCents: session.amountCents
    });

    return { outcome: "granted", saleId, eventType };
  }

  await revokeCruushPlus(app, session.userId, eventType);

  await app.db.query(
    `update billing_processor_events set applied = true, applied_at = now() where id = $1`,
    [inserted.id]
  );

  await recordPaymentEvent(app, {
    userId: session.userId,
    saleId,
    eventType,
    outcome: eventType === "chargeback" ? "chargeback" : eventType === "credit" ? "refund" : "declined",
    ipHash,
    amountCents: session.amountCents
  });

  if (eventType === "chargeback") {
    // Evaluated on every chargeback so a rising dispute rate surfaces before
    // Verotel reprices, not after. Never allowed to fail the postback: Verotel
    // would retry a 500 and we have already applied the revocation.
    await checkChargebackRatioAndAlert(app, app.log).catch((alertError: unknown) => {
      app.log.error({ err: alertError }, "Chargeback ratio check failed.");
    });
  }

  return { outcome: "revoked", saleId, eventType };
}

/**
 * Ends a subscription and, unless the user separately holds lifetime access,
 * turns the entitlement off. Lifetime access is deliberately never revoked by a
 * subscription event; only a chargeback against the lifetime purchase itself
 * should do that, which is handled by its own session row.
 */
export async function revokeCruushPlus(app: FastifyInstance, userId: string, eventType: string) {
  const status = eventType === "expiry" ? "expired" : "cancelled";

  await app.db.query(
    `update cruush_plus_subscriptions
     set status = $2,
         updated_at = now()
     where user_id = $1`,
    [userId, status]
  );

  await app.db.query(
    `update user_entitlements
     set cruush_plus_enabled = false,
         updated_at = now()
     where user_id = $1
       and not exists (
         select 1 from cruush_plus_lifetime_access where user_id = $1
       )`,
    [userId]
  );
}

export { loadCheckoutSession };
