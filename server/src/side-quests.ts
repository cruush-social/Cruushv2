import type { FastifyInstance } from "fastify";
import { runTransaction, type DbClient } from "./db.js";
import {
  listEncryptedRelationshipRecordsByActor,
  listEncryptedRelationshipRecordsByParticipant
} from "./encrypted-relationships.js";
import { ApiError } from "./errors.js";
import { loadRewardConfig } from "./reward-config.js";
import {
  calendarDateInTimeZone,
  grantPromotionalDaysInTransaction,
  normalizeTimeZone
} from "./rewards-service.js";

export const SIDE_QUEST_KEYS = [
  "upload_first_photo",
  "complete_profile",
  "upload_four_photos",
  "view_profile",
  "send_cruush",
  "send_ping",
  "first_mutual_cruush",
  "send_message",
  "send_three_messages",
  "post_feed",
  "post_three_feed",
  "check_in_spot",
  "post_spot_board",
  "rate_spot",
  "save_visibility_set"
] as const;

export type SideQuestKey = typeof SIDE_QUEST_KEYS[number];
type SideQuestRewardKind = "ping" | "cruush_plus_day";
const SIDE_QUEST_CRUUSH_PLUS_WEEKLY_LIMIT = 2;

type QuestDefinition = {
  key: SideQuestKey;
  title: string;
  rewardKind: SideQuestRewardKind;
  rewardAmount: number;
};

const QUESTS: QuestDefinition[] = [
  { key: "view_profile", title: "View a profile", rewardKind: "ping", rewardAmount: 1 },
  { key: "send_ping", title: "Send your first Pulse", rewardKind: "ping", rewardAmount: 1 },
  { key: "send_cruush", title: "Send your first cruush", rewardKind: "ping", rewardAmount: 1 },
  { key: "send_message", title: "Send your first message", rewardKind: "cruush_plus_day", rewardAmount: 1 },
  { key: "post_feed", title: "Make your first Feed post", rewardKind: "cruush_plus_day", rewardAmount: 1 },
  { key: "upload_first_photo", title: "Upload your first profile photo", rewardKind: "ping", rewardAmount: 1 },
  { key: "complete_profile", title: "Finish your profile", rewardKind: "ping", rewardAmount: 2 },
  { key: "upload_four_photos", title: "Upload four profile photos", rewardKind: "ping", rewardAmount: 3 },
  { key: "first_mutual_cruush", title: "Make your first mutual cruush", rewardKind: "cruush_plus_day", rewardAmount: 1 },
  { key: "send_three_messages", title: "Send three messages", rewardKind: "ping", rewardAmount: 2 },
  { key: "post_three_feed", title: "Make three Feed posts", rewardKind: "ping", rewardAmount: 2 },
  { key: "check_in_spot", title: "Check in at a Spot", rewardKind: "ping", rewardAmount: 1 },
  { key: "post_spot_board", title: "Post on a Spot board", rewardKind: "cruush_plus_day", rewardAmount: 1 },
  { key: "rate_spot", title: "Rate your first Spot", rewardKind: "ping", rewardAmount: 1 },
  { key: "save_visibility_set", title: "Save a Visibility set", rewardKind: "ping", rewardAmount: 2 }
];

type CompletionRow = Record<SideQuestKey, boolean> & { timezone: string | null };

function dateKey(value: string | Date) {
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
}

function weekStartDateKey(value: string | Date) {
  const date = new Date(`${dateKey(value)}T00:00:00.000Z`);
  const daysSinceMonday = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - daysSinceMonday);
  return date.toISOString().slice(0, 10);
}

