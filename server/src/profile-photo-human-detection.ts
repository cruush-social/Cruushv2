import {
  DetectFacesCommand,
  DetectLabelsCommand,
  DetectModerationLabelsCommand,
  RekognitionClient,
  type DetectFacesCommandOutput,
  type DetectLabelsCommandOutput,
  type DetectModerationLabelsCommandOutput,
  type FaceDetail,
  type Label,
  type ModerationLabel
} from "@aws-sdk/client-rekognition";
import sharp from "sharp";
import type { AppConfig } from "./config.js";
import type { ProviderLabel, ProviderModerationResult } from "./moderation-types.js";

type RekognitionImageClient = Pick<RekognitionClient, "send">;
type RekognitionSafetyConfig = Pick<
  AppConfig,
  | "PROFILE_PHOTO_REKOGNITION_HUMAN_CONFIDENCE"
  | "PROFILE_PHOTO_REKOGNITION_ANIMAL_CONFIDENCE"
  | "PROFILE_PHOTO_REKOGNITION_FACE_CONFIDENCE"
  | "PROFILE_PHOTO_REKOGNITION_MINIMUM_AGE"
>;

const HUMAN_LABELS = new Set(["human", "people", "person"]);
const ANIMAL_LABEL_PATTERN = /\b(?:animal|amphibian|bird|canine|cat|dog|feline|fish|horse|insect|livestock|mammal|pet|primate|reptile|rodent|wildlife)s?\b/i;
const MINOR_LABEL_PATTERN = /\b(?:baby|babies|boy|boys|child|children|girl|girls|infant|infants|kid|kids|newborn|teen|teenager|toddler|youth)\b/i;
const NUDITY_MODERATION_LABEL_PATTERN = /\b(?:explicit nudity|nudity|non-explicit nudity|partial nudity|graphic (?:male|female) nudity|illustrated explicit nudity|sexual activity|sexual situations|sex toy|sex toys)\b/i;
const REKOGNITION_REQUEST_MIN_CONFIDENCE = 70;
const REKOGNITION_MODERATION_MIN_CONFIDENCE = 50;

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

function highConfidenceFaces(faces: FaceDetail[], requiredFaceConfidence: number) {
  return faces.filter((face) => (face.Confidence ?? 0) >= requiredFaceConfidence);
}

function faceAgeOutcome(faces: FaceDetail[], minimumAge: number) {
  const definiteMinor = faces.find((face) => (
    typeof face.AgeRange?.High === "number" && face.AgeRange.High < minimumAge
  ));

  if (definiteMinor) {
    return "minor" as const;
  }

  const ambiguous = faces.some((face) => (
    typeof face.AgeRange?.Low !== "number" ||
    typeof face.AgeRange?.High !== "number" ||
    face.AgeRange.Low < minimumAge
  ));

  return ambiguous ? "ambiguous" as const : "adult" as const;
}

function safeFaceSummary(faces: FaceDetail[]) {
  return faces.map((face) => ({
    confidence: face.Confidence ?? null,
    age_low: face.AgeRange?.Low ?? null,
    age_high: face.AgeRange?.High ?? null
  }));
}

function moderationSignalNames(label: ModerationLabel) {
  return [label.ParentName, label.Name].filter((name): name is string =>
    typeof name === "string" && name.trim().length > 0
  );
}

function profilePhotoNudityLabels(labels: ModerationLabel[]): ProviderLabel[] {
  return labels.flatMap((label) => {
    const signals = moderationSignalNames(label);

    if (!signals.some((signal) => NUDITY_MODERATION_LABEL_PATTERN.test(signal))) {
      return [];
    }

    const joinedSignals = signals.join(" > ");
    const isExplicit = /\b(?:explicit|sexual|sex toy|sex toys|graphic)\b/i.test(joinedSignals);

    return [{
      provider_label: `Amazon Rekognition moderation: ${joinedSignals}`,
      normalized_label: isExplicit ? "adult_explicit" : "adult_nudity",
      confidence: Math.max(Math.min((label.Confidence ?? 0) / 100, 0.99), 0.9),
      severity: "high"
    }];
  });
}

