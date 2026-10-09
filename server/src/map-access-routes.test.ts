import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppConfig } from "./config.js";
import { toApiError, formatError } from "./errors.js";
import type { LocationPayload } from "./location-privacy.js";
import { TRAVEL_PIN_LIFETIME_MS, type TravelPin } from "./travel-pins.js";
import { registerUserRoutes } from "./routes/users.js";

const mocks = vi.hoisted(() => ({
  loadLocationEnvelopes: vi.fn(),
  loadTravelPins: vi.fn(),
  getRelationshipPermissions: vi.fn()
}));
vi.mock("./location-privacy.js", async (importOriginal) => ({
  ...await importOriginal<typeof import("./location-privacy.js")>(),
  loadLocationEnvelopes: mocks.loadLocationEnvelopes
}));
vi.mock("./travel-pins.js", async (importOriginal) => ({
  ...await importOriginal<typeof import("./travel-pins.js")>(),
  loadTravelPins: mocks.loadTravelPins
}));
vi.mock("./match-relationships.js", async (importOriginal) => ({
  ...await importOriginal<typeof import("./match-relationships.js")>(),
  getRelationshipPermissions: mocks.getRelationshipPermissions
}));

const userId = "11111111-1111-4111-8111-111111111111";
const nyc = { lat: 40.7128, lng: -74.006 };
const outside = { lat: 34.0522, lng: -118.2437 };

function location(point: { lat: number; lng: number }): LocationPayload {
  return {
    version: 1, subjectUserId: userId, locationVersion: 1,
    latE7: Math.round(point.lat * 10_000_000), lonE7: Math.round(point.lng * 10_000_000),
    accuracyM: 20, source: "GPS", deviceReportedAtMs: Date.now(),
    collectedAtMs: Date.now(), expiresAtMs: Date.now() + 60_000, keyVersion: "v1"
  };
}

function travelPin(point: { lat: number; lng: number }): TravelPin {
  const setAtMs = Date.now();
  return {
    userId, latitude: point.lat, longitude: point.lng, label: "Trip",
    setAtMs, movableAtMs: setAtMs + 60_000,
    expiresAtMs: setAtMs + TRAVEL_PIN_LIFETIME_MS
  };
}

