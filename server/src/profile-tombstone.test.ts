import { describe, expect, it } from "vitest";
import { isTombstonedProfileName, notTombstonedSql } from "./profile-tombstone.js";

describe("profile tombstones", () => {
  it("recognises the legacy marker however it is cased or padded", () => {
    expect(isTombstonedProfileName("User deleted profile")).toBe(true);
    expect(isTombstonedProfileName("  user DELETED profile ")).toBe(true);
    expect(isTombstonedProfileName("Jay")).toBe(false);
    expect(isTombstonedProfileName(null)).toBe(false);
  });

  it("builds the same predicate the Feed has always used", () => {
    expect(notTombstonedSql("pr")).toBe("lower(trim(coalesce(pr.display_name, ''))) <> 'user deleted profile'");
  });
});
