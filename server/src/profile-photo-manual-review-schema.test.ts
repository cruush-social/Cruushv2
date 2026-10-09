import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("profile-photo manual review migration", () => {
  it("is registered after the media grant migration", async () => {
    const runner = await readFile(new URL("./migrate.ts", import.meta.url), "utf8");

    expect(runner).toMatch(
      /"038_moderation_media_grants\.sql",\s*"039_profile_photo_manual_reviews\.sql"/
    );
  });

  it("cascades review deletion and keeps the queue private and bounded", async () => {
    const sql = await readFile(
      new URL("../sql/039_profile_photo_manual_reviews.sql", import.meta.url),
      "utf8"
    );

    expect(sql).toMatch(/content_review_id uuid not null unique references content_reviews\(id\) on delete cascade/i);
    expect(sql).toContain("idx_profile_photo_manual_reviews_one_active_per_owner");
    expect(sql).toContain("where status in ('pending', 'deleting')");
    expect(sql).toContain("revoke all on profile_photo_manual_reviews from public");
  });
});
