import type { FastifyInstance } from "fastify";
import {
  buildEncryptedRelationshipPayload,
  findEncryptedRelationshipRecord,
  getOrderedRelationshipUserIds,
  getProfileViewDedupeBucket,
  hasActiveEncryptedRelationshipToken,
  listEncryptedRelationshipRecordsByTarget,
  issueEncryptedRelationshipToken,
  revokeEncryptedRelationshipTokens,
  updateEncryptedRelationshipRecordStatus,
  upsertEncryptedRelationshipRecord
} from "./encrypted-relationships.js";
import {
  DEFAULT_GHOST_RADIUS_METERS,
  loadVisibilityPolicy,
  publicPrivacySettings,
  resolveSharedDistanceLabelMode,
  saveVisibilityPolicy,
  isPreciseLocationRevoked,
  type CrowdPrecisionPolicy,
  type VisibilityBaseMode,
  type VisibilityPolicyPayload
} from "./location-privacy.js";
import { hasUserBlockBetween } from "./user-blocks.js";
import { getAlphaTestState } from "./alpha-test.js";
import { isOwnerFullAccessEmail } from "./owner-access.js";

export type PreciseLocationVisibility = "none" | "mutual_cruushes";

export type PrivacySettings = {
  baseMode: VisibilityBaseMode;
  ghostModeEnabled: boolean;
  ghostRadiusMeters: number;
  ghostRadiusLabel: string;
  preciseToMutualCruushes: boolean;
  preciseToMutualCrowds: CrowdPrecisionPolicy[];
  darkRoomDistanceLabel: boolean;
  distanceLabelMode?: "approximate" | "precise";
  preciseLocationVisibility: PreciseLocationVisibility;
  updatedAtMs: number;
};

export type CruushEntitlement = {
  cruushPlus: boolean;
  expiresAt: string | null;
  ownerFullAccess?: boolean;
};

export type RelationshipPermissions = {
  matchId: string | null;
  isBlocked: boolean;
  isMutualCruush: boolean;
  hasOutgoingCruush: boolean;
  canMessage: boolean;
  canRevealMutualProtectedFields: boolean;
  canRevealPreciseLocation: boolean;
  shouldLogProfileView: boolean;
  viewerGhostMode: boolean;
  targetGhostMode: boolean;
  targetBaseMode?: VisibilityBaseMode;
  targetDarkRoomDistanceLabel?: boolean;
  distanceLabelMode?: "approximate" | "precise";
  targetPreciseLocationVisibility: PreciseLocationVisibility;
};

type PrivacySettingsRow = {
  ghost_mode_enabled: boolean | null;
  precise_location_visibility: PreciseLocationVisibility | null;
};

type EntitlementRow = {
  owner_email?: string | null;
  cruush_plus_enabled: boolean | null;
  cruush_plus_expires_at: string | Date | null;
  has_lifetime?: boolean | null;
  paid_expires_at?: string | Date | null;
  promotional_expires_at?: string | Date | null;
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
    return publicPrivacySettings(await getEffectiveVisibilityPolicy(app, userId));
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
    darkRoomDistanceLabel: false,
    preciseLocationVisibility: preciseToMutualCruushes ? "mutual_cruushes" : "none",
    updatedAtMs: Date.now()
  };
}

export function effectiveVisibilityPolicyForEntitlement(
  policy: VisibilityPolicyPayload,
  hasCruushPlus: boolean
): VisibilityPolicyPayload {
  if (policy.baseMode !== "STEALTH" || policy.auditRequired || hasCruushPlus) {
    return policy;
  }

  return {
    ...policy,
    baseMode: "PUBLIC_PRECISE"
  };
}

export async function getEffectiveVisibilityPolicy(
  app: FastifyInstance,
  userId: string,
  storedPolicy?: VisibilityPolicyPayload
): Promise<VisibilityPolicyPayload> {
  const policy = storedPolicy ?? await loadVisibilityPolicy(app, userId);

  if (policy.baseMode !== "STEALTH" || policy.auditRequired) {
    return policy;
  }

  const entitlement = await getCruushEntitlement(app, userId);
  return effectiveVisibilityPolicyForEntitlement(policy, entitlement.cruushPlus);
}

function conservativePrivacySettingsFallback(): PrivacySettings {
  return {
    baseMode: "GHOST" as VisibilityBaseMode,
    ghostModeEnabled: true,
    ghostRadiusMeters: DEFAULT_GHOST_RADIUS_METERS,
    ghostRadiusLabel: "1 mi",
    preciseToMutualCruushes: false,
    preciseToMutualCrowds: [],
    darkRoomDistanceLabel: false,
    preciseLocationVisibility: "none",
    updatedAtMs: Date.now()
  };
}

