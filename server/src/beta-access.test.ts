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
      radiusMiles: 100
    });
    expect(checkBetaAccess(config, { lat: 42.3601, lng: -71.0589 })).toMatchObject({
      allowed: false,
      radiusMiles: 100
    });
  });

  it("includes the upper boroughs and Yonkers in the launch area", () => {
    expect(isWithinBetaLaunchArea({ lat: 40.6828509, lng: -73.9521325 })).toBe(true);
    expect(isWithinBetaLaunchArea({ lat: 40.913, lng: -73.843 })).toBe(true);
    expect(isWithinBetaLaunchArea({ lat: 40.9312, lng: -73.8988 })).toBe(true);
    expect(isWithinBetaLaunchArea({ lat: 41.12, lng: -73.8 })).toBe(true);
    expect(isWithinBetaLaunchArea({ lat: 42.6526, lng: -73.7562 })).toBe(false);
  });
});
