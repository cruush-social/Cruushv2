import {
  DetectFacesCommand,
  DetectLabelsCommand,
  DetectModerationLabelsCommand
} from "@aws-sdk/client-rekognition";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import {
  classifyImageChildFaces,
  classifyPublicImageSafety,
  classifyProfilePhotoSafety,
  detectProfilePhotoHuman,
  mergeProfilePhotoSafetyResults
} from "./profile-photo-human-detection.js";
import type { ProviderModerationResult } from "./moderation-types.js";

const config = {
  PROFILE_PHOTO_REKOGNITION_HUMAN_CONFIDENCE: 90,
  PROFILE_PHOTO_REKOGNITION_ANIMAL_CONFIDENCE: 80,
  PROFILE_PHOTO_REKOGNITION_FACE_CONFIDENCE: 90,
  PROFILE_PHOTO_REKOGNITION_MINIMUM_AGE: 18
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

describe("image child-face and profile-photo human detection", () => {
  it("allows an adult face when the estimated range begins at 18 or older", () => {
    expect(classifyProfilePhotoSafety({
      Labels: [{ Name: "Person", Confidence: 98 }],
      $metadata: { requestId: "rekognition-labels-adult" }
    }, {
      FaceDetails: [{ Confidence: 99, AgeRange: { Low: 18, High: 27 } }],
      $metadata: { requestId: "rekognition-faces-adult" }
    }, null, config)).toMatchObject({
      status: "complete",
      recommended_action: "keep",
      labels: expect.arrayContaining([expect.objectContaining({ normalized_label: "human_present" })]),
      raw_result: { outcome: "human_detected" }
    });
  });

  it("allows a faceless adult body when Rekognition still detects a Person", () => {
    expect(classifyProfilePhotoSafety({
      Labels: [{ Name: "Person", Confidence: 98 }],
      $metadata: { requestId: "rekognition-labels-faceless" }
    }, {
      FaceDetails: [],
      $metadata: { requestId: "rekognition-faces-faceless" }
    }, null, config)).toMatchObject({
      recommended_action: "keep",
      labels: [expect.objectContaining({ normalized_label: "human_present" })],
      raw_result: { outcome: "human_detected" }
    });
  });

  it("permanently actionable child label is emitted only when the face range ends below 18", () => {
    expect(classifyImageChildFaces({
      FaceDetails: [{ Confidence: 99, AgeRange: { Low: 6, High: 10 } }],
      $metadata: { requestId: "rekognition-child" }
    }, config)).toMatchObject({
      recommended_action: "remove",
      labels: [{
        normalized_label: "minor_present",
        severity: "critical"
      }],
      raw_result: { child_face_outcome: "minor" }
    });
  });

  it("allows an age range that overlaps 18 without emitting the permanent-ban label", () => {
    expect(classifyImageChildFaces({
      FaceDetails: [{ Confidence: 99, AgeRange: { Low: 16, High: 23 } }],
      $metadata: { requestId: "rekognition-ambiguous" }
    }, config)).toMatchObject({
      recommended_action: "keep",
      labels: [{ normalized_label: "minor_age_ambiguous" }],
      raw_result: { child_face_outcome: "ambiguous" }
    });
  });

  it("allows a message image with no detected face", () => {
    expect(classifyImageChildFaces({
      FaceDetails: [],
      $metadata: { requestId: "rekognition-no-face" }
    }, config)).toMatchObject({
      recommended_action: "keep",
      labels: [],
      raw_result: { child_face_outcome: "no_face" }
    });
  });

  it("rejects profile photos without a Person signal or visible face", () => {
    expect(classifyProfilePhotoSafety({
      Labels: [{ Name: "Landscape", Confidence: 99 }],
      $metadata: { requestId: "rekognition-landscape" }
    }, {
      FaceDetails: [],
      $metadata: { requestId: "rekognition-no-faces" }
    }, null, config)).toMatchObject({
      recommended_action: "remove",
      labels: [{ normalized_label: "profile_photo_not_adult_human" }],
      raw_result: { outcome: "human_not_detected" }
    });
  });

  it("flags but allows adult profile photos with Rekognition nudity moderation labels", () => {
    expect(classifyProfilePhotoSafety({
      Labels: [{ Name: "Person", Confidence: 99 }],
      $metadata: { requestId: "rekognition-labels-adult" }
    }, {
      FaceDetails: [{ Confidence: 99, AgeRange: { Low: 25, High: 35 } }],
      $metadata: { requestId: "rekognition-faces-adult" }
    }, {
      ModerationLabels: [{
        Name: "Sexual Activity",
        ParentName: "Explicit Nudity",
        Confidence: 96
      }],
      $metadata: { requestId: "rekognition-moderation-explicit" }
    }, config)).toMatchObject({
      recommended_action: "keep",
      labels: expect.arrayContaining([
        expect.objectContaining({ normalized_label: "adult_explicit", confidence: 0.96 })
      ]),
      raw_result: { outcome: "nudity_detected" }
    });
  });

  it("rejects detected animals even when an adult person is present", () => {
    expect(classifyProfilePhotoSafety({
      Labels: [{ Name: "Person", Confidence: 99 }, {
        Name: "Dog",
        Confidence: 96,
        Parents: [{ Name: "Animal" }]
      }],
      $metadata: { requestId: "rekognition-animal-labels" }
    }, {
      FaceDetails: [{ Confidence: 99, AgeRange: { Low: 25, High: 35 } }],
      $metadata: { requestId: "rekognition-adult-face" }
    }, null, config)).toMatchObject({
      recommended_action: "remove",
      labels: expect.arrayContaining([
        expect.objectContaining({ normalized_label: "human_present" }),
        expect.objectContaining({ normalized_label: "profile_photo_not_adult_human" })
      ]),
      raw_result: { outcome: "animal_detected" }
    });
  });

  it("maps public-image safety labels without rejecting ordinary non-explicit nudity", () => {
    expect(classifyPublicImageSafety({
      ModerationLabels: [{ Name: "Explicit Nudity", Confidence: 96 }],
      $metadata: { requestId: "rekognition-public-explicit" }
    }, {
      FaceDetails: [],
      $metadata: { requestId: "rekognition-public-faces" }
    }, config)).toMatchObject({
      recommended_action: "remove",
      labels: [{ normalized_label: "adult_nudity", confidence: 0.96 }]
    });

    expect(classifyPublicImageSafety({
      ModerationLabels: [{ Name: "Non-Explicit Nudity", Confidence: 96 }],
      $metadata: { requestId: "rekognition-public-non-explicit" }
    }, {
      FaceDetails: [],
      $metadata: { requestId: "rekognition-public-faces" }
    }, config)).toMatchObject({
      recommended_action: "keep",
      labels: []
    });
  });

  it("preserves a healthy Stream decision when Rekognition is unavailable", () => {
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
      status: "complete",
      recommended_action: "keep",
      raw_result: {
        rekognition_status: "error",
        rekognition_error: "timeout"
      }
    });
    expect(merged).not.toHaveProperty("error");
  });

  it("fails the combined decision closed when both providers are unavailable", () => {
    const merged = mergeProfilePhotoSafetyResults({
      ...streamKeep(),
      status: "error",
      error: "Stream unavailable"
    }, {
      provider: "aws_rekognition",
      provider_request_id: "rekognition-error-2",
      labels: [],
      latency_ms: 5,
      status: "error",
      error: "Rekognition unavailable"
    });

    expect(merged).toMatchObject({
      provider: "stream+aws_rekognition",
      status: "error",
      error: "Rekognition unavailable"
    });
  });

  it("converts sanitized WebP to JPEG for both Rekognition calls", async () => {
    const webp = await sharp({
      create: {
        width: 10,
        height: 10,
        channels: 3,
        background: { r: 20, g: 40, b: 60 }
      }
    }).webp().toBuffer();
    const receivedFormats: string[] = [];
    const client = {
      async send(command: DetectLabelsCommand | DetectFacesCommand | DetectModerationLabelsCommand) {
        const bytes = (command as { input: { Image?: { Bytes?: Uint8Array } } }).input.Image?.Bytes;
        receivedFormats.push(bytes ? (await sharp(Buffer.from(bytes)).metadata()).format ?? "" : "");

        if (command instanceof DetectFacesCommand) {
          return {
            FaceDetails: [{ Confidence: 99, AgeRange: { Low: 25, High: 35 } }],
            $metadata: { requestId: "rekognition-webp-faces" }
          };
        }

        if (command instanceof DetectModerationLabelsCommand) {
          return {
            ModerationLabels: [],
            $metadata: { requestId: "rekognition-webp-moderation" }
          };
        }

        return {
          Labels: [{ Name: "Person", Confidence: 99 }],
          $metadata: { requestId: "rekognition-webp-labels" }
        };
      }
    };
    const result = await detectProfilePhotoHuman({
      PROFILE_PHOTO_REKOGNITION_ENABLED: true,
      PROFILE_PHOTO_REKOGNITION_REGION: "us-east-1",
      PROFILE_PHOTO_REKOGNITION_HUMAN_CONFIDENCE: 90,
      PROFILE_PHOTO_REKOGNITION_ANIMAL_CONFIDENCE: 80,
      PROFILE_PHOTO_REKOGNITION_FACE_CONFIDENCE: 90,
      PROFILE_PHOTO_REKOGNITION_MINIMUM_AGE: 18,
      PROFILE_PHOTO_REKOGNITION_TIMEOUT_MS: 5000
    }, webp, client as never);

    expect(receivedFormats).toEqual(["jpeg", "jpeg", "jpeg"]);
    expect(result).toMatchObject({
      status: "complete",
      recommended_action: "keep"
    });
  });
});
