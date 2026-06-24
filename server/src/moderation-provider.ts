import type { AppConfig } from "./config.js";
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
};

export type ImageModerationInput = {
  userId: string;
  surface: ModerationSurface;
  mimeType: string;
  filename?: string;
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
  skip?: (text: string) => boolean;
};

const textRules: TextRule[] = [
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
      /\b(?:kill you|hurt you|stab you|shoot you|beat you)\b/i
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

function labelsFromFilename(filename: string | undefined): ProviderLabel[] {
  const normalized = filename?.toLowerCase() ?? "";
  const mappings: Array<[string, NormalizedModerationLabel, ProviderLabel["severity"], number]> = [
    ["underage", "underage_sexual", "critical", 0.98],
    ["bestiality", "bestiality", "critical", 0.98],
    ["revenge", "revenge_porn", "critical", 0.97],
    ["drug-sales", "drug_sales", "critical", 0.97],
    ["commercial-sex", "commercial_sex", "high", 0.93],
    ["gore", "gore", "high", 0.92],
    ["hate-symbol", "hate_symbol", "high", 0.91],
    ["adult", "adult_nudity", "low", 0.9],
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
    const labels = textRules.flatMap((rule) => {
      if (rule.skip?.(input.text)) {
        return [];
      }

      if (!rule.patterns.some((pattern) => pattern.test(input.text))) {
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

    return makeResult("image", startedAt, labelsFromFilename(input.filename));
  }
}

export function createModerationProvider(config: Pick<AppConfig, "MODERATION_PROVIDER">): ModerationProvider {
  const provider = config.MODERATION_PROVIDER ?? "mock";

  if (provider !== "mock") {
    throw new Error(`Moderation provider '${provider}' is not configured in this build. Use MODERATION_PROVIDER=mock.`);
  }

  return new MockModerationProvider();
}
