import {
  createCipheriv,
  createHash,
  createHmac,
  randomBytes
} from "node:crypto";
import type { FastifyInstance } from "fastify";
import type { AppConfig } from "./config.js";

export type PreciseLocationVisibility = "none" | "mutual_cruushes";

export type PrivacySettings = {
  ghostModeEnabled: boolean;
  preciseLocationVisibility: PreciseLocationVisibility;
};

export type CruushEntitlement = {
  cruushPlus: boolean;
  expiresAt: string | null;
};

export type RelationshipPermissions = {
  matchId: string | null;
  isMutualCruush: boolean;
  canMessage: boolean;
  canRevealMutualProtectedFields: boolean;
  canRevealPreciseLocation: boolean;
  shouldLogProfileView: boolean;
  viewerGhostMode: boolean;
  targetGhostMode: boolean;
  targetPreciseLocationVisibility: PreciseLocationVisibility;
};

type RelationshipRow = {
  match_id: string | null;
  has_active_match_token: boolean | null;
  viewer_ghost_mode_enabled: boolean | null;
  target_ghost_mode_enabled: boolean | null;
  target_precise_location_visibility: PreciseLocationVisibility | null;
};

type PrivacySettingsRow = {
  ghost_mode_enabled: boolean | null;
  precise_location_visibility: PreciseLocationVisibility | null;
};

type EntitlementRow = {
  cruush_plus_enabled: boolean | null;
  cruush_plus_expires_at: string | Date | null;
};

type MatchRow = {
  id: string;
  user_one_id: string;
  user_two_id: string;
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

function deriveKey(secret: string, purpose: string, keyVersion: string) {
  return createHash("sha256")
    .update(`${purpose}:${keyVersion}:${secret}`)
    .digest();
}

function getMatchEncryptionSecret(config: AppConfig) {
  return config.MATCH_TOKEN_ENCRYPTION_KEY || config.SESSION_SECRET;
}

function getMatchSigningSecret(config: AppConfig) {
  return config.MATCH_TOKEN_SIGNING_KEY || config.SESSION_SECRET;
}

function getMatchTokenKeyVersion(config: AppConfig) {
  return config.MATCH_TOKEN_KEY_VERSION || "v1";
}

function toIsoDate(value: string | Date | null | undefined) {
  return value ? new Date(value).toISOString() : null;
}

export function getOrderedMatchUserIds(firstUserId: string, secondUserId: string) {
  return [firstUserId, secondUserId].sort() as [string, string];
}

function createServerManagedMatchToken(
  config: AppConfig,
  payload: {
    matchId: string;
    userOneId: string;
    userTwoId: string;
    purpose: string;
    expiresAt: Date;
  }
) {
  const keyVersion = getMatchTokenKeyVersion(config);
  const encryptionKey = deriveKey(getMatchEncryptionSecret(config), "cruush-match-token-encryption", keyVersion);
  const signingKey = deriveKey(getMatchSigningSecret(config), "cruush-match-token-signing", keyVersion);
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey, nonce);
  const plaintext = JSON.stringify({
    match_id: payload.matchId,
    user_one_id: payload.userOneId,
    user_two_id: payload.userTwoId,
    purpose: payload.purpose,
    expires_at: payload.expiresAt.toISOString(),
    key_version: keyVersion
  });
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final()
  ]).toString("base64");
  const tokenNonce = nonce.toString("base64");
  const authTag = cipher.getAuthTag().toString("base64");
  const signaturePayload = `${keyVersion}.${payload.matchId}.${payload.userOneId}.${payload.userTwoId}.${payload.purpose}.${payload.expiresAt.toISOString()}.${tokenNonce}.${authTag}.${ciphertext}`;

  return {
    token_ciphertext: ciphertext,
    token_nonce: tokenNonce,
    token_auth_tag: authTag,
    token_signature: createHmac("sha256", signingKey).update(signaturePayload).digest("hex"),
    token_key_version: keyVersion
  };
}

export async function getPrivacySettings(app: FastifyInstance, userId: string): Promise<PrivacySettings> {
  const row = (await safeRows<PrivacySettingsRow>(
    app,
    `select ghost_mode_enabled, precise_location_visibility
     from user_privacy_settings
     where user_id = $1
     limit 1`,
    [userId]
  ))[0];

  return {
    ghostModeEnabled: row?.ghost_mode_enabled === true,
    preciseLocationVisibility: row?.precise_location_visibility === "mutual_cruushes"
      ? "mutual_cruushes"
      : "none"
  };
}

