import { describe, expect, it } from "vitest";
import { formatPresenceLabel } from "./discovery-users.js";

const now = Date.parse("2026-10-11T12:00:00Z");
const minutesAgo = (minutes: number) => new Date(now - minutes * 60_000);

describe("formatPresenceLabel", () => {
  it("reads Online when the member used the app inside the window", () => {
    expect(formatPresenceLabel({ lastSeenAt: minutesAgo(2), fallback: minutesAgo(3000), allowOnline: true, nowMs: now }))
      .toBe("Online");
  });

  it("follows app use, not the older location save", () => {
    expect(formatPresenceLabel({ lastSeenAt: minutesAgo(12), fallback: minutesAgo(3000), allowOnline: true, nowMs: now }))
      .toBe("12m ago");
  });

  it("falls back to the older timestamp for members not seen since the column was added", () => {
    expect(formatPresenceLabel({ lastSeenAt: null, fallback: minutesAgo(180), allowOnline: true, nowMs: now }))
      .toBe("3h ago");
  });

  it("never reads Online, or closer than the window, for Ghost Mode members", () => {
    expect(formatPresenceLabel({ lastSeenAt: minutesAgo(1), fallback: minutesAgo(3000), allowOnline: false, nowMs: now }))
      .toBe("5m ago");
  });
});
