import {
  DetectFacesCommand,
  DetectLabelsCommand,
  DetectModerationLabelsCommand,
  DetectTextCommand,
  RekognitionClient,
  type DetectFacesCommandOutput,
  type DetectLabelsCommandOutput,
  type DetectModerationLabelsCommandOutput,
  type DetectTextCommandOutput,
  type FaceDetail,
  type Label,
  type ModerationLabel
} from "@aws-sdk/client-rekognition";
import sharp from "sharp";
import type { AppConfig } from "./config.js";
import type {
  NormalizedModerationLabel,
  ProviderLabel,
  ProviderModerationResult
} from "./moderation-types.js";

type RekognitionSendOptions = { abortSignal?: AbortSignal };
type RekognitionImageClient = {
  send(command: DetectFacesCommand, options?: RekognitionSendOptions): Promise<DetectFacesCommandOutput>;
  send(command: DetectLabelsCommand, options?: RekognitionSendOptions): Promise<DetectLabelsCommandOutput>;
  send(command: DetectModerationLabelsCommand, options?: RekognitionSendOptions): Promise<DetectModerationLabelsCommandOutput>;
  send(command: DetectTextCommand, options?: RekognitionSendOptions): Promise<DetectTextCommandOutput>;
};
type RekognitionSafetyConfig = Pick<
  AppConfig,
  | "PROFILE_PHOTO_REKOGNITION_HUMAN_CONFIDENCE"
  | "PROFILE_PHOTO_REKOGNITION_ANIMAL_CONFIDENCE"
  | "PROFILE_PHOTO_REKOGNITION_FACE_CONFIDENCE"
  | "PROFILE_PHOTO_REKOGNITION_MINIMUM_AGE"
>;

// Nobody is required to show their face. A torso, a back, a hand, or any other
// body part counts as a human photo, on every surface.
const HUMAN_LABELS = new Set([
  "human", "people", "person",
  "body part", "abdomen", "arm", "back", "chest", "elbow", "finger", "foot",
  "hand", "head", "hip", "knee", "leg", "mouth", "neck", "shoulder", "skin",
  "stomach", "thigh", "torso", "wrist",
  "barefoot", "muscle", "tattoo", "undressed", "nude", "nudity", "underwear", "lingerie"
]);
const ANIMAL_LABEL_PATTERN = /\b(?:animal|amphibian|bird|canine|cat|dog|feline|fish|horse|insect|livestock|mammal|pet|primate|reptile|rodent|wildlife)s?\b/i;
const MINOR_LABEL_PATTERN = /\b(?:baby|babies|boy|boys|child|children|girl|girls|infant|infants|kid|kids|newborn|teen|teenager|toddler|youth)\b/i;
const NUDITY_MODERATION_LABEL_PATTERN = /\b(?:explicit nudity|nudity|non-explicit nudity|partial nudity|graphic (?:male|female) nudity|illustrated explicit nudity|sexual activity|sexual situations|sex toy|sex toys)\b/i;
const REKOGNITION_REQUEST_MIN_CONFIDENCE = 70;
const REKOGNITION_MODERATION_MIN_CONFIDENCE = 50;
const REKOGNITION_TEXT_MIN_CONFIDENCE = 80;
const URL_TEXT_PATTERN = /(?:https?:\/\/|www\.|\b[a-z0-9][a-z0-9-]{1,62}\.(?:com|net|org|app|io|co|me|tv|xyz)\b)/i;
// Account-level child enforcement must be reserved for faces that cannot
// plausibly be read as adult. Teen/young-adult age ranges stay ambiguous.
const UNAMBIGUOUS_CHILD_MAX_AGE = 13;
const UNAMBIGUOUS_CHILD_FACE_CONFIDENCE = 95;

function createRekognitionImageClient(region: string): RekognitionImageClient {
  return new RekognitionClient({ region }) as unknown as RekognitionImageClient;
}

function signalNames(label: Label) {
  return [
    label.Name,
    ...(label.Parents ?? []).map((parent) => parent.Name),
    ...(label.Categories ?? []).map((category) => category.Name)
  ].filter((name): name is string => typeof name === "string" && name.trim().length > 0);
}

