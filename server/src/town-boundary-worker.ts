import { createHash } from "node:crypto";
import { closeSync, constants, existsSync, fstatSync, lstatSync, openSync, readSync } from "node:fs";
import { isAbsolute } from "node:path";
import { DatabaseSync, type StatementSync } from "node:sqlite";
import { TextDecoder } from "node:util";
import { parentPort, workerData } from "node:worker_threads";
import { inflateSync } from "node:zlib";
import type { TownPoint } from "./town-boundary-lookup.js";

const MAX_POINTS = 128;
const MAX_CANDIDATES = 128;
const MAX_COMPRESSED_BYTES = 4 * 1024 * 1024;
const MAX_GEOMETRY_BYTES = 8 * 1024 * 1024;
const MAX_CACHE_BYTES = 32 * 1024 * 1024;
const MAX_CACHE_ENTRIES = 64;
const MAX_BATCH_MS = 250;
const countryNames = new Intl.DisplayNames(["en"], { type: "region", fallback: "none" });
const utf8 = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
const US_REGIONS = new Set("AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY AS GU MP PR UM VI".split(" "));
const fail = (): never => { throw new Error("Town boundary unavailable."); };

function signature(path: string) {
  const info = lstatSync(path);
  if (!info.isFile()) return fail();
  return `${info.dev}:${info.ino}:${info.size}:${info.mtimeMs}:${info.ctimeMs}`;
}

function verifyArtifact(path: string) {
  if (!isAbsolute(path) || path.includes("\0")) return fail();
  const manifestPath = `${path}.manifest.json`;
  const manifestSignature = signature(manifestPath);
  const manifestFd = openSync(manifestPath, constants.O_RDONLY | constants.O_NOFOLLOW);
  let manifest: Record<string, unknown>;
  try {
    const bytes = Buffer.alloc(64 * 1024 + 1);
    const count = readSync(manifestFd, bytes, 0, bytes.length, 0);
    if (!count || count === bytes.length) return fail();
    manifest = JSON.parse(bytes.subarray(0, count).toString("utf8"));
  } finally { closeSync(manifestFd); }
  if (!manifest || manifest.format !== "cruush-town-boundaries" || manifest.version !== 1
    || manifest.complete !== true || typeof manifest.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(manifest.sha256)
    || typeof manifest.bytes !== "number" || !Number.isSafeInteger(manifest.bytes)
    || manifest.bytes < 100 || manifest.bytes > 32 * 1024 ** 3
    || typeof manifest.datasetVersion !== "string" || !manifest.datasetVersion.trim()
    || manifest.datasetVersion !== manifest.datasetVersion.trim() || /[\u0000-\u001f\u007f-\u009f]/.test(manifest.datasetVersion)
    || manifest.datasetVersion.length > 128) return fail();
  const databaseSignature = signature(path);
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    if (fstatSync(fd).size !== manifest.bytes) return fail();
    const hash = createHash("sha256");
    const chunk = Buffer.alloc(1024 * 1024);
    let offset = 0;
    while (offset < manifest.bytes) {
      const count = readSync(fd, chunk, 0, Math.min(chunk.length, manifest.bytes - offset), offset);
      if (!count || (offset === 0 && !chunk.subarray(0, 16).equals(Buffer.from("SQLite format 3\0")))) return fail();
      hash.update(chunk.subarray(0, count));
      offset += count;
    }
    if (hash.digest("hex") !== manifest.sha256) return fail();
  } finally { closeSync(fd); }
  const unchanged = () => signature(path) === databaseSignature && signature(manifestPath) === manifestSignature
    && !["-wal", "-shm", "-journal"].some((suffix) => existsSync(path + suffix));
  if (!unchanged()) return fail();
  return unchanged;
}

