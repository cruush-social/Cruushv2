import Fastify from "fastify";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DbClient } from "./db.js";
import { registerPrivacyRoutes } from "./routes/privacy.js";
import { requireCruushPlus } from "./billing.js";
import { loadLocationEnvelope, loadVisibilityPolicy } from "./location-privacy.js";
import { clearTravelPin, setTravelPin } from "./travel-pins.js";

vi.mock("./billing.js", async (original) => ({
  ...await original<typeof import("./billing.js")>(), requireCruushPlus: vi.fn()
}));
vi.mock("./location-privacy.js", async (original) => ({
  ...await original<typeof import("./location-privacy.js")>(),
  loadLocationEnvelope: vi.fn(), loadVisibilityPolicy: vi.fn()
}));
vi.mock("./travel-pins.js", async (original) => ({
  ...await original<typeof import("./travel-pins.js")>(),
  setTravelPin: vi.fn(), clearTravelPin: vi.fn()
}));

const userId = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(requireCruushPlus).mockResolvedValue(undefined as never);
  vi.mocked(loadVisibilityPolicy).mockResolvedValue(null as never);
  vi.mocked(loadLocationEnvelope).mockResolvedValue({ latE7: 407128000, lonE7: -740060000 } as never);
  vi.mocked(setTravelPin).mockResolvedValue({ userId, latitude: 40.7128, longitude: -74.006 } as never);
  vi.mocked(clearTravelPin).mockResolvedValue(undefined);
});

describe("Mile High Club writes serialize with the Pulse account lock", () => {
  it.each(["PUT", "DELETE"] as const)("holds %s until the shared account lock is acquired", async (method) => {
    let signalLockRequest!: () => void;
    let releaseLock!: () => void;
    const lockRequested = new Promise<void>((resolve) => { signalLockRequest = resolve; });
    const lockHeld = new Promise<void>((resolve) => { releaseLock = resolve; });
    const txDb = { query: vi.fn(async (sql: string) => {
      if (sql.includes("from app_users") && sql.includes("for update")) {
        signalLockRequest();
        await lockHeld;
      }
      return { rows: [{ id: userId }] };
    }), end: vi.fn() } as unknown as DbClient;
    const db = {
      query: vi.fn(), end: vi.fn(),
      transaction: vi.fn(async (fn: (client: DbClient) => Promise<unknown>) => fn(txDb))
    };
    const app = Fastify({ logger: false });
    app.decorate("config", { NODE_ENV: "test" } as never);
    app.decorate("db", db as never);
    await registerPrivacyRoutes(app);

    try {
      const response = app.inject({
        method, url: "/api/privacy/travel", headers: { "x-user-id": userId },
        ...(method === "PUT" ? { payload: { latitude: 40.7128, longitude: -74.006 } } : {})
      });
      const first = await Promise.race([
        lockRequested.then(() => "lock"),
        response.then(() => "response")
      ]);
      expect(first).toBe("lock");
      expect(setTravelPin).not.toHaveBeenCalled();
      expect(clearTravelPin).not.toHaveBeenCalled();

      releaseLock();
      expect((await response).statusCode).toBe(200);
      expect(db.transaction).toHaveBeenCalledOnce();
      expect(txDb.query).toHaveBeenCalledWith(expect.stringContaining("for update"), [userId]);
      if (method === "PUT") {
        expect(setTravelPin).toHaveBeenCalledWith(expect.objectContaining({ db: txDb }), userId, { latitude: 40.7128, longitude: -74.006 });
      } else {
        expect(clearTravelPin).toHaveBeenCalledWith(expect.objectContaining({ db: txDb }), userId);
      }
    } finally {
      releaseLock();
      await app.close();
    }
  });
});
