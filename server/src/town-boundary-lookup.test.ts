import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { deflateSync } from "node:zlib";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MAX_PENDING_TOWN_LOOKUPS, MAX_TOWN_LOOKUP_POINTS, TownBoundaryLookup } from "./town-boundary-lookup.js";
import { containsTownPoint } from "./town-boundary-worker.js";

type XY = [number, number];
const square: XY[] = [[0, 0], [2, 0], [2, 2], [0, 2], [0, 0]];
const point = { lat: 1, lng: 1 };
function polygon(rings: XY[][] = [square], little = true) {
  const buffer = Buffer.alloc(9 + rings.reduce((sum, ring) => sum + 4 + ring.length * 16, 0));
  let offset = 0;
  buffer[offset++] = little ? 1 : 0;
  const uint = (value: number) => { little ? buffer.writeUInt32LE(value, offset) : buffer.writeUInt32BE(value, offset); offset += 4; };
  const double = (value: number) => { little ? buffer.writeDoubleLE(value, offset) : buffer.writeDoubleBE(value, offset); offset += 8; };
  uint(3); uint(rings.length);
  for (const ring of rings) { uint(ring.length); for (const [x, y] of ring) { double(x); double(y); } }
  return buffer;
}
function multi(parts: Buffer[]) {
  const header = Buffer.alloc(9);
  header[0] = 1; header.writeUInt32LE(6, 1); header.writeUInt32LE(parts.length, 5);
  return Buffer.concat([header, ...parts]);
}

describe("bounded WKB town containment", () => {
  it("handles Polygon, either endian, holes and MultiPolygon without nearest-city fallback", () => {
    expect(containsTownPoint(polygon(), point)).toBe(true);
    expect(containsTownPoint(polygon([square], false), point)).toBe(true);
    expect(containsTownPoint(polygon(), { lat: 3, lng: 3 })).toBe(false);
    expect(containsTownPoint(polygon([square, [[.5,.5],[1.5,.5],[1.5,1.5],[.5,1.5],[.5,.5]]]), point)).toBe(false);
    expect(containsTownPoint(multi([polygon()]), point)).toBe(true);
  });
  it("treats boundary and malformed, unsupported, nested or oversized geometry as unknown", () => {
    expect(containsTownPoint(polygon(), { lat: 1, lng: 0 })).toBeNull();
    expect(containsTownPoint(polygon().subarray(0, 12), point)).toBeNull();
    expect(containsTownPoint(Buffer.concat([polygon(), Buffer.from([0])]), point)).toBeNull();
    expect(containsTownPoint(polygon([square.slice(0, 4)]), point)).toBeNull();
    expect(containsTownPoint(polygon([[[NaN,0], ...square.slice(1)]]), point)).toBeNull();
    expect(containsTownPoint(multi([multi([polygon()])]), point)).toBeNull();
    expect(containsTownPoint(Buffer.alloc(8 * 1024 * 1024 + 1), point)).toBeNull();
    expect(containsTownPoint(polygon(), point, 0)).toBeNull();
  });
});

