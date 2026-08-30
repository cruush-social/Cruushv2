import type { FastifyInstance } from "fastify";
import { describe, expect, it, vi } from "vitest";
import {
  CHARGEBACK_RATIO_MINIMUM_TRANSACTIONS,
  checkVelocity,
  getChargebackRatio,
  recordPaymentEvent
} from "./payment-monitoring.js";

function appWithRow(row: unknown) {
  const query = vi.fn().mockResolvedValue({ rows: row ? [row] : [] });
  return { app: { db: { query } } as unknown as FastifyInstance, query };
}

describe("chargeback ratio", () => {
  it("reports the ratio of chargebacks to approvals", async () => {
    const { app } = appWithRow({ approved: "200", chargebacks: "2" });

    await expect(getChargebackRatio(app)).resolves.toMatchObject({
      approved: 200,
      chargebacks: 2,
      ratio: 0.01
    });
  });

  it("flags surcharging at Verotel's 1.0% threshold", async () => {
    const { app } = appWithRow({ approved: "200", chargebacks: "2" });

    await expect(getChargebackRatio(app)).resolves.toMatchObject({
      alerting: true,
      surcharging: true
    });
  });

  it("alerts below the surcharge threshold so there is room to react", async () => {
    const { app } = appWithRow({ approved: "1000", chargebacks: "8" });

    await expect(getChargebackRatio(app)).resolves.toMatchObject({
      alerting: true,
      surcharging: false
    });
  });

  it("stays quiet at a healthy ratio", async () => {
    const { app } = appWithRow({ approved: "1000", chargebacks: "1" });

    await expect(getChargebackRatio(app)).resolves.toMatchObject({
      alerting: false,
      surcharging: false
    });
  });

  it("does not alert below the minimum transaction count", async () => {
    const { app } = appWithRow({ approved: "3", chargebacks: "1" });
    const result = await getChargebackRatio(app);

    expect(result.belowMinimumVolume).toBe(true);
    expect(result.alerting).toBe(false);
    expect(result.surcharging).toBe(false);
    expect(CHARGEBACK_RATIO_MINIMUM_TRANSACTIONS).toBe(50);
  });

  it("treats an empty window as a zero ratio rather than dividing by zero", async () => {
    const { app } = appWithRow({ approved: "0", chargebacks: "0" });

    await expect(getChargebackRatio(app)).resolves.toMatchObject({ ratio: 0, alerting: false });
  });

  it("survives an empty result set", async () => {
    const { app } = appWithRow(null);

    await expect(getChargebackRatio(app)).resolves.toMatchObject({ approved: 0, chargebacks: 0, ratio: 0 });
  });
});

describe("velocity", () => {
  it("returns no breach within the limits", async () => {
    const { app } = appWithRow({ user_hour: "1", user_day: "2", ip_day: "3" });

    await expect(checkVelocity(app, { userId: "user-1", ipHash: "hash" })).resolves.toEqual([]);
  });

  it("reports every breach rather than only the first", async () => {
    const { app } = appWithRow({ user_hour: "9", user_day: "9", ip_day: "99" });
    const breaches = await checkVelocity(app, { userId: "user-1", ipHash: "hash" });

    expect(breaches.map((breach) => breach.scope)).toEqual(["user_hour", "user_day", "ip_day"]);
  });

  it("skips the ip scope when no ip hash is available", async () => {
    const { app } = appWithRow({ user_hour: "1", user_day: "1", ip_day: "99" });

    await expect(checkVelocity(app, { userId: "user-1" })).resolves.toEqual([]);
  });
});

describe("recording", () => {
  it("writes the event with its outcome", async () => {
    const { app, query } = appWithRow(null);

    await recordPaymentEvent(app, {
      userId: "user-1",
      saleId: "sale-1",
      eventType: "initial",
      outcome: "approved",
      amountCents: 1999
    });

    expect(query).toHaveBeenCalledTimes(1);
    const [sql, params] = query.mock.calls[0];
    expect(sql).toContain("insert into payment_monitoring_events");
    expect(params).toEqual(["user-1", "sale-1", "initial", "approved", null, null, 1999]);
  });
});
