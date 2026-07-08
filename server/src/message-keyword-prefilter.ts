type MessageKeywordRule = {
  category: string;
  patterns: RegExp[];
};

function normalizeMessageText(text: string) {
  return text
    .normalize("NFKC")
    .replace(/\ufe0f/g, "")
    .toLowerCase()
    .replace(/[._-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const severeSafetyMessageRules: MessageKeywordRule[] = [
  {
    category: "minor_safety",
    patterns: [
      /\b(?:csam|c\s*s\s*a\s*m|underage|minors?|children|kids?|child|pedo|barely legal)\b/i,
      /\b(?:teen(?:ager)?|1[0-7]\s?(?:yo|y\/o|years? old)?)\b.{0,80}\b(?:sex|nudes?|hook ?up|explicit|porn|meet)\b/i,
      /\b(?:sex|nudes?|hook ?up|explicit|porn|meet)\b.{0,80}\b(?:teen(?:ager)?|1[0-7]\s?(?:yo|y\/o|years? old)?)\b/i
    ]
  },
  {
    category: "credible_threat",
    patterns: [
      /\b(?:i will|i'?m going to|im going to|gonna)\s+(?:kill|hurt|stab|shoot|beat)\s+(?:you|them|him|her)\b/i,
      /\b(?:kill|hurt|stab|shoot|beat)\s+(?:you|them|him|her)\b/i,
      /\b(?:k\s*y\s*s|kill yourself)\b/i
    ]
  },
  {
    category: "harassment_or_stalking",
    patterns: [
      /\b(?:stalk|stalking|harass|harassing|won'?t stop messaging|keep messaging after block)\b/i,
      /\b(?:follow(?:ing)? you home|watch(?:ing)? your home|waiting outside your)\b/i
    ]
  },
  {
    category: "doxxing_or_location_privacy",
    patterns: [
      /\b(?:doxx?|drop|leak|share|post|send)\b.{0,60}\b(?:address|phone number|workplace|where you live|where they live|map pin|location)\b/i,
      /\b(?:your|their|his|her)\s+(?:address|phone number|workplace|map pin|home address)\b/i
    ]
  },
  {
    category: "drug_sales",
    patterns: [
      /\b(?:drug|meth|coke|cocaine|fent|fentanyl|xanax|ghb|molly|mdma|ketamine|ice)\s+(?:menu|menus|delivery|deliver|sale|sales|plug|dealer|available)\b/i,
      /\b(?:selling|sell|ship|shipping|deliver|delivery|pickup|plug)\b.{0,48}\b(?:meth|coke|cocaine|fent|fentanyl|xanax|ghb|molly|mdma|ketamine|ice|drugs?)\b/i
    ]
  },
  {
    category: "commercial_sex",
    patterns: [
      /\b(?:escort|incall|outcall|full service|gfe|pse)\b/i,
      /\b(?:cashapp|venmo|paypal|zelle|rates?|donation|roses?|tribute)\b.{0,48}\b(?:sex|hookup|meet|session|hour|hh)\b/i,
      /\$\s?\d{2,5}.{0,36}\b(?:hour|hh|session|meet|hookup|sex)\b/i
    ]
  },
  {
    category: "bestiality",
    patterns: [
      /\b(?:bestiality|beastiality|zoophilia|zoophile|animal sex|sex with animals?|k\s*9 taboo)\b/i
    ]
  },
  {
    category: "nonconsensual_intimate_image",
    patterns: [
      /\b(?:revenge porn|leak(?:ed|ing)? nudes?|share(?:d|ing)? (?:their|his|her) nudes?|post(?:ed|ing)? (?:their|his|her) nudes?)\b/i,
      /\b(?:leak|share|post|send)\b.{0,40}\b(?:their|his|her) nudes?\b/i,
      /\b(?:non consensual|non-consensual)\b.{0,48}\b(?:nudes?|intimate|photo|video)\b/i
    ]
  },
  {
    category: "hate_or_extremism",
    patterns: [
      /\b(?:hate speech|hate group|supremacist|nazi|kkk)\b/i,
      /\b(?:kill all|wipe out)\b.{0,40}\b(?:queer|trans|gay|lesbian|people)\b/i
    ]
  },
  {
    category: "scam_spam_or_platform_abuse",
    patterns: [
      /\b(?:scam|fraud|impersonat(?:e|ing|ion)|blackmail|extort|sextortion)\b/i,
      /\b(?:spam|bot|phishing|platform circumvention|off platform payment)\b/i
    ]
  }
];

export function shouldModerateMessageTextWithProvider(text: string) {
  const normalizedText = normalizeMessageText(text);

  if (!normalizedText) {
    return {
      shouldModerate: false,
      matchedCategories: []
    };
  }

  const matchedCategories = severeSafetyMessageRules
    .filter((rule) => rule.patterns.some((pattern) => pattern.test(text) || pattern.test(normalizedText)))
    .map((rule) => rule.category);

  return {
    shouldModerate: matchedCategories.length > 0,
    matchedCategories
  };
}
