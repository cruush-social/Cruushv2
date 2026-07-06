import type { FastifyInstance } from "fastify";
import {
  buildEncryptedRelationshipPayload,
  findEncryptedRelationshipRecord,
  getOrderedRelationshipUserIds,
  getProfileViewDedupeBucket,
  hasActiveEncryptedRelationshipToken,
  issueEncryptedRelationshipToken,
  revokeEncryptedRelationshipTokens,
  updateEncryptedRelationshipRecordStatus,
  upsertEncryptedRelationshipRecord
} from "./encrypted-relationships.js";
import {
  DEFAULT_GHOST_RADIUS_METERS,
  loadVisibilityPolicy,
  publicPrivacySettings,
  saveVisibilityPolicy,
  isPreciseLocationRevoked,
  type CrowdPrecisionPolicy,
  type VisibilityBaseMode
} from "./location-privacy.js";

export type PreciseLocationVisibility = "none" | "mutual_cruushes";

export type PrivacySettings = {
  baseMode: VisibilityBaseMode;
  ghostModeEnabled: boolean;
  ghostRadiusMeters: number;
  ghostRadiusLabel: string;
  preciseToMutualCruushes: boolean;
  preciseToMutualCrowds: CrowdPrecisionPolicy[];
  preciseLocationVisibility: PreciseLocationVisibility;
  updatedAtMs: number;
};

export type CruushEntitlement = {
  cruushPlus: boolean;
  expiresAt: string | null;
};

export type RelationshipPermissions = {
  matchId: string | null;
  isMutualCruush: boolean;
  hasOutgoingCruush: boolean;
  canMessage: boolean;
  canRevealMutualProtectedFields: boolean;
  canRevealPreciseLocation: boolean;
  shouldLogProfileView: boolean;
  viewerGhostMode: boolean;
  targetGhostMode: boolean;
  targetPreciseLocationVisibility: PreciseLocationVisibility;
};

type PrivacySettingsRow = {
  ghost_mode_enabled: boolean | null;
  precise_location_visibility: PreciseLocationVisibility | null;
};

type EntitlementRow = {
  cruush_plus_enabled: boolean | null;
  cruush_plus_expires_at: string | Date | null;
};

export const MATCH_PERMISSION_PURPOSE = "permissions";
const MATCH_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

function isSchemaCompatibilityError(error: unknown) {
  const code = typeof error === "object" && error !== null && "code" in error
    ? String((error as { code?: string }).code)
    : "";

  if (["42703", "42P01", "42883", "22P02"].includes(code)) {
    return true;
  }

  const message = error instanceof Error ? error.message.toLowerCase() : "";
  return (
    message.includes("column") ||
    message.includes("relation") ||
    message.includes("operator does not exist") ||
    message.includes("does not exist")
  );
}