describe("viewer map access", () => {
  let app: FastifyInstance;
  const query = vi.fn();

  beforeEach(async () => {
    vi.resetAllMocks();
    mocks.loadLocationEnvelopes.mockResolvedValue(new Map());
    mocks.loadTravelPins.mockResolvedValue(new Map());
    app = Fastify({ logger: false });
    app.decorate("config", { NODE_ENV: "test" } as AppConfig);
    app.decorate("db", { query, end: vi.fn() });
    app.setErrorHandler((error, _request, reply) => {
      const apiError = toApiError(error);
      return reply.code(apiError.statusCode).send(formatError(apiError));
    });
    await registerUserRoutes(app);
  });

  afterEach(async () => { await app.close(); });

  it.each([
    { name: "in-area physical location", physical: nyc, pin: null, allowed: true },
    { name: "OOS physical location", physical: outside, pin: null, allowed: false },
    { name: "OOS mutual with a precise-location grant", physical: outside, pin: null, allowed: false },
    { name: "OOS physical location with an active in-area MHC pin", physical: outside, pin: nyc, allowed: true },
    { name: "in-area physical location with an in-area MHC pin", physical: nyc, pin: nyc, allowed: true },
    { name: "in-area physical location with an effective OOS pin", physical: nyc, pin: outside, allowed: false },
    { name: "missing encrypted location", physical: null, pin: null, allowed: false },
    { name: "missing encrypted location even with an active MHC pin", physical: null, pin: nyc, allowed: false }
  ])("returns only geographic eligibility for $name", async ({ physical, pin, allowed }) => {
    const viewerLocation = physical ? location(physical) : null;
    mocks.loadLocationEnvelopes.mockResolvedValue(new Map(viewerLocation ? [[userId, viewerLocation]] : []));
    const activeTravelPin = pin ? travelPin(pin) : null;
    mocks.loadTravelPins.mockResolvedValue(new Map(activeTravelPin ? [[userId, activeTravelPin]] : []));
    mocks.getRelationshipPermissions.mockResolvedValue({ isMutualCruush: true, canRevealPreciseLocation: true });

    const response = await app.inject({
      method: "GET", url: "/api/users/map-access", headers: { "x-user-id": userId }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ data: {
      profilePinsAllowed: allowed,
      accessExpiresAtMs: allowed && viewerLocation
        ? physical === outside && activeTravelPin
          ? Math.min(viewerLocation.expiresAtMs, activeTravelPin.expiresAtMs)
          : viewerLocation.expiresAtMs
        : null
    } });
    expect(response.headers["cache-control"]).toBe("no-store");
    for (const lookup of [mocks.loadLocationEnvelopes, mocks.loadTravelPins]) {
      expect(lookup).toHaveBeenCalledTimes(1);
      expect(lookup.mock.calls[0][1]).toEqual([userId]);
    }
    expect(mocks.getRelationshipPermissions).not.toHaveBeenCalled();
    expect(query).not.toHaveBeenCalled();
  });

  it.each([
    { name: "earlier dependent MHC expiry", physical: outside, pinTtlMs: 30_000, expectedTtlMs: 30_000 },
    { name: "GPS expiry before later dependent MHC expiry", physical: outside, pinTtlMs: 120_000, expectedTtlMs: 60_000 },
    { name: "GPS expiry despite earlier nonessential MHC expiry", physical: nyc, pinTtlMs: 30_000, expectedTtlMs: 60_000 },
    { name: "GPS expiry despite later nonessential MHC expiry", physical: nyc, pinTtlMs: 120_000, expectedTtlMs: 60_000 }
  ])("bounds allowed access by $name", async ({ physical, pinTtlMs, expectedTtlMs }) => {
    const nowMs = Date.now();
    const viewerLocation = { ...location(physical), expiresAtMs: nowMs + 60_000 };
    const activeTravelPin = { ...travelPin(nyc), expiresAtMs: nowMs + pinTtlMs };
    mocks.loadLocationEnvelopes.mockResolvedValue(new Map([[userId, viewerLocation]]));
    mocks.loadTravelPins.mockResolvedValue(new Map([[userId, activeTravelPin]]));

    const response = await app.inject({
      method: "GET", url: "/api/users/map-access", headers: { "x-user-id": userId }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ data: {
      profilePinsAllowed: true, accessExpiresAtMs: nowMs + expectedTtlMs
    } });
    expect(mocks.getRelationshipPermissions).not.toHaveBeenCalled();
    expect(query).not.toHaveBeenCalled();
  });

  it("requires authentication before any location lookup", async () => {
    const response = await app.inject({ method: "GET", url: "/api/users/map-access" });
    expect(response.statusCode).toBe(401);
    expect(mocks.loadLocationEnvelopes).not.toHaveBeenCalled();
    expect(mocks.loadTravelPins).not.toHaveBeenCalled();
  });

  it("denies the OOS viewer after their in-area MHC pin expires", async () => {
    const activeTravelPin = travelPin(nyc);
    const viewerLocation = { ...location(outside), expiresAtMs: activeTravelPin.expiresAtMs + 60_000 };
    mocks.loadLocationEnvelopes.mockResolvedValue(new Map([[userId, viewerLocation]]));
    mocks.loadTravelPins
      .mockResolvedValueOnce(new Map([[userId, activeTravelPin]]))
      // The existing loader omits pins at or beyond the established 24-hour TTL.
      .mockResolvedValueOnce(new Map());

    const request = { method: "GET" as const, url: "/api/users/map-access", headers: { "x-user-id": userId } };
    expect((await app.inject(request)).json()).toEqual({ data: {
      profilePinsAllowed: true, accessExpiresAtMs: activeTravelPin.expiresAtMs
    } });
    expect((await app.inject(request)).json()).toEqual({ data: {
      profilePinsAllowed: false, accessExpiresAtMs: null
    } });
  });

  it("does not accept client-supplied coordinates or a different viewer", async () => {
    const response = await app.inject({
      method: "GET", url: "/api/users/map-access?lat=40.7128&lng=-74.006&userId=other",
      headers: { "x-user-id": userId }
    });
    expect(response.statusCode).toBe(400);
    expect(mocks.loadLocationEnvelopes).not.toHaveBeenCalled();
    expect(mocks.loadTravelPins).not.toHaveBeenCalled();
  });

  it("does not grant access when location storage fails", async () => {
    mocks.loadLocationEnvelopes.mockRejectedValue(new Error("storage unavailable"));
    const response = await app.inject({
      method: "GET", url: "/api/users/map-access", headers: { "x-user-id": userId }
    });
    expect(response.statusCode).toBe(500);
    expect(response.json()).not.toHaveProperty("data.profilePinsAllowed", true);
  });
});
