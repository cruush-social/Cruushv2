import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual
} from "node:crypto";
import type { AppConfig } from "./config.js";
import { resolveSecretForVersion } from "./crypto-keys.js";
import type { DbClient } from "./db.js";

export type EncryptedRelationshipType =
  | "cruush"
  | "mutual_cruush"
  | "profile_view"
  | "dismissed_cruush"
  | "removed_cruush"
  | "block";

export type EncryptedRelationshipStatus =
  | "active"
  | "revoked"
  | "removed"
  | "dismissed"
  | "blocked";

export type EncryptedRelationshipPayload = {
  version: 1;
  type: EncryptedRelationshipType;
  status: EncryptedRelationshipStatus;
  actorUserId: string;
  targetUserId: string;
  participantUserIds: [string, string];
  createdAt: string;
  updatedAt: string;
  expiresAt?: string | null;
  revokedAt?: string | null;
  dedupeBucket?: string | null;
  targetSnapshot?: {
    name: string;
    pronouns: string;
    photo: string | null;
  } | null;
  legacyId?: string | null;
  metadata?: Record<string, unknown>;
};

export type EncryptedRelationshipRecordRow = {
  id: string;
  record_lookup_index: string;
  actor_user_index: string | null;
  target_user_index: string | null;
  ordered_pair_index: string | null;
  participant_one_index: string | null;
  participant_two_index: string | null;
  relationship_type_index: string;
  relationship_status_index: string;
  dedupe_bucket_index: string | null;
  record_ciphertext: string;
  record_nonce: string;
  record_auth_tag: string;
  encryption_key_version: string;
  index_key_version: string;
  expires_at: string | Date | null;
  created_at: string | Date;
  updated_at: string | Date;
};

export type EncryptedRelationshipRecord = EncryptedRelationshipRecordRow & {
  payload: EncryptedRelationshipPayload;
};

export type EncryptedRelationshipTokenPayload = {
  version: 1;
  relationshipRecordId: string;
  userOneId: string;
  userTwoId: string;
  purpose: string;
  expiresAt: string;
  keyVersion: string;
};

type EncryptedRelationshipTokenRow = {
  id: string;
  relationship_record_id: string;
  purpose_index: string;
  token_lookup_index: string;
  token_ciphertext: string;
  token_nonce: string;
  token_auth_tag: string;
  token_signature: string;
  token_key_version: string;
  expires_at: string | Date;
  created_at: string | Date;
  revoked_at: string | Date | null;
};

export type RelationshipStorageContext = {
  config: AppConfig;
  db: Pick<DbClient, "query">;
};

const ACTIVE_STATUS: EncryptedRelationshipStatus = "active";

function deriveKey(secret: string, purpose: string, keyVersion: string) {
  return createHash("sha256")
    .update(`${purpose}:${keyVersion}:${secret}`)
    .digest();
}

function getRelationshipEncryptionSecret(config: AppConfig, storedVersion: string, currentVersion: string) {
  return resolveSecretForVersion({
    currentSecret: config.RELATIONSHIP_ENCRYPTION_KEY || config.SESSION_SECRET,
    previousSecret: config.RELATIONSHIP_ENCRYPTION_KEY_PREVIOUS,
    currentVersion,
    storedVersion
  });
}

function getRelationshipIndexSecret(config: AppConfig) {
  return config.RELATIONSHIP_INDEX_KEY || config.SESSION_SECRET;
}

function getMatchEncryptionSecret(config: AppConfig, storedVersion: string, currentVersion: string) {
  return resolveSecretForVersion({
    currentSecret: config.MATCH_TOKEN_ENCRYPTION_KEY || config.SESSION_SECRET,
    previousSecret: config.MATCH_TOKEN_ENCRYPTION_KEY_PREVIOUS,
    currentVersion,
    storedVersion
  });
}

function getMatchSigningSecret(config: AppConfig) {
  return config.MATCH_TOKEN_SIGNING_KEY || config.SESSION_SECRET;
}

