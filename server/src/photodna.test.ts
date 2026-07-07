import { afterEach, describe, expect, it, vi } from "vitest";
import { checkPhotoDna } from "./photodna.js";
import type { AppConfig } from "./config.js";

const baseConfig = {
  PHOTODNA_ENABLED: true,
  PHOTODNA_API_URL: "https://photodna.example.test",
  PHOTODNA_OPERATION_PATH: "/match",
  PHOTODNA_SUBSCRIPTION_KEY: "subscription-key",
  PHOTODNA_TIMEOUT_MS: 5000
} as AppConfig;

describe("PhotoDNA adapter", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns blocked when the provider response indicates a match", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ isMatch: true, trackingId: "match-1" })
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await checkPhotoDna(baseConfig, Buffer.from("image"));

    expect(result).toMatchObject({
      status: "blocked",
      providerRequestId: "match-1"
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://photodna.example.test/match",
      expect.objectContaining({
        method: "POST",
        body: Buffer.from("image")
      })
    );
  });

  it("allows checks when PhotoDNA is disabled", async () => {
    const result = await checkPhotoDna({
      ...baseConfig,
      PHOTODNA_ENABLED: false
    } as AppConfig, Buffer.from("image"));

    expect(result.status).toBe("not_configured");
  });
});
