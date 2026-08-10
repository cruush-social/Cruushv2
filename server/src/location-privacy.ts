import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual
} from "node:crypto";
import type { FastifyRequest } from "fastify";
import type { AppConfig } from "./config.js";
import type { DbClient } from "./db.js";
import { getSessionTokenFromRequest, hashSessionToken } from "./auth.js";
import { normalizeCrowdOption, type CrowdOption } from "./profile-sensitive.js";

export type VisibilityBaseMode = "PUBLIC_PRECISE" | "GHOST" | "STEALTH";
export type DisplayMode = "PRECISE" | "GHOST";
export type DisplayAnimationHint = "NONE" | "FADE_LAST_MINUTE" | "SIGNAL_LOSS" | "REAPPEAR";
export type RelationshipContext = "SELF" | "PUBLIC" | "MUTUAL_CRUUSH" | "MUTUAL_CROWD";

export type CrowdPrecisionPolicy = {
  crowdId: CrowdOption;
  precisionEnabled: boolean;
  mutualityRequired: boolean;
  minimumTrustLevel: "MEMBER" | "VERIFIED" | "MUTUAL_INTERACTION";
  createdAtMs: number;
  revokedAtMs: number | null;
};

export type VisibilityPolicyPayload = {
  version: 1;
  subjectUserId: string;
  policyVersion: number;
  baseMode: VisibilityBaseMode;
  ghostRadiusMeters: number | null;
  preciseToMutualCruushes: boolean;
  preciseToMutualCrowds: CrowdPrecisionPolicy[];
  auditRequired: boolean;
  updatedAtMs: number;
  expiresAtMs: number | null;
  keyVersion: string;
};

export type LocationPayload = {
  version: 1;
  subjectUserId: string;
  locationVersion: number;
  latE7: number;
  lonE7: number;
  accuracyM: number;
  source: "GPS" | "WIFI" | "CELL" | "MANUAL" | "SYSTEM";
  deviceReportedAtMs: number;
  collectedAtMs: number;
  expiresAtMs: number;
  keyVersion: string;
};

export type DisplayLocationPayload = {
  version: 1;
  subjectUserId: string;
  viewerUserId: string;
  displayMode: DisplayMode;
  latE7: number;
  lonE7: number;
  accuracyDisplayM: number;
  rotationEpoch: number | null;
  subjectPolicyVersion: number;
  relationshipGrantVersion: number;
  expiresAtMs: number;
  animationHint: DisplayAnimationHint;
  renderNonce: string;
};

export type DisplayLocationToken = {
  version: 1;
  tokenId: string;
  keyId: string;
  ciphertext: string;
  nonce: string;
  expiresAtMs: number;
  tokenVersion: 1;
};

export type BrowserDisplayKey = {
  version: 1;
  keyId: string;
  key: string;
  expiresAtMs: number;
};

export type LocationPrivacyContext = {
  config: AppConfig;
  db: Pick<DbClient, "query">;
};

type EncryptedVisibilityTokenRow = {
  subject_user_id: string;
  policy_version: string | number;
  policy_ciphertext: string;
  policy_nonce: string;
  policy_auth_tag: string;
  wrapped_policy_dek: string;
  policy_dek_nonce: string;
  policy_dek_auth_tag: string;
  key_version: string;
  updated_at_ms: string | number;
};

type EncryptedLocationEnvelopeRow = {
  subject_user_id: string;
  location_version: string | number;
  location_ciphertext: string;
  location_nonce: string;
  location_auth_tag: string;
  wrapped_location_dek: string;
  location_dek_nonce: string;
  location_dek_auth_tag: string;
  key_version: string;
  coarse_index_tokens: string[] | null;
  collected_at_ms: string | number;
  expires_at_ms: string | number;
};

type EncryptedGhostRotationTokenRow = {
  subject_user_id: string;
  rotation_epoch: string | number;
  policy_version: string | number;
  token_ciphertext: string;
  token_nonce: string;
  token_auth_tag: string;
  wrapped_token_dek: string;
  token_dek_nonce: string;
  token_dek_auth_tag: string;
  key_version: string;
  expires_at_ms: string | number;
  revoked_at_ms: string | number | null;
};

type PrivacyAuditEventRow = {
  id: string;
  event_ciphertext: string;
  event_nonce: string;
  event_auth_tag: string;
  wrapped_event_dek: string;
  event_dek_nonce: string;
  event_dek_auth_tag: string;
  key_version: string;
  created_at_ms: string | number;
  revoked_at_ms: string | number | null;
};

type GhostRotationPayload = {
  version: 1;
  subjectUserId: string;
  rotationEpoch: number;
  radiusMeters: number;
  derivationSalt: string;
  policyVersion: number;
  centerLocationVersion: number;
  tokenCreatedAtMs: number;
  tokenExpiresAtMs: number;
};

type PrivacyAuditPayload = {
  version: 1;
  subjectUserId: string;
  viewerUserId: string;
  eventType: "precise_location_revoke" | "precise_location_decision";
  permissionType: "mutual_cruush" | "mutual_crowd";
  reason: string;
  createdAtMs: number;
  revokedAtMs: number | null;
};

export const GHOST_RADIUS_OPTIONS = [
  { label: "500 ft", meters: 152 },
  { label: "0.25 mi", meters: 402 },
  { label: "0.5 mi", meters: 805 },
  { label: "1 mi", meters: 1609 },
  { label: "3 mi", meters: 4828 },
  { label: "5 mi", meters: 8047 }
] as const;

export const DEFAULT_GHOST_RADIUS_METERS = 1609;
export const GHOST_MIN_OFFSET_RATIO = 0.5;
export const DISPLAY_TOKEN_TTL_MS = 180 * 1000;
export const LOCATION_DISCOVERY_WINDOW_MS = 4 * 24 * 60 * 60 * 1000;
const LOCATION_TTL_MS = LOCATION_DISCOVERY_WINDOW_MS;
const ROTATION_INTERVAL_MS = 15 * 60 * 1000;
const FADE_WINDOW_MS = 60 * 1000;
const DISPLAY_KEY_TTL_MS = 30 * 60 * 1000;
const COARSE_CELL_DEGREES = 0.02;

// How many coarse cells out from the viewer discovery searches. A cell is
// 0.02 degrees: about 2.2 km north-south and 1.7 km east-west at this latitude.
//
// This was 1, giving a 3x3 grid and roughly a one mile reach - far smaller than
// the 15 mile beta geofence, so most people inside the launch radius were stored
// and unexpired yet never matched a query. 11 cells reaches about 11.5 miles and
// costs 529 cells x 2 time buckets = ~1058 tokens per query, which the GIN index
// on coarse_index_tokens handles comfortably.
const COARSE_CELL_SEARCH_RADIUS = 11;

