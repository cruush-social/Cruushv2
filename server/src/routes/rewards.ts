import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { ApiError } from "../errors.js";
import { getModeratorUser } from "../moderator-auth.js";
import { getActiveAccountUserId, getAuthenticatedUserId } from "../request-auth.js";
import { getReferralInfo } from "../referrals-service.js";
import {
  claimBetaLaunchCruushPlus,
  getBetaLaunchCruushPlusClaimStatus,
  getRewardSummary,
  normalizeTimeZone,
  redeemCruushPlusPromoCode,
  reverseRewardGrant
} from "../rewards-service.js";
import {
  completeTwoFactorSetup,
  disableTwoFactor,
  getTwoFactorStatus,
  regenerateRecoveryCodes,
  startTwoFactorSetup
} from "../two-factor.js";

const passwordPayloadSchema = z.object({
  password: z.string().min(1).max(200)
}).strict();

const tokenPayloadSchema = z.object({
  token: z.string().trim().min(6).max(64)
}).strict();

const sensitiveTwoFactorPayloadSchema = z.object({
  password: z.string().min(1).max(200),
  token: z.string().trim().min(6).max(64)
}).strict();

const timezonePayloadSchema = z.object({
  timezone: z.string().trim().min(1).max(100)
}).strict();

const promoCodePayloadSchema = z.object({
  code: z.string().trim().min(1).max(120)
}).strict();

const reversalParamsSchema = z.object({
  grantId: z.uuid()
}).strict();

const reversalPayloadSchema = z.object({
  reason: z.string().trim().min(5).max(500)
}).strict();

const adminReferralQuerySchema = z.object({
  status: z.enum(["pending", "qualified", "rewarded", "rejected", "flagged", "reversed"]).optional()
}).strict();

const adminGrantQuerySchema = z.object({
  userId: z.uuid().optional()
}).strict();

function assertValidTimeZone(value: string) {
  const normalized = normalizeTimeZone(value);

  if (normalized === "UTC" && value !== "UTC") {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: value }).format();
    } catch {
      throw new ApiError(400, "VALIDATION_ERROR", "Timezone is invalid.");
    }
  }

  return normalized;
}

async function applyTwoFactorRateLimit(app: FastifyInstance, userId: string, operation: string) {
  await app.rateLimiter.assert({
    key: `two-factor:${operation}:user:${userId}`,
    max: 5,
    windowMs: 15 * 60 * 1000,
    message: "Too many two-factor attempts. Try again later."
  });
}

