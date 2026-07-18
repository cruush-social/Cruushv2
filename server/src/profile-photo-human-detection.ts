import {
  DetectLabelsCommand,
  RekognitionClient,
  type DetectLabelsCommandOutput,
  type Label
} from "@aws-sdk/client-rekognition";
import sharp from "sharp";
import type { AppConfig } from "./config.js";
import type { ProviderLabel, ProviderModerationResult } from "./moderation-types.js";

type RekognitionLabelClient = Pick<RekognitionClient, "send">;

const HUMAN_LABELS = new Set(["human", "people", "person"]);
const ANIMAL_LABEL_PATTERN = /\b(?:animal|amphibian|bird|canine|cat|dog|feline|fish|horse|insect|livestock|mammal|pet|primate|reptile|rodent|wildlife)s?\b/i;
const REKOGNITION_REQUEST_MIN_CONFIDENCE = 70;

function signalNames(label: Label) {
  return [
    label.Name,
    ...(label.Parents ?? []).map((parent) => parent.Name),
    ...(label.Categories ?? []).map((category) => category.Name)
  ].filter((name): name is string => typeof name === "string" && name.trim().length > 0);
}

function strongestConfidence(labels: Label[], predicate: (name: string) => boolean) {
  let strongest = 0;

  for (const label of labels) {
    if (signalNames(label).some(predicate)) {
      strongest = Math.max(strongest, label.Confidence ?? 0);
    }
  }

  return strongest;
}

function strongestLabelNameConfidence(labels: Label[], predicate: (name: string) => boolean) {
  return labels.reduce((strongest, label) => (
    label.Name && predicate(label.Name)
      ? Math.max(strongest, label.Confidence ?? 0)
      : strongest
  ), 0);
}

export function classifyProfilePhotoLabels(
  output: Pick<DetectLabelsCommandOutput, "Labels" | "$metadata">,
  config: Pick<AppConfig, "PROFILE_PHOTO_REKOGNITION_HUMAN_CONFIDENCE" | "PROFILE_PHOTO_REKOGNITION_ANIMAL_CONFIDENCE">
): ProviderModerationResult {
  const labels = output.Labels ?? [];
  const humanConfidence = strongestLabelNameConfidence(labels, (name) => HUMAN_LABELS.has(name.toLowerCase()));
  const animalConfidence = strongestConfidence(labels, (name) => ANIMAL_LABEL_PATTERN.test(name));
  const requiredHumanConfidence = config.PROFILE_PHOTO_REKOGNITION_HUMAN_CONFIDENCE ?? 90;
  const rejectedAnimalConfidence = config.PROFILE_PHOTO_REKOGNITION_ANIMAL_CONFIDENCE ?? 80;
  const hasHuman = humanConfidence >= requiredHumanConfidence;
  const hasAnimal = animalConfidence >= rejectedAnimalConfidence;
  const normalizedLabels: ProviderLabel[] = [];

  if (hasHuman) {
    normalizedLabels.push({
      provider_label: "Amazon Rekognition: Person",
      normalized_label: "human_present",
      confidence: humanConfidence / 100,
      severity: "none"
    });
  }

  if (hasAnimal || !hasHuman) {
    normalizedLabels.push({
      provider_label: hasAnimal
        ? "Amazon Rekognition: Animal"
        : "Amazon Rekognition: Person not detected",
      normalized_label: "profile_photo_not_adult_human",
      confidence: hasAnimal ? animalConfidence / 100 : 1,
      severity: "high"
    });
  }

  return {
    provider: "aws_rekognition",
    provider_request_id: output.$metadata?.requestId ?? `rekognition-${Date.now().toString(36)}`,
    labels: normalizedLabels,
    latency_ms: 0,
    status: "complete",
    recommended_action: hasHuman && !hasAnimal ? "keep" : "remove",
    raw_result: {
      human_confidence: humanConfidence,
      animal_confidence: animalConfidence,
      required_human_confidence: requiredHumanConfidence,
      rejected_animal_confidence: rejectedAnimalConfidence,
      outcome: hasAnimal ? "animal_detected" : hasHuman ? "human_detected" : "human_not_detected"
    }
  };
}

export async function detectProfilePhotoHuman(
  config: Pick<
    AppConfig,
    | "PROFILE_PHOTO_REKOGNITION_ENABLED"
    | "PROFILE_PHOTO_REKOGNITION_REGION"
    | "PROFILE_PHOTO_REKOGNITION_HUMAN_CONFIDENCE"
    | "PROFILE_PHOTO_REKOGNITION_ANIMAL_CONFIDENCE"
    | "PROFILE_PHOTO_REKOGNITION_TIMEOUT_MS"
  >,
  imageBytes: Buffer,
  client?: RekognitionLabelClient
): Promise<ProviderModerationResult> {
  if (!config.PROFILE_PHOTO_REKOGNITION_ENABLED) {
    return {
      provider: "aws_rekognition",
      provider_request_id: "rekognition-disabled",
      labels: [],
      latency_ms: 0,
      status: "error",
      error: "Profile-photo human detection is disabled."
    };
  }

  const startedAt = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    config.PROFILE_PHOTO_REKOGNITION_TIMEOUT_MS ?? 5000
  );

  try {
    const rekognition = client ?? new RekognitionClient({
      region: config.PROFILE_PHOTO_REKOGNITION_REGION ?? "us-east-1"
    });
    const compatibleImageBytes = await sharp(imageBytes, {
      animated: false,
      failOn: "error",
      limitInputPixels: 40_000_000
    }).jpeg({ quality: 90, mozjpeg: true }).toBuffer();
    const output = await rekognition.send(new DetectLabelsCommand({
      Image: { Bytes: compatibleImageBytes },
      Features: ["GENERAL_LABELS"],
      MinConfidence: REKOGNITION_REQUEST_MIN_CONFIDENCE,
      MaxLabels: 100
    }), { abortSignal: controller.signal }) as DetectLabelsCommandOutput;
    const result = classifyProfilePhotoLabels(output, config);

    return {
      ...result,
      latency_ms: Date.now() - startedAt
    };
  } catch (error) {
    return {
      provider: "aws_rekognition",
      provider_request_id: `rekognition-error-${Date.now().toString(36)}`,
      labels: [],
      latency_ms: Date.now() - startedAt,
      status: "error",
      raw_result: {
        error_name: error instanceof Error ? error.name : "UnknownError"
      },
      error: error instanceof Error ? error.message : "Profile-photo human detection failed."
    };
  } finally {
    clearTimeout(timeout);
  }
}

export function mergeProfilePhotoSafetyResults(
  streamResult: ProviderModerationResult,
  humanResult: ProviderModerationResult
): ProviderModerationResult {
  const humanFailed = humanResult.status?.toLowerCase() !== "complete" || Boolean(humanResult.error);
  const humanRejected = humanResult.recommended_action?.toLowerCase() !== "keep";

  return {
    ...streamResult,
    provider: `${streamResult.provider}+${humanResult.provider}`,
    provider_request_id: `${streamResult.provider_request_id}:${humanResult.provider_request_id}`,
    labels: [...streamResult.labels, ...humanResult.labels],
    latency_ms: streamResult.latency_ms + humanResult.latency_ms,
    status: humanFailed ? "error" : streamResult.status,
    recommended_action: humanRejected ? "remove" : streamResult.recommended_action,
    raw_result: {
      stream: streamResult.raw_result ?? {},
      profile_photo_human_detection: humanResult.raw_result ?? {}
    },
    ...(humanFailed ? { error: humanResult.error ?? "Profile-photo human detection failed." } : {})
  };
}
