import { describe, expect, it } from "vitest";
import { isWithinQuietHours, type NotificationPreferences } from "./push-service.js";

function preferences(overrides: Partial<NotificationPreferences> = {}): NotificationPreferences {
  return {
    emailEnabled: true,
    pushEnabled: true,
    cruushEnabled: true,
    messagesEnabled: true,
    groupsEnabled: true,
    nearbyEnabled: true,
    mutualFeedEnabled: true,
    rewardsEnabled: true,
    siteRemindersEnabled: true,
    soundEnabled: true,
    quietHoursEnabled: true,
    quietHoursStartMinute: 0,
    quietHoursEndMinute: 360,
    quietHoursTimezone: "America/New_York",
    pulseEnabled: true,
    ...overrides
  };
}

/** 2026-08-22 at the given hour in New York, expressed as an epoch. */
function newYork(hour: number, minute = 0) {
  return Date.parse(
    `2026-08-22T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00-04:00`
  );
}

describe("notification quiet hours", () => {
  it("stays off until the member turns it on", () => {
    expect(isWithinQuietHours(preferences({ quietHoursEnabled: false }), newYork(2))).toBe(false);
  });

  it("covers an overnight window that wraps past midnight", () => {
    const overnight = preferences({ quietHoursStartMinute: 21 * 60, quietHoursEndMinute: 9 * 60 });

    expect(isWithinQuietHours(overnight, newYork(22))).toBe(true);
    expect(isWithinQuietHours(overnight, newYork(3))).toBe(true);
    expect(isWithinQuietHours(overnight, newYork(8, 59))).toBe(true);
    expect(isWithinQuietHours(overnight, newYork(9))).toBe(false);
    expect(isWithinQuietHours(overnight, newYork(14))).toBe(false);
  });

  it("reads the window in the member's own zone, not UTC", () => {
    // 2am in New York is 6am UTC, which is outside the midnight-to-six window
    // when the window is read in the wrong place.
    expect(isWithinQuietHours(preferences(), newYork(2))).toBe(true);
    expect(isWithinQuietHours(preferences(), newYork(7))).toBe(false);
  });
});
