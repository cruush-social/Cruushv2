import { ApiError } from "./errors.js";

type ClientSecurityCheck = {
  startedAt: number;
  submittedAt: number;
  trap?: string;
};

const MIN_SUBMIT_DELAY_MS = 450;
const MAX_SUBMIT_DELAY_MS = 30 * 60 * 1000;
const MAX_CLOCK_SKEW_MS = 60 * 1000;

export function verifyClientSecurityCheck(check: ClientSecurityCheck | undefined) {
  if (!check) {
    return;
  }

  const now = Date.now();
  const elapsedMs = check.submittedAt - check.startedAt;

  if (check.trap?.trim()) {
    throw new ApiError(400, "VALIDATION_ERROR", "Security check failed. Refresh and try again.");
  }

  if (
    !Number.isFinite(elapsedMs) ||
    elapsedMs < MIN_SUBMIT_DELAY_MS ||
    elapsedMs > MAX_SUBMIT_DELAY_MS ||
    check.startedAt > now + MAX_CLOCK_SKEW_MS ||
    check.submittedAt > now + MAX_CLOCK_SKEW_MS
  ) {
    throw new ApiError(400, "VALIDATION_ERROR", "Security check failed. Refresh and try again.");
  }
}
