import type { AIImageConfig, StreamClient, UpsertConfigRequest } from "@stream-io/node-sdk";

type StreamModerationClient = Pick<StreamClient, "moderation">;

export const STREAM_PROFILE_PHOTO_IMAGE_POLICY: AIImageConfig = {
  enabled: true,
  async: false,
  rules: [
    { label: "Violence", action: "remove", min_confidence: 85 },
    { label: "Visually Disturbing", action: "remove", min_confidence: 80 },
    { label: "Hate Symbols", action: "remove", min_confidence: 70 }
  ]
};

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
