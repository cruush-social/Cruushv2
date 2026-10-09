import { describe, expect, it } from "vitest";
import { decryptOosState, encryptOosState, type OosStateCryptoConfig } from "./oos-state-crypto.js";

const config = {
  SESSION_SECRET: "synthetic-session-secret",
  LOCATION_ENCRYPTION_KEY: "synthetic-location-secret-v1",
  LOCATION_ENCRYPTION_KEY_VERSION: "v1",
  LOCATION_ENCRYPTION_KEY_PREVIOUS: undefined
} as OosStateCryptoConfig;
const subject = "00000000-0000-4000-8000-000000000001";
const other = "00000000-0000-4000-8000-000000000002";

describe("encrypted current service-area state", () => {
  it("roundtrips inside and outside without storing classification or event ID in cleartext", () => {
    const encryptedRows = [];
    for (const state of [
      { is_outside: false, current_event_id: null },
      { is_outside: true, current_event_id: "00000000-0000-4000-8000-000000000003" }
    ]) {
      const row = encryptOosState(config, subject, state);
      encryptedRows.push(row);
      expect(decryptOosState(config, subject, row)).toEqual(state);
      const stored = JSON.stringify(row);
      expect(stored).not.toContain("is_outside");
      expect(stored).not.toContain("current_event_id");
      if (state.current_event_id) expect(stored).not.toContain(state.current_event_id);
    }
    const lengths = encryptedRows.map((row) => ({
      ciphertext: Buffer.from(row.state_ciphertext, "base64").length,
      nonce: Buffer.from(row.state_nonce, "base64").length,
      tag: Buffer.from(row.state_auth_tag, "base64").length,
      wrappedKey: Buffer.from(row.wrapped_state_dek, "base64").length,
      wrapNonce: Buffer.from(row.state_dek_nonce, "base64").length,
      wrapTag: Buffer.from(row.state_dek_auth_tag, "base64").length
    }));
    expect(lengths[0]).toEqual(lengths[1]);
    expect(lengths[0]).toEqual({ ciphertext: 256, nonce: 12, tag: 16, wrappedKey: 32, wrapNonce: 12, wrapTag: 16 });
  });

  it("binds state to the member, schema field and key version", () => {
    const row = encryptOosState(config, subject, { is_outside: true, current_event_id: subject });
    expect(() => decryptOosState(config, other, row)).toThrow();
    expect(() => decryptOosState(config, subject, { ...row, state_key_version: "v2" })).toThrow();
    expect(() => decryptOosState(config, subject, { ...row, state_auth_tag: "invalid" })).toThrow();
  });

  it("retains prior encrypted state across an ordinary location-key rotation", () => {
    const original = encryptOosState(config, subject, { is_outside: false, current_event_id: null });
    const rotated = { ...config, LOCATION_ENCRYPTION_KEY: "synthetic-location-secret-v2",
      LOCATION_ENCRYPTION_KEY_VERSION: "v2", LOCATION_ENCRYPTION_KEY_PREVIOUS: config.LOCATION_ENCRYPTION_KEY };
    expect(decryptOosState(rotated, subject, original)).toEqual({ is_outside: false, current_event_id: null });
    const recent = encryptOosState(rotated, other, { is_outside: true, current_event_id: subject });
    expect(decryptOosState(rotated, other, recent).is_outside).toBe(true);
    expect(() => decryptOosState({ ...rotated, LOCATION_ENCRYPTION_KEY_PREVIOUS: undefined }, subject, original)).toThrow();
  });

  it("refuses inconsistent classifications", () => {
    expect(() => encryptOosState(config, subject, { is_outside: true, current_event_id: null })).toThrow();
    expect(() => encryptOosState(config, subject, { is_outside: false, current_event_id: subject })).toThrow();
  });
});
