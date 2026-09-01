import { describe, expect, it } from "vitest";
import { createFakeCheckoutSession, completeFakeCheckoutSession } from "./billing.js";
import { loadConfig } from "./config.js";
import type { FastifyInstance } from "fastify";

/**
 * The fake checkout grants cruush+ with no payment taken. It was reachable by
 * any authenticated member: session creation hardcodes processor 'fake' and
 * test_mode true, which is exactly what completion checks, so anyone who could
 * create one could complete it and hand themselves any plan, including the
 * lifetime founder tier.
 *
 * These tests exist so that hole cannot be reopened quietly.
 */
function appWith(flag: boolean | undefined) {
  return {
    config: { BILLING_TEST_CHECKOUT_ENABLED: flag },
    db: {
      query: () => {
        throw new Error("the guard must refuse before any database work");
      }
    }
  } as unknown as FastifyInstance;
}

const userId = "00000000-0000-4000-8000-000000000001";

describe("fake checkout is not reachable unless explicitly enabled", () => {
  it("refuses to create a session when the flag is unset", async () => {
    await expect(createFakeCheckoutSession(appWith(undefined), userId, "lifetime_founder"))
      .rejects.toMatchObject({ statusCode: 404 });
  });

  it("refuses to create a session when the flag is off", async () => {
    await expect(createFakeCheckoutSession(appWith(false), userId, "lifetime_founder"))
      .rejects.toMatchObject({ statusCode: 404 });
  });

  it("refuses to complete a session when the flag is off, not only to create one", async () => {
    await expect(completeFakeCheckoutSession(appWith(false), userId, "any-session"))
      .rejects.toMatchObject({ statusCode: 404 });
  });

  it("answers 404 rather than 403, so the route does not advertise itself", async () => {
    await expect(createFakeCheckoutSession(appWith(false), userId, "plus_monthly"))
      .rejects.toMatchObject({ statusCode: 404, code: "NOT_FOUND" });
  });
});

describe("production refuses to boot with the fake checkout enabled", () => {
  const productionEnv = {
    NODE_ENV: "production",
    DATABASE_URL: "postgres://u@localhost:5432/db",
    SESSION_SECRET: "0123456789abcdef0123456789abcdef",
    APP_URL: "https://cruush.app",
    CORS_ORIGIN: "https://cruush.app"
  } as NodeJS.ProcessEnv;

  it("rejects the configuration outright", () => {
    expect(() => loadConfig({ ...productionEnv, BILLING_TEST_CHECKOUT_ENABLED: "true" }))
      .toThrowError(/BILLING_TEST_CHECKOUT_ENABLED/);
  });
});
