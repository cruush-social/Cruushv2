import type { FastifyInstance } from "fastify";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppConfig } from "./config.js";
import {
  assertCanSendNsfwMessagePhoto,
  canStartDirectMessage,
  cruushMatchSettingsPayloadSchema
} from "./cruush-match-settings.js";
import type { RelationshipPermissions } from "./match-relationships.js";
import { encryptSensitiveProfile, type SensitiveProfileData } from "./profile-sensitive.js";

const senderUserId = "11111111-1111-4111-8111-111111111111";
const recipientUserId = "22222222-2222-4222-8222-222222222222";
const conversationId = "33333333-3333-4333-8333-333333333333";

const config = {
  SESSION_SECRET: "test-secret",
  PROFILE_ENCRYPTION_KEY: "",
  PROFILE_TOKEN_KEY: "",
  PROFILE_TOKEN_KEY_VERSION: "v1"
} as AppConfig;

function createApp(query: ReturnType<typeof vi.fn>) {
  return {
    db: {
      query
    },
    config
  } as unknown as FastifyInstance;
}

function profileCrowdRow(id: string, crowds: SensitiveProfileData["crowds"]) {
  return {
    id,
    ...encryptSensitiveProfile(config, {
      is_trans: null,
      crowds,
      kinks: [],
      kink_interests: [],
      hiv_status: [],
      custom_hiv_status: ""
    })
  };
}

function relationship(overrides: Partial<RelationshipPermissions> = {}): RelationshipPermissions {
  return {
    matchId: null,
    isBlocked: false,
    isMutualCruush: false,
    hasOutgoingCruush: false,
    canMessage: true,
    canRevealMutualProtectedFields: false,
    canRevealPreciseLocation: false,
    shouldLogProfileView: true,
    viewerGhostMode: false,
    targetGhostMode: false,
    targetPreciseLocationVisibility: "none",
    ...overrides
  };
}

function mockOwnerAccessQuery(query: ReturnType<typeof vi.fn>) {
  query.mockResolvedValueOnce({
    rows: [{
      email: "tester@example.com"
    }]
  });
}

function mockRecipientQuery(query: ReturnType<typeof vi.fn>) {
  query.mockResolvedValueOnce({
    rows: [{
      user_id: recipientUserId
    }]
  });
}

function mockSettingsQuery(
  query: ReturnType<typeof vi.fn>,
  senderSendVisibility: "public" | "mutual_cruushes" | "mutual_crowds" | "none",
  recipientMessageVisibility: "public" | "mutual_cruushes" | "mutual_crowds" | "none"
) {
  query.mockResolvedValueOnce({
    rows: [{
      user_id: senderUserId,
      nsfw_message_visibility: "public",
      nsfw_send_visibility: senderSendVisibility,
      updated_at: "2026-07-31T05:00:00.000Z"
    }, {
      user_id: recipientUserId,
      nsfw_message_visibility: recipientMessageVisibility,
      nsfw_send_visibility: "public",
      updated_at: "2026-07-31T05:00:00.000Z"
    }]
  });
}

function mockCrowdsQuery(
  query: ReturnType<typeof vi.fn>,
  senderCrowds: SensitiveProfileData["crowds"],
  recipientCrowds: SensitiveProfileData["crowds"]
) {
  query.mockResolvedValueOnce({
    rows: [
      profileCrowdRow(senderUserId, senderCrowds),
      profileCrowdRow(recipientUserId, recipientCrowds)
    ]
  });
}

