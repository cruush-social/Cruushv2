import { beforeEach, describe, expect, it, vi } from "vitest";
import { filterOosHiddenNotifications } from "./oos-notification-visibility.js";

const access = vi.hoisted(() => ({ getViewerOutsideServiceArea: vi.fn(), loadOosHiddenProfileIds: vi.fn() }));
vi.mock("./profile-oos-visibility.js", () => access);
const viewer = "11111111-1111-4111-8111-111111111111";
const hidden = "22222222-2222-4222-8222-222222222222";
const publicAuthor = "33333333-3333-4333-8333-333333333333";
const post = "44444444-4444-4444-8444-444444444444";
const query = vi.fn();
const app = { config: {}, db: { query } } as never;
function row(type: string, actor: string | null = hidden, metadata: Record<string, unknown> = {}, conversation_id: string | null = null) {
  return { type, actor_user_id: actor, metadata, conversation_id };
}

beforeEach(() => {
  vi.resetAllMocks();
  access.getViewerOutsideServiceArea.mockResolvedValue(true);
  access.loadOosHiddenProfileIds.mockResolvedValue(new Set([hidden]));
  query.mockResolvedValue({ rows: [] });
});

describe("Out of Sight activity notifications", () => {
  it("rechecks the Feed-only preference for stored/deferred Feed notices without hiding other activity", async () => {
    access.loadOosHiddenProfileIds.mockResolvedValue(new Set());
    query.mockImplementation(async (sql: string) => ({ rows: sql.includes("feed_hide_from_purgatory = true") ? [{ user_id: hidden }] : [] }));
    const rows = [row("mutual_feed_post"), row("nearby_feed_post"), row("incoming_cruush"), row("direct_message")];
    expect(await filterOosHiddenNotifications(app, viewer, rows)).toEqual(rows.slice(2));
    access.getViewerOutsideServiceArea.mockResolvedValue(false);
    expect(await filterOosHiddenNotifications(app, viewer, rows)).toEqual(rows);
  });
  it("filters hidden profile activity while retaining public activity", async () => {
    const rows = [row("incoming_cruush"), row("mutual_cruush"), row("pulse"), row("incoming_cruush", publicAuthor)];
    expect(await filterOosHiddenNotifications(app, viewer, rows)).toEqual([rows[3]]);
    expect(access.loadOosHiddenProfileIds).toHaveBeenCalledWith(app, viewer, [hidden, publicAuthor], true);
  });

  it("preserves existing DM and group chat activity without a visibility lookup", async () => {
    const rows = [row("direct_message"), row("group_message"), row("group_membership")];
    expect(await filterOosHiddenNotifications(app, viewer, rows)).toEqual(rows);
    expect(access.getViewerOutsideServiceArea).not.toHaveBeenCalled();
    expect(access.loadOosHiddenProfileIds).not.toHaveBeenCalled();
  });

  it("hides stored group Pulses for ineligible viewers without hiding ordinary chats", async () => {
    const rows = [row("direct_message"), row("group_message"), row("pulse", hidden, {}, post)];
    expect(await filterOosHiddenNotifications(app, viewer, rows)).toEqual(rows.slice(0, 2));
    expect(access.loadOosHiddenProfileIds).not.toHaveBeenCalled();
  });

  it("preserves eligible group Pulses despite the sender's hidden profile", async () => {
    access.getViewerOutsideServiceArea.mockResolvedValue(false);
    const rows = [row("pulse", hidden, {}, post)];
    expect(await filterOosHiddenNotifications(app, viewer, rows)).toEqual(rows);
    expect(access.loadOosHiddenProfileIds).not.toHaveBeenCalled();
  });

  it("fails closed for group Pulses when eligibility cannot be read", async () => {
    access.getViewerOutsideServiceArea.mockRejectedValue(new Error("Unavailable"));
    const rows = [row("group_message"), row("pulse", hidden, {}, post)];
    expect(await filterOosHiddenNotifications(app, viewer, rows)).toEqual([rows[0]]);
  });

  it("keeps activity for effective in-area viewers, including MHC", async () => {
    access.getViewerOutsideServiceArea.mockResolvedValue(false);
    access.loadOosHiddenProfileIds.mockResolvedValue(new Set());
    const rows = [row("incoming_cruush")];
    expect(await filterOosHiddenNotifications(app, viewer, rows)).toEqual(rows);
    expect(access.loadOosHiddenProfileIds).toHaveBeenCalledWith(app, viewer, [hidden], false);
  });

  it("hides activity with a known unreadable policy in-area, but keeps legacy unresolved sources", async () => {
    access.getViewerOutsideServiceArea.mockResolvedValue(false);
    // The shared helper marks a present but undecryptable encrypted policy hidden
    // even when the effective viewer location is in-area.
    const rows = [
      row("incoming_cruush"),
      row("nearby_feed_post", null, { postId: "not-a-uuid" }),
      row("announcement", null),
      row("pulse", hidden, {}, post)
    ];
    expect(await filterOosHiddenNotifications(app, viewer, rows)).toEqual(rows.slice(1));
    expect(access.loadOosHiddenProfileIds).toHaveBeenCalledWith(app, viewer, [hidden], false);
  });

  it("checks the server-only source of anonymous nearby notifications", async () => {
    const rows = [row("nearby_activity", null, { sourceUserId: hidden }), row("nearby_activity", null, { sourceUserId: publicAuthor })];
    expect(await filterOosHiddenNotifications(app, viewer, rows)).toEqual([rows[1]]);
  });

  it("resolves Feed authors without putting their identity in the notification payload", async () => {
    query.mockResolvedValue({ rows: [{ id: post, user_id: hidden }] });
    const rows = [row("mutual_feed_post", null, { postId: post }), row("nearby_feed_post", null, { postId: post })];
    expect(await filterOosHiddenNotifications(app, viewer, rows)).toEqual([]);
    expect(query.mock.calls[0][1]).toEqual([[post]]);
    expect(rows[0].actor_user_id).toBeNull();
  });

  it("fails closed for unresolvable activity but preserves announcements and rewards", async () => {
    const rows = [row("nearby_feed_post", null, { postId: "not-a-uuid" }), row("reward", null), row("announcement", null)];
    expect(await filterOosHiddenNotifications(app, viewer, rows)).toEqual(rows.slice(1));
    expect(query).not.toHaveBeenCalled();
  });
});
