import { describe, expect, it, vi } from "vitest";
import { activeBugReportContactEmail, purgeExpiredBugReportEmails } from "./bug-report-email-retention.js";
import type { DbClient } from "./db.js";

describe("bug-report email retention", () => {
  it("deletes only contact email that has reached its retention deadline", async () => {
    const query = vi.fn(async (sql: string) => ({ rows: sql.includes("returning id") ? [{ id: "report-1" }, { id: "report-2" }] : [] }));
    const db = { query, end: vi.fn() } as unknown as DbClient;

    await expect(purgeExpiredBugReportEmails(db)).resolves.toBe(2);

    expect(query).toHaveBeenCalledWith(expect.stringContaining("category = 'bug'"));
    expect(query).toHaveBeenCalledWith(expect.stringContaining("contact_email_expires_at <= now()"));
    expect(query.mock.calls.map(([sql]) => sql === "begin" || sql === "commit" ? sql : sql.trim().split("\n")[0])).toEqual([
      "begin", "update support_request_replies reply", "update support_requests", "commit"
    ]);
    expect(query.mock.calls[1]?.[0]).toContain("request.category = 'bug'");
    expect(query.mock.calls[2]?.[0]).toContain("source <> 'survey'");
    expect(query.mock.calls[2]?.[0]).toContain("then 'bug-contact@invalid' else null end");
    expect(query.mock.calls[2]?.[0]).toContain("not contact_email_opted_in");
    expect(query.mock.calls[2]?.[0]).not.toContain("requester_account_deleted_at =");
  });

  it("rolls back the whole purge if a parent update fails", async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("update support_requests")) throw new Error("synthetic failure");
      return { rows: [] };
    });
    await expect(purgeExpiredBugReportEmails({ query, end: vi.fn() } as unknown as DbClient)).rejects.toThrow("synthetic failure");
    expect(query).toHaveBeenLastCalledWith("rollback");
    expect(query).not.toHaveBeenCalledWith("commit");
  });

  it.each([null, "invalid-date", "2020-01-01T00:00:00.000Z"])("fails closed for a missing, invalid, or expired deadline: %s", (expiry) => {
    expect(activeBugReportContactEmail({ contact_email: "synthetic@example.test", contact_email_opted_in: true,
      contact_email_expires_at: expiry })).toBeNull();
  });

  it.each(["bug-contact@invalid", "deleted-account@invalid"])("never returns a redaction marker: %s", (email) => {
    expect(activeBugReportContactEmail({ contact_email: email, contact_email_opted_in: true,
      contact_email_expires_at: new Date(Date.now() + 86400000) })).toBeNull();
  });
});
