import type { FastifyInstance } from "fastify";
import { describe, expect, it, vi } from "vitest";
import {
  clearTravelPin,
  getTravelPin,
  isTravelPinDistanceAllowed,
  loadTravelPins,
  locationPayloadAtTravelPin,
  setTravelPin,
  TRAVEL_PIN_LIFETIME_MS,
  TRAVEL_PIN_MIN_DISTANCE_MILES,
  TRAVEL_PIN_MOVE_COOLDOWN_MS
} from "./travel-pins.js";

describe("travel pins", () => {
  it("allows a Mile High Club pin at any distance and rejects an unusable one", () => {
    expect(TRAVEL_PIN_MIN_DISTANCE_MILES).toBe(0);
    expect(isTravelPinDistanceAllowed(TRAVEL_PIN_MIN_DISTANCE_MILES)).toBe(true);
    expect(isTravelPinDistanceAllowed(TRAVEL_PIN_MIN_DISTANCE_MILES + 0.001)).toBe(true);
    expect(isTravelPinDistanceAllowed(120)).toBe(true);
    expect(isTravelPinDistanceAllowed(-0.001)).toBe(false);
    expect(isTravelPinDistanceAllowed(Number.NaN)).toBe(false);
  });

  it("rejects an out-of-area pin before querying the database", async () => {
    const query = vi.fn();
    const app = {
      db: { query }
    } as unknown as FastifyInstance;

    await expect(setTravelPin(app, "member-id", {
      latitude: 42.3601,
      longitude: -71.0589,
      label: "Outside the service area"
    })).rejects.toMatchObject({
      statusCode: 403,
      code: "FEATURE_RESTRICTED",
      message: "That location is outside the current cruush service area."
    });

    expect(query).not.toHaveBeenCalled();
  });

  it("maps an active stored pin to its move and expiry deadlines", async () => {
    const setAt = "2026-08-31T12:00:00.000Z";
    const setAtMs = Date.parse(setAt);
    const query = vi.fn().mockResolvedValue({
      rows: [{
        user_id: "member-id",
        latitude: 40.7128,
        longitude: -74.006,
        label: "Lower Manhattan",
        set_at: setAt
      }]
    });
    const app = { db: { query } } as unknown as FastifyInstance;

    await expect(getTravelPin(app, "member-id")).resolves.toEqual({
      userId: "member-id",
      latitude: 40.7128,
      longitude: -74.006,
      label: "Lower Manhattan",
      setAtMs,
      movableAtMs: setAtMs + TRAVEL_PIN_MOVE_COOLDOWN_MS,
      expiresAtMs: setAtMs + TRAVEL_PIN_LIFETIME_MS
    });
    expect(query).toHaveBeenCalledWith(expect.stringContaining("set_at > now() - interval '24 hours'"), ["member-id"]);
  });

  it("excludes a pin expired by the application clock even when the transaction query returns it", async () => {
    const nowMs = Date.parse("2026-10-09T12:00:00.000Z");
    const clock = vi.spyOn(Date, "now").mockReturnValue(nowMs);
    const query = vi.fn().mockResolvedValue({ rows: [
      { user_id: "expired-member", latitude: 40.7128, longitude: -74.006, label: "", set_at: new Date(nowMs - TRAVEL_PIN_LIFETIME_MS).toISOString() },
      { user_id: "active-member", latitude: 40.7128, longitude: -74.006, label: "", set_at: new Date(nowMs - TRAVEL_PIN_LIFETIME_MS + 1).toISOString() }
    ] });
    const app = { db: { query } } as unknown as FastifyInstance;

    try {
      const pins = await loadTravelPins(app, ["expired-member", "active-member"]);
      expect([...pins.keys()]).toEqual(["active-member"]);
    } finally {
      clock.mockRestore();
    }
  });

  it("rejects a move before the three-hour cooldown without writing", async () => {
    const setAt = "2026-08-31T12:00:00.000Z";
    const setAtMs = Date.parse(setAt);
    const query = vi.fn().mockResolvedValue({
      rows: [{
        user_id: "member-id",
        latitude: 40.7128,
        longitude: -74.006,
        label: "Existing pin",
        set_at: setAt
      }]
    });
    const app = { db: { query } } as unknown as FastifyInstance;

    await expect(setTravelPin(app, "member-id", {
      latitude: 40.7306,
      longitude: -73.9352,
      label: "Moved too soon"
    }, setAtMs + TRAVEL_PIN_MOVE_COOLDOWN_MS - 1)).rejects.toMatchObject({
      name: "TravelPinCooldownError",
      movableAtMs: setAtMs + TRAVEL_PIN_MOVE_COOLDOWN_MS
    });
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("allows a move at the cooldown boundary and limits the stored label", async () => {
    const setAt = "2026-08-31T12:00:00.000Z";
    const setAtMs = Date.parse(setAt);
    const movedAt = "2026-08-31T15:00:00.000Z";
    const query = vi.fn()
      .mockResolvedValueOnce({
        rows: [{
          user_id: "member-id",
          latitude: 40.7128,
          longitude: -74.006,
          label: "Existing pin",
          set_at: setAt
        }]
      })
      .mockResolvedValueOnce({
        rows: [{
          user_id: "member-id",
          latitude: 40.7306,
          longitude: -73.9352,
          label: "x".repeat(60),
          set_at: movedAt
        }]
      });
    const app = { db: { query } } as unknown as FastifyInstance;

    const result = await setTravelPin(app, "member-id", {
      latitude: 40.7306,
      longitude: -73.9352,
      label: `  ${"x".repeat(70)}  `
    }, setAtMs + TRAVEL_PIN_MOVE_COOLDOWN_MS);

    expect(result.label).toBe("x".repeat(60));
    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[1]?.[0]).toContain("on conflict (user_id) do update");
    expect(query.mock.calls[1]?.[1]).toEqual(["member-id", 40.7306, -73.9352, "x".repeat(60)]);
  });

  it("always clears the current pin without checking the move cooldown", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const app = { db: { query } } as unknown as FastifyInstance;

    await clearTravelPin(app, "member-id");

    expect(query).toHaveBeenCalledWith("delete from user_travel_pins where user_id = $1", ["member-id"]);
  });

  it("moves the discovery location to the active pin without changing unrelated privacy fields", () => {
    const location = {
      version: 1,
      subjectUserId: "member-id",
      locationVersion: 1,
      latE7: 407128000,
      lonE7: -740060000,
      accuracyM: 25,
      source: "GPS",
      deviceReportedAtMs: 1,
      collectedAtMs: 1,
      expiresAtMs: 2,
      keyVersion: "v1",
      extra: "preserved"
    } satisfies Parameters<typeof locationPayloadAtTravelPin>[0] & { extra: string };
    const pin = {
      userId: "member-id",
      latitude: 40.7306,
      longitude: -73.9352,
      label: "Brooklyn",
      setAtMs: 100,
      movableAtMs: 200,
      expiresAtMs: 300
    };

    expect(locationPayloadAtTravelPin(location, pin)).toEqual({
      ...location,
      locationVersion: 100,
      latE7: 407306000,
      lonE7: -739352000,
      accuracyM: 0,
      source: "MANUAL",
      deviceReportedAtMs: 100,
      collectedAtMs: 100,
      expiresAtMs: 300
    });
  });
});
