import { describe, expect, it } from "vitest";
import {
  deriveGhostCoordinate,
  distanceMiles,
  GHOST_ANCHOR_RATIO,
  GHOST_CELL_RATIO,
  GHOST_DRIFT_RATIO,
  GHOST_MIN_OFFSET_RATIO,
  GHOST_RADIUS_OPTIONS
} from "./location-privacy.js";
import type { AppConfig } from "./config.js";

/**
 * Ghost v1 offset the subject's TRUE point by a fresh random vector every
 * fifteen-minute epoch. Those offsets were unbiased, so averaging the observed
 * decoy converged on the real position — and kept improving with time.
 *
 * v2 derives the decoy from a quantised cell plus a drift that does not depend
 * on position, so averaging converges on the cell anchor and stops there. These
 * tests assert that property against the real implementation.
 */
const config = {
  GHOST_DERIVATION_KEY: "ghost-derivation-key-for-tests-0123456789",
  GHOST_DERIVATION_KEY_VERSION: "v1"
} as unknown as AppConfig;

const SUBJECT = "6f1d5a4c-1a1e-4f0e-9c3f-0f1c2d3e4a5b";
const METERS_PER_MILE = 1609.344;

function decoyAt(lat: number, lng: number, epoch: number, radiusMeters: number) {
  return deriveGhostCoordinate({
    config,
    subjectUserId: SUBJECT,
    centerLat: lat,
    centerLng: lng,
    rotationEpoch: epoch,
    derivationSalt: `salt-${epoch}`,
    radiusMeters,
    policyVersion: 1
  });
}

function metersBetween(aLat: number, aLng: number, bLat: number, bLng: number) {
  return distanceMiles(aLat, aLng, bLat, bLng) * METERS_PER_MILE;
}

describe("ghost rotation resists averaging", () => {
  it("keeps the decoy inside the annulus for every radius option and many epochs", () => {
    for (const option of GHOST_RADIUS_OPTIONS) {
      let min = Infinity;
      let max = 0;

      for (let epoch = 0; epoch < 400; epoch += 1) {
        // Vary the true point so cell-relative position varies too.
        const lat = 40.7 + (epoch % 37) * 0.0007;
        const lng = -74.0 + (epoch % 53) * 0.0009;
        const decoy = decoyAt(lat, lng, epoch, option.meters);
        const d = metersBetween(lat, lng, decoy.lat, decoy.lng);
        min = Math.min(min, d);
        max = Math.max(max, d);
      }

      expect(min, `${option.label} minimum offset`).toBeGreaterThanOrEqual(
        GHOST_MIN_OFFSET_RATIO * option.meters * 0.98
      );
      expect(max, `${option.label} maximum offset`).toBeLessThanOrEqual(option.meters * 1.02);
    }
  });

  it("does not converge on the true point as observations accumulate", () => {
    const radiusMeters = 1609;
    const lat = 40.7137;
    const lng = -74.0041;

    const errorAfter = (epochs: number) => {
      let sumLat = 0;
      let sumLng = 0;
      for (let epoch = 0; epoch < epochs; epoch += 1) {
        const decoy = decoyAt(lat, lng, epoch, radiusMeters);
        sumLat += decoy.lat;
        sumLng += decoy.lng;
      }
      return metersBetween(lat, lng, sumLat / epochs, sumLng / epochs);
    };

    const oneDay = errorAfter(96);
    const oneWeek = errorAfter(672);
    const oneMonth = errorAfter(2880);

    // A converging scheme collapses toward zero here; v1 reached roughly 40 m
    // within a week. The anchor keeps the average far from the subject instead.
    for (const [label, error] of [["day", oneDay], ["week", oneWeek], ["month", oneMonth]] as const) {
      expect(error, `average after one ${label}`).toBeGreaterThan(0.4 * radiusMeters);
    }

    // And it must not be steadily improving with more samples.
    expect(oneMonth).toBeGreaterThan(oneWeek * 0.5);
  });

  it("holds the decoy still while the subject moves inside one cell", () => {
    const radiusMeters = 1609;
    const epoch = 4242;
    const baseLat = 40.7137;
    const baseLng = -74.0041;
    const base = decoyAt(baseLat, baseLng, epoch, radiusMeters);

    // A step well inside one cell must not move the anchor at all, so the decoy
    // carries no within-cell trajectory for an attacker to map-match.
    const cellMeters = radiusMeters * GHOST_CELL_RATIO;
    const tinyStepDegrees = (cellMeters / 20) / 111_320;
    const stepped = decoyAt(baseLat + tinyStepDegrees, baseLng, epoch, radiusMeters);

    expect(metersBetween(base.lat, base.lng, stepped.lat, stepped.lng)).toBeLessThan(1);
  });

  it("still moves the decoy between epochs so the pin stays alive", () => {
    const radiusMeters = 1609;
    const lat = 40.7137;
    const lng = -74.0041;
    const first = decoyAt(lat, lng, 900, radiusMeters);
    const second = decoyAt(lat, lng, 901, radiusMeters);

    const moved = metersBetween(first.lat, first.lng, second.lat, second.lng);
    expect(moved).toBeGreaterThan(1);
    // Drift is bounded, so movement cannot exceed twice its amplitude.
    expect(moved).toBeLessThanOrEqual(2 * GHOST_DRIFT_RATIO * radiusMeters * 1.02);
  });

  it("keeps the geometry budget inside the annulus by construction", () => {
    const halfCellDiagonal = (GHOST_CELL_RATIO * Math.SQRT2) / 2;
    const worstInner = GHOST_ANCHOR_RATIO - halfCellDiagonal - GHOST_DRIFT_RATIO;
    const worstOuter = GHOST_ANCHOR_RATIO + halfCellDiagonal + GHOST_DRIFT_RATIO;

    expect(worstInner).toBeGreaterThan(GHOST_MIN_OFFSET_RATIO);
    expect(worstOuter).toBeLessThan(1);
  });
});