async function getRelationshipPrivacySettings(app: FastifyInstance, userId: string) {
  try {
    return await getPrivacySettings(app, userId);
  } catch (error) {
    app.log.warn({ err: error, userId }, "relationship privacy settings unavailable");
    return conservativePrivacySettingsFallback();
  }
}

export async function getSharedDistanceLabelMode(app: FastifyInstance, viewerUserId: string, targetUserId: string) {
  const [viewer, subject] = await Promise.all([
    getRelationshipPrivacySettings(app, viewerUserId),
    getRelationshipPrivacySettings(app, targetUserId)
  ]);
  return resolveSharedDistanceLabelMode(viewer.distanceLabelMode, subject.distanceLabelMode);
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
    `with paid_state as (
       select
         (
           select email
           from app_users
           where id = $1
         ) as owner_email,
         coalesce((
           select cruush_plus_enabled
           from user_entitlements
           where user_id = $1
         ), false) as cruush_plus_enabled,
         (
           select cruush_plus_expires_at
           from user_entitlements
           where user_id = $1
         ) as cruush_plus_expires_at,
         exists (
           select 1 from cruush_plus_lifetime_access
           where user_id = $1
         ) as has_lifetime,
         (
           select max(current_period_ends_at)
           from cruush_plus_subscriptions
           where user_id = $1
             and status = 'active'
             and current_period_ends_at > now()
         ) as paid_expires_at
     ), activated_promotion as (
       update promotional_cruush_plus_entitlements promotion
       set active_until = greatest(coalesce(promotion.active_until, now()), now())
             + (promotion.banked_seconds * interval '1 second'),
           banked_seconds = 0,
           updated_at = now()
       from paid_state
       where promotion.user_id = $1
         and promotion.banked_seconds > 0
         and paid_state.has_lifetime = false
         and paid_state.paid_expires_at is null
         and not (
           paid_state.cruush_plus_enabled = true
           and (
             paid_state.cruush_plus_expires_at is null
             or paid_state.cruush_plus_expires_at > now()
           )
         )
       returning promotion.active_until
     )
     select
       paid_state.owner_email,
       paid_state.cruush_plus_enabled,
       paid_state.cruush_plus_expires_at,
       paid_state.has_lifetime,
       paid_state.paid_expires_at,
       coalesce(
         (select active_until from activated_promotion),
         (select active_until from promotional_cruush_plus_entitlements where user_id = $1)
       ) as promotional_expires_at
     from paid_state`,
    [userId]
  ))[0];

  if (isOwnerFullAccessEmail(row?.owner_email)) {
    return {
      cruushPlus: true,
      expiresAt: null,
      ownerFullAccess: true
    };
  }
  const legacyExpiresAt = toIsoDate(row?.cruush_plus_expires_at);
  const legacyActive = row?.cruush_plus_enabled === true &&
    (!legacyExpiresAt || new Date(legacyExpiresAt).getTime() > Date.now());
  const paidExpiresAt = toIsoDate(row?.paid_expires_at);
  const promotionalExpiresAt = toIsoDate(row?.promotional_expires_at);
  const paidActive = Boolean(paidExpiresAt && new Date(paidExpiresAt).getTime() > Date.now());
  const promotionalActive = Boolean(
    promotionalExpiresAt && new Date(promotionalExpiresAt).getTime() > Date.now()
  );
  const lifetime = row?.has_lifetime === true || (legacyActive && !legacyExpiresAt);
  const datedExpirations = [legacyExpiresAt, paidExpiresAt, promotionalExpiresAt]
    .filter((value): value is string => Boolean(value))
    .sort();
  const alphaTest = getAlphaTestState(app.config);
  const baseEntitlement = {
    cruushPlus: lifetime || legacyActive || paidActive || promotionalActive,
    expiresAt: lifetime ? null : datedExpirations.at(-1) ?? null,
    ownerFullAccess: false
  };

  if (!alphaTest.active) {
    return baseEntitlement;
  }

  if (!baseEntitlement.cruushPlus) {
    return {
      ...baseEntitlement,
      cruushPlus: true,
      expiresAt: alphaTest.endsAt
    };
  }

  if (!baseEntitlement.expiresAt || !alphaTest.endsAt) {
    return baseEntitlement;
  }

  return {
    ...baseEntitlement,
    cruushPlus: true,
    expiresAt: new Date(baseEntitlement.expiresAt).getTime() >= new Date(alphaTest.endsAt).getTime()
      ? baseEntitlement.expiresAt
      : alphaTest.endsAt
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

export async function revokeOutgoingCruush(app: FastifyInstance, userId: string, otherUserId: string) {
  const outgoingCruush = await findEncryptedRelationshipRecord(app, {
    type: "cruush",
    actorUserId: userId,
    targetUserId: otherUserId
  });
  const [userOneId, userTwoId] = getOrderedMatchUserIds(userId, otherUserId);
  const activeMatch = await findEncryptedRelationshipRecord(app, {
    type: "mutual_cruush",
    actorUserId: userOneId,
    targetUserId: userTwoId
  });
  const revokedAt = new Date();

  if (outgoingCruush) {
    await updateEncryptedRelationshipRecordStatus(app, outgoingCruush, "removed", {
      revokedAt
    });
  }

  if (activeMatch) {
    await updateEncryptedRelationshipRecordStatus(app, activeMatch, "removed", {
      revokedAt
    });
    await revokeEncryptedRelationshipTokens(app, activeMatch.id);
  }

  await upsertEncryptedRelationshipRecord(app, buildEncryptedRelationshipPayload({
    type: "removed_cruush",
    status: "removed",
    actorUserId: userId,
    targetUserId: otherUserId,
    createdAt: revokedAt,
    revokedAt
  }));

  return {
    outgoingCruushId: outgoingCruush?.id ?? null,
    matchId: activeMatch?.id ?? null
  };
}

export async function revokeMutualCruushMatch(app: FastifyInstance, userId: string, otherUserId: string) {
  return revokeOutgoingCruush(app, userId, otherUserId);
}

/**
 * The recipient clears an incoming cruush from their own list. Dismissing what
 * someone sent must not edit the sender's history, so the record is marked
 * dismissed rather than removed and the sender's Sent list keeps carrying it.
 */
export async function dismissIncomingCruush(app: FastifyInstance, userId: string, otherUserId: string) {
  const incoming = await findEncryptedRelationshipRecord(app, {
    type: "cruush",
    actorUserId: otherUserId,
    targetUserId: userId
  });

  if (!incoming) {
    return { dismissed: false };
  }

  await updateEncryptedRelationshipRecordStatus(app, incoming, "dismissed");
  return { dismissed: true };
}

/** Clears one viewer's entries from the owner's Views list. */
export async function removeProfileViewsFromViewer(app: FastifyInstance, userId: string, viewerUserId: string) {
  const views = await listEncryptedRelationshipRecordsByTarget(app, {
    targetUserId: userId,
    type: "profile_view"
  });
  const fromViewer = views.filter((record) => record.payload.actorUserId === viewerUserId);

  for (const record of fromViewer) {
    await updateEncryptedRelationshipRecordStatus(app, record, "removed");
  }

  return { removed: fromViewer.length };
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
      isBlocked: false,
      isMutualCruush: true,
      hasOutgoingCruush: true,
      canMessage: true,
      canRevealMutualProtectedFields: true,
      canRevealPreciseLocation: true,
      shouldLogProfileView: false,
      viewerGhostMode: viewerSettings.ghostModeEnabled,
      targetGhostMode: viewerSettings.ghostModeEnabled,
      targetBaseMode: viewerSettings.baseMode ?? "GHOST",
      targetDarkRoomDistanceLabel: viewerSettings.darkRoomDistanceLabel === true,
      distanceLabelMode: viewerSettings.distanceLabelMode ?? "approximate",
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
    getRelationshipPrivacySettings(app, viewerUserId),
    getRelationshipPrivacySettings(app, targetUserId)
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
  const blocked = await hasUserBlockBetween(app, viewerUserId, targetUserId);

  return {
    matchId: blocked ? null : match?.id ?? null,
    isBlocked: blocked,
    isMutualCruush: blocked ? false : isMutualCruush,
    hasOutgoingCruush: blocked ? false : hasOutgoingCruush,
    // Direct messages are public by default. Mutuality still gates protected
    // location/profile fields and NSFW-photo settings; blocks remain a hard
    // boundary for every message surface.
    canMessage: !blocked,
    canRevealMutualProtectedFields: !blocked && isMutualCruush,
    canRevealPreciseLocation: !blocked && canRevealPreciseLocation,
    // Dark Room browsing leaves no trace. Ghost Mode does not: it hides
    // precise location behind a decoy, not interest, so a ghosted viewer
    // still lands in Views and a ghosted target still sees who looked.
    shouldLogProfileView: !blocked && viewerSettings.baseMode !== "STEALTH",
    viewerGhostMode,
    targetGhostMode,
    targetBaseMode: targetSettings.baseMode ?? "GHOST",
    targetDarkRoomDistanceLabel: targetSettings.darkRoomDistanceLabel === true,
    distanceLabelMode: resolveSharedDistanceLabelMode(viewerSettings.distanceLabelMode, targetSettings.distanceLabelMode),
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