/** Strict 2D WKB Polygon/MultiPolygon; boundaries and unsupported data are unknown. */
export function containsTownPoint(bytes: Buffer, point: TownPoint, deadline = Infinity): boolean | null {
  let cursor = 0;
  let vertices = 0;
  const need = (length: number) => { if (cursor + length > bytes.length) fail(); };
  const checkTime = () => { if (performance.now() > deadline) fail(); };
  function geometry(polygonOnly = false): boolean | null {
    checkTime();
    need(5);
    const endian = bytes[cursor++];
    if (endian !== 0 && endian !== 1) return fail();
    const little = endian === 1;
    const uint = () => {
      need(4);
      const value = little ? bytes.readUInt32LE(cursor) : bytes.readUInt32BE(cursor);
      cursor += 4;
      return value;
    };
    const double = () => {
      need(8);
      const value = little ? bytes.readDoubleLE(cursor) : bytes.readDoubleBE(cursor);
      cursor += 8;
      return value;
    };
    const type = uint();
    if (type === 6 && !polygonOnly) {
      const count = uint();
      if (!count || count > 4096) return fail();
      let inside = false, boundary = false;
      for (let i = 0; i < count; i++) {
        const result = geometry(true);
        inside ||= result === true;
        boundary ||= result === null;
      }
      return boundary ? null : inside;
    }
    if (type !== 3) return fail();
    const rings = uint();
    if (!rings || rings > 4096) return fail();
    let outer = false, hole = false, boundary = false;
    for (let ring = 0; ring < rings; ring++) {
      const count = uint();
      vertices += count;
      if (count < 4 || vertices > 500_000) return fail();
      need(count * 16);
      let firstX = 0, firstY = 0, previousX = 0, previousY = 0, inside = false;
      for (let i = 0; i < count; i++) {
        if (i % 1024 === 0) checkTime();
        const x = double(), y = double();
        if (!Number.isFinite(x) || !Number.isFinite(y) || Math.abs(x) > 180 || Math.abs(y) > 90) return fail();
        if (i === 0) { firstX = x; firstY = y; }
        else {
          // This planar artifact format does not describe antimeridian wrapping.
          if (Math.abs(x - previousX) > 180) return fail();
          const cross = (point.lng - previousX) * (y - previousY) - (point.lat - previousY) * (x - previousX);
          const epsilon = 1e-10;
          if (Math.abs(cross) <= epsilon * Math.max(1, Math.abs(x - previousX) + Math.abs(y - previousY))
            && point.lng >= Math.min(previousX, x) - epsilon && point.lng <= Math.max(previousX, x) + epsilon
            && point.lat >= Math.min(previousY, y) - epsilon && point.lat <= Math.max(previousY, y) + epsilon) boundary = true;
          if ((previousY > point.lat) !== (y > point.lat)
            && point.lng < (x - previousX) * (point.lat - previousY) / (y - previousY) + previousX) inside = !inside;
        }
        previousX = x; previousY = y;
      }
      if (previousX !== firstX || previousY !== firstY) return fail();
      if (ring === 0) outer = inside; else hole ||= inside;
    }
    return boundary ? null : outer && !hole;
  }
  try {
    if (bytes.length > MAX_GEOMETRY_BYTES || !Number.isFinite(point.lat) || !Number.isFinite(point.lng)
      || Math.abs(point.lat) > 90 || Math.abs(point.lng) > 180) return null;
    const result = geometry();
    return cursor === bytes.length ? result : null;
  } catch { return null; }
}

function labelFor(raw: Record<string, unknown>): string | null {
  const text = (value: unknown) => value instanceof Uint8Array ? utf8.decode(value) : fail();
  // SQLite text extraction may truncate embedded NULs; decode bounded UTF-8 blobs instead.
  const row = { name: text(raw.name), subtype: text(raw.subtype), country: text(raw.country),
    region: raw.region === null ? null : text(raw.region) };
  if (typeof row.name !== "string" || !row.name.trim() || row.name.length > 120
    || row.name !== row.name.trim() || /[\u0000-\u001f\u007f-\u009f\ufffd]/.test(row.name)
    || !["locality", "localadmin"].includes(row.subtype)
    || typeof row.country !== "string" || !/^[A-Z]{2}$/.test(row.country)) return null;
  if (row.region !== null && (typeof row.region !== "string" || !/^[A-Z]{2}-[A-Z0-9-]{1,8}$/.test(row.region)
    || !row.region.startsWith(`${row.country}-`))) return null;
  if (row.country === "US") {
    const region = typeof row.region === "string" ? row.region.slice(3) : "";
    return US_REGIONS.has(region) ? `${row.name}, ${region}` : null;
  }
  if (["EU", "UN", "QO", "XA", "XB", "ZZ"].includes(row.country)) return null;
  const country = countryNames.of(row.country);
  const label = country && country !== row.country ? `${row.name}, ${country}` : null;
  return label && label.length <= 160 ? label : null;
}

class TownDatabase {
  private readonly db: DatabaseSync;
  private readonly candidates: StatementSync;
  private readonly geometry: StatementSync;
  private readonly unchanged: () => boolean;
  private readonly cache = new Map<number, Buffer>();
  private cacheBytes = 0;

