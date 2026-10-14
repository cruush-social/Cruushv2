import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let syncAllVerifiedMembersToResendAudience: typeof import("./resend-audience.js").syncAllVerifiedMembersToResendAudience;
let syncVerifiedMemberToResendAudience: typeof import("./resend-audience.js").syncVerifiedMemberToResendAudience;

beforeEach(async () => {
  vi.resetModules();
  vi.useFakeTimers();
  ({ syncAllVerifiedMembersToResendAudience, syncVerifiedMemberToResendAudience } = await import("./resend-audience.js"));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

async function settle<T>(operation: Promise<T>) {
  await vi.runAllTimersAsync();
  return operation;
}

describe("verified Resend audience reconciliation", () => {
  it("syncs every verified non-deleted account without touching existing contacts", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(new Response(null, { status: 201 }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const logger = { warn: vi.fn(), info: vi.fn() };

    await settle(syncAllVerifiedMembersToResendAudience({
      config: { APP_DEPLOYMENT_STAGE: "production", RESEND_API_KEY: "key", RESEND_CRUUSH_APP_AUDIENCE_ID: "audience" },
      db: { query: vi.fn().mockResolvedValue({ rows: [{ email: "first@example.com" }, { email: "second@example.com" }] }) },
      logger
    }));

    expect(fetchMock).toHaveBeenNthCalledWith(1, "https://api.resend.com/audiences/audience/contacts/first%40example.com", expect.anything());
    expect(fetchMock).toHaveBeenNthCalledWith(2, "https://api.resend.com/audiences/audience/contacts", expect.objectContaining({ method: "POST" }));
    expect(fetchMock).toHaveBeenNthCalledWith(3, "https://api.resend.com/audiences/audience/contacts/second%40example.com", expect.anything());
    expect(logger.info).toHaveBeenCalledWith({ count: 2 }, "verified member audience reconciliation complete");
  });

  it("does nothing outside production or without audience configuration", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const db = { query: vi.fn() };

    await syncAllVerifiedMembersToResendAudience({
      config: { APP_DEPLOYMENT_STAGE: "staging", RESEND_API_KEY: "key", RESEND_CRUUSH_APP_AUDIENCE_ID: "audience" },
      db,
      logger: { warn: vi.fn() }
    });

    expect(db.query).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("honors retry-after and rechecks a contact after an ambiguous create response", async () => {
    const times: number[] = [];
    const responses = [
      new Response(null, { status: 429, headers: { "retry-after": "2" } }),
      new Response(null, { status: 404 }),
      new Response(null, { status: 503 }),
      new Response(null, { status: 200 }),
    ];
    const fetchMock = vi.fn(async () => {
      times.push(Date.now());
      return responses.shift()!;
    });
    vi.stubGlobal("fetch", fetchMock);
    const logger = { warn: vi.fn() };
    const outcome = await settle(syncVerifiedMemberToResendAudience({
      config: { APP_DEPLOYMENT_STAGE: "production", RESEND_API_KEY: "key", RESEND_CRUUSH_APP_AUDIENCE_ID: "audience" },
      email: "first@example.com",
      db: { query: vi.fn().mockResolvedValue({ rows: [{ id: "verified-member" }] }) },
      logger,
    }));

    expect(outcome).toBe("synced");
    expect(times[1] - times[0]).toBeGreaterThanOrEqual(2_000);
    expect(times[2] - times[1]).toBeGreaterThanOrEqual(1_000);
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(fetchMock).toHaveBeenNthCalledWith(3, "https://api.resend.com/audiences/audience/contacts", expect.objectContaining({ method: "POST" }));
    expect(fetchMock).toHaveBeenNthCalledWith(4, "https://api.resend.com/audiences/audience/contacts/first%40example.com", expect.not.objectContaining({ method: "POST" }));
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it("stops the startup sweep on authorization failure without logging member addresses", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 403 }));
    vi.stubGlobal("fetch", fetchMock);
    const logger = { warn: vi.fn(), info: vi.fn() };
    await settle(syncAllVerifiedMembersToResendAudience({
      config: { APP_DEPLOYMENT_STAGE: "production", RESEND_API_KEY: "key", RESEND_CRUUSH_APP_AUDIENCE_ID: "audience" },
      db: { query: vi.fn().mockResolvedValue({ rows: [{ email: "first@example.com" }, { email: "second@example.com" }] }) },
      logger,
    }));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledWith({ synced: 0, failed: 0, remaining: 2 }, "verified member audience reconciliation deferred");
    expect(JSON.stringify(logger.warn.mock.calls)).not.toContain("example.com");
    expect(logger.info).not.toHaveBeenCalled();
  });

  it("bounds network retries and never logs the contact URL from a fetch error", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("failed https://api.resend.com/contacts/private@example.com"));
    vi.stubGlobal("fetch", fetchMock);
    const logger = { warn: vi.fn() };
    const outcome = await settle(syncVerifiedMemberToResendAudience({
      config: { APP_DEPLOYMENT_STAGE: "production", RESEND_API_KEY: "key", RESEND_CRUUSH_APP_AUDIENCE_ID: "audience" },
      email: "private@example.com",
      db: { query: vi.fn().mockResolvedValue({ rows: [{ id: "verified-member" }] }) },
      logger,
    }));

    expect(outcome).toBe("deferred");
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(logger.warn).toHaveBeenCalledWith({ error: "provider_request_failed", attempts: 3 }, "verified member audience sync failed");
    expect(JSON.stringify(logger.warn.mock.calls)).not.toContain("private@example.com");
  });
});
