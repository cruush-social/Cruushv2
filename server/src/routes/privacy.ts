import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireCruushPlus } from "../billing.js";
import { runTransaction } from "../db.js";
import { ApiError } from "../errors.js";
import {
  lockMapPingSenderInTransaction,
  mapVisibilityNarrowed,
  revokeActiveMapPingsInTransaction
} from "../map-ping-revocation.js";
import {
  buildRevokeActionToken,
  GHOST_RADIUS_OPTIONS,
  issueBrowserDisplayKey,
  loadVisibilityPolicy,
  normalizeVisibilityPolicy,
  publicPrivacySettings,
  radiusMetersForLabel,
  revokePreciseLocationAccess,
  saveVisibilityPolicy,
  type CrowdPrecisionPolicy,
  type VisibilityBaseMode
} from "../location-privacy.js";
import {
  getRelationshipPermissions,
  getEffectiveVisibilityPolicy,
  getPrivacySettings
} from "../match-relationships.js";
import {
  listEncryptedRelationshipRecordsByParticipant,
  type EncryptedRelationshipRecord
} from "../encrypted-relationships.js";
import { getActiveAccountUserId, getAuthenticatedUserId } from "../request-auth.js";
import { CROWD_OPTIONS, normalizeCrowdOption } from "../profile-sensitive.js";
import {
  DEFAULT_MAP_PRESENCE_DAYS,
  MAX_MAP_PRESENCE_DAYS,
  MIN_MAP_PRESENCE_DAYS,
  normalizeMapPresenceDays
} from "../map-presence.js";

type AuditProfileRow = {
  id: string;
  display_name: string | null;
  pronouns: string[] | null;
  photos: string[] | null;
  photo_explicit?: boolean | null;
};

const crowdIdSchema = z.preprocess((value) => normalizeCrowdOption(value) ?? value, z.enum(CROWD_OPTIONS));

const crowdPrecisionPolicySchema = z.object({
  crowdId: crowdIdSchema,
  precisionEnabled: z.boolean(),
  mutualityRequired: z.boolean().optional().default(true),
  minimumTrustLevel: z.enum(["MEMBER", "VERIFIED", "MUTUAL_INTERACTION"]).optional().default("MEMBER"),
  createdAtMs: z.number().int().optional(),
  revokedAtMs: z.number().int().nullable().optional().default(null)
}).strip();

const mapPresencePayloadSchema = z.object({
  days: z.coerce.number().int().min(MIN_MAP_PRESENCE_DAYS).max(MAX_MAP_PRESENCE_DAYS)
}).strict();

const ghostModePayloadSchema = z.object({
  baseMode: z.enum(["PUBLIC_PRECISE", "GHOST", "STEALTH"]).optional(),
  enabled: z.boolean().optional(),
  ghostModeEnabled: z.boolean().optional(),
  radiusLabel: z.string().optional(),
  ghostRadiusLabel: z.string().optional(),
  ghostRadiusMeters: z.number().int().optional(),
  preciseToMutualCruushes: z.boolean().optional(),
  preciseLocationVisibility: z.enum(["none", "mutual_cruushes"]).optional(),
  preciseToMutualCrowds: z.array(crowdPrecisionPolicySchema).max(3).optional(),
  updatedAtMs: z.number().int().optional()
}).strict().superRefine((payload, ctx) => {
  if (
    typeof payload.ghostRadiusMeters === "number" &&
    !GHOST_RADIUS_OPTIONS.some((option) => option.meters === payload.ghostRadiusMeters)
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Ghost radius must be one of the supported values.",
      path: ["ghostRadiusMeters"]
    });
  }
});

const revokePayloadSchema = z.object({
  revoke_action_token: z.string().min(1)
}).strict();

function hasPremiumPrivacySettings(input: {
  baseMode: VisibilityBaseMode;
  preciseToMutualCruushes: boolean;
  preciseToMutualCrowds: CrowdPrecisionPolicy[];
}) {
  return input.baseMode === "STEALTH";
}

function premiumPrivacyMessage(input: {
  baseMode: VisibilityBaseMode;
}) {
  return "Upgrade to cruush+ to use stealth mode.";
}

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

function otherUserIdForRecord(record: EncryptedRelationshipRecord, currentUserId: string) {
  return record.payload.actorUserId === currentUserId
    ? record.payload.targetUserId
    : record.payload.actorUserId;
}

