import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes
} from "node:crypto";
import type { AppConfig } from "./config.js";
import { resolveSecretForVersion } from "./crypto-keys.js";
import type { DbClient } from "./db.js";

export type ClubEnrollmentRecordType = "membership" | "join_request";
export type ClubEnrollmentStatus = "active" | "pending" | "denied" | "revoked";
export type ClubEnrollmentRole = "owner" | "admin" | "moderator" | "member";

export type ClubEnrollmentPayload = {
  version: 1;
  type: ClubEnrollmentRecordType;
  status: ClubEnrollmentStatus;
  clubId: string;
  userId: string;
  role?: ClubEnrollmentRole;
  applicationAnswer?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type EncryptedClubEnrollmentRow = {
  id: string;
  record_lookup_index: string;
  club_index: string;
  user_index: string;
  record_type_index: string;
  status_index: string;
  record_ciphertext: string;
  record_nonce: string;
  record_auth_tag: string;
  encryption_key_version: string;
  index_key_version: string;
  created_at: string | Date;
  updated_at: string | Date;
};

export type ClubEnrollmentRecord = EncryptedClubEnrollmentRow & {
  payload: ClubEnrollmentPayload;
};

export type ClubEnrollmentContext = {
  config: AppConfig;
  db: Pick<DbClient, "query">;
};

function deriveKey(secret: string, purpose: string, version: string) {
  return createHash("sha256").update(`${purpose}:${version}:${secret}`).digest();
}

function encryptionVersion(config: AppConfig) {
  return config.CLUB_ENROLLMENT_ENCRYPTION_KEY_VERSION || "v1";
}

function indexVersion(config: AppConfig) {
  return config.CLUB_ENROLLMENT_INDEX_KEY_VERSION || "v1";
}

function encryptionSecret(config: AppConfig, storedVersion: string) {
  return resolveSecretForVersion({
    currentSecret: config.CLUB_ENROLLMENT_ENCRYPTION_KEY || config.SESSION_SECRET,
    previousSecret: config.CLUB_ENROLLMENT_ENCRYPTION_KEY_PREVIOUS,
    currentVersion: encryptionVersion(config),
    storedVersion
  });
}

function indexSecret(config: AppConfig) {
  return config.CLUB_ENROLLMENT_INDEX_KEY || config.SESSION_SECRET;
}

export function createClubEnrollmentBlindIndex(
  config: AppConfig,
  scope: string,
  value: string,
  version = indexVersion(config)
) {
  return createHmac("sha256", deriveKey(indexSecret(config), "club-enrollment-index", version))
    .update(`${scope}:${value}`)
    .digest("hex");
}

export function createClubEnrollmentUserIndex(config: AppConfig, userId: string) {
  return createClubEnrollmentBlindIndex(config, "user", userId);
}

function indexesFor(config: AppConfig, payload: ClubEnrollmentPayload) {
  const version = indexVersion(config);
  return {
    recordLookupIndex: createClubEnrollmentBlindIndex(config, "record", `${payload.type}:${payload.clubId}:${payload.userId}`, version),
    clubIndex: createClubEnrollmentBlindIndex(config, "club", payload.clubId, version),
    userIndex: createClubEnrollmentBlindIndex(config, "user", payload.userId, version),
    typeIndex: createClubEnrollmentBlindIndex(config, "type", payload.type, version),
    statusIndex: createClubEnrollmentBlindIndex(config, "status", payload.status, version),
    indexKeyVersion: version
  };
}

function encryptPayload(config: AppConfig, payload: ClubEnrollmentPayload) {
  const version = encryptionVersion(config);
  const key = deriveKey(encryptionSecret(config, version), "club-enrollment-record", version);
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(payload), "utf8"), cipher.final()]);
  return {
    recordCiphertext: ciphertext.toString("base64"),
    recordNonce: nonce.toString("base64"),
    recordAuthTag: cipher.getAuthTag().toString("base64"),
    encryptionKeyVersion: version
  };
}

export function decryptClubEnrollmentPayload(
  config: AppConfig,
  row: Pick<EncryptedClubEnrollmentRow, "record_ciphertext" | "record_nonce" | "record_auth_tag" | "encryption_key_version">
) {
  const storedVersion = row.encryption_key_version || encryptionVersion(config);
  const key = deriveKey(encryptionSecret(config, storedVersion), "club-enrollment-record", storedVersion);
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(row.record_nonce, "base64"));
  decipher.setAuthTag(Buffer.from(row.record_auth_tag, "base64"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(row.record_ciphertext, "base64")),
    decipher.final()
  ]).toString("utf8");
  return JSON.parse(plaintext) as ClubEnrollmentPayload;
}

function withPayload(config: AppConfig, row: EncryptedClubEnrollmentRow): ClubEnrollmentRecord | null {
  try {
    return { ...row, payload: decryptClubEnrollmentPayload(config, row) };
  } catch {
    return null;
  }
}

export function buildClubEnrollmentPayload(input: {
  type: ClubEnrollmentRecordType;
  status: ClubEnrollmentStatus;
  clubId: string;
  userId: string;
  role?: ClubEnrollmentRole;
  applicationAnswer?: string | null;
  createdAt?: string | Date;
  updatedAt?: string | Date;
}): ClubEnrollmentPayload {
  const now = new Date().toISOString();
  return {
    version: 1,
    type: input.type,
    status: input.status,
    clubId: input.clubId,
    userId: input.userId,
    role: input.role,
    applicationAnswer: input.applicationAnswer ?? null,
    createdAt: input.createdAt ? new Date(input.createdAt).toISOString() : now,
    updatedAt: input.updatedAt ? new Date(input.updatedAt).toISOString() : now
  };
}

