import { beforeEach, describe, expect, it, vi } from "vitest";
import { notifyMutualCruushesForFeedPost, notifyNearbyUsersForFeedPost } from "./feed-post-notifications.js";
import type { FastifyInstance } from "fastify";
import { loadLocationEnvelopes, type LocationPayload } from "./location-privacy.js";
import { emptyProfile } from "./profile-schema.js";
import { encryptProfileVisibility } from "./profile-sensitive.js";
import { loadTravelPins, type TravelPin } from "./travel-pins.js";

vi.mock("./location-privacy.js", async (importOriginal) => ({
  ...await importOriginal<typeof import("./location-privacy.js")>(),
  loadLocationEnvelopes: vi.fn()
}));

vi.mock("./travel-pins.js", async (importOriginal) => ({
  ...await importOriginal<typeof import("./travel-pins.js")>(),
  loadTravelPins: vi.fn()
}));

const { createAppNotificationAndPush, getRelationshipPermissions, listEncryptedRelationshipRecordsByParticipant, hasUserBlockBetween } = vi.hoisted(() => ({
  createAppNotificationAndPush: vi.fn(),
  getRelationshipPermissions: vi.fn(),
  listEncryptedRelationshipRecordsByParticipant: vi.fn(),
  hasUserBlockBetween: vi.fn()
}));

vi.mock("./notification-service.js", () => ({
  createAppNotificationAndPush
}));

vi.mock("./match-relationships.js", () => ({
  getRelationshipPermissions
}));

vi.mock("./encrypted-relationships.js", () => ({
  listEncryptedRelationshipRecordsByParticipant
}));

vi.mock("./user-blocks.js", () => ({
  hasUserBlockBetween
}));

const authorUserId = "00000000-0000-4000-8000-000000000001";
const recipientUserId = "00000000-0000-4000-8000-000000000002";
const postId = "00000000-0000-4000-8000-000000000003";
const config = {
  SESSION_SECRET: "test-only-feed-oos",
  PROFILE_ENCRYPTION_KEY: "test-only-feed-profile-key"
} as FastifyInstance["config"];

function appWithRecipients(userIds = [recipientUserId], hideFromOos = false) {
  const visibility = encryptProfileVisibility(config, {
    ...emptyProfile.visibility_rules,
    outside_service_area_members: hideFromOos
  });
  const query = vi.fn().mockImplementation(async (sql: string) => ({
    rows: sql.includes("profile_visibility_ciphertext")
      ? [{ id: authorUserId, ...visibility }]
      : userIds.map((user_id) => ({ user_id }))
  }));

  return {
    app: {
      config,
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
    listEncryptedRelationshipRecordsByParticipant.mockReset().mockResolvedValue([]);
    hasUserBlockBetween.mockReset().mockResolvedValue(false);
    vi.mocked(loadLocationEnvelopes).mockReset().mockResolvedValue(new Map());
    vi.mocked(loadTravelPins).mockReset().mockResolvedValue(new Map());
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
      title: "New Confessional post nearby",
      body: "Open Confessional to see what’s happening in your area.",
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

  it("notifies opted-in mutual cruushes for a Feed post without using the nearby audience", async () => {
    listEncryptedRelationshipRecordsByParticipant.mockResolvedValue([{
      payload: { participantUserIds: [authorUserId, recipientUserId] }
    }]);
    const { app, query } = appWithRecipients();

    await expect(notifyMutualCruushesForFeedPost(app, {
      postId,
      authorUserId,
      audience: "public"
    })).resolves.toEqual({ attempted: true, sent: 1 });

    expect(listEncryptedRelationshipRecordsByParticipant).toHaveBeenCalledWith(app, {
      participantUserId: authorUserId,
      type: "mutual_cruush",
      limit: 500
    });
    expect(String(query.mock.calls[0]?.[0])).toContain("coalesce(preferences.mutual_feed_enabled, true) = true");
    expect(String(query.mock.calls[0]?.[0])).not.toContain("location_updated_at");
    expect(query.mock.calls[0]?.[1]).toEqual([[recipientUserId], "public", postId]);
    expect(createAppNotificationAndPush).toHaveBeenCalledWith(app, {
      userId: recipientUserId,
      type: "mutual_feed_post",
      title: "New Confessional post",
      body: "Open Confessional to see it.",
      linkUrl: "/feed#latest",
      dedupeKey: `mutual-feed-post:${postId}:${recipientUserId}`,
      metadata: { postId },
      deferPush: true
    });
  });

  for (const [name, notify] of [
    ["nearby", notifyNearbyUsersForFeedPost],
    ["mutual", notifyMutualCruushesForFeedPost]
  ] as const) {
    it.each([
      { scenario: "OOS mutual", hide: true, location: "outside", pin: false, sent: 0 },
      { scenario: "unknown location", hide: true, location: "missing", pin: false, sent: 0 },
      { scenario: "in-area viewer", hide: true, location: "inside", pin: false, sent: 1 },
      { scenario: "active in-area MHC", hide: true, location: "outside", pin: true, sent: 1 },
      { scenario: "opt-out with unknown location", hide: false, location: "missing", pin: false, sent: 1 }
    ])(`${name} Feed respects OOS visibility for $scenario without exposing the author`, async (testCase) => {
      const { app } = appWithRecipients([recipientUserId], testCase.hide);
      listEncryptedRelationshipRecordsByParticipant.mockResolvedValue([{
        payload: { participantUserIds: [authorUserId, recipientUserId] }
      }]);
      if (testCase.location !== "missing") {
        const inside = testCase.location === "inside";
        vi.mocked(loadLocationEnvelopes).mockResolvedValue(new Map([[recipientUserId, {
          latE7: inside ? 407128000 : 423601000,
          lonE7: inside ? -740060000 : -710589000
        } as LocationPayload]]));
      }
      if (testCase.pin) {
        vi.mocked(loadTravelPins).mockResolvedValue(new Map([[recipientUserId, {
          latitude: 40.7128, longitude: -74.006, setAtMs: 1, expiresAtMs: 2
        } as TravelPin]]));
      }

      expect(await notify(app, { postId, authorUserId, audience: "mutuals" }))
        .toEqual({ attempted: true, sent: testCase.sent });
      expect(createAppNotificationAndPush).toHaveBeenCalledTimes(testCase.sent);
      for (const [, notification] of createAppNotificationAndPush.mock.calls) {
        expect(notification).not.toHaveProperty("actorUserId");
        expect(notification.metadata).toEqual({ postId });
        expect(JSON.stringify(notification)).not.toContain(authorUserId);
      }
    });

    it(`${name} Feed does not deliver when the OOS lookup fails`, async () => {
      const { app } = appWithRecipients([recipientUserId], true);
      listEncryptedRelationshipRecordsByParticipant.mockResolvedValue([{
        payload: { participantUserIds: [authorUserId, recipientUserId] }
      }]);
      vi.mocked(loadLocationEnvelopes).mockRejectedValue(new Error("location unavailable"));

      expect(await notify(app, { postId, authorUserId, audience: "public" }))
        .toEqual({ attempted: true, sent: 0 });
      expect(createAppNotificationAndPush).not.toHaveBeenCalled();
    });
  }
});
