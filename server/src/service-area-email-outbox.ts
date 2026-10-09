import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "node:crypto";
import type { DbClient } from "./db.js";
import { deriveKey, resolveSecretForVersion } from "./crypto-keys.js";
import type { OosStateCryptoConfig } from "./oos-state-crypto.js";

export type ServiceAreaEmailKind = "outside_entry" | "first_coc" | "service_return";
export type ServiceAreaEmailPayload = {
  kind: ServiceAreaEmailKind;
  priorOutsideEventId: string | null;
  providerIdempotencyKey: string;
  emailTo: string | null;
  providerMessageId: string | null;
};
export type EncryptedServiceAreaEmailPayload = {
  payload_ciphertext: string;
  payload_nonce: string;
  payload_auth_tag: string;
  wrapped_payload_dek: string;
  payload_dek_nonce: string;
  payload_dek_auth_tag: string;
  payload_key_version: string;
};
export type ServiceAreaEmailOutboxRow = EncryptedServiceAreaEmailPayload & {
  event_id: string;
  user_id: string;
  email_started_at: string | Date | null;
  email_sent_at?: string | Date | null;
};

const PAYLOAD_BYTES = 2048;
const KINDS: readonly string[] = ["outside_entry", "first_coc", "service_return"];

function currentVersion(config: OosStateCryptoConfig) {
  return config.LOCATION_ENCRYPTION_KEY_VERSION || "v1";
}

function secret(config: OosStateCryptoConfig, version: string) {
  return resolveSecretForVersion({
    currentSecret: config.LOCATION_ENCRYPTION_KEY || config.SESSION_SECRET,
    previousSecret: config.LOCATION_ENCRYPTION_KEY_PREVIOUS,
    currentVersion: currentVersion(config), storedVersion: version
  });
}

function associatedData(userId: string, eventId: string, version: string) {
  return Buffer.from(JSON.stringify(["service-area-email-outbox", 1, userId, eventId, version]));
}

function seal(key: Buffer, plaintext: Buffer, aad: Buffer) {
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  cipher.setAAD(aad);
  return {
    ciphertext: Buffer.concat([cipher.update(plaintext), cipher.final()]).toString("base64"),
    nonce: nonce.toString("base64"), tag: cipher.getAuthTag().toString("base64")
  };
}

function open(key: Buffer, ciphertext: string, nonce: string, tag: string, aad: Buffer) {
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(nonce, "base64"));
  decipher.setAAD(aad);
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64")), decipher.final()]);
}

function validate(payload: ServiceAreaEmailPayload) {
  return KINDS.includes(payload.kind)
    && (payload.priorOutsideEventId === null || (typeof payload.priorOutsideEventId === "string" && payload.priorOutsideEventId.length <= 64))
    && (payload.kind === "service_return") === (payload.priorOutsideEventId !== null)
    && typeof payload.providerIdempotencyKey === "string" && payload.providerIdempotencyKey.length > 0
    && payload.providerIdempotencyKey.length <= 256
    && (payload.emailTo === null || (typeof payload.emailTo === "string" && payload.emailTo.length > 0 && payload.emailTo.length <= 320))
    && (payload.providerMessageId === null || (typeof payload.providerMessageId === "string" && payload.providerMessageId.length <= 512));
}

export function encryptServiceAreaEmailPayload(
  config: OosStateCryptoConfig, userId: string, eventId: string, payload: ServiceAreaEmailPayload
): EncryptedServiceAreaEmailPayload {
  if (!validate(payload)) throw new Error("Invalid service-area email payload.");
  const payload_key_version = currentVersion(config);
  const aad = associatedData(userId, eventId, payload_key_version);
  const dataKey = randomBytes(32);
  const serialized = Buffer.from(JSON.stringify({ version: 1, userId, eventId, ...payload }), "utf8");
  if (serialized.length > PAYLOAD_BYTES) throw new Error("Invalid service-area email payload.");
  const padded = Buffer.alloc(PAYLOAD_BYTES, 0x20);
  serialized.copy(padded);
  const encrypted = seal(dataKey, padded, aad);
  const wrapped = seal(deriveKey(secret(config, payload_key_version), "service-area-email-outbox-wrap", payload_key_version), dataKey, aad);
  return {
    payload_ciphertext: encrypted.ciphertext, payload_nonce: encrypted.nonce,
    payload_auth_tag: encrypted.tag, wrapped_payload_dek: wrapped.ciphertext,
    payload_dek_nonce: wrapped.nonce, payload_dek_auth_tag: wrapped.tag, payload_key_version
  };
}