export async function upsertClubEnrollment(context: ClubEnrollmentContext, payload: ClubEnrollmentPayload) {
  const indexes = indexesFor(context.config, payload);
  const encrypted = encryptPayload(context.config, payload);
  const result = await context.db.query<EncryptedClubEnrollmentRow>(
    `insert into encrypted_club_enrollments (
       record_lookup_index, club_index, user_index, record_type_index, status_index,
       record_ciphertext, record_nonce, record_auth_tag,
       encryption_key_version, index_key_version, created_at, updated_at
     ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, now())
     on conflict (record_lookup_index, index_key_version) do update
     set club_index = excluded.club_index,
         user_index = excluded.user_index,
         record_type_index = excluded.record_type_index,
         status_index = excluded.status_index,
         record_ciphertext = excluded.record_ciphertext,
         record_nonce = excluded.record_nonce,
         record_auth_tag = excluded.record_auth_tag,
         encryption_key_version = excluded.encryption_key_version,
         updated_at = now()
     returning *`,
    [
      indexes.recordLookupIndex,
      indexes.clubIndex,
      indexes.userIndex,
      indexes.typeIndex,
      indexes.statusIndex,
      encrypted.recordCiphertext,
      encrypted.recordNonce,
      encrypted.recordAuthTag,
      encrypted.encryptionKeyVersion,
      indexes.indexKeyVersion,
      payload.createdAt
    ]
  );
  const row = result.rows[0];
  return row ? withPayload(context.config, row) : null;
}

const enrollmentColumns = `
  id::text as id, record_lookup_index, club_index, user_index, record_type_index, status_index,
  record_ciphertext, record_nonce, record_auth_tag, encryption_key_version, index_key_version,
  created_at, updated_at`;

export async function findClubEnrollment(
  context: ClubEnrollmentContext,
  input: { clubId: string; userId: string; type: ClubEnrollmentRecordType; status?: ClubEnrollmentStatus }
) {
  const version = indexVersion(context.config);
  const result = await context.db.query<EncryptedClubEnrollmentRow>(
    `select ${enrollmentColumns}
     from encrypted_club_enrollments
     where record_lookup_index = $1
       and record_type_index = $2
       and status_index = $3
       and index_key_version = $4
     limit 1`,
    [
      createClubEnrollmentBlindIndex(context.config, "record", `${input.type}:${input.clubId}:${input.userId}`, version),
      createClubEnrollmentBlindIndex(context.config, "type", input.type, version),
      createClubEnrollmentBlindIndex(context.config, "status", input.status ?? (input.type === "membership" ? "active" : "pending"), version),
      version
    ]
  );
  return result.rows[0] ? withPayload(context.config, result.rows[0]) : null;
}

async function listClubEnrollments(
  context: ClubEnrollmentContext,
  filter: { scope: "club" | "user"; value: string; type: ClubEnrollmentRecordType; status: ClubEnrollmentStatus }
) {
  const version = indexVersion(context.config);
  const column = filter.scope === "club" ? "club_index" : "user_index";
  const result = await context.db.query<EncryptedClubEnrollmentRow>(
    `select ${enrollmentColumns}
     from encrypted_club_enrollments
     where ${column} = $1
       and record_type_index = $2
       and status_index = $3
       and index_key_version = $4
     order by created_at asc`,
    [
      createClubEnrollmentBlindIndex(context.config, filter.scope, filter.value, version),
      createClubEnrollmentBlindIndex(context.config, "type", filter.type, version),
      createClubEnrollmentBlindIndex(context.config, "status", filter.status, version),
      version
    ]
  );
  return result.rows.map((row) => withPayload(context.config, row)).filter((row): row is ClubEnrollmentRecord => row !== null);
}

export function listClubMemberships(context: ClubEnrollmentContext, clubId: string) {
  return listClubEnrollments(context, { scope: "club", value: clubId, type: "membership", status: "active" });
}

export function listClubJoinRequests(context: ClubEnrollmentContext, clubId: string) {
  return listClubEnrollments(context, { scope: "club", value: clubId, type: "join_request", status: "pending" });
}

export function listUserClubMemberships(context: ClubEnrollmentContext, userId: string) {
  return listClubEnrollments(context, { scope: "user", value: userId, type: "membership", status: "active" });
}

export async function deleteClubEnrollment(
  context: ClubEnrollmentContext,
  input: { clubId: string; userId: string; type: ClubEnrollmentRecordType }
) {
  const version = indexVersion(context.config);
  await context.db.query(
    `delete from encrypted_club_enrollments
     where record_lookup_index = $1 and index_key_version = $2`,
    [createClubEnrollmentBlindIndex(context.config, "record", `${input.type}:${input.clubId}:${input.userId}`, version), version]
  );
}

export async function deleteClubEnrollmentsForClub(context: ClubEnrollmentContext, clubId: string) {
  const version = indexVersion(context.config);
  await context.db.query(
    `delete from encrypted_club_enrollments where club_index = $1 and index_key_version = $2`,
    [createClubEnrollmentBlindIndex(context.config, "club", clubId, version), version]
  );
}
