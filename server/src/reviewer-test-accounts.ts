import { existsSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { hashPassword } from "./auth.js";
import { loadConfig, type AppConfig } from "./config.js";
import { createPool, type DbClient } from "./db.js";
import { syncDevelopmentLocationPrivacy } from "./development-admin.js";
import {
  buildEncryptedRelationshipPayload,
  getOrderedRelationshipUserIds,
  issueEncryptedRelationshipToken,
  upsertEncryptedRelationshipRecord
} from "./encrypted-relationships.js";
import { MATCH_PERMISSION_PURPOSE } from "./match-relationships.js";

export const REVIEWER_TEST_ACCOUNT_COUNT = 3;
const REVIEWER_TEST_GROUP_TITLE = "Bank/payment reviewer smoke group";
const REVIEWER_TEST_GROUP_TAGS = ["reviewer-test-fixture", "bank-payment-smoke"];
const MATCH_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
type ReviewerTestAccountPasswordConfigKey =
  | "REVIEWER_TEST_ACCOUNT_PASSWORD"
  | "PAYMENT_REVIEWER_TEST_ACCOUNT_PASSWORD";

type ReviewerSeedContext = {
  config: AppConfig;
  db: DbClient;
  seedConfig: ReviewerTestAccountSeedConfig;
};

type SeededReviewerAccount = {
  email: string;
  displayName: string;
  userId: string;
};

type ReviewerConversationFixture = {
  kind: "dm" | "group";
  conversationId: string;
  title?: string;
  memberEmails: string[];
};

export type ReviewerTestAccountSeedConfig = {
  NODE_ENV: AppConfig["NODE_ENV"];
  APP_URL: string;
  REVIEWER_TEST_ACCOUNTS_ENABLED?: string | boolean;
  REVIEWER_TEST_ACCOUNT_PASSWORD?: string;
  PAYMENT_REVIEWER_TEST_ACCOUNT_PASSWORD?: string;
};

export type ReviewerTestAccount = {
  email: string;
  displayName: string;
  passwordConfigKey: ReviewerTestAccountPasswordConfigKey;
  pronouns: string[];
  yearOfBirth: number;
  identities: string[];
  presentation: string[];
  sexuality: string[];
  lookingFor: string[];
  availability: string[];
  hostingTravel: string[];
  vibes: string[];
  position: string[];
  role: string[];
  lat: number;
  lng: number;
  fuzzyLat: number;
  fuzzyLng: number;
  updatedAt: Date;
};

function isEnabled(value: string | boolean | undefined) {
  if (typeof value === "boolean") {
    return value;
  }

  return ["1", "true", "yes", "on"].includes((value ?? "").trim().toLowerCase());
}

function isStagingAppUrl(appUrl: string) {
  try {
    const hostname = new URL(appUrl).hostname.toLowerCase();
    return hostname.includes("staging") || hostname.endsWith(".test") || hostname === "localhost" || hostname === "127.0.0.1";
  } catch {
    return false;
  }
}

export function assertReviewerTestAccountConfig(config: ReviewerTestAccountSeedConfig) {
  if (!isEnabled(config.REVIEWER_TEST_ACCOUNTS_ENABLED)) {
    throw new Error("Set REVIEWER_TEST_ACCOUNTS_ENABLED=true before seeding reviewer test accounts.");
  }

  if ((config.REVIEWER_TEST_ACCOUNT_PASSWORD ?? "").trim().length < 12) {
    throw new Error("Set REVIEWER_TEST_ACCOUNT_PASSWORD to a non-empty password with at least 12 characters.");
  }

  if ((config.PAYMENT_REVIEWER_TEST_ACCOUNT_PASSWORD ?? "").trim().length < 12) {
    throw new Error("Set PAYMENT_REVIEWER_TEST_ACCOUNT_PASSWORD to a non-empty password with at least 12 characters.");
  }

  if (config.NODE_ENV === "production" && !isStagingAppUrl(config.APP_URL)) {
    throw new Error("Refusing to seed reviewer test accounts on a production host. Use a staging APP_URL.");
  }
}

export function buildReviewerTestAccounts(now = new Date()): ReviewerTestAccount[] {
  return [
    {
      email: "codeveloper-nyc@cruush.local",
      displayName: "codev nyc",
      passwordConfigKey: "REVIEWER_TEST_ACCOUNT_PASSWORD",
      pronouns: ["they/them"],
      yearOfBirth: 1994,
      identities: ["Queer"],
      presentation: ["Alt"],
      sexuality: ["Queer"],
      lookingFor: ["Testing", "NYC beta"],
      availability: ["This week"],
      hostingTravel: ["Can Travel"],
      vibes: ["NYC beta", "spoof location", "codeveloper"],
      position: ["Versatile"],
      role: ["Switch"],
      lat: 40.7359,
      lng: -73.9911,
      fuzzyLat: 40.7363,
      fuzzyLng: -73.9905,
      updatedAt: now
    },
    {
      email: "bank-reviewer-nyc@cruush.local",
      displayName: "bank reviewer",
      passwordConfigKey: "REVIEWER_TEST_ACCOUNT_PASSWORD",
      pronouns: ["they/them"],
      yearOfBirth: 1991,
      identities: ["Queer"],
      presentation: ["Classic"],
      sexuality: ["Queer"],
      lookingFor: ["Testing", "Bank review"],
      availability: ["This week"],
      hostingTravel: ["Can Travel"],
      vibes: ["NYC beta", "spoof location", "bank review"],
      position: ["Versatile"],
      role: [],
      lat: 40.7336,
      lng: -74.0027,
      fuzzyLat: 40.7332,
      fuzzyLng: -74.0031,
      updatedAt: new Date(now.getTime() - 7 * 60 * 1000)
    },
    {
      email: "payment@cruush.local",
      displayName: "payment reviewer",
      passwordConfigKey: "PAYMENT_REVIEWER_TEST_ACCOUNT_PASSWORD",
      pronouns: ["they/them"],
      yearOfBirth: 1990,
      identities: ["Queer"],
      presentation: ["Classic"],
      sexuality: ["Queer"],
      lookingFor: ["Testing", "Payment review"],
      availability: ["This week"],
      hostingTravel: ["Can Travel"],
      vibes: ["NYC beta", "spoof location", "payment review"],
      position: ["Versatile"],
      role: [],
      lat: 40.7282,
      lng: -73.9942,
      fuzzyLat: 40.7286,
      fuzzyLng: -73.9938,
      updatedAt: new Date(now.getTime() - 14 * 60 * 1000)
    }
  ];
}

async function upsertReviewerTestAccount(context: ReviewerSeedContext, account: ReviewerTestAccount, passwordHash: string) {
  const userResult = await context.db.query<{ id: string }>(
    `insert into app_users (email, password_hash, display_name, email_verified_at)
     values ($1, $2, $3, now())
     on conflict (email) do update
     set password_hash = excluded.password_hash,
         display_name = excluded.display_name,
         email_verified_at = coalesce(app_users.email_verified_at, now())
     returning id::text as id`,
    [account.email, passwordHash, account.displayName]
  );
  const userId = userResult.rows[0]?.id;

  if (!userId) {
    throw new Error(`Unable to create ${account.email}.`);
  }

  await context.db.query(
    `insert into profiles (
       id,
       display_name,
       photos,
       pronouns,
       year_of_birth,
       identities,
       presentation,
       sexuality,
       looking_for,
       availability,
       hosting_travel,
       vibes,
       position,
       role,
       lat,
       lng,
       fuzzy_lat,
       fuzzy_lng,
       location_fuzz_radius_meters,
       location_updated_at,
       updated_at
     )
     values (
       $1, $2, $3, $4, $5, $6, $7, $8,
       $9, $10, $11, $12, $13, $14,
       $15, $16, $17, $18, $19, $20, $21
     )
     on conflict (id) do update
     set display_name = excluded.display_name,
         photos = excluded.photos,
         pronouns = excluded.pronouns,
         year_of_birth = excluded.year_of_birth,
         identities = excluded.identities,
         presentation = excluded.presentation,
         sexuality = excluded.sexuality,
         looking_for = excluded.looking_for,
         availability = excluded.availability,
         hosting_travel = excluded.hosting_travel,
         vibes = excluded.vibes,
         position = excluded.position,
         role = excluded.role,
         lat = excluded.lat,
         lng = excluded.lng,
         fuzzy_lat = excluded.fuzzy_lat,
         fuzzy_lng = excluded.fuzzy_lng,
         location_fuzz_radius_meters = excluded.location_fuzz_radius_meters,
         location_updated_at = excluded.location_updated_at,
         updated_at = excluded.updated_at`,
    [
      userId,
      account.displayName,
      [],
      account.pronouns,
      account.yearOfBirth,
      account.identities,
      account.presentation,
      account.sexuality,
      account.lookingFor,
      account.availability,
      account.hostingTravel,
      account.vibes,
      account.position,
      account.role,
      account.lat,
      account.lng,
      account.fuzzyLat,
      account.fuzzyLng,
      250,
      account.updatedAt,
      account.updatedAt
    ]
  );

  await syncDevelopmentLocationPrivacy(context, {
    userId,
    lat: account.lat,
    lng: account.lng,
    accuracyM: 250,
    deviceReportedAtMs: account.updatedAt.getTime()
  });
  await context.db.query(
    `insert into user_privacy_settings (user_id, ghost_mode_enabled, precise_location_visibility)
     values ($1, false, 'none')
     on conflict (user_id) do update
     set ghost_mode_enabled = false,
         precise_location_visibility = 'none',
         updated_at = now()`,
    [userId]
  );

  return userId;
}

function reviewerAccountByEmail(accounts: SeededReviewerAccount[], email: string) {
  const account = accounts.find((candidate) => candidate.email === email);

  if (!account) {
    throw new Error(`Missing seeded reviewer account ${email}.`);
  }

  return account;
}

function getReviewerDmKey(firstUserId: string, secondUserId: string) {
  return [firstUserId, secondUserId].sort().join(":");
}

async function ensureReviewerMutualMessagePermission(
  context: ReviewerSeedContext,
  firstUserId: string,
  secondUserId: string
) {
  const [userOneId, userTwoId] = getOrderedRelationshipUserIds(firstUserId, secondUserId);
  const match = await upsertEncryptedRelationshipRecord(context, buildEncryptedRelationshipPayload({
    type: "mutual_cruush",
    actorUserId: userOneId,
    targetUserId: userTwoId,
    createdAt: new Date(),
    metadata: {
      source: "reviewer-test-accounts"
    }
  }));

  if (!match) {
    throw new Error("Unable to create reviewer mutual cruush fixture.");
  }

  await issueEncryptedRelationshipToken(context, {
    relationshipRecordId: match.id,
    userOneId,
    userTwoId,
    purpose: MATCH_PERMISSION_PURPOSE,
    expiresAt: new Date(Date.now() + MATCH_TOKEN_TTL_MS)
  });
}

async function upsertReviewerDmFixture(
  context: ReviewerSeedContext,
  bankReviewer: SeededReviewerAccount,
  paymentReviewer: SeededReviewerAccount
): Promise<ReviewerConversationFixture> {
  const dmKey = getReviewerDmKey(bankReviewer.userId, paymentReviewer.userId);
  const result = await context.db.query<{ id: string }>(
    `insert into conversations (kind, dm_key, created_by, disappearing_timer)
     values ('dm', $1, $2, 'off')
     on conflict (dm_key) do update
     set updated_at = conversations.updated_at
     returning id::text as id`,
    [dmKey, bankReviewer.userId]
  );
  const conversationId = result.rows[0]?.id;

  if (!conversationId) {
    throw new Error("Unable to create reviewer DM fixture.");
  }

  await context.db.query(
    `insert into conversation_members (conversation_id, user_id, role, last_read_at)
     values ($1, $2, 'member', now()), ($1, $3, 'member', null)
     on conflict (conversation_id, user_id) do update
     set role = excluded.role`,
    [conversationId, bankReviewer.userId, paymentReviewer.userId]
  );

  return {
    kind: "dm",
    conversationId,
    memberEmails: [bankReviewer.email, paymentReviewer.email]
  };
}

async function upsertReviewerGroupFixture(
  context: ReviewerSeedContext,
  bankReviewer: SeededReviewerAccount,
  paymentReviewer: SeededReviewerAccount
): Promise<ReviewerConversationFixture> {
  const result = await context.db.query<{ id: string }>(
    `with existing_conversation as (
       select id
       from conversations
       where kind = 'group'
         and created_by = $1
         and tags @> $3::text[]
       limit 1
     ), inserted_conversation as (
       insert into conversations (kind, title, tags, created_by, disappearing_timer)
       select 'group', $2, $3::text[], $1, $4
       where not exists (select 1 from existing_conversation)
       returning id
     ), selected_conversation as (
       select id from inserted_conversation
       union all
       select id from existing_conversation
     )
     update conversations
     set title = $2,
         tags = $3::text[],
         disappearing_timer = $4,
         updated_at = now()
     where id = (select id from selected_conversation limit 1)
     returning id::text as id`,
    [bankReviewer.userId, REVIEWER_TEST_GROUP_TITLE, REVIEWER_TEST_GROUP_TAGS, "24h"]
  );
  const conversationId = result.rows[0]?.id;

  if (!conversationId) {
    throw new Error("Unable to create reviewer group fixture.");
  }

  await context.db.query(
    `insert into conversation_members (conversation_id, user_id, role, last_read_at)
     values ($1, $2, 'owner', now()), ($1, $3, 'member', null)
     on conflict (conversation_id, user_id) do update
     set role = excluded.role`,
    [conversationId, bankReviewer.userId, paymentReviewer.userId]
  );

  return {
    kind: "group",
    conversationId,
    title: REVIEWER_TEST_GROUP_TITLE,
    memberEmails: [bankReviewer.email, paymentReviewer.email]
  };
}

async function seedReviewerConversationFixtures(
  context: ReviewerSeedContext,
  accounts: SeededReviewerAccount[]
) {
  const bankReviewer = reviewerAccountByEmail(accounts, "bank-reviewer-nyc@cruush.local");
  const paymentReviewer = reviewerAccountByEmail(accounts, "payment@cruush.local");

  await ensureReviewerMutualMessagePermission(context, bankReviewer.userId, paymentReviewer.userId);

  return [
    await upsertReviewerDmFixture(context, bankReviewer, paymentReviewer),
    await upsertReviewerGroupFixture(context, bankReviewer, paymentReviewer)
  ];
}

export async function seedReviewerTestAccountsWithDb(context: ReviewerSeedContext) {
  assertReviewerTestAccountConfig(context.seedConfig);

  const accounts = buildReviewerTestAccounts();
  const passwordHashes: Record<ReviewerTestAccountPasswordConfigKey, string> = {
    REVIEWER_TEST_ACCOUNT_PASSWORD: await hashPassword(context.seedConfig.REVIEWER_TEST_ACCOUNT_PASSWORD ?? ""),
    PAYMENT_REVIEWER_TEST_ACCOUNT_PASSWORD: await hashPassword(context.seedConfig.PAYMENT_REVIEWER_TEST_ACCOUNT_PASSWORD ?? "")
  };
  const createdAccounts: Array<{ email: string; displayName: string; userId: string }> = [];

  await context.db.query("begin");

  try {
    for (const account of accounts) {
      const userId = await upsertReviewerTestAccount(context, account, passwordHashes[account.passwordConfigKey]);
      createdAccounts.push({
        email: account.email,
        displayName: account.displayName,
        userId
      });
    }

    const conversationFixtures = await seedReviewerConversationFixtures(context, createdAccounts);

    await context.db.query("commit");

    return {
      accountCount: accounts.length,
      accounts: createdAccounts,
      conversationFixtures
    };
  } catch (error) {
    await context.db.query("rollback");
    throw error;
  }
}

function parseEnvFile(contents: string) {
  const result: Record<string, string> = {};

  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();

    if (!line || line.startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");

    if (separatorIndex === -1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    let value = line.slice(separatorIndex + 1).trim();

    if (!key) {
      continue;
    }

    if (
      (value.startsWith("\"") && value.endsWith("\"")) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    result[key] = value;
  }

  return result;
}

function readEnvFile(url: URL) {
  if (!existsSync(url)) {
    return {};
  }

  return parseEnvFile(readFileSync(url, "utf8"));
}

export function loadReviewerSeedContext() {
  const serverEnv = {
    ...readEnvFile(new URL("../.env.example", import.meta.url)),
    ...readEnvFile(new URL("../.env", import.meta.url)),
    ...readEnvFile(new URL("../.env.local", import.meta.url)),
    ...process.env
  };
  const config = loadConfig(serverEnv);

  return {
    config,
    seedConfig: {
      NODE_ENV: config.NODE_ENV,
      APP_URL: config.APP_URL,
      REVIEWER_TEST_ACCOUNTS_ENABLED: serverEnv.REVIEWER_TEST_ACCOUNTS_ENABLED,
      REVIEWER_TEST_ACCOUNT_PASSWORD: serverEnv.REVIEWER_TEST_ACCOUNT_PASSWORD,
      PAYMENT_REVIEWER_TEST_ACCOUNT_PASSWORD: serverEnv.PAYMENT_REVIEWER_TEST_ACCOUNT_PASSWORD
    }
  };
}

export async function seedReviewerTestAccounts() {
  const { config, seedConfig } = loadReviewerSeedContext();
  const db = createPool(config);

  try {
    return await seedReviewerTestAccountsWithDb({ config, db, seedConfig });
  } finally {
    await db.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const result = await seedReviewerTestAccounts();
    console.log(
      `Seeded ${result.accountCount} reviewer accounts and ${result.conversationFixtures.length} conversation fixtures: ` +
      `${result.accounts.map((account) => account.email).join(", ")}.`
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
