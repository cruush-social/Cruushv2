import { describe, expect, it, vi } from "vitest";
import type { ProviderModerationResult } from "./moderation-types.js";

const state = vi.hoisted(() => ({
  faceDetails: [{ Confidence: 99, AgeRange: { Low: 7, High: 11 } }]
}));

vi.mock("@aws-sdk/client-rekognition", () => ({
  DetectFacesCommand: class DetectFacesCommand {
    constructor(readonly input: unknown) {}
  },
  DetectLabelsCommand: class DetectLabelsCommand {
    constructor(readonly input: unknown) {}
  },
  RekognitionClient: class RekognitionClient {
    async send() {
      return {
        FaceDetails: state.faceDetails,
        $metadata: { requestId: "rekognition-message-child" }
      };
    }
  }
}));

vi.mock("./moderation-provider.js", () => ({
  createModerationProvider: () => ({
    name: "stream",
    version: "test",
    moderateText: vi.fn(),
    moderateImage: vi.fn(async () => ({
      provider: "stream",
      provider_request_id: "stream-message-keep",
      labels: [],
      latency_ms: 1,
      status: "complete",
      recommended_action: "keep",
      raw_result: {}
    } satisfies ProviderModerationResult))
  })
}));

import type { FastifyInstance } from "fastify";
import { moderateImageOrReject } from "./moderation-service.js";

const onePixelPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64"
);

describe("message-photo child-face enforcement", () => {
  it.each(["direct_message", "group_message"] as const)(
    "permanently bans child-face uploads on %s",
    async (surface) => {
      const query = vi.fn().mockResolvedValue({ rows: [] });
      const app = {
        config: {
          PROFILE_PHOTO_STREAM_AUTOMOD_ENABLED: true,
          PROFILE_PHOTO_REKOGNITION_ENABLED: true,
          PROFILE_PHOTO_REKOGNITION_REGION: "us-east-1",
          PROFILE_PHOTO_REKOGNITION_HUMAN_CONFIDENCE: 90,
          PROFILE_PHOTO_REKOGNITION_ANIMAL_CONFIDENCE: 80,
          PROFILE_PHOTO_REKOGNITION_FACE_CONFIDENCE: 90,
          PROFILE_PHOTO_REKOGNITION_MINIMUM_AGE: 18,
          PROFILE_PHOTO_REKOGNITION_TIMEOUT_MS: 5000
        },
        db: { query }
      } as unknown as FastifyInstance;

      await expect(moderateImageOrReject(app, {
        userId: "11111111-1111-4111-8111-111111111111",
        surface,
        mimeType: "image/png",
        bytes: onePixelPng,
        severeAccessBanIdentity: {
          deviceHash: "device-hash",
          ipHash: "ip-hash"
        }
      })).rejects.toMatchObject({
        statusCode: 403,
        code: "CONTENT_REJECTED",
        message: expect.stringContaining("permanently banned")
      });

      const sql = query.mock.calls.map(([text]) => String(text));
      expect(sql.some((text) => text.includes("account_status = 'suspended'"))).toBe(true);
      expect(sql.some((text) => text.includes("delete from app_sessions"))).toBe(true);
      expect(sql.filter((text) => text.includes("insert into severe_access_bans"))).toHaveLength(2);
    }
  );
});
