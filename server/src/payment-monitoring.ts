import type { FastifyInstance } from "fastify";

/**
 * Real-time transaction monitoring for cruush+ payments.
 *
 * Visa's Integrity Risk Program classifies dating (MCC 7273) as Tier 1 high
 * integrity risk and requires merchants to monitor transactions as they happen
 * rather than reconciling after the fact. This module records every payment
 * outcome and exposes the ratios an underwriter or an acquirer will ask about.
 *
 * Nothing here grants or revokes access. It observes and raises alerts.
 */

export type PaymentOutcome = "approved" | "declined" | "chargeback" | "refund";

export type PaymentEventInput = {
  userId: string | null;
  saleId: string | null;
  eventType: string;
  outcome: PaymentOutcome;
  ipHash?: string | null;
  country?: string | null;
  amountCents?: number | null;
};

/**
 * Verotel applies a 2.5% surcharge to the base rate once the chargeback ratio
 * reaches 1.0%, measured over four weeks with a two week lag, and only once the
 * period holds more than 50 transactions. Alerting below their threshold gives
 * us room to act before the repricing lands.
 */
export const CHARGEBACK_RATIO_SURCHARGE_THRESHOLD = 0.01;
export const CHARGEBACK_RATIO_ALERT_THRESHOLD = 0.0075;
export const CHARGEBACK_RATIO_MINIMUM_TRANSACTIONS = 50;
export const CHARGEBACK_WINDOW_DAYS = 28;

/** Velocity ceilings. Exceeding one is a signal to review, not to block outright. */
export const VELOCITY_LIMITS = {
  perUserPerHour: 3,
  perUserPerDay: 6,
  perIpPerDay: 10
};

export async function recordPaymentEvent(app: FastifyInstance, input: PaymentEventInput) {
  await app.db.query(
    `insert into payment_monitoring_events (
       user_id,
       sale_id,
       event_type,
       outcome,
       ip_hash,
       country,
       amount_cents
     )
     values ($1, $2, $3, $4, $5, $6, $7)`,
    [
      input.userId,
      input.saleId,
      input.eventType,
      input.outcome,
      input.ipHash ?? null,
      input.country ?? null,
      input.amountCents ?? null
    ]
  );
}

export type ChargebackRatio = {
  approved: number;
  chargebacks: number;
  ratio: number;
  windowDays: number;
  belowMinimumVolume: boolean;
  alerting: boolean;
  surcharging: boolean;
};

/**
 * The ratio Verotel and the card schemes measure: chargebacks over transactions
 * in the window. Reported as not alerting below the minimum transaction count,
 * because a single chargeback against three sales is not a 33% ratio in any
 * sense the schemes act on.
 */
export async function getChargebackRatio(
  app: FastifyInstance,
  windowDays = CHARGEBACK_WINDOW_DAYS
): Promise<ChargebackRatio> {
  const row = (await app.db.query<{ approved: string; chargebacks: string }>(
    `select
       count(*) filter (where outcome = 'approved') as approved,
       count(*) filter (where outcome = 'chargeback') as chargebacks
     from payment_monitoring_events
     where created_at >= now() - ($1 || ' days')::interval`,
    [String(windowDays)]
  )).rows[0];

  const approved = Number(row?.approved ?? 0);
  const chargebacks = Number(row?.chargebacks ?? 0);
  const ratio = approved === 0 ? 0 : chargebacks / approved;
  const belowMinimumVolume = approved < CHARGEBACK_RATIO_MINIMUM_TRANSACTIONS;

  return {
    approved,
    chargebacks,
    ratio,
    windowDays,
    belowMinimumVolume,
    alerting: !belowMinimumVolume && ratio >= CHARGEBACK_RATIO_ALERT_THRESHOLD,
    surcharging: !belowMinimumVolume && ratio >= CHARGEBACK_RATIO_SURCHARGE_THRESHOLD
  };
}

/**
 * How many postbacks failed signature verification in the window. Each one was
 * rejected without granting anything, so this is an intrusion signal rather than
 * a billing one.
 */
export async function getUnverifiedPostbackCount(app: FastifyInstance, windowDays = CHARGEBACK_WINDOW_DAYS) {
  const row = (await app.db.query<{ count: string }>(
    `select count(*) as count
     from billing_processor_events
     where signature_verified = false
       and received_at >= now() - ($1 || ' days')::interval`,
    [String(windowDays)]
  )).rows[0];

  return { count: Number(row?.count ?? 0), windowDays };
}

/**
 * Evaluates the chargeback ratio and emits a structured warning when it crosses
 * the alert threshold, so a rising dispute rate shows up in the logs before
 * Verotel reprices the account rather than after.
 */
export async function checkChargebackRatioAndAlert(
  app: FastifyInstance,
  log: { warn: (details: unknown, message: string) => void }
) {
  const ratio = await getChargebackRatio(app);

  if (ratio.surcharging) {
    log.warn(
      { ratio: ratio.ratio, chargebacks: ratio.chargebacks, approved: ratio.approved },
      "Chargeback ratio has reached the level where Verotel applies its 2.5% surcharge."
    );
  } else if (ratio.alerting) {
    log.warn(
      { ratio: ratio.ratio, chargebacks: ratio.chargebacks, approved: ratio.approved },
      "Chargeback ratio is approaching the 1.0% surcharge threshold."
    );
  }

  return ratio;
}

export type VelocityBreach = {
  scope: "user_hour" | "user_day" | "ip_day";
  observed: number;
  limit: number;
};

/**
 * Checks the velocity ceilings for one attempted purchase. Returns every breach
 * rather than the first, so a review has the whole picture.
 */
export async function checkVelocity(
  app: FastifyInstance,
  input: { userId: string; ipHash?: string | null }
): Promise<VelocityBreach[]> {
  const row = (await app.db.query<{ user_hour: string; user_day: string; ip_day: string }>(
    `select
       count(*) filter (where user_id = $1 and created_at >= now() - interval '1 hour') as user_hour,
       count(*) filter (where user_id = $1 and created_at >= now() - interval '1 day') as user_day,
       count(*) filter (where $2::text is not null and ip_hash = $2 and created_at >= now() - interval '1 day') as ip_day
     from payment_monitoring_events`,
    [input.userId, input.ipHash ?? null]
  )).rows[0];

  const breaches: VelocityBreach[] = [];
  const userHour = Number(row?.user_hour ?? 0);
  const userDay = Number(row?.user_day ?? 0);
  const ipDay = Number(row?.ip_day ?? 0);

  if (userHour > VELOCITY_LIMITS.perUserPerHour) {
    breaches.push({ scope: "user_hour", observed: userHour, limit: VELOCITY_LIMITS.perUserPerHour });
  }

  if (userDay > VELOCITY_LIMITS.perUserPerDay) {
    breaches.push({ scope: "user_day", observed: userDay, limit: VELOCITY_LIMITS.perUserPerDay });
  }

  if (input.ipHash && ipDay > VELOCITY_LIMITS.perIpPerDay) {
    breaches.push({ scope: "ip_day", observed: ipDay, limit: VELOCITY_LIMITS.perIpPerDay });
  }

  return breaches;
}