async function loadCompletions(
  app: Pick<FastifyInstance, "config"> & { db: DbClient },
  userId: string
) {
  const row = (await app.db.query<CompletionRow>(
    `select
       coalesce(u.timezone, 'UTC') as timezone,
       exists (
         select 1 from profiles p where p.id = $1
           and nullif(trim(p.display_name), '') is not null
           and p.year_of_birth is not null
           and nullif(trim(p.bio), '') is not null
           and cardinality(p.pronouns) > 0
           and cardinality(p.identities) > 0
           and cardinality(p.looking_for) > 0
           and cardinality(p.vibes) > 0
       ) as complete_profile,
       exists (select 1 from profiles p where p.id = $1 and cardinality(p.photos) >= 1) as upload_first_photo,
       exists (select 1 from profiles p where p.id = $1 and cardinality(p.photos) >= 4) as upload_four_photos,
       exists (select 1 from profile_view_events profile_view where profile_view.viewer_user_id = $1) as view_profile,
       exists (select 1 from cruushes c where c.from_user_id = $1) as send_cruush,
       exists (select 1 from map_pings ping where ping.user_id = $1) as send_ping,
       exists (select 1 from cruush_matches match where match.revoked_at is null and (match.user_one_id = $1 or match.user_two_id = $1)) as first_mutual_cruush,
       exists (select 1 from messages m where m.user_id = $1) as send_message,
       (select count(*) from messages m where m.user_id = $1) >= 3 as send_three_messages,
       exists (select 1 from posts p where p.user_id = $1 and p.map_ping_id is null) as post_feed,
       (select count(*) from posts p where p.user_id = $1 and p.map_ping_id is null) >= 3 as post_three_feed,
       exists (select 1 from place_checkin_events e where e.user_id = $1) as check_in_spot,
       exists (select 1 from place_board_messages b where b.user_id = $1) as post_spot_board,
       exists (select 1 from place_ratings rating where rating.user_id = $1) as rate_spot,
       exists (select 1 from profile_visibility_sets visibility where visibility.user_id = $1) as save_visibility_set
     from app_users u where u.id = $1`,
    [userId]
  )).rows[0];

  if (!row) throw new ApiError(404, "NOT_FOUND", "Account not found.");

  if (!row.view_profile || !row.send_cruush || !row.first_mutual_cruush) {
    try {
      const [
        encryptedProfileViews,
        activeCruushes,
        removedCruushes,
        activeMutuals,
        removedMutuals
      ] = await Promise.all([
        row.view_profile ? [] : listEncryptedRelationshipRecordsByActor(app, {
          actorUserId: userId,
          type: "profile_view",
          limit: 1
        }),
        row.send_cruush ? [] : listEncryptedRelationshipRecordsByActor(app, {
          actorUserId: userId,
          type: "cruush",
          limit: 1
        }),
        row.send_cruush ? [] : listEncryptedRelationshipRecordsByActor(app, {
          actorUserId: userId,
          type: "removed_cruush",
          status: "removed",
          limit: 1
        }),
        row.first_mutual_cruush ? [] : listEncryptedRelationshipRecordsByParticipant(app, {
          participantUserId: userId,
          type: "mutual_cruush",
          limit: 1
        }),
        row.first_mutual_cruush ? [] : listEncryptedRelationshipRecordsByParticipant(app, {
          participantUserId: userId,
          type: "mutual_cruush",
          status: "removed",
          limit: 1
        })
      ]);
      row.view_profile ||= encryptedProfileViews.length > 0;
      row.send_cruush ||= activeCruushes.length > 0 || removedCruushes.length > 0;
      row.first_mutual_cruush ||= activeMutuals.length > 0 || removedMutuals.length > 0;
    } catch (error) {
      if (!(typeof error === "object" && error !== null && "code" in error && String((error as { code?: string }).code) === "42P01")) {
        throw error;
      }
    }
  }

  return row;
}

export async function getSideQuestPingBalance(db: DbClient, userId: string) {
  try {
    const row = (await db.query<{ balance: number | string }>(
      `select greatest(
         (select coalesce(sum(reward_amount), 0) from side_quest_claims where user_id = $1 and reward_kind = 'ping')
         + (select coalesce(sum(ping_count), 0) from ping_pack_purchases where user_id = $1)
         - (select count(*) from map_pings where user_id = $1 and coalesce((to_jsonb(map_pings)->>'bonus_credit_used')::boolean, false) = true),
         0
       )::int as balance`,
      [userId]
    )).rows[0];
    return Number(row?.balance ?? 0);
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && String((error as { code?: string }).code) === "42P01") {
      return 0;
    }
    throw error;
  }
}

