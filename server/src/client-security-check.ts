import { ApiError } from "./errors.js";

type ClientSecurityCheck = {
  startedAt: number;
  submittedAt: number;
  trap?: string;
};

const MIN_SUBMIT_DELAY_MS = 100;
const MAX_SUBMIT_DELAY_MS = 30 * 60 * 1000;

export function verifyClientSecurityCheck(check: ClientSecurityCheck | undefined) {
  if (!check) {
    return;
  }

  // Both timestamps come from the device. Compare their elapsed time, not
  // the device clock with the server clock; refreshing cannot fix clock skew.
  const elapsedMs = check.submittedAt - check.startedAt;

  if (check.trap?.trim()) {
    throw new ApiError(400, "VALIDATION_ERROR", "Security check failed. Refresh and try again.");
  }

  if (
    !Number.isFinite(elapsedMs) ||
    elapsedMs < MIN_SUBMIT_DELAY_MS ||
    elapsedMs > MAX_SUBMIT_DELAY_MS
  ) {
    throw new ApiError(400, "VALIDATION_ERROR", "Security check failed. Refresh and try again.");
  }
}