export function getRelationshipEncryptionKeyVersion(config: AppConfig) {
  return config.RELATIONSHIP_ENCRYPTION_KEY_VERSION || "v1";
}

export function getRelationshipIndexKeyVersion(config: AppConfig) {
  return config.RELATIONSHIP_INDEX_KEY_VERSION || "v1";
}

export function getMatchTokenKeyVersion(config: AppConfig) {
  return config.MATCH_TOKEN_KEY_VERSION || "v1";
}

export function getOrderedRelationshipUserIds(firstUserId: string, secondUserId: string) {
  return [firstUserId, secondUserId].sort() as [string, string];
}

export function getProfileViewDedupeBucket(now = new Date()) {
  const bucket = new Date(now);
  bucket.setMinutes(0, 0, 0);
  return bucket.toISOString();
}

export function createRelationshipBlindIndex(
  config: AppConfig,
  scope: string,
  value: string,
  keyVersion = getRelationshipIndexKeyVersion(config)
) {
  return createHmac("sha256", deriveKey(getRelationshipIndexSecret(config), "relationship-index", keyVersion))
    .update(`${scope}:${value}`)
    .digest("hex");
}

function getRecordLookupValue(payload: Pick<
  EncryptedRelationshipPayload,
  "type" | "actorUserId" | "targetUserId" | "participantUserIds" | "dedupeBucket"
>) {
  if (payload.type === "mutual_cruush") {
    const [firstUserId, secondUserId] = getOrderedRelationshipUserIds(
      payload.participantUserIds[0],
      payload.participantUserIds[1]
    );
    return `${payload.type}:${firstUserId}:${secondUserId}`;
  }

  if (payload.type === "profile_view") {
    return `${payload.type}:${payload.actorUserId}:${payload.targetUserId}:${payload.dedupeBucket ?? ""}`;
  }

  return `${payload.type}:${payload.actorUserId}:${payload.targetUserId}`;
}

function createRelationshipIndexes(config: AppConfig, payload: EncryptedRelationshipPayload) {
  const keyVersion = getRelationshipIndexKeyVersion(config);
  const [participantOneId, participantTwoId] = getOrderedRelationshipUserIds(
    payload.participantUserIds[0],
    payload.participantUserIds[1]
  );

  return {
    record_lookup_index: createRelationshipBlindIndex(config, "record", getRecordLookupValue(payload), keyVersion),
    actor_user_index: createRelationshipBlindIndex(config, "actor-user", payload.actorUserId, keyVersion),
    target_user_index: createRelationshipBlindIndex(config, "target-user", payload.targetUserId, keyVersion),
    ordered_pair_index: createRelationshipBlindIndex(
      config,
      "ordered-pair",
      `${participantOneId}:${participantTwoId}`,
      keyVersion
    ),
    participant_one_index: createRelationshipBlindIndex(config, "participant", participantOneId, keyVersion),
    participant_two_index: createRelationshipBlindIndex(config, "participant", participantTwoId, keyVersion),
    relationship_type_index: createRelationshipBlindIndex(config, "relationship-type", payload.type, keyVersion),
    relationship_status_index: createRelationshipBlindIndex(config, "relationship-status", payload.status, keyVersion),
    dedupe_bucket_index: payload.dedupeBucket
      ? createRelationshipBlindIndex(
          config,
          "dedupe-bucket",
          `${payload.type}:${payload.actorUserId}:${payload.targetUserId}:${payload.dedupeBucket}`,
          keyVersion
        )
      : null,
    index_key_version: keyVersion
  };
}

function encryptRelationshipPayload(config: AppConfig, payload: EncryptedRelationshipPayload) {
  const keyVersion = getRelationshipEncryptionKeyVersion(config);
  const encryptionKey = deriveKey(
    getRelationshipEncryptionSecret(config, keyVersion, keyVersion),
    "relationship-record",
    keyVersion
  );
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey, nonce);
  const plaintext = JSON.stringify(payload);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final()
  ]);

  return {
    record_ciphertext: ciphertext.toString("base64"),
    record_nonce: nonce.toString("base64"),
    record_auth_tag: cipher.getAuthTag().toString("base64"),
    encryption_key_version: keyVersion
  };
}

