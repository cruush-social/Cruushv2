import type { FastifyInstance } from "fastify";
import type { DbClient } from "./db.js";
import { runTransaction } from "./db.js";
import { ApiError } from "./errors.js";
import { CRYPTO_LATE_EVIDENCE_WINDOW_DAYS } from "./crypto-settlement-policy.js";
import { getCruushEntitlement } from "./match-relationships.js";
import { bankActivePromotionForPaidSubscription } from "./rewards-service.js";

export type CruushPlusPlanId =
  | "plus_weekly"
  | "plus_monthly"
  | "plus_3_month"
  | "plus_6_month"
  | "plus_annual"
  | "plus_lifetime"
  | "founder_annual"
  | "lifetime_founder";

export type BillingInterval = "week" | "month" | "3_months" | "6_months" | "year" | "lifetime";
export type UserBadgeKey = "founder" | "lifetime_founder";

export type CruushPlusPlan = {
  id: CruushPlusPlanId;
  name: string;
  description: string;
  amountCents: number;
  currency: "USD";
  interval: BillingInterval;
  durationMonths?: number;
  durationDays?: number;
  supplyLimit?: number;
  isFounder: boolean;
  isLifetime: boolean;
  badgeKeys: UserBadgeKey[];
};

type CountRow = {
  plan_id: string;
  redemption_count: string | number | null;
};

type BadgeRow = {
  badge_key: UserBadgeKey;
};

type SupplyReservationCountRow = {
  reservation_count: string | number;
};

export type BillingCheckoutSessionRow = {
  id: string;
  user_id: string;
  plan_id: string;
  processor: string;
  status: "pending" | "completed" | "cancelled" | "failed";
  test_mode: boolean;
  amount_cents: number;
  currency: string;
  created_at?: string | Date | null;
  expires_at?: string | Date | null;
  completed_at?: string | Date | null;
};

export const TEST_CHECKOUT_WARNING = "TEST CHECKOUT - no real payment will be collected.";

export const CRUUSH_PLUS_PLANS: CruushPlusPlan[] = [
  {
    id: "plus_weekly",
    name: "Weekly cruush+",
    description: "$10.99 weekly cruush+ access.",
    amountCents: 1099,
    currency: "USD",
    interval: "week",
    durationDays: 7,
    isFounder: false,
    isLifetime: false,
    badgeKeys: []
  },
  {
    id: "plus_monthly",
    name: "Monthly cruush+",
    description: "$18.99 monthly cruush+ access.",
    amountCents: 1899,
    currency: "USD",
    interval: "month",
    durationMonths: 1,
    isFounder: false,
    isLifetime: false,
    badgeKeys: []
  },
  {
    id: "plus_3_month",
    name: "3 month cruush+",
    description: "$35.97 every 3 months for cruush+.",
    amountCents: 3597,
    currency: "USD",
    interval: "3_months",
    durationMonths: 3,
    isFounder: false,
    isLifetime: false,
    badgeKeys: []
  },
  {
    id: "plus_6_month",
    name: "6 month cruush+",
    description: "$53.94 every 6 months for cruush+.",
    amountCents: 5394,
    currency: "USD",
    interval: "6_months",
    durationMonths: 6,
    isFounder: false,
    isLifetime: false,
    badgeKeys: []
  },
  {
    id: "plus_annual",
    name: "Annual cruush+",
    description: "$119.99 per year for cruush+.",
    amountCents: 11999,
    currency: "USD",
    interval: "year",
    durationMonths: 12,
    isFounder: false,
    isLifetime: false,
    badgeKeys: []
  },
  {
    id: "founder_annual",
    name: "Founder annual cruush+",
    description: "$99.99 for one year of cruush+, limited to the first 1000 real users.",
    amountCents: 9999,
    currency: "USD",
    interval: "year",
    durationMonths: 12,
    supplyLimit: 1000,
    isFounder: true,
    isLifetime: false,
    badgeKeys: ["founder"]
  },
  {
    id: "lifetime_founder",
    name: "Lifetime founder cruush+",
    description: "$999.99 one-time lifetime cruush+ founder access, limited to the first 1000 real users.",
    amountCents: 99999,
    currency: "USD",
    interval: "lifetime",
    supplyLimit: 1000,
    isFounder: true,
    isLifetime: true,
    badgeKeys: ["founder", "lifetime_founder"]
  },
  {
    id: "plus_lifetime",
    name: "Lifetime cruush+",
    description: "$1,999.99 one-time lifetime cruush+ access after the founder offer ends.",
    amountCents: 199999,
    currency: "USD",
    interval: "lifetime",
    isFounder: false,
    isLifetime: true,
    badgeKeys: []
  }
];

