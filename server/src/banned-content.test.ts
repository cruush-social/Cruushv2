import { describe, expect, it, vi } from "vitest";
import { loadBannedUserIds, nonBannedAccountSql, nonBannedNotificationSql } from "./banned-content.js";

describe("banned content read guards", () => {
  it("excludes banned and deleted accounts without changing suspended or missing accounts", () => {
    expect(nonBannedAccountSql("author.user_id")).toContain("banned_content_account.id = author.user_id");
    expect(nonBannedAccountSql("author.user_id")).toContain("account_status = 'banned'");
    expect(nonBannedAccountSql("author.user_id")).toContain("account_status = 'deleted'");
    expect(nonBannedAccountSql("author.user_id")).not.toContain("account_status = 'suspended'");
    expect(nonBannedAccountSql("author.user_id")).toMatch(/^not exists/);
  });
  it("batches and deduplicates actor IDs while preserving records", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ id: "banned-author" }, { id: "deleted-author" }] });
    expect(await loadBannedUserIds({ query }, ["active-author", "banned-author", "deleted-author", "banned-author"])).toEqual(new Set(["banned-author", "deleted-author"]));
    expect(query).toHaveBeenCalledWith(expect.stringContaining("account_status = 'banned' or account_status = 'deleted'"), [["active-author", "banned-author", "deleted-author"]]);
    expect(query.mock.calls[0][0]).toMatch(/^select/);
  });
  it("also checks deleted nearby-notification sources kept in metadata", () => {
    expect(nonBannedNotificationSql("notice")).toContain("banned_notification_source.account_status = 'deleted'");
  });
  it("does not query for empty membership lists", async () => {
    const query = vi.fn();
    expect(await loadBannedUserIds({ query }, [])).toEqual(new Set());
    expect(query).not.toHaveBeenCalled();
  });
});
