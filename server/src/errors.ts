import { ZodError } from "zod";

export type ErrorCode =
  | "ADDRESS_LOOKUP_FAILED"
  | "ALREADY_CLAIMED"
  | "ACCOUNT_SUSPENDED"
  | "ACCOUNT_UNDER_REVIEW"
  | "ALPHA_TEST_ENDED"
  | "ALPHA_TEST_PASSWORD_REQUIRED"
  | "AGE_VERIFICATION_REQUIRED"
  | "AUTH_REQUIRED"
  | "BETA_ACCESS_LOCATION_REQUIRED"
  | "BETA_ACCESS_OUTSIDE_RADIUS"
  | "CROWD_TARGET_NOT_MEMBER"
  | "CRUUSH_PLUS_REQUIRED"
  | "DAILY_QUEST_LIMIT"
  | "FEED_POSTING_LOW_TRUST"
  | "FEED_POSTING_RESTRICTED"
  | "FEED_POSTING_SUSPENDED"
  | "FEED_POSTING_UNAVAILABLE"
  | "EMAIL_TAKEN"
  | "EMAIL_VERIFICATION_REQUIRED"
  | "EVENT_CHAT_UNAVAILABLE"
  | "EVENT_PASS_UNAVAILABLE"
  | "EVENT_RADIUS_REQUIRED"
  | "TWO_FACTOR_REQUIRED"
  | "INVALID_TWO_FACTOR_CODE"
  | "CONTENT_REJECTED"
  | "CHECKIN_TOO_FAR"
  | "DUPLICATE_PLACE"
  | "FORBIDDEN"
  | "FEATURE_RESTRICTED"
  | "LOCATION_STORAGE_UNAVAILABLE"
  | "LOCATION_TOO_IMPRECISE"
  | "MODERATION_UNAVAILABLE"
  | "MUTUAL_CRUUSH_REQUIRED"
  | "NSFW_MESSAGES_RESTRICTED"
  | "NOT_FOUND"
  | "OFFER_ENDED"
  | "PASS_NOT_REVEALED"
  | "PLACE_CHECKIN_REQUIRED"
  | "RATE_LIMITED"
  | "QUEST_INCOMPLETE"
  | "REWARD_LIMIT"
  | "SIDE_QUEST_WEEKLY_LIMIT"
  | "OUTSIDE_SERVICE_AREA"
  | "STALE_LOCATION"
  | "SUGGESTION_UNAVAILABLE"
  | "VALIDATION_ERROR"
  | "INTERNAL_ERROR";

export class ApiError extends Error {
  readonly statusCode: number;
  readonly code: ErrorCode;
  readonly details?: unknown;

  constructor(statusCode: number, code: ErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export function formatError(error: ApiError) {
  return {
    error: {
      code: error.code,
      message: error.message,
      details: error.details ?? null
    }
  };
}

export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) {
    return error;
  }

  if (error instanceof ZodError) {
    return new ApiError(400, "VALIDATION_ERROR", "Request validation failed", error.flatten());
  }

  return new ApiError(500, "INTERNAL_ERROR", "Internal server error");
}
