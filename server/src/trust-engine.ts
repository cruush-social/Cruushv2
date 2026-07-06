import { randomUUID } from "node:crypto";
import type { DbClient } from "./db.js";
import type { ModerationContentType, ModerationSurface, PolicyDecision } from "./moderation-types.js";

export type TrustEventInput = {
  userId: string;
  eventType: string;
  value: number;
  decays: boolean;
  permanent: boolean;
  source: "ai" | "automod" | "system";
  metadata?: Record<string, unknown>;
};

export type TrustEventForCalculation = {
  value: number;
  decays?: boolean;
  permanent?: boolean;
  createdAt?: Date;
};

export type PolicyApplicationContext = {
  contentReviewId?: string;
  surface?: ModerationSurface;
  contentType?: ModerationContentType;
  source?: "ai" | "automod" | "system";
  metadata?: Record<string, unknown>;
};

const TRUST_NEUTRAL_SCORE = 50;

export function clampTrustScore(score: number) {
  return Math.max(0, Math.min(100, Math.round(score)));
}

export function trustLevelForScore(score: number) {
  if (score <= 20) {
    return "restricted";
  }

  if (score <= 49) {
    return "new";
  }

  if (score <= 74) {
    return "established";
  }

  if (score <= 89) {
    return "trusted";
  }

  return "verified_trusted";
}

export function reportWeightForScore(score: number) {
  return Math.max(5, Math.min(100, score));
}

export function calculateTrustScore(events: TrustEventForCalculation[], maxFutureTrust?: number | null) {
  const eventTotal = events.reduce((total, event) => total + event.value, 0);
  const uncapped = clampTrustScore(TRUST_NEUTRAL_SCORE + eventTotal);

  return maxFutureTrust == null ? uncapped : Math.min(uncapped, maxFutureTrust);
}

async function ensureTrustProfile(db: DbClient, userId: string) {
  await db.query(
    `insert into user_trust_profiles (user_id)
     values ($1)
     on conflict (user_id) do nothing`,
    [userId]
  );
}

export async function insertTrustEvent(db: DbClient, input: TrustEventInput) {
  await ensureTrustProfile(db, input.userId);
  await db.query(
    `insert into trust_events (
       id,
       user_id,
       event_type,
       value,
       decays,
       permanent,
       source,
       metadata
     )
     values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)`,
    [
      randomUUID(),
      input.userId,
      input.eventType,
      input.value,
      input.decays,
      input.permanent,
      input.source,
      JSON.stringify(input.metadata ?? {})
    ]
  );
}

export async function recalculateTrustProfile(db: DbClient, userId: string) {
  await ensureTrustProfile(db, userId);
  await db.query(
    `with event_score as (
       select coalesce(sum(value), 0)::integer as value
       from trust_events
       where user_id = $1
     ),
     calculated as (
       select
         least(
           100,
           greatest(
             0,
             50 + (select value from event_score)
           )
         )::integer as uncapped_score
     )
     update user_trust_profiles profile
     set trust_score = least(
           (select uncapped_score from calculated),
           coalesce(profile.max_future_trust, 100)
         ),
         trust_level = case
           when least((select uncapped_score from calculated), coalesce(profile.max_future_trust, 100)) <= 20 then 'restricted'
           when least((select uncapped_score from calculated), coalesce(profile.max_future_trust, 100)) <= 49 then 'new'
           when least((select uncapped_score from calculated), coalesce(profile.max_future_trust, 100)) <= 74 then 'established'
           when least((select uncapped_score from calculated), coalesce(profile.max_future_trust, 100)) <= 89 then 'trusted'
           else 'verified_trusted'
         end,
         report_weight = greatest(
           5,
           least(100, least((select uncapped_score from calculated), coalesce(profile.max_future_trust, 100)))
         ),
         updated_at = now()
     where profile.user_id = $1`,
    [userId]
  );
}

async function applyTrustCap(db: DbClient, userId: string, trustCap: number) {
  await ensureTrustProfile(db, userId);
  await db.query(
    `update user_trust_profiles
     set max_future_trust = least(coalesce(max_future_trust, 100), $2),
         updated_at = now()
     where user_id = $1`,
    [userId, trustCap]
  );
}