function base64Url(buffer: Buffer) {
  return buffer
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function fromBase64Url(value: string) {
  const padded = `${value}${"=".repeat((4 - value.length % 4) % 4)}`;
  return Buffer.from(padded.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

function deriveKey(secret: string, purpose: string, keyVersion: string) {
  return createHash("sha256")
    .update(`${purpose}:${keyVersion}:${secret}`)
    .digest();
}

function getLocationEncryptionSecret(config: AppConfig) {
  return config.LOCATION_ENCRYPTION_KEY || config.SESSION_SECRET;
}

function getLocationIndexSecret(config: AppConfig) {
  return config.LOCATION_INDEX_KEY || config.SESSION_SECRET;
}

function getVisibilityPolicySecret(config: AppConfig) {
  return config.VISIBILITY_POLICY_ENCRYPTION_KEY || config.SESSION_SECRET;
}

function getGhostDerivationSecret(config: AppConfig) {
  return config.GHOST_DERIVATION_KEY || config.SESSION_SECRET;
}

function getDisplayTokenSecret(config: AppConfig) {
  return config.DISPLAY_TOKEN_ENCRYPTION_KEY || config.SESSION_SECRET;
}

export function getLocationKeyVersion(config: AppConfig) {
  return config.LOCATION_ENCRYPTION_KEY_VERSION || "v1";
}

export function getLocationIndexKeyVersion(config: AppConfig) {
  return config.LOCATION_INDEX_KEY_VERSION || "v1";
}

export function getVisibilityPolicyKeyVersion(config: AppConfig) {
  return config.VISIBILITY_POLICY_ENCRYPTION_KEY_VERSION || "v1";
}

export function getGhostDerivationKeyVersion(config: AppConfig) {
  return config.GHOST_DERIVATION_KEY_VERSION || "v1";
}

export function getDisplayTokenKeyVersion(config: AppConfig) {
  return config.DISPLAY_TOKEN_ENCRYPTION_KEY_VERSION || "v1";
}

function encryptAead(key: Buffer, plaintext: Buffer, aad: Buffer) {
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  cipher.setAAD(aad);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);

  return {
    ciphertext: ciphertext.toString("base64"),
    nonce: nonce.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64")
  };
}

function decryptAead(input: {
  key: Buffer;
  ciphertext: string;
  nonce: string;
  authTag: string;
  aad: Buffer;
}) {
  const decipher = createDecipheriv("aes-256-gcm", input.key, Buffer.from(input.nonce, "base64"));
  decipher.setAAD(input.aad);
  decipher.setAuthTag(Buffer.from(input.authTag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(input.ciphertext, "base64")),
    decipher.final()
  ]);
}

function encryptWithWrappedDataKey(input: {
  plaintext: unknown;
  aad: string;
  config: AppConfig;
  secret: string;
  purpose: string;
  keyVersion: string;
}) {
  const dataKey = randomBytes(32);
  const plaintext = Buffer.from(JSON.stringify(input.plaintext), "utf8");
  const aad = Buffer.from(input.aad, "utf8");
  const encryptedPayload = encryptAead(dataKey, plaintext, aad);
  const wrappingKey = deriveKey(input.secret, `${input.purpose}-wrap`, input.keyVersion);
  const wrapped = encryptAead(wrappingKey, dataKey, aad);

  return {
    ciphertext: encryptedPayload.ciphertext,
    nonce: encryptedPayload.nonce,
    authTag: encryptedPayload.authTag,
    wrappedDek: wrapped.ciphertext,
    dekNonce: wrapped.nonce,
    dekAuthTag: wrapped.authTag,
    keyVersion: input.keyVersion
  };
}

function decryptWithWrappedDataKey<T>(input: {
  ciphertext: string;
  nonce: string;
  authTag: string;
  wrappedDek: string;
  dekNonce: string;
  dekAuthTag: string;
  aad: string;
  secret: string;
  purpose: string;
  keyVersion: string;
}): T {
  const aad = Buffer.from(input.aad, "utf8");
  const wrappingKey = deriveKey(input.secret, `${input.purpose}-wrap`, input.keyVersion);
  const dataKey = decryptAead({
    key: wrappingKey,
    ciphertext: input.wrappedDek,
    nonce: input.dekNonce,
    authTag: input.dekAuthTag,
    aad
  });
  const plaintext = decryptAead({
    key: dataKey,
    ciphertext: input.ciphertext,
    nonce: input.nonce,
    authTag: input.authTag,
    aad
  });

  return JSON.parse(plaintext.toString("utf8")) as T;
}

export function radiusLabelForMeters(meters: number | null | undefined) {
  return GHOST_RADIUS_OPTIONS.find((option) => option.meters === meters)?.label ?? "1 mi";
}

export function radiusMetersForLabel(label: string | null | undefined) {
  return GHOST_RADIUS_OPTIONS.find((option) => option.label === label)?.meters ?? DEFAULT_GHOST_RADIUS_METERS;
}

function policyAad(subjectUserId: string, policyVersion: number, updatedAtMs: number) {
  return `visibility-policy:v1:${subjectUserId}:${policyVersion}:${updatedAtMs}`;
}

function locationAad(subjectUserId: string, locationVersion: number, collectedAtMs: number) {
  return `location:v1:${subjectUserId}:${locationVersion}:${collectedAtMs}`;
}

function rotationAad(subjectUserId: string, rotationEpoch: number, policyVersion: number) {
  return `ghost-rotation:v1:${subjectUserId}:${rotationEpoch}:${policyVersion}`;
}

function eventAad(subjectUserId: string, viewerUserId: string, createdAtMs: number) {
  return `privacy-audit:v1:${subjectUserId}:${viewerUserId}:${createdAtMs}`;
}

function toNumber(value: string | number | null | undefined) {
  return typeof value === "number" ? value : Number(value ?? 0);
}

function normalizeCrowdPrecisionPolicies(policies: CrowdPrecisionPolicy[] = []) {
  return policies
    .map((policy) => {
      const crowdId = normalizeCrowdOption(policy.crowdId);

      return crowdId ? { ...policy, crowdId } : null;
    })
    .filter((policy): policy is CrowdPrecisionPolicy => Boolean(policy));
}

export function buildDefaultVisibilityPolicy(
  config: AppConfig,
  subjectUserId: string,
  nowMs = Date.now()
): VisibilityPolicyPayload {
  return {
    version: 1,
    subjectUserId,
    policyVersion: 1,
    baseMode: "PUBLIC_PRECISE",
    ghostRadiusMeters: DEFAULT_GHOST_RADIUS_METERS,
    preciseToMutualCruushes: false,
    preciseToMutualCrowds: [],
    auditRequired: false,
    updatedAtMs: nowMs,
    expiresAtMs: null,
    keyVersion: getVisibilityPolicyKeyVersion(config)
  };
}

export function normalizeVisibilityPolicy(
  config: AppConfig,
  subjectUserId: string,
  input: Partial<VisibilityPolicyPayload> & {
    ghostModeEnabled?: boolean;
    preciseLocationVisibility?: "none" | "mutual_cruushes";
    preciseToMutualCruushes?: boolean;
  },
  currentPolicy?: VisibilityPolicyPayload | null,
  nowMs = Date.now()
): VisibilityPolicyPayload {
  const previous = currentPolicy ?? buildDefaultVisibilityPolicy(config, subjectUserId, nowMs);
  const ghostModeEnabled = typeof input.ghostModeEnabled === "boolean"
    ? input.ghostModeEnabled
    : input.baseMode
      ? input.baseMode === "GHOST"
      : previous.baseMode === "GHOST";
  const baseMode = input.baseMode ?? (ghostModeEnabled ? "GHOST" : previous.baseMode === "STEALTH" ? "STEALTH" : "PUBLIC_PRECISE");
  const preciseToMutualCruushes = typeof input.preciseToMutualCruushes === "boolean"
    ? input.preciseToMutualCruushes
    : input.preciseLocationVisibility === "mutual_cruushes"
      ? true
      : input.preciseLocationVisibility === "none"
        ? false
        : previous.preciseToMutualCruushes;

  return {
    version: 1,
    subjectUserId,
    policyVersion: previous.policyVersion + 1,
    baseMode,
    ghostRadiusMeters: input.ghostRadiusMeters ?? previous.ghostRadiusMeters ?? DEFAULT_GHOST_RADIUS_METERS,
    preciseToMutualCruushes,
    preciseToMutualCrowds: normalizeCrowdPrecisionPolicies(input.preciseToMutualCrowds ?? previous.preciseToMutualCrowds),
    auditRequired: input.auditRequired ?? previous.auditRequired,
    updatedAtMs: nowMs,
    expiresAtMs: input.expiresAtMs ?? previous.expiresAtMs,
    keyVersion: getVisibilityPolicyKeyVersion(config)
  };
}

export function publicPrivacySettings(policy: VisibilityPolicyPayload) {
  return {
    baseMode: policy.baseMode,
    ghostModeEnabled: policy.baseMode === "GHOST",
    ghostRadiusMeters: policy.ghostRadiusMeters ?? DEFAULT_GHOST_RADIUS_METERS,
    ghostRadiusLabel: radiusLabelForMeters(policy.ghostRadiusMeters ?? DEFAULT_GHOST_RADIUS_METERS),
    preciseToMutualCruushes: policy.preciseToMutualCruushes,
    preciseToMutualCrowds: normalizeCrowdPrecisionPolicies(policy.preciseToMutualCrowds),
    preciseLocationVisibility: policy.preciseToMutualCruushes ? "mutual_cruushes" as const : "none" as const,
    updatedAtMs: policy.updatedAtMs
  };
}

async function loadEncryptedVisibilityPolicyRow(
  context: LocationPrivacyContext,
  subjectUserId: string
) {
  const rows = await context.db.query<EncryptedVisibilityTokenRow>(
    `select
       subject_user_id::text as subject_user_id,
       policy_version,
       policy_ciphertext,
       policy_nonce,
       policy_auth_tag,
       wrapped_policy_dek,
       policy_dek_nonce,
       policy_dek_auth_tag,
       key_version,
       updated_at_ms
     from encrypted_visibility_tokens
     where subject_user_id = $1
     limit 1`,
    [subjectUserId]
  );

  return rows?.rows?.[0] ?? null;
}

export async function loadVisibilityPolicyStrict(
  context: LocationPrivacyContext,
  subjectUserId: string
): Promise<VisibilityPolicyPayload | null> {
  const row = await loadEncryptedVisibilityPolicyRow(context, subjectUserId);

  if (!row) {
    return null;
  }

  const policyVersion = toNumber(row.policy_version);
  const updatedAtMs = toNumber(row.updated_at_ms);
  try {
    const policy = decryptWithWrappedDataKey<VisibilityPolicyPayload>({
      ciphertext: row.policy_ciphertext,
      nonce: row.policy_nonce,
      authTag: row.policy_auth_tag,
      wrappedDek: row.wrapped_policy_dek,
      dekNonce: row.policy_dek_nonce,
      dekAuthTag: row.policy_dek_auth_tag,
      aad: policyAad(subjectUserId, policyVersion, updatedAtMs),
      secret: getVisibilityPolicySecret(context.config),
      purpose: "visibility-policy",
      keyVersion: row.key_version || getVisibilityPolicyKeyVersion(context.config)
    });

    if (policy.subjectUserId !== subjectUserId) {
      return null;
    }

    return policy;
  } catch {
    return null;
  }
}

export async function loadVisibilityPolicy(context: LocationPrivacyContext, subjectUserId: string) {
  return await loadVisibilityPolicyStrict(context, subjectUserId)
    ?? buildDefaultVisibilityPolicy(context.config, subjectUserId);
}

export async function saveVisibilityPolicy(
  context: LocationPrivacyContext,
  subjectUserId: string,
  input: Partial<VisibilityPolicyPayload> & {
    ghostModeEnabled?: boolean;
    preciseLocationVisibility?: "none" | "mutual_cruushes";
  }
) {
  const currentPolicy = await loadVisibilityPolicy(context, subjectUserId);
  const policy = normalizeVisibilityPolicy(context.config, subjectUserId, input, currentPolicy);

  // Each Ghost Mode profile rotates from the moment that mode is enabled.
  // Preserve an active cycle while other privacy settings change, clear it on
  // exit, and start a fresh cycle when Ghost Mode is enabled again.
  await context.db.query(
    `insert into user_privacy_settings (user_id, ghost_mode_anchor_ms)
     values ($1, case when $2::boolean then $3::bigint else null end)
     on conflict (user_id) do update
     set ghost_mode_anchor_ms = case
           when $2::boolean is not true then null
           when user_privacy_settings.ghost_mode_anchor_ms is null then $3::bigint
           else user_privacy_settings.ghost_mode_anchor_ms
         end,
         updated_at = now()`,
    [subjectUserId, policy.baseMode === "GHOST", policy.updatedAtMs]
  );
  const encrypted = encryptWithWrappedDataKey({
    plaintext: policy,
    aad: policyAad(subjectUserId, policy.policyVersion, policy.updatedAtMs),
    config: context.config,
    secret: getVisibilityPolicySecret(context.config),
    purpose: "visibility-policy",
    keyVersion: policy.keyVersion
  });

  await context.db.query(
    `insert into encrypted_visibility_tokens (
       subject_user_id,
       policy_version,
       policy_ciphertext,
       policy_nonce,
       policy_auth_tag,
       wrapped_policy_dek,
       policy_dek_nonce,
       policy_dek_auth_tag,
       key_version,
       updated_at_ms,
       updated_at
     )
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now())
     on conflict (subject_user_id) do update
     set policy_version = excluded.policy_version,
         policy_ciphertext = excluded.policy_ciphertext,
         policy_nonce = excluded.policy_nonce,
         policy_auth_tag = excluded.policy_auth_tag,
         wrapped_policy_dek = excluded.wrapped_policy_dek,
         policy_dek_nonce = excluded.policy_dek_nonce,
         policy_dek_auth_tag = excluded.policy_dek_auth_tag,
         key_version = excluded.key_version,
         updated_at_ms = excluded.updated_at_ms,
         updated_at = now()`,
    [
      subjectUserId,
      policy.policyVersion,
      encrypted.ciphertext,
      encrypted.nonce,
      encrypted.authTag,
      encrypted.wrappedDek,
      encrypted.dekNonce,
      encrypted.dekAuthTag,
      encrypted.keyVersion,
      policy.updatedAtMs
    ]
  );

  await context.db.query(
    `update ghost_rotation_tokens
     set revoked_at_ms = $2
     where subject_user_id = $1
       and revoked_at_ms is null`,
    [subjectUserId, policy.updatedAtMs]
  );

  return policy;
}

function coarseCell(lat: number, lng: number) {
  return `${Math.floor(lat / COARSE_CELL_DEGREES)}:${Math.floor(lng / COARSE_CELL_DEGREES)}`;
}

function timeBucket(nowMs: number) {
  return Math.floor(nowMs / ROTATION_INTERVAL_MS);
}

function hmacHex(key: Buffer, value: string) {
  return createHmac("sha256", key).update(value).digest("hex");
}

export function createCoarseIndexTokens(config: AppConfig, lat: number, lng: number, nowMs = Date.now()) {
  const keyVersion = getLocationIndexKeyVersion(config);
  const key = deriveKey(getLocationIndexSecret(config), "location-index", keyVersion);
  const baseLatCell = Math.floor(lat / COARSE_CELL_DEGREES);
  const baseLngCell = Math.floor(lng / COARSE_CELL_DEGREES);
  const buckets = [timeBucket(nowMs), timeBucket(nowMs) - 1];
  const tokens = new Set<string>();

  for (const bucket of buckets) {
    for (let dLat = -COARSE_CELL_SEARCH_RADIUS; dLat <= COARSE_CELL_SEARCH_RADIUS; dLat += 1) {
      for (let dLng = -COARSE_CELL_SEARCH_RADIUS; dLng <= COARSE_CELL_SEARCH_RADIUS; dLng += 1) {
        tokens.add(hmacHex(key, `coarse-cell:${baseLatCell + dLat}:${baseLngCell + dLng}:${bucket}:discovery:${keyVersion}`));
      }
    }
  }

  return [...tokens];
}

function storeCoarseIndexTokens(config: AppConfig, lat: number, lng: number, nowMs = Date.now(), expiresAtMs = nowMs + LOCATION_TTL_MS) {
  const keyVersion = getLocationIndexKeyVersion(config);
  const key = deriveKey(getLocationIndexSecret(config), "location-index", keyVersion);
  const cell = coarseCell(lat, lng);
  const tokens = new Set<string>();
  const startBucket = timeBucket(nowMs);
  const endBucket = timeBucket(expiresAtMs);

  for (let bucket = startBucket; bucket <= endBucket; bucket += 1) {
    tokens.add(hmacHex(key, `coarse-cell:${cell}:${bucket}:discovery:${keyVersion}`));
  }

  return [...tokens];
}

export async function storeLocationEnvelope(context: LocationPrivacyContext, input: {
  subjectUserId: string;
  lat: number;
  lng: number;
  accuracyM?: number;
  source?: LocationPayload["source"];
  deviceReportedAtMs?: number;
}) {
  const nowMs = Date.now();
  const locationVersion = nowMs;
  const expiresAtMs = nowMs + LOCATION_TTL_MS;
  const keyVersion = getLocationKeyVersion(context.config);
  const payload: LocationPayload = {
    version: 1,
    subjectUserId: input.subjectUserId,
    locationVersion,
    latE7: Math.round(input.lat * 10_000_000),
    lonE7: Math.round(input.lng * 10_000_000),
    accuracyM: Math.max(0, Math.round(input.accuracyM ?? 0)),
    source: input.source ?? "MANUAL",
    deviceReportedAtMs: input.deviceReportedAtMs ?? nowMs,
    collectedAtMs: nowMs,
    expiresAtMs,
    keyVersion
  };
  const encrypted = encryptWithWrappedDataKey({
    plaintext: payload,
    aad: locationAad(input.subjectUserId, locationVersion, nowMs),
    config: context.config,
    secret: getLocationEncryptionSecret(context.config),
    purpose: "location-envelope",
    keyVersion
  });
  const coarseIndexTokens = storeCoarseIndexTokens(context.config, input.lat, input.lng, nowMs, expiresAtMs);

  await context.db.query(
    `insert into encrypted_location_envelopes (
       subject_user_id,
       location_version,
       location_ciphertext,
       location_nonce,
       location_auth_tag,
       wrapped_location_dek,
       location_dek_nonce,
       location_dek_auth_tag,
       key_version,
       coarse_index_tokens,
       collected_at_ms,
       expires_at_ms,
       updated_at
     )
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::text[], $11, $12, now())
     on conflict (subject_user_id) do update
     set location_version = excluded.location_version,
         location_ciphertext = excluded.location_ciphertext,
         location_nonce = excluded.location_nonce,
         location_auth_tag = excluded.location_auth_tag,
         wrapped_location_dek = excluded.wrapped_location_dek,
         location_dek_nonce = excluded.location_dek_nonce,
         location_dek_auth_tag = excluded.location_dek_auth_tag,
         key_version = excluded.key_version,
         coarse_index_tokens = excluded.coarse_index_tokens,
         collected_at_ms = excluded.collected_at_ms,
         expires_at_ms = excluded.expires_at_ms,
         updated_at = now()
     returning subject_user_id`,
    [
      input.subjectUserId,
      locationVersion,
      encrypted.ciphertext,
      encrypted.nonce,
      encrypted.authTag,
      encrypted.wrappedDek,
      encrypted.dekNonce,
      encrypted.dekAuthTag,
      encrypted.keyVersion,
      coarseIndexTokens,
      nowMs,
      expiresAtMs
    ]
  );

  return payload;
}

export function decryptLocationEnvelope(context: LocationPrivacyContext, row: EncryptedLocationEnvelopeRow) {
  const subjectUserId = row.subject_user_id;
  const locationVersion = toNumber(row.location_version);
  const collectedAtMs = toNumber(row.collected_at_ms);
  const payload = decryptWithWrappedDataKey<LocationPayload>({
    ciphertext: row.location_ciphertext,
    nonce: row.location_nonce,
    authTag: row.location_auth_tag,
    wrappedDek: row.wrapped_location_dek,
    dekNonce: row.location_dek_nonce,
    dekAuthTag: row.location_dek_auth_tag,
    aad: locationAad(subjectUserId, locationVersion, collectedAtMs),
    secret: getLocationEncryptionSecret(context.config),
    purpose: "location-envelope",
    keyVersion: row.key_version || getLocationKeyVersion(context.config)
  });

  if (payload.subjectUserId !== subjectUserId) {
    throw new Error("Encrypted location envelope subject mismatch.");
  }

  return payload;
}

export async function loadLocationEnvelope(context: LocationPrivacyContext, subjectUserId: string) {
  const result = await context.db.query<EncryptedLocationEnvelopeRow>(
    `select
       subject_user_id::text as subject_user_id,
       location_version,
       location_ciphertext,
       location_nonce,
       location_auth_tag,
       wrapped_location_dek,
       location_dek_nonce,
       location_dek_auth_tag,
       key_version,
       coarse_index_tokens,
       collected_at_ms,
       expires_at_ms
     from encrypted_location_envelopes
     where subject_user_id = $1
       and expires_at_ms > $2
     limit 1`,
    [subjectUserId, Date.now()]
  );
  const row = result?.rows?.[0];

  return row ? decryptLocationEnvelope(context, row) : null;
}

export async function loadLocationEnvelopes(context: LocationPrivacyContext, subjectUserIds: string[]) {
  const uniqueIds = [...new Set(subjectUserIds)];

  if (uniqueIds.length === 0) {
    return new Map<string, LocationPayload>();
  }

  const nowMs = Date.now();
  const result = await context.db.query<EncryptedLocationEnvelopeRow>(
    `select
       subject_user_id::text as subject_user_id,
       location_version,
       location_ciphertext,
       location_nonce,
       location_auth_tag,
       wrapped_location_dek,
       location_dek_nonce,
       location_dek_auth_tag,
       key_version,
       coarse_index_tokens,
       collected_at_ms,
       expires_at_ms
     from encrypted_location_envelopes
     where subject_user_id = any($1::uuid[])
       and (
         expires_at_ms > $2
         or collected_at_ms >= $3
       )`,
    [uniqueIds, nowMs, nowMs - LOCATION_DISCOVERY_WINDOW_MS]
  );

  return new Map((result?.rows ?? []).map((row) => [row.subject_user_id, decryptLocationEnvelope(context, row)]));
}

export function locationPayloadToCoordinates(location: LocationPayload) {
  return {
    lat: location.latE7 / 10_000_000,
    lng: location.lonE7 / 10_000_000
  };
}

export function fallbackGhostAnchorMs(subjectUserId: string) {
  const digest = createHash("sha256").update(`ghost-anchor:v1:${subjectUserId}`).digest();

  return digest.readUInt32BE(0) % ROTATION_INTERVAL_MS;
}

export async function loadGhostRotationSettings(context: LocationPrivacyContext, subjectUserId: string) {
  const result = await context.db.query<{
    ghost_mode_anchor_ms: string | number | null;
    ghost_pulse_enabled: boolean | null;
  }>(
    `select ghost_mode_anchor_ms, ghost_pulse_enabled
     from user_privacy_settings
     where user_id = $1
     limit 1`,
    [subjectUserId]
  );
  const row = result.rows[0];
  const anchor = row?.ghost_mode_anchor_ms;
  const parsedAnchor = typeof anchor === "number"
    ? anchor
    : typeof anchor === "string" ? Number.parseInt(anchor, 10) : Number.NaN;

  return {
    anchorMs: Number.isFinite(parsedAnchor) ? parsedAnchor : fallbackGhostAnchorMs(subjectUserId),
    pulseEnabled: row?.ghost_pulse_enabled !== false
  };
}

export async function describeGhostRotation(
  context: LocationPrivacyContext,
  subjectUserId: string,
  nowMs = Date.now()
) {
  const { anchorMs, pulseEnabled } = await loadGhostRotationSettings(context, subjectUserId);
  const rotationEpoch = currentRotationEpoch(anchorMs, nowMs);

  if (!pulseEnabled) {
    return {
      pulseEnabled,
      rotationExpiresAtMs: null,
      animationHint: "NONE" as DisplayAnimationHint
    };
  }

  return {
    pulseEnabled,
    rotationExpiresAtMs: rotationExpiresAtMs(rotationEpoch, anchorMs),
    animationHint: animationHintForEpoch(rotationEpoch, anchorMs, nowMs)
  };
}

export function currentRotationEpoch(anchorMs: number, nowMs = Date.now()) {
  return Math.floor((nowMs - anchorMs) / ROTATION_INTERVAL_MS);
}

function rotationExpiresAtMs(rotationEpoch: number, anchorMs: number) {
  return anchorMs + (rotationEpoch + 1) * ROTATION_INTERVAL_MS;
}

function animationHintForEpoch(
  rotationEpoch: number,
  anchorMs: number,
  nowMs = Date.now()
): DisplayAnimationHint {
  const remainingMs = rotationExpiresAtMs(rotationEpoch, anchorMs) - nowMs;

  if (remainingMs <= 0) {
    return "SIGNAL_LOSS";
  }

  return remainingMs <= FADE_WINDOW_MS ? "FADE_LAST_MINUTE" : "NONE";
}

async function loadOrCreateGhostRotation(context: LocationPrivacyContext, input: {
  subjectUserId: string;
  policy: VisibilityPolicyPayload;
  location: LocationPayload;
  anchorMs: number;
  nowMs?: number;
}) {
  const nowMs = input.nowMs ?? Date.now();
  const rotationEpoch = currentRotationEpoch(input.anchorMs, nowMs);
  const loadActiveRotation = async () => (await context.db.query<EncryptedGhostRotationTokenRow>(
    `select
       subject_user_id::text as subject_user_id,
       rotation_epoch,
       policy_version,
       token_ciphertext,
       token_nonce,
       token_auth_tag,
       wrapped_token_dek,
       token_dek_nonce,
       token_dek_auth_tag,
       key_version,
       expires_at_ms,
       revoked_at_ms
     from ghost_rotation_tokens
     where subject_user_id = $1
       and rotation_epoch = $2
       and policy_version = $3
       and revoked_at_ms is null
       and expires_at_ms > $4
     limit 1`,
    [input.subjectUserId, rotationEpoch, input.policy.policyVersion, nowMs]
  )).rows[0];
  const decryptRotation = (row: EncryptedGhostRotationTokenRow) =>
    decryptWithWrappedDataKey<GhostRotationPayload>({
      ciphertext: row.token_ciphertext,
      nonce: row.token_nonce,
      authTag: row.token_auth_tag,
      wrappedDek: row.wrapped_token_dek,
      dekNonce: row.token_dek_nonce,
      dekAuthTag: row.token_dek_auth_tag,
      aad: rotationAad(input.subjectUserId, rotationEpoch, input.policy.policyVersion),
      secret: getGhostDerivationSecret(context.config),
      purpose: "ghost-rotation",
      keyVersion: row.key_version || getGhostDerivationKeyVersion(context.config)
    });
  const existingRow = await loadActiveRotation();

  if (existingRow) {
    return decryptRotation(existingRow);
  }

  const keyVersion = getGhostDerivationKeyVersion(context.config);
  const payload: GhostRotationPayload = {
    version: 1,
    subjectUserId: input.subjectUserId,
    rotationEpoch,
    radiusMeters: input.policy.ghostRadiusMeters ?? DEFAULT_GHOST_RADIUS_METERS,
    derivationSalt: base64Url(randomBytes(32)),
    policyVersion: input.policy.policyVersion,
    centerLocationVersion: input.location.locationVersion,
    tokenCreatedAtMs: nowMs,
    tokenExpiresAtMs: rotationExpiresAtMs(rotationEpoch, input.anchorMs) + 15_000
  };
  const encrypted = encryptWithWrappedDataKey({
    plaintext: payload,
    aad: rotationAad(input.subjectUserId, rotationEpoch, input.policy.policyVersion),
    config: context.config,
    secret: getGhostDerivationSecret(context.config),
    purpose: "ghost-rotation",
    keyVersion
  });

  const claimed = await context.db.query<{ subject_user_id: string }>(
    `insert into ghost_rotation_tokens (
       subject_user_id,
       rotation_epoch,
       policy_version,
       token_ciphertext,
       token_nonce,
       token_auth_tag,
       wrapped_token_dek,
       token_dek_nonce,
       token_dek_auth_tag,
       key_version,
       created_at_ms,
       expires_at_ms
     )
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     on conflict (subject_user_id, rotation_epoch, policy_version) do update
     set token_ciphertext = excluded.token_ciphertext,
         token_nonce = excluded.token_nonce,
         token_auth_tag = excluded.token_auth_tag,
         wrapped_token_dek = excluded.wrapped_token_dek,
         token_dek_nonce = excluded.token_dek_nonce,
         token_dek_auth_tag = excluded.token_dek_auth_tag,
         key_version = excluded.key_version,
         created_at_ms = excluded.created_at_ms,
         expires_at_ms = excluded.expires_at_ms,
         revoked_at_ms = null
     where ghost_rotation_tokens.revoked_at_ms is not null
        or ghost_rotation_tokens.expires_at_ms <= $13
     returning subject_user_id::text as subject_user_id`,
    [
      input.subjectUserId,
      rotationEpoch,
      input.policy.policyVersion,
      encrypted.ciphertext,
      encrypted.nonce,
      encrypted.authTag,
      encrypted.wrappedDek,
      encrypted.dekNonce,
      encrypted.dekAuthTag,
      keyVersion,
      payload.tokenCreatedAtMs,
      payload.tokenExpiresAtMs,
      nowMs
    ]
  );

  if (claimed.rows[0]) {
    return payload;
  }

  const winningRotation = await loadActiveRotation();

  if (!winningRotation) {
    throw new Error("Ghost rotation could not be resolved after a concurrent update.");
  }

  return decryptRotation(winningRotation);
}

function randomFloatFromSeed(seed: Buffer) {
  const value = seed.readBigUInt64BE(0);
  return Number(value) / Number(2n ** 64n);
}

function offsetCoordinate(lat: number, lng: number, northMeters: number, eastMeters: number) {
  const latOffset = northMeters / 111_320;
  const lngScale = Math.max(0.01, Math.abs(Math.cos(lat * Math.PI / 180)));
  const lngOffset = eastMeters / (111_320 * lngScale);

  return {
    lat: Math.min(90, Math.max(-90, lat + latOffset)),
    lng: Math.min(180, Math.max(-180, lng + lngOffset))
  };
}

export function deriveGhostCoordinate(input: {
  config: AppConfig;
  subjectUserId: string;
  viewerUserId: string;
  centerLat: number;
  centerLng: number;
  rotationEpoch: number;
  derivationSalt: string;
  radiusMeters: number;
  policyVersion: number;
}) {
  const key = deriveKey(
    getGhostDerivationSecret(input.config),
    "ghost-coordinate",
    getGhostDerivationKeyVersion(input.config)
  );
  const seed = createHmac("sha256", key)
    .update([
      input.subjectUserId,
      input.viewerUserId,
      input.rotationEpoch,
      input.derivationSalt,
      input.policyVersion,
      "ghost-v1"
    ].join(":"))
    .digest();
  const u1 = randomFloatFromSeed(seed.subarray(0, 8));
  const u2 = randomFloatFromSeed(seed.subarray(8, 16));
  // Sample uniformly from an annulus instead of from the exact center. Ghost
  // Mode must never render an ungranted viewer at the subject's real pin, even
  // when the configured radius is the smallest option.
  const minimumRadiusRatioSquared = GHOST_MIN_OFFSET_RATIO ** 2;
  const radius = input.radiusMeters * Math.sqrt(
    minimumRadiusRatioSquared + (1 - minimumRadiusRatioSquared) * u1
  );
  const theta = 2 * Math.PI * u2;
  const northMeters = radius * Math.cos(theta);
  const eastMeters = radius * Math.sin(theta);

  return offsetCoordinate(input.centerLat, input.centerLng, northMeters, eastMeters);
}

export async function resolveViewerGhostCoordinate(context: LocationPrivacyContext, input: {
  subjectUserId: string;
  viewerUserId: string;
  policy: VisibilityPolicyPayload;
  location: LocationPayload;
  nowMs?: number;
  rotationSettings?: Awaited<ReturnType<typeof loadGhostRotationSettings>>;
}) {
  const nowMs = input.nowMs ?? Date.now();
  const center = locationPayloadToCoordinates(input.location);
  const { anchorMs } = input.rotationSettings ?? await loadGhostRotationSettings(context, input.subjectUserId);
  const rotation = await loadOrCreateGhostRotation(context, {
    subjectUserId: input.subjectUserId,
    policy: input.policy,
    location: input.location,
    anchorMs,
    nowMs
  });

  return {
    coordinate: deriveGhostCoordinate({
      config: context.config,
      subjectUserId: input.subjectUserId,
      viewerUserId: input.viewerUserId,
      centerLat: center.lat,
      centerLng: center.lng,
      rotationEpoch: rotation.rotationEpoch,
      derivationSalt: rotation.derivationSalt,
      radiusMeters: rotation.radiusMeters,
      policyVersion: input.policy.policyVersion
    }),
    rotationEpoch: rotation.rotationEpoch,
    radiusMeters: rotation.radiusMeters
  };
}

function displayKeyBinding(request: FastifyRequest, userId: string) {
  const token = getSessionTokenFromRequest(request);
  return token ? hashSessionToken(token) : `dev-user:${userId}`;
}

function displayKeyEpoch(nowMs = Date.now()) {
  return Math.floor(nowMs / DISPLAY_KEY_TTL_MS);
}

function displayKeyId(userId: string, epoch: number, keyVersion: string) {
  return createHash("sha256")
    .update(`display-key:${userId}:${epoch}:${keyVersion}`)
    .digest("hex")
    .slice(0, 24);
}

function deriveBrowserDisplayKey(config: AppConfig, request: FastifyRequest, userId: string, epoch = displayKeyEpoch()) {
  const keyVersion = getDisplayTokenKeyVersion(config);
  const binding = displayKeyBinding(request, userId);
  const key = createHmac("sha256", deriveKey(getDisplayTokenSecret(config), "display-session", keyVersion))
    .update(`${userId}:${binding}:${epoch}:${keyVersion}`)
    .digest();

  return {
    key,
    keyId: displayKeyId(userId, epoch, keyVersion),
    expiresAtMs: (epoch + 1) * DISPLAY_KEY_TTL_MS
  };
}

export function issueBrowserDisplayKey(config: AppConfig, request: FastifyRequest, userId: string): BrowserDisplayKey {
  const displayKey = deriveBrowserDisplayKey(config, request, userId);

  return {
    version: 1,
    keyId: displayKey.keyId,
    key: base64Url(displayKey.key),
    expiresAtMs: displayKey.expiresAtMs
  };
}

function displayTokenAad(tokenId: string, keyId: string, expiresAtMs: number) {
  return `display-location-token:v1:${tokenId}:${keyId}:${expiresAtMs}`;
}

export function encryptDisplayLocationToken(
  config: AppConfig,
  request: FastifyRequest,
  viewerUserId: string,
  payload: DisplayLocationPayload
): DisplayLocationToken {
  const currentKey = deriveBrowserDisplayKey(config, request, viewerUserId);
  const tokenId = base64Url(randomBytes(16));
  const aad = Buffer.from(displayTokenAad(tokenId, currentKey.keyId, payload.expiresAtMs), "utf8");
  const encrypted = encryptAead(currentKey.key, Buffer.from(JSON.stringify(payload), "utf8"), aad);

  return {
    version: 1,
    tokenId,
    keyId: currentKey.keyId,
    ciphertext: base64Url(Buffer.concat([
      Buffer.from(encrypted.ciphertext, "base64"),
      Buffer.from(encrypted.authTag, "base64")
    ])),
    nonce: base64Url(Buffer.from(encrypted.nonce, "base64")),
    expiresAtMs: payload.expiresAtMs,
    tokenVersion: 1
  };
}

export function decryptDisplayLocationTokenForTest(input: {
  key: string;
  token: DisplayLocationToken;
}): DisplayLocationPayload {
  const encrypted = fromBase64Url(input.token.ciphertext);
  const ciphertext = encrypted.subarray(0, encrypted.length - 16).toString("base64");
  const authTag = encrypted.subarray(encrypted.length - 16).toString("base64");

  return JSON.parse(decryptAead({
    key: fromBase64Url(input.key),
    ciphertext,
    nonce: fromBase64Url(input.token.nonce).toString("base64"),
    authTag,
    aad: Buffer.from(displayTokenAad(input.token.tokenId, input.token.keyId, input.token.expiresAtMs), "utf8")
  }).toString("utf8")) as DisplayLocationPayload;
}

export async function makeDisplayLocationToken(context: LocationPrivacyContext, request: FastifyRequest, input: {
  subjectUserId: string;
  viewerUserId: string;
  policy: VisibilityPolicyPayload;
  location: LocationPayload;
  displayMode: DisplayMode;
  relationshipGrantVersion?: number;
  forceSelfPrecise?: boolean;
}) {
  const nowMs = Date.now();
  const center = locationPayloadToCoordinates(input.location);
  let coordinate = center;
  let rotationEpoch: number | null = null;
  let animationHint: DisplayAnimationHint = "NONE";
  let accuracyDisplayM = input.location.accuracyM;

  if (input.displayMode === "GHOST" && !input.forceSelfPrecise) {
    const rotationSettings = await loadGhostRotationSettings(context, input.subjectUserId);
    const ghost = await resolveViewerGhostCoordinate(context, {
      subjectUserId: input.subjectUserId,
      viewerUserId: input.viewerUserId,
      policy: input.policy,
      location: input.location,
      nowMs,
      rotationSettings
    });
    coordinate = ghost.coordinate;
    rotationEpoch = ghost.rotationEpoch;
    animationHint = rotationSettings.pulseEnabled
      ? animationHintForEpoch(ghost.rotationEpoch, rotationSettings.anchorMs, nowMs)
      : "NONE";
    accuracyDisplayM = ghost.radiusMeters;
  }

  const payload: DisplayLocationPayload = {
    version: 1,
    subjectUserId: input.subjectUserId,
    viewerUserId: input.viewerUserId,
    displayMode: input.displayMode,
    latE7: Math.round(coordinate.lat * 10_000_000),
    lonE7: Math.round(coordinate.lng * 10_000_000),
    accuracyDisplayM,
    rotationEpoch,
    subjectPolicyVersion: input.policy.policyVersion,
    relationshipGrantVersion: input.relationshipGrantVersion ?? 0,
    expiresAtMs: nowMs + DISPLAY_TOKEN_TTL_MS,
    animationHint,
    renderNonce: base64Url(randomBytes(16))
  };

  return encryptDisplayLocationToken(context.config, request, input.viewerUserId, payload);
}

export function distanceMiles(fromLat: number, fromLng: number, toLat: number, toLng: number) {
  const earthRadiusMiles = 3958.8;
  const dLat = (toLat - fromLat) * Math.PI / 180;
  const dLng = (toLng - fromLng) * Math.PI / 180;
  const lat1 = fromLat * Math.PI / 180;
  const lat2 = toLat * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return earthRadiusMiles * c;
}

export function formatDistanceLabel(input: {
  displayMode: DisplayMode;
  viewerLat: number;
  viewerLng: number;
  targetLat: number;
  targetLng: number;
}) {
  if (input.displayMode === "GHOST") {
    return "Nearby";
  }

  return `${distanceMiles(input.viewerLat, input.viewerLng, input.targetLat, input.targetLng).toFixed(1)} mi`;
}

function privacyBlindIndex(config: AppConfig, scope: string, value: string) {
  const keyVersion = getLocationIndexKeyVersion(config);
  const key = deriveKey(getLocationIndexSecret(config), "privacy-audit-index", keyVersion);
  return createHmac("sha256", key).update(`${scope}:${value}:${keyVersion}`).digest("hex");
}

function revokeActionToken(config: AppConfig, subjectUserId: string, viewerUserId: string, permissionType: string) {
  const keyVersion = getLocationIndexKeyVersion(config);
  const token = createHmac("sha256", deriveKey(getLocationIndexSecret(config), "privacy-revoke-token", keyVersion))
    .update(`${subjectUserId}:${viewerUserId}:${permissionType}:${keyVersion}`)
    .digest("hex");

  return `revoke_v1_${token}`;
}

export function parseRevokeActionToken(config: AppConfig, token: string, candidates: Array<{
  subjectUserId: string;
  viewerUserId: string;
  permissionType: "mutual_cruush" | "mutual_crowd";
}>) {
  for (const candidate of candidates) {
    const expected = revokeActionToken(config, candidate.subjectUserId, candidate.viewerUserId, candidate.permissionType);
    const first = Buffer.from(expected);
    const second = Buffer.from(token);

    if (first.length === second.length && timingSafeEqual(first, second)) {
      return candidate;
    }
  }

  return null;
}

export function buildRevokeActionToken(config: AppConfig, input: {
  subjectUserId: string;
  viewerUserId: string;
  permissionType: "mutual_cruush" | "mutual_crowd";
}) {
  return revokeActionToken(config, input.subjectUserId, input.viewerUserId, input.permissionType);
}

export async function recordPrivacyAuditEvent(context: LocationPrivacyContext, payload: PrivacyAuditPayload) {
  const keyVersion = getLocationKeyVersion(context.config);
  const encrypted = encryptWithWrappedDataKey({
    plaintext: payload,
    aad: eventAad(payload.subjectUserId, payload.viewerUserId, payload.createdAtMs),
    config: context.config,
    secret: getVisibilityPolicySecret(context.config),
    purpose: "privacy-audit",
    keyVersion
  });
  const permissionLookupIndex = privacyBlindIndex(
    context.config,
    "permission",
    `${payload.subjectUserId}:${payload.viewerUserId}:${payload.eventType}:${payload.permissionType}`
  );

  await context.db.query(
    `insert into encrypted_privacy_audit_events (
       permission_lookup_index,
       subject_user_index,
       viewer_user_index,
       event_type_index,
       status_index,
       event_ciphertext,
       event_nonce,
       event_auth_tag,
       wrapped_event_dek,
       event_dek_nonce,
       event_dek_auth_tag,
       key_version,
       created_at_ms,
       revoked_at_ms
     )
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
     on conflict (permission_lookup_index) do update
     set status_index = excluded.status_index,
         event_ciphertext = excluded.event_ciphertext,
         event_nonce = excluded.event_nonce,
         event_auth_tag = excluded.event_auth_tag,
         wrapped_event_dek = excluded.wrapped_event_dek,
         event_dek_nonce = excluded.event_dek_nonce,
         event_dek_auth_tag = excluded.event_dek_auth_tag,
         key_version = excluded.key_version,
         created_at_ms = excluded.created_at_ms,
         revoked_at_ms = excluded.revoked_at_ms`,
    [
      permissionLookupIndex,
      privacyBlindIndex(context.config, "subject", payload.subjectUserId),
      privacyBlindIndex(context.config, "viewer", payload.viewerUserId),
      privacyBlindIndex(context.config, "event-type", payload.eventType),
      privacyBlindIndex(context.config, "status", payload.revokedAtMs ? "revoked" : "active"),
      encrypted.ciphertext,
      encrypted.nonce,
      encrypted.authTag,
      encrypted.wrappedDek,
      encrypted.dekNonce,
      encrypted.dekAuthTag,
      keyVersion,
      payload.createdAtMs,
      payload.revokedAtMs
    ]
  );
}

export async function revokePreciseLocationAccess(context: LocationPrivacyContext, input: {
  subjectUserId: string;
  viewerUserId: string;
  permissionType: "mutual_cruush" | "mutual_crowd";
  reason: string;
}) {
  const nowMs = Date.now();
  await recordPrivacyAuditEvent(context, {
    version: 1,
    subjectUserId: input.subjectUserId,
    viewerUserId: input.viewerUserId,
    eventType: "precise_location_revoke",
    permissionType: input.permissionType,
    reason: input.reason,
    createdAtMs: nowMs,
    revokedAtMs: null
  });

  return nowMs;
}

export async function isPreciseLocationRevoked(context: LocationPrivacyContext, input: {
  subjectUserId: string;
  viewerUserId: string;
  permissionType: "mutual_cruush" | "mutual_crowd";
}) {
  const permissionLookupIndex = privacyBlindIndex(
    context.config,
    "permission",
    `${input.subjectUserId}:${input.viewerUserId}:precise_location_revoke:${input.permissionType}`
  );
  const result = await context.db.query<{ exists: boolean }>(
    `select true as exists
     from encrypted_privacy_audit_events
     where permission_lookup_index = $1
       and status_index = $2
     limit 1`,
    [
      permissionLookupIndex,
      privacyBlindIndex(context.config, "status", "active")
    ]
  );

  return (result?.rows ?? []).length > 0;
}

export function decryptPrivacyAuditEvent(context: LocationPrivacyContext, row: PrivacyAuditEventRow, subjectUserId: string, viewerUserId: string) {
  return decryptWithWrappedDataKey<PrivacyAuditPayload>({
    ciphertext: row.event_ciphertext,
    nonce: row.event_nonce,
    authTag: row.event_auth_tag,
    wrappedDek: row.wrapped_event_dek,
    dekNonce: row.event_dek_nonce,
    dekAuthTag: row.event_dek_auth_tag,
    aad: eventAad(subjectUserId, viewerUserId, toNumber(row.created_at_ms)),
    secret: getVisibilityPolicySecret(context.config),
    purpose: "privacy-audit",
    keyVersion: row.key_version || getLocationKeyVersion(context.config)
  });
}
