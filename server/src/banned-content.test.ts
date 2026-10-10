import { describe, expect, it, vi } from "vitest";
import { loadBannedUserIds, nonBannedAccountSql } from "./banned-content.js";

describe("banned content read guards", () => {
  it("limits the read predicate to banned accounts, without changing suspended or missing accounts", () => {
    expect(nonBannedAccountSql("author.user_id")).toContain("banned_content_account.id = author.user_id");
    expect(nonBannedAccountSql("author.user_id")).toContain("account_status = 'banned'");
    expect(nonBannedAccountSql("author.user_id")).toMatch(/^not exists/);
  });
  it("batches and deduplicates actor IDs while preserving records", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ id: "banned-author" }] });
    expect(await loadBannedUserIds({ query }, ["active-author", "banned-author", "banned-author"])).toEqual(new Set(["banned-author"]));
    expect(query).toHaveBeenCalledWith(expect.stringContaining("account_status = 'banned'"), [["active-author", "banned-author"]]);
    expect(query.mock.calls[0][0]).toMatch(/^select/);
  });
  it("does not query for empty membership lists", async () => {
    const query = vi.fn();
    expect(await loadBannedUserIds({ query }, [])).toEqual(new Set());
    expect(query).not.toHaveBeenCalled();
  });
});