export async function savePrivacySettings(
  app: FastifyInstance,
  userId: string,
  settings: PrivacySettings
) {
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
      settings.ghostModeEnabled,
      settings.preciseLocationVisibility
    ]
  ))[0];

  return {
    ghostModeEnabled: row?.ghost_mode_enabled === true,
    preciseLocationVisibility: row?.precise_location_visibility === "mutual_cruushes"
      ? "mutual_cruushes"
      : "none"
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
  const match = (await safeRows<MatchRow>(
    app,
    `insert into cruush_matches (user_one_id, user_two_id)
     values ($1, $2)
     on conflict (user_one_id, user_two_id) do update
     set revoked_at = null
     returning id::text as id, user_one_id::text as user_one_id, user_two_id::text as user_two_id`,
    [userOneId, userTwoId]
  ))[0];

  if (!match) {
    return null;
  }

  const expiresAt = new Date(Date.now() + MATCH_TOKEN_TTL_MS);
  const token = createServerManagedMatchToken(app.config, {
    matchId: match.id,
    userOneId,
    userTwoId,
    purpose: MATCH_PERMISSION_PURPOSE,
    expiresAt
  });

  await safeRows(
    app,
    `insert into cruush_match_tokens (
       match_id,
       purpose,
       user_one_id,
       user_two_id,
       token_ciphertext,
       token_nonce,
       token_auth_tag,
       token_signature,
       token_key_version,
       expires_at
     )
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      match.id,
      MATCH_PERMISSION_PURPOSE,
      userOneId,
      userTwoId,
      token.token_ciphertext,
      token.token_nonce,
      token.token_auth_tag,
      token.token_signature,
      token.token_key_version,
      expiresAt.toISOString()
    ]
  );

  return {
    id: match.id,
    userOneId,
    userTwoId,
    expiresAt: expiresAt.toISOString()
  };
}

export async function revokeMutualCruushMatch(app: FastifyInstance, userId: string, otherUserId: string) {
  const [userOneId, userTwoId] = getOrderedMatchUserIds(userId, otherUserId);
  await safeRows(
    app,
    `update cruush_matches
     set revoked_at = now()
     where user_one_id = $1
       and user_two_id = $2
       and revoked_at is null`,
    [userOneId, userTwoId]
  );
  await safeRows(
    app,
    `update cruush_match_tokens
     set revoked_at = now()
     where user_one_id = $1
       and user_two_id = $2
       and revoked_at is null`,
    [userOneId, userTwoId]
  );
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
  const row = (await safeRows<RelationshipRow>(
    app,
    `select
       m.id::text as match_id,
       exists (
         select 1
         from cruush_match_tokens token
         where token.match_id = m.id
           and token.purpose = $4
           and token.revoked_at is null
           and token.expires_at > now()
       ) as has_active_match_token,
       viewer_settings.ghost_mode_enabled as viewer_ghost_mode_enabled,
       target_settings.ghost_mode_enabled as target_ghost_mode_enabled,
       target_settings.precise_location_visibility as target_precise_location_visibility
     from (select $1::uuid as user_one_id, $2::uuid as user_two_id) ids
     left join cruush_matches m
       on m.user_one_id = ids.user_one_id
      and m.user_two_id = ids.user_two_id
      and m.revoked_at is null
     left join user_privacy_settings viewer_settings
       on viewer_settings.user_id = $3::uuid
     left join user_privacy_settings target_settings
       on target_settings.user_id = case when $3::uuid = ids.user_one_id then ids.user_two_id else ids.user_one_id end
     limit 1`,
    [userOneId, userTwoId, viewerUserId, MATCH_PERMISSION_PURPOSE]
  ))[0];
  const isMutualCruush = Boolean(row?.match_id);
  const hasActiveMatchToken = row?.has_active_match_token === true;
  const targetPreciseLocationVisibility = row?.target_precise_location_visibility === "mutual_cruushes"
    ? "mutual_cruushes"
    : "none";
  const viewerGhostMode = row?.viewer_ghost_mode_enabled === true;
  const targetGhostMode = row?.target_ghost_mode_enabled === true;
  const canRevealPreciseLocation = isMutualCruush &&
    hasActiveMatchToken &&
    !viewerGhostMode &&
    !targetGhostMode &&
    targetPreciseLocationVisibility === "mutual_cruushes";

  return {
    matchId: row?.match_id ?? null,
    isMutualCruush,
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

  await safeRows(
    app,
    `insert into profile_view_events (
       target_user_id,
       viewer_user_id,
       dedupe_bucket
     )
     values ($1, $2, date_trunc('hour', now()))
     on conflict (target_user_id, viewer_user_id, dedupe_bucket) do update
     set viewed_at = now()`,
    [targetUserId, viewerUserId]
  );
}
