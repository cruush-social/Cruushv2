import { describe, expect, it } from "vitest";
import {
  calculateTrustScore,
  clampTrustScore,
  reportWeightForScore,
  trustLevelForScore
} from "./trust-engine.js";

describe("trust engine calculations", () => {
  it("clamps trust scores to the 0-100 range", () => {
    expect(clampTrustScore(-50)).toBe(0);
    expect(clampTrustScore(42.4)).toBe(42);
    expect(clampTrustScore(140)).toBe(100);
  });

  it("rebuilds trust from immutable events and applies a future trust cap", () => {
    const score = calculateTrustScore([
      { value: 10 },
      { value: -30 },
      { value: -20 }
    ], 60);

    expect(score).toBe(10);
  });

  it("uses the cap even when event totals would recover above it", () => {
    const score = calculateTrustScore([
      { value: 45 }
    ], 70);

    expect(score).toBe(70);
  });

  it("maps launch trust levels from the score bands", () => {
    expect(trustLevelForScore(20)).toBe("restricted");
    expect(trustLevelForScore(49)).toBe("new");
    expect(trustLevelForScore(74)).toBe("established");
    expect(trustLevelForScore(89)).toBe("trusted");
    expect(trustLevelForScore(90)).toBe("verified_trusted");
  });

  it("bounds report weight independently from exact trust visibility", () => {
    expect(reportWeightForScore(0)).toBe(5);
    expect(reportWeightForScore(50)).toBe(50);
    expect(reportWeightForScore(125)).toBe(100);
  });
});
