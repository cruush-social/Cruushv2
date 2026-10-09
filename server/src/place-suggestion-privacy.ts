import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "node:crypto";
import type { AppConfig } from "./config.js";
import { deriveKey } from "./crypto-keys.js";

export type EncryptedPlaceSuggestion = {
  ciphertext: string;
  nonce: string;
  authTag: string;
  keyVersion: string;
};

function encryptionSecret(config: AppConfig) {
  return config.LOCATION_ENCRYPTION_KEY || config.SESSION_SECRET;
}

function indexSecret(config: AppConfig) {
  return config.LOCATION_INDEX_KEY || config.SESSION_SECRET;
}

function encryptionVersion(config: AppConfig) {
  return config.LOCATION_ENCRYPTION_KEY_VERSION || "v1";
}

function indexVersion(config: AppConfig) {
  return config.LOCATION_INDEX_KEY_VERSION || "v1";
}

export function encryptPlaceSuggestion(config: AppConfig, payload: unknown): EncryptedPlaceSuggestion {
  const keyVersion = encryptionVersion(config);
  const key = deriveKey(encryptionSecret(config), "place-suggestion-payload", keyVersion);
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(payload), "utf8"),
    cipher.final()
  ]);

  return {
    ciphertext: ciphertext.toString("base64"),
    nonce: nonce.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
    keyVersion
  };
}

export function decryptPlaceSuggestion(config: AppConfig, encrypted: EncryptedPlaceSuggestion): unknown {
  const key = deriveKey(encryptionSecret(config), "place-suggestion-payload", encrypted.keyVersion);
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(encrypted.nonce, "base64"));
  decipher.setAuthTag(Buffer.from(encrypted.authTag, "base64"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(encrypted.ciphertext, "base64")),
    decipher.final()
  ]).toString("utf8");
  return JSON.parse(plaintext) as unknown;
}

export function placeSuggestionSupporterToken(config: AppConfig, placeId: string, userId: string) {
  const keyVersion = indexVersion(config);
  const key = deriveKey(indexSecret(config), "place-suggestion-supporter", keyVersion);
  return createHmac("sha256", key).update(`${placeId}:${userId}`, "utf8").digest("base64url");
}
