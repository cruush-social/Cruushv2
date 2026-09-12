/**
 * Older account-removal flows replaced the display name with this marker and
 * left the account active. Migration 091 cleared those accounts' Feed posts;
 * the Feed, discovery and the profile route all treat the marker the same way,
 * so a tombstoned profile is never listed and never opens. Nothing here changes
 * the account itself.
 */
export const TOMBSTONE_DISPLAY_NAME = "user deleted profile";

/** SQL predicate for a profiles alias: true when the row is not a tombstone. */
export function notTombstonedSql(profileAlias: string) {
  return `lower(trim(coalesce(${profileAlias}.display_name, ''))) <> '${TOMBSTONE_DISPLAY_NAME}'`;
}

export function isTombstonedProfileName(displayName: string | null | undefined) {
  return (displayName ?? "").trim().toLowerCase() === TOMBSTONE_DISPLAY_NAME;
}
