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
  CORS_ORIGIN: corsOriginSchema.default("http://localhost:5173"),
  SESSION_SECRET: z.string().min(1, "SESSION_SECRET is required"),
  APP_URL: z.string().url().default("http://localhost:5173"),
  RESEND_API_KEY: z.string().optional().default(""),
  MAIL_FROM: z.string().optional().default(""),
  EMAIL_PREVIEW_ENABLED: booleanEnvSchema,
  DEVELOPMENT_ADMIN_ENABLED: booleanEnvSchema,
  DEVELOPMENT_ADMIN_PASSWORD: z.string().optional().default(""),
  TURNSTILE_SECRET_KEY: z.string().optional().default(""),
  PROFILE_ENCRYPTION_KEY: z.string().optional().default(""),
  PROFILE_TOKEN_KEY: z.string().optional().default(""),
  PROFILE_TOKEN_KEY_VERSION: z.string().trim().min(1).optional().default("v1")
}).superRefine((config, ctx) => {
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
});

export type AppConfig = z.infer<typeof configSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  return configSchema.parse(env);
}
