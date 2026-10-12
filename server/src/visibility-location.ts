import { decryptSensitiveProfile } from "./profile-sensitive.js";
import type { FastifyInstance } from "fastify";
import { GhostLandUnavailableError } from "./ghost-land.js";
import {
  DEFAULT_GHOST_RADIUS_METERS,
  isPreciseLocationRevoked,
  locationPayloadToCoordinates,
  resolveViewerGhostCoordinate,
  type LocationPayload,
  type VisibilityPolicyPayload
} from "./location-privacy.js";
import { getEffectiveVisibilityPolicy, getRelationshipPermissions } from "./match-relationships.js";

export function hasActiveSameCrowdPrecisionGrant(
  policy: VisibilityPolicyPayload,
  viewerCrowds: string[],
  targetCrowds: string[]
) {
  const viewer = new Set(viewerCrowds.map(crowd => crowd.trim().toLowerCase()).filter(Boolean));
  const target = new Set(targetCrowds.map(crowd => crowd.trim().toLowerCase()).filter(Boolean));
  return policy.preciseToMutualCrowds.some(grant => {
    const crowd = grant.crowdId.trim().toLowerCase();
    return grant.precisionEnabled && grant.revokedAtMs == null &&
      grant.minimumTrustLevel === "MEMBER" && viewer.has(crowd) && target.has(crowd);
  });
}

export function ghostDistanceUncertaintyMiles(policy: VisibilityPolicyPayload, resolvedRadiusMeters?: number) {
  return ((resolvedRadiusMeters ?? policy.ghostRadiusMeters ?? DEFAULT_GHOST_RADIUS_METERS) * 1.02 + 1) / 1609.344;
}

export async function resolveViewerPrecisionGrant(app: FastifyInstance, input: {
  viewerUserId: string; subjectUserId: string; viewerCrowds?: string[]; subjectCrowds?: string[];
}, policy?: VisibilityPolicyPayload) {
  if (input.viewerUserId === input.subjectUserId) return true;
  policy ??= await getEffectiveVisibilityPolicy(app, input.subjectUserId);
  if (policy.baseMode === "STEALTH") return false;
  if (policy.baseMode !== "GHOST") return true;
  const relationship = await getRelationshipPermissions(app, input.viewerUserId, input.subjectUserId);
  if (relationship.isBlocked) return false;
  if (relationship.canRevealPreciseLocation) return true;
  let viewerCrowds = input.viewerCrowds;
  let subjectCrowds = input.subjectCrowds;
  if (policy.preciseToMutualCrowds.some(grant => grant.precisionEnabled && grant.revokedAtMs == null) &&
      (viewerCrowds === undefined || subjectCrowds === undefined)) {
    const rows = await app.db.query<Parameters<typeof decryptSensitiveProfile>[1] & { id: string }>(
      `select id::text as id, profile_sensitive_ciphertext, profile_sensitive_nonce,
              profile_sensitive_auth_tag, profile_sensitive_key_version
         from profiles where id = any($1::uuid[])`,
      [[input.viewerUserId, input.subjectUserId]]
    );
    const crowds = new Map(rows.rows.map(row => [row.id, decryptSensitiveProfile(app.config, row)?.crowds ?? []]));
    viewerCrowds ??= crowds.get(input.viewerUserId) ?? [];
    subjectCrowds ??= crowds.get(input.subjectUserId) ?? [];
  }
  return hasActiveSameCrowdPrecisionGrant(policy, viewerCrowds ?? [], subjectCrowds ?? []) &&
    !await isPreciseLocationRevoked(app, {
      subjectUserId: input.subjectUserId, viewerUserId: input.viewerUserId, permissionType: "mutual_crowd"
    });
}

/** Coordinates safe for a viewer's distance decisions, with a fail-closed bound. */
export async function resolveVisibilityLocation(app: FastifyInstance, input: {
  viewerUserId: string;
  subjectUserId: string;
  location: LocationPayload;
  viewerCrowds?: string[];
  subjectCrowds?: string[];
}) {
  const precise = { coordinate: locationPayloadToCoordinates(input.location), uncertaintyMiles: 0 };
  if (input.viewerUserId === input.subjectUserId) return precise;
  const policy = await getEffectiveVisibilityPolicy(app, input.subjectUserId);
  if (policy.baseMode === "STEALTH") return null;
  if (policy.baseMode !== "GHOST") return precise;
  if (await resolveViewerPrecisionGrant(app, input, policy)) return precise;
  try {
    const ghost = await resolveViewerGhostCoordinate(app, { ...input, policy });
    return {
      coordinate: ghost.coordinate,
      // Include projection/rounding headroom. The triangle inequality ensures
      // an allowed viewer is within the original real-location distance rule.
      uncertaintyMiles: ghostDistanceUncertaintyMiles(policy, ghost.radiusMeters)
    };
  } catch (error) {
    if (error instanceof GhostLandUnavailableError) return null;
    throw error;
  }
}
