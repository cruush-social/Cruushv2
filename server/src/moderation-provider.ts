import { createHmac } from "node:crypto";
import type { AppConfig } from "./config.js";
import { StreamClient } from "@stream-io/node-sdk";
import type {
  ModerationContentType,
  ModerationSurface,
  NormalizedModerationLabel,
  ProviderLabel,
  ProviderModerationResult
} from "./moderation-types.js";

export type TextModerationInput = {
  userId: string;
  surface: ModerationSurface;
  text: string;
  contentId?: string;
};

export type ImageModerationInput = {
  userId: string;
  surface: ModerationSurface;
  mimeType: string;
  filename?: string;
  imageUrl?: string;
  contentId?: string;
  bytes: Buffer;
};

export type ModerationProvider = {
  name: string;
  version: string;
  moderateText(input: TextModerationInput): Promise<ProviderModerationResult>;
  moderateImage(input: ImageModerationInput): Promise<ProviderModerationResult>;
};

type TextRule = {
  providerLabel: string;
  normalizedLabel: NormalizedModerationLabel;
  confidence: number;
  severity: ProviderLabel["severity"];
  patterns: RegExp[];
  surfaces?: ModerationSurface[];
  skip?: (text: string) => boolean;
};

const publicProfileSurfaces: ModerationSurface[] = ["feed", "profile"];