export const PREMIUM_DISCOVERY_FILTER_KEYS = [
  "identities",
  "mileHighClub",
  "presentations",
  "lookingFor",
  "timing",
  "hosting",
  "vibes",
  "scenes",
  "archetypes",
  "crowds",
  "hobbies",
  "positions",
  "roles",
  "kinks",
  "bodyTypes",
  "sexuality",
  "substanceBoundaries"
] as const;

export const FREE_DISCOVERY_FILTER_LIMIT = 3;

function isSchemaCompatibilityError(error: unknown) {
  const code = typeof error === "object" && error !== null && "code" in error
    ? String((error as { code?: string }).code)
    : "";

  if (["42703", "42P01", "42883", "22P02"].includes(code)) {
    return true;
  }

  const message = error instanceof Error ? error.message.toLowerCase() : "";
  return message.includes("column") ||
    message.includes("relation") ||
    message.includes("operator does not exist") ||
    message.includes("does not exist");
}

async function safeRows<T>(app: FastifyInstance, sql: string, values: unknown[] = []): Promise<T[]> {
  try {
    const result = await app.db.query<T>(sql, values);
    return result?.rows ?? [];
  } catch (error) {
    if (isSchemaCompatibilityError(error)) {
      return [];
    }

    throw error;
  }
}

function toIsoDate(value: string | Date | null | undefined) {
  return value ? new Date(value).toISOString() : null;
}

function addPlanDuration(plan: CruushPlusPlan, from = new Date()) {
  if (plan.isLifetime) {
    return null;
  }

  const expiresAt = new Date(from.getTime());

  if (plan.durationDays) {
    expiresAt.setUTCDate(expiresAt.getUTCDate() + plan.durationDays);
  }

  if (plan.durationMonths) {
    expiresAt.setUTCMonth(expiresAt.getUTCMonth() + plan.durationMonths);
  }

  return expiresAt;
}

/**
 * Crypto intent creation and settlement use the same lock order: member first,
 * then limited plan. Transaction-scoped advisory locks let aggregate checks
 * remain safe without adding a reservation table or changing checkout data.
 */
export async function lockCryptoPurchaseUser(db: DbClient, userId: string) {
  await db.query(
    "select pg_advisory_xact_lock(hashtextextended($1, 0))",
    [`cruush:crypto-purchase:user:${userId}`]
  );
}

export async function lockCryptoPlanSupply(db: DbClient, planId: CruushPlusPlanId) {
  await db.query(
    "select pg_advisory_xact_lock(hashtextextended($1, 0))",
    [`cruush:crypto-supply:plan:${planId}`]
  );
}

async function countCryptoPlanSupplyReservations(db: DbClient, planId: CruushPlusPlanId) {
  const result = await db.query<SupplyReservationCountRow>(
    `select count(*)::int as reservation_count
     from (
       select user_id
       from founder_redemptions
       where plan_id = $1
         and test_mode = false
       union
       select user_id
       from crypto_payment_intents
       where plan_id = $1
         and product_type = 'cruush_plus'
         and (
           status in ('confirming', 'paid', 'refunded')
           or (
             status in ('pending', 'awaiting_payment')
             and expires_at > now()
           )
           or (
             status = 'expired'
             and expires_at > now() - ($2::integer * interval '1 day')
           )
         )
     ) reserved_users`,
    [planId, CRYPTO_LATE_EVIDENCE_WINDOW_DAYS]
  );

  return Number(result.rows[0]?.reservation_count ?? 0);
}

