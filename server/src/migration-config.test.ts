import { describe, expect, it } from "vitest";
import { loadConfig } from "./config.js";
import { loadMigrationCryptoConfig } from "./migration-config.js";
import { decryptOosState, encryptOosState } from "./oos-state-crypto.js";
import { decryptServiceAreaEmailPayload, encryptServiceAreaEmailPayload } from "./service-area-email-outbox.js";

const sessionSecret = "synthetic-migration-session-secret-for-tests";
const locationKey = "synthetic-migration-location-secret-for-tests";
const nextLocationKey = "synthetic-next-location-secret-for-tests";
const subjectId = "00000000-0000-4000-8000-000000000001";
const eventId = "00000000-0000-4000-8000-000000000002";

function existingConfig(env: NodeJS.ProcessEnv) {
  return loadConfig({ DATABASE_URL: "postgres://localhost/config-test-only", ...env });
}

describe("migration crypto configuration", () => {
  it.each([
    {},
    { NODE_ENV: "test", LOCATION_ENCRYPTION_KEY: "" },
    { LOCATION_ENCRYPTION_KEY: locationKey, LOCATION_ENCRYPTION_KEY_PREVIOUS: "" },
    { LOCATION_ENCRYPTION_KEY: nextLocationKey, LOCATION_ENCRYPTION_KEY_PREVIOUS: locationKey,
      LOCATION_ENCRYPTION_KEY_VERSION: " v2 " }
  ])("preserves existing field defaults and normalization for %j", (overrides) => {
    const env = { SESSION_SECRET: sessionSecret, ...overrides };
    const expected = existingConfig(env);
    expect(loadMigrationCryptoConfig(env)).toEqual({
      SESSION_SECRET: expected.SESSION_SECRET,
      LOCATION_ENCRYPTION_KEY: expected.LOCATION_ENCRYPTION_KEY,
      LOCATION_ENCRYPTION_KEY_PREVIOUS: expected.LOCATION_ENCRYPTION_KEY_PREVIOUS,
      LOCATION_ENCRYPTION_KEY_VERSION: expected.LOCATION_ENCRYPTION_KEY_VERSION
    });
  });

  it("accepts production migration keys without requiring or returning unrelated credentials", () => {
    expect(loadMigrationCryptoConfig({
      NODE_ENV: "production",
      SESSION_SECRET: sessionSecret,
      LOCATION_ENCRYPTION_KEY: locationKey,
      DATABASE_URL: "ignored-database-value",
      RESEND_API_KEY: "ignored-mail-value",
      MEDIA_S3_SECRET_ACCESS_KEY: "ignored-storage-value"
    })).toEqual({
      SESSION_SECRET: sessionSecret,
      LOCATION_ENCRYPTION_KEY: locationKey,
      LOCATION_ENCRYPTION_KEY_VERSION: "v1"
    });
  });

  it.each([
    [{}, "SESSION_SECRET"],
    [{ SESSION_SECRET: "" }, "SESSION_SECRET"],
    [{ NODE_ENV: "production", SESSION_SECRET: "synthetic-short", LOCATION_ENCRYPTION_KEY: locationKey }, "SESSION_SECRET"],
    [{ NODE_ENV: "production", SESSION_SECRET: sessionSecret }, "LOCATION_ENCRYPTION_KEY"],
    [{ NODE_ENV: "production", SESSION_SECRET: sessionSecret, LOCATION_ENCRYPTION_KEY: "synthetic-short" }, "LOCATION_ENCRYPTION_KEY"],
    [{ SESSION_SECRET: sessionSecret, LOCATION_ENCRYPTION_KEY_VERSION: "   " }, "LOCATION_ENCRYPTION_KEY_VERSION"],
    [{ SESSION_SECRET: sessionSecret, NODE_ENV: "synthetic-invalid-environment" }, "NODE_ENV"]
  ] as const)("rejects invalid crypto settings without exposing supplied values", (env, field) => {
    let caught: unknown;
    try {
      loadMigrationCryptoConfig(env);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toBe(`Invalid migration crypto configuration: ${field}.`);
    expect(caught).not.toHaveProperty("cause");
    expect(caught).not.toHaveProperty("issues");
    for (const value of Object.values(env)) {
      if (value.trim()) expect(String(caught)).not.toContain(value);
    }
  });

  it("does not trim key material while normalizing the existing key version", () => {
    const env = {
      SESSION_SECRET: ` ${sessionSecret} `,
      LOCATION_ENCRYPTION_KEY: ` ${locationKey} `,
      LOCATION_ENCRYPTION_KEY_PREVIOUS: ` ${nextLocationKey} `,
      LOCATION_ENCRYPTION_KEY_VERSION: " v2 "
    };
    expect(loadMigrationCryptoConfig(env)).toEqual({ ...env, LOCATION_ENCRYPTION_KEY_VERSION: "v2" });
  });

  it.each([undefined, locationKey])("reads existing encrypted migration data with the same effective key", (key) => {
    const env = { SESSION_SECRET: sessionSecret, LOCATION_ENCRYPTION_KEY: key };
    const oldConfig = existingConfig(env);
    const migrationConfig = loadMigrationCryptoConfig(env);
    const state = { is_outside: true, current_event_id: eventId };
    const payload = { kind: "outside_entry" as const, priorOutsideEventId: null,
      providerIdempotencyKey: "synthetic-provider-idempotency-key", emailTo: null, providerMessageId: null };

    expect(decryptOosState(migrationConfig, subjectId, encryptOosState(oldConfig, subjectId, state))).toEqual(state);
    expect(decryptServiceAreaEmailPayload(migrationConfig, {
      ...encryptServiceAreaEmailPayload(oldConfig, subjectId, eventId, payload),
      user_id: subjectId, event_id: eventId, email_started_at: null
    })).toEqual(payload);
  });

  it("preserves previous-key reads and current-key writes through a version change", () => {
    const oldConfig = existingConfig({ SESSION_SECRET: sessionSecret, LOCATION_ENCRYPTION_KEY: locationKey });
    const env = { SESSION_SECRET: sessionSecret, LOCATION_ENCRYPTION_KEY: nextLocationKey,
      LOCATION_ENCRYPTION_KEY_PREVIOUS: locationKey, LOCATION_ENCRYPTION_KEY_VERSION: "v2" };
    const migrationConfig = loadMigrationCryptoConfig(env);
    const state = { is_outside: true, current_event_id: eventId };

    expect(decryptOosState(migrationConfig, subjectId, encryptOosState(oldConfig, subjectId, state))).toEqual(state);
    const rewritten = encryptOosState(migrationConfig, subjectId, state);
    expect(rewritten.state_key_version).toBe("v2");
    expect(decryptOosState(existingConfig(env), subjectId, rewritten)).toEqual(state);
  });
});
