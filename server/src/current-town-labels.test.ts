import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppConfig } from "./config.js";
import { storeLocationEnvelope, type LocationPayload } from "./location-privacy.js";
import { closeCurrentTownLookup, loadCurrentTownLabels } from "./current-town-labels.js";

const mocks = vi.hoisted(() => ({ construct: vi.fn(), lookup: vi.fn(), close: vi.fn() }));
vi.mock("./town-boundary-lookup.js", async (original) => ({
  ...await original<typeof import("./town-boundary-lookup.js")>(),
  TownBoundaryLookup: class {
    constructor(path: string) { mocks.construct(path); }
    lookup(points: unknown) { return mocks.lookup(points); }
    close() { return mocks.close(); }
  }
}));
const config = {
  NODE_ENV: "test", SESSION_SECRET: "synthetic-current-town-location-test-key",
  TOWN_BOUNDARY_DATABASE_PATH: "/synthetic/towns.sqlite"
} as AppConfig;
const query = vi.fn();
const context = { config, db: { query } as never };
let envelopes: Array<Record<string, unknown>>;

async function seed(subjectUserId: string, options: { source?: LocationPayload["source"]; stale?: boolean } = {}) {
  const capture = vi.fn(async (_sql: string, _values: unknown[]) => ({ rows: [] }));
  const clock = options.stale ? vi.spyOn(Date, "now").mockReturnValue(Date.now() - 5 * 24 * 60 * 60 * 1000) : null;
  try {
    await storeLocationEnvelope({ config, db: { query: capture } as never }, {
      subjectUserId, lat: 40.3768018, lng: -74.1725354, source: options.source ?? "GPS"
    });
  } finally { clock?.mockRestore(); }
  const values = capture.mock.calls[0][1];
  envelopes.push(Object.fromEntries([
    "subject_user_id", "location_version", "location_ciphertext", "location_nonce", "location_auth_tag",
    "wrapped_location_dek", "location_dek_nonce", "location_dek_auth_tag", "key_version", "coarse_index_tokens",
    "collected_at_ms", "expires_at_ms"
  ].map((key, i) => [key, values[i]])));
}

beforeEach(async () => {
  vi.clearAllMocks();
  envelopes = [];
  mocks.lookup.mockResolvedValue(["Holmdel, NJ"]);
  mocks.close.mockResolvedValue(undefined);
  query.mockImplementation(async (sql: string, values: unknown[]) => {
    if (!sql.includes("from encrypted_location_envelopes")) throw new Error("Unexpected source; GPS only");
    return { rows: envelopes.filter((row) => (values[0] as string[]).includes(row.subject_user_id as string)) };
  });
});
afterEach(async () => { vi.restoreAllMocks(); await closeCurrentTownLookup(); });

describe("town labels from the existing current encrypted GPS envelope only", () => {
  it("does nothing without configuration or subjects", async () => {
    expect(await loadCurrentTownLabels({ ...context, config: { ...config, TOWN_BOUNDARY_DATABASE_PATH: "" } }, ["member"])).toEqual(new Map());
    expect(await loadCurrentTownLabels(context, [])).toEqual(new Map());
    expect(query).not.toHaveBeenCalled();
    expect(mocks.construct).not.toHaveBeenCalled();
  });
  it("decrypts the existing physical GPS, excludes expired/manual/missing and sends no member IDs to the worker", async () => {
    await seed("gps");
    await seed("expired", { stale: true });
    await seed("manual", { source: "MANUAL" });
    expect(await loadCurrentTownLabels(context, ["gps", "expired", "manual", "missing", "gps"])).toEqual(new Map([["gps", "Holmdel, NJ"]]));
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][1][0]).toEqual(["gps", "expired", "manual", "missing"]);
    expect(mocks.lookup).toHaveBeenCalledWith([{ lat: 40.3768018, lng: -74.1725354 }]);
    expect(JSON.stringify(mocks.lookup.mock.calls)).not.toContain("gps");
  });
  it("does not return a label when all GPS fixes have expired, regardless of stored membership", async () => {
    await seed("expired", { stale: true });
    expect(await loadCurrentTownLabels(context, ["expired"])).toEqual(new Map());
    expect(mocks.lookup).not.toHaveBeenCalled();
    expect(query.mock.calls.every(([sql]) => !sql.includes("oos_service_area_state") && !sql.includes("travel"))).toBe(true);
  });
  it("omits unreadable encrypted GPS and never falls back to a historical snapshot or external geocoder", async () => {
    await seed("gps");
    envelopes[0].location_auth_tag = Buffer.alloc(16).toString("base64");
    expect(await loadCurrentTownLabels(context, ["gps"])).toEqual(new Map());
    expect(mocks.lookup).not.toHaveBeenCalled();
    query.mockRejectedValue(new Error("synthetic unavailable"));
    expect(await loadCurrentTownLabels(context, ["gps"])).toEqual(new Map());
  });
  it("omits unknown results, worker failures, and GPS which expires while waiting", async () => {
    await seed("gps");
    mocks.lookup.mockResolvedValueOnce([null]);
    expect(await loadCurrentTownLabels(context, ["gps"])).toEqual(new Map());
    mocks.lookup.mockRejectedValueOnce(new Error("synthetic failure"));
    expect(await loadCurrentTownLabels(context, ["gps"])).toEqual(new Map());
    mocks.lookup.mockImplementationOnce(async () => {
      vi.spyOn(Date, "now").mockReturnValue(Date.now() + 5 * 24 * 60 * 60 * 1000);
      return ["Holmdel, NJ"];
    });
    expect(await loadCurrentTownLabels(context, ["gps"])).toEqual(new Map());
  });
  it("bounds the encrypted read to 128 distinct subjects", async () => {
    await seed("member-0");
    await loadCurrentTownLabels(context, Array.from({ length: 200 }, (_, i) => `member-${i}`));
    expect(query.mock.calls[0][1][0]).toHaveLength(128);
    expect(query.mock.calls[0][1][0]).not.toContain("member-128");
  });
  it("reuses one worker across concurrent calls but never caches members' coordinates or results", async () => {
    await seed("gps");
    const results = await Promise.all(Array.from({ length: 3 }, () => loadCurrentTownLabels(context, ["gps"])));
    expect(results).toEqual(Array.from({ length: 3 }, () => new Map([["gps", "Holmdel, NJ"]])));
    expect(mocks.construct).toHaveBeenCalledTimes(1);
    expect(query).toHaveBeenCalledTimes(3);
    expect(mocks.lookup).toHaveBeenCalledTimes(3);
  });
});
