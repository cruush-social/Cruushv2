import { beforeEach, describe, expect, it, vi } from "vitest";
import { createAppNotification, getNotificationSummary } from "./notification-service.js";

const access = vi.hoisted(() => ({ getViewerOutsideServiceArea: vi.fn(), loadOosHiddenProfileIds: vi.fn() }));
vi.mock("./profile-oos-visibility.js", () => access);

const viewer = "11111111-1111-4111-8111-111111111111";
const unreadable = "22222222-2222-4222-8222-222222222222";
const valid = "33333333-3333-4333-8333-333333333333";
const conversation = "44444444-4444-4444-8444-444444444444";
const query = vi.fn();
const app = { config: {}, db: { query }, log: { warn: vi.fn() } } as never;

beforeEach(() => {
  vi.resetAllMocks();
  access.getViewerOutsideServiceArea.mockResolvedValue(false);
  access.loadOosHiddenProfileIds.mockResolvedValue(new Set([unreadable]));
});

describe("notification summary with an in-area viewer", () => {
  it("excludes unreadable-policy activity while retaining valid, unresolved and chat counts", async () => {
    query.mockResolvedValueOnce({ rows: [{ unread_count: 5 }] }).mockResolvedValueOnce({ rows: [
      { type: "incoming_cruush", actor_user_id: unreadable, conversation_id: null, metadata: {} },
      { type: "incoming_cruush", actor_user_id: valid, conversation_id: null, metadata: {} },
      { type: "nearby_feed_post", actor_user_id: null, conversation_id: null, metadata: {} },
      { type: "pulse", actor_user_id: unreadable, conversation_id: conversation, metadata: {} }
    ] });

    expect(await getNotificationSummary(app, viewer)).toEqual({ unreadCount: 4 });
    expect(access.loadOosHiddenProfileIds).toHaveBeenCalledWith(app, viewer, [unreadable, valid], false);
    expect(access.getViewerOutsideServiceArea).toHaveBeenCalledTimes(1);
  });

  it("does not persist profile activity from a known unreadable policy", async () => {
    expect(await createAppNotification(app, {
      userId: viewer, actorUserId: unreadable, type: "incoming_cruush", title: "Activity"
    })).toBeNull();
    expect(query).not.toHaveBeenCalled();
    expect(access.loadOosHiddenProfileIds).toHaveBeenCalledWith(app, viewer, [unreadable], false);
  });

  it("excludes group Pulse counts for an ineligible viewer but keeps ordinary chat counts", async () => {
    access.getViewerOutsideServiceArea.mockResolvedValue(true);
    query.mockResolvedValueOnce({ rows: [{ unread_count: 3 }] }).mockResolvedValueOnce({ rows: [
      { type: "pulse", actor_user_id: valid, conversation_id: conversation, metadata: {} }
    ] });
    expect(await getNotificationSummary(app, viewer)).toEqual({ unreadCount: 2 });
    expect(access.loadOosHiddenProfileIds).not.toHaveBeenCalled();
  });

  it("does not persist group Pulses for an ineligible recipient", async () => {
    access.getViewerOutsideServiceArea.mockResolvedValue(true);
    expect(await createAppNotification(app, {
      userId: viewer, actorUserId: valid, conversationId: conversation, type: "pulse", title: "Group Pulse"
    })).toBeNull();
    expect(query).not.toHaveBeenCalled();
  });
});
