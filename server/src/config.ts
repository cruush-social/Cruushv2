import { z } from "zod";

const booleanEnvSchema = z.union([
  z.boolean(),
  z.string().trim().toLowerCase().transform((value, ctx) => {
    if (["1", "true", "yes", "on"].includes(value)) {
      return true;
    }

    if (["0", "false", "no", "off", ""].includes(value)) {
      return false;
    }

    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Expected a boolean-like value"
    });
    return z.NEVER;
  })
]).optional().default(false);

const uuidListEnvSchema = z.union([
  z.array(z.uuid()),
  z.string().transform((value, ctx) => {
    const values = value
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);
    const parsed = z.array(z.uuid()).safeParse(values);

    if (!parsed.success) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Expected a comma-separated list of UUIDs"
      });
      return z.NEVER;
    }

    return [...new Set(parsed.data)];
  })
]).optional().default([]);

const corsOriginSchema = z.string().min(1).transform((value, ctx) => {
  const origins = value
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (origins.length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "CORS_ORIGIN must include at least one origin"
    });
    return z.NEVER;
  }

  for (const origin of origins) {
    try {
      const url = new URL(origin);

      if (url.origin !== origin || !["http:", "https:"].includes(url.protocol)) {
        throw new Error("invalid origin");
      }
    } catch {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Invalid CORS origin: ${origin}`
      });
      return z.NEVER;
    }
  }

  return origins.join(",");
});

const configSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_DEPLOYMENT_STAGE: z.enum(["development", "staging", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3001),
  HOST: z.string().min(1).default("0.0.0.0"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  CORS_ORIGIN: corsOriginSchema.default("http://localhost:5173,https://localhost:5173,http://127.0.0.1:5173,https://127.0.0.1:5173"),
  SESSION_SECRET: z.string().min(1, "SESSION_SECRET is required"),
  APP_URL: z.string().url().default("https://localhost:5173"),
  MEDIA_STORAGE_DIR: z.string().trim().min(1).optional().default("media"),
  MEDIA_PUBLIC_BASE_URL: z.string().url().optional().or(z.literal("")).default(""),
  MEDIA_MODERATION_URL_SECRET: z.string().optional().default(""),
  MEDIA_MODERATION_URL_TTL_SECONDS: z.coerce.number().int().min(30).max(300).optional().default(120),
  MEDIA_OBJECT_STORAGE_DRIVER: z.enum(["local", "s3"]).optional().default("local"),
  MEDIA_S3_BUCKET: z.string().trim().optional().default(""),
  MEDIA_S3_ENDPOINT: z.string().url().optional().or(z.literal("")).default(""),
  MEDIA_S3_REGION: z.string().trim().min(1).optional().default("auto"),
  MEDIA_S3_ACCESS_KEY_ID: z.string().optional().default(""),
  MEDIA_S3_SECRET_ACCESS_KEY: z.string().optional().default(""),
  MODERATION_PROVIDER: z.enum(["mock"]).optional().default("mock"),
  MODERATION_TIMEOUT_MS: z.coerce.number().int().positive().optional().default(5000),
  STREAM_MODERATION_ENABLED: booleanEnvSchema,
  HUMAN_MODERATION_ENABLED: booleanEnvSchema,
  STREAM_IMAGE_BRIDGE_ENABLED: booleanEnvSchema,
  PROFILE_PHOTO_STREAM_AUTOMOD_ENABLED: booleanEnvSchema,
  PROFILE_PHOTO_REKOGNITION_ENABLED: booleanEnvSchema,
  PROFILE_PHOTO_REKOGNITION_REGION: z.string().trim().min(1).optional().default("us-east-1"),
  PROFILE_PHOTO_REKOGNITION_HUMAN_CONFIDENCE: z.coerce.number().min(50).max(100).optional().default(90),
  PROFILE_PHOTO_REKOGNITION_ANIMAL_CONFIDENCE: z.coerce.number().min(50).max(100).optional().default(80),
  PROFILE_PHOTO_REKOGNITION_FACE_CONFIDENCE: z.coerce.number().min(50).max(100).optional().default(90),
  PROFILE_PHOTO_REKOGNITION_MINIMUM_AGE: z.coerce.number().int().min(18).max(25).optional().default(18),
  PROFILE_PHOTO_REKOGNITION_TIMEOUT_MS: z.coerce.number().int().positive().max(30_000).optional().default(5000),
  ALPHA_PROFILE_PHOTO_UPLOADS_WITHOUT_PHOTODNA_ENABLED: booleanEnvSchema,
  SEVERE_ACCESS_BANS_ENABLED: booleanEnvSchema,
  SEVERE_ACCESS_BAN_HMAC_KEY: z.string().optional().default(""),
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).optional().default(0),
  STREAM_API_KEY: z.string().optional().default(""),
  STREAM_API_SECRET: z.string().optional().default(""),
  STREAM_APP_ID: z.string().optional().default(""),
  STREAM_MODERATION_CONFIG_KEY: z.string().trim().regex(/^[\w:-]*$/, "STREAM_MODERATION_CONFIG_KEY may only contain letters, numbers, underscores, dashes, and colons.").optional().default(""),
  MODERATION_MEDIA_BASE_URL: z.string().url().optional().or(z.literal("")).default(""),
  STREAM_PSEUDONYM_KEY: z.string().optional().default(""),
  BANK_PROFILE_PHOTO_MANUAL_REVIEW_ENABLED: booleanEnvSchema,
  BANK_PROFILE_PHOTO_TESTER_USER_IDS: uuidListEnvSchema,
  PHOTODNA_ENABLED: booleanEnvSchema,
  PHOTODNA_API_URL: z.string().url().optional().or(z.literal("")).default(""),
  PHOTODNA_OPERATION_PATH: z.string().trim().optional().default(""),
  PHOTODNA_SUBSCRIPTION_KEY: z.string().optional().default(""),
  PHOTODNA_TIMEOUT_MS: z.coerce.number().int().positive().optional().default(5000),
  CSAM_REPORTING_ENABLED: booleanEnvSchema,
  CSAM_REPORTING_MODE: z.enum(["manual_packet", "ncmec_direct"]).optional().default("manual_packet"),
  CSAM_REPORTING_TEST_MODE: booleanEnvSchema,
  TRUST_SAFETY_ALERT_EMAIL: z.string().trim().email().optional().or(z.literal("")).default(""),
  SUPPORT_INBOX_EMAIL: z.string().trim().email().optional().or(z.literal("")).default(""),
  INTERNAL_API_SECRET: z.string().optional().default(""),
  RESEND_API_KEY: z.string().optional().default(""),
  MAIL_FROM: z.string().optional().default(""),
  EMAIL_PREVIEW_ENABLED: booleanEnvSchema,
  DEVELOPMENT_ADMIN_ENABLED: booleanEnvSchema,
  DEVELOPMENT_ADMIN_PASSWORD: z.string().optional().default(""),
  TURNSTILE_SECRET_KEY: z.string().optional().default(""),
  PROFILE_ENCRYPTION_KEY: z.string().optional().default(""),
  PROFILE_TOKEN_KEY: z.string().optional().default(""),
  PROFILE_TOKEN_KEY_VERSION: z.string().trim().min(1).optional().default("v1"),
  RELATIONSHIP_ENCRYPTION_KEY: z.string().optional().default(""),
  RELATIONSHIP_INDEX_KEY: z.string().optional().default(""),
  RELATIONSHIP_ENCRYPTION_KEY_VERSION: z.string().trim().min(1).optional().default("v1"),
  RELATIONSHIP_INDEX_KEY_VERSION: z.string().trim().min(1).optional().default("v1"),
  MATCH_TOKEN_ENCRYPTION_KEY: z.string().optional().default(""),
  MATCH_TOKEN_SIGNING_KEY: z.string().optional().default(""),
  MATCH_TOKEN_KEY_VERSION: z.string().trim().min(1).optional().default("v1"),
  MESSAGE_ENCRYPTION_KEY: z.string().optional().default(""),
  MESSAGE_ENCRYPTION_KEY_VERSION: z.string().trim().min(1).optional().default("v1"),
  FEED_ENCRYPTION_KEY: z.string().optional().default(""),
  FEED_ENCRYPTION_KEY_VERSION: z.string().trim().min(1).optional().default("v1"),
  MEDIA_ENCRYPTION_KEY: z.string().optional().default(""),
  MEDIA_ENCRYPTION_KEY_VERSION: z.string().trim().min(1).optional().default("v1"),
  LOCATION_ENCRYPTION_KEY: z.string().optional().default(""),
  LOCATION_INDEX_KEY: z.string().optional().default(""),
  VISIBILITY_POLICY_ENCRYPTION_KEY: z.string().optional().default(""),
  GHOST_DERIVATION_KEY: z.string().optional().default(""),
  DISPLAY_TOKEN_ENCRYPTION_KEY: z.string().optional().default(""),
  LOCATION_ENCRYPTION_KEY_VERSION: z.string().trim().min(1).optional().default("v1"),
  LOCATION_INDEX_KEY_VERSION: z.string().trim().min(1).optional().default("v1"),
  VISIBILITY_POLICY_ENCRYPTION_KEY_VERSION: z.string().trim().min(1).optional().default("v1"),
  GHOST_DERIVATION_KEY_VERSION: z.string().trim().min(1).optional().default("v1"),
  DISPLAY_TOKEN_ENCRYPTION_KEY_VERSION: z.string().trim().min(1).optional().default("v1"),
  WEB_PUSH_ENABLED: booleanEnvSchema,
  WEB_PUSH_VAPID_PUBLIC_KEY: z.string().optional().default(""),
  WEB_PUSH_VAPID_PRIVATE_KEY: z.string().optional().default(""),
  WEB_PUSH_SUBJECT: z.string().trim().min(1).optional().default("mailto:hello@cruush.app")
}).superRefine((config, ctx) => {
  if (config.WEB_PUSH_ENABLED) {
    for (const keyName of ["WEB_PUSH_VAPID_PUBLIC_KEY", "WEB_PUSH_VAPID_PRIVATE_KEY", "WEB_PUSH_SUBJECT"] as const) {
      if (!config[keyName]) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${keyName} is required when WEB_PUSH_ENABLED=true.`,
          path: [keyName]
        });
      }
    }
  }

  if (config.STREAM_MODERATION_ENABLED) {
    for (const keyName of ["STREAM_API_KEY", "STREAM_API_SECRET", "STREAM_MODERATION_CONFIG_KEY"] as const) {
      if (!config[keyName]) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${keyName} is required when STREAM_MODERATION_ENABLED=true.`,
          path: [keyName]
        });
      }
    }

    if (config.MEDIA_MODERATION_URL_SECRET.length < 32) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "MEDIA_MODERATION_URL_SECRET must contain at least 32 characters when STREAM_MODERATION_ENABLED=true.",
        path: ["MEDIA_MODERATION_URL_SECRET"]
      });
    }

    if (!config.MEDIA_PUBLIC_BASE_URL) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "MEDIA_PUBLIC_BASE_URL is required when STREAM_MODERATION_ENABLED=true.",
        path: ["MEDIA_PUBLIC_BASE_URL"]
      });
    } else {
      const publicApiOrigin = new URL(config.MEDIA_PUBLIC_BASE_URL);
      const isLocalHttp = config.NODE_ENV !== "production" &&
        publicApiOrigin.protocol === "http:" &&
        ["localhost", "127.0.0.1", "[::1]"].includes(publicApiOrigin.hostname);

      if (publicApiOrigin.origin !== config.MEDIA_PUBLIC_BASE_URL) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "MEDIA_PUBLIC_BASE_URL must contain only the public API origin.",
          path: ["MEDIA_PUBLIC_BASE_URL"]
        });
      }

      if (publicApiOrigin.protocol !== "https:" && !isLocalHttp) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "MEDIA_PUBLIC_BASE_URL must use HTTPS except for local development and tests.",
          path: ["MEDIA_PUBLIC_BASE_URL"]
        });
      }
    }
  }

  if (config.STREAM_IMAGE_BRIDGE_ENABLED) {
    if (!config.STREAM_MODERATION_ENABLED) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "STREAM_MODERATION_ENABLED is required when STREAM_IMAGE_BRIDGE_ENABLED=true.",
        path: ["STREAM_MODERATION_ENABLED"]
      });
    }

    if (Buffer.byteLength(config.STREAM_PSEUDONYM_KEY, "utf8") < 32) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "STREAM_PSEUDONYM_KEY must be at least 32 bytes when STREAM_IMAGE_BRIDGE_ENABLED=true.",
        path: ["STREAM_PSEUDONYM_KEY"]
      });
    }
  }

  if (config.PROFILE_PHOTO_STREAM_AUTOMOD_ENABLED) {
    if (!config.STREAM_IMAGE_BRIDGE_ENABLED) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "STREAM_IMAGE_BRIDGE_ENABLED is required when PROFILE_PHOTO_STREAM_AUTOMOD_ENABLED=true.",
        path: ["STREAM_IMAGE_BRIDGE_ENABLED"]
      });
    }

    if (config.BANK_PROFILE_PHOTO_MANUAL_REVIEW_ENABLED) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "BANK_PROFILE_PHOTO_MANUAL_REVIEW_ENABLED must be false when PROFILE_PHOTO_STREAM_AUTOMOD_ENABLED=true.",
        path: ["BANK_PROFILE_PHOTO_MANUAL_REVIEW_ENABLED"]
      });
    }

    if (!config.SEVERE_ACCESS_BANS_ENABLED) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "SEVERE_ACCESS_BANS_ENABLED is required when PROFILE_PHOTO_STREAM_AUTOMOD_ENABLED=true.",
        path: ["SEVERE_ACCESS_BANS_ENABLED"]
      });
    }

    if (Buffer.byteLength(config.SEVERE_ACCESS_BAN_HMAC_KEY, "utf8") < 32) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "SEVERE_ACCESS_BAN_HMAC_KEY must be at least 32 bytes when PROFILE_PHOTO_STREAM_AUTOMOD_ENABLED=true.",
        path: ["SEVERE_ACCESS_BAN_HMAC_KEY"]
      });
    }

    if (config.TRUST_PROXY_HOPS < 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "TRUST_PROXY_HOPS must identify the trusted reverse-proxy hop count when PROFILE_PHOTO_STREAM_AUTOMOD_ENABLED=true.",
        path: ["TRUST_PROXY_HOPS"]
      });
    }
  }

  if (config.BANK_PROFILE_PHOTO_MANUAL_REVIEW_ENABLED) {
    if (config.APP_DEPLOYMENT_STAGE !== "staging") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "APP_DEPLOYMENT_STAGE must be staging when bank profile-photo manual review is enabled.",
        path: ["APP_DEPLOYMENT_STAGE"]
      });
    }

    if (config.BANK_PROFILE_PHOTO_TESTER_USER_IDS.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "BANK_PROFILE_PHOTO_TESTER_USER_IDS must include at least one tester UUID.",
        path: ["BANK_PROFILE_PHOTO_TESTER_USER_IDS"]
      });
    }

    if (!config.STREAM_IMAGE_BRIDGE_ENABLED) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "STREAM_IMAGE_BRIDGE_ENABLED is required for bank profile-photo manual review.",
        path: ["STREAM_IMAGE_BRIDGE_ENABLED"]
      });
    }

    if (!config.MODERATION_MEDIA_BASE_URL) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "MODERATION_MEDIA_BASE_URL is required for bank profile-photo manual review.",
        path: ["MODERATION_MEDIA_BASE_URL"]
      });
    }

    if (config.MEDIA_OBJECT_STORAGE_DRIVER !== "s3") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "S3-backed encrypted storage is required for bank profile-photo manual review.",
        path: ["MEDIA_OBJECT_STORAGE_DRIVER"]
      });
    }

    if (Buffer.byteLength(config.INTERNAL_API_SECRET, "utf8") < 32) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "INTERNAL_API_SECRET must be at least 32 bytes for bank profile-photo manual review.",
        path: ["INTERNAL_API_SECRET"]
      });
    }
  }

  if (config.PHOTODNA_ENABLED) {
    for (const keyName of ["PHOTODNA_API_URL", "PHOTODNA_OPERATION_PATH", "PHOTODNA_SUBSCRIPTION_KEY"] as const) {
      if (!config[keyName]) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${keyName} is required when PHOTODNA_ENABLED=true.`,
          path: [keyName]
        });
      }
    }
  }

  if (config.MEDIA_OBJECT_STORAGE_DRIVER === "s3") {
    for (const keyName of ["MEDIA_S3_BUCKET", "MEDIA_S3_ENDPOINT", "MEDIA_S3_ACCESS_KEY_ID", "MEDIA_S3_SECRET_ACCESS_KEY"] as const) {
      if (!config[keyName]) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${keyName} is required when MEDIA_OBJECT_STORAGE_DRIVER=s3.`,
          path: [keyName]
        });
      }
    }
  }

  if (config.NODE_ENV !== "production") {
    return;
  }

  if (config.STREAM_IMAGE_BRIDGE_ENABLED) {
    const moderationMediaUrl = config.MODERATION_MEDIA_BASE_URL
      ? new URL(config.MODERATION_MEDIA_BASE_URL)
      : null;

    if (moderationMediaUrl && moderationMediaUrl.protocol !== "https:") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "MODERATION_MEDIA_BASE_URL must use HTTPS in production.",
        path: ["MODERATION_MEDIA_BASE_URL"]
      });
    }

    if (
      moderationMediaUrl && (
        moderationMediaUrl.username ||
        moderationMediaUrl.password ||
        moderationMediaUrl.pathname !== "/" ||
        moderationMediaUrl.search ||
        moderationMediaUrl.hash
      )
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "MODERATION_MEDIA_BASE_URL must be a credential-free origin without a path, query, or fragment.",
        path: ["MODERATION_MEDIA_BASE_URL"]
      });
    }

    if (config.MEDIA_OBJECT_STORAGE_DRIVER !== "s3") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "STREAM_IMAGE_BRIDGE_ENABLED requires S3-backed encrypted storage in production.",
        path: ["MEDIA_OBJECT_STORAGE_DRIVER"]
      });
    }
  }

  if (config.PHOTODNA_ENABLED) {
    if (!config.CSAM_REPORTING_ENABLED) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "CSAM_REPORTING_ENABLED is required when PHOTODNA_ENABLED=true in production.",
        path: ["CSAM_REPORTING_ENABLED"]
      });
    }

    if (!config.TRUST_SAFETY_ALERT_EMAIL) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "TRUST_SAFETY_ALERT_EMAIL is required when PHOTODNA_ENABLED=true in production.",
        path: ["TRUST_SAFETY_ALERT_EMAIL"]
      });
    }

    if (!config.RESEND_API_KEY || !config.MAIL_FROM) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "RESEND_API_KEY and MAIL_FROM are required for production CSAM alerting.",
        path: ["RESEND_API_KEY"]
      });
    }
  }

  if (config.SESSION_SECRET.length < 32 || config.SESSION_SECRET === "change-me") {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "SESSION_SECRET must be a strong production secret.",
      path: ["SESSION_SECRET"]
    });
  }

  if (config.EMAIL_PREVIEW_ENABLED) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "EMAIL_PREVIEW_ENABLED must be disabled in production.",
      path: ["EMAIL_PREVIEW_ENABLED"]
    });
  }

  if (!config.RESEND_API_KEY) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "RESEND_API_KEY is required in production.",
      path: ["RESEND_API_KEY"]
    });
  }

  if (!config.MAIL_FROM) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "MAIL_FROM is required in production.",
      path: ["MAIL_FROM"]
    });
  }

  if (config.MEDIA_OBJECT_STORAGE_DRIVER !== "s3") {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "MEDIA_OBJECT_STORAGE_DRIVER must be s3 in production.",
      path: ["MEDIA_OBJECT_STORAGE_DRIVER"]
    });
  }

  if (!config.PROFILE_ENCRYPTION_KEY || config.PROFILE_ENCRYPTION_KEY.length < 32) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "PROFILE_ENCRYPTION_KEY is required in production.",
      path: ["PROFILE_ENCRYPTION_KEY"]
    });
  }

  if (!config.PROFILE_TOKEN_KEY || config.PROFILE_TOKEN_KEY.length < 32) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "PROFILE_TOKEN_KEY is required in production.",
      path: ["PROFILE_TOKEN_KEY"]
    });
  }

  if (!config.RELATIONSHIP_ENCRYPTION_KEY || config.RELATIONSHIP_ENCRYPTION_KEY.length < 32) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "RELATIONSHIP_ENCRYPTION_KEY is required in production.",
      path: ["RELATIONSHIP_ENCRYPTION_KEY"]
    });
  }

  if (!config.RELATIONSHIP_INDEX_KEY || config.RELATIONSHIP_INDEX_KEY.length < 32) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "RELATIONSHIP_INDEX_KEY is required in production.",
      path: ["RELATIONSHIP_INDEX_KEY"]
    });
  }

  if (!config.MATCH_TOKEN_ENCRYPTION_KEY || config.MATCH_TOKEN_ENCRYPTION_KEY.length < 32) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "MATCH_TOKEN_ENCRYPTION_KEY is required in production.",
      path: ["MATCH_TOKEN_ENCRYPTION_KEY"]
    });
  }

  if (!config.MATCH_TOKEN_SIGNING_KEY || config.MATCH_TOKEN_SIGNING_KEY.length < 32) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "MATCH_TOKEN_SIGNING_KEY is required in production.",
      path: ["MATCH_TOKEN_SIGNING_KEY"]
    });
  }

  for (const keyName of [
    "MESSAGE_ENCRYPTION_KEY",
    "FEED_ENCRYPTION_KEY",
    "MEDIA_ENCRYPTION_KEY"
  ] as const) {
    if (!config[keyName] || config[keyName].length < 32) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${keyName} is required in production.`,
        path: [keyName]
      });
    }
  }

  for (const keyName of [
    "LOCATION_ENCRYPTION_KEY",
    "LOCATION_INDEX_KEY",
    "VISIBILITY_POLICY_ENCRYPTION_KEY",
    "GHOST_DERIVATION_KEY",
    "DISPLAY_TOKEN_ENCRYPTION_KEY"
  ] as const) {
    if (!config[keyName] || config[keyName].length < 32) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${keyName} is required in production.`,
        path: [keyName]
      });
    }
  }
});

type ParsedAppConfig = z.infer<typeof configSchema>;
type GhostModeConfigKey =
  | "LOCATION_ENCRYPTION_KEY"
  | "LOCATION_INDEX_KEY"
  | "VISIBILITY_POLICY_ENCRYPTION_KEY"
  | "GHOST_DERIVATION_KEY"
  | "DISPLAY_TOKEN_ENCRYPTION_KEY"
  | "LOCATION_ENCRYPTION_KEY_VERSION"
  | "LOCATION_INDEX_KEY_VERSION"
  | "VISIBILITY_POLICY_ENCRYPTION_KEY_VERSION"
  | "GHOST_DERIVATION_KEY_VERSION"
  | "DISPLAY_TOKEN_ENCRYPTION_KEY_VERSION";
type ModerationConfigKey =
  | "APP_DEPLOYMENT_STAGE"
  | "MEDIA_STORAGE_DIR"
  | "MEDIA_PUBLIC_BASE_URL"
  | "MEDIA_MODERATION_URL_SECRET"
  | "MEDIA_MODERATION_URL_TTL_SECONDS"
  | "MEDIA_OBJECT_STORAGE_DRIVER"
  | "MEDIA_S3_BUCKET"
  | "MEDIA_S3_ENDPOINT"
  | "MEDIA_S3_REGION"
  | "MEDIA_S3_ACCESS_KEY_ID"
  | "MEDIA_S3_SECRET_ACCESS_KEY"
  | "MODERATION_PROVIDER"
  | "MODERATION_TIMEOUT_MS"
  | "STREAM_MODERATION_ENABLED"
  | "HUMAN_MODERATION_ENABLED"
  | "STREAM_IMAGE_BRIDGE_ENABLED"
  | "PROFILE_PHOTO_STREAM_AUTOMOD_ENABLED"
  | "PROFILE_PHOTO_REKOGNITION_ENABLED"
  | "PROFILE_PHOTO_REKOGNITION_REGION"
  | "PROFILE_PHOTO_REKOGNITION_HUMAN_CONFIDENCE"
  | "PROFILE_PHOTO_REKOGNITION_ANIMAL_CONFIDENCE"
  | "PROFILE_PHOTO_REKOGNITION_FACE_CONFIDENCE"
  | "PROFILE_PHOTO_REKOGNITION_MINIMUM_AGE"
  | "PROFILE_PHOTO_REKOGNITION_TIMEOUT_MS"
  | "ALPHA_PROFILE_PHOTO_UPLOADS_WITHOUT_PHOTODNA_ENABLED"
  | "SEVERE_ACCESS_BANS_ENABLED"
  | "SEVERE_ACCESS_BAN_HMAC_KEY"
  | "TRUST_PROXY_HOPS"
  | "STREAM_API_KEY"
  | "STREAM_API_SECRET"
  | "STREAM_APP_ID"
  | "STREAM_MODERATION_CONFIG_KEY"
  | "MODERATION_MEDIA_BASE_URL"
  | "STREAM_PSEUDONYM_KEY"
  | "BANK_PROFILE_PHOTO_MANUAL_REVIEW_ENABLED"
  | "BANK_PROFILE_PHOTO_TESTER_USER_IDS"
  | "PHOTODNA_ENABLED"
  | "PHOTODNA_API_URL"
  | "PHOTODNA_OPERATION_PATH"
  | "PHOTODNA_SUBSCRIPTION_KEY"
  | "PHOTODNA_TIMEOUT_MS"
  | "CSAM_REPORTING_ENABLED"
  | "CSAM_REPORTING_MODE"
  | "CSAM_REPORTING_TEST_MODE"
  | "TRUST_SAFETY_ALERT_EMAIL"
  | "SUPPORT_INBOX_EMAIL"
  | "INTERNAL_API_SECRET"
  | "MESSAGE_ENCRYPTION_KEY"
  | "MESSAGE_ENCRYPTION_KEY_VERSION"
  | "FEED_ENCRYPTION_KEY"
  | "FEED_ENCRYPTION_KEY_VERSION"
  | "MEDIA_ENCRYPTION_KEY"
  | "MEDIA_ENCRYPTION_KEY_VERSION";
type WebPushConfigKey =
  | "WEB_PUSH_ENABLED"
  | "WEB_PUSH_VAPID_PUBLIC_KEY"
  | "WEB_PUSH_VAPID_PRIVATE_KEY"
  | "WEB_PUSH_SUBJECT";

export type AppConfig = Omit<ParsedAppConfig, GhostModeConfigKey | ModerationConfigKey | WebPushConfigKey> &
  Partial<Pick<ParsedAppConfig, GhostModeConfigKey | ModerationConfigKey | WebPushConfigKey>>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  return configSchema.parse(env);
}
