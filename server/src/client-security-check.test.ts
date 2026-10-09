import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "./errors.js";
import { verifyClientSecurityCheck } from "./client-security-check.js";

describe("client security check", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("accepts a normal passive auth check", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-28T12:00:00.000Z"));
    const now = Date.now();

    expect(() => verifyClientSecurityCheck({
      startedAt: now - 1800,
      submittedAt: now,
      trap: ""
    })).not.toThrow();
  });

  it("accepts a quick saved-credential submission", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-28T12:00:00.000Z"));
    const now = Date.now();

    expect(() => verifyClientSecurityCheck({
      startedAt: now - 180,
      submittedAt: now,
      trap: ""
    })).not.toThrow();
  });

  it.each([-3600000, 120000, 3600000])("accepts a normal check with a device clock offset of %i ms", (offset) => {
    const deviceNow = Date.now() + offset;
    expect(() => verifyClientSecurityCheck({
      startedAt: deviceNow - 1800,
      submittedAt: deviceNow,
      trap: ""
    })).not.toThrow();
  });

  it.each([-1, 99, 30 * 60 * 1000 + 1, Number.NaN, Number.POSITIVE_INFINITY])("rejects invalid elapsed time %s", (elapsed) => {
    const deviceNow = Date.now() + 3600000;
    expect(() => verifyClientSecurityCheck({
      startedAt: deviceNow,
      submittedAt: deviceNow + elapsed,
      trap: ""
    })).toThrow(ApiError);
  });

  it("still rejects a filled bot trap with an offset device clock", () => {
    const deviceNow = Date.now() + 3600000;
    expect(() => verifyClientSecurityCheck({
      startedAt: deviceNow - 1800,
      submittedAt: deviceNow,
      trap: "filled"
    })).toThrow(ApiError);
  });

  it("rejects bot trap submissions", () => {
    const now = Date.now();

    expect(() => verifyClientSecurityCheck({
      startedAt: now - 1800,
      submittedAt: now,
      trap: "filled"
    })).toThrow(ApiError);
  });

  it("rejects unrealistically fast submissions", () => {
    const now = Date.now();

    expect(() => verifyClientSecurityCheck({
      startedAt: now - 50,
      submittedAt: now,
      trap: ""
    })).toThrow(ApiError);
  });
});