async function insertEvidenceEvent(
  db: DbClient,
  userId: string,
  decision: PolicyDecision,
  context: PolicyApplicationContext
) {
  await db.query(
    `insert into evidence_events (
       id,
       target_user_id,
       source_type,
       category,
       evidence_value,
       confidence,
       expires_at,
       metadata
     )
     values ($1, $2, $3, $4, $5, $6, now() + interval '90 days', $7::jsonb)`,
    [
      randomUUID(),
      userId,
      context.source ?? "ai",
      decision.category ?? decision.reason_code,
      decision.evidence_value,
      decision.confidence,
      JSON.stringify({
        contentReviewId: context.contentReviewId ?? null,
        surface: context.surface ?? null,
        contentType: context.contentType ?? null,
        reasonCode: decision.reason_code,
        ...context.metadata
      })
    ]
  );
}

async function insertModerationHistory(
  db: DbClient,
  userId: string,
  decision: PolicyDecision,
  context: PolicyApplicationContext
) {
  await db.query(
    `insert into moderation_history (
       id,
       user_id,
       content_review_id,
       category,
       action,
       trust_impact,
       trust_cap_applied,
       source,
       reason_code
     )
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      randomUUID(),
      userId,
      context.contentReviewId ?? null,
      decision.category ?? decision.reason_code,
      decision.enforcement_action?.type ?? decision.decision,
      decision.set_trust_to_zero ? -100 : decision.trust_impact,
      decision.trust_cap ?? null,
      context.source ?? "ai",
      decision.reason_code
    ]
  );
}

async function applySuspension(db: DbClient, userId: string, reasonCode: string, permanent: boolean, durationDays?: number) {
  await ensureTrustProfile(db, userId);
  await db.query(
    `insert into suspensions (
       id,
       user_id,
       reason_code,
       ends_at,
       permanent
     )
     values (
       $1,
       $2,
       $3,
       case when $4::integer is null then null else now() + ($4::integer * interval '1 day') end,
       $5
     )`,
    [randomUUID(), userId, reasonCode, durationDays ?? null, permanent]
  );
  await db.query(
    `update user_trust_profiles
     set is_suspended = true,
         updated_at = now()
     where user_id = $1`,
    [userId]
  );
}

async function applyFeatureRestriction(
  db: DbClient,
  userId: string,
  restriction: NonNullable<PolicyDecision["feature_restrictions"]>[number]
) {
  await ensureTrustProfile(db, userId);
  await db.query(
    `insert into feature_restrictions (
       id,
       user_id,
       feature,
       scope,
       reason_code,
       ends_at
     )
     values (
       $1,
       $2,
       $3,
       $4,
       $5,
       case when $6::integer is null then null else now() + ($6::integer * interval '1 day') end
     )`,
    [
      randomUUID(),
      userId,
      restriction.feature,
      restriction.scope ?? "global",
      restriction.reasonCode,
      restriction.durationDays ?? null
    ]
  );
}

export async function applyPolicyDecision(
  db: DbClient,
  userId: string,
  decision: PolicyDecision,
  context: PolicyApplicationContext = {}
) {
  if (decision.create_evidence_event) {
    await insertEvidenceEvent(db, userId, decision, context);
  }

  if (decision.moderation_history_required) {
    await insertModerationHistory(db, userId, decision, context);
  }

  if (decision.trust_impact !== 0 || decision.set_trust_to_zero) {
    await insertTrustEvent(db, {
      userId,
      eventType: decision.reason_code,
      value: decision.set_trust_to_zero ? -100 : decision.trust_impact,
      decays: decision.penalty_decays,
      permanent: !decision.penalty_decays,
      source: context.source ?? "ai",
      metadata: {
        contentReviewId: context.contentReviewId ?? null,
        surface: context.surface ?? null,
        contentType: context.contentType ?? null,
        ...context.metadata
      }
    });
  }

  if (typeof decision.trust_cap === "number") {
    await applyTrustCap(db, userId, decision.trust_cap);
  }

  for (const featureRestriction of decision.feature_restrictions ?? []) {
    await applyFeatureRestriction(db, userId, featureRestriction);
  }

  if (decision.enforcement_action?.type === "suspend") {
    await applySuspension(
      db,
      userId,
      decision.enforcement_action.reasonCode,
      decision.enforcement_action.permanent ?? false,
      decision.enforcement_action.durationDays
    );
  } else if (decision.enforcement_action?.type === "restrict_feature") {
    await applyFeatureRestriction(db, userId, decision.enforcement_action.restriction);
  }

  if (
    decision.trust_impact !== 0 ||
    decision.set_trust_to_zero ||
    typeof decision.trust_cap === "number"
  ) {
    await recalculateTrustProfile(db, userId);
  }
}
