import { beforeEach, describe, expect, it, vi } from "vitest";
import { notifyNearbyUsersForFeedPost } from "./feed-post-notifications.js";

const { createAppNotificationAndPush, getRelationshipPermissions } = vi.hoisted(() => ({
  createAppNotificationAndPush: vi.fn(),
  getRelationshipPermissions: vi.fn()
}));

vi.mock("./notification-service.js", () => ({
  createAppNotificationAndPush
}));

vi.mock("./match-relationships.js", () => ({
  getRelationshipPermissions
}));

const authorUserId = "00000000-0000-4000-8000-000000000001";
const recipientUserId = "00000000-0000-4000-8000-000000000002";
const postId = "00000000-0000-4000-8000-000000000003";

function appWithRecipients(userIds = [recipientUserId]) {
  const query = vi.fn().mockResolvedValue({
    rows: userIds.map((user_id) => ({ user_id }))
  });

  return {
    app: {
      config: {},
      db: { query, end: vi.fn() },
      log: { error: vi.fn(), warn: vi.fn(), info: vi.fn() }
    } as any,
    query
  };
}

describe("nearby Feed post notifications", () => {
  beforeEach(() => {
    createAppNotificationAndPush.mockReset().mockResolvedValue({ id: "notification-1" });
    getRelationshipPermissions.mockReset().mockResolvedValue({
      isBlocked: false,
      isMutualCruush: true
    });
  });

  it("notifies a bounded, unblocked nearby audience with generic Feed copy", async () => {
    const { app, query } = appWithRecipients();

    await expect(notifyNearbyUsersForFeedPost(app, {
      postId,
      authorUserId,
      audience: "public"
    })).resolves.toEqual({ attempted: true, sent: 1 });

    const recipientSql = String(query.mock.calls[0]?.[0]);
    expect(recipientSql).toContain("coalesce(preferences.nearby_enabled, true) = true");
    expect(recipientSql).toContain("from user_blocks block");
    expect(recipientSql).toContain("<= $3");
    expect(recipientSql).toContain("limit $6");
    expect(createAppNotificationAndPush).toHaveBeenCalledWith(app, {
      userId: recipientUserId,
      type: "nearby_feed_post",
      title: "New Feed post nearby",
      body: "Open Feed to see what’s happening in your area.",
      linkUrl: "/feed?view=nearby#latest",
      dedupeKey: `nearby-feed-post:${postId}:${recipientUserId}`,
      metadata: { postId },
      deferPush: true
    });
  });

  it("requires the stored Crowd token match for Crowd posts", async () => {
    const { app, query } = appWithRecipients();

    await notifyNearbyUsersForFeedPost(app, {
      postId,
      authorUserId,
      audience: "crowd"
    });

    const recipientSql = String(query.mock.calls[0]?.[0]);
    expect(recipientSql).toContain("from feed_post_crowd_targets target");
    expect(recipientSql).toContain("recipient_token.token_hash = target.token_hash");
    expect(query.mock.calls[0]?.[1]).toEqual([
      authorUserId,
      "crowd",
      5,
      "4",
      postId,
      500
    ]);
  });

  it("notifies only confirmed mutual cruushes for mutual-only posts", async () => {
    const rejectedRecipientId = "00000000-0000-4000-8000-000000000004";
    const { app } = appWithRecipients([recipientUserId, rejectedRecipientId]);
    getRelationshipPermissions
      .mockResolvedValueOnce({ isBlocked: false, isMutualCruush: true })
      .mockResolvedValueOnce({ isBlocked: false, isMutualCruush: false });

    await expect(notifyNearbyUsersForFeedPost(app, {
      postId,
      authorUserId,
      audience: "mutuals"
    })).resolves.toEqual({ attempted: true, sent: 1 });

    expect(getRelationshipPermissions).toHaveBeenNthCalledWith(1, app, recipientUserId, authorUserId);
    expect(getRelationshipPermissions).toHaveBeenNthCalledWith(2, app, rejectedRecipientId, authorUserId);
    expect(createAppNotificationAndPush).toHaveBeenCalledTimes(1);
  });
});
