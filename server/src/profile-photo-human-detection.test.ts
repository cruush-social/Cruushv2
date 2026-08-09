import {
  DetectFacesCommand,
  DetectLabelsCommand,
  DetectModerationLabelsCommand
} from "@aws-sdk/client-rekognition";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import {
  classifyImageChildFaces,
  classifyProfilePhotoSafety,
  classifyPublicImageSafety,
  detectProfilePhotoHuman,
  detectPublicImageSafety,
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

  it("fails the combined decision closed when Rekognition is unavailable", () => {
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

describe("public feed image safety", () => {
  function faces(details: Array<{ Confidence: number; AgeRange: { Low: number; High: number } }> = []) {
    return { FaceDetails: details, $metadata: { requestId: "rekognition-feed-faces" } };
  }

  function moderation(labels: Array<{ Name: string; ParentName?: string; Confidence: number }>) {
    return { ModerationLabels: labels, $metadata: { requestId: "rekognition-feed-moderation" } };
  }

  it("keeps an ordinary feed photo with no rejectable label", () => {
    expect(classifyPublicImageSafety(
      moderation([]),
      faces([{ Confidence: 99, AgeRange: { Low: 25, High: 35 } }]),
      config
    )).toMatchObject({
      status: "complete",
      recommended_action: "keep",
      labels: [],
      raw_result: { child_face_outcome: "adult", rejected_label_count: 0 }
    });
  });

  // A shirtless or swimwear post is ordinary on this app and Stream does not reject it.
  // A Stream outage must not quietly make the feed stricter than it is when Stream is up.
  it("keeps swimwear, barechested and non-explicit nudity labels", () => {
    const result = classifyPublicImageSafety(
      moderation([
        { Name: "Barechested Male", ParentName: "Swimwear or Underwear", Confidence: 97 },
        { Name: "Male Swimwear or Underwear", ParentName: "Swimwear or Underwear", Confidence: 95 },
        { Name: "Non-Explicit Nudity", ParentName: "Non-Explicit Nudity of Intimate parts and Kissing", Confidence: 92 }
      ]),
      faces([{ Confidence: 99, AgeRange: { Low: 25, High: 35 } }]),
      config
    );

    expect(result.recommended_action).toBe("keep");
    expect(result.labels).toEqual([]);
    // The unrejected labels are still recorded so a moderator can see what was seen.
    expect(result.raw_result?.moderation_label_count).toBe(3);
  });

  it("rejects explicit content, gore, weapons and hate symbols on the feed", () => {
    for (const [name, parent, normalized] of [
      ["Explicit Nudity", "Explicit", "adult_nudity"],
      ["Explicit Sexual Activity", "Explicit", "adult_explicit"],
      ["Graphic Violence", "Violence", "gore"],
      ["Weapon Violence", "Violence", "threat"],
      ["Corpses", "Visually Disturbing", "gore"],
      ["Nazi Party", "Hate Symbols", "hate_symbol"]
    ] as const) {
      expect(classifyPublicImageSafety(
        moderation([{ Name: name, ParentName: parent, Confidence: 96 }]),
        faces(),
        config
      )).toMatchObject({
        recommended_action: "remove",
        labels: [expect.objectContaining({ normalized_label: normalized })]
      });
    }
  });

  it("still catches a child face on the feed with no Stream answer", () => {
    expect(classifyPublicImageSafety(
      moderation([]),
      faces([{ Confidence: 99, AgeRange: { Low: 8, High: 14 } }]),
      config
    )).toMatchObject({
      recommended_action: "remove",
      labels: [expect.objectContaining({ normalized_label: "minor_present" })]
    });
  });

  it("reports an error result when Rekognition is disabled so the feed still fails closed", async () => {
    await expect(detectPublicImageSafety({
      PROFILE_PHOTO_REKOGNITION_ENABLED: false,
      PROFILE_PHOTO_REKOGNITION_REGION: "us-east-1",
      PROFILE_PHOTO_REKOGNITION_HUMAN_CONFIDENCE: 90,
      PROFILE_PHOTO_REKOGNITION_ANIMAL_CONFIDENCE: 80,
      PROFILE_PHOTO_REKOGNITION_FACE_CONFIDENCE: 90,
      PROFILE_PHOTO_REKOGNITION_MINIMUM_AGE: 18,
      PROFILE_PHOTO_REKOGNITION_TIMEOUT_MS: 5000
    }, Buffer.from(""))).resolves.toMatchObject({ status: "error" });
  });

  it("asks Rekognition only for moderation labels and faces", async () => {
    const jpeg = await sharp({
      create: { width: 10, height: 10, channels: 3, background: { r: 10, g: 20, b: 30 } }
    }).jpeg().toBuffer();
    const commands: string[] = [];
    const client = {
      async send(command: DetectLabelsCommand | DetectFacesCommand | DetectModerationLabelsCommand) {
        commands.push(command.constructor.name);

        if (command instanceof DetectFacesCommand) {
          return {
            FaceDetails: [{ Confidence: 99, AgeRange: { Low: 30, High: 40 } }],
            $metadata: { requestId: "feed-faces" }
          };
        }

        return { ModerationLabels: [], $metadata: { requestId: "feed-moderation" } };
      }
    };

    const result = await detectPublicImageSafety({
      PROFILE_PHOTO_REKOGNITION_ENABLED: true,
      PROFILE_PHOTO_REKOGNITION_REGION: "us-east-1",
      PROFILE_PHOTO_REKOGNITION_HUMAN_CONFIDENCE: 90,
      PROFILE_PHOTO_REKOGNITION_ANIMAL_CONFIDENCE: 80,
      PROFILE_PHOTO_REKOGNITION_FACE_CONFIDENCE: 90,
      PROFILE_PHOTO_REKOGNITION_MINIMUM_AGE: 18,
      PROFILE_PHOTO_REKOGNITION_TIMEOUT_MS: 5000
    }, jpeg, client as never);

    expect(commands.sort()).toEqual(["DetectFacesCommand", "DetectModerationLabelsCommand"]);
    expect(result).toMatchObject({ status: "complete", recommended_action: "keep" });
  });
});
