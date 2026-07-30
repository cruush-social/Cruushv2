import { describe, expect, it } from "vitest";
import { checkBetaAccess } from "./beta-access.js";
import type { AppConfig } from "./config.js";

describe("beta access geofence", () => {
  const config = {
    BETA_ACCESS_GEOFENCE_ENABLED: true,
    BETA_ACCESS_CENTER_LATITUDE: 40.70982,
    BETA_ACCESS_CENTER_LONGITUDE: -73.92256,
    BETA_ACCESS_RADIUS_MILES: 15,
    BETA_ACCESS_VENUE_NAME: "70 Scott Ave"
  } as AppConfig;

  it("allows locations inside 15 miles of 70 Scott Ave and blocks outside locations", () => {
    expect(checkBetaAccess(config, { lat: 40.7128, lng: -74.0060 })).toMatchObject({
      allowed: true,
      radiusMiles: 15
    });
    expect(checkBetaAccess(config, { lat: 40.0, lng: -73.0 })).toMatchObject({
      allowed: false,
      radiusMiles: 15
    });
  });
});
