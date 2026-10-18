import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import type { AppConfig } from './config.js';
import { deriveKey, resolveSecretForVersion } from './crypto-keys.js';
import { getSensitiveProfileKeyVersion } from './profile-sensitive.js';

type Envelope = { ciphertext: string; nonce: string; auth_tag: string; key_version: string };
function key(config: AppConfig, version: string) {
  return deriveKey(resolveSecretForVersion({
    currentSecret: config.PROFILE_ENCRYPTION_KEY || config.SESSION_SECRET,
    previousSecret: config.PROFILE_ENCRYPTION_KEY_PREVIOUS,
    currentVersion: getSensitiveProfileKeyVersion(config), storedVersion: version,
  }), 'account-preferences', version);
}
export function encryptPreference(config: AppConfig, owner: string, name: string, value: unknown): Envelope {
  const version = getSensitiveProfileKeyVersion(config);
  const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(config, version), nonce);
  cipher.setAAD(Buffer.from(JSON.stringify([owner, name])));
  return { ciphertext: Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]).toString('base64'),
    nonce: nonce.toString('base64'), auth_tag: cipher.getAuthTag().toString('base64'), key_version: version };
}
export function decryptPreference(config: AppConfig, owner: string, name: string, row: Envelope): unknown {
  const cipher = createDecipheriv('aes-256-gcm', key(config, row.key_version), Buffer.from(row.nonce, 'base64'));
  cipher.setAAD(Buffer.from(JSON.stringify([owner, name])));
  cipher.setAuthTag(Buffer.from(row.auth_tag, 'base64'));
  return JSON.parse(Buffer.concat([cipher.update(Buffer.from(row.ciphertext, 'base64')), cipher.final()]).toString('utf8'));
}
