import { randomBytes } from "node:crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { ApiError, type ErrorCode } from "./errors.js";

export const PHOTO_UPLOAD_REPORT_EMAIL = "reports@cruush.app";

// Errors that already explain themselves. The photo broke a rule, the account is
// limited, the file is too big, or the classifier is down and the answer is to
// retry. These are shown as-is: attaching an incident code would send known,
// expected outcomes to the reports inbox as noise.
const USER_ACTIONABLE_CODES = new Set<ErrorCode>([
  "CONTENT_REJECTED",
  "MODERATION_UNAVAILABLE",
  "FEATURE_RESTRICTED",
  "NSFW_MESSAGES_RESTRICTED",
  "MUTUAL_CRUUSH_REQUIRED",
  "ACCOUNT_UNDER_REVIEW",
  "VALIDATION_ERROR",
  "RATE_LIMITED",
  "AUTH_REQUIRED",
  "EMAIL_VERIFICATION_REQUIRED",
  "TWO_FACTOR_REQUIRED",
  "NOT_FOUND",
  "FORBIDDEN"
]);

export type PhotoUploadSurface = "profile_photo" | "message_photo" | "favorite_image";

function newIncidentCode() {
  // Short enough to read over the phone or paste into an email, random enough
  // not to collide across a beta's worth of uploads.
  return `PU-${randomBytes(3).toString("hex").toUpperCase()}`;
}

export function isUserActionableUploadError(error: unknown) {
  return error instanceof ApiError && USER_ACTIONABLE_CODES.has(error.code);
}

/**
 * Turns an unexpected photo-upload failure into an error the person can report.
 *
 * Moderation rejections and account limits pass through untouched - the person
 * already knows what to do about those. Everything else is a bug or an outage on
 * our side, so it gets a short code that is written to the logs and shown to the
 * user, which is the only way a beta tester can hand us something searchable.
 */
export function toReportablePhotoUploadError(
  app: FastifyInstance,
  request: FastifyRequest,
  error: unknown,
  context: { surface: PhotoUploadSurface; userId: string }
) {
  if (isUserActionableUploadError(error)) {
    return error;
  }

  const incidentCode = newIncidentCode();

  request.log.error(
    {
      err: error,
      incidentCode,
      surface: context.surface,
      userId: context.userId,
      stage: "photo_upload_incident"
    },
    "photo upload failed unexpectedly"
  );

  return new ApiError(
    500,
    "INTERNAL_ERROR",
    `Photo upload failed for a reason on our side. Error ${incidentCode} - send this code to ${PHOTO_UPLOAD_REPORT_EMAIL} and we can trace exactly what happened.`,
    { incidentCode, reportEmail: PHOTO_UPLOAD_REPORT_EMAIL }
  );
}
