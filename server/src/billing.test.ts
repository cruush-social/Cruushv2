import type { FastifyInstance } from "fastify";
import { describe, expect, it, vi } from "vitest";
import { getUserBillingStatus } from "./billing.js";

const { getCruushEntitlement } = vi.hoisted(() => ({
  getCruushEntitlement: vi.fn()
}));

vi.mock("./match-relationships.js", () => ({ getCruushEntitlement }));

describe("billing status", () => {
  it("reads an existing entitlement without issuing an automatic cruush+ trial", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    getCruushEntitlement.mockResolvedValue({ cruushPlus: false, expiresAt: null });
    const app = { db: { query } } as unknown as FastifyInstance;

    await expect(getUserBillingStatus(app, "user-1")).resolves.toMatchObject({
      cruushPlus: false,
      expiresAt: null,
      badges: []
    });

    expect(getCruushEntitlement).toHaveBeenCalledWith(app, "user-1");
    expect(query).toHaveBeenCalledTimes(1);
    expect(String(query.mock.calls[0]?.[0])).toContain("from user_badges");
    expect(String(query.mock.calls[0]?.[0])).not.toContain("reward_grants");
  });
});