function childFaceLabels(
  faces: FaceDetail[],
  config: RekognitionSafetyConfig,
  minorLabelConfidence = 0
): {
  labels: ProviderLabel[];
  outcome: "no_face" | "adult" | "ambiguous" | "minor";
} {
  const requiredFaceConfidence = config.PROFILE_PHOTO_REKOGNITION_FACE_CONFIDENCE ?? 90;
  const minimumAge = config.PROFILE_PHOTO_REKOGNITION_MINIMUM_AGE ?? 18;
  const consideredFaces = highConfidenceFaces(faces, requiredFaceConfidence);
  const ageOutcome = consideredFaces.length === 0
    ? "no_face" as const
    : faceAgeOutcome(consideredFaces, minimumAge);

  if (ageOutcome === "minor") {
    const strongestFaceConfidence = Math.max(...consideredFaces.map((face) => face.Confidence ?? 0));
    return {
      outcome: "minor",
      labels: [{
        provider_label: "Amazon Rekognition: detected face estimated below minimum age",
        normalized_label: "minor_present",
        confidence: Math.min(strongestFaceConfidence / 100, 0.99),
        severity: "critical"
      }]
    };
  }

  if (ageOutcome === "ambiguous" || minorLabelConfidence >= 90) {
    return {
      outcome: "ambiguous",
      labels: [{
        provider_label: ageOutcome === "ambiguous"
          ? "Amazon Rekognition: face age overlaps minimum age"
          : "Amazon Rekognition: possible minor label",
        normalized_label: "minor_age_ambiguous",
        confidence: ageOutcome === "ambiguous" ? 0.85 : minorLabelConfidence / 100,
        severity: "high"
      }]
    };
  }

  return { outcome: ageOutcome, labels: [] };
}

export function classifyImageChildFaces(
  output: Pick<DetectFacesCommandOutput, "FaceDetails" | "$metadata">,
  config: RekognitionSafetyConfig
): ProviderModerationResult {
  const faces = output.FaceDetails ?? [];
  const childGate = childFaceLabels(faces, config);

  return {
    provider: "aws_rekognition",
    provider_request_id: output.$metadata?.requestId ?? `rekognition-faces-${Date.now().toString(36)}`,
    labels: childGate.labels,
    latency_ms: 0,
    status: "complete",
    recommended_action: childGate.outcome === "minor" ? "remove" : "keep",
    raw_result: {
      child_face_outcome: childGate.outcome,
      face_count: faces.length,
      considered_faces: safeFaceSummary(highConfidenceFaces(
        faces,
        config.PROFILE_PHOTO_REKOGNITION_FACE_CONFIDENCE ?? 90
      )),
      minimum_age: config.PROFILE_PHOTO_REKOGNITION_MINIMUM_AGE ?? 18,
      required_face_confidence: config.PROFILE_PHOTO_REKOGNITION_FACE_CONFIDENCE ?? 90
    }
  };
}

