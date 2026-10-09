import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import type { AppConfig } from "./config.js";
import { deriveKey, resolveSecretForVersion } from "./crypto-keys.js";

export type OosState = { is_outside: boolean; current_event_id: string | null };
export type EncryptedOosState = {
  state_ciphertext: string;
  state_nonce: string;
  state_auth_tag: string;
  wrapped_state_dek: string;
  state_dek_nonce: string;
  state_dek_auth_tag: string;
  state_key_version: string;
};
export type OosStateCryptoConfig = Pick<AppConfig,
  "SESSION_SECRET" | "LOCATION_ENCRYPTION_KEY" | "LOCATION_ENCRYPTION_KEY_PREVIOUS" | "LOCATION_ENCRYPTION_KEY_VERSION">;
const STATE_PLAINTEXT_BYTES = 256;

function validState(state: OosState) {
  return typeof state.is_outside === "boolean"
    && (state.current_event_id === null || (typeof state.current_event_id === "string"
      && state.current_event_id.length > 0 && state.current_event_id.length <= 64))
    && state.is_outside === (state.current_event_id !== null);
}

function aad(userId: string, keyVersion: string) {
  return Buffer.from(JSON.stringify(["oos-service-area-state", 1, userId, "state", keyVersion]));
}

function seal(key: Buffer, bytes: Buffer, associatedData: Buffer) {
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  cipher.setAAD(associatedData);
  return {
    ciphertext: Buffer.concat([cipher.update(bytes), cipher.final()]).toString("base64"),
    nonce: nonce.toString("base64"),
    tag: cipher.getAuthTag().toString("base64")
  };
}

function open(key: Buffer, ciphertext: string, nonce: string, tag: string, associatedData: Buffer) {
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(nonce, "base64"));
  decipher.setAAD(associatedData);
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64")), decipher.final()]);
}

function wrappingKey(config: OosStateCryptoConfig, storedVersion: string) {
  const currentVersion = config.LOCATION_ENCRYPTION_KEY_VERSION || "v1";
  const secret = resolveSecretForVersion({
    currentSecret: config.LOCATION_ENCRYPTION_KEY || config.SESSION_SECRET,
    previousSecret: config.LOCATION_ENCRYPTION_KEY_PREVIOUS,
    currentVersion,
    storedVersion
  });
  return deriveKey(secret, "oos-service-area-state-wrap", storedVersion);
}

export function encryptOosState(config: OosStateCryptoConfig, userId: string, state: OosState): EncryptedOosState {
  if (!validState(state)) {
    throw new Error("Invalid OOS state.");
  }
  const state_key_version = config.LOCATION_ENCRYPTION_KEY_VERSION || "v1";
  const associatedData = aad(userId, state_key_version);
  const dataKey = randomBytes(32);
  const serialized = Buffer.from(JSON.stringify({ version: 1, userId, ...state }), "utf8");
  if (serialized.length > STATE_PLAINTEXT_BYTES) throw new Error("Invalid OOS state.");
  // JSON whitespace is ignored on read. Equal-sized ciphertexts do not reveal
  // whether the optional outside event ID is present.
  const fixedPlaintext = Buffer.alloc(STATE_PLAINTEXT_BYTES, 0x20);
  serialized.copy(fixedPlaintext);
  const payload = seal(dataKey, fixedPlaintext, associatedData);
  const wrapped = seal(wrappingKey(config, state_key_version), dataKey, associatedData);
  return {
    state_ciphertext: payload.ciphertext, state_nonce: payload.nonce, state_auth_tag: payload.tag,
    wrapped_state_dek: wrapped.ciphertext, state_dek_nonce: wrapped.nonce,
    state_dek_auth_tag: wrapped.tag, state_key_version
  };
}

export function decryptOosState(config: OosStateCryptoConfig, userId: string, row: EncryptedOosState): OosState {
  if (!row.state_key_version) throw new Error("OOS state unavailable.");
  const associatedData = aad(userId, row.state_key_version);
  const dataKey = open(wrappingKey(config, row.state_key_version), row.wrapped_state_dek,
    row.state_dek_nonce, row.state_dek_auth_tag, associatedData);
  const plaintext = open(dataKey, row.state_ciphertext, row.state_nonce,
    row.state_auth_tag, associatedData);
  if (plaintext.length !== STATE_PLAINTEXT_BYTES) throw new Error("OOS state unavailable.");
  const raw: unknown = JSON.parse(plaintext.toString("utf8"));
  if (!raw || typeof raw !== "object") throw new Error("OOS state unavailable.");
  const payload = raw as Record<string, unknown>;
  if (payload.version !== 1 || payload.userId !== userId || typeof payload.is_outside !== "boolean"
    || !validState({ is_outside: payload.is_outside, current_event_id: payload.current_event_id } as OosState)) {
    throw new Error("OOS state unavailable.");
  }
  return { is_outside: payload.is_outside, current_event_id: payload.current_event_id as string | null };
}