async function loadAuditProfiles(app: FastifyInstance, userIds: string[]) {
  const uniqueUserIds = [...new Set(userIds)];

  if (uniqueUserIds.length === 0) {
    return new Map<string, AuditProfileRow>();
  }

  const result = await app.db.query<AuditProfileRow>(
    `select p.id::text as id, p.display_name, p.pronouns, p.photos,
            coalesce((
              select media.explicit_classification is distinct from 'non_explicit'
              from media_objects media
              where media.owner_user_id = p.id
                and media.public_url = p.photos[1]
                and media.surface = 'profile_photo'
                and media.deleted_at is null
              limit 1
            ), true) as photo_explicit
     from profiles p
     where p.id = any($1::uuid[])`,
    [uniqueUserIds]
  );

  return new Map(result.rows.map((row) => [row.id, row]));
}

function mapAuditProfile(row: AuditProfileRow | undefined, userId: string) {
  return {
    id: userId,
    name: row?.display_name?.trim() || "cruush user",
    pronouns: row?.pronouns?.join(", ") ?? "",
    photo: row?.photos?.[0] ?? null,
    photoExplicit: row?.photo_explicit === true
  };
}

async function loadMutualPreciseCandidates(app: FastifyInstance, subjectUserId: string) {
  const policy = await getPrivacySettings(app, subjectUserId);

  if (!policy.preciseToMutualCruushes) {
    return [];
  }

  const records = await listEncryptedRelationshipRecordsByParticipant(app, {
    participantUserId: subjectUserId,
    type: "mutual_cruush"
  });
  const candidates = [];

  for (const record of records) {
    const viewerUserId = otherUserIdForRecord(record, subjectUserId);
    const relationship = await getRelationshipPermissions(app, viewerUserId, subjectUserId);

    if (relationship.canRevealPreciseLocation) {
      candidates.push({
        viewerUserId,
        permissionType: "mutual_cruush" as const,
        reason: "Mutual cruush precise sharing",
        grantedAtMs: new Date(record.payload.createdAt).getTime(),
        lastDecisionAtMs: Date.now()
      });
    }
  }

  return candidates;
}

