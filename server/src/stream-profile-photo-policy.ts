import type { AIImageConfig, StreamClient, UpsertConfigRequest } from "@stream-io/node-sdk";

type StreamModerationClient = Pick<StreamClient, "moderation">;
type StreamImageActiveRule = NonNullable<AIImageConfig["rules"]>[number];
type StreamImageRule = {
  label: string;
  action?: string;
  min_confidence?: number;
};
type StreamImagePolicyConfig = {
  enabled?: boolean;
  async?: boolean;
  rules?: StreamImageRule[];
};

export type StreamPolicyDrift = {
  label: string;
  expected: string;
  actual: string;
};

export const STREAM_PROFILE_PHOTO_IMAGE_RULES: StreamImageActiveRule[] = [
  { label: "Violence", action: "remove", min_confidence: 85 },
  { label: "Visually Disturbing", action: "remove", min_confidence: 80 },
  { label: "Hate Symbols", action: "remove", min_confidence: 70 }
];

export const STREAM_PROFILE_PHOTO_IMAGE_POLICY: AIImageConfig = {
  enabled: true,
  async: false,
  rules: STREAM_PROFILE_PHOTO_IMAGE_RULES
};

const ALLOWED_ACTIVE_IMAGE_LABELS = new Set(
  STREAM_PROFILE_PHOTO_IMAGE_RULES.map((rule) => rule.label)
);

function normalizeStreamAction(action: unknown) {
  if (typeof action !== "string") {
    return "";
  }

  const normalized = action.toLowerCase().replace(/[\s-]+/g, "_").trim();
  return normalized === "none" ? "no_action" : normalized;
}

function actionDescription(rule: Pick<StreamImageRule, "action" | "min_confidence"> | undefined) {
  if (!rule) {
    return "missing";
  }

  const threshold = typeof rule.min_confidence === "number"
    ? ` at ${rule.min_confidence}%`
    : "";
  return `${normalizeStreamAction(rule.action)}${threshold}`;
}

export function findStreamProfilePhotoPolicyDrift(
  imageConfig: StreamImagePolicyConfig | null | undefined
) {
  const drift: StreamPolicyDrift[] = [];

  if (!imageConfig?.enabled) {
    drift.push({
      label: "AI Images",
      expected: "enabled",
      actual: imageConfig ? "disabled" : "missing"
    });
  }

  if (imageConfig?.async !== false) {
    drift.push({
      label: "AI Images async",
      expected: "false",
      actual: String(imageConfig?.async ?? "missing")
    });
  }

  const currentRules = new Map<string, StreamImageRule>();
  for (const rule of imageConfig?.rules ?? []) {
    currentRules.set(rule.label, rule);
  }

  for (const expectedRule of STREAM_PROFILE_PHOTO_IMAGE_RULES) {
    const currentRule = currentRules.get(expectedRule.label);

    if (
      normalizeStreamAction(currentRule?.action) !== "remove" ||
      currentRule?.min_confidence !== expectedRule.min_confidence
    ) {
      drift.push({
        label: expectedRule.label,
        expected: actionDescription(expectedRule),
        actual: actionDescription(currentRule)
      });
    }
  }

  for (const rule of imageConfig?.rules ?? []) {
    const action = normalizeStreamAction(rule.action);

    if (
      action &&
      action !== "no_action" &&
      !ALLOWED_ACTIVE_IMAGE_LABELS.has(rule.label)
    ) {
      drift.push({
        label: rule.label,
        expected: "no_action or absent",
        actual: actionDescription(rule)
      });
    }
  }

  return drift;
}

export async function checkStreamProfilePhotoPolicy(
  client: StreamModerationClient,
  configKey: string
) {
  const currentResponse = await client.moderation.getConfig({ key: configKey });
  const current = currentResponse.config;

  if (!current) {
    throw new Error(`Stream moderation config '${configKey}' was not found.`);
  }

  const drift = findStreamProfilePhotoPolicyDrift(current.ai_image_config);

  if (drift.length > 0) {
    const details = drift
      .map((item) => `${item.label}: expected ${item.expected}, got ${item.actual}`)
      .join("; ");

    throw new Error(`Stream moderation config '${configKey}' image policy drifted. ${details}`);
  }

  return current;
}

export async function configureStreamProfilePhotoPolicy(
  client: StreamModerationClient,
  configKey: string
) {
  const currentResponse = await client.moderation.getConfig({ key: configKey });
  const current = currentResponse.config;

  if (!current) {
    throw new Error(`Stream moderation config '${configKey}' was not found.`);
  }

  const legacyEngines = current as typeof current & Partial<Pick<
    UpsertConfigRequest,
    | "aws_rekognition_config"
    | "bodyguard_config"
    | "google_vision_config"
    | "rule_builder_config"
  >>;

  const response = await client.moderation.upsertConfig({
    key: configKey,
    team: current.team,
    async: false,
    ai_image_config: STREAM_PROFILE_PHOTO_IMAGE_POLICY,
    ai_text_config: current.ai_text_config,
    ai_video_config: current.ai_video_config,
    automod_platform_circumvention_config: current.automod_platform_circumvention_config,
    automod_semantic_filters_config: current.automod_semantic_filters_config,
    automod_toxicity_config: current.automod_toxicity_config,
    aws_rekognition_config: legacyEngines.aws_rekognition_config,
    block_list_config: current.block_list_config,
    bodyguard_config: legacyEngines.bodyguard_config,
    google_vision_config: legacyEngines.google_vision_config,
    llm_config: current.llm_config,
    rule_builder_config: legacyEngines.rule_builder_config,
    velocity_filter_config: current.velocity_filter_config,
    video_call_rule_config: current.video_call_rule_config
  });

  if (!response.config) {
    throw new Error(`Stream did not return the updated moderation config '${configKey}'.`);
  }

  return response.config;
}
