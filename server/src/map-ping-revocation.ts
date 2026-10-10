import { runTransaction, type DbClient } from "./db.js";
import type { VisibilityPolicyPayload } from "./location-privacy.js";
import type { ProfileVisibilityRules } from "./profile-sensitive.js";

export function mapVisibilityNarrowed(
  previous: VisibilityPolicyPayload,
  next: VisibilityPolicyPayload
) {
  if (next.baseMode === "STEALTH") {
    return previous.baseMode !== "STEALTH";
  }

  if (previous.baseMode === "STEALTH" || next.baseMode === "PUBLIC_PRECISE") {
    return false;
  }

  if (previous.baseMode === "PUBLIC_PRECISE") {
    return next.baseMode === "GHOST";
  }

  if (next.baseMode !== "GHOST") {
    return false;
  }

  if ((next.ghostRadiusMeters ?? 0) > (previous.ghostRadiusMeters ?? 0)) {
    return true;
  }

  if (previous.preciseToMutualCruushes && !next.preciseToMutualCruushes) {
    return true;
  }

  const trustRank = {
    MEMBER: 0,
    VERIFIED: 1,
    MUTUAL_INTERACTION: 2
  } as const;
  const nextPolicies = next.preciseToMutualCrowds.filter((policy) =>
    policy.precisionEnabled && (policy.revokedAtMs ?? null) === null
  );

  return previous.preciseToMutualCrowds
    .filter((policy) => policy.precisionEnabled && (policy.revokedAtMs ?? null) === null)
    .some((previousPolicy) => !nextPolicies.some((nextPolicy) =>
      nextPolicy.crowdId === previousPolicy.crowdId &&
      (previousPolicy.mutualityRequired || nextPolicy.mutualityRequired === false) &&
      trustRank[nextPolicy.minimumTrustLevel] <= trustRank[previousPolicy.minimumTrustLevel]
    ));
}

function normalizedSet(values: string[]) {
  return new Set(values.map((value) => value.trim().toLowerCase()).filter(Boolean));
}

function exclusionRuleNarrowed(previous: string[], next: string[]) {
  const previousValues = normalizedSet(previous);

  return [...normalizedSet(next)].some((value) => !previousValues.has(value));
}

function crowdInclusionNarrowed(previous: string[], next: string[]) {
  const previousValues = normalizedSet(previous);
  const nextValues = normalizedSet(next);

  if (previousValues.size === 0) {
    return nextValues.size > 0;
  }

  if (nextValues.size === 0) {
    return false;
  }

  return [...previousValues].some((value) => !nextValues.has(value));
}

export function profileVisibilityNarrowed(
  previous: ProfileVisibilityRules,
  next: ProfileVisibilityRules
) {
  const ageNarrowed = previous.age_range === null
    ? next.age_range !== null
    : next.age_range !== null && (
        next.age_range[0] > previous.age_range[0] ||
        next.age_range[1] < previous.age_range[1]
      );
  const distanceNarrowed = previous.distance === null
    ? next.distance !== null
    : next.distance !== null && next.distance < previous.distance;

  return ageNarrowed ||
    distanceNarrowed ||
    crowdInclusionNarrowed(previous.active_crowd_modes, next.active_crowd_modes) ||
    exclusionRuleNarrowed(previous.identities, next.identities) ||
    exclusionRuleNarrowed(previous.presentations, next.presentations) ||
    exclusionRuleNarrowed(previous.looking_for, next.looking_for) ||
    exclusionRuleNarrowed(previous.timing, next.timing) ||
    exclusionRuleNarrowed(previous.hosting, next.hosting) ||
    exclusionRuleNarrowed(previous.vibes, next.vibes) ||
    exclusionRuleNarrowed(previous.tags ?? [], next.tags ?? []) ||
    exclusionRuleNarrowed(previous.crowds, next.crowds) ||
    exclusionRuleNarrowed(previous.hobbies, next.hobbies) ||
    exclusionRuleNarrowed(previous.positions, next.positions) ||
    exclusionRuleNarrowed(previous.roles, next.roles) ||
    exclusionRuleNarrowed(previous.kinks, next.kinks) ||
    exclusionRuleNarrowed(previous.body_types, next.body_types) ||
    exclusionRuleNarrowed(previous.sexuality, next.sexuality) ||
    exclusionRuleNarrowed(previous.substance_boundaries, next.substance_boundaries);
}

export async function lockMapPingSenderInTransaction(db: DbClient, userId: string) {
  await db.query(
    `select id::text as id
     from app_users
     where id = $1
     for update`,
    [userId]
  );
}

export async function revokeActiveMapPingsInTransaction(
  db: DbClient,
  userId: string
) {
  await lockMapPingSenderInTransaction(db, userId);
  const activePings = await db.query<{ id: string }>(
    `select id::text as id
     from map_pings
     where user_id = $1
       and expires_at > clock_timestamp()
     for update`,
    [userId]
  );
  const pingIds = activePings.rows.map((row) => row.id);

  if (pingIds.length === 0) {
    return {
      pings: 0
    };
  }

  const databaseTime = await db.query<{ revoked_at: string | Date }>(
    `select clock_timestamp() as revoked_at`
  );
  const revokedAt = databaseTime.rows[0]?.revoked_at;

  if (!revokedAt) {
    throw new Error("Database did not return a Ping revocation timestamp.");
  }

  const expired = await db.query<{ id: string }>(
    `update map_pings
     set expires_at = least(expires_at, $3::timestamptz)
     where user_id = $1
       and id = any($2::uuid[])
     returning id::text as id`,
    [userId, pingIds, new Date(revokedAt).toISOString()]
  );
  return {
    pings: expired.rows.length
  };
}

export async function revokeActiveMapPings(
  db: DbClient,
  userId: string
) {
  return runTransaction(db, (transaction) =>
    revokeActiveMapPingsInTransaction(transaction, userId)
  );
}