export async function registerPrivacyRoutes(app: FastifyInstance) {
  app.get("/api/location/display-key", async (request, reply) => {
    const userId = await getAuthenticatedUserId(request);

    return reply.send({
      data: issueBrowserDisplayKey(app.config, request, userId)
    });
  });

  app.get("/api/privacy/ghost-mode", async (request, reply) => {
    const userId = await getAuthenticatedUserId(request);

    return reply.send({
      data: publicPrivacySettings(await getEffectiveVisibilityPolicy(app, userId).catch(async (error) => {
        if (isSchemaCompatibilityError(error)) {
          const legacy = await getPrivacySettings(app, userId);
          return {
            version: 1 as const,
            subjectUserId: userId,
            policyVersion: 1,
            baseMode: legacy.baseMode,
            ghostRadiusMeters: legacy.ghostRadiusMeters,
            preciseToMutualCruushes: legacy.preciseToMutualCruushes,
            preciseToMutualCrowds: [],
            auditRequired: false,
            updatedAtMs: legacy.updatedAtMs,
            expiresAtMs: null,
            keyVersion: app.config.VISIBILITY_POLICY_ENCRYPTION_KEY_VERSION || "v1"
          };
        }

        throw error;
      }))
    });
  });

  app.post("/api/privacy/ghost-mode", async (request, reply) => {
    const userId = await getActiveAccountUserId(request);
    const payload = ghostModePayloadSchema.parse(request.body);
    const enabled = payload.enabled ?? payload.ghostModeEnabled;
    const baseMode: VisibilityBaseMode = payload.baseMode ??
      (enabled === true ? "GHOST" : enabled === false ? "PUBLIC_PRECISE" : "PUBLIC_PRECISE");
    const preciseToMutualCruushes = typeof payload.preciseToMutualCruushes === "boolean"
      ? payload.preciseToMutualCruushes
      : payload.preciseLocationVisibility === "mutual_cruushes";
    const radiusLabel = payload.radiusLabel ?? payload.ghostRadiusLabel;
    const preciseToMutualCrowds = (payload.preciseToMutualCrowds ?? []).map((policy): CrowdPrecisionPolicy => ({
      crowdId: policy.crowdId,
      precisionEnabled: policy.precisionEnabled,
      mutualityRequired: policy.mutualityRequired,
      minimumTrustLevel: policy.minimumTrustLevel,
      createdAtMs: policy.createdAtMs ?? Date.now(),
      revokedAtMs: policy.revokedAtMs ?? null
    }));
    if (hasPremiumPrivacySettings({ baseMode, preciseToMutualCruushes, preciseToMutualCrowds })) {
      await requireCruushPlus(app, userId, premiumPrivacyMessage({ baseMode }));
    }
    const visibilityInput = {
      baseMode,
      ghostModeEnabled: baseMode === "GHOST",
      ghostRadiusMeters: payload.ghostRadiusMeters ?? radiusMetersForLabel(radiusLabel),
      preciseToMutualCruushes,
      preciseToMutualCrowds,
      preciseLocationVisibility: preciseToMutualCruushes ? "mutual_cruushes" as const : "none" as const
    };
    const savedPolicy = await runTransaction(app.db, async (db) => {
      await lockMapPingSenderInTransaction(db, userId);
      const context = { config: app.config, db };
      const currentPolicy = await loadVisibilityPolicy(context, userId);
      const nextPolicy = normalizeVisibilityPolicy(app.config, userId, visibilityInput, currentPolicy);
      const saved = await saveVisibilityPolicy(context, userId, visibilityInput);

      if (mapVisibilityNarrowed(currentPolicy, nextPolicy)) {
        await revokeActiveMapPingsInTransaction(db, userId);
      }

      return saved;
    });

    return reply.send({
      data: publicPrivacySettings(savedPolicy)
    });
  });

  app.get("/api/privacy/map-presence", async (request, reply) => {
    const userId = await getAuthenticatedUserId(request);
    const result = await app.db.query<{ map_presence_days: number | null }>(
      `select map_presence_days
       from user_privacy_settings
       where user_id = $1`,
      [userId]
    );

    return reply.send({
      data: {
        days: normalizeMapPresenceDays(result.rows[0]?.map_presence_days ?? DEFAULT_MAP_PRESENCE_DAYS),
        minDays: MIN_MAP_PRESENCE_DAYS,
        maxDays: MAX_MAP_PRESENCE_DAYS
      }
    });
  });

  app.put("/api/privacy/map-presence", async (request, reply) => {
    const userId = await getActiveAccountUserId(request);
    const payload = mapPresencePayloadSchema.parse(request.body);
    const result = await app.db.query<{ map_presence_days: number | null }>(
      `insert into user_privacy_settings (user_id, map_presence_days)
       values ($1, $2)
       on conflict (user_id) do update
       set map_presence_days = excluded.map_presence_days,
           updated_at = now()
       returning map_presence_days`,
      [userId, payload.days]
    );

    return reply.send({
      data: {
        days: normalizeMapPresenceDays(result.rows[0]?.map_presence_days ?? payload.days),
        minDays: MIN_MAP_PRESENCE_DAYS,
        maxDays: MAX_MAP_PRESENCE_DAYS
      }
    });
  });

  app.get("/api/privacy/audit", async (request, reply) => {
    const subjectUserId = await getAuthenticatedUserId(request);
    const candidates = await loadMutualPreciseCandidates(app, subjectUserId).catch((error) => {
      if (isSchemaCompatibilityError(error)) {
        return [];
      }

      throw error;
    });
    const profiles = await loadAuditProfiles(app, candidates.map((candidate) => candidate.viewerUserId)).catch((error) => {
      if (isSchemaCompatibilityError(error)) {
        return new Map<string, AuditProfileRow>();
      }

      throw error;
    });

    return reply.send({
      data: {
        exact_location_access: candidates.map((candidate) => ({
          viewer_profile_token: candidate.viewerUserId,
          viewer: mapAuditProfile(profiles.get(candidate.viewerUserId), candidate.viewerUserId),
          reason: candidate.reason,
          permission_type: candidate.permissionType,
          granted_at_ms: candidate.grantedAtMs,
          last_decision_at_ms: candidate.lastDecisionAtMs,
          revoke_action_token: buildRevokeActionToken(app.config, {
            subjectUserId,
            viewerUserId: candidate.viewerUserId,
            permissionType: candidate.permissionType
          })
        }))
      }
    });
  });

  app.post("/api/privacy/revoke", async (request, reply) => {
    const subjectUserId = await getAuthenticatedUserId(request);
    const payload = revokePayloadSchema.parse(request.body);
    const candidates = await loadMutualPreciseCandidates(app, subjectUserId);
    const match = candidates.find((candidate) => buildRevokeActionToken(app.config, {
      subjectUserId,
      viewerUserId: candidate.viewerUserId,
      permissionType: candidate.permissionType
    }) === payload.revoke_action_token);

    if (!match) {
      throw new ApiError(404, "NOT_FOUND", "Precise-location grant was not found.");
    }

    const effectiveAtMs = await runTransaction(app.db, async (db) => {
      await lockMapPingSenderInTransaction(db, subjectUserId);
      const revokedAt = await revokePreciseLocationAccess({ config: app.config, db }, {
        subjectUserId,
        viewerUserId: match.viewerUserId,
        permissionType: match.permissionType,
        reason: "Privacy Audit revocation"
      });
      await revokeActiveMapPingsInTransaction(db, subjectUserId);

      return revokedAt;
    });

    return reply.send({
      data: {
        status: "revoked",
        effective_at_ms: effectiveAtMs,
        new_visibility_for_viewer: "GHOST_OR_NONE"
      }
    });
  });
}
