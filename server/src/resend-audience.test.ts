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
      logger
    });

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
});