describe("read-only town worker", () => {
  let directory: string;
  let databasePath: string;
  let client: TownBoundaryLookup | undefined;
  let manifest: Record<string, unknown>;
  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "cruush-town-worker-test-"));
    databasePath = join(directory, "towns.sqlite");
  });
  afterEach(async () => {
    await client?.close();
    client = undefined;
    await rm(directory, { recursive: true, force: true });
  });
  async function fixture(options: {
    count?: number; geometry?: Buffer; compressed?: Buffer; name?: string; country?: string;
    region?: string | null; schema?: string; subtype?: string;
  } = {}) {
    const db = new DatabaseSync(databasePath);
    try {
      db.exec(options.schema ?? `CREATE TABLE town(id INTEGER PRIMARY KEY,area_id TEXT,division_id TEXT,name TEXT,
        subtype TEXT,country TEXT,region TEXT,geometry_zlib BLOB);
        CREATE VIRTUAL TABLE bounds USING rtree(id,xmin,xmax,ymin,ymax);`);
      if (!options.schema) {
        const insert = db.prepare("INSERT INTO town VALUES(?,?,?,?,?,?,?,?)");
        const bbox = db.prepare("INSERT INTO bounds VALUES(?,0,2,0,2)");
        for (let i = 1; i <= (options.count ?? 1); i++) {
          insert.run(i, `synthetic-${i}`, `synthetic-division-${i}`, options.name ?? "Holmdel", options.subtype ?? "locality",
            options.country ?? "US", options.region === undefined ? "US-NJ" : options.region,
            options.compressed ?? deflateSync(options.geometry ?? polygon()));
          bbox.run(i);
        }
      }
    } finally { db.close(); }
    const bytes = await readFile(databasePath);
    manifest = { format: "cruush-town-boundaries", version: 1, complete: true, bytes: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"), datasetVersion: "synthetic-test-only" };
    await writeFile(`${databasePath}.manifest.json`, JSON.stringify(manifest));
  }
  function lookup(points = [point]) { client ??= new TownBoundaryLookup(databasePath); return client.lookup(points); }

  it("starts the actual Node worker, returns the town/state, leaves the artifact byte-for-byte unchanged", async () => {
    await fixture();
    const before = await readFile(databasePath);
    expect(await lookup([point, { lat: 50, lng: 50 }, { lat: 1, lng: 0 }])).toEqual(["Holmdel, NJ", null, null]);
    expect(await lookup()).toEqual(["Holmdel, NJ"]);
    expect(await readFile(databasePath)).toEqual(before);
  });
  it.each([
    { name: "São Paulo", country: "BR", region: "BR-SP", expected: "São Paulo, Brazil" },
    { name: "Vancouver", country: "CA", region: "CA-BC", expected: "Vancouver, Canada" },
    { name: "Paris", country: "FR", region: null, expected: "Paris, France" }
  ])("preserves exact town name and uses full English country for $country", async ({ expected, ...metadata }) => {
    await fixture(metadata);
    expect(await lookup()).toEqual([expected]);
  });
  it("accepts a unique localadmin town without inventing a hierarchy preference", async () => {
    await fixture({ subtype: "localadmin" });
    expect(await lookup()).toEqual(["Holmdel, NJ"]);
  });
  it.each([
    ["incomplete", { complete: false }], ["version", { version: 2 }], ["format", { format: "other" }],
    ["hash", { sha256: "0".repeat(64) }], ["size", { bytes: 12 }], ["dataset", { datasetVersion: "" }],
    ["typed completion", { complete: "true" }], ["typed version", { version: "1" }],
    ["typed bytes", { bytes: "32768" }], ["control metadata", { datasetVersion: "release\nnext" }]
  ])("rejects %s manifests", async (_name, patch) => {
    await fixture();
    await writeFile(`${databasePath}.manifest.json`, JSON.stringify({ ...manifest, ...patch }));
    expect(await lookup()).toEqual([null]);
  });
  it("fails closed for missing data and missing or oversized manifest", async () => {
    expect(await lookup()).toEqual([null]);
    await client!.close(); client = undefined;
    await fixture();
    await rm(`${databasePath}.manifest.json`);
    expect(await lookup()).toEqual([null]);
    await client!.close(); client = undefined;
    await writeFile(`${databasePath}.manifest.json`, " ".repeat(64 * 1024 + 1));
    expect(await lookup()).toEqual([null]);
  });
  it.each([2, 129])("returns unknown for overlapping or over-limit candidates (%s)", async (count) => {
    await fixture({ count });
    expect(await lookup()).toEqual([null]);
  });
  it.each([
    { geometry: Buffer.from("invalid-wkb") },
    { compressed: Buffer.from("invalid-zlib") },
    { compressed: deflateSync(Buffer.alloc(8 * 1024 * 1024 + 1)) },
    { compressed: Buffer.alloc(4 * 1024 * 1024 + 1) },
    { name: "Town\nunsafe" }, { name: "Town\0suffix" }, { name: "\ufeffTown" }, { name: " Town" }, { name: "x".repeat(481) },
    { region: "CA-BC" }, { country: "ZZ", region: null }, { country: "XX", region: null },
    { country: "US\0", region: "US-NJ" }, { region: "US-QQ" }, { region: null },
    { schema: "CREATE TABLE town(id INTEGER PRIMARY KEY); CREATE TABLE bounds(id INTEGER);" }
  ])("rejects malformed or over-budget artifacts %#", async (options) => {
    await fixture(options);
    expect(await lookup()).toEqual([null]);
  });
  it("invalidates cached geometry when artifact metadata changes, without a coordinate cache", async () => {
    await fixture();
    expect(await lookup()).toEqual(["Holmdel, NJ"]);
    await writeFile(`${databasePath}.manifest.json`, JSON.stringify({ ...manifest, complete: false }));
    expect(await lookup()).toEqual([null]);
    expect(await lookup()).toEqual([null]);
  });
  it("rejects a sidecar journal not covered by the verified database hash", async () => {
    await fixture();
    await writeFile(`${databasePath}-wal`, "synthetic-unverified");
    expect(await lookup()).toEqual([null]);
  });
  it("bounds queued requests and points; close settles all pending work", async () => {
    await fixture();
    client = new TownBoundaryLookup(databasePath);
    const requests = Array.from({ length: MAX_PENDING_TOWN_LOOKUPS + 3 }, () => client!.lookup([point]));
    const results = await Promise.all(requests);
    expect(results.slice(0, MAX_PENDING_TOWN_LOOKUPS)).toEqual(Array.from({ length: MAX_PENDING_TOWN_LOOKUPS }, () => ["Holmdel, NJ"]));
    expect(results.slice(MAX_PENDING_TOWN_LOOKUPS)).toEqual([[null], [null], [null]]);
    expect(await lookup(Array.from({ length: MAX_TOWN_LOOKUP_POINTS + 1 }, () => point))).toEqual([]);
    const pending = lookup();
    await client.close();
    expect(await pending).toEqual([null]);
    expect(await lookup()).toEqual([null]);
  });
  it("does not accept invalid coordinates", async () => {
    await fixture();
    expect(await lookup([{ lat: NaN, lng: 0 }, { lat: 91, lng: 0 }, { lat: 0, lng: Infinity }])).toEqual([null, null, null]);
  });
});
