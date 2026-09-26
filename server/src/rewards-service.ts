import type { FastifyInstance } from "fastify";
import { ApiError } from "./errors.js";
import { runTransaction, type DbClient } from "./db.js";
import { sendPushForPersistedNotification } from "./notification-service.js";
import {
  DEFAULT_REWARD_CONFIG,
  loadRewardConfig,
  type RewardActivityType,
  type RewardConfig
} from "./reward-config.js";

const DAY_SECONDS = 86_400;

type RewardSource = "activity_recurring" | "activity_long_bonus" | "referral" | "admin";

type RewardServiceApp = {
  config: FastifyInstance["config"];
  db: DbClient;
  log: Pick<FastifyInstance["log"], "warn" | "error" | "info">;
};

type GrantInput = {
  userId: string;
  source: RewardSource;
  days: number;
  idempotencyKey: string;
  milestoneKey?: string;
  referralId?: string;
  auditMetadata?: Record<string, unknown>;
};

type EntitlementRow = {
  legacy_enabled?: boolean | null;
  legacy_expires_at?: string | Date | null;
  has_lifetime?: boolean | null;
  paid_expires_at?: string | Date | null;
};

type PromotionRow = {
  active_until: string | Date | null;
  banked_seconds: string | number;
};

type ActivityStreakRow = {
  current_streak: number;
  longest_streak: number;
  last_activity_date: string | Date | null;
};

type RewardGrantRow = {
  id: string;
  user_id: string;
  source: RewardSource;
  days: number;
  milestone_key: string | null;
  referral_id: string | null;
  audit_metadata: Record<string, unknown> | string | null;
  created_at: string | Date;
  reversed_at?: string | Date | null;
};

type PromoCodeRow = {
  id: string;
  code: string;
  label: string;
  grant_days: string | number | null;
  active_until: string | Date | null;
  max_redemptions: string | number | null;
};

export type RewardGrantResult = {
  id: string;
  source: RewardSource;
  days: number;
  createdAt: string;
};

export type PromotionalClaimResult = {
  claimed: boolean;
  alreadyRedeemed?: boolean;
  label: string;
  activeUntil: string | null;
  grant: RewardGrantResult | null;
};

export type WelcomeDayStatus = {
  available: boolean;
  claimed: boolean;
  activeUntil: string | null;
};

function welcomeDayIdempotencyKey(userId: string) {
  return `welcome-day:${userId}`;
}

function asDate(value: string | Date | null | undefined) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function normalizeTimeZone(timezone: string | null | undefined) {
  const candidate = timezone?.trim() || "UTC";

  try {
    new Intl.DateTimeFormat("en-US", { timeZone: candidate }).format();
    return candidate;
  } catch {
    return "UTC";
  }
}

