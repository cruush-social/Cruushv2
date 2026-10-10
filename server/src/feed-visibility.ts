import type { FastifyInstance } from "fastify";
import { getViewerOutsideServiceArea } from "./profile-oos-visibility.js";

type FeedVisibilityApp = Pick<FastifyInstance, "config" | "db">;

/** Feed-only audience restriction, independent of profile visibility and author filters. */
export async function loadFeedHiddenAuthorIds(
  app: FeedVisibilityApp,
  viewerId: string,
  authorIds: string[],
  viewerOutsideServiceArea?: boolean
): Promise<Set<string>> {
  const ids = [...new Set(authorIds)].filter((id) => id !== viewerId);
  if (!ids.length) return new Set();
  const settings = await app.db.query<{ user_id: string }>(
    `select user_id::text as user_id from user_privacy_settings
      where user_id = any($1::uuid[]) and feed_hide_from_purgatory = true`,
    [ids]
  );
  if (!settings.rows.length) return new Set();
  // Active in-area MHC is allowed; unavailable/expired location is not.
  const outside = viewerOutsideServiceArea ?? await getViewerOutsideServiceArea(app, viewerId);
  return outside ? new Set(settings.rows.map((row) => row.user_id)) : new Set();
}
