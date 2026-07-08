export type AccountStatus = "active" | "under_review" | "suspended" | "deleted";

const accountStatuses = new Set<AccountStatus>([
  "active",
  "under_review",
  "suspended",
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

