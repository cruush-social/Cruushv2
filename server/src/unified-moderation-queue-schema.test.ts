import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("unified moderation queue schema", () => {
  it("runs the queue migration after the moderation foundations", async () => {
    const migrateSource = await readFile(new URL("./migrate.ts", import.meta.url), "utf8");
    expect(migrateSource).toMatch(
      /"040_severe_access_bans\.sql",\s*"041_unified_moderation_queue\.sql"/
    );
  });

  it("links reports to content reviews and indexes every non-allowed review", async () => {
    const sql = await readFile(
      new URL("../sql/041_unified_moderation_queue.sql", import.meta.url),
      "utf8"
    );
    expect(sql).toContain("add column if not exists content_review_id");
    expect(sql).toContain("idx_reports_content_review_id");
    expect(sql).toContain("idx_content_reviews_moderator_queue");
    expect(sql).toContain("where moderation_status <> 'allowed'");
    expect(sql).toContain("create table if not exists moderation_access_events");
    expect(sql).toContain("idx_moderation_access_events_retention");
    expect(sql).toContain("'queue_detail'");
    expect(sql).toContain("'media_preview'");
    expect(sql).toContain("'approve_content'");
    expect(sql).toContain("'reject_content'");
  });
});
