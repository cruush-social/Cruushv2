import { describe, expect, it } from "vitest";
import {
  IDENTITY_GATE_LOCK_DAYS,
  isIdentityGateChangeLocked
} from "./routes/profiles.js";

describe("profile identity and crowd change lock", () => {
  const changedAt = new Date("2026-08-01T12:00:00.000Z");

  it("uses a three-day lock for gender and crowd changes", () => {
    expect(IDENTITY_GATE_LOCK_DAYS).toBe(3);
    expect(isIdentityGateChangeLocked(changedAt, new Date("2026-08-04T11:59:59.999Z"))).toBe(true);
    expect(isIdentityGateChangeLocked(changedAt, new Date("2026-08-04T12:00:00.000Z"))).toBe(false);
  });
});
