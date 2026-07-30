import { afterEach, describe, expect, it, vi } from "vitest";
import { hashPassword } from "./auth.js";
import type { AppConfig } from "./config.js";
import {
  getAlphaSessionExpiry,
  getAlphaTestState,
  verifyAlphaTestPassword
} from "./alpha-test.js";

function alphaConfig(overrides: Partial<AppConfig> = {}) {
  return {
    ALPHA_TEST_ENABLED: true,
    ALPHA_TEST_PASSWORD_HASH: "scrypt$00$00",
    ALPHA_TEST_ENDS_AT: "2026-07-31T00:00:00-04:00",
    ...overrides
  } as AppConfig;
}

describe("alpha-test", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("tracks active and ended alpha state from the configured cutoff", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-30T23:59:59-04:00"));
    expect(getAlphaTestState(alphaConfig())).toMatchObject({
      enabled: true,
      active: true,
      ended: false,
      endsAt: "2026-07-31T04:00:00.000Z"
    });

    vi.setSystemTime(new Date("2026-07-31T00:00:00-04:00"));
    expect(getAlphaTestState(alphaConfig())).toMatchObject({
      enabled: true,
      active: false,
      ended: true
    });
  });

  it("verifies the alpha password before cutoff and rejects it after cutoff", async () => {
    const passwordHash = await hashPassword("door-password");
    const config = alphaConfig({ ALPHA_TEST_PASSWORD_HASH: passwordHash });

    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-30T20:00:00-04:00"));
    await expect(verifyAlphaTestPassword(config, "door-password")).resolves.toBeUndefined();

    await expect(verifyAlphaTestPassword(config, "wrong-password")).rejects.toMatchObject({
      code: "ALPHA_TEST_PASSWORD_REQUIRED"
    });

    vi.setSystemTime(new Date("2026-07-31T00:00:00-04:00"));
    await expect(verifyAlphaTestPassword(config, "door-password")).rejects.toMatchObject({
      code: "ALPHA_TEST_ENDED"
    });
  });

  it("caps session expiry at the alpha cutoff", () => {
    const config = alphaConfig();
    const fallback = new Date("2026-08-27T12:00:00-04:00");

    expect(getAlphaSessionExpiry(config, fallback).toISOString()).toBe("2026-07-31T04:00:00.000Z");
    expect(getAlphaSessionExpiry(alphaConfig({ ALPHA_TEST_ENABLED: false }), fallback)).toBe(fallback);
  });
});
