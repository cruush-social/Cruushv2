import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import type { AppConfig } from "./config.js";
import { deriveKey } from "./crypto-keys.js";

export type EncryptedMediaBytes = {
  ciphertext: Buffer;
  nonce: string;
  authTag: string;
  encryptedDataKey: string;
  dataKeyNonce: string;
  dataKeyAuthTag: string;
  keyVersion: string;
};

function getMediaEncryptionSecret(config: AppConfig) {
  return config.MEDIA_ENCRYPTION_KEY || config.SESSION_SECRET;
}

function getMediaEncryptionKeyVersion(config: AppConfig) {
  return config.MEDIA_ENCRYPTION_KEY_VERSION || "v1";
}

function encryptWithKey(key: Buffer, plaintext: Buffer) {
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext),
    cipher.final()
  ]);

  return {
    ciphertext,
    nonce: nonce.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64")
  };
}

function decryptWithKey(key: Buffer, input: {
  ciphertext: Buffer;
  nonce: string;
  authTag: string;
}) {
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(input.nonce, "base64"));
  decipher.setAuthTag(Buffer.from(input.authTag, "base64"));

  return Buffer.concat([
    decipher.update(input.ciphertext),
    decipher.final()
  ]);
}

export function encryptMediaBytes(config: AppConfig, plaintext: Buffer): EncryptedMediaBytes {
  const keyVersion = getMediaEncryptionKeyVersion(config);
  const wrappingKey = deriveKey(getMediaEncryptionSecret(config), "media-data-key", keyVersion);
  const dataKey = randomBytes(32);
  const encryptedBytes = encryptWithKey(dataKey, plaintext);
  const encryptedDataKey = encryptWithKey(wrappingKey, dataKey);

  return {
    ciphertext: encryptedBytes.ciphertext,
    nonce: encryptedBytes.nonce,
    authTag: encryptedBytes.authTag,
    encryptedDataKey: encryptedDataKey.ciphertext.toString("base64"),
    dataKeyNonce: encryptedDataKey.nonce,
    dataKeyAuthTag: encryptedDataKey.authTag,
    keyVersion
  };
}

export function decryptMediaBytes(config: AppConfig, encrypted: EncryptedMediaBytes) {
  const wrappingKey = deriveKey(getMediaEncryptionSecret(config), "media-data-key", encrypted.keyVersion);
  const dataKey = decryptWithKey(wrappingKey, {
    ciphertext: Buffer.from(encrypted.encryptedDataKey, "base64"),
    nonce: encrypted.dataKeyNonce,
    authTag: encrypted.dataKeyAuthTag
  });

  return decryptWithKey(dataKey, {
    ciphertext: encrypted.ciphertext,
    nonce: encrypted.nonce,
    authTag: encrypted.authTag
  });
}
