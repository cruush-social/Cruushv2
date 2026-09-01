import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "node:crypto";
import type { FastifyInstance } from "fastify";
import type { AppConfig } from "./config.js";
import { deriveKey } from "./crypto-keys.js";

type EncryptedValue = {
  ciphertext: string;
  nonce: string;
  authTag: string;
  keyVersion: string;
};

type BetaCityRequestInput = {
  email: string;
  requestedCity: string;
};

function normalizeForHash(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function valueKeyVersion() {
  return "v1";
}

function encryptValue(config: AppConfig, purpose: string, plaintext: string): EncryptedValue {
  const keyVersion = valueKeyVersion();
  const key = deriveKey(config.SESSION_SECRET, `beta-city-request-${purpose}`, keyVersion);
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final()
  ]);

  return {
    ciphertext: ciphertext.toString("base64"),
    nonce: nonce.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
    keyVersion
  };
}

function decryptValue(config: AppConfig, purpose: string, encrypted: EncryptedValue) {
  const key = deriveKey(config.SESSION_SECRET, `beta-city-request-${purpose}`, encrypted.keyVersion);
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(encrypted.nonce, "base64"));
  decipher.setAuthTag(Buffer.from(encrypted.authTag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(encrypted.ciphertext, "base64")),
    decipher.final()
  ]).toString("utf8");
}

function hashValue(config: AppConfig, purpose: string, plaintext: string) {
  return createHmac("sha256", deriveKey(config.SESSION_SECRET, `beta-city-request-${purpose}-hash`, valueKeyVersion()))
    .update(normalizeForHash(plaintext))
    .digest("hex");
}

export async function saveBetaCityRequest(
  app: Pick<FastifyInstance, "config" | "db">,
  input: BetaCityRequestInput
) {
  const email = encryptValue(app.config, "email", input.email);
  const requestedCity = encryptValue(app.config, "city", input.requestedCity);
  const result = await app.db.query<{ id: string; created_at: string }>(
    `insert into beta_city_requests (
       email_ciphertext,
       email_nonce,
       email_auth_tag,
       email_key_version,
       email_hash,
       requested_city_ciphertext,
       requested_city_nonce,
       requested_city_auth_tag,
       requested_city_key_version,
       requested_city_hash,
       source
     ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'launch_beta_geofence')
     on conflict (email_hash, requested_city_hash)
     do update set updated_at = now()
     returning id::text, created_at`,
    [
      email.ciphertext,
      email.nonce,
      email.authTag,
      email.keyVersion,
      hashValue(app.config, "email", input.email),
      requestedCity.ciphertext,
      requestedCity.nonce,
      requestedCity.authTag,
      requestedCity.keyVersion,
      hashValue(app.config, "city", input.requestedCity)
    ]
  );

  return result.rows[0] ?? null;
}

type BetaCityRequestRow = {
  id: string;
  email_ciphertext: string;
  email_nonce: string;
  email_auth_tag: string;
  email_key_version: string;
  requested_city_ciphertext: string;
  requested_city_nonce: string;
  requested_city_auth_tag: string;
  requested_city_key_version: string;
  source: string;
  created_at: string | Date;
  updated_at: string | Date;
};

export async function listBetaCityRequests(
  app: Pick<FastifyInstance, "config" | "db">,
  options: { limit: number; offset: number }
) {
  const [rows, count] = await Promise.all([
    app.db.query<BetaCityRequestRow>(
      `select
         id::text,
         email_ciphertext,
         email_nonce,
         email_auth_tag,
         email_key_version,
         requested_city_ciphertext,
         requested_city_nonce,
         requested_city_auth_tag,
         requested_city_key_version,
         source,
         created_at,
         updated_at
       from beta_city_requests
       order by updated_at desc, id desc
       limit $1 offset $2`,
      [options.limit, options.offset]
    ),
    app.db.query<{ count: number | string }>("select count(*)::int as count from beta_city_requests")
  ]);

  const total = Number(count.rows[0]?.count ?? 0);
  return {
    requests: rows.rows.map((row) => ({
      id: row.id,
      email: decryptValue(app.config, "email", {
        ciphertext: row.email_ciphertext,
        nonce: row.email_nonce,
        authTag: row.email_auth_tag,
        keyVersion: row.email_key_version
      }),
      requestedCity: decryptValue(app.config, "city", {
        ciphertext: row.requested_city_ciphertext,
        nonce: row.requested_city_nonce,
        authTag: row.requested_city_auth_tag,
        keyVersion: row.requested_city_key_version
      }),
      source: row.source,
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString()
    })),
    page: {
      limit: options.limit,
      offset: options.offset,
      total,
      hasMore: options.offset + rows.rows.length < total
    }
  };
}