export async function assertCryptoPlanCanReserve(
  db: DbClient,
  plan: CruushPlusPlan
) {
  if (plan.id === "plus_lifetime") {
    const founderPlan = getCruushPlusPlan("lifetime_founder");
    await lockCryptoPlanSupply(db, founderPlan.id);
    const result = await db.query<SupplyReservationCountRow>(
      `select count(*)::int as reservation_count
       from founder_redemptions
       where plan_id = $1
         and test_mode = false`,
      [founderPlan.id]
    );
    const redemptionCount = Number(result.rows[0]?.reservation_count ?? 0);

    if (!founderPlan.supplyLimit || redemptionCount < founderPlan.supplyLimit) {
      throw new ApiError(409, "VALIDATION_ERROR", "Founder lifetime cruush+ is still available.");
    }

    return;
  }

  if (!plan.supplyLimit) {
    return;
  }

  await lockCryptoPlanSupply(db, plan.id);
  const reservationCount = await countCryptoPlanSupplyReservations(db, plan.id);
  if (reservationCount >= plan.supplyLimit) {
    throw new ApiError(409, "VALIDATION_ERROR", "That cruush+ plan is sold out.");
  }
}

async function assertCryptoPlanGrantWithinSupply(
  db: DbClient,
  plan: CruushPlusPlan,
  userId: string,
  intentId: string
) {
  if (!plan.supplyLimit) {
    return;
  }

  await lockCryptoPlanSupply(db, plan.id);
  const intent = await db.query<{ reserved: boolean }>(
    `select exists (
       select 1
       from crypto_payment_intents
       where id = $1
         and user_id = $2
         and plan_id = $3
         and product_type = 'cruush_plus'
         and status = 'paid'
     ) as reserved`,
    [intentId, userId, plan.id]
  );
  const reservationCount = await countCryptoPlanSupplyReservations(db, plan.id);

  if (intent.rows[0]?.reserved !== true || reservationCount > plan.supplyLimit) {
    throw new ApiError(409, "VALIDATION_ERROR", "That cruush+ plan is sold out.");
  }
}

export function getCruushPlusPlan(planId: string): CruushPlusPlan {
  const plan = CRUUSH_PLUS_PLANS.find((candidate) => candidate.id === planId);

  if (!plan) {
    throw new ApiError(400, "VALIDATION_ERROR", "Unknown cruush+ plan.");
  }

  return plan;
}

export function countActivePremiumDiscoveryFilters(query: Record<string, unknown>) {
  return PREMIUM_DISCOVERY_FILTER_KEYS.reduce((count, key) => {
    const value = query[key];
    return (Array.isArray(value) && value.length > 0) || value === true ? count + 1 : count;
  }, 0);
}

export function hasPremiumDiscoveryFilters(query: Record<string, unknown>) {
  return countActivePremiumDiscoveryFilters(query) > FREE_DISCOVERY_FILTER_LIMIT;
}

export async function requireCruushPlus(app: FastifyInstance, userId: string, message: string) {
  const entitlement = await getCruushEntitlement(app, userId);

  if (!entitlement.cruushPlus) {
    throw new ApiError(402, "CRUUSH_PLUS_REQUIRED", message);
  }

  return entitlement;
}

export async function getPlanAvailability(app: FastifyInstance) {
  const counts = await safeRows<CountRow>(
    app,
    `select plan_id, count(*)::int as redemption_count
     from founder_redemptions
     where test_mode = false
     group by plan_id`
  );
  const countByPlan = new Map(counts.map((row) => [
    row.plan_id,
    Number(row.redemption_count ?? 0)
  ]));

  return new Map(CRUUSH_PLUS_PLANS.map((plan) => {
    if (!plan.supplyLimit) {
      return [plan.id, null] as const;
    }

    return [plan.id, Math.max(plan.supplyLimit - (countByPlan.get(plan.id) ?? 0), 0)] as const;
  }));
}

export async function getPublicCruushPlusPlans(app: FastifyInstance) {
  const availability = await getPlanAvailability(app);
  const founderLifetimeSoldOut = availability.get("lifetime_founder") === 0;

  return CRUUSH_PLUS_PLANS
    .filter((plan) => plan.id !== "plus_lifetime" || founderLifetimeSoldOut)
    .map((plan) => ({
      ...plan,
      supplyRemaining: availability.get(plan.id) ?? null
    }));
}