export function decryptRelationshipPayload(
  config: AppConfig,
  row: Pick<
    EncryptedRelationshipRecordRow,
    "record_ciphertext" | "record_nonce" | "record_auth_tag" | "encryption_key_version"
  >
): EncryptedRelationshipPayload {
  const encryptionKey = deriveKey(
    getRelationshipEncryptionSecret(
      config,
      row.encryption_key_version || getRelationshipEncryptionKeyVersion(config),
      getRelationshipEncryptionKeyVersion(config)
    ),
    "relationship-record",
    row.encryption_key_version || getRelationshipEncryptionKeyVersion(config)
  );
  const decipher = createDecipheriv(
    "aes-256-gcm",
    encryptionKey,
    Buffer.from(row.record_nonce, "base64")
  );
  decipher.setAuthTag(Buffer.from(row.record_auth_tag, "base64"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(row.record_ciphertext, "base64")),
    decipher.final()
  ]).toString("utf8");

  return JSON.parse(plaintext) as EncryptedRelationshipPayload;
}

function withPayload(config: AppConfig, row: EncryptedRelationshipRecordRow): EncryptedRelationshipRecord {
  return {
    ...row,
    payload: decryptRelationshipPayload(config, row)
  };
}

function withPayloadOrNull(config: AppConfig, row: EncryptedRelationshipRecordRow) {
  try {
    return withPayload(config, row);
  } catch {
    return null;
  }
}

function isEncryptedRelationshipRecordRow(row: EncryptedRelationshipRecordRow | undefined | null) {
  return Boolean(row?.record_ciphertext && row.record_nonce && row.record_auth_tag && row.encryption_key_version);
}

function relationshipRecordRowFromUpsertParams(
  id: string,
  params: unknown[]
): EncryptedRelationshipRecordRow {
  return {
    id,
    record_lookup_index: String(params[0]),
    actor_user_index: params[1] ? String(params[1]) : null,
    target_user_index: params[2] ? String(params[2]) : null,
    ordered_pair_index: params[3] ? String(params[3]) : null,
    participant_one_index: params[4] ? String(params[4]) : null,
    participant_two_index: params[5] ? String(params[5]) : null,
    relationship_type_index: String(params[6]),
    relationship_status_index: String(params[7]),
    dedupe_bucket_index: params[8] ? String(params[8]) : null,
    record_ciphertext: String(params[9]),
    record_nonce: String(params[10]),
    record_auth_tag: String(params[11]),
    encryption_key_version: String(params[12]),
    index_key_version: String(params[13]),
    expires_at: params[14] as string | Date | null,
    created_at: params[15] as string | Date,
    updated_at: new Date().toISOString()
  };
}

export function buildEncryptedRelationshipPayload(input: {
  type: EncryptedRelationshipType;
  status?: EncryptedRelationshipStatus;
  actorUserId: string;
  targetUserId: string;
  createdAt?: Date | string;
  updatedAt?: Date | string;
  expiresAt?: Date | string | null;
  revokedAt?: Date | string | null;
  dedupeBucket?: string | null;
  targetSnapshot?: EncryptedRelationshipPayload["targetSnapshot"];
  legacyId?: string | null;
  metadata?: Record<string, unknown>;
}): EncryptedRelationshipPayload {
  const now = new Date().toISOString();
  const createdAt = input.createdAt
    ? new Date(input.createdAt).toISOString()
    : now;
  const updatedAt = input.updatedAt
    ? new Date(input.updatedAt).toISOString()
    : createdAt;

  return {
    version: 1,
    type: input.type,
    status: input.status ?? ACTIVE_STATUS,
    actorUserId: input.actorUserId,
    targetUserId: input.targetUserId,
    participantUserIds: getOrderedRelationshipUserIds(input.actorUserId, input.targetUserId),
    createdAt,
    updatedAt,
    expiresAt: input.expiresAt ? new Date(input.expiresAt).toISOString() : null,
    revokedAt: input.revokedAt ? new Date(input.revokedAt).toISOString() : null,
    dedupeBucket: input.dedupeBucket ?? null,
    targetSnapshot: input.targetSnapshot ?? null,
    legacyId: input.legacyId ?? null,
    metadata: input.metadata
  };
}

