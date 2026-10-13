import { describe, expect, it } from "vitest";
import { canShowOnlineStatus, formatPresenceLabel } from "./discovery-users.js";

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

  it.each(["PUBLIC_PRECISE", "GHOST"])("shows recent %s activity as Online", (baseMode) => {
    expect(formatPresenceLabel({ lastSeenAt: minutesAgo(1), allowOnline: canShowOnlineStatus(baseMode), nowMs: now }))
      .toBe("Online");
    expect(formatPresenceLabel({ lastSeenAt: minutesAgo(5), allowOnline: canShowOnlineStatus(baseMode), nowMs: now }))
      .toBe("5m ago");
  });

  it.each(["STEALTH", undefined, null, "unknown"])("keeps %s activity outside the Online window", (baseMode) => {
    expect(formatPresenceLabel({ lastSeenAt: minutesAgo(1), fallback: minutesAgo(3000), allowOnline: canShowOnlineStatus(baseMode), nowMs: now }))
      .toBe("5m ago");
  });
});
