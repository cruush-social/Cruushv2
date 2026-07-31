import type { FastifyInstance } from "fastify";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppConfig } from "./config.js";
import {
  assertCanSendNsfwMessagePhoto,
  cruushMatchSettingsPayloadSchema
} from "./cruush-match-settings.js";
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
      nsfwMessageVisibility: "mutual_crowds",
      nsfwSendVisibility: "mutual_crowds"
    });
  });

  it("allows NSFW message photos when the sender requires mutual crowds and all recipients share one", async () => {
    mockRecipientQuery(query);
    mockSettingsQuery(query, "mutual_crowds", "public");
    mockCrowdsQuery(query, ["Dyke"], ["Dyke", "T4T"]);

    await expect(assertCanSendNsfwMessagePhoto(createApp(query), {
      conversationId,
      senderUserId
    })).resolves.toBeUndefined();
  });

  it("blocks NSFW message photos when the sender requires mutual crowds and a recipient shares none", async () => {
    mockRecipientQuery(query);
    mockSettingsQuery(query, "mutual_crowds", "public");
    mockCrowdsQuery(query, ["Dyke"], ["Gay"]);

    await expect(assertCanSendNsfwMessagePhoto(createApp(query), {
      conversationId,
      senderUserId
    })).rejects.toMatchObject({
      statusCode: 403,
      code: "NSFW_MESSAGES_RESTRICTED",
      message: "Your cruush match settings only allow NSFW photos with mutual crowds."
    });
  });

  it("blocks NSFW message photos when a recipient only accepts them from mutual crowds", async () => {
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