describe("cruush match settings", () => {
  let query: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    query = vi.fn();
  });

  it("accepts mutual crowd NSFW visibility settings", () => {
    expect(cruushMatchSettingsPayloadSchema.parse({
      nsfwMessageVisibility: "mutual_crowds",
      nsfwSendVisibility: "mutual_crowds"
    })).toEqual({
      messageVisibility: "mutual_cruushes",
      nsfwMessageVisibility: "mutual_crowds",
      nsfwSendVisibility: "mutual_crowds"
    });
  });

  it("ignores stale read-only timestamps from loaded settings payloads", () => {
    expect(cruushMatchSettingsPayloadSchema.parse({
      nsfwMessageVisibility: "public",
      nsfwSendVisibility: "mutual_cruushes",
      updatedAt: "2026-07-31T05:57:00.000Z"
    })).toEqual({
      messageVisibility: "mutual_cruushes",
      nsfwMessageVisibility: "public",
      nsfwSendVisibility: "mutual_cruushes"
    });
  });

  it("defaults new and schema-compatible accounts to mutual-only direct messages", async () => {
    query.mockResolvedValueOnce({ rows: [] });

    await expect(canStartDirectMessage(
      createApp(query),
      senderUserId,
      recipientUserId,
      relationship()
    )).resolves.toBe(false);
  });

  it("blocks non-mutual nearby messages while the recipient is in Ghost Mode", async () => {
    await expect(canStartDirectMessage(
      createApp(query),
      senderUserId,
      recipientUserId,
      relationship({ targetGhostMode: true })
    )).resolves.toBe(false);

    expect(query).not.toHaveBeenCalled();
  });

  it("keeps mutual cruush messages available while the recipient is in Ghost Mode", async () => {
    await expect(canStartDirectMessage(
      createApp(query),
      senderUserId,
      recipientUserId,
      relationship({
        isMutualCruush: true,
        targetGhostMode: true
      })
    )).resolves.toBe(true);

    expect(query).not.toHaveBeenCalled();
  });

  it("honors an explicit Public setting when the recipient is not in Ghost Mode", async () => {
    query.mockResolvedValueOnce({
      rows: [{
        message_visibility: "public",
        nsfw_message_visibility: "public",
        nsfw_send_visibility: "public",
        updated_at: "2026-08-09T08:00:00.000Z"
      }]
    });

    await expect(canStartDirectMessage(
      createApp(query),
      senderUserId,
      recipientUserId,
      relationship()
    )).resolves.toBe(true);
  });

  it("allows NSFW message photos when the sender requires mutual crowds and all recipients share one", async () => {
    mockOwnerAccessQuery(query);
    mockRecipientQuery(query);
    mockSettingsQuery(query, "mutual_crowds", "public");
    mockCrowdsQuery(query, ["Dyke"], ["Dyke", "T4T"]);

    await expect(assertCanSendNsfwMessagePhoto(createApp(query), {
      conversationId,
      senderUserId
    })).resolves.toBeUndefined();
  });

  it("blocks NSFW message photos when the sender requires mutual crowds and a recipient shares none", async () => {
    mockOwnerAccessQuery(query);
    mockRecipientQuery(query);
    mockSettingsQuery(query, "mutual_crowds", "public");
    mockCrowdsQuery(query, ["Dyke"], ["Gay"]);

    await expect(assertCanSendNsfwMessagePhoto(createApp(query), {
      conversationId,
      senderUserId
    })).rejects.toMatchObject({
      statusCode: 403,
      code: "NSFW_MESSAGES_RESTRICTED",
      message: "Your Message permissions only allow NSFW photos with mutual crowds."
    });
  });

  it("blocks NSFW message photos when a recipient only accepts them from mutual crowds", async () => {
    mockOwnerAccessQuery(query);
    mockRecipientQuery(query);
    mockSettingsQuery(query, "public", "mutual_crowds");
    mockCrowdsQuery(query, ["T4T"], ["Gay"]);

    await expect(assertCanSendNsfwMessagePhoto(createApp(query), {
      conversationId,
      senderUserId
    })).rejects.toMatchObject({
      statusCode: 403,
      code: "NSFW_MESSAGES_RESTRICTED",
      message: "A recipient only allows NSFW photos from mutual crowds."
    });
  });
});