export async function upsertEncryptedRelationshipRecord(
  context: RelationshipStorageContext,
  payload: EncryptedRelationshipPayload
) {
  const indexes = createRelationshipIndexes(context.config, payload);
  const encrypted = encryptRelationshipPayload(context.config, payload);
  const result = await context.db.query<EncryptedRelationshipRecordRow>(
    `insert into encrypted_relationship_records (
       record_lookup_index,
       actor_user_index,
       target_user_index,
       ordered_pair_index,
       participant_one_index,
       participant_two_index,
       relationship_type_index,
       relationship_status_index,
       dedupe_bucket_index,
       record_ciphertext,
       record_nonce,
       record_auth_tag,
       encryption_key_version,
       index_key_version,
       expires_at,
       created_at,
       updated_at
     )
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, now())
     on conflict (record_lookup_index, index_key_version) do update
     set actor_user_index = excluded.actor_user_index,
         target_user_index = excluded.target_user_index,
         ordered_pair_index = excluded.ordered_pair_index,
         participant_one_index = excluded.participant_one_index,
         participant_two_index = excluded.participant_two_index,
         relationship_type_index = excluded.relationship_type_index,
         relationship_status_index = excluded.relationship_status_index,
         dedupe_bucket_index = excluded.dedupe_bucket_index,
         record_ciphertext = excluded.record_ciphertext,
         record_nonce = excluded.record_nonce,
         record_auth_tag = excluded.record_auth_tag,
         encryption_key_version = excluded.encryption_key_version,
         expires_at = excluded.expires_at,
         created_at = excluded.created_at,
         updated_at = now()
     returning
       id::text as id,
       record_lookup_index,
       actor_user_index,
       target_user_index,
       ordered_pair_index,
       participant_one_index,
       participant_two_index,
       relationship_type_index,
       relationship_status_index,
       dedupe_bucket_index,
       record_ciphertext,
       record_nonce,
       record_auth_tag,
       encryption_key_version,
       index_key_version,
       expires_at,
       created_at,
       updated_at`,
    [
      indexes.record_lookup_index,
      indexes.actor_user_index,
      indexes.target_user_index,
      indexes.ordered_pair_index,
      indexes.participant_one_index,
      indexes.participant_two_index,
      indexes.relationship_type_index,
      indexes.relationship_status_index,
      indexes.dedupe_bucket_index,
      encrypted.record_ciphertext,
      encrypted.record_nonce,
      encrypted.record_auth_tag,
      encrypted.encryption_key_version,
      indexes.index_key_version,
      payload.expiresAt,
      payload.createdAt
    ]
  );

  const row = result?.rows?.[0];

  if (isEncryptedRelationshipRecordRow(row)) {
    return withPayload(context.config, row);
  }

  if (row?.id) {
    return withPayload(context.config, relationshipRecordRowFromUpsertParams(row.id, [
      indexes.record_lookup_index,
      indexes.actor_user_index,
      indexes.target_user_index,
      indexes.ordered_pair_index,
      indexes.participant_one_index,
      indexes.participant_two_index,
      indexes.relationship_type_index,
      indexes.relationship_status_index,
      indexes.dedupe_bucket_index,
      encrypted.record_ciphertext,
      encrypted.record_nonce,
      encrypted.record_auth_tag,
      encrypted.encryption_key_version,
      indexes.index_key_version,
      payload.expiresAt,
      payload.createdAt
    ]));
  }

  return null;
}

