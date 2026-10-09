import type { FastifyInstance } from "fastify";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadLocationEnvelopes, type LocationPayload } from "./location-privacy.js";
import { emptyProfile } from "./profile-schema.js";
import { encryptProfileVisibility } from "./profile-sensitive.js";
import { getViewerOutsideServiceArea, loadOosHiddenProfileIds } from "./profile-oos-visibility.js";
import { loadTravelPins, type TravelPin } from "./travel-pins.js";

vi.mock("./location-privacy.js", async (importOriginal) => ({
  ...await importOriginal<typeof import("./location-privacy.js")>(),
  loadLocationEnvelopes: vi.fn()
}));
vi.mock("./travel-pins.js", async (importOriginal) => ({
  ...await importOriginal<typeof import("./travel-pins.js")>(),
  loadTravelPins: vi.fn()
}));

const config = {
  SESSION_SECRET: "test-only-oos-secret",
  PROFILE_ENCRYPTION_KEY: "test-only-profile-encryption-key"
} as FastifyInstance["config"];
const viewerId = "00000000-0000-4000-8000-000000000001";
const targetId = "00000000-0000-4000-8000-000000000002";
const otherId = "00000000-0000-4000-8000-000000000003";

function location(lat: number, lng: number): LocationPayload {
  return {
    version: 1,
    subjectUserId: viewerId,
    locationVersion: 1,
    latE7: Math.round(lat * 10_000_000),
    lonE7: Math.round(lng * 10_000_000),
    accuracyM: 20,
    source: "GPS",
    deviceReportedAtMs: 1,
    collectedAtMs: 1,
    expiresAtMs: 2,
    keyVersion: "v1"
  };
}

function pin(lat: number, lng: number): TravelPin {
  return {
    userId: viewerId,
    latitude: lat,
    longitude: lng,
    label: "",
    setAtMs: 1,
    movableAtMs: 2,
    expiresAtMs: 3
  };
}

function appWithRows(rows: unknown[] = []) {
  return {
    config,
    db: { query: vi.fn().mockResolvedValue({ rows }) }
  } as unknown as Pick<FastifyInstance, "config" | "db">;
}

beforeEach(() => {
  vi.mocked(loadLocationEnvelopes).mockReset();
  vi.mocked(loadTravelPins).mockReset();
  vi.mocked(loadLocationEnvelopes).mockResolvedValue(new Map([[viewerId, location(40.7128, -74.006)]]));
  vi.mocked(loadTravelPins).mockResolvedValue(new Map());
});

describe("profile Out of Sight visibility", () => {
  it("classifies encrypted effective location and lets an in-area Mile High Club pin exempt an outside viewer", async () => {
    const app = appWithRows();
    vi.mocked(loadLocationEnvelopes).mockResolvedValue(new Map([[viewerId, location(42.3601, -71.0589)]]));
    expect(await getViewerOutsideServiceArea(app, viewerId)).toBe(true);

    vi.mocked(loadTravelPins).mockResolvedValue(new Map([[viewerId, pin(40.7128, -74.006)]]));
    expect(await getViewerOutsideServiceArea(app, viewerId)).toBe(false);
    expect(loadLocationEnvelopes).toHaveBeenCalledWith(app, [viewerId]);
    expect(loadTravelPins).toHaveBeenCalledWith(app, [viewerId]);
  });

  it("fails closed without an encrypted viewer location", async () => {
    vi.mocked(loadLocationEnvelopes).mockResolvedValue(new Map());
    vi.mocked(loadTravelPins).mockResolvedValue(new Map([[viewerId, pin(40.7128, -74.006)]]));
    expect(await getViewerOutsideServiceArea(appWithRows(), viewerId)).toBe(true);
  });

  it("filters only opted-in profiles, skips self, and hides unreadable encrypted policies", async () => {
    const hiddenRules = encryptProfileVisibility(config, {
      ...emptyProfile.visibility_rules,
      outside_service_area_members: true
    });
    const publicRules = encryptProfileVisibility(config, emptyProfile.visibility_rules);
    const app = appWithRows([
      { id: viewerId, ...hiddenRules },
      { id: targetId, ...hiddenRules },
      { id: otherId, ...publicRules },
      {
        id: "00000000-0000-4000-8000-000000000004",
        ...hiddenRules,
        profile_visibility_auth_tag: Buffer.alloc(16).toString("base64")
      }
    ]);
    const ids = [viewerId, targetId, otherId, "00000000-0000-4000-8000-000000000004"];

    expect(await loadOosHiddenProfileIds(app, viewerId, ids, true)).toEqual(new Set([targetId, ids[3]]));
    expect(await loadOosHiddenProfileIds(app, viewerId, ids, false)).toEqual(new Set([ids[3]]));
    expect(app.db.query).toHaveBeenCalledWith(expect.stringContaining("from profiles"), [[targetId, otherId, ids[3]]]);
  });

  it("computes effective OOS once when the caller does not provide it", async () => {
    const rules = encryptProfileVisibility(config, {
      ...emptyProfile.visibility_rules,
      outside_service_area_members: true
    });
    vi.mocked(loadLocationEnvelopes).mockResolvedValue(new Map());
    expect(await loadOosHiddenProfileIds(appWithRows([{ id: targetId, ...rules }]), viewerId, [targetId]))
      .toEqual(new Set([targetId]));
  });
});