  constructor(path: string) {
    this.unchanged = verifyArtifact(path);
    this.db = new DatabaseSync(path, { readOnly: true, enableDoubleQuotedStringLiterals: false, allowExtension: false });
    try {
      this.db.exec("PRAGMA query_only=ON; PRAGMA trusted_schema=OFF; PRAGMA cache_size=-4096; PRAGMA mmap_size=0; PRAGMA busy_timeout=0;");
      if (this.db.prepare("PRAGMA journal_mode").get()?.journal_mode !== "delete") fail();
      const schema = this.db.prepare("SELECT name, type, sql FROM sqlite_schema WHERE name IN ('town','bounds')").all();
      if (schema.length !== 2 || schema.some((row) => row.type !== "table")
        || !schema.some((row) => row.name === "town" && typeof row.sql === "string" && /^CREATE TABLE\b/i.test(row.sql))
        || !schema.some((row) => row.name === "bounds" && typeof row.sql === "string"
          && /^CREATE VIRTUAL TABLE\b/i.test(row.sql)
          && /USING\s+rtree\s*\(\s*id\s*,\s*xmin\s*,\s*xmax\s*,\s*ymin\s*,\s*ymax\s*\)/i.test(row.sql))) fail();
      const columns = this.db.prepare("PRAGMA table_info('town')").all();
      const types: Record<string, string> = { id: "INTEGER", area_id: "TEXT", division_id: "TEXT", name: "TEXT",
        subtype: "TEXT", country: "TEXT", region: "TEXT", geometry_zlib: "BLOB" };
      if (columns.length !== Object.keys(types).length || columns.some((column) =>
        typeof column.name !== "string" || column.type !== types[column.name] || (column.name === "id" && column.pk !== 1))) fail();
      this.candidates = this.db.prepare(`SELECT t.id,
        CASE WHEN typeof(t.name)='text' AND length(CAST(t.name AS BLOB)) BETWEEN 1 AND 480 THEN CAST(t.name AS BLOB) ELSE NULL END AS name,
        CASE WHEN typeof(t.subtype)='text' AND length(CAST(t.subtype AS BLOB))<=20 THEN CAST(t.subtype AS BLOB) ELSE NULL END AS subtype,
        CASE WHEN typeof(t.country)='text' AND length(CAST(t.country AS BLOB))=2 THEN CAST(t.country AS BLOB) ELSE NULL END AS country,
        CASE WHEN t.region IS NULL THEN NULL
          WHEN typeof(t.region)='text' AND length(CAST(t.region AS BLOB))<=20 THEN CAST(t.region AS BLOB) ELSE 'invalid' END AS region,
        typeof(t.geometry_zlib) AS geometry_type, length(t.geometry_zlib) AS geometry_bytes
        FROM bounds b JOIN town t ON b.id=t.id
        WHERE b.xmin<=? AND b.xmax>=? AND b.ymin<=? AND b.ymax>=? LIMIT 129`);
      this.geometry = this.db.prepare("SELECT geometry_zlib FROM town WHERE id=? AND length(geometry_zlib)<=?");
      if (!this.unchanged()) fail();
    } catch (error) { this.db.close(); throw error; }
  }

  lookup(points: TownPoint[]): Array<string | null> {
    if (!this.unchanged()) return fail();
    const deadline = performance.now() + MAX_BATCH_MS;
    const labels = points.map((point) => {
      if (!point || !Number.isFinite(point.lat) || !Number.isFinite(point.lng) || Math.abs(point.lat) > 90
        || Math.abs(point.lng) > 180 || performance.now() > deadline) return null;
      try {
        const rows = this.candidates.all(point.lng, point.lng, point.lat, point.lat);
        if (rows.length > MAX_CANDIDATES) return null;
        let label: string | null = null;
        for (const row of rows) {
          if (performance.now() > deadline || typeof row.id !== "number" || !Number.isSafeInteger(row.id)
            || row.geometry_type !== "blob" || typeof row.geometry_bytes !== "number"
            || row.geometry_bytes <= 0 || row.geometry_bytes > MAX_COMPRESSED_BYTES) return null;
          const candidateLabel = labelFor(row);
          if (!candidateLabel) return null;
          let geometry = this.cache.get(row.id);
          if (geometry) { this.cache.delete(row.id); this.cache.set(row.id, geometry); }
          else {
            const compressed = this.geometry.get(row.id, MAX_COMPRESSED_BYTES)?.geometry_zlib;
            if (!(compressed instanceof Uint8Array)) return null;
            geometry = inflateSync(compressed, { maxOutputLength: MAX_GEOMETRY_BYTES });
            while (this.cache.size && (this.cache.size >= MAX_CACHE_ENTRIES || this.cacheBytes + geometry.length > MAX_CACHE_BYTES)) {
              const oldest = this.cache.keys().next().value!;
              this.cacheBytes -= this.cache.get(oldest)!.length;
              this.cache.delete(oldest);
            }
            this.cache.set(row.id, geometry);
            this.cacheBytes += geometry.length;
          }
          const contains = containsTownPoint(geometry, point, deadline);
          if (contains === null) return null;
          if (contains) {
            if (label !== null) return null; // Never choose a nearest/largest/preferred overlapping town.
            label = candidateLabel;
          }
        }
        return label;
      } catch { return null; }
    });
    if (!this.unchanged()) return fail();
    return labels;
  }

  close() { this.cache.clear(); this.db.close(); }
}

if (parentPort) {
  const port = parentPort;
  let database: TownDatabase | undefined;
  try {
    if (typeof workerData?.databasePath !== "string") fail();
    database = new TownDatabase(workerData.databasePath);
    port.on("message", (message: { id?: number; points?: TownPoint[] }) => {
      try {
        if (!Number.isSafeInteger(message?.id) || !Array.isArray(message.points)
          || !message.points.length || message.points.length > MAX_POINTS) fail();
        port.postMessage({ type: "result", id: message.id, labels: database!.lookup(message.points!) });
      } catch {
        database?.close(); database = undefined;
        port.postMessage({ type: "unavailable" });
        port.close();
      }
    });
    port.postMessage({ type: "ready" });
  } catch {
    database?.close();
    port.postMessage({ type: "unavailable" });
    port.close();
  }
}