function activeTypeStatusIndexes(config: AppConfig, type: EncryptedRelationshipType, status = ACTIVE_STATUS) {
  const keyVersion = getRelationshipIndexKeyVersion(config);

  return {
    typeIndex: createRelationshipBlindIndex(config, "relationship-type", type, keyVersion),
    statusIndex: createRelationshipBlindIndex(config, "relationship-status", status, keyVersion),
    keyVersion
  };
}

export async function findEncryptedRelationshipRecord(
  context: RelationshipStorageContext,
  input: {
    type: EncryptedRelationshipType;
    actorUserId: string;
    targetUserId: string;
    status?: EncryptedRelationshipStatus;
    dedupeBucket?: string | null;
  }
) {
  const payload = buildEncryptedRelationshipPayload({
    type: input.type,
    status: input.status ?? ACTIVE_STATUS,
    actorUserId: input.actorUserId,
    targetUserId: input.targetUserId,
    dedupeBucket: input.dedupeBucket ?? null
  });
  const indexes = createRelationshipIndexes(context.config, payload);
  const statusIndex = createRelationshipBlindIndex(
    context.config,
    "relationship-status",
    input.status ?? ACTIVE_STATUS,
    indexes.index_key_version
  );
  const result = await context.db.query<EncryptedRelationshipRecordRow>(
    `select
       id::text as id,
       record_lookup_index,
       actor_user_index,
       target_user_index,
       ordered_pair_index,
       participant_one_index,
       participant_two_index,
       relationship_type_index,
       relationship_status_index,
       dedupe_bucket_index,
       record_ciphertext,
       record_nonce,
       record_auth_tag,
       encryption_key_version,
       index_key_version,
       expires_at,
       created_at,
       updated_at
     from encrypted_relationship_records
     where record_lookup_index = $1
       and relationship_status_index = $2
       and index_key_version = $3
     limit 1`,
    [indexes.record_lookup_index, statusIndex, indexes.index_key_version]
  );

  const row = result?.rows?.[0];

  return isEncryptedRelationshipRecordRow(row) ? withPayloadOrNull(context.config, row) : null;
}

export async function listEncryptedRelationshipRecordsByActor(
  context: RelationshipStorageContext,
  input: {
    actorUserId: string;
    type: EncryptedRelationshipType;
    status?: EncryptedRelationshipStatus;
    limit?: number;
  }
) {
  const { typeIndex, statusIndex, keyVersion } = activeTypeStatusIndexes(context.config, input.type, input.status);
  const actorIndex = createRelationshipBlindIndex(context.config, "actor-user", input.actorUserId, keyVersion);
  const result = await context.db.query<EncryptedRelationshipRecordRow>(
    `select
       id::text as id,
       record_lookup_index,
       actor_user_index,
       target_user_index,
       ordered_pair_index,
       participant_one_index,
       participant_two_index,
       relationship_type_index,
       relationship_status_index,
       dedupe_bucket_index,
       record_ciphertext,
       record_nonce,
       record_auth_tag,
       encryption_key_version,
       index_key_version,
       expires_at,
       created_at,
       updated_at
     from encrypted_relationship_records
     where actor_user_index = $1
       and relationship_type_index = $2
       and relationship_status_index = $3
       and index_key_version = $4
     order by created_at desc
     limit $5`,
    [actorIndex, typeIndex, statusIndex, keyVersion, input.limit ?? 500]
  );

  return (result?.rows ?? [])
    .filter(isEncryptedRelationshipRecordRow)
    .map((row) => withPayloadOrNull(context.config, row))
    .filter((record): record is EncryptedRelationshipRecord => record !== null);
}