export async function getUserBillingStatus(app: FastifyInstance, userId: string) {
  const [entitlement, badges] = await Promise.all([
    getCruushEntitlement(app, userId),
    safeRows<BadgeRow>(
      app,
      `select badge_key
       from user_badges
       where user_id = $1
       order by awarded_at asc`,
      [userId]
    )
  ]);

  return {
    cruushPlus: entitlement.cruushPlus,
    expiresAt: entitlement.expiresAt,
    badges: badges.map((row) => row.badge_key),
    processor: "fake" as const,
    testCheckout: true
  };
}

export function mapCheckoutSession(row: BillingCheckoutSessionRow) {
  const plan = getCruushPlusPlan(row.plan_id);

  return {
    id: row.id,
    userId: row.user_id,
    planId: plan.id,
    plan,
    processor: row.processor,
    status: row.status,
    testMode: row.test_mode,
    amountCents: row.amount_cents,
    currency: row.currency,
    createdAt: toIsoDate(row.created_at),
    expiresAt: toIsoDate(row.expires_at),
    completedAt: toIsoDate(row.completed_at),
    testWarning: row.test_mode ? TEST_CHECKOUT_WARNING : null
  };
}

function assertTestCheckoutAllowed(app: FastifyInstance) {
  if (app.config.BILLING_TEST_CHECKOUT_ENABLED !== true) {
    throw new ApiError(404, "NOT_FOUND", "Not found.");
  }
}

export async function createFakeCheckoutSession(app: FastifyInstance, userId: string, planId: string) {
  assertTestCheckoutAllowed(app);

  const plan = getCruushPlusPlan(planId);
  const row = (await app.db.query<BillingCheckoutSessionRow>(
    `insert into billing_checkout_sessions (
       user_id,
       plan_id,
       processor,
       status,
       test_mode,
       amount_cents,
       currency,
       expires_at
     )
     values ($1, $2, 'fake', 'pending', true, $3, $4, now() + interval '30 minutes')
     returning id, user_id, plan_id, processor, status, test_mode, amount_cents, currency, created_at, expires_at, completed_at`,
    [userId, plan.id, plan.amountCents, plan.currency]
  )).rows[0];

  if (!row) {
    throw new ApiError(500, "INTERNAL_ERROR", "Unable to create checkout session.");
  }

  return mapCheckoutSession(row);
}

export async function loadCheckoutSession(app: FastifyInstance, userId: string, sessionId: string) {
  const row = (await app.db.query<BillingCheckoutSessionRow>(
    `select id, user_id, plan_id, processor, status, test_mode, amount_cents, currency, created_at, expires_at, completed_at
     from billing_checkout_sessions
     where id = $1
       and user_id = $2
     limit 1`,
    [sessionId, userId]
  )).rows[0];

  if (!row) {
    throw new ApiError(404, "NOT_FOUND", "Checkout session not found.");
  }

  return mapCheckoutSession(row);
}

export async function completeFakeCheckoutSession(app: FastifyInstance, userId: string, sessionId: string) {
  assertTestCheckoutAllowed(app);

  return runTransaction(app.db, async (transactionDb) => {
    const transactionApp = {
      config: app.config,
      db: transactionDb
    } as FastifyInstance;
    const session = await loadCheckoutSession(transactionApp, userId, sessionId);

    if (session.processor !== "fake" || !session.testMode) {
      throw new ApiError(400, "VALIDATION_ERROR", "Only test checkout sessions can be completed here.");
    }

    if (session.status !== "pending") {
      throw new ApiError(400, "VALIDATION_ERROR", "Checkout session is not pending.");
    }

    const plan = getCruushPlusPlan(session.planId);
    await transactionDb.query(
      `update billing_checkout_sessions
       set status = 'completed',
           completed_at = now(),
           updated_at = now()
       where id = $1
         and user_id = $2`,
      [sessionId, userId]
    );

    return grantCruushPlusPlan(transactionApp, userId, plan, {
      kind: "checkout_session",
      sessionId,
      testMode: session.testMode
    });
  });
}

/**
 * Where a cruush+ grant came from. Every grant must name one, so a paid access
 * record can always be traced back to the thing that paid for it.
 */
export type CruushPlusGrantSource =
  | { kind: "checkout_session"; sessionId: string; testMode: boolean }
  | { kind: "crypto_payment_intent"; intentId: string };

