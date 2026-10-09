import { describe, expect, it } from "vitest";
import { anonymousNearbyArea } from "./nearby-area.js";
import { distanceMiles } from "./beta-access.js";
import { mapNotificationRow, type AppNotificationRow } from "./notification-service.js";

describe("anonymous nearby navigation", () => {
  it("keeps the displayed point inside one mile and away from the stable area center", () => {
    const displayed = { lat: 40.7401, lng: -73.9812 };
    for (let index = 0; index < 100; index++) {
      const area = anonymousNearbyArea("synthetic-test-key", String(index), displayed);
      const distance = distanceMiles(displayed, {
        lat: area.approximateLatitude, lng: area.approximateLongitude
      });
      expect(distance).toBeGreaterThan(0.24);
      expect(distance).toBeLessThan(0.76);
      expect(area.radiusMiles).toBe(1);
      expect(anonymousNearbyArea("synthetic-test-key", String(index), displayed)).toEqual(area);
    }
  });

  it("strips identity from both modern and legacy nearby notifications", () => {
    for (const type of ["nearby_activity", "nearby_user"] as const) {
      const row = { id: "notification-1", user_id: "viewer", type,
        title: "Source name", body: "Source name is nearby", link_url: "/map?focusUserId=source-person",
        actor_user_id: "source-person", conversation_id: null,
        metadata: { sourceUserId: "source-person", distanceMiles: 0.1 },
        read_at: null, created_at: "2026-09-12T12:00:00Z" } satisfies AppNotificationRow;
      const visible = mapNotificationRow(row);
      expect(visible.linkUrl).toBe("/map?layer=nearby&nearbyNotification=notification-1");
      expect(visible.actorUserId).toBeNull();
      expect(visible.metadata).toEqual({});
      expect(JSON.stringify(visible)).not.toMatch(/source-person|Source name|distanceMiles/);
      expect(mapNotificationRow({ ...row, type: "incoming_cruush" }).actorUserId).toBe("source-person");
    }
  });
});