export async function getSideQuests(app: Pick<FastifyInstance, "config" | "db">, userId: string) {
  const completion = await loadCompletions(app, userId);
  const claimDate = calendarDateInTimeZone(new Date(), normalizeTimeZone(completion.timezone));
  let claimingAvailable = true;
  let claimRows: Array<{ quest_key: SideQuestKey; reward_kind: SideQuestRewardKind; claim_date: string | Date; claimed_at: string | Date }> = [];

  try {
    claimRows = (await app.db.query<{ quest_key: SideQuestKey; reward_kind: SideQuestRewardKind; claim_date: string | Date; claimed_at: string | Date }>(
      `select quest_key, reward_kind, claim_date, claimed_at from side_quest_claims where user_id = $1`,
      [userId]
    )).rows;
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && String((error as { code?: string }).code) === "42P01") {
      claimingAvailable = false;
    } else {
      throw error;
    }
  }

  const pingCredits = await getSideQuestPingBalance(app.db, userId);
  const claimsByKey = new Map(claimRows.map((row) => [row.quest_key, row]));
  const weekStart = weekStartDateKey(claimDate);
  const cruushPlusClaimsThisWeek = claimRows.filter((row) => (
    row.reward_kind === "cruush_plus_day" && dateKey(row.claim_date) >= weekStart
  )).length;

  return {
    pingCredits,
    claimingAvailable,
    cruushPlusClaimsThisWeek,
    cruushPlusWeeklyLimit: SIDE_QUEST_CRUUSH_PLUS_WEEKLY_LIMIT,
    claimedToday: claimRows.some((row) => dateKey(row.claim_date) === claimDate),
    quests: QUESTS.map((quest) => ({
      ...quest,
      completed: completion[quest.key] === true,
      claimed: claimsByKey.has(quest.key),
      claimedAt: claimsByKey.get(quest.key)?.claimed_at ?? null
    }))
  };
}

export async function claimSideQuest(
  app: Pick<FastifyInstance, "db" | "config" | "log">,
  userId: string,
  questKey: SideQuestKey
) {
  const quest = QUESTS.find((candidate) => candidate.key === questKey);
  if (!quest) throw new ApiError(404, "NOT_FOUND", "Side Quest not found.");
  const config = await loadRewardConfig(app.db);

  await runTransaction(app.db, async (db) => {
    await db.query("select id from app_users where id = $1 for update", [userId]);
    const completion = await loadCompletions({ config: app.config, db }, userId);
    if (completion[quest.key] !== true) {
      throw new ApiError(409, "QUEST_INCOMPLETE", "Complete this Side Quest before claiming it.");
    }

    const claimDate = calendarDateInTimeZone(new Date(), normalizeTimeZone(completion.timezone));
    const alreadyClaimedToday = await db.query(
      `select 1 from side_quest_claims where user_id = $1 and claim_date = $2::date limit 1`,
      [userId, claimDate]
    );
    if (alreadyClaimedToday.rows[0]) {
      throw new ApiError(409, "DAILY_QUEST_LIMIT", "You can claim one Side Quest per day.");
    }

    if (quest.rewardKind === "cruush_plus_day") {
      const weekStart = weekStartDateKey(claimDate);
      const weeklyCruushPlusClaims = await db.query<{ count: number | string }>(
        `select count(*)::int as count from side_quest_claims
         where user_id = $1 and reward_kind = 'cruush_plus_day'
           and claim_date >= $2::date and claim_date < ($2::date + interval '7 days')`,
        [userId, weekStart]
      );
      if (Number(weeklyCruushPlusClaims.rows[0]?.count ?? 0) >= SIDE_QUEST_CRUUSH_PLUS_WEEKLY_LIMIT) {
        throw new ApiError(409, "SIDE_QUEST_WEEKLY_LIMIT", "This Side Quest reward is unavailable right now.");
      }

      const grant = await grantPromotionalDaysInTransaction(db, {
        userId,
        source: "admin",
        days: 1,
        idempotencyKey: `side-quest:${quest.key}:${userId}`,
        milestoneKey: `side-quest:${quest.key}`,
        auditMetadata: { sideQuest: quest.key }
      }, config);
      if (!grant) throw new ApiError(409, "REWARD_LIMIT", "This cruush+ day cannot be added right now.");
    }

    const inserted = await db.query(
      `insert into side_quest_claims (user_id, quest_key, reward_kind, reward_amount, claim_date)
       values ($1, $2, $3, $4, $5::date)
       on conflict (user_id, quest_key) do nothing
       returning quest_key`,
      [userId, quest.key, quest.rewardKind, quest.rewardAmount, claimDate]
    );
    if (!inserted.rows[0]) throw new ApiError(409, "ALREADY_CLAIMED", "Side Quest already claimed.");
  });

  return getSideQuests(app, userId);
}