/**
 * Applies one cruush+ plan to a member.
 *
 * This is the single implementation of "give someone cruush+". Both the test
 * checkout path and the crypto settlement path go through it, so the two can
 * never drift apart on what a plan actually grants.
 *
 * Callers are responsible for proving the payment is real before calling. This
 * function does not verify payment; it applies a grant that has already been
 * earned.
 */
export async function grantCruushPlusPlan(
  app: FastifyInstance,
  userId: string,
  plan: CruushPlusPlan,
  source: CruushPlusGrantSource
) {
  let expiresAt = addPlanDuration(plan);
  const sessionId = source.kind === "checkout_session" ? source.sessionId : null;
  const cryptoIntentId = source.kind === "crypto_payment_intent" ? source.intentId : null;
  const testMode = source.kind === "checkout_session" ? source.testMode : false;

  if (source.kind === "crypto_payment_intent" || plan.isLifetime) {
    await lockCryptoPurchaseUser(app.db, userId);
  }

  if (source.kind === "crypto_payment_intent") {
    await assertCryptoPlanGrantWithinSupply(app.db, plan, userId, source.intentId);
  }

  if (plan.isLifetime) {
    if (source.kind === "crypto_payment_intent") {
      const lifetimeGrant = await app.db.query<{ user_id: string }>(
        `with lifetime_grant as (
           insert into cruush_plus_lifetime_access (
             user_id,
             checkout_session_id,
             crypto_payment_intent_id,
             plan_id,
             test_mode
           )
           values ($1, null, $2, $3, false)
           on conflict (user_id) do nothing
           returning user_id
         ), closed_unpaid_intents as (
           update crypto_payment_intents
           set status = case
                 when status = 'awaiting_payment' then 'expired'
                 else 'cancelled'
               end,
               settlement_note = 'Lifetime access was granted before this payment completed. No additional payment was accepted.',
               updated_at = now()
           where user_id in (select user_id from lifetime_grant)
             and product_type = 'cruush_plus'
             and status in ('pending', 'awaiting_payment')
           returning id
         )
         select user_id from lifetime_grant`,
        [userId, source.intentId, plan.id]
      );

      if (lifetimeGrant.rows.length === 0) {
        throw new ApiError(409, "VALIDATION_ERROR", "Lifetime cruush+ is already active.");
      }
    } else {
      await app.db.query(
        `with lifetime_grant as (
           insert into cruush_plus_lifetime_access (
             user_id,
             checkout_session_id,
             crypto_payment_intent_id,
             plan_id,
             test_mode
           )
           values ($1, $2, $3, $4, $5)
           on conflict (user_id) do update
           set checkout_session_id = excluded.checkout_session_id,
               crypto_payment_intent_id = excluded.crypto_payment_intent_id,
               plan_id = excluded.plan_id,
               test_mode = excluded.test_mode,
               granted_at = now()
           returning user_id
         ), closed_unpaid_intents as (
           update crypto_payment_intents
           set status = case
                 when status = 'awaiting_payment' then 'expired'
                 else 'cancelled'
               end,
               settlement_note = 'Lifetime access was granted before this payment completed. No additional payment was accepted.',
               updated_at = now()
           where user_id in (select user_id from lifetime_grant)
             and product_type = 'cruush_plus'
             and status in ('pending', 'awaiting_payment')
           returning id
         )
         select user_id from lifetime_grant`,
        [userId, sessionId, cryptoIntentId, plan.id, testMode]
      );
    }
  } else if (source.kind === "crypto_payment_intent") {
    const durationMonths = plan.durationMonths ?? 0;
    const durationDays = plan.durationDays ?? 0;
    const subscription = await app.db.query<{ current_period_ends_at: string | Date }>(
      `with current_entitlement as (
         select cruush_plus_expires_at
         from user_entitlements
         where user_id = $1
         for update
       )
       insert into cruush_plus_subscriptions (
         user_id,
         checkout_session_id,
         crypto_payment_intent_id,
         plan_id,
         status,
         current_period_starts_at,
         current_period_ends_at,
         test_mode
       )
       values (
         $1,
         null,
         $2,
         $3,
         'active',
         now(),
         (
           greatest(
             now(),
             coalesce((select cruush_plus_expires_at from current_entitlement), now())
           ) at time zone 'UTC'
           + make_interval(months => $4::integer, days => $5::integer)
         ) at time zone 'UTC',
         false
       )
       on conflict (user_id) do update
       set checkout_session_id = null,
           crypto_payment_intent_id = excluded.crypto_payment_intent_id,
           plan_id = excluded.plan_id,
           status = 'active',
           current_period_starts_at = case
             when greatest(
               cruush_plus_subscriptions.current_period_ends_at,
               coalesce((select cruush_plus_expires_at from current_entitlement), '-infinity'::timestamptz)
             ) > now()
             then cruush_plus_subscriptions.current_period_starts_at
             else now()
           end,
           current_period_ends_at = (
             greatest(
               now(),
               cruush_plus_subscriptions.current_period_ends_at,
               coalesce((select cruush_plus_expires_at from current_entitlement), '-infinity'::timestamptz)
             ) at time zone 'UTC'
             + make_interval(months => $4::integer, days => $5::integer)
           ) at time zone 'UTC',
           test_mode = false,
           updated_at = now()
       returning current_period_ends_at`,
      [userId, source.intentId, plan.id, durationMonths, durationDays]
    );

    if (!subscription.rows[0]) {
      throw new ApiError(500, "INTERNAL_ERROR", "Unable to grant cruush+.");
    }

    expiresAt = new Date(subscription.rows[0].current_period_ends_at);
  } else {
    await app.db.query(
      `insert into cruush_plus_subscriptions (
         user_id,
         checkout_session_id,
         crypto_payment_intent_id,
         plan_id,
         status,
         current_period_starts_at,
         current_period_ends_at,
         test_mode
       )
       values ($1, $2, $3, $4, 'active', now(), $5, $6)
       on conflict (user_id) do update
       set checkout_session_id = excluded.checkout_session_id,
           crypto_payment_intent_id = excluded.crypto_payment_intent_id,
           plan_id = excluded.plan_id,
           status = 'active',
           current_period_starts_at = excluded.current_period_starts_at,
           current_period_ends_at = excluded.current_period_ends_at,
           test_mode = excluded.test_mode,
           updated_at = now()`,
      [userId, sessionId, cryptoIntentId, plan.id, expiresAt, testMode]
    );
  }

  const entitlement = (await app.db.query(
    `insert into user_entitlements (
       user_id,
       cruush_plus_enabled,
       cruush_plus_expires_at
     )
     values ($1, true, $2)
     on conflict (user_id) do update
     set cruush_plus_enabled = true,
         cruush_plus_expires_at = excluded.cruush_plus_expires_at,
         updated_at = now()
     returning cruush_plus_enabled, cruush_plus_expires_at`,
    [userId, expiresAt]
  )).rows[0] as { cruush_plus_enabled: boolean; cruush_plus_expires_at: string | Date | null } | undefined;

  await bankActivePromotionForPaidSubscription(app.db, userId);

  if (plan.isFounder) {
    await app.db.query(
      `insert into founder_redemptions (
         user_id,
         checkout_session_id,
         crypto_payment_intent_id,
         plan_id,
         amount_cents,
         test_mode
       )
       values ($1, $2, $3, $4, $5, $6)
       on conflict (user_id, plan_id) do update
       set checkout_session_id = excluded.checkout_session_id,
           crypto_payment_intent_id = excluded.crypto_payment_intent_id,
           amount_cents = excluded.amount_cents,
           test_mode = excluded.test_mode,
           redeemed_at = now()`,
      [userId, sessionId, cryptoIntentId, plan.id, plan.amountCents, testMode]
    );
  }

  for (const badgeKey of plan.badgeKeys) {
    await app.db.query(
      `insert into user_badges (
         user_id,
         badge_key,
         source_plan_id,
         permanent
       )
       values ($1, $2, $3, true)
       on conflict (user_id, badge_key) do update
       set source_plan_id = excluded.source_plan_id,
           permanent = true`,
      [userId, badgeKey, plan.id]
    );
  }

  return {
    cruushPlus: entitlement?.cruush_plus_enabled === true,
    expiresAt: toIsoDate(entitlement?.cruush_plus_expires_at ?? expiresAt),
    badges: plan.badgeKeys,
    testMode
  };
}