export function classifyProfilePhotoSafety(
  labelsOutput: Pick<DetectLabelsCommandOutput, "Labels" | "$metadata">,
  facesOutput: Pick<DetectFacesCommandOutput, "FaceDetails" | "$metadata">,
  moderationOutput: Pick<DetectModerationLabelsCommandOutput, "ModerationLabels" | "$metadata"> | null,
  config: RekognitionSafetyConfig
): ProviderModerationResult {
  const labels = labelsOutput.Labels ?? [];
  const faces = facesOutput.FaceDetails ?? [];
  const moderationLabels = profilePhotoNudityLabels(moderationOutput?.ModerationLabels ?? []);
  const humanConfidence = strongestLabelNameConfidence(labels, (name) => HUMAN_LABELS.has(name.toLowerCase()));
  const animalConfidence = strongestConfidence(labels, (name) => ANIMAL_LABEL_PATTERN.test(name));
  const minorLabelConfidence = strongestLabelNameConfidence(labels, (name) => MINOR_LABEL_PATTERN.test(name));
  const requiredHumanConfidence = config.PROFILE_PHOTO_REKOGNITION_HUMAN_CONFIDENCE ?? 90;
  const rejectedAnimalConfidence = config.PROFILE_PHOTO_REKOGNITION_ANIMAL_CONFIDENCE ?? 80;
  const consideredFaces = highConfidenceFaces(
    faces,
    config.PROFILE_PHOTO_REKOGNITION_FACE_CONFIDENCE ?? 90
  );
  const hasHuman = humanConfidence >= requiredHumanConfidence || consideredFaces.length > 0;
  const hasAnimal = animalConfidence >= rejectedAnimalConfidence;
  const childGate = childFaceLabels(faces, config, minorLabelConfidence);
  const normalizedLabels: ProviderLabel[] = [...childGate.labels, ...moderationLabels];

  if (hasHuman) {
    normalizedLabels.push({
      provider_label: "Amazon Rekognition: Person",
      normalized_label: "human_present",
      confidence: Math.max(humanConfidence, ...consideredFaces.map((face) => face.Confidence ?? 0), 0) / 100,
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

  const recommendedAction = childGate.outcome === "minor" || hasAnimal || !hasHuman || moderationLabels.length > 0
    ? "remove"
    : "keep";

  return {
    provider: "aws_rekognition",
    provider_request_id: [labelsOutput.$metadata?.requestId, facesOutput.$metadata?.requestId, moderationOutput?.$metadata?.requestId]
      .filter(Boolean)
      .join(":") || `rekognition-${Date.now().toString(36)}`,
    labels: normalizedLabels,
    latency_ms: 0,
    status: "complete",
    recommended_action: recommendedAction,
    raw_result: {
      human_confidence: humanConfidence,
      animal_confidence: animalConfidence,
      minor_label_confidence: minorLabelConfidence,
      moderation_label_count: moderationOutput?.ModerationLabels?.length ?? 0,
      face_count: faces.length,
      considered_faces: safeFaceSummary(consideredFaces),
      required_human_confidence: requiredHumanConfidence,
      rejected_animal_confidence: rejectedAnimalConfidence,
      required_face_confidence: config.PROFILE_PHOTO_REKOGNITION_FACE_CONFIDENCE ?? 90,
      minimum_age: config.PROFILE_PHOTO_REKOGNITION_MINIMUM_AGE ?? 18,
      outcome: childGate.outcome === "minor"
        ? "minor_face_detected"
        : childGate.outcome === "ambiguous"
          ? "minor_age_ambiguous"
          : moderationLabels.length > 0
            ? "nudity_detected"
          : hasAnimal
            ? "animal_detected"
            : hasHuman ? "human_detected" : "human_not_detected"
    }
  };
}

async function rekognitionJpeg(imageBytes: Buffer) {
  return sharp(imageBytes, {
    animated: false,
    failOn: "error",
    limitInputPixels: 40_000_000
  }).jpeg({ quality: 90, mozjpeg: true }).toBuffer();
}

function detectorError(startedAt: number, error: unknown): ProviderModerationResult {
  return {
    provider: "aws_rekognition",
    provider_request_id: `rekognition-error-${Date.now().toString(36)}`,
    labels: [],
    latency_ms: Date.now() - startedAt,
    status: "error",
    raw_result: {
      error_name: error instanceof Error ? error.name : "UnknownError"
    },
    error: error instanceof Error ? error.message : "Image age-safety detection failed."
  };
}

type DetectorConfig = RekognitionSafetyConfig & Pick<
  AppConfig,
  | "PROFILE_PHOTO_REKOGNITION_ENABLED"
  | "PROFILE_PHOTO_REKOGNITION_REGION"
  | "PROFILE_PHOTO_REKOGNITION_TIMEOUT_MS"
>;

export async function detectImageChildFaces(
  config: DetectorConfig,
  imageBytes: Buffer,
  client?: RekognitionImageClient
): Promise<ProviderModerationResult> {
  if (!config.PROFILE_PHOTO_REKOGNITION_ENABLED) {
    return {
      provider: "aws_rekognition",
      provider_request_id: "rekognition-disabled",
      labels: [],
      latency_ms: 0,
      status: "error",
      error: "Image age-safety detection is disabled."
    };
  }

  const startedAt = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.PROFILE_PHOTO_REKOGNITION_TIMEOUT_MS ?? 5000);

  try {
    const rekognition = client ?? new RekognitionClient({
      region: config.PROFILE_PHOTO_REKOGNITION_REGION ?? "us-east-1"
    });
    const compatibleImageBytes = await rekognitionJpeg(imageBytes);
    const output = await rekognition.send(new DetectFacesCommand({
      Image: { Bytes: compatibleImageBytes },
      Attributes: ["ALL"]
    }), { abortSignal: controller.signal }) as DetectFacesCommandOutput;
    const result = classifyImageChildFaces(output, config);

    return { ...result, latency_ms: Date.now() - startedAt };
  } catch (error) {
    return detectorError(startedAt, error);
  } finally {
    clearTimeout(timeout);
  }
}

export async function detectProfilePhotoHuman(
  config: DetectorConfig,
  imageBytes: Buffer,
  client?: RekognitionImageClient
): Promise<ProviderModerationResult> {
  if (!config.PROFILE_PHOTO_REKOGNITION_ENABLED) {
    return {
      provider: "aws_rekognition",
      provider_request_id: "rekognition-disabled",
      labels: [],
      latency_ms: 0,
      status: "error",
      error: "Profile-photo safety detection is disabled."
    };
  }

  const startedAt = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.PROFILE_PHOTO_REKOGNITION_TIMEOUT_MS ?? 5000);

  try {
    const rekognition = client ?? new RekognitionClient({
      region: config.PROFILE_PHOTO_REKOGNITION_REGION ?? "us-east-1"
    });
    const compatibleImageBytes = await rekognitionJpeg(imageBytes);
    const [labelsOutput, facesOutput, moderationOutput] = await Promise.all([
      rekognition.send(new DetectLabelsCommand({
        Image: { Bytes: compatibleImageBytes },
        Features: ["GENERAL_LABELS"],
        MinConfidence: REKOGNITION_REQUEST_MIN_CONFIDENCE,
        MaxLabels: 100
      }), { abortSignal: controller.signal }) as Promise<DetectLabelsCommandOutput>,
      rekognition.send(new DetectFacesCommand({
        Image: { Bytes: compatibleImageBytes },
        Attributes: ["ALL"]
      }), { abortSignal: controller.signal }) as Promise<DetectFacesCommandOutput>,
      rekognition.send(new DetectModerationLabelsCommand({
        Image: { Bytes: compatibleImageBytes },
        MinConfidence: REKOGNITION_MODERATION_MIN_CONFIDENCE
      }), { abortSignal: controller.signal }) as Promise<DetectModerationLabelsCommandOutput>
    ]);
    const result = classifyProfilePhotoSafety(labelsOutput, facesOutput, moderationOutput, config);

    return { ...result, latency_ms: Date.now() - startedAt };
  } catch (error) {
    return detectorError(startedAt, error);
  } finally {
    clearTimeout(timeout);
  }
}

export function mergeProfilePhotoSafetyResults(
  streamResult: ProviderModerationResult,
  safetyResult: ProviderModerationResult
): ProviderModerationResult {
  const safetyFailed = safetyResult.status?.toLowerCase() !== "complete" || Boolean(safetyResult.error);
  const safetyRejected = safetyResult.recommended_action?.toLowerCase() !== "keep";

  return {
    ...streamResult,
    provider: `${streamResult.provider}+${safetyResult.provider}`,
    provider_request_id: `${streamResult.provider_request_id}:${safetyResult.provider_request_id}`,
    labels: [...streamResult.labels, ...safetyResult.labels],
    latency_ms: streamResult.latency_ms + safetyResult.latency_ms,
    status: safetyFailed ? "error" : streamResult.status,
    recommended_action: safetyRejected ? safetyResult.recommended_action ?? "remove" : streamResult.recommended_action,
    raw_result: {
      stream: streamResult.raw_result ?? {},
      rekognition_safety: safetyResult.raw_result ?? {}
    },
    ...(safetyFailed ? { error: safetyResult.error ?? "Image age-safety detection failed." } : {})
  };
}
