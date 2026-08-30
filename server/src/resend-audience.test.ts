import { describe, expect, it, vi } from "vitest";
import { syncAllVerifiedMembersToResendAudience } from "./resend-audience.js";

describe("verified Resend audience reconciliation", () => {
  it("syncs every verified non-deleted account without touching existing contacts", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(new Response(null, { status: 201 }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const logger = { warn: vi.fn(), info: vi.fn() };

    await syncAllVerifiedMembersToResendAudience({
      config: { APP_DEPLOYMENT_STAGE: "production", RESEND_API_KEY: "key", RESEND_CRUUSH_APP_AUDIENCE_ID: "audience" },
      db: { query: vi.fn().mockResolvedValue({ rows: [{ email: "first@example.com" }, { email: "second@example.com" }] }) },
      logger,
      wait: async () => {}
    });

    expect(fetchMock).toHaveBeenNthCalledWith(1, "https://api.resend.com/audiences/audience/contacts/first%40example.com", expect.anything());
    expect(fetchMock).toHaveBeenNthCalledWith(2, "https://api.resend.com/audiences/audience/contacts", expect.objectContaining({ method: "POST" }));
    expect(fetchMock).toHaveBeenNthCalledWith(3, "https://api.resend.com/audiences/audience/contacts/second%40example.com", expect.anything());
    expect(logger.info).toHaveBeenCalledWith(
      { count: 2, synced: 2, failed: 0 },
      "verified member audience reconciliation complete"
    );
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

  it("waits out a rate limit instead of dropping the member", async () => {
    // What production actually returned: every request refused. Previously each
    // 429 was logged as a failure and that member was never revisited.
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 429, headers: { "retry-after": "1" } }))
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(new Response(null, { status: 429 }))
      .mockResolvedValueOnce(new Response(null, { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
    const logger = { warn: vi.fn(), info: vi.fn() };
    const waits: number[] = [];

    await syncAllVerifiedMembersToResendAudience({
      config: { APP_DEPLOYMENT_STAGE: "production", RESEND_API_KEY: "key", RESEND_CRUUSH_APP_AUDIENCE_ID: "audience" },
      db: { query: vi.fn().mockResolvedValue({ rows: [{ email: "first@example.com" }] }) },
      logger,
      wait: async (ms: number) => { waits.push(ms); }
    });

    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(logger.warn).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith(
      { count: 1, synced: 1, failed: 0 },
      "verified member audience reconciliation complete"
    );
    // The server asked for one second and got it, rather than a guess.
    expect(waits[0]).toBe(1000);
  });

  it("counts a member it could not sync rather than reporting the walk as success", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);
    const logger = { warn: vi.fn(), info: vi.fn() };

    await syncAllVerifiedMembersToResendAudience({
      config: { APP_DEPLOYMENT_STAGE: "production", RESEND_API_KEY: "key", RESEND_CRUUSH_APP_AUDIENCE_ID: "audience" },
      db: { query: vi.fn().mockResolvedValue({ rows: [{ email: "first@example.com" }] }) },
      logger,
      wait: async () => {}
    });

    expect(logger.info).toHaveBeenCalledWith(
      { count: 1, synced: 0, failed: 1 },
      "verified member audience reconciliation complete"
    );
  });
});