function normalizeModerationText(text: string) {
  return text
    .normalize("NFKC")
    .replace(/\ufe0f/g, "")
    .toLowerCase()
    .replace(/[._-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function publicSurfacePattern(pattern: RegExp) {
  return pattern;
}

const textRules: TextRule[] = [
  {
    providerLabel: "public_coded_drug_language",
    normalizedLabel: "pnp_discussion",
    confidence: 0.94,
    severity: "high",
    surfaces: publicProfileSurfaces,
    patterns: [
      publicSurfacePattern(/\b(?:tina|snow|ski|skiing|skii|skiiing|spun|point|pointing|party|pnp|chem|chemsex|ice|crystal)\b/i),
      publicSurfacePattern(/\bparty\s+(?:and|n)\s+play\b/i),
      /(?:💨|🎉|🥳|💊|🎈|🌀|🧊|⛷|❄|🧪|⚗|🔬|🥄|💉|🚬)/u,
      /(?:🍬|🍭|🍄).{0,48}\b(?:pnp|party\s*(?:and|&|n)\s*play|chem|chemsex|tina|meth|molly|mdma|ketamine|ice|crystal)\b/iu,
      /\b(?:pnp|party\s*(?:and|&|n)\s*play|chem|chemsex|tina|meth|molly|mdma|ketamine|ice|crystal)\b.{0,48}(?:🍬|🍭|🍄)/iu
    ]
  },
  {
    providerLabel: "public_coded_commercial_sex_language",
    normalizedLabel: "commercial_sex",
    confidence: 0.9,
    severity: "high",
    surfaces: publicProfileSurfaces,
    patterns: [
      /\b(?:gen|generous|roses?)\b/i,
      /(?:🎁|🌹)/u,
      /(?:💸|💰|💵|🤑|💳|🧾).{0,48}\b(?:meet|session|hour|hh|hookup|sex|menu|rates?|donation|tribute)\b/iu,
      /\b(?:meet|session|hour|hh|hookup|sex|menu|rates?|donation|tribute)\b.{0,48}(?:💸|💰|💵|🤑|💳|🧾)/iu,
      /\b(?:donation|tribute|rates?|menu|cashapp|venmo|zelle|paypal)\b.{0,48}\b(?:meet|session|hour|hh|hookup|sex)\b/i,
      /\b(?:meet|session|hour|hh|hookup|sex)\b.{0,48}\b(?:donation|tribute|rates?|menu|cashapp|venmo|zelle|paypal)\b/i
    ]
  },
  {
    providerLabel: "public_coded_underage_language",
    normalizedLabel: "underage_sexual",
    confidence: 0.98,
    severity: "critical",
    surfaces: publicProfileSurfaces,
    patterns: [
      /\b(?:underage|pedo)\b/i,
      /🏈/,
      /(?:👶|🍼|🧒|🎒|🧸).{0,80}\b(?:sex|nudes?|hook ?up|explicit|porn|meet)\b/iu,
      /\b(?:sex|nudes?|hook ?up|explicit|porn|meet)\b.{0,80}(?:👶|🍼|🧒|🎒|🧸)/iu,
      /\b(?:minor|minors|teen|teens|barely legal)\b.{0,80}\b(?:sex|nudes?|hook ?up|explicit|porn|meet)\b/i,
      /\b(?:sex|nudes?|hook ?up|explicit|porn|meet)\b.{0,80}\b(?:minor|minors|teen|teens|barely legal)\b/i,
      /\b(?:1[0-7])\s?(?:yo|y\/o|years? old)?\b.{0,80}\b(?:sex|nudes?|hook ?up|explicit|porn|meet)\b/i
    ]
  },
  {
    providerLabel: "public_coded_bestiality_language",
    normalizedLabel: "bestiality",
    confidence: 0.98,
    severity: "critical",
    surfaces: publicProfileSurfaces,
    patterns: [
      /\b(?:knot|knotting|k\s*9|taboo|zoophilia|zoophile|bestiality|beastiality|canine)\b/i,
      /(?:🐾|🦴|🐶).{0,48}\b(?:k\s*9|knot|knotting|taboo|zoophile|zoophilia|bestiality|beastiality|animal sex|sex with animals?)\b/iu,
      /\b(?:k\s*9|knot|knotting|taboo|zoophile|zoophilia|bestiality|beastiality|animal sex|sex with animals?)\b.{0,48}(?:🐾|🦴|🐶)/iu,
      /(?:🪢|🐕)/u
    ]
  },
  {
    providerLabel: "drug_sale_or_menu",
    normalizedLabel: "drug_sales",
    confidence: 0.97,
    severity: "critical",
    patterns: [
      /\b(?:drug|party|chem|meth|coke|cocaine|fent|xanax|ghb|molly|mdma|ketamine|k|ice)\s+(?:menu|menus|delivery|deliver|sale|sales|plug|dealer|available)\b/i,
      /\b(?:selling|sell|ship|shipping|deliver|delivery|pickup|plug)\b.{0,48}\b(?:meth|coke|cocaine|fent|xanax|ghb|molly|mdma|ketamine|ice)\b/i
    ]
  },
  {
    providerLabel: "commercial_sex_solicitation",
    normalizedLabel: "commercial_sex",
    confidence: 0.93,
    severity: "high",
    patterns: [
      /\b(?:escort|incall|outcall|full service|gfe|pse)\b/i,
      /\b(?:cashapp|venmo|paypal|zelle|rates?|donation|roses?)\b.{0,48}\b(?:sex|hookup|meet|session|hour|hh)\b/i,
      /\$\s?\d{2,5}.{0,36}\b(?:hour|hh|session|meet|hookup|sex)\b/i
    ],
    skip: (text) => /\b(?:sex worker|sex work|sw'er|swer)\b/i.test(text) && !/\b(?:rate|rates|incall|outcall|\$\s?\d+)/i.test(text)
  },
  {
    providerLabel: "underage_sexual_content",
    normalizedLabel: "underage_sexual",
    confidence: 0.98,
    severity: "critical",
    patterns: [
      /\b(?:underage|minors?|children|kids?|child|teen(?:ager)?|1[0-7]\s?(?:yo|y\/o|years? old)?)\b.{0,80}\b(?:sex|nudes?|hook ?up|explicit|porn|meet)\b/i,
      /\b(?:sex|nudes?|hook ?up|explicit|porn)\b.{0,80}\b(?:underage|minors?|children|kids?|child|1[0-7]\s?(?:yo|y\/o|years? old)?)\b/i
    ]
  },
  {
    providerLabel: "bestiality",
    normalizedLabel: "bestiality",
    confidence: 0.98,
    severity: "critical",
    patterns: [/\b(?:bestiality|zoophilia|animal sex|sex with animals?)\b/i]
  },
  {
    providerLabel: "revenge_porn",
    normalizedLabel: "revenge_porn",
    confidence: 0.97,
    severity: "critical",
    patterns: [
      /\b(?:revenge porn|leak(?:ed|ing)? nudes?|share(?:d|ing)? (?:their|his|her) nudes?|post(?:ed|ing)? (?:their|his|her) nudes?)\b/i
    ]
  },
  {
    providerLabel: "credible_threat",
    normalizedLabel: "threat",
    confidence: 0.94,
    severity: "critical",
    patterns: [
      /\b(?:i will|i'm going to|im going to|gonna)\s+(?:kill|hurt|stab|shoot|beat)\s+(?:you|them|him|her)\b/i,
      /\b(?:kill you|hurt you|stab you|shoot you|beat you)\b/i,
      /(?:🔫|🔪|🗡|💣).{0,40}\b(?:kill|hurt|stab|shoot|beat)\b/iu,
      /\b(?:kill|hurt|stab|shoot|beat)\b.{0,40}(?:🔫|🔪|🗡|💣)/iu
    ]
  },
  {
    providerLabel: "location_privacy",
    normalizedLabel: "location_privacy",
    confidence: 0.91,
    severity: "high",
    patterns: [
      /\b(?:their|his|her|your)\s+(?:map pin|location|home address|address)\b.{0,80}\b(?:post|share|leak|doxx|drop|send)\b/i,
      /\b(?:doxx|dox|drop)\b.{0,40}\b(?:address|location|map pin|phone number)\b/i
    ]
  },
  {
    providerLabel: "doxxing",
    normalizedLabel: "doxxing",
    confidence: 0.9,
    severity: "high",
    patterns: [
      /\b(?:address|phone number|workplace|where they live)\b.{0,60}\b(?:post|share|leak|doxx|drop)\b/i
    ]
  },
  {
    providerLabel: "hate_speech",
    normalizedLabel: "hate_speech",
    confidence: 0.91,
    severity: "high",
    patterns: [
      /\b(?:hate speech|hate group|supremacist)\b/i,
      /\b(?:kill all|wipe out)\b.{0,40}\b(?:queer|trans|gay|lesbian|people)\b/i
    ]
  },
  {
    providerLabel: "harassment",
    normalizedLabel: "harassment",
    confidence: 0.88,
    severity: "medium",
    patterns: [
      /\b(?:harass|stalk|keep messaging after block|won't stop messaging|would not stop messaging)\b/i,
      /\b(?:worthless|kill yourself|kys)\b/i
    ]
  },
  {
    providerLabel: "public_pnp_discussion",
    normalizedLabel: "pnp_discussion",
    confidence: 0.9,
    severity: "medium",
    patterns: [/\b(?:pnp|party\s*(?:and|&)\s*play|party n play|chemsex)\b/i]
  },
  {
    providerLabel: "adult_explicit",
    normalizedLabel: "adult_explicit",
    confidence: 0.89,
    severity: "low",
    patterns: [/\b(?:adult explicit|explicit adult|porn|nudes?|naked|xxx)\b/i]
  },
  {
    providerLabel: "spam_or_scam",
    normalizedLabel: "spam",
    confidence: 0.86,
    severity: "medium",
    patterns: [
      /(?:📈|📉|💹|🪙|₿|🎰).{0,80}\b(?:profit|investment|double|guaranteed|telegram|cash|crypto|forex)\b/iu,
      /\b(?:profit|investment|double|guaranteed|telegram|cash|crypto|forex)\b.{0,80}(?:📈|📉|💹|🪙|₿|🎰)/iu,
      /\b(?:crypto|forex|investment)\b.{0,80}\b(?:guaranteed|profit|double your money)\b/i,
      /\b(?:click this link|free money|giveaway)\b/i
    ]
  }
];

function normalizeConfidence(confidence: number) {
  return Math.max(0, Math.min(1, confidence));
}

function makeResult(
  contentType: ModerationContentType,
  startedAt: number,
  labels: ProviderLabel[]
): ProviderModerationResult {
  return {
    provider: "mock",
    provider_request_id: `mock-${contentType}-${Date.now().toString(36)}`,
    labels,
    latency_ms: Date.now() - startedAt
  };
}

function stringsFromUnknown(value: unknown): string[] {
  if (typeof value === "string") {
    return [value];
  }

  if (Array.isArray(value)) {
    return value.flatMap(stringsFromUnknown);
  }

  if (value && typeof value === "object") {
    return Object.values(value).flatMap(stringsFromUnknown);
  }

  return [];
}

function labelsFromFilename(filename: string | undefined): ProviderLabel[] {
  const normalized = filename?.toLowerCase() ?? "";
  const mappings: Array<[string, NormalizedModerationLabel, ProviderLabel["severity"], number]> = [
    ["adult-human", "adult_human_body", "low", 0.95],
    ["human-body", "adult_human_body", "low", 0.95],
    ["adult-body", "adult_human_body", "low", 0.95],
    ["body-part", "adult_human_body", "low", 0.95],
    ["arms", "adult_human_body", "low", 0.95],
    ["hands", "adult_human_body", "low", 0.95],
    ["legs", "adult_human_body", "low", 0.95],
    ["limbs", "adult_human_body", "low", 0.95],
    ["profile-crop", "adult_human_body", "low", 0.95],
    ["group-photo", "profile_photo_not_adult_human", "high", 0.96],
    ["multiple-people", "profile_photo_not_adult_human", "high", 0.96],
    ["animal", "animal", "high", 0.96],
    ["pet", "animal", "high", 0.96],
    ["screenshot", "screenshot_or_interface", "high", 0.96],
    ["non-human", "profile_photo_not_adult_human", "high", 0.96],
    ["no-human", "profile_photo_not_adult_human", "high", 0.96],
    ["gradient", "profile_photo_not_adult_human", "high", 0.96],
    ["csam", "underage_sexual", "critical", 0.98],
    ["bestiality", "bestiality", "critical", 0.98],
    ["revenge", "revenge_porn", "critical", 0.97],
    ["drug-sales", "drug_sales", "critical", 0.97],
    ["commercial-sex", "commercial_sex", "high", 0.93],
    ["excrement", "scat", "high", 0.95],
    ["feces", "scat", "high", 0.95],
    ["fecal", "scat", "high", 0.95],
    ["scat", "scat", "high", 0.95],
    ["gore", "gore", "high", 0.92],
    ["hate-symbol", "hate_symbol", "high", 0.91],
    ["adult-nudity", "adult_nudity", "low", 0.9],
    ["adult-explicit", "adult_explicit", "low", 0.9],
    ["nude", "adult_nudity", "low", 0.9]
  ];

  return mappings
    .filter(([needle]) => normalized.includes(needle))
    .map(([needle, label, severity, confidence]) => ({
      provider_label: `mock_filename_${needle}`,
      normalized_label: label,
      confidence,
      severity
    }));
}

export class MockModerationProvider implements ModerationProvider {
  readonly name = "mock";
  readonly version = "2026-06-12";

  async moderateText(input: TextModerationInput): Promise<ProviderModerationResult> {
    const startedAt = Date.now();
    const normalizedText = normalizeModerationText(input.text);
    const labels = textRules.flatMap((rule) => {
      if (rule.surfaces && !rule.surfaces.includes(input.surface)) {
        return [];
      }

      if (rule.skip?.(input.text)) {
        return [];
      }

      if (!rule.patterns.some((pattern) => pattern.test(input.text) || pattern.test(normalizedText))) {
        return [];
      }

      return [{
        provider_label: rule.providerLabel,
        normalized_label: rule.normalizedLabel,
        confidence: normalizeConfidence(rule.confidence),
        severity: rule.severity
      }];
    });

    return makeResult("text", startedAt, labels);
  }

  async moderateImage(input: ImageModerationInput): Promise<ProviderModerationResult> {
    const startedAt = Date.now();

    return {
      ...makeResult("image", startedAt, labelsFromFilename(input.filename)),
      status: "completed",
      recommended_action: "keep"
    };
  }
}

type StreamConfig = Pick<
  AppConfig,
  | "MODERATION_TIMEOUT_MS"
  | "STREAM_MODERATION_ENABLED"
  | "STREAM_API_KEY"
  | "STREAM_API_SECRET"
  | "STREAM_MODERATION_CONFIG_KEY"
  | "STREAM_PSEUDONYM_KEY"
>;

type StreamCheckResponse = {
  recommended_action?: string;
  status?: string;
  task_id?: string;
  item?: {
    id?: string;
    ai_text_severity?: string;
    recommended_action?: string;
    severity?: number;
    flags?: Array<{
      type?: string;
      reason?: string;
      labels?: string[];
      result?: Array<Record<string, unknown>>;
      custom?: Record<string, unknown>;
    }>;
  };
  triggered_rule?: {
    name?: string;
    rule_type?: string;
  };
  duration?: string;
  metadata?: {
    clientRequestId?: string;
  };
};

export function isCompleteStreamImageResponse(response: StreamCheckResponse) {
  return response.status?.toLowerCase() === "complete" &&
    typeof response.recommended_action === "string" &&
    response.recommended_action.length > 0;
}

const streamSeverityByAction: Record<string, ProviderLabel["severity"]> = {
  keep: "none",
  flag: "medium",
  remove: "high",
  block: "high",
  bounce: "medium",
  shadow_block: "medium"
};

function streamEntityType(surface: ModerationSurface, contentType: ModerationContentType) {
  if (surface === "direct_message" || surface === "group_message") {
    return "cruush:message";
  }

  if (surface === "feed") {
    return contentType === "image" ? "cruush:feed:image" : "cruush:feed:post";
  }

  if (surface === "profile_photo" || surface === "private_photo") {
    return `cruush:${surface}`;
  }

  return "cruush:profile";
}

function severityFromStream(value: unknown, fallback: ProviderLabel["severity"] = "medium"): ProviderLabel["severity"] {
  if (typeof value === "string") {
    const normalized = value.toLowerCase();

    if (["none", "low", "medium", "high", "critical"].includes(normalized)) {
      return normalized as ProviderLabel["severity"];
    }
  }

  if (typeof value === "number") {
    if (value >= 4) {
      return "critical";
    }

    if (value >= 3) {
      return "high";
    }

    if (value >= 2) {
      return "medium";
    }

    if (value >= 1) {
      return "low";
    }
  }

  return fallback;
}

export function normalizeStreamLabel(
  label: string,
  _surface?: ModerationSurface
): NormalizedModerationLabel | null {
  const normalized = label
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalized) {
    return null;
  }

  if (/\b(?:csam|child sexual|sexual child|minor sexual|sexual minor|underage sexual|sexual underage)\b/i.test(normalized)) {
    return "underage_sexual";
  }

  if (/\b(?:child|children|minor|minors|underage|teen|teenager|young looking|youthful|age ambiguous|ambiguous age)\b/i.test(normalized)) {
    return null;
  }

  if (/\b(?:animal|pet|dog|cat|bird|reptile|wildlife)\b/i.test(normalized)) {
    return "animal";
  }

  if (/\b(?:screenshot|screen capture|screen recording|interface|ui capture|text only|logo)\b/i.test(normalized)) {
    return "screenshot_or_interface";
  }

  if (/\b(?:group photo|group image|multiple people|more than one person|crowd|no human|non human|not human|no person|no people|object|landscape|abstract|gradient|cartoon|drawing|illustration)\b/i.test(normalized)) {
    return "profile_photo_not_adult_human";
  }

  const adultSignal = /\b(?:adult|18\+|over 18|18 or older)\b/i;
  const humanSignal = /\b(?:human|person|face|body|body part|body parts|torso|chest|abdomen|arm|arms|forearm|forearms|hand|hands|leg|legs|limb|limbs|thigh|thighs|calf|calves|foot|feet|shoulder|shoulders|back|waist|hip|hips|skin|portrait)\b/i;

  if (adultSignal.test(normalized) && humanSignal.test(normalized)) {
    return "adult_human_body";
  }

  if (/(non consensual|non-consensual|revenge|sexual exploitation|intimate image abuse)/i.test(normalized)) {
    return "revenge_porn";
  }

  if (/(bestiality|zoophilia)/i.test(normalized)) {
    return "bestiality";
  }

  if (/(scat|excrement|feces|fecal matter|human waste)/i.test(normalized)) {
    return "scat";
  }

  if (/(threat|violent threat|incitement|weapon)/i.test(normalized)) {
    return "threat";
  }

  if (/(hate symbol|extremist symbol)/i.test(normalized)) {
    return "hate_symbol";
  }

  if (/(hate|hateful|protected class|slur)/i.test(normalized)) {
    return "hate_speech";
  }

  if (/(harass|bully|insult|abuse|toxic)/i.test(normalized)) {
    return "harassment";
  }

  if (/(dox|personal information|private information)/i.test(normalized)) {
    return "doxxing";
  }

  if (/(location|address|phone|workplace)/i.test(normalized)) {
    return "location_privacy";
  }

  if (/(scam|fraud|misleading identity|impersonation)/i.test(normalized)) {
    return "scam";
  }

  if (/(spam|platform circumvention)/i.test(normalized)) {
    return "spam";
  }

  if (/(explicit|sexual|porn|nudity|nude|non explicit nudity|swimwear|underwear)/i.test(normalized)) {
    return normalized.includes("nud") || normalized.includes("swimwear") || normalized.includes("underwear")
      ? "adult_nudity"
      : "adult_explicit";
  }

  if (/(gore|disturbing|blood|violence)/i.test(normalized)) {
    return "gore";
  }

  return null;
}

export function streamLabelsFromResponse(
  response: StreamCheckResponse,
  surface?: ModerationSurface
): ProviderLabel[] {
  const recommendedAction = response.recommended_action?.toLowerCase();
  const fallbackSeverity = severityFromStream(
    response.item?.ai_text_severity ?? response.item?.severity,
    streamSeverityByAction[(response.recommended_action ?? response.item?.recommended_action ?? "flag").toLowerCase()] ?? "medium"
  );
  const labels: ProviderLabel[] = [];

  for (const flag of response.item?.flags ?? []) {
    const rawLabels = [
      ...(flag.labels ?? []),
      ...stringsFromUnknown(flag.result),
      ...stringsFromUnknown(flag.custom),
      flag.type,
      flag.reason
    ].filter((value): value is string => typeof value === "string" && value.trim().length > 0);

    for (const rawLabel of rawLabels) {
      const normalizedLabel = normalizeStreamLabel(rawLabel, surface);

      if (!normalizedLabel) {
        continue;
      }

      labels.push({
        provider_label: rawLabel,
        normalized_label: normalizedLabel,
        confidence: recommendedAction === "remove" ? 0.92 : 0.86,
        severity: fallbackSeverity
      });
    }
  }

  if (labels.length === 0 && recommendedAction && recommendedAction !== "keep") {
    labels.push({
      provider_label: `stream_recommended_${recommendedAction}`,
      normalized_label: recommendedAction === "remove" ? "harassment" : "spam",
      confidence: recommendedAction === "remove" ? 0.88 : 0.8,
      severity: fallbackSeverity
    });
  }

  const seen = new Set<string>();

  return labels.filter((label) => {
    const key = `${label.provider_label}:${label.normalized_label}`;

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function sanitizeStreamResponse(response: StreamCheckResponse): Record<string, unknown> {
  return {
    recommended_action: response.recommended_action,
    status: response.status,
    task_id: response.task_id,
    review_queue_item_id: response.item?.id,
    triggered_rule: response.triggered_rule
      ? {
          name: response.triggered_rule.name,
          rule_type: response.triggered_rule.rule_type
        }
      : undefined,
    flags: (response.item?.flags ?? []).map((flag) => ({
      type: flag.type,
      reason: flag.reason,
      labels: flag.labels
    }))
  };
}

export class StreamModerationProvider implements ModerationProvider {
  readonly name = "stream";
  readonly version = "2026-06-26";
  private readonly client: StreamClient;
  private readonly configKey: string;

  constructor(private readonly config: StreamConfig) {
    if (!config.STREAM_API_KEY || !config.STREAM_API_SECRET || !config.STREAM_MODERATION_CONFIG_KEY) {
      throw new Error("STREAM_API_KEY, STREAM_API_SECRET, and STREAM_MODERATION_CONFIG_KEY are required when Stream moderation is enabled.");
    }

    this.client = new StreamClient(config.STREAM_API_KEY, config.STREAM_API_SECRET, {
      timeout: config.MODERATION_TIMEOUT_MS ?? 5000
    });
    this.configKey = config.STREAM_MODERATION_CONFIG_KEY;
  }

  private async check(input: {
    userId: string;
    surface: ModerationSurface;
    contentType: ModerationContentType;
    contentId?: string;
    moderationPayload: {
      texts?: string[];
      images?: string[];
    };
  }): Promise<ProviderModerationResult> {
    const startedAt = Date.now();
    const entityId = input.contentId ?? `${input.surface}-${input.contentType}-${Date.now().toString(36)}`;

    try {
      const response = await this.client.moderation.check({
        entity_type: streamEntityType(input.surface, input.contentType),
        entity_id: entityId,
        entity_creator_id: input.userId,
        config_key: this.configKey,
        moderation_payload: input.moderationPayload,
        options: {
          force_sync: true
        },
        user_id: input.userId
      }) as StreamCheckResponse;

      if (input.contentType === "image" && !isCompleteStreamImageResponse(response)) {
        return {
          provider: this.name,
          provider_request_id: response.item?.id ?? response.task_id ?? `stream-partial-${Date.now().toString(36)}`,
          labels: [],
          latency_ms: Date.now() - startedAt,
          recommended_action: response.recommended_action,
          status: "partial",
          raw_result: sanitizeStreamResponse(response),
          error: "Stream returned an incomplete image moderation response."
        };
      }

      return {
        provider: this.name,
        provider_request_id: response.item?.id ?? response.task_id ?? response.metadata?.clientRequestId ?? `stream-${Date.now().toString(36)}`,
        labels: streamLabelsFromResponse(response, input.surface),
        latency_ms: Date.now() - startedAt,
        recommended_action: response.recommended_action,
        status: response.status,
        raw_result: sanitizeStreamResponse(response)
      };
    } catch (error) {
      return {
        provider: this.name,
        provider_request_id: `stream-error-${Date.now().toString(36)}`,
        labels: [],
        latency_ms: Date.now() - startedAt,
        status: "error",
        raw_result: {
          error_name: error instanceof Error ? error.name : "UnknownError"
        },
        error: error instanceof Error ? error.message : "Stream moderation request failed."
      };
    }
  }

  async moderateText(input: TextModerationInput): Promise<ProviderModerationResult> {
    return this.check({
      userId: input.userId,
      surface: input.surface,
      contentType: "text",
      contentId: input.contentId,
      moderationPayload: {
        texts: [input.text]
      }
    });
  }

  async moderateImage(input: ImageModerationInput): Promise<ProviderModerationResult> {
    if (!input.imageUrl) {
      return {
        provider: this.name,
        provider_request_id: `stream-missing-image-url-${Date.now().toString(36)}`,
        labels: [],
        latency_ms: 0,
        status: "error",
        error: "Stream image moderation requires an imageUrl."
      };
    }

    const request = buildStreamImageCheckRequest({
      userId: input.userId,
      surface: input.surface,
      contentId: input.contentId,
      imageUrl: input.imageUrl,
      pseudonymKey: this.config.STREAM_PSEUDONYM_KEY || this.config.STREAM_API_SECRET || "",
      configKey: this.configKey
    });

    return this.check({
      userId: request.user_id,
      surface: input.surface,
      contentType: "image",
      contentId: request.entity_id,
      moderationPayload: request.moderation_payload
    });
  }
}

export function buildStreamImageCheckRequest(input: {
  userId: string;
  surface: ModerationSurface;
  contentId?: string;
  imageUrl: string;
  pseudonymKey: string;
  configKey: string;
}) {
  const pseudonym = `cm_${createHmac("sha256", input.pseudonymKey)
    .update(`stream-image-user-v1:${input.userId}`)
    .digest("base64url")}`;

  return {
    entity_type: streamEntityType(input.surface, "image"),
    entity_id: input.contentId ?? `image-${Date.now().toString(36)}`,
    entity_creator_id: pseudonym,
    config_key: input.configKey,
    moderation_payload: {
      images: [input.imageUrl]
    },
    options: {
      force_sync: true
    },
    user_id: pseudonym
  };
}

export function createModerationProvider(config: Pick<AppConfig, "MODERATION_PROVIDER"> & StreamConfig): ModerationProvider {
  if (config.STREAM_MODERATION_ENABLED) {
    return new StreamModerationProvider(config);
  }

  const provider = config.MODERATION_PROVIDER ?? "mock";

  if (provider !== "mock") {
    throw new Error(`Moderation provider '${provider}' is not configured in this build. Use MODERATION_PROVIDER=mock.`);
  }

  return new MockModerationProvider();
}