export async function listEncryptedRelationshipRecordsByTarget(
  context: RelationshipStorageContext,
  input: {
    targetUserId: string;
    type: EncryptedRelationshipType;
    status?: EncryptedRelationshipStatus;
    limit?: number;
  }
) {
  const { typeIndex, statusIndex, keyVersion } = activeTypeStatusIndexes(context.config, input.type, input.status);
  const targetIndex = createRelationshipBlindIndex(context.config, "target-user", input.targetUserId, keyVersion);
  const result = await context.db.query<EncryptedRelationshipRecordRow>(
    `select
       id::text as id,
       record_lookup_index,
       actor_user_index,
       target_user_index,
       ordered_pair_index,
       participant_one_index,
       participant_two_index,
       relationship_type_index,
       relationship_status_index,
       dedupe_bucket_index,
       record_ciphertext,
       record_nonce,
       record_auth_tag,
       encryption_key_version,
       index_key_version,
       expires_at,
       created_at,
       updated_at
     from encrypted_relationship_records
     where target_user_index = $1
       and relationship_type_index = $2
       and relationship_status_index = $3
       and index_key_version = $4
     order by created_at desc
     limit $5`,
    [targetIndex, typeIndex, statusIndex, keyVersion, input.limit ?? 500]
  );

  return (result?.rows ?? [])
    .filter(isEncryptedRelationshipRecordRow)
    .map((row) => withPayloadOrNull(context.config, row))
    .filter((record): record is EncryptedRelationshipRecord => record !== null);
}

export async function listEncryptedRelationshipRecordsByParticipant(
  context: RelationshipStorageContext,
  input: {
    participantUserId: string;
    type: EncryptedRelationshipType;
    status?: EncryptedRelationshipStatus;
    limit?: number;
  }
) {
  const { typeIndex, statusIndex, keyVersion } = activeTypeStatusIndexes(context.config, input.type, input.status);
  const participantIndex = createRelationshipBlindIndex(context.config, "participant", input.participantUserId, keyVersion);
  const result = await context.db.query<EncryptedRelationshipRecordRow>(
    `select
       id::text as id,
       record_lookup_index,
       actor_user_index,
       target_user_index,
       ordered_pair_index,
       participant_one_index,
       participant_two_index,
       relationship_type_index,
       relationship_status_index,
       dedupe_bucket_index,
       record_ciphertext,
       record_nonce,
       record_auth_tag,
       encryption_key_version,
       index_key_version,
       expires_at,
       created_at,
       updated_at
     from encrypted_relationship_records
     where (participant_one_index = $1 or participant_two_index = $1)
       and relationship_type_index = $2
       and relationship_status_index = $3
       and index_key_version = $4
     order by created_at desc
     limit $5`,
    [participantIndex, typeIndex, statusIndex, keyVersion, input.limit ?? 500]
  );

  return (result?.rows ?? [])
    .filter(isEncryptedRelationshipRecordRow)
    .map((row) => withPayloadOrNull(context.config, row))
    .filter((record): record is EncryptedRelationshipRecord => record !== null);
}

export async function updateEncryptedRelationshipRecordStatus(
  context: RelationshipStorageContext,
  record: EncryptedRelationshipRecord,
  nextStatus: EncryptedRelationshipStatus,
  options: {
    revokedAt?: Date | string | null;
  } = {}
) {
  const payload: EncryptedRelationshipPayload = {
    ...record.payload,
    status: nextStatus,
    revokedAt: options.revokedAt ? new Date(options.revokedAt).toISOString() : record.payload.revokedAt,
    updatedAt: new Date().toISOString()
  };
  const indexes = createRelationshipIndexes(context.config, payload);
  const encrypted = encryptRelationshipPayload(context.config, payload);
  const result = await context.db.query<EncryptedRelationshipRecordRow>(
    `update encrypted_relationship_records
     set relationship_status_index = $2,
         record_ciphertext = $3,
         record_nonce = $4,
         record_auth_tag = $5,
         encryption_key_version = $6,
         updated_at = now()
     where id = $1
     returning
       id::text as id,
       record_lookup_index,
       actor_user_index,
       target_user_index,
       ordered_pair_index,
       participant_one_index,
       participant_two_index,
       relationship_type_index,
       relationship_status_index,
       dedupe_bucket_index,
       record_ciphertext,
       record_nonce,
       record_auth_tag,
       encryption_key_version,
       index_key_version,
       expires_at,
       created_at,
       updated_at`,
    [
      record.id,
      indexes.relationship_status_index,
      encrypted.record_ciphertext,
      encrypted.record_nonce,
      encrypted.record_auth_tag,
      encrypted.encryption_key_version
    ]
  );

  const row = result?.rows?.[0];

  return isEncryptedRelationshipRecordRow(row) ? withPayload(context.config, row) : null;
}

