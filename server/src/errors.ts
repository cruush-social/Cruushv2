import { ZodError } from "zod";

export type ErrorCode =
  | "AUTH_REQUIRED"
  | "EMAIL_VERIFICATION_REQUIRED"
  | "FORBIDDEN"
  | "LOCATION_STORAGE_UNAVAILABLE"
  | "MUTUAL_CRUUSH_REQUIRED"
  | "NOT_FOUND"
  | "RATE_LIMITED"
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
