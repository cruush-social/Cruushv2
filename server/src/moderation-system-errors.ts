import { createHash } from "node:crypto";
import type { DbClient } from "./db.js";
import type { ModerationContentType, ModerationSurface } from "./moderation-types.js";

function errorText(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/[\r\n\t]+/g, " ").slice(0, 500) || "Moderation provider unavailable.";
}

export async function recordModerationSystemError(
  db: DbClient,
  input: {
    provider: string;
    surface: ModerationSurface;
    contentType: ModerationContentType;
    errorCode: string;
    error: unknown;
  }
) {
  const message = errorText(input.error);
  const fingerprint = createHash("sha256")
    .update([input.provider, input.surface, input.contentType, input.errorCode].join(":"))
    .digest("hex");

  await db.query(
    `insert into moderation_system_errors (
       fingerprint, provider, surface, content_type, error_code, error_message
     ) values ($1, $2, $3, $4, $5, $6)
     on conflict (fingerprint) where resolved_at is null
     do update set
       occurrences = moderation_system_errors.occurrences + 1,
       last_seen_at = now(),
       error_message = excluded.error_message`,
    [fingerprint, input.provider, input.surface, input.contentType, input.errorCode, message]
  );
}

export async function resolveModerationSystemErrors(
  db: DbClient,
  input: { provider: string; surface: ModerationSurface; contentType: ModerationContentType }
) {
  await db.query(
    `update moderation_system_errors
     set resolved_at = now()
     where provider = $1
       and surface = $2
       and content_type = $3
       and resolved_at is null`,
    [input.provider, input.surface, input.contentType]
  );
}