function encryptMatchTokenPayload(config: AppConfig, payload: EncryptedRelationshipTokenPayload) {
  const keyVersion = getMatchTokenKeyVersion(config);
  const encryptionKey = deriveKey(
    getMatchEncryptionSecret(config, keyVersion, keyVersion),
    "cruush-match-token-encryption",
    keyVersion
  );
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey, nonce);
  const plaintext = JSON.stringify(payload);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final()
  ]);

  return {
    token_ciphertext: ciphertext.toString("base64"),
    token_nonce: nonce.toString("base64"),
    token_auth_tag: cipher.getAuthTag().toString("base64"),
    token_key_version: keyVersion
  };
}

function decryptMatchTokenPayload(config: AppConfig, row: EncryptedRelationshipTokenRow) {
  const encryptionKey = deriveKey(
    getMatchEncryptionSecret(
      config,
      row.token_key_version || getMatchTokenKeyVersion(config),
      getMatchTokenKeyVersion(config)
    ),
    "cruush-match-token-encryption",
    row.token_key_version || getMatchTokenKeyVersion(config)
  );
  const decipher = createDecipheriv(
    "aes-256-gcm",
    encryptionKey,
    Buffer.from(row.token_nonce, "base64")
  );
  decipher.setAuthTag(Buffer.from(row.token_auth_tag, "base64"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(row.token_ciphertext, "base64")),
    decipher.final()
  ]).toString("utf8");

  return JSON.parse(plaintext) as EncryptedRelationshipTokenPayload;
}

function createTokenSignature(config: AppConfig, row: {
  relationshipRecordId: string;
  purposeIndex: string;
  expiresAt: string;
  tokenCiphertext: string;
  tokenNonce: string;
  tokenAuthTag: string;
  tokenKeyVersion: string;
}) {
  const signingKey = deriveKey(getMatchSigningSecret(config), "cruush-match-token-signing", row.tokenKeyVersion);
  const signaturePayload = [
    row.tokenKeyVersion,
    row.relationshipRecordId,
    row.purposeIndex,
    row.expiresAt,
    row.tokenNonce,
    row.tokenAuthTag,
    row.tokenCiphertext
  ].join(".");

  return createHmac("sha256", signingKey).update(signaturePayload).digest("hex");
}

function signaturesEqual(first: string, second: string) {
  const firstBuffer = Buffer.from(first, "hex");
  const secondBuffer = Buffer.from(second, "hex");

  return firstBuffer.length === secondBuffer.length && timingSafeEqual(firstBuffer, secondBuffer);
}

