import { encryptSensitiveProfile } from "./profile-sensitive.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildDefaultVisibilityPolicy, type LocationPayload } from "./location-privacy.js";
import { resolveVisibilityLocation } from "./visibility-location.js";

const mocks = vi.hoisted(() => ({ policy: vi.fn(), relationship: vi.fn(), ghost: vi.fn(), revoked: vi.fn() }));
vi.mock("./match-relationships.js", () => ({ getEffectiveVisibilityPolicy: mocks.policy, getRelationshipPermissions: mocks.relationship }));
vi.mock("./location-privacy.js", async original => ({
  ...await original<typeof import("./location-privacy.js")>(),
  resolveViewerGhostCoordinate: mocks.ghost, isPreciseLocationRevoked: mocks.revoked
}));
const app = { config: { SESSION_SECRET: "visibility-location-test-only" } } as FastifyInstance;
const location = { latE7: 407128000, lonE7: -740060000 } as LocationPayload;
const input = { viewerUserId: "viewer", subjectUserId: "subject", location };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.policy.mockResolvedValue(buildDefaultVisibilityPolicy(app.config, "subject"));
  mocks.relationship.mockResolvedValue({ canRevealPreciseLocation: false });
  mocks.ghost.mockResolvedValue({ coordinate: { lat: 40.72, lng: -74.02 } });
  mocks.revoked.mockResolvedValue(false);
});

describe("viewer-authorized distance coordinates", () => {
  it("uses only the common decoy and a conservative bound for an unauthorized Ghost viewer", async () => {
    const result = await resolveVisibilityLocation(app, input);
    expect(result?.coordinate).toEqual({ lat: 40.72, lng: -74.02 });
    expect(result!.uncertaintyMiles).toBeGreaterThan(1);
    expect(await resolveVisibilityLocation(app, { ...input,
      location: { ...location, latE7: 407130000, lonE7: -740058000 } })).toEqual(result);
  });

  it("keeps the active rotation radius bound when settings shrink the next radius", async () => {
    const policy = buildDefaultVisibilityPolicy(app.config, "subject");
    policy.ghostRadiusMeters = 152;
    mocks.policy.mockResolvedValue(policy);
    mocks.ghost.mockResolvedValue({ coordinate: { lat: 40.72, lng: -74.02 }, radiusMeters: 8047 });
    expect((await resolveVisibilityLocation(app, input))!.uncertaintyMiles).toBeGreaterThan(5);
  });

  it("preserves an active precise-location grant", async () => {
    mocks.relationship.mockResolvedValue({ canRevealPreciseLocation: true });
    expect(await resolveVisibilityLocation(app, input)).toEqual({ coordinate: { lat: 40.7128, lng: -74.006 }, uncertaintyMiles: 0 });
    expect(mocks.ghost).not.toHaveBeenCalled();
  });

  it("honors the same crowd grant and its revocation", async () => {
    const policy = buildDefaultVisibilityPolicy(app.config, "subject");
    policy.preciseToMutualCrowds = [{ crowdId: "T4T", precisionEnabled: true,
      mutualityRequired: true, minimumTrustLevel: "MEMBER", createdAtMs: 1, revokedAtMs: null }];
    mocks.policy.mockResolvedValue(policy);
    const crowdInput = { ...input, viewerCrowds: ["T4T"], subjectCrowds: ["T4T"] };
    expect((await resolveVisibilityLocation(app, crowdInput))?.uncertaintyMiles).toBe(0);
    mocks.revoked.mockResolvedValue(true);
    expect((await resolveVisibilityLocation(app, crowdInput))?.uncertaintyMiles).toBeGreaterThan(1);
    expect((await resolveVisibilityLocation(app, { ...crowdInput, viewerCrowds: [] }))?.uncertaintyMiles).toBeGreaterThan(1);
  });

  it("loads encrypted crowd membership when route callers have not preloaded it", async () => {
    const policy = buildDefaultVisibilityPolicy(app.config, "subject");
    policy.preciseToMutualCrowds = [{ crowdId: "T4T", precisionEnabled: true,
      mutualityRequired: true, minimumTrustLevel: "MEMBER", createdAtMs: 1, revokedAtMs: null }];
    mocks.policy.mockResolvedValue(policy);
    const encrypted = encryptSensitiveProfile(app.config, { is_trans: false, crowds: ["T4T"],
      kinks: [], kink_interests: [], hiv_status: [], custom_hiv_status: "" });
    const query = vi.fn().mockResolvedValue({ rows: [
      { id: "viewer", ...encrypted }, { id: "subject", ...encrypted }
    ] });
    const withDb = { ...app, db: { query } } as unknown as FastifyInstance;
    expect((await resolveVisibilityLocation(withDb, input))?.uncertaintyMiles).toBe(0);
    expect(query).toHaveBeenCalledTimes(1);
    mocks.revoked.mockResolvedValue(true);
    expect((await resolveVisibilityLocation(withDb, input))?.uncertaintyMiles).toBeGreaterThan(1);
  });

  it("fails closed instead of returning real coordinates on privacy errors", async () => {
    mocks.ghost.mockRejectedValue(new Error("placement unavailable"));
    await expect(resolveVisibilityLocation(app, input)).rejects.toThrow("placement unavailable");
    mocks.policy.mockRejectedValue(new Error("policy unavailable"));
    await expect(resolveVisibilityLocation(app, input)).rejects.toThrow("policy unavailable");
  });

  it("returns no position for Stealth and preserves public precise and self positions", async () => {
    mocks.policy.mockResolvedValue({ baseMode: "STEALTH" });
    expect(await resolveVisibilityLocation(app, input)).toBeNull();
    mocks.policy.mockResolvedValue({ baseMode: "PUBLIC_PRECISE" });
    expect((await resolveVisibilityLocation(app, input))?.uncertaintyMiles).toBe(0);
    mocks.policy.mockClear();
    expect((await resolveVisibilityLocation(app, { ...input, viewerUserId: "subject" }))?.uncertaintyMiles).toBe(0);
    expect(mocks.policy).not.toHaveBeenCalled();
  });
});