export async function registerRewardRoutes(app: FastifyInstance) {
  app.get("/api/rewards/summary", async (request, reply) => {
    const userId = await getAuthenticatedUserId(request);
    const [summary, referral] = await Promise.all([
      getRewardSummary(app, userId),
      getReferralInfo(app, userId)
    ]);

    return reply.send({
      data: {
        ...summary,
        referrals: {
          ...summary.referrals,
          code: referral.code,
          link: referral.link,
          underReview: referral.underReviewCount
        }
      }
    });
  });

  app.get("/api/rewards/streak", async (request, reply) => {
    const userId = await getAuthenticatedUserId(request);
    const summary = await getRewardSummary(app, userId);
    return reply.send({ data: summary.streak });
  });

  app.get("/api/rewards/referrals", async (request, reply) => {
    const userId = await getAuthenticatedUserId(request);
    return reply.send({ data: await getReferralInfo(app, userId) });
  });

  app.get("/api/rewards/history", async (request, reply) => {
    const userId = await getAuthenticatedUserId(request);
    const summary = await getRewardSummary(app, userId);
    return reply.send({ data: summary.recentGrants });
  });

  app.put("/api/rewards/timezone", async (request, reply) => {
    const userId = await getActiveAccountUserId(request);
    const payload = timezonePayloadSchema.parse(request.body);
    const timezone = assertValidTimeZone(payload.timezone);
    await app.db.query(
      "update app_users set timezone = $2 where id = $1",
      [userId, timezone]
    );
    return reply.send({ data: { timezone } });
  });

  app.post("/api/rewards/beta-launch/claim", async (request, reply) => {
    const userId = await getActiveAccountUserId(request);
    return reply.send({
      data: await claimBetaLaunchCruushPlus(app, userId)
    });
  });

  app.get("/api/rewards/beta-launch/status", async (request, reply) => {
    const userId = await getAuthenticatedUserId(request);
    return reply.send({
      data: await getBetaLaunchCruushPlusClaimStatus(app, userId)
    });
  });

  app.post("/api/rewards/promo-codes/redeem", async (request, reply) => {
    const userId = await getActiveAccountUserId(request);
    const payload = promoCodePayloadSchema.parse(request.body);
    return reply.send({
      data: await redeemCruushPlusPromoCode(app, {
        userId,
        code: payload.code
      })
    });
  });

  app.get("/api/auth/2fa", async (request, reply) => {
    const userId = await getAuthenticatedUserId(request);
    return reply.send({ data: await getTwoFactorStatus(app, userId) });
  });

  app.post("/api/auth/2fa/setup", async (request, reply) => {
    const userId = await getActiveAccountUserId(request);
    const payload = passwordPayloadSchema.parse(request.body);
    await applyTwoFactorRateLimit(app, userId, "setup");
    return reply.send({
      data: await startTwoFactorSetup(app, userId, payload.password)
    });
  });

  app.post("/api/auth/2fa/setup/complete", async (request, reply) => {
    const userId = await getActiveAccountUserId(request);
    const payload = tokenPayloadSchema.parse(request.body);
    await applyTwoFactorRateLimit(app, userId, "complete");
    return reply.send({
      data: await completeTwoFactorSetup(app, userId, payload.token)
    });
  });

  app.post("/api/auth/2fa/recovery-codes", async (request, reply) => {
    const userId = await getActiveAccountUserId(request);
    const payload = sensitiveTwoFactorPayloadSchema.parse(request.body);
    await applyTwoFactorRateLimit(app, userId, "recovery-regenerate");
    return reply.send({
      data: await regenerateRecoveryCodes(app, userId, payload)
    });
  });

  app.delete("/api/auth/2fa", async (request, reply) => {
    const userId = await getActiveAccountUserId(request);
    const payload = sensitiveTwoFactorPayloadSchema.parse(request.body);
    await applyTwoFactorRateLimit(app, userId, "disable");
    return reply.send({
      data: await disableTwoFactor(app, userId, payload)
    });
  });

  app.post("/api/admin/rewards/grants/:grantId/reverse", async (request, reply) => {
    const moderator = await getModeratorUser(request);
    const { grantId } = reversalParamsSchema.parse(request.params);
    const payload = reversalPayloadSchema.parse(request.body);
    return reply.send({
      data: await reverseRewardGrant(app, {
        grantId,
        reason: payload.reason,
        actorUserId: moderator.userId
      })
    });
  });

  app.get("/api/admin/rewards/referrals", async (request, reply) => {
    await getModeratorUser(request);
    const query = adminReferralQuerySchema.parse(request.query);
    const result = await app.db.query(
      `select
         id::text,
         referrer_user_id::text,
         referred_user_id::text,
         status,
         rejection_reason,
         risk_score,
         review_flags,
         qualified_at,
         rewarded_at,
         reversed_at,
         created_at,
         updated_at
       from referrals
       where ($1::text is null or status = $1)
       order by created_at desc
       limit 200`,
      [query.status ?? null]
    );
    return reply.send({ data: result.rows });
  });

  app.get("/api/admin/rewards/grants", async (request, reply) => {
    await getModeratorUser(request);
    const query = adminGrantQuerySchema.parse(request.query);
    const result = await app.db.query(
      `select
         reward.id::text,
         reward.user_id::text,
         reward.source,
         reward.days,
         reward.idempotency_key,
         reward.milestone_key,
         reward.referral_id::text,
         reward.audit_metadata,
         reward.created_at,
         reversal.id::text as reversal_id,
         reversal.reason as reversal_reason,
         reversal.audit_metadata as reversal_metadata,
         reversal.created_at as reversed_at
       from reward_grants reward
       left join reward_grant_reversals reversal on reversal.grant_id = reward.id
       where ($1::uuid is null or reward.user_id = $1)
       order by reward.created_at desc
       limit 200`,
      [query.userId ?? null]
    );
    return reply.send({ data: result.rows });
  });
}