export function decryptServiceAreaEmailPayload(
  config: OosStateCryptoConfig, row: ServiceAreaEmailOutboxRow
): ServiceAreaEmailPayload {
  const version = row.payload_key_version;
  if (!version) throw new Error("Service-area email payload unavailable.");
  const aad = associatedData(row.user_id, row.event_id, version);
  const dataKey = open(deriveKey(secret(config, version), "service-area-email-outbox-wrap", version),
    row.wrapped_payload_dek, row.payload_dek_nonce, row.payload_dek_auth_tag, aad);
  const plaintext = open(dataKey, row.payload_ciphertext, row.payload_nonce, row.payload_auth_tag, aad);
  if (plaintext.length !== PAYLOAD_BYTES) throw new Error("Service-area email payload unavailable.");
  const raw: unknown = JSON.parse(plaintext.toString("utf8"));
  if (!raw || typeof raw !== "object") throw new Error("Service-area email payload unavailable.");
  const data = raw as Record<string, unknown>;
  const payload = {
    kind: data.kind, priorOutsideEventId: data.priorOutsideEventId,
    providerIdempotencyKey: data.providerIdempotencyKey,
    emailTo: data.emailTo, providerMessageId: data.providerMessageId
  } as ServiceAreaEmailPayload;
  if (data.version !== 1 || data.userId !== row.user_id || data.eventId !== row.event_id || !validate(payload)) {
    throw new Error("Service-area email payload unavailable.");
  }
  return payload;
}

/** Stable only while the configured location-encryption key version remains available. Do not rotate it in this release. */
export function serviceAreaEmailDedupeToken(
  config: OosStateCryptoConfig, userId: string, kind: ServiceAreaEmailKind, identity: string
) {
  const version = currentVersion(config);
  return createHmac("sha256", deriveKey(secret(config, version), "service-area-email-outbox-dedupe", version))
    .update(JSON.stringify(["service-area-email-dedupe", 1, userId, kind, identity]))
    .digest("hex");
}

export async function queueServiceAreaEmail(
  db: DbClient, config: OosStateCryptoConfig,
  input: { eventId: string; userId: string; kind: ServiceAreaEmailKind; priorOutsideEventId?: string | null; providerIdempotencyKey: string }
) {
  const priorOutsideEventId = input.priorOutsideEventId ?? null;
  const identity = input.kind === "first_coc" ? input.userId
    : input.kind === "service_return" ? priorOutsideEventId! : input.eventId;
  // Historical rows may carry a token derived with the previous key version.
  // Compare authenticated payloads before inserting so rotation cannot create
  // a second first-CoC or return event. A missing old key fails closed.
  const previousRows = await db.query<ServiceAreaEmailOutboxRow>(
    `select event_id::text, user_id::text, payload_ciphertext, payload_nonce, payload_auth_tag,
            wrapped_payload_dek, payload_dek_nonce, payload_dek_auth_tag, payload_key_version,
            email_started_at from service_area_email_outbox where user_id = $1`, [input.userId]
  );
  for (const row of previousRows.rows) {
    const prior = decryptServiceAreaEmailPayload(config, row);
    const priorIdentity = prior.kind === "first_coc" ? input.userId
      : prior.kind === "service_return" ? prior.priorOutsideEventId : row.event_id;
    if (prior.kind === input.kind && priorIdentity === identity) return;
  }
  const dedupe = serviceAreaEmailDedupeToken(config, input.userId, input.kind, identity);
  const encrypted = encryptServiceAreaEmailPayload(config, input.userId, input.eventId, {
    kind: input.kind, priorOutsideEventId,
    providerIdempotencyKey: input.providerIdempotencyKey,
    emailTo: null, providerMessageId: null
  });
  await db.query(
    `insert into service_area_email_outbox (
       event_id, user_id, dedupe_token, payload_ciphertext, payload_nonce, payload_auth_tag,
       wrapped_payload_dek, payload_dek_nonce, payload_dek_auth_tag, payload_key_version
     ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     on conflict (dedupe_token) do nothing`,
    [input.eventId, input.userId, dedupe, encrypted.payload_ciphertext, encrypted.payload_nonce,
      encrypted.payload_auth_tag, encrypted.wrapped_payload_dek, encrypted.payload_dek_nonce,
      encrypted.payload_dek_auth_tag, encrypted.payload_key_version]
  );
}

export function updateServiceAreaEmailPayload(
  db: DbClient, config: OosStateCryptoConfig, userId: string, eventId: string, payload: ServiceAreaEmailPayload
) {
  const encrypted = encryptServiceAreaEmailPayload(config, userId, eventId, payload);
  return db.query(
    `update service_area_email_outbox set payload_ciphertext = $3, payload_nonce = $4,
       payload_auth_tag = $5, wrapped_payload_dek = $6, payload_dek_nonce = $7,
       payload_dek_auth_tag = $8, payload_key_version = $9
     where event_id = $1 and user_id = $2`,
    [eventId, userId, encrypted.payload_ciphertext, encrypted.payload_nonce, encrypted.payload_auth_tag,
      encrypted.wrapped_payload_dek, encrypted.payload_dek_nonce, encrypted.payload_dek_auth_tag,
      encrypted.payload_key_version]
  );
}
