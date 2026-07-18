import { describe, expect, it } from "vitest";
import type { DetectLabelsCommand } from "@aws-sdk/client-rekognition";
import sharp from "sharp";
import {
  classifyProfilePhotoLabels,
  detectProfilePhotoHuman,
  mergeProfilePhotoSafetyResults
} from "./profile-photo-human-detection.js";
import type { ProviderModerationResult } from "./moderation-types.js";

const config = {
  PROFILE_PHOTO_REKOGNITION_HUMAN_CONFIDENCE: 90,
  PROFILE_PHOTO_REKOGNITION_ANIMAL_CONFIDENCE: 80
};

function streamKeep(): ProviderModerationResult {
  return {
    provider: "stream",
    provider_request_id: "stream-1",
    labels: [],
    latency_ms: 10,
    status: "complete",
    recommended_action: "keep",
    raw_result: {}
  };
}

describe("profile-photo human detection", () => {
  it("creates human proof only above the configured Person confidence", () => {
    expect(classifyProfilePhotoLabels({
      Labels: [{ Name: "Person", Confidence: 98 }],
      $metadata: { requestId: "rekognition-human-1" }
    }, config)).toMatchObject({
      status: "complete",
      recommended_action: "keep",
      labels: [{
        normalized_label: "human_present",
        confidence: 0.98
      }],
      raw_result: { outcome: "human_detected" }
    });
  });

  it("rejects images without a high-confidence Person signal", () => {
    expect(classifyProfilePhotoLabels({
      Labels: [{ Name: "Landscape", Confidence: 99 }],
      $metadata: { requestId: "rekognition-landscape-1" }
    }, config)).toMatchObject({
      recommended_action: "remove",
      labels: [{ normalized_label: "profile_photo_not_adult_human" }],
      raw_result: { outcome: "human_not_detected" }
    });
  });

  it("does not treat an abstract label with Person ancestry as direct human proof", () => {
    expect(classifyProfilePhotoLabels({
      Labels: [{ Name: "Sport", Confidence: 99, Parents: [{ Name: "Person" }] }],
      $metadata: { requestId: "rekognition-parent-only-1" }
    }, config)).toMatchObject({
      recommended_action: "remove",
      raw_result: { outcome: "human_not_detected" }
    });
  });

  it("rejects detected animals even when a person is present", () => {
    expect(classifyProfilePhotoLabels({
      Labels: [{ Name: "Person", Confidence: 99 }, {
        Name: "Dog",
        Confidence: 96,
        Parents: [{ Name: "Animal" }]
      }],
      $metadata: { requestId: "rekognition-animal-1" }
    }, config)).toMatchObject({
      recommended_action: "remove",
      labels: expect.arrayContaining([
        expect.objectContaining({ normalized_label: "human_present" }),
        expect.objectContaining({ normalized_label: "profile_photo_not_adult_human" })
      ]),
      raw_result: { outcome: "animal_detected" }
    });
  });

  it("fails the combined decision closed when the human detector is unavailable", () => {
    const merged = mergeProfilePhotoSafetyResults(streamKeep(), {
      provider: "aws_rekognition",
      provider_request_id: "rekognition-error-1",
      labels: [],
      latency_ms: 5,
      status: "error",
      error: "timeout"
    });

    expect(merged).toMatchObject({
      provider: "stream+aws_rekognition",
      status: "error",
      recommended_action: "remove",
      error: "timeout"
    });
  });

  it("converts a sanitized WebP upload to Rekognition-compatible JPEG bytes", async () => {
    const webp = await sharp({
      create: {
        width: 10,
        height: 10,
        channels: 3,
        background: { r: 20, g: 40, b: 60 }
      }
    }).webp().toBuffer();
    let receivedFormat: string | undefined;
    const client = {
      async send(command: DetectLabelsCommand) {
        const bytes = command.input.Image?.Bytes;
        receivedFormat = bytes ? (await sharp(Buffer.from(bytes)).metadata()).format : undefined;
        return {
          Labels: [{ Name: "Person", Confidence: 99 }],
          $metadata: { requestId: "rekognition-webp-1" }
        };
      }
    };
    const result = await detectProfilePhotoHuman({
      PROFILE_PHOTO_REKOGNITION_ENABLED: true,
      PROFILE_PHOTO_REKOGNITION_REGION: "us-east-1",
      PROFILE_PHOTO_REKOGNITION_HUMAN_CONFIDENCE: 90,
      PROFILE_PHOTO_REKOGNITION_ANIMAL_CONFIDENCE: 80,
      PROFILE_PHOTO_REKOGNITION_TIMEOUT_MS: 5000
    }, webp, client as never);

    expect(receivedFormat).toBe("jpeg");
    expect(result).toMatchObject({
      status: "complete",
      recommended_action: "keep"
    });
  });
});
