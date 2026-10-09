import { describe, expect, it, vi } from "vitest";
import type { LocationPrivacyContext } from "./location-privacy.js";
import { loadStoredOutOfSightStatuses } from "./oos-welcome-email.js";
import {
  classifyCurrentOutOfSightLocation,
  classifyOutOfSightLocation,
  loadOutOfSightStatuses,
  resolveOutOfSightLocationLabel
} from "./out-of-sight-location.js";

vi.mock("./oos-welcome-email.js", () => ({ loadStoredOutOfSightStatuses: vi.fn() }));

describe("Out of Sight location labels", () => {
  it("uses only encrypted last-known state for display status after live GPS expires", async () => {
    const ids = ["member-a", "member-b", "missing"];
    const expected = new Map([
      ["member-a", "out_of_sight"], ["member-b", "in_area"], ["missing", "unknown"]
    ] as const);
    vi.mocked(loadStoredOutOfSightStatuses).mockResolvedValueOnce(expected);
    const query = vi.fn(() => { throw new Error("Unexpected coordinate query"); });
    const context = { config: {} as LocationPrivacyContext["config"],
      db: { query } as unknown as LocationPrivacyContext["db"] };
    expect(await loadOutOfSightStatuses(context, ids)).toBe(expected);
    expect(loadStoredOutOfSightStatuses).toHaveBeenCalledWith(context, ids);
    expect(query).not.toHaveBeenCalled();
  });

  it("classifies the actual device position, including an unknown position", () => {
    expect(classifyOutOfSightLocation({ lat: 40.7128, lng: -74.006 })).toBe("in_area");
    expect(classifyOutOfSightLocation({ lat: 34.0522, lng: -118.2437 })).toBe("out_of_sight");
    expect(classifyOutOfSightLocation(null)).toBe("unknown");
    expect(classifyOutOfSightLocation({ lat: 999, lng: 0 })).toBe("unknown");
  });

  it("removes the Out of Sight mark when the saved device location expires", () => {
    const location = {
      latE7: 340_522_000,
      lonE7: -1_182_437_000,
      expiresAtMs: 2_000
    };
    expect(classifyCurrentOutOfSightLocation(location as Parameters<typeof classifyCurrentOutOfSightLocation>[0], 1_999)).toBe("out_of_sight");
    expect(classifyCurrentOutOfSightLocation(location as Parameters<typeof classifyCurrentOutOfSightLocation>[0], 2_000)).toBe("unknown");
    expect(classifyCurrentOutOfSightLocation(null, 1_999)).toBe("unknown");
  });

  it.each([
    { sharedMode: "approximate", expected: "Among sinners" },
    { sharedMode: "precise", expected: "New York, NY" }
  ] as const)("shows OOS viewers the approved $sharedMode in-area label", ({ sharedMode, expected }) => {
    expect(resolveOutOfSightLocationLabel({
      viewerStatus: "out_of_sight",
      subjectStatus: "in_area",
      sharedMode
    })).toBe(expected);
  });

  it("shows OOS members' city only when both sides allow precise labels", () => {
    expect(resolveOutOfSightLocationLabel({
      viewerStatus: "in_area",
      subjectStatus: "out_of_sight",
      sharedMode: "approximate",
      subjectCityLabel: "Los Angeles, CA"
    })).toBe("Far far away");
    expect(resolveOutOfSightLocationLabel({
      viewerStatus: "in_area",
      subjectStatus: "out_of_sight",
      sharedMode: "precise",
      subjectCityLabel: "Los Angeles, CA"
    })).toBe("Los Angeles, CA");
    expect(resolveOutOfSightLocationLabel({
      viewerStatus: "in_area",
      subjectStatus: "out_of_sight",
      sharedMode: "precise"
    })).toBe("Far far away");
  });

  it("does not change in-area or unknown-location labels", () => {
    expect(resolveOutOfSightLocationLabel({
      viewerStatus: "in_area",
      subjectStatus: "in_area",
      sharedMode: "precise"
    })).toBeNull();
    expect(resolveOutOfSightLocationLabel({
      viewerStatus: "out_of_sight",
      subjectStatus: "unknown",
      sharedMode: "precise"
    })).toBeNull();
  });
});
