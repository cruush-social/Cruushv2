import { createCipheriv, createHmac, randomBytes } from "node:crypto";
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
