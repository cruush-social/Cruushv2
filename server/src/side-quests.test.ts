import { beforeEach, describe, expect, it, vi } from "vitest";
import { claimSideQuest, getSideQuests, SIDE_QUEST_KEYS } from "./side-quests.js";

const { grant } = vi.hoisted(() => ({ grant: vi.fn() }));
vi.mock("./reward-config.js", () => ({ loadRewardConfig: vi.fn(async () => ({})) }));
vi.mock("./rewards-service.js", async (importOriginal) => ({
  ...await importOriginal<typeof import("./rewards-service.js")>(),
  grantPromotionalDaysInTransaction: grant
}));

type Claim = { quest_key: string; reward_kind: string; reward_amount: number; claim_date: string; claimed_at: string };
function fixture(claims: Claim[] = []) {
  const completion = { ...Object.fromEntries(SIDE_QUEST_KEYS.map((key) => [key, true])), complete_profile: true, upload_four_photos: true, timezone: "UTC" };
  const query = vi.fn(async (sql: string, params: unknown[] = []) => {
    if (sql.includes("as complete_tutorial")) return { rows: [completion] };
    if (sql.includes("as balance")) return { rows: [{ balance: 0 }] };
    if (sql.includes("select quest_key, reward_kind")) return { rows: claims };
    if (sql.includes("select 1 from side_quest_claims")) return { rows: claims.filter((row) => row.claim_date === params[1]) };
    if (sql.includes("select count(*)::int as count from side_quest_claims")) return { rows: [{ count: 0 }] };
    if (sql.includes("insert into side_quest_claims")) {
      if (claims.some((row) => row.quest_key === params[1])) return { rows: [] };
      claims.push({ quest_key: String(params[1]), reward_kind: String(params[2]), reward_amount: Number(params[3]), claim_date: String(params[4]), claimed_at: new Date().toISOString() });
      return { rows: [{ quest_key: params[1] }] };
    }
    if (/^(begin|commit|rollback)$/.test(sql) || sql.includes("from app_users")) return { rows: [] };
    throw new Error(`Unexpected query: ${sql}`);
  });
  const app = { db: { query, end: vi.fn() }, config: {}, log: { error: vi.fn() } } as unknown as Parameters<typeof claimSideQuest>[0];
  return { app, completion, claims };
}

describe("initial Side Quests", () => {
  beforeEach(() => { vi.clearAllMocks(); grant.mockResolvedValue({ id: "grant-1", days: 1 }); });

  it("starts with Feed, profile and both photo quests, with one day for each", async () => {
    const { app } = fixture();
    const { quests } = await getSideQuests(app, "member-1");
    expect(quests.slice(0, 4).map(({ key, rewardKind, rewardAmount }) => ({ key, rewardKind, rewardAmount }))).toEqual([
      { key: "post_feed", rewardKind: "cruush_plus_day", rewardAmount: 1 },
      { key: "complete_profile", rewardKind: "cruush_plus_day", rewardAmount: 1 },
      { key: "upload_first_photo", rewardKind: "cruush_plus_day", rewardAmount: 1 },
      { key: "upload_four_photos", rewardKind: "cruush_plus_day", rewardAmount: 1 }
    ]);
    for (const key of ['send_ping', 'send_cruush', 'send_message', 'first_mutual_cruush', 'rate_spot']) {
      expect(quests.find(quest => quest.key === key)).toMatchObject({ rewardKind: 'cruush_plus_day', rewardAmount: 1 });
    }
    for (const key of ['send_three_messages', 'post_three_feed']) {
      expect(quests.find(quest => quest.key === key)).toMatchObject({ rewardKind: 'ping', rewardAmount: 2 });
    }
  });

  it("no longer lists the tutorial quest now that the tutorial is gone", async () => {
    const { app } = fixture();
    const { quests } = await getSideQuests(app, "member-1");
    expect(quests.some((quest) => quest.key === "complete_tutorial")).toBe(false);
  });

  it("keeps the actual reward on a previously claimed profile quest", async () => {
    const { app } = fixture([{ quest_key: "complete_profile", reward_kind: "ping", reward_amount: 2, claim_date: "2026-01-01", claimed_at: "2026-01-01T00:00:00Z" }]);
    const { quests } = await getSideQuests(app, "member-1");
    expect(quests.find((quest) => quest.key === "complete_profile")).toMatchObject({ claimed: true, rewardKind: "ping", rewardAmount: 2 });
    expect(grant).not.toHaveBeenCalled();
  });

  it.each(["complete_profile", "upload_four_photos"] as const)("requires %s completion and grants its day once through the existing claim path", async (questKey) => {
    const { app, completion, claims } = fixture();
    completion[questKey] = false;
    await expect(claimSideQuest(app, "member-1", questKey)).rejects.toMatchObject({ code: "QUEST_INCOMPLETE" });
    expect(grant).not.toHaveBeenCalled();
    completion[questKey] = true;
    await claimSideQuest(app, "member-1", questKey);
    expect(grant).toHaveBeenCalledWith(app.db, expect.objectContaining({ userId: "member-1", days: 1, idempotencyKey: `side-quest:${questKey}:member-1` }), {});
    expect(claims).toHaveLength(1);
    expect(claims[0]).toMatchObject({ reward_kind: "cruush_plus_day", reward_amount: 1 });
    await expect(claimSideQuest(app, "member-1", questKey)).rejects.toMatchObject({ code: "DAILY_QUEST_LIMIT" });
    expect(grant).toHaveBeenCalledTimes(1);
  });
});
