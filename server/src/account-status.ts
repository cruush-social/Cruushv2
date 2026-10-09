export type AccountStatus = "active" | "under_review" | "suspended" | "banned" | "deleted";

const accountStatuses = new Set<AccountStatus>([
  "active",
  "under_review",
  "suspended",
  "banned",
  "deleted"
]);

export function normalizeAccountStatus(value: unknown): AccountStatus {
  return typeof value === "string" && accountStatuses.has(value as AccountStatus)
    ? value as AccountStatus
    : "active";
}

export function accountCanAuthenticate(value: unknown) {
  const status = normalizeAccountStatus(value);
  return status === "active" || status === "under_review";
}

export function accountCanPerformUnsafeAction(value: unknown) {
  return normalizeAccountStatus(value) === "active";
}

export function accountIsPermanentlyBanned(value: unknown) {
  return normalizeAccountStatus(value) === "banned";
}
