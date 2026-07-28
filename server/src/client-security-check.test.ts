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
