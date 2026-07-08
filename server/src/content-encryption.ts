import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import type { AppConfig } from "./config.js";
import { deriveKey } from "./crypto-keys.js";

export type TextContentPurpose = "message" | "feed";

export type EncryptedTextContent = {
  ciphertext: string;
  nonce: string;
  authTag: string;
  keyVersion: string;
};

function getTextEncryptionSecret(config: AppConfig, purpose: TextContentPurpose) {
  if (purpose === "message") {
    return config.MESSAGE_ENCRYPTION_KEY || config.SESSION_SECRET;
  }

  return config.FEED_ENCRYPTION_KEY || config.SESSION_SECRET;
}

function getTextEncryptionKeyVersion(config: AppConfig, purpose: TextContentPurpose) {
  if (purpose === "message") {
    return config.MESSAGE_ENCRYPTION_KEY_VERSION || "v1";
  }

  return config.FEED_ENCRYPTION_KEY_VERSION || "v1";
}

function keyPurpose(purpose: TextContentPurpose) {
  return purpose === "message" ? "message-content" : "feed-content";
}

export function encryptTextContent(
  config: AppConfig,
  purpose: TextContentPurpose,
  plaintext: string
): EncryptedTextContent {
  const keyVersion = getTextEncryptionKeyVersion(config, purpose);
  const key = deriveKey(getTextEncryptionSecret(config, purpose), keyPurpose(purpose), keyVersion);
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

export function decryptTextContent(
  config: AppConfig,
  purpose: TextContentPurpose,
  encrypted: EncryptedTextContent
) {
  const key = deriveKey(getTextEncryptionSecret(config, purpose), keyPurpose(purpose), encrypted.keyVersion);
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(encrypted.nonce, "base64"));
  decipher.setAuthTag(Buffer.from(encrypted.authTag, "base64"));

  return Buffer.concat([
    decipher.update(Buffer.from(encrypted.ciphertext, "base64")),
    decipher.final()
  ]).toString("utf8");
}

export function decryptTextContentOrFallback(
  config: AppConfig,
  purpose: TextContentPurpose,
  encrypted: Partial<EncryptedTextContent> | null | undefined,
  fallback: string
) {
  if (!encrypted?.ciphertext || !encrypted.nonce || !encrypted.authTag || !encrypted.keyVersion) {
    return fallback;
  }

  try {
    return decryptTextContent(config, purpose, encrypted as EncryptedTextContent);
  } catch {
    return fallback;
  }
}
