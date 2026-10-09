import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { getViewerOutsideServiceArea, loadOosHiddenProfileIds } from "./profile-oos-visibility.js";

export const PROFILE_ACTIVITY_NOTIFICATION_TYPES = [
  "incoming_cruush", "mutual_cruush", "nearby_activity", "nearby_user",
  "nearby_feed_post", "mutual_feed_post", "pulse"
] as const;

type VisibilityApp = Pick<FastifyInstance, "config" | "db">;
type ActivityNotification = {
  type: string;
  actor_user_id: string | null;
  conversation_id: string | null;
  metadata: Record<string, unknown> | string | null;
};

function metadataOf(value: ActivityNotification["metadata"]): Record<string, unknown> {
  if (typeof value !== "string") return value ?? {};
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function uuid(value: unknown) {
  const result = z.uuid().safeParse(value);
  return result.success ? result.data : null;
}

function isGroupPulseNotification(row: Pick<ActivityNotification, "type" | "conversation_id">) {
  return row.type === "pulse" && Boolean(row.conversation_id);
}

/** Group Pulse eligibility uses effective area, including the approved in-area MHC exception. */
export async function isGroupPulseEligible(
  app: VisibilityApp, viewerId: string, effectiveOutsideServiceArea?: boolean
): Promise<boolean> {
  const outside = effectiveOutsideServiceArea
    ?? await getViewerOutsideServiceArea(app, viewerId).catch(() => true);
  return !outside;
}

export function isProfileActivityNotification(row: Pick<ActivityNotification, "type" | "conversation_id">) {
  // Eligible group Pulses remain chat activity, exempt from profile-discovery VC.
  return !isGroupPulseNotification(row)
    && (PROFILE_ACTIVITY_NOTIFICATION_TYPES as readonly string[]).includes(row.type);
}

/** Re-evaluate stored activity too: enabling VC must hide previously queued activity. */
export async function filterOosHiddenNotifications<T extends ActivityNotification>(
  app: VisibilityApp, viewerId: string, rows: T[], viewerOutsideServiceArea?: boolean
): Promise<T[]> {
  const eligibleRows = rows.some(isGroupPulseNotification)
    && !await isGroupPulseEligible(app, viewerId, viewerOutsideServiceArea)
    ? rows.filter((row) => !isGroupPulseNotification(row)) : rows;
  const activity = eligibleRows.filter(isProfileActivityNotification);
  if (!activity.length) return eligibleRows;
  const viewerOos = viewerOutsideServiceArea ?? await getViewerOutsideServiceArea(app, viewerId);

  const sources = new Map<T, string>();
  const postIds = new Map<T, string>();
  for (const row of activity) {
    const metadata = metadataOf(row.metadata);
    const sourceId = uuid(row.actor_user_id) ?? uuid(metadata.sourceUserId);
    if (sourceId) sources.set(row, sourceId);
    else {
      const postId = uuid(metadata.postId);
      if (postId) postIds.set(row, postId);
    }
  }
  if (postIds.size) {
    const authors = await app.db.query<{ id: string; user_id: string }>(
      "select id::text as id, user_id::text as user_id from posts where id = any($1::uuid[])",
      [[...new Set(postIds.values())]]
    );
    const byPost = new Map(authors.rows.map((row) => [row.id, row.user_id]));
    for (const [row, postId] of postIds) {
      const author = byPost.get(postId);
      if (author) sources.set(row, author);
    }
  }
  const hidden = await loadOosHiddenProfileIds(app, viewerId, [...new Set(sources.values())], viewerOos);
  return eligibleRows.filter((row) => !isProfileActivityNotification(row)
    || (sources.has(row) ? !hidden.has(sources.get(row)!) : !viewerOos));
}