async function safeRows<T>(
  app: FastifyInstance,
  sql: string,
  values: unknown[] = []
): Promise<T[]> {
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

export function getOrderedMatchUserIds(firstUserId: string, secondUserId: string) {
  return getOrderedRelationshipUserIds(firstUserId, secondUserId);
}

export async function getPrivacySettings(app: FastifyInstance, userId: string): Promise<PrivacySettings> {
  try {
    return publicPrivacySettings(await loadVisibilityPolicy(app, userId));
  } catch (error) {
    if (!isSchemaCompatibilityError(error)) {
      throw error;
    }
  }

  const row = (await safeRows<PrivacySettingsRow>(
    app,
    `select ghost_mode_enabled, precise_location_visibility
     from user_privacy_settings
     where user_id = $1
     limit 1`,
    [userId]
  ))[0];
  const preciseToMutualCruushes = row?.precise_location_visibility === "mutual_cruushes";
  const ghostModeEnabled = row?.ghost_mode_enabled === true;

  return {
    baseMode: ghostModeEnabled ? "GHOST" : "PUBLIC_PRECISE",
    ghostModeEnabled,
    ghostRadiusMeters: DEFAULT_GHOST_RADIUS_METERS,
    ghostRadiusLabel: "1 mi",
    preciseToMutualCruushes,
    preciseToMutualCrowds: [],
    preciseLocationVisibility: preciseToMutualCruushes ? "mutual_cruushes" : "none",
    updatedAtMs: Date.now()
  };
}

export async function savePrivacySettings(
  app: FastifyInstance,
  userId: string,
  settings: Partial<PrivacySettings> & {
    ghostModeEnabled?: boolean;
    preciseLocationVisibility?: PreciseLocationVisibility;
  }
) {
  try {
    return publicPrivacySettings(await saveVisibilityPolicy(app, userId, {
      baseMode: settings.baseMode ?? (settings.ghostModeEnabled ? "GHOST" : "PUBLIC_PRECISE"),
      ghostModeEnabled: settings.ghostModeEnabled,
      ghostRadiusMeters: settings.ghostRadiusMeters,
      preciseToMutualCruushes: settings.preciseToMutualCruushes ?? settings.preciseLocationVisibility === "mutual_cruushes",
      preciseToMutualCrowds: settings.preciseToMutualCrowds ?? [],
      preciseLocationVisibility: settings.preciseLocationVisibility
    }));
  } catch (error) {
    if (!isSchemaCompatibilityError(error)) {
      throw error;
    }
  }

  const row = (await safeRows<PrivacySettingsRow>(
    app,
    `insert into user_privacy_settings (
       user_id,
       ghost_mode_enabled,
       precise_location_visibility
     )
     values ($1, $2, $3)
     on conflict (user_id) do update
     set ghost_mode_enabled = excluded.ghost_mode_enabled,
         precise_location_visibility = excluded.precise_location_visibility,
         updated_at = now()
     returning ghost_mode_enabled, precise_location_visibility`,
    [
      userId,
      settings.ghostModeEnabled === true,
      settings.preciseLocationVisibility === "mutual_cruushes" ? "mutual_cruushes" : "none"
    ]
  ))[0];
  const preciseToMutualCruushes = row?.precise_location_visibility === "mutual_cruushes";
  const ghostModeEnabled = row?.ghost_mode_enabled === true;

  return {
    baseMode: ghostModeEnabled ? "GHOST" as const : "PUBLIC_PRECISE" as const,
    ghostModeEnabled,
    ghostRadiusMeters: DEFAULT_GHOST_RADIUS_METERS,
    ghostRadiusLabel: "1 mi",
    preciseToMutualCruushes,
    preciseToMutualCrowds: [],
    preciseLocationVisibility: preciseToMutualCruushes ? "mutual_cruushes" as const : "none" as const,
    updatedAtMs: Date.now()
  };
}

export async function getCruushEntitlement(app: FastifyInstance, userId: string): Promise<CruushEntitlement> {
  const row = (await safeRows<EntitlementRow>(
    app,
    `select cruush_plus_enabled, cruush_plus_expires_at
     from user_entitlements
     where user_id = $1
     limit 1`,
    [userId]
  ))[0];
  const expiresAt = toIsoDate(row?.cruush_plus_expires_at);
  const isExpired = expiresAt ? new Date(expiresAt).getTime() <= Date.now() : false;

  return {
    cruushPlus: row?.cruush_plus_enabled === true && !isExpired,
    expiresAt
  };
}

export async function setCruushEntitlement(
  app: FastifyInstance,
  userId: string,
  cruushPlusEnabled: boolean
): Promise<CruushEntitlement> {
  const row = (await safeRows<EntitlementRow>(
    app,
    `insert into user_entitlements (
       user_id,
       cruush_plus_enabled,
       cruush_plus_expires_at
     )
     values ($1, $2, null)
     on conflict (user_id) do update
     set cruush_plus_enabled = excluded.cruush_plus_enabled,
         cruush_plus_expires_at = null,
         updated_at = now()
     returning cruush_plus_enabled, cruush_plus_expires_at`,
    [userId, cruushPlusEnabled]
  ))[0];

  const expiresAt = toIsoDate(row?.cruush_plus_expires_at);
  const isExpired = expiresAt ? new Date(expiresAt).getTime() <= Date.now() : false;

  return {
    cruushPlus: row?.cruush_plus_enabled === true && !isExpired,
    expiresAt
  };
}

export async function ensureMutualCruushMatch(app: FastifyInstance, firstUserId: string, secondUserId: string) {
  const [userOneId, userTwoId] = getOrderedMatchUserIds(firstUserId, secondUserId);
  const match = await upsertEncryptedRelationshipRecord(app, buildEncryptedRelationshipPayload({
    type: "mutual_cruush",
    actorUserId: userOneId,
    targetUserId: userTwoId,
    createdAt: new Date()
  }));

  if (!match) {
    return null;
  }

  const expiresAt = new Date(Date.now() + MATCH_TOKEN_TTL_MS);
  await issueEncryptedRelationshipToken(app, {
    relationshipRecordId: match.id,
    userOneId,
    userTwoId,
    purpose: MATCH_PERMISSION_PURPOSE,
    expiresAt
  });

  return {
    id: match.id,
    userOneId,
    userTwoId,
    expiresAt: expiresAt.toISOString()
  };
}

export async function revokeMutualCruushMatch(app: FastifyInstance, userId: string, otherUserId: string) {
  const [userOneId, userTwoId] = getOrderedMatchUserIds(userId, otherUserId);
  const activeMatch = await findEncryptedRelationshipRecord(app, {
    type: "mutual_cruush",
    actorUserId: userOneId,
    targetUserId: userTwoId
  });

  if (activeMatch) {
    await updateEncryptedRelationshipRecordStatus(app, activeMatch, "removed", {
      revokedAt: new Date()
    });
    await revokeEncryptedRelationshipTokens(app, activeMatch.id);
  }

  await upsertEncryptedRelationshipRecord(app, buildEncryptedRelationshipPayload({
    type: "removed_cruush",
    status: "removed",
    actorUserId: userId,
    targetUserId: otherUserId,
    createdAt: new Date(),
    revokedAt: new Date()
  }));
}

export async function getRelationshipPermissions(
  app: FastifyInstance,
  viewerUserId: string,
  targetUserId: string
): Promise<RelationshipPermissions> {
  if (viewerUserId === targetUserId) {
    const viewerSettings = await getPrivacySettings(app, viewerUserId);

    return {
      matchId: null,
      isMutualCruush: true,
      hasOutgoingCruush: true,
      canMessage: true,
      canRevealMutualProtectedFields: true,
      canRevealPreciseLocation: true,
      shouldLogProfileView: false,
      viewerGhostMode: viewerSettings.ghostModeEnabled,
      targetGhostMode: viewerSettings.ghostModeEnabled,
      targetPreciseLocationVisibility: viewerSettings.preciseLocationVisibility
    };
  }

  const [userOneId, userTwoId] = getOrderedMatchUserIds(viewerUserId, targetUserId);
  const [match, viewerSettings, targetSettings] = await Promise.all([
    findEncryptedRelationshipRecord(app, {
      type: "mutual_cruush",
      actorUserId: userOneId,
      targetUserId: userTwoId
    }),
    getPrivacySettings(app, viewerUserId),
    getPrivacySettings(app, targetUserId)
  ]);
  const isMutualCruush = Boolean(match);
  const outgoingCruush = isMutualCruush
    ? match
    : await findEncryptedRelationshipRecord(app, {
        type: "cruush",
        actorUserId: viewerUserId,
        targetUserId
      });
  const hasOutgoingCruush = Boolean(outgoingCruush) || isMutualCruush;
  const hasActiveMatchToken = match
    ? await hasActiveEncryptedRelationshipToken(app, {
        relationshipRecordId: match.id,
        userOneId,
        userTwoId,
        purpose: MATCH_PERMISSION_PURPOSE
      })
    : false;
  const targetPreciseLocationVisibility = targetSettings.preciseLocationVisibility;
  const viewerGhostMode = viewerSettings.ghostModeEnabled;
  const targetGhostMode = targetSettings.ghostModeEnabled;
  const preciseGrantCandidate = isMutualCruush &&
    hasActiveMatchToken &&
    targetSettings.baseMode !== "STEALTH" &&
    targetPreciseLocationVisibility === "mutual_cruushes";
  const isRevoked = preciseGrantCandidate
    ? await isPreciseLocationRevoked(app, {
        subjectUserId: targetUserId,
        viewerUserId,
        permissionType: "mutual_cruush"
      }).catch((error) => {
        if (isSchemaCompatibilityError(error)) {
          return false;
        }

        throw error;
      })
    : false;
  const canRevealPreciseLocation = preciseGrantCandidate && !isRevoked;

  return {
    matchId: match?.id ?? null,
    isMutualCruush,
    hasOutgoingCruush,
    canMessage: isMutualCruush && hasActiveMatchToken,
    canRevealMutualProtectedFields: isMutualCruush,
    canRevealPreciseLocation,
    shouldLogProfileView: !viewerGhostMode && !targetGhostMode,
    viewerGhostMode,
    targetGhostMode,
    targetPreciseLocationVisibility
  };
}

export async function hasActiveMutualMessagePermission(
  app: FastifyInstance,
  userId: string,
  otherUserId: string
) {
  return (await getRelationshipPermissions(app, userId, otherUserId)).canMessage;
}

export async function recordProfileView(
  app: FastifyInstance,
  viewerUserId: string,
  targetUserId: string,
  relationship?: RelationshipPermissions
) {
  if (viewerUserId === targetUserId) {
    return;
  }

  const permissions = relationship ?? await getRelationshipPermissions(app, viewerUserId, targetUserId);

  if (!permissions.shouldLogProfileView) {
    return;
  }

  await upsertEncryptedRelationshipRecord(app, buildEncryptedRelationshipPayload({
    type: "profile_view",
    actorUserId: viewerUserId,
    targetUserId,
    createdAt: new Date(),
    updatedAt: new Date(),
    dedupeBucket: getProfileViewDedupeBucket()
  }));
}
