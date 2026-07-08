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
  PORT: z.coerce.number().int().positive().default(3001),
  HOST: z.string().min(1).default("0.0.0.0"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  CORS_ORIGIN: corsOriginSchema.default("http://localhost:5173,https://localhost:5173,http://127.0.0.1:5173,https://127.0.0.1:5173"),
  SESSION_SECRET: z.string().min(1, "SESSION_SECRET is required"),
  APP_URL: z.string().url().default("https://localhost:5173"),
  MEDIA_STORAGE_DIR: z.string().trim().min(1).optional().default("media"),
  MEDIA_PUBLIC_BASE_URL: z.string().url().optional().or(z.literal("")).default(""),
  MEDIA_OBJECT_STORAGE_DRIVER: z.enum(["local", "s3"]).optional().default("local"),
  MEDIA_S3_BUCKET: z.string().trim().optional().default(""),
  MEDIA_S3_ENDPOINT: z.string().url().optional().or(z.literal("")).default(""),
  MEDIA_S3_REGION: z.string().trim().min(1).optional().default("auto"),
  MEDIA_S3_ACCESS_KEY_ID: z.string().optional().default(""),
  MEDIA_S3_SECRET_ACCESS_KEY: z.string().optional().default(""),
  MODERATION_PROVIDER: z.enum(["mock"]).optional().default("mock"),
  MODERATION_TIMEOUT_MS: z.coerce.number().int().positive().optional().default(5000),
  STREAM_MODERATION_ENABLED: booleanEnvSchema,
  STREAM_API_KEY: z.string().optional().default(""),
  STREAM_API_SECRET: z.string().optional().default(""),
  STREAM_APP_ID: z.string().optional().default(""),
  STREAM_MODERATION_CONFIG_KEY: z.string().trim().regex(/^[\w:-]*$/, "STREAM_MODERATION_CONFIG_KEY may only contain letters, numbers, underscores, dashes, and colons.").optional().default(""),
  PHOTODNA_ENABLED: booleanEnvSchema,
  PHOTODNA_API_URL: z.string().url().optional().or(z.literal("")).default(""),
  PHOTODNA_OPERATION_PATH: z.string().trim().optional().default(""),
  PHOTODNA_SUBSCRIPTION_KEY: z.string().optional().default(""),
  PHOTODNA_TIMEOUT_MS: z.coerce.number().int().positive().optional().default(5000),
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
  DISPLAY_TOKEN_ENCRYPTION_KEY_VERSION: z.string().trim().min(1).optional().default("v1")
}).superRefine((config, ctx) => {
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
  | "MEDIA_STORAGE_DIR"
  | "MEDIA_PUBLIC_BASE_URL"
  | "MEDIA_OBJECT_STORAGE_DRIVER"
  | "MEDIA_S3_BUCKET"
  | "MEDIA_S3_ENDPOINT"
  | "MEDIA_S3_REGION"
  | "MEDIA_S3_ACCESS_KEY_ID"
  | "MEDIA_S3_SECRET_ACCESS_KEY"
  | "MODERATION_PROVIDER"
  | "MODERATION_TIMEOUT_MS"
  | "STREAM_MODERATION_ENABLED"
  | "STREAM_API_KEY"
  | "STREAM_API_SECRET"
  | "STREAM_APP_ID"
  | "STREAM_MODERATION_CONFIG_KEY"
  | "PHOTODNA_ENABLED"
  | "PHOTODNA_API_URL"
  | "PHOTODNA_OPERATION_PATH"
  | "PHOTODNA_SUBSCRIPTION_KEY"
  | "PHOTODNA_TIMEOUT_MS"
  | "SUPPORT_INBOX_EMAIL"
  | "INTERNAL_API_SECRET"
  | "MESSAGE_ENCRYPTION_KEY"
  | "MESSAGE_ENCRYPTION_KEY_VERSION"
  | "FEED_ENCRYPTION_KEY"
  | "FEED_ENCRYPTION_KEY_VERSION"
  | "MEDIA_ENCRYPTION_KEY"
  | "MEDIA_ENCRYPTION_KEY_VERSION";

export type AppConfig = Omit<ParsedAppConfig, GhostModeConfigKey | ModerationConfigKey> &
  Partial<Pick<ParsedAppConfig, GhostModeConfigKey | ModerationConfigKey>>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  return configSchema.parse(env);
}
