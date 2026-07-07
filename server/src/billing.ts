import type { FastifyInstance } from "fastify";
import { ApiError } from "./errors.js";
import { getCruushEntitlement } from "./match-relationships.js";

export type CruushPlusPlanId =
  | "plus_weekly"
  | "plus_monthly"
  | "plus_3_month"
  | "plus_6_month"
  | "plus_annual"
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
    description: "$9.99 weekly cruush+ access.",
    amountCents: 999,
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
    description: "$59.94 every 6 months for cruush+.",
    amountCents: 5994,
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
    description: "$99 for one year of cruush+, limited to the first 1000 real users.",
    amountCents: 9900,
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
    description: "$999 one-time lifetime cruush+ founder access, limited to the first 250 real users.",
    amountCents: 99900,
    currency: "USD",
    interval: "lifetime",
    supplyLimit: 250,
    isFounder: true,
    isLifetime: true,
    badgeKeys: ["founder", "lifetime_founder"]
  }
];

export const PREMIUM_DISCOVERY_FILTER_KEYS = [
  "identities",
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

export function getCruushPlusPlan(planId: string): CruushPlusPlan {
  const plan = CRUUSH_PLUS_PLANS.find((candidate) => candidate.id === planId);

  if (!plan) {
    throw new ApiError(400, "VALIDATION_ERROR", "Unknown cruush+ plan.");
  }

  return plan;
}

export function hasPremiumDiscoveryFilters(query: Record<string, unknown>) {
  return PREMIUM_DISCOVERY_FILTER_KEYS.some((key) => {
    const value = query[key];
    return Array.isArray(value) && value.length > 0;
  });
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

export async function createFakeCheckoutSession(app: FastifyInstance, userId: string, planId: string) {
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
  const session = await loadCheckoutSession(app, userId, sessionId);

  if (session.processor !== "fake" || !session.testMode) {
    throw new ApiError(400, "VALIDATION_ERROR", "Only test checkout sessions can be completed here.");
  }

  if (session.status !== "pending") {
    throw new ApiError(400, "VALIDATION_ERROR", "Checkout session is not pending.");
  }

  const plan = getCruushPlusPlan(session.planId);
  const expiresAt = addPlanDuration(plan);
  await app.db.query(
    `update billing_checkout_sessions
     set status = 'completed',
         completed_at = now(),
         updated_at = now()
     where id = $1
       and user_id = $2`,
    [sessionId, userId]
  );

  if (plan.isLifetime) {
    await app.db.query(
      `insert into cruush_plus_lifetime_access (
         user_id,
         checkout_session_id,
         plan_id,
         test_mode
       )
       values ($1, $2, $3, $4)
       on conflict (user_id) do update
       set checkout_session_id = excluded.checkout_session_id,
           plan_id = excluded.plan_id,
           test_mode = excluded.test_mode,
           granted_at = now()`,
      [userId, sessionId, plan.id, session.testMode]
    );
  } else {
    await app.db.query(
      `insert into cruush_plus_subscriptions (
         user_id,
         checkout_session_id,
         plan_id,
         status,
         current_period_starts_at,
         current_period_ends_at,
         test_mode
       )
       values ($1, $2, $3, 'active', now(), $4, $5)
       on conflict (user_id) do update
       set checkout_session_id = excluded.checkout_session_id,
           plan_id = excluded.plan_id,
           status = 'active',
           current_period_starts_at = excluded.current_period_starts_at,
           current_period_ends_at = excluded.current_period_ends_at,
           test_mode = excluded.test_mode,
           updated_at = now()`,
      [userId, sessionId, plan.id, expiresAt, session.testMode]
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

  if (plan.isFounder) {
    await app.db.query(
      `insert into founder_redemptions (
         user_id,
         checkout_session_id,
         plan_id,
         amount_cents,
         test_mode
       )
       values ($1, $2, $3, $4, $5)
       on conflict (user_id, plan_id) do update
       set checkout_session_id = excluded.checkout_session_id,
           amount_cents = excluded.amount_cents,
           test_mode = excluded.test_mode,
           redeemed_at = now()`,
      [userId, sessionId, plan.id, plan.amountCents, session.testMode]
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
    testMode: session.testMode
  };
}
