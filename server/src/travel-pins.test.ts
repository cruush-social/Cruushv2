import type { FastifyInstance } from "fastify";
import { describe, expect, it, vi } from "vitest";
import { setTravelPin } from "./travel-pins.js";

describe("travel pins", () => {
  it("rejects an out-of-area pin before querying the database", async () => {
    const query = vi.fn();
    const app = {
      db: { query }
    } as unknown as FastifyInstance;

    await expect(setTravelPin(app, "member-id", {
      latitude: 42.3601,
      longitude: -71.0589,
      label: "Outside the service area"
    })).rejects.toMatchObject({
      statusCode: 403,
      code: "FEATURE_RESTRICTED",
      message: "That location is outside the current cruush service area."
    });

    expect(query).not.toHaveBeenCalled();
  });
});
