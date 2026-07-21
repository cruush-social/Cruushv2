import { describe, expect, it, vi } from "vitest";
import type { DbClient } from "./db.js";
import {
  MODERATOR_ACCESS_LOG_RETENTION_DAYS,
  cleanupModeratorAccessEvents,
  recordModeratorAccess
} from "./moderation-access-log.js";

describe("moderator access logging", () => {
  it("records the moderator and linked content without storing preview contents", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    await recordModeratorAccess({ query } as unknown as DbClient, {
      actorUserId: "11111111-1111-4111-8111-111111111111",
      accessType: "queue_detail",
      reportId: "22222222-2222-4222-8222-222222222222",
      contentReviewId: "33333333-3333-4333-8333-333333333333",
      metadata: { itemKind: "report" }
    });

    expect(query).toHaveBeenCalledOnce();
    expect(query.mock.calls[0]?.[0]).toContain("insert into moderation_access_events");
    expect(query.mock.calls[0]?.[1]).toEqual([
      "11111111-1111-4111-8111-111111111111",
      "22222222-2222-4222-8222-222222222222",
      "33333333-3333-4333-8333-333333333333",
      null,
      "queue_detail",
      JSON.stringify({ itemKind: "report" })
    ]);
  });

  it("deletes access events older than the bounded retention period", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ id: "event-1" }], rowCount: 1 });
    const deleted = await cleanupModeratorAccessEvents({ query } as unknown as DbClient, 10_000);

    expect(deleted).toBe(1);
    expect(query.mock.calls[0]?.[0]).toContain(`interval '${MODERATOR_ACCESS_LOG_RETENTION_DAYS} days'`);
    expect(query.mock.calls[0]?.[1]).toEqual([5_000]);
  });
});
