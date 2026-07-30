import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { ApiError } from "./errors.js";
import { runTransaction, type DbClient } from "./db.js";
import { checkProfileCompletion } from "./profile-completion.js";
import { loadRewardConfig } from "./reward-config.js";
import { grantPromotionalDaysInTransaction } from "./rewards-service.js";
import { severeAccessBanIdentity } from "./severe-access-bans.js";
import { insertTrustEvent, recalculateTrustProfile } from "./trust-engine.js";

const referralCodeSchema = z.string().trim().regex(/^[A-Za-z0-9_-]{16,64}$/);

export type PreparedSignupReferral = {
  code: string;
  referrerUserId: string;
  status: "pending" | "flagged";
  riskScore: number;
  reviewFlags: string[];
  ipHash: string | null;
  deviceHash: string | null;
};

type ReferralQueueRow = {
  id: string;
  referrer_user_id: string;
  referred_user_id: string;
};

function requestIpKey(request: FastifyRequest) {
  return request.ip?.trim() || "unknown";
}

export async function prepareSignupReferral(
  app: FastifyInstance,
  request: FastifyRequest,
  rawCode: string | undefined
): Promise<PreparedSignupReferral | null> {
  if (!rawCode) {
    return null;
  }

  const code = referralCodeSchema.parse(rawCode);
  await app.rateLimiter.assert({
    key: `referral-code:ip:${requestIpKey(request)}`,
    max: 20,
    windowMs: 15 * 60 * 1000,
    message: "Too many referral-code attempts. Try again later."
  });
  const identity = severeAccessBanIdentity(app.config, request);
  const result = await app.db.query<{
    user_id: string;
    recent_referrals: number;
    repeated_ip_referrals: number;
  }>(
    `select
       identity.user_id::text,
       (
         select count(*)::int from referrals referral
         where referral.referrer_user_id = identity.user_id
           and referral.created_at >= now() - interval '1 hour'
       ) as recent_referrals,
       (
         select count(*)::int from referrals referral
         where $2::text is not null
           and referral.signup_ip_hash = $2
           and referral.created_at >= now() - interval '7 days'
       ) as repeated_ip_referrals
     from referral_identities identity
     where identity.code = $1
     limit 1`,
    [code, identity.ipHash]
  );
  const row = result.rows[0];

  if (!row) {
    throw new ApiError(400, "VALIDATION_ERROR", "Referral code is invalid.");
  }

  const reviewFlags: string[] = [];

  if (Number(row.recent_referrals ?? 0) >= 20) {
    reviewFlags.push("referrer_signup_burst");
  }

  if (identity.ipHash && Number(row.repeated_ip_referrals ?? 0) >= 3) {
    reviewFlags.push("repeated_signup_network");
  }

  return {
    code,
    referrerUserId: row.user_id,
    status: reviewFlags.length > 0 ? "flagged" : "pending",
    riskScore: reviewFlags.length * 50,
    reviewFlags,
    ipHash: identity.ipHash,
    deviceHash: identity.deviceHash
  };
}

export async function getReferralInfo(
  app: Pick<FastifyInstance, "db" | "config">,
  userId: string
) {
  const identity = await app.db.query<{ code: string }>(
    `insert into referral_identities (user_id, code)
     values ($1, encode(gen_random_bytes(16), 'hex'))
     on conflict (user_id) do update set user_id = excluded.user_id
     returning code`,
    [userId]
  );
  const counts = await app.db.query<{
    pending: number;
    qualified: number;
    flagged: number;
  }>(
    `select
       count(*) filter (
         where referral.status in ('pending', 'qualified')
           and two_factor.enabled_at is not null
       )::int as pending,
       count(*) filter (where status = 'rewarded')::int as qualified,
       count(*) filter (
         where referral.status = 'flagged'
           and two_factor.enabled_at is not null
       )::int as flagged
     from referrals referral
     left join user_two_factor_auth two_factor
       on two_factor.user_id = referral.referred_user_id
     where referral.referrer_user_id = $1`,
    [userId]
  );
  const code = identity.rows[0]?.code;

  if (!code) {
    throw new ApiError(500, "INTERNAL_ERROR", "Unable to create referral link.");
  }

  const link = new URL(app.config.APP_URL);
  link.searchParams.set("ref", code);

  return {
    code,
    link: link.toString(),
    pendingCount: Number(counts.rows[0]?.pending ?? 0),
    qualifiedCount: Number(counts.rows[0]?.qualified ?? 0),
    underReviewCount: Number(counts.rows[0]?.flagged ?? 0)
  };
}

async function addReferralTrust(
  db: DbClient,
  referrerUserId: string,
  referralId: string,
  points: number,
  cap: number
) {
  if (points <= 0 || cap <= 0) {
    return;
  }

  const totalResult = await db.query<{ total: number | string | null }>(
    `select coalesce(sum(value), 0)::int as total
     from trust_events
     where user_id = $1
       and event_type = 'qualified_referral'`,
    [referrerUserId]
  );
  const total = Number(totalResult.rows[0]?.total ?? 0);

  if (total + points > cap) {
    return;
  }

  await insertTrustEvent(db, {
    userId: referrerUserId,
    eventType: "qualified_referral",
    value: points,
    decays: false,
    permanent: true,
    source: "system",
    idempotencyKey: `referral-trust:${referralId}`,
    metadata: { referralId }
  });
  await recalculateTrustProfile(db, referrerUserId);
}

