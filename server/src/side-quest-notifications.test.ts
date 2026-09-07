import { beforeEach, describe, expect, it, vi } from "vitest";
import { notifyClaimableSideQuests } from "./side-quest-notifications.js";

const createAppNotificationAndPush = vi.fn(async () => ({ id: "notification-1" }));
const getSideQuests = vi.fn();

vi.mock("./notification-service.js", () => ({
  createAppNotificationAndPush: (...args: unknown[]) => createAppNotificationAndPush(...(args as [])),
}));

vi.mock("./side-quests.js", () => ({
  getSideQuests: (...args: unknown[]) => getSideQuests(...(args as [])),
}));

function quest(overrides: { completed: boolean; claimed: boolean }) {
  return { key: "view_profile", title: "View a profile", rewardKind: "ping", rewardAmount: 1, claimedAt: null, ...overrides };
}

function appWithMembers(userIds: string[]) {
  return {
    db: { query: vi.fn(async () => ({ rows: userIds.map((user_id) => ({ user_id })) })) },
    config: {} as never,
    log: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } as never,
  };
}

describe("notifyClaimableSideQuests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createAppNotificationAndPush.mockResolvedValue({ id: "notification-1" } as never);
  });

  it("sends a reward notification, which is the type members can switch off", async () => {
    getSideQuests.mockResolvedValue({
      claimingAvailable: true,
      quests: [quest({ completed: true, claimed: false }), quest({ completed: true, claimed: false })],
    } as never);

    const sent = await notifyClaimableSideQuests(appWithMembers(["user-1"]));

    expect(sent).toBe(1);
    const input = createAppNotificationAndPush.mock.calls[0][1] as unknown as {
      type: string;
      title: string;
      linkUrl: string;
      dedupeKey: string;
    };
    // 'reward' is what Reward updates in Notification settings gates, for the
    // push and for the in-app popup alike. Any other type would be unswitchable.
    expect(input.type).toBe("reward");
    expect(input.title).toBe("2 Side Quests are ready to claim");
    expect(input.linkUrl).toBe("/rewards");
    expect(input.dedupeKey).toMatch(/^side-quests-ready:user-1:\d{4}-\d{2}-\d{2}$/);
  });

  it("stays quiet when every finished quest is already claimed", async () => {
    getSideQuests.mockResolvedValue({
      claimingAvailable: true,
      quests: [quest({ completed: true, claimed: true }), quest({ completed: false, claimed: false })],
    } as never);

    const sent = await notifyClaimableSideQuests(appWithMembers(["user-1"]));

    expect(sent).toBe(0);
    expect(createAppNotificationAndPush).not.toHaveBeenCalled();
  });

  it("keeps sweeping after one member throws", async () => {
    getSideQuests
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce({
        claimingAvailable: true,
        quests: [quest({ completed: true, claimed: false })],
      } as never);

    const sent = await notifyClaimableSideQuests(appWithMembers(["user-1", "user-2"]));

    expect(sent).toBe(1);
    expect(createAppNotificationAndPush).toHaveBeenCalledTimes(1);
  });
});
