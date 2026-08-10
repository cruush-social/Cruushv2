import { describe, expect, it } from "vitest";
import { checkBetaAccess, isWithinBetaLaunchArea } from "./beta-access.js";
import type { AppConfig } from "./config.js";

describe("beta access geofence", () => {
  const config = {
    BETA_ACCESS_GEOFENCE_ENABLED: true
  } as AppConfig;

  it("allows locations inside the launch area and blocks outside locations", () => {
    expect(checkBetaAccess(config, { lat: 40.7128, lng: -74.0060 })).toMatchObject({
      allowed: true,
      radiusMiles: 15
    });
    expect(checkBetaAccess(config, { lat: 40.0, lng: -73.0 })).toMatchObject({
      allowed: false,
      radiusMiles: 15
    });
  });

  it("keeps discovery data within the same launch area", () => {
    expect(isWithinBetaLaunchArea({ lat: 40.6828509, lng: -73.9521325 })).toBe(true);
    expect(isWithinBetaLaunchArea({ lat: 40.898, lng: -73.9521325 })).toBe(true);
    expect(isWithinBetaLaunchArea({ lat: 40.901, lng: -73.9521325 })).toBe(false);
  });
});