function detectedHumanInstanceCount(labels: Label[], requiredConfidence: number) {
  return labels.reduce((count, label) => {
    const directName = label.Name?.trim().toLowerCase();
    if (directName !== "human" && directName !== "person" && directName !== "people") {
      return count;
    }

    const visibleInstances = (label.Instances ?? []).filter((instance) => (
      (instance.Confidence ?? 0) >= requiredConfidence
    ));
    return Math.max(count, visibleInstances.length);
  }, 0);
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
    (face.Confidence ?? 0) >= UNAMBIGUOUS_CHILD_FACE_CONFIDENCE &&
    typeof face.AgeRange?.High === "number" &&
    face.AgeRange.High <= Math.min(minimumAge - 1, UNAMBIGUOUS_CHILD_MAX_AGE)
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
  const consideredFaces = highConfidenceFaces(
    faces,
    Math.max(requiredFaceConfidence, UNAMBIGUOUS_CHILD_FACE_CONFIDENCE)
  );
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
  const directHumanConfidence = strongestLabelNameConfidence(labels, (name) => HUMAN_LABELS.has(name.toLowerCase()));
  const humanConfidence = strongestConfidence(labels, (name) => HUMAN_LABELS.has(name.toLowerCase()));
  const animalConfidence = strongestConfidence(labels, (name) => ANIMAL_LABEL_PATTERN.test(name));
  const minorLabelConfidence = strongestLabelNameConfidence(labels, (name) => MINOR_LABEL_PATTERN.test(name));
  const requiredHumanConfidence = config.PROFILE_PHOTO_REKOGNITION_HUMAN_CONFIDENCE ?? 90;
  const rejectedAnimalConfidence = config.PROFILE_PHOTO_REKOGNITION_ANIMAL_CONFIDENCE ?? 80;
  const consideredFaces = highConfidenceFaces(
    faces,
    config.PROFILE_PHOTO_REKOGNITION_FACE_CONFIDENCE ?? 90
  );
  const hierarchyOnlyHuman = directHumanConfidence < requiredHumanConfidence && consideredFaces.length === 0;
  const hasHuman = (humanConfidence >= requiredHumanConfidence || consideredFaces.length > 0) &&
    !(hierarchyOnlyHuman && minorLabelConfidence >= 90);
  const hasAnimal = animalConfidence >= rejectedAnimalConfidence;
  const detectedHumanInstances = detectedHumanInstanceCount(labels, requiredHumanConfidence);
  const hasMultiplePeople = consideredFaces.length > 1 || detectedHumanInstances > 1;
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

  // Emit the animal signal on its own so surfaces that allow non-human photos
  // can still refuse animals.
  if (hasAnimal) {
    normalizedLabels.push({
      provider_label: "Amazon Rekognition: Animal",
      normalized_label: "animal",
      confidence: animalConfidence / 100,
      severity: "high"
    });
  }

  // A group is its own finding. It is fine in a private message and only barred
  // where faces go public, so it must not be reported as "not a person".
  if (hasMultiplePeople) {
    normalizedLabels.push({
      provider_label: "Amazon Rekognition: Multiple people",
      normalized_label: "multiple_people",
      confidence: 0.99,
      severity: "medium"
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

  const hasHighConfidenceMinorLabel = minorLabelConfidence >= 90;
  const recommendedAction = childGate.outcome === "minor" ||
    (hasHighConfidenceMinorLabel && !hasHuman) ||
    hasAnimal ||
    hasMultiplePeople
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
      detected_human_instances: detectedHumanInstances,
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
            : hasMultiplePeople
              ? "multiple_people_detected"
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
    const rekognition = client ?? createRekognitionImageClient(
      config.PROFILE_PHOTO_REKOGNITION_REGION ?? "us-east-1"
    );
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
    const rekognition = client ?? createRekognitionImageClient(
      config.PROFILE_PHOTO_REKOGNITION_REGION ?? "us-east-1"
    );
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

// Rekognition's public-image taxonomy, mapped to the labels the policy mapper already
// understands. Keep ordinary shirtless, swimwear, and non-explicit nudity outside this
// list so a Stream outage does not silently tighten feed rules.
const PUBLIC_IMAGE_REJECT_RULES: Array<{
  pattern: RegExp;
  normalizedLabel: NormalizedModerationLabel;
  severity: ProviderLabel["severity"];
}> = [
  { pattern: /\bsexual activity\b/i, normalizedLabel: "adult_explicit", severity: "high" },
  { pattern: /\bsex toys?\b/i, normalizedLabel: "adult_explicit", severity: "high" },
  { pattern: /(?<!non[- ])\bexplicit nudity\b/i, normalizedLabel: "adult_nudity", severity: "high" },
  { pattern: /\bgraphic violence\b/i, normalizedLabel: "gore", severity: "high" },
  { pattern: /\bself[- ]harm\b/i, normalizedLabel: "gore", severity: "high" },
  { pattern: /\b(?:corpses|emaciated bodies)\b/i, normalizedLabel: "gore", severity: "high" },
  { pattern: /\bvisually disturbing\b/i, normalizedLabel: "gore", severity: "high" },
  { pattern: /\b(?:weapon violence|physical violence)\b/i, normalizedLabel: "threat", severity: "high" },
  { pattern: /\b(?:hate symbols?|nazi party|white supremacy|extremist)\b/i, normalizedLabel: "hate_symbol", severity: "high" }
];

function publicImageModerationLabels(labels: ModerationLabel[]): ProviderLabel[] {
  return labels.flatMap((label) => {
    const signals = moderationSignalNames(label);
    const joinedSignals = signals.join(" > ");
    const rule = PUBLIC_IMAGE_REJECT_RULES.find(({ pattern }) =>
      signals.some((signal) => pattern.test(signal))
    );

    if (!rule) {
      return [];
    }

    return [{
      provider_label: `Amazon Rekognition moderation: ${joinedSignals}`,
      normalized_label: rule.normalizedLabel,
      confidence: Math.max(Math.min((label.Confidence ?? 0) / 100, 0.99), 0.9),
      severity: rule.severity
    }];
  });
}

function publicImageTextLabels(
  output: Pick<DetectTextCommandOutput, "TextDetections"> | null
): ProviderLabel[] {
  const lines = (output?.TextDetections ?? []).filter((detection) => (
    detection.Type === "LINE" &&
    typeof detection.DetectedText === "string" &&
    detection.DetectedText.trim().length > 0 &&
    (detection.Confidence ?? 0) >= REKOGNITION_TEXT_MIN_CONFIDENCE
  ));

  if (lines.length === 0) {
    return [];
  }

  const hasUrl = lines.some((line) => URL_TEXT_PATTERN.test(line.DetectedText ?? ""));
  const strongestConfidence = Math.max(...lines.map((line) => line.Confidence ?? 0)) / 100;

  return [{
    provider_label: hasUrl
      ? "Amazon Rekognition: URL on image"
      : "Amazon Rekognition: Text on image",
    normalized_label: hasUrl ? "url_on_image" : "text_on_image",
    confidence: Math.min(strongestConfidence, 0.99),
    severity: "high"
  }];
}

export function classifyPublicImageSafety(
  moderationOutput: Pick<DetectModerationLabelsCommandOutput, "ModerationLabels" | "$metadata"> | null,
  facesOutput: Pick<DetectFacesCommandOutput, "FaceDetails" | "$metadata">,
  config: RekognitionSafetyConfig,
  textOutput: Pick<DetectTextCommandOutput, "TextDetections" | "$metadata"> | null = null,
  labelsOutput: Pick<DetectLabelsCommandOutput, "Labels" | "$metadata"> | null = null
): ProviderModerationResult {
  const faces = facesOutput.FaceDetails ?? [];
  const consideredFaces = highConfidenceFaces(
    faces,
    config.PROFILE_PHOTO_REKOGNITION_FACE_CONFIDENCE ?? 90
  );
  const detectedHumanInstances = detectedHumanInstanceCount(
    labelsOutput?.Labels ?? [],
    config.PROFILE_PHOTO_REKOGNITION_HUMAN_CONFIDENCE ?? 90
  );
  const hasMultiplePeople = consideredFaces.length > 1 || detectedHumanInstances > 1;
  const detectedModerationLabels = moderationOutput?.ModerationLabels ?? [];
  const rejectLabels = publicImageModerationLabels(detectedModerationLabels);
  const textLabels = publicImageTextLabels(textOutput);
  const childGate = childFaceLabels(faces, config);
  const subjectLabels: ProviderLabel[] = hasMultiplePeople ? [{
    provider_label: "Amazon Rekognition: Multiple people",
    normalized_label: "multiple_people",
    confidence: 0.99,
    severity: "medium"
  }] : [];

  return {
    provider: "aws_rekognition",
    provider_request_id: [moderationOutput?.$metadata?.requestId, facesOutput.$metadata?.requestId, textOutput?.$metadata?.requestId, labelsOutput?.$metadata?.requestId]
      .filter(Boolean)
      .join(":") || `rekognition-public-image-${Date.now().toString(36)}`,
    labels: [...childGate.labels, ...rejectLabels, ...textLabels, ...subjectLabels],
    latency_ms: 0,
    status: "complete",
    recommended_action: childGate.outcome === "minor" || rejectLabels.length > 0 || textLabels.length > 0 || hasMultiplePeople
      ? "remove"
      : "keep",
    raw_result: {
      child_face_outcome: childGate.outcome,
      face_count: faces.length,
      considered_faces: safeFaceSummary(consideredFaces),
      detected_human_instances: detectedHumanInstances,
      minimum_age: config.PROFILE_PHOTO_REKOGNITION_MINIMUM_AGE ?? 18,
      moderation_label_count: detectedModerationLabels.length,
      moderation_labels: detectedModerationLabels.map((label) => ({
        name: label.Name ?? null,
        parent: label.ParentName ?? null,
        confidence: label.Confidence ?? null
      })),
      detected_text_line_count: textOutput?.TextDetections?.filter((detection) => detection.Type === "LINE").length ?? 0,
      rejected_label_count: rejectLabels.length + textLabels.length
    }
  };
}

// A feed image may be a landscape, flyer, or object. It needs public-content safety, not
// the profile-photo adult-human identity gate.
export async function detectPublicImageSafety(
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
      error: "Public-image safety detection is disabled."
    };
  }

  const startedAt = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.PROFILE_PHOTO_REKOGNITION_TIMEOUT_MS ?? 5000);

  try {
    const rekognition = client ?? createRekognitionImageClient(
      config.PROFILE_PHOTO_REKOGNITION_REGION ?? "us-east-1"
    );
    const compatibleImageBytes = await rekognitionJpeg(imageBytes);
    const [moderationOutput, facesOutput, textOutput, labelsOutput] = await Promise.all([
      rekognition.send(new DetectModerationLabelsCommand({
        Image: { Bytes: compatibleImageBytes },
        MinConfidence: REKOGNITION_MODERATION_MIN_CONFIDENCE
      }), { abortSignal: controller.signal }) as Promise<DetectModerationLabelsCommandOutput>,
      rekognition.send(new DetectFacesCommand({
        Image: { Bytes: compatibleImageBytes },
        Attributes: ["ALL"]
      }), { abortSignal: controller.signal }) as Promise<DetectFacesCommandOutput>,
      rekognition.send(new DetectTextCommand({
        Image: { Bytes: compatibleImageBytes }
      }), { abortSignal: controller.signal }) as Promise<DetectTextCommandOutput>,
      rekognition.send(new DetectLabelsCommand({
        Image: { Bytes: compatibleImageBytes },
        Features: ["GENERAL_LABELS"],
        MinConfidence: REKOGNITION_REQUEST_MIN_CONFIDENCE,
        MaxLabels: 100
      }), { abortSignal: controller.signal }) as Promise<DetectLabelsCommandOutput>
    ]);
    const result = classifyPublicImageSafety(moderationOutput, facesOutput, config, textOutput, labelsOutput);

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
  const safetyRejected = !safetyFailed && safetyResult.recommended_action?.toLowerCase() !== "keep";
  const streamCompletedSafely = streamResult.provider === "stream" &&
    !streamResult.error &&
    ["complete", "completed"].includes(streamResult.status?.toLowerCase() ?? "") &&
    streamResult.recommended_action?.toLowerCase() === "keep";
  const noHealthyProvider = safetyFailed && !streamCompletedSafely;

  return {
    ...streamResult,
    provider: `${streamResult.provider}+${safetyResult.provider}`,
    provider_request_id: `${streamResult.provider_request_id}:${safetyResult.provider_request_id}`,
    labels: [...streamResult.labels, ...safetyResult.labels],
    latency_ms: streamResult.latency_ms + safetyResult.latency_ms,
    status: noHealthyProvider ? "error" : streamResult.status,
    recommended_action: safetyRejected ? safetyResult.recommended_action ?? "remove" : streamResult.recommended_action,
    raw_result: {
      stream: streamResult.raw_result ?? {},
      stream_provider: streamResult.provider,
      stream_status: streamResult.status ?? null,
      stream_error: streamResult.error ?? null,
      stream_provider_request_id: streamResult.provider_request_id,
      rekognition_provider: safetyResult.provider,
      rekognition_status: safetyResult.status ?? null,
      rekognition_error: safetyResult.error ?? null,
      rekognition_provider_request_id: safetyResult.provider_request_id,
      rekognition_safety: safetyResult.raw_result ?? {}
    },
    ...(noHealthyProvider ? { error: safetyResult.error ?? "Image age-safety detection failed." } : {})
  };
}
