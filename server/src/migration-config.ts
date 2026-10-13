import { z } from "zod";
import type { OosStateCryptoConfig } from "./oos-state-crypto.js";

// Migrations 218/219 need the existing location keys, not API service credentials.
// Keep these defaults and production checks aligned with config.ts.
const migrationCryptoSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  SESSION_SECRET: z.string().min(1),
  LOCATION_ENCRYPTION_KEY: z.string().optional().default(""),
  LOCATION_ENCRYPTION_KEY_PREVIOUS: z.string().optional(),
  LOCATION_ENCRYPTION_KEY_VERSION: z.string().trim().min(1).optional().default("v1")
}).superRefine((config, ctx) => {
  if (config.NODE_ENV !== "production") return;

  if (config.SESSION_SECRET.length < 32 || config.SESSION_SECRET === "change-me") {
    ctx.addIssue({ code: "custom", path: ["SESSION_SECRET"], message: "Invalid production secret." });
  }
  if (config.LOCATION_ENCRYPTION_KEY.length < 32) {
    ctx.addIssue({ code: "custom", path: ["LOCATION_ENCRYPTION_KEY"], message: "Invalid production key." });
  }
});

export function loadMigrationCryptoConfig(env: NodeJS.ProcessEnv = process.env): OosStateCryptoConfig {
  const result = migrationCryptoSchema.safeParse(env);
  if (!result.success) {
    // Never expose a validation object, supplied value, or the rest of the job's environment.
    const fields = [...new Set(result.error.issues.map((issue) => String(issue.path[0])))];
    throw new Error(`Invalid migration crypto configuration: ${fields.join(", ")}.`);
  }

  const { NODE_ENV: _nodeEnv, ...cryptoConfig } = result.data;
  return cryptoConfig;
}