async function qualifyReferral(
  app: Pick<FastifyInstance, "db" | "config" | "log">,
  referral: ReferralQueueRow
) {
  const config = await loadRewardConfig(app.db);

  return runTransaction(app.db, async (db) => {
    const locked = await db.query<ReferralQueueRow & { status: string }>(
      `select id::text, referrer_user_id::text, referred_user_id::text, status
       from referrals
       where id = $1
       for update`,
      [referral.id]
    );

    if (locked.rows[0]?.status !== "pending") {
      return "skipped" as const;
    }

    const standing = await db.query<{
      account_status: string;
      old_enough: boolean;
      two_factor_enabled: boolean;
      trust_suspended: boolean;
      has_active_suspension: boolean;
    }>(
      `select
         coalesce(app_user.account_status, 'active') as account_status,
         app_user.created_at <= now() - ($2::int * interval '1 day') as old_enough,
         two_factor.enabled_at is not null as two_factor_enabled,
         coalesce(trust.is_suspended, false) as trust_suspended,
         exists (
           select 1 from suspensions suspension
           where suspension.user_id = app_user.id
             and (suspension.permanent or suspension.ends_at is null or suspension.ends_at > now())
         ) as has_active_suspension
       from app_users app_user
       left join user_two_factor_auth two_factor on two_factor.user_id = app_user.id
       left join user_trust_profiles trust on trust.user_id = app_user.id
       where app_user.id = $1
       limit 1`,
      [referral.referred_user_id, config.referralMinAccountAgeDays]
    );
    const state = standing.rows[0];

    if (!state || ["suspended", "deleted"].includes(state.account_status) ||
        state.trust_suspended || state.has_active_suspension) {
      await db.query(
        `update referrals
         set status = 'rejected', rejection_reason = 'invalid_account_standing',
             updated_at = now()
         where id = $1`,
        [referral.id]
      );
      return "rejected" as const;
    }

    if (state.account_status === "under_review") {
      await db.query(
        `update referrals
         set status = 'flagged',
             review_flags = review_flags || '["account_under_review"]'::jsonb,
             risk_score = greatest(risk_score, 50),
             updated_at = now()
         where id = $1`,
        [referral.id]
      );
      return "flagged" as const;
    }

    if (!state.old_enough || !state.two_factor_enabled) {
      return "pending" as const;
    }

    const profile = await checkProfileCompletion(db, referral.referred_user_id, config, app.config);

    if (!profile.complete) {
      return "pending" as const;
    }

    await db.query(
      `update referrals
       set status = 'qualified', qualified_at = now(), updated_at = now()
       where id = $1`,
      [referral.id]
    );
    const grant = await grantPromotionalDaysInTransaction(db, {
      userId: referral.referrer_user_id,
      source: "referral",
      days: config.referralRewardDays,
      idempotencyKey: `referral:${referral.id}`,
      referralId: referral.id,
      auditMetadata: {
        referredUserId: referral.referred_user_id,
        qualifiedBy: "scheduled_referral_qualification"
      }
    }, config);

    if (!grant) {
      return "qualified" as const;
    }

    await db.query(
      `update referrals
       set status = 'rewarded', rewarded_at = now(), updated_at = now()
       where id = $1`,
      [referral.id]
    );
    await addReferralTrust(
      db,
      referral.referrer_user_id,
      referral.id,
      config.referralTrustPoints,
      config.maxReferralTrustPoints
    );
    return "rewarded" as const;
  });
}

export async function qualifyPendingReferrals(
  app: Pick<FastifyInstance, "db" | "config" | "log">,
  options: { limit?: number } = {}
) {
  const config = await loadRewardConfig(app.db);
  const queue = await app.db.query<ReferralQueueRow>(
    `select id::text, referrer_user_id::text, referred_user_id::text
     from referrals
     where status = 'pending'
       and created_at <= now() - ($1::int * interval '1 day')
     order by created_at asc
     limit $2`,
    [config.referralMinAccountAgeDays, options.limit ?? 100]
  );
  const results = {
    scanned: queue.rows.length,
    rewarded: 0,
    pending: 0,
    rejected: 0,
    flagged: 0,
    skipped: 0,
    qualified: 0
  };

  for (const referral of queue.rows) {
    try {
      const status = await qualifyReferral(app, referral);
      results[status] += 1;
    } catch (error) {
      app.log.error({ err: error, referralId: referral.id }, "referral qualification failed");
    }
  }

  app.log.info(results, "referral qualification complete");
  return results;
}

export function startReferralQualificationScheduler(
  app: Pick<FastifyInstance, "db" | "config" | "log">,
  intervalMs = 15 * 60 * 1000
) {
  const run = () => {
    void qualifyPendingReferrals(app).catch((error) => {
      app.log.error({ err: error }, "scheduled referral qualification failed");
    });
  };
  const timer = setInterval(run, intervalMs);
  timer.unref();
  run();
  return () => clearInterval(timer);
}
