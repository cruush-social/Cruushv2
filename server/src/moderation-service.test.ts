import type { FastifyInstance } from "fastify";
import { describe, expect, it, vi } from "vitest";
import {
  moderateMessageTextOrAllowByKeyword,
  moderateProfileOrReject,
  moderateTextOrReject
} from "./moderation-service.js";
import type { ModerationSurface } from "./moderation-types.js";

function createApp() {
  return {
    config: {
      MODERATION_PROVIDER: "mock",
      MODERATION_TIMEOUT_MS: 5000,
      STREAM_MODERATION_ENABLED: false,
      STREAM_API_KEY: "",
      STREAM_API_SECRET: "",
      STREAM_MODERATION_CONFIG_KEY: ""
    },
    db: {
      query: vi.fn().mockResolvedValue({ rows: [] })
    }
  } as unknown as FastifyInstance;
}

async function moderateSurface(surface: ModerationSurface, text: string) {
  const app = createApp();
  const input = {
    userId: "user-1",
    surface,
    text
  } as const;

  if (surface === "profile") {
    return moderateProfileOrReject(app, {
      userId: input.userId,
      fields: { bio: text }
    });
  }

  if (surface === "direct_message" || surface === "group_message") {
    return moderateMessageTextOrAllowByKeyword(app, input);
  }

  return moderateTextOrReject(app, input);
}

describe("text language moderation policy", () => {
  it("rejects the hard-r racial slur across feed, messaging, and profiles", async () => {
    for (const surface of ["feed", "direct_message", "group_message", "profile"] as const) {
      await expect(moderateSurface(surface, "n.i.g.g.e.r")).rejects.toMatchObject({
        code: "CONTENT_REJECTED"
      });
    }
  });

  it("allows LGBTQ slurs, nigga, sexual slang, and general profanity on every text surface", async () => {
    const text = "faggot tranny nigga fuck shit bitch cunt slut whore dick cock pussy";

    for (const surface of ["feed", "direct_message", "group_message", "profile"] as const) {
      await expect(moderateSurface(surface, text)).resolves.toMatchObject({
        decision: expect.objectContaining({ decision: "allow" })
      });
    }
  });

  it("uses provider review for allowed slurs but skips it for ordinary profanity in messages", async () => {
    await expect(moderateSurface("direct_message", "faggot tranny nigga")).resolves.toMatchObject({
      providerResult: expect.objectContaining({ provider: "mock" })
    });
    await expect(moderateSurface("direct_message", "fuck shit bitch cunt")).resolves.toMatchObject({
      providerResult: expect.objectContaining({ provider: "keyword_prefilter" })
    });
  });

  it("still rejects violent context that contains an allowed LGBTQ slur", async () => {
    for (const surface of ["feed", "direct_message"] as const) {
      await expect(moderateSurface(surface, "kill all faggots")).rejects.toMatchObject({
        code: "CONTENT_REJECTED"
      });
    }
  });
});