export function calendarDateInTimeZone(now: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: normalizeTimeZone(timezone),
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function daysBetweenCalendarDates(first: string, second: string) {
  const firstMs = Date.parse(`${first}T00:00:00.000Z`);
  const secondMs = Date.parse(`${second}T00:00:00.000Z`);
  return Math.round((secondMs - firstMs) / (DAY_SECONDS * 1000));
}

async function getEntitlementRow(db: DbClient, userId: string) {
  const result = await db.query<EntitlementRow>(
    `select
       coalesce(entitlement.cruush_plus_enabled, false) as legacy_enabled,
       entitlement.cruush_plus_expires_at as legacy_expires_at,
       exists (
         select 1 from cruush_plus_lifetime_access lifetime
         where lifetime.user_id = $1
       ) as has_lifetime,
       (
         select max(subscription.current_period_ends_at)
         from cruush_plus_subscriptions subscription
         where subscription.user_id = $1
           and subscription.status = 'active'
           and subscription.current_period_ends_at > now()
       ) as paid_expires_at
     from (select $1::uuid as user_id) subject
     left join user_entitlements entitlement on entitlement.user_id = subject.user_id`,
    [userId]
  );
  return result.rows[0] ?? {};
}

function paidAccessIsActive(row: EntitlementRow, now = new Date()) {
  const legacyExpiry = asDate(row.legacy_expires_at);
  const paidExpiry = asDate(row.paid_expires_at);
  const legacyActive = row.legacy_enabled === true && (!legacyExpiry || legacyExpiry > now);
  return row.has_lifetime === true || legacyActive || Boolean(paidExpiry && paidExpiry > now);
}

async function ensurePromotionRow(db: DbClient, userId: string) {
  const result = await db.query<PromotionRow>(
    `insert into promotional_cruush_plus_entitlements (user_id)
     values ($1)
     on conflict (user_id) do update set user_id = excluded.user_id
     returning active_until, banked_seconds`,
    [userId]
  );
  return result.rows[0] ?? { active_until: null, banked_seconds: 0 };
}

function remainingActiveSeconds(row: PromotionRow, now = new Date()) {
  const activeUntil = asDate(row.active_until);
  return activeUntil ? Math.max(0, Math.ceil((activeUntil.getTime() - now.getTime()) / 1000)) : 0;
}

async function grantedDaysWithinCap(
  db: DbClient,
  input: GrantInput,
  config: RewardConfig
) {
  let cap: number | null = null;
  let used = 0;

  if (input.source.startsWith("activity_")) {
    cap = config.activityRewardCapDays;
    const result = await db.query<{ total: string | number | null }>(
      `select coalesce(sum(reward.days), 0)::int as total
       from reward_grants reward
       left join reward_grant_reversals reversal on reversal.grant_id = reward.id
       where reward.user_id = $1
         and reward.source in ('activity_recurring', 'activity_long_bonus')
         and reward.created_at >= now() - ($2::int * interval '1 day')
         and reversal.id is null`,
      [input.userId, config.activityRewardCapPeriodDays]
    );
    used = Number(result.rows[0]?.total ?? 0);
  } else if (input.source === "referral" && config.referralRewardCapDays !== null) {
    cap = config.referralRewardCapDays;
    const result = await db.query<{ total: string | number | null }>(
      `select coalesce(sum(reward.days), 0)::int as total
       from reward_grants reward
       left join reward_grant_reversals reversal on reversal.grant_id = reward.id
       where reward.user_id = $1
         and reward.source = 'referral'
         and reversal.id is null`,
      [input.userId]
    );
    used = Number(result.rows[0]?.total ?? 0);
  }

  if (cap !== null && used + input.days > cap) {
    return 0;
  }

  return input.days;
}

export async function grantPromotionalDaysInTransaction(
  db: DbClient,
  input: GrantInput,
  config: RewardConfig
): Promise<RewardGrantResult | null> {
  // Serialize all grants for one recipient so rolling caps and the promotional
  // bank limit remain correct when different workers grant concurrently.
  await db.query("select id from app_users where id = $1 for update", [input.userId]);
  const requestedDays = await grantedDaysWithinCap(db, input, config);

  if (requestedDays <= 0) {
    return null;
  }

  const promotion = await ensurePromotionRow(db, input.userId);
  const existingSeconds = Number(promotion.banked_seconds ?? 0) + remainingActiveSeconds(promotion);
  const maximumSeconds = config.maxBankedPromotionalDays * DAY_SECONDS;

  if (existingSeconds + requestedDays * DAY_SECONDS > maximumSeconds) {
    return null;
  }

  const inserted = await db.query<RewardGrantRow>(
    `insert into reward_grants (
       user_id,
       source,
       days,
       idempotency_key,
       milestone_key,
       referral_id,
       audit_metadata
     )
     values ($1, $2, $3, $4, $5, $6, $7::jsonb)
     on conflict do nothing
     returning id::text, user_id::text, source, days, milestone_key,
       referral_id::text, audit_metadata, created_at`,
    [
      input.userId,
      input.source,
      requestedDays,
      input.idempotencyKey,
      input.milestoneKey ?? null,
      input.referralId ?? null,
      JSON.stringify(input.auditMetadata ?? {})
    ]
  );
  const grant = inserted.rows[0];

  if (!grant) {
    return null;
  }

  const entitlement = await getEntitlementRow(db, input.userId);

  if (paidAccessIsActive(entitlement)) {
    await db.query(
      `update promotional_cruush_plus_entitlements
       set banked_seconds = banked_seconds + ($2::bigint * $3::bigint),
           updated_at = now()
       where user_id = $1`,
      [input.userId, requestedDays, DAY_SECONDS]
    );
  } else {
    await db.query(
      `update promotional_cruush_plus_entitlements
       set active_until = greatest(coalesce(active_until, now()), now())
           + ($2::bigint * interval '1 second'),
           updated_at = now()
       where user_id = $1`,
      [input.userId, requestedDays * DAY_SECONDS]
    );
  }

  await db.query(
    `insert into app_notifications (
       user_id, type, title, body, link_url, dedupe_key, metadata
     )
     values ($1, 'reward', 'cruush+ reward earned',
       $2, '/rewards', $3, $4::jsonb)
     on conflict (user_id, dedupe_key) where dedupe_key is not null do nothing`,
    [
      input.userId,
      `${requestedDays} promotional ${requestedDays === 1 ? "day" : "days"} of cruush+ added.`,
      `reward:${input.idempotencyKey}`,
      JSON.stringify({ grantId: grant.id, days: requestedDays, source: input.source })
    ]
  );

  return {
    id: grant.id,
    source: grant.source,
    days: grant.days,
    createdAt: new Date(grant.created_at).toISOString()
  };
}

export async function grantPromotionalDays(
  app: RewardServiceApp,
  input: GrantInput
) {
  const config = await loadRewardConfig(app.db);
  const grant = await runTransaction(app.db, (db) => grantPromotionalDaysInTransaction(db, input, config));

  if (grant) {
    await sendPushForPersistedNotification(app, {
      userId: input.userId,
      dedupeKey: `reward:${input.idempotencyKey}`
    });
  }

  return grant;
}

export async function getWelcomeDayStatus(
  app: RewardServiceApp,
  userId: string,
): Promise<WelcomeDayStatus> {
  const result = await app.db.query<{ claimed: boolean; active_until: string | Date | null }>(
    `select
       exists (
         select 1
         from reward_grants reward
         where reward.user_id = $1
           and reward.idempotency_key = $2
       ) as claimed,
       promotion.active_until
     from promotional_cruush_plus_entitlements promotion
     where promotion.user_id = $1`,
    [userId, welcomeDayIdempotencyKey(userId)],
  );
  const row = result.rows[0];
  const claimed = row?.claimed === true;
  const activeUntil = asDate(row?.active_until)?.toISOString() ?? null;

  return {
    available: !claimed,
    claimed,
    activeUntil,
  };
}

export async function claimWelcomeDay(
  app: RewardServiceApp,
  userId: string,
) {
  const grant = await grantPromotionalDays(app, {
    userId,
    source: "admin",
    days: 1,
    idempotencyKey: welcomeDayIdempotencyKey(userId),
    milestoneKey: "welcome-day",
    auditMetadata: {
      reason: "outside-service-area-welcome-day",
    },
  });

  if (!grant) {
    const status = await getWelcomeDayStatus(app, userId);
    if (status.claimed) {
      return { ...status, grant: null };
    }
    throw new ApiError(409, "VALIDATION_ERROR", "Your cruush+ day could not be applied right now.");
  }

  const status = await getWelcomeDayStatus(app, userId);
  return { ...status, available: false, claimed: true, grant };
}

async function grantPromotionalAccessUntilInTransaction(
  db: DbClient,
  input: {
    userId: string;
    activeUntil: Date;
    days: number;
    idempotencyKey: string;
    label: string;
    auditMetadata?: Record<string, unknown>;
  }
): Promise<PromotionalClaimResult> {
  await db.query("select id from app_users where id = $1 for update", [input.userId]);
  await ensurePromotionRow(db, input.userId);

  const inserted = await db.query<RewardGrantRow>(
    `insert into reward_grants (
       user_id,
       source,
       days,
       idempotency_key,
       milestone_key,
       referral_id,
       audit_metadata
     )
     values ($1, 'admin', $2, $3, $4, null, $5::jsonb)
     on conflict do nothing
     returning id::text, user_id::text, source, days, milestone_key,
       referral_id::text, audit_metadata, created_at`,
    [
      input.userId,
      input.days,
      input.idempotencyKey,
      input.idempotencyKey,
      JSON.stringify({
        label: input.label,
        activeUntil: input.activeUntil.toISOString(),
        ...input.auditMetadata
      })
    ]
  );
  const grant = inserted.rows[0] ?? null;

  if (!grant) {
    return {
      claimed: false,
      label: input.label,
      activeUntil: input.activeUntil.toISOString(),
      grant: null
    };
  }

  await db.query(
    `update promotional_cruush_plus_entitlements
     set active_until = greatest(coalesce(active_until, now()), $2::timestamptz),
         updated_at = now()
     where user_id = $1`,
    [input.userId, input.activeUntil.toISOString()]
  );

  await db.query(
    `insert into app_notifications (
       user_id, type, title, body, link_url, dedupe_key, metadata
     )
     values ($1, 'reward', 'cruush+ reward earned',
       $2, '/rewards', $3, $4::jsonb)
     on conflict (user_id, dedupe_key) where dedupe_key is not null do nothing`,
    [
      input.userId,
      `${input.label} activated through ${input.activeUntil.toLocaleDateString("en-US", { month: "short", day: "numeric" })}.`,
      `reward:${input.idempotencyKey}`,
      JSON.stringify({ grantId: grant.id, source: "admin", activeUntil: input.activeUntil.toISOString() })
    ]
  );

  return {
    claimed: Boolean(grant),
    label: input.label,
    activeUntil: input.activeUntil.toISOString(),
    grant: grant ? {
      id: grant.id,
      source: grant.source,
      days: grant.days,
      createdAt: new Date(grant.created_at).toISOString()
    } : null
  };
}

export async function redeemCruushPlusPromoCode(
  app: RewardServiceApp,
  input: { userId: string; code: string }
): Promise<PromotionalClaimResult> {
  const normalizedCode = input.code.trim().toUpperCase();

  if (!normalizedCode) {
    throw new ApiError(400, "VALIDATION_ERROR", "Enter a cruush+ code.");
  }

  const config = await loadRewardConfig(app.db);
  let notificationDedupeKey: string | null = null;

  const result = await runTransaction(app.db, async (db) => {
    const promo = (await db.query<PromoCodeRow>(
      `select id::text, code, label, grant_days, active_until, max_redemptions
       from cruush_plus_promo_codes
       where upper(code) = $1
         and active = true
         and starts_at <= now()
         and (expires_at is null or expires_at > now())
       limit 1
       for update`,
      [normalizedCode]
    )).rows[0];

    if (!promo) {
      throw new ApiError(404, "NOT_FOUND", "cruush+ code is invalid or expired.");
    }

    const existing = (await db.query<{ id: string }>(
      `select id::text
       from cruush_plus_promo_code_redemptions
       where promo_code_id = $1 and user_id = $2
       limit 1`,
      [promo.id, input.userId]
    )).rows[0];

    if (existing) {
      return {
        claimed: false,
        alreadyRedeemed: true,
        label: promo.label,
        activeUntil: asDate(promo.active_until)?.toISOString() ?? null,
        grant: null
      };
    }

    if (promo.max_redemptions !== null) {
      const redemptionCount = (await db.query<{ total: string | number }>(
        `select count(*)::int as total
         from cruush_plus_promo_code_redemptions
         where promo_code_id = $1`,
        [promo.id]
      )).rows[0];

      if (Number(redemptionCount?.total ?? 0) >= Number(promo.max_redemptions)) {
        throw new ApiError(409, "VALIDATION_ERROR", "cruush+ code has already been fully redeemed.");
      }
    }

    let result: PromotionalClaimResult;

    if (promo.grant_days !== null) {
      const grant = await grantPromotionalDaysInTransaction(db, {
        userId: input.userId,
        source: "admin",
        days: Number(promo.grant_days),
        idempotencyKey: `promo-code:${promo.id}:${input.userId}`,
        milestoneKey: `promo-code:${promo.id}`,
        auditMetadata: {
          promoCodeId: promo.id,
          label: promo.label
        }
      }, config);

      if (!grant) {
        throw new ApiError(409, "VALIDATION_ERROR", "cruush+ code could not be applied.");
      }

      result = {
        claimed: true,
        label: promo.label,
        activeUntil: null,
        grant
      };
    } else {
      const activeUntil = asDate(promo.active_until);

      if (!activeUntil || activeUntil.getTime() <= Date.now()) {
        throw new ApiError(404, "NOT_FOUND", "cruush+ code is invalid or expired.");
      }

      result = await grantPromotionalAccessUntilInTransaction(db, {
        userId: input.userId,
        activeUntil,
        days: Math.max(1, Math.ceil((activeUntil.getTime() - Date.now()) / (DAY_SECONDS * 1000))),
        idempotencyKey: `promo-code:${promo.id}:${input.userId}`,
        label: promo.label,
        auditMetadata: {
          promoCodeId: promo.id
        }
      });
    }

    await db.query(
      `insert into cruush_plus_promo_code_redemptions (
         promo_code_id,
         user_id,
         grant_id
       )
       values ($1, $2, $3)
       on conflict (promo_code_id, user_id) do nothing`,
      [promo.id, input.userId, result.grant?.id ?? null]
    );

    if (result.grant) {
      notificationDedupeKey = `reward:promo-code:${promo.id}:${input.userId}`;
    }

    return {
      ...result,
      activeUntil: result.activeUntil ?? asDate(promo.active_until)?.toISOString() ?? null
    };
  });

  if (notificationDedupeKey) {
    await sendPushForPersistedNotification(app, {
      userId: input.userId,
      dedupeKey: notificationDedupeKey
    });
  }

  return result;
}

async function grantActivityMilestones(
  db: DbClient,
  input: { userId: string; streak: number; activityDate: string; timezone: string },
  config: RewardConfig
) {
  const grants: RewardGrantResult[] = [];

  if (input.streak % config.recurringStreakDays === 0) {
    const grant = await grantPromotionalDaysInTransaction(db, {
      userId: input.userId,
      source: "activity_recurring",
      days: config.recurringStreakRewardDays,
      idempotencyKey: `activity:recurring:${input.userId}:${input.streak}`,
      milestoneKey: `streak:${input.streak}`,
      auditMetadata: {
        streak: input.streak,
        activityDate: input.activityDate,
        timezone: input.timezone
      }
    }, config);

    if (grant) {
      grants.push(grant);
    }
  }

  return grants;
}

export async function recordMeaningfulActivity(
  app: RewardServiceApp,
  input: {
    userId: string;
    activityType: RewardActivityType;
    sourceEventId?: string;
    occurredAt?: Date;
    metadata?: Record<string, unknown>;
  }
) {
  const config = await loadRewardConfig(app.db);

  if (!config.eligibleActivityTypes.includes(input.activityType)) {
    return { credited: false, grants: [] as RewardGrantResult[] };
  }

  const result = await runTransaction(app.db, async (db) => {
    const user = await db.query<{ timezone: string | null }>(
      "select timezone from app_users where id = $1 limit 1",
      [input.userId]
    );
    const timezone = normalizeTimeZone(user.rows[0]?.timezone);
    const activityDate = calendarDateInTimeZone(input.occurredAt ?? new Date(), timezone);
    const credit = await db.query<{ id: string }>(
      `insert into daily_activity_credits (
         user_id, activity_date, timezone, activity_type, source_event_id, metadata
       )
       values ($1, $2::date, $3, $4, $5, $6::jsonb)
       on conflict (user_id, activity_date) do nothing
       returning id::text`,
      [
        input.userId,
        activityDate,
        timezone,
        input.activityType,
        input.sourceEventId ?? null,
        JSON.stringify(input.metadata ?? {})
      ]
    );

    if (!credit.rows[0]) {
      return { credited: false, activityDate, timezone, grants: [] as RewardGrantResult[] };
    }

    const stateResult = await db.query<ActivityStreakRow>(
      `select current_streak, longest_streak, last_activity_date
       from user_activity_streaks
       where user_id = $1
       for update`,
      [input.userId]
    );
    const state = stateResult.rows[0];
    const previousDate = state?.last_activity_date
      ? calendarDateInTimeZone(new Date(state.last_activity_date), "UTC")
      : null;
    const currentStreak = previousDate && daysBetweenCalendarDates(previousDate, activityDate) === 1
      ? Number(state.current_streak) + 1
      : 1;
    const longestStreak = Math.max(Number(state?.longest_streak ?? 0), currentStreak);

    await db.query(
      `insert into user_activity_streaks (
         user_id, current_streak, longest_streak, last_activity_date
       )
       values ($1, $2, $3, $4::date)
       on conflict (user_id) do update
       set current_streak = excluded.current_streak,
           longest_streak = excluded.longest_streak,
           last_activity_date = excluded.last_activity_date,
           updated_at = now()`,
      [input.userId, currentStreak, longestStreak, activityDate]
    );
    const grants = await grantActivityMilestones(db, {
      userId: input.userId,
      streak: currentStreak,
      activityDate,
      timezone
    }, config);

    return {
      credited: true,
      activityDate,
      timezone,
      currentStreak,
      grants
    };
  });

  if (result.credited && result.grants.length > 0) {
    await sendPushForPersistedNotification(app, {
      userId: input.userId,
      dedupeKey: `reward:activity:recurring:${input.userId}:${result.currentStreak}`
    });
  }

  return result;
}

export async function recordMeaningfulActivitySafely(
  app: RewardServiceApp,
  input: Parameters<typeof recordMeaningfulActivity>[1]
) {
  if (!app.db.transaction) {
    app.log.warn(
      { userId: input.userId, activityType: input.activityType },
      "reward activity credit skipped because transactional database support is unavailable"
    );
    return { credited: false, grants: [] as RewardGrantResult[] };
  }

  try {
    return await recordMeaningfulActivity(app, input);
  } catch (error) {
    app.log.warn(
      { err: error, userId: input.userId, activityType: input.activityType },
      "reward activity credit failed without blocking domain action"
    );
    return { credited: false, grants: [] as RewardGrantResult[] };
  }
}

export async function activateBankedPromotion(
  app: Pick<FastifyInstance, "db">,
  userId: string
) {
  return runTransaction(app.db, async (db) => {
    const promotion = await ensurePromotionRow(db, userId);
    const entitlement = await getEntitlementRow(db, userId);

    if (paidAccessIsActive(entitlement) || Number(promotion.banked_seconds) <= 0) {
      return promotion;
    }

    const updated = await db.query<PromotionRow>(
      `update promotional_cruush_plus_entitlements
       set active_until = greatest(coalesce(active_until, now()), now())
           + (banked_seconds * interval '1 second'),
           banked_seconds = 0,
           updated_at = now()
       where user_id = $1
       returning active_until, banked_seconds`,
      [userId]
    );
    return updated.rows[0] ?? promotion;
  });
}

export async function bankActivePromotionForPaidSubscription(db: DbClient, userId: string) {
  const promotion = await ensurePromotionRow(db, userId);
  const seconds = remainingActiveSeconds(promotion);

  if (seconds <= 0) {
    return;
  }

  await db.query(
    `update promotional_cruush_plus_entitlements
     set active_until = null,
         banked_seconds = banked_seconds + $2::bigint,
         updated_at = now()
     where user_id = $1`,
    [userId, seconds]
  );
}

export async function reverseRewardGrant(
  app: Pick<FastifyInstance, "db">,
  input: {
    grantId: string;
    reason: string;
    actorUserId?: string;
    metadata?: Record<string, unknown>;
  }
) {
  return runTransaction(app.db, async (db) => {
    const result = await db.query<RewardGrantRow>(
      `select reward.id::text, reward.user_id::text, reward.source, reward.days,
         reward.milestone_key, reward.referral_id::text, reward.audit_metadata,
         reward.created_at, reversal.created_at as reversed_at
       from reward_grants reward
       left join reward_grant_reversals reversal on reversal.grant_id = reward.id
       where reward.id = $1
       for update of reward`,
      [input.grantId]
    );
    const grant = result.rows[0];

    if (!grant) {
      throw new ApiError(404, "NOT_FOUND", "Reward grant not found.");
    }

    if (grant.reversed_at) {
      return { reversed: false, alreadyReversed: true };
    }

    await db.query(
      `insert into reward_grant_reversals (
         grant_id, user_id, days, reason, audit_metadata
       )
       values ($1, $2, $3, $4, $5::jsonb)`,
      [
        grant.id,
        grant.user_id,
        grant.days,
        input.reason,
        JSON.stringify({
          actorUserId: input.actorUserId ?? null,
          ...input.metadata
        })
      ]
    );
    const promotion = await ensurePromotionRow(db, grant.user_id);
    const removalSeconds = grant.days * DAY_SECONDS;
    const bankedSeconds = Number(promotion.banked_seconds);
    const removeFromBank = Math.min(bankedSeconds, removalSeconds);
    const removeFromActive = removalSeconds - removeFromBank;

    await db.query(
      `update promotional_cruush_plus_entitlements
       set banked_seconds = greatest(0, banked_seconds - $2::bigint),
           active_until = case
             when $3::bigint <= 0 then active_until
             when active_until is null or active_until <= now() then active_until
             else greatest(now(), active_until - ($3::bigint * interval '1 second'))
           end,
           updated_at = now()
       where user_id = $1`,
      [grant.user_id, removeFromBank, removeFromActive]
    );

    if (grant.referral_id) {
      await db.query(
        `update referrals
         set status = 'reversed', reversed_at = now(), updated_at = now()
         where id = $1 and status = 'rewarded'`,
        [grant.referral_id]
      );
    }

    return { reversed: true, alreadyReversed: false };
  });
}

function publicGrant(row: RewardGrantRow) {
  let metadata: Record<string, unknown> = {};
  if (typeof row.audit_metadata === "string") {
    try {
      metadata = JSON.parse(row.audit_metadata) as Record<string, unknown>;
    } catch {
      metadata = {};
    }
  } else if (row.audit_metadata) {
    metadata = row.audit_metadata;
  }

  return {
    id: row.id,
    source: row.source,
    days: row.days,
    status: row.reversed_at ? "reversed" as const : "active" as const,
    createdAt: new Date(row.created_at).toISOString(),
    sideQuestKey: typeof metadata.sideQuest === "string" ? metadata.sideQuest : null
  };
}

export async function getOwnedRewardGrant(
  app: Pick<FastifyInstance, "db">,
  userId: string,
  grantId: string
) {
  // Notification replay must not depend on the paginated recent history or
  // activate, extend, or otherwise mutate the member's entitlement.
  const result = await app.db.query<RewardGrantRow>(
    `select reward.id::text, reward.user_id::text, reward.source, reward.days,
       reward.milestone_key, reward.referral_id::text, reward.audit_metadata,
       reward.created_at, reversal.created_at as reversed_at
     from reward_grants reward
     left join reward_grant_reversals reversal on reversal.grant_id = reward.id
     where reward.user_id = $1 and reward.id = $2
     limit 1`,
    [userId, grantId]
  );
  const grant = result.rows[0];
  if (!grant) throw new ApiError(404, "NOT_FOUND", "Reward not found.");
  return publicGrant(grant);
}

export async function getRewardSummary(
  app: Pick<FastifyInstance, "db" | "config">,
  userId: string
) {
  const config = await loadRewardConfig(app.db);
  const promotion = await activateBankedPromotion(app, userId);
  const [userResult, streakResult, referralsResult, grantsResult, entitlement] = await Promise.all([
    app.db.query<{ timezone: string | null }>(
      "select timezone from app_users where id = $1 limit 1",
      [userId]
    ),
    app.db.query<ActivityStreakRow>(
      `select current_streak, longest_streak, last_activity_date
       from user_activity_streaks where user_id = $1`,
      [userId]
    ),
    app.db.query<{ pending: number; qualified: number }>(
      `select
         count(*) filter (
           where referral.status in ('pending', 'qualified')
             and two_factor.enabled_at is not null
         )::int as pending,
         count(*) filter (where referral.status = 'rewarded')::int as qualified
       from referrals referral
       left join user_two_factor_auth two_factor
         on two_factor.user_id = referral.referred_user_id
       where referral.referrer_user_id = $1`,
      [userId]
    ),
    app.db.query<RewardGrantRow>(
      `select reward.id::text, reward.user_id::text, reward.source, reward.days,
         reward.milestone_key, reward.referral_id::text, reward.audit_metadata,
         reward.created_at, reversal.created_at as reversed_at
       from reward_grants reward
       left join reward_grant_reversals reversal on reversal.grant_id = reward.id
       where reward.user_id = $1
       order by reward.created_at desc
       limit 20`,
      [userId]
    ),
    getEntitlementRow(app.db, userId)
  ]);
  const timezone = normalizeTimeZone(userResult.rows[0]?.timezone);
  const today = calendarDateInTimeZone(new Date(), timezone);
  const streak = streakResult.rows[0];
  const lastActivityDate = streak?.last_activity_date
    ? calendarDateInTimeZone(new Date(streak.last_activity_date), "UTC")
    : null;
  const currentStreak = lastActivityDate && daysBetweenCalendarDates(lastActivityDate, today) > 1
    ? 0
    : Number(streak?.current_streak ?? 0);
  const activeUntil = asDate(promotion.active_until);
  const promotionalActive = Boolean(activeUntil && activeUntil > new Date());
  const recurringRemainder = currentStreak % config.recurringStreakDays;
  const nextRewardInDays = recurringRemainder === 0
    ? config.recurringStreakDays
    : config.recurringStreakDays - recurringRemainder;
  const nextRewardAtDays = currentStreak + nextRewardInDays;

  return {
    streak: {
      current: currentStreak,
      longest: Number(streak?.longest_streak ?? 0),
      todayQualified: lastActivityDate === today,
      nextRecurringInDays: nextRewardInDays,
      // Keep the legacy response fields for older clients; both now describe
      // the same seven-day boundary.
      nextLongBonusInDays: nextRewardInDays,
      nextLoginBonusAtDays: nextRewardAtDays
    },
    promotionalAccess: {
      active: promotionalActive,
      activeUntil: activeUntil?.toISOString() ?? null,
      bankedDays: Number((Number(promotion.banked_seconds) / DAY_SECONDS).toFixed(2)),
      effectiveCruushPlus: paidAccessIsActive(entitlement) || promotionalActive
    },
    referrals: {
      pending: Number(referralsResult.rows[0]?.pending ?? 0),
      qualified: Number(referralsResult.rows[0]?.qualified ?? 0)
    },
    recentGrants: grantsResult.rows.map(publicGrant),
    timezone,
    rules: {
      recurringStreakDays: config.recurringStreakDays,
      recurringStreakRewardDays: config.recurringStreakRewardDays,
      longStreakDays: config.longStreakDays,
      longStreakBonusDays: config.longStreakBonusDays,
      referralRewardDays: config.referralRewardDays,
      // Older clients still read this field. Zero keeps them from showing a
      // nonexistent account-age delay while current copy omits it.
      referralMinAccountAgeDays: 0,
      maxBankedPromotionalDays: config.maxBankedPromotionalDays
    }
  };
}

export { DAY_SECONDS, DEFAULT_REWARD_CONFIG };
