import { VectorTile } from "@mapbox/vector-tile";
import Pbf from "pbf";

type Point = { x: number; y: number };
type WaterPolygon = { extent: number; rings: Point[][] };
const TILE_ZOOM = 14;
const TILE_COUNT = 2 ** TILE_ZOOM;
// Versioned public data keeps placement stable across requests and restarts.
// Same OpenFreeMap source as the map; only candidate tile addresses are sent.
const TILE_ROOT = "https://tiles.openfreemap.org/planet/20260906_080001_pt";
const tiles = new Map<string, Promise<WaterPolygon[]>>();

export class GhostLandUnavailableError extends Error {
  readonly statusCode = 503;
  constructor() { super("Ghost land placement is temporarily unavailable"); }
}

export function pointInWater(x: number, y: number, rings: Point[][]) {
  let inside = false;
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const a = ring[i], b = ring[j];
      const cross = (x - a.x) * (b.y - a.y) - (y - a.y) * (b.x - a.x);
      if (Math.abs(cross) < 1e-7 && x >= Math.min(a.x, b.x) && x <= Math.max(a.x, b.x)
        && y >= Math.min(a.y, b.y) && y <= Math.max(a.y, b.y)) return true;
      if ((a.y > y) !== (b.y > y) && x < (b.x - a.x) * (y - a.y) / (b.y - a.y) + a.x) inside = !inside;
    }
  }
  return inside;
}

async function loadWaterTile(x: number, y: number): Promise<WaterPolygon[]> {
  const key = `${x}/${y}`;
  const existing = tiles.get(key);
  if (existing) return existing;
  const pending = (async () => {
    const response = await fetch(`${TILE_ROOT}/${TILE_ZOOM}/${key}.pbf`, { signal: AbortSignal.timeout(4000) });
    if (!response.ok) throw new GhostLandUnavailableError();
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (!bytes.length || bytes.length > 4_000_000) throw new GhostLandUnavailableError();
    const tile = new VectorTile(new Pbf(bytes));
    if (!Object.keys(tile.layers).length) throw new GhostLandUnavailableError();
    const water = tile.layers.water;
    const polygons: WaterPolygon[] = [];
    for (let i = 0; i < (water?.length ?? 0); i++) {
      const feature = water.feature(i);
      if (feature.type !== 3) throw new GhostLandUnavailableError();
      polygons.push({ extent: feature.extent, rings: feature.loadGeometry() });
    }
    return polygons;
  })().catch(() => { tiles.delete(key); throw new GhostLandUnavailableError(); });
  if (tiles.size >= 512) tiles.delete(tiles.keys().next().value!);
  tiles.set(key, pending);
  return pending;
}

export async function isGhostLand(coordinate: { lat: number; lng: number }) {
  const { lat, lng } = coordinate;
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) >= 85 || Math.abs(lng) > 180) return false;
  const xf = ((lng + 180) / 360 * TILE_COUNT) % TILE_COUNT;
  const yf = (1 - Math.asinh(Math.tan(lat * Math.PI / 180)) / Math.PI) / 2 * TILE_COUNT;
  const x = Math.floor(xf), y = Math.floor(yf);
  const polygons = await loadWaterTile(x, y);
  return !polygons.some(polygon => pointInWater((xf - x) * polygon.extent, (yf - y) * polygon.extent, polygon.rings));
}
