import { describe, expect, it, vi } from "vitest";
import { GhostLandUnavailableError, isGhostLand, pointInWater } from "./ghost-land.js";

describe("Ghost water rejection", () => {
  it("rejects polygon interiors and shore boundaries but respects island holes", () => {
    const square = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }, { x: 0, y: 0 }];
    const island = [{ x: 4, y: 4 }, { x: 6, y: 4 }, { x: 6, y: 6 }, { x: 4, y: 6 }, { x: 4, y: 4 }];
    expect(pointInWater(2, 2, [square, island])).toBe(true);
    expect(pointInWater(0, 5, [square, island])).toBe(true);
    expect(pointInWater(5, 5, [square, island])).toBe(false);
    expect(pointInWater(11, 5, [square, island])).toBe(false);
  });
  it("fails closed when map data is unavailable", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("", { status: 503 }));
    try {
      await expect(isGhostLand({ lat: 40.758, lng: -73.9855 })).rejects.toBeInstanceOf(GhostLandUnavailableError);
    } finally { fetchMock.mockRestore(); }
  });
});