export async function issueEncryptedRelationshipToken(
  context: RelationshipStorageContext,
  input: {
    relationshipRecordId: string;
    userOneId: string;
    userTwoId: string;
    purpose: string;
    expiresAt: Date;
  }
) {
  const [userOneId, userTwoId] = getOrderedRelationshipUserIds(input.userOneId, input.userTwoId);
  const payload: EncryptedRelationshipTokenPayload = {
    version: 1,
    relationshipRecordId: input.relationshipRecordId,
    userOneId,
    userTwoId,
    purpose: input.purpose,
    expiresAt: input.expiresAt.toISOString(),
    keyVersion: getMatchTokenKeyVersion(context.config)
  };
  const encrypted = encryptMatchTokenPayload(context.config, payload);
  const indexVersion = getRelationshipIndexKeyVersion(context.config);
  const purposeIndex = createRelationshipBlindIndex(context.config, "match-token-purpose", input.purpose, indexVersion);
  const tokenLookupIndex = createRelationshipBlindIndex(
    context.config,
    "match-token",
    `${input.relationshipRecordId}:${input.purpose}:${input.expiresAt.toISOString()}:${randomBytes(16).toString("hex")}`,
    indexVersion
  );
  const signature = createTokenSignature(context.config, {
    relationshipRecordId: input.relationshipRecordId,
    purposeIndex,
    expiresAt: input.expiresAt.toISOString(),
    tokenCiphertext: encrypted.token_ciphertext,
    tokenNonce: encrypted.token_nonce,
    tokenAuthTag: encrypted.token_auth_tag,
    tokenKeyVersion: encrypted.token_key_version
  });

  await context.db.query(
    `insert into encrypted_relationship_tokens (
       relationship_record_id,
       purpose_index,
       token_lookup_index,
       token_ciphertext,
       token_nonce,
       token_auth_tag,
       token_signature,
       token_key_version,
       expires_at
     )
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      input.relationshipRecordId,
      purposeIndex,
      tokenLookupIndex,
      encrypted.token_ciphertext,
      encrypted.token_nonce,
      encrypted.token_auth_tag,
      signature,
      encrypted.token_key_version,
      input.expiresAt.toISOString()
    ]
  );

  return payload;
}

export function verifyEncryptedRelationshipToken(
  config: AppConfig,
  row: EncryptedRelationshipTokenRow
) {
  const expectedSignature = createTokenSignature(config, {
    relationshipRecordId: row.relationship_record_id,
    purposeIndex: row.purpose_index,
    expiresAt: new Date(row.expires_at).toISOString(),
    tokenCiphertext: row.token_ciphertext,
    tokenNonce: row.token_nonce,
    tokenAuthTag: row.token_auth_tag,
    tokenKeyVersion: row.token_key_version
  });

  if (!signaturesEqual(expectedSignature, row.token_signature)) {
    return null;
  }

  try {
    return decryptMatchTokenPayload(config, row);
  } catch {
    return null;
  }
}

export async function hasActiveEncryptedRelationshipToken(
  context: RelationshipStorageContext,
  input: {
    relationshipRecordId: string;
    userOneId: string;
    userTwoId: string;
    purpose: string;
  }
) {
  const keyVersion = getRelationshipIndexKeyVersion(context.config);
  const purposeIndex = createRelationshipBlindIndex(context.config, "match-token-purpose", input.purpose, keyVersion);
  const result = await context.db.query<EncryptedRelationshipTokenRow>(
    `select
       id::text as id,
       relationship_record_id::text as relationship_record_id,
       purpose_index,
       token_lookup_index,
       token_ciphertext,
       token_nonce,
       token_auth_tag,
       token_signature,
       token_key_version,
       expires_at,
       created_at,
       revoked_at
     from encrypted_relationship_tokens
     where relationship_record_id = $1
       and purpose_index = $2
       and revoked_at is null
       and expires_at > now()
     order by expires_at desc`,
    [input.relationshipRecordId, purposeIndex]
  );
  const [userOneId, userTwoId] = getOrderedRelationshipUserIds(input.userOneId, input.userTwoId);

  return (result?.rows ?? []).some((row) => {
    if (row.revoked_at || new Date(row.expires_at).getTime() <= Date.now()) {
      return false;
    }

    const payload = verifyEncryptedRelationshipToken(context.config, row);

    return payload?.relationshipRecordId === input.relationshipRecordId &&
      payload.userOneId === userOneId &&
      payload.userTwoId === userTwoId &&
      payload.purpose === input.purpose &&
      new Date(payload.expiresAt).getTime() > Date.now();
  });
}

export async function revokeEncryptedRelationshipTokens(
  context: RelationshipStorageContext,
  relationshipRecordId: string
) {
  await context.db.query(
    `update encrypted_relationship_tokens
     set revoked_at = now()
     where relationship_record_id = $1
       and revoked_at is null`,
    [relationshipRecordId]
  );
}
