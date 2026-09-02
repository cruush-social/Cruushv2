import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import type { AppConfig } from "./config.js";
import { encryptTextContent } from "./content-encryption.js";
import { createPool, type DbClient } from "./db.js";
import { loadSeedConfig } from "./dev-seed-profiles.js";

const DEVELOPMENT_VIEWER_EMAIL = "test-cruush-01@cruush.local";

export const DEVELOPMENT_PLACE_SEED_SLUGS = [
  "callen-lorde-chelsea",
  "callen-lorde-brooklyn",
  "henrietta-hudson",
  "cubbyhole",
  "gingers-bar",
  "stonewall-inn",
  "metropolitan-bar",
  "three-dollar-bill",
  "basement-nyc",
  "nowadays",
  "knockdown-center",
  "public-records"
] as const;

const RATING_CATEGORIES = [
  "overall",
  "gender_inclusivity",
  "lgbtq_friendliness",
  "safety",
  "accessibility",
  "cleanliness"
] as const;

const BOARD_MESSAGES = [
  "Easygoing crowd tonight. The quieter side has room to talk.",
  "Staff were kind and clear about accessibility when I asked.",
  "Good energy after work. It started filling up around 7.",
  "Quick visit today. The entrance and main room were comfortable.",
  "Community night is active. Friendly mix of regulars and new faces.",
  "Calm right now. A good time to stop by before the later rush.",
  "The board helped me pick a quieter hour. Leaving this note for the next person.",
  "Welcoming atmosphere today. I felt comfortable asking staff for help."
] as const;

type SeedUser = { id: string; email: string };
type SeedPlace = { id: string; slug: string };

export type DevelopmentPlaceSeedPlan = {
  messages: Array<{
    id: string;
    placeId: string;
    userId: string;
    content: string;
    createdAt: Date;
    expiresAt: null;
  }>;
  ratings: Array<{ placeId: string; userId: string; category: typeof RATING_CATEGORIES[number]; stars: number }>;
  checkins: Array<{ placeId: string; userId: string; visible: boolean; checkedInAt: Date; expiresAt: Date }>;
  activity: Array<{ placeId: string; bucketStart: Date; checkinCount: number }>;
};

function uuidFromSeed(seed: string) {
  const bytes = createHash("sha256").update(seed).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function isLocalDatabase(databaseUrl: string) {
  const hostname = new URL(databaseUrl).hostname.toLowerCase();
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

export function assertDevelopmentPlaceSeedConfig(config: Pick<AppConfig, "NODE_ENV" | "APP_DEPLOYMENT_STAGE" | "DATABASE_URL">) {
  if (config.NODE_ENV === "production" || config.APP_DEPLOYMENT_STAGE !== "development") {
    throw new Error("Refusing to seed Places outside development.");
  }
  if (!isLocalDatabase(config.DATABASE_URL)) {
    throw new Error("Refusing to seed Places into a non-local database.");
  }
}

export function buildDevelopmentPlaceSeedPlan(now: Date, users: SeedUser[], places: SeedPlace[]): DevelopmentPlaceSeedPlan {
  const availableUsers = users.filter((user) => user.email !== DEVELOPMENT_VIEWER_EMAIL);
  if (availableUsers.length < 8) {
    throw new Error("Seed at least 9 development profiles before seeding Places.");
  }
  if (places.length < 8) {
    throw new Error("Expected at least 8 published development Places.");
  }

  const messages = places.flatMap((place, placeIndex) => [0, 1].map((messageIndex) => {
    const user = availableUsers[(placeIndex * 2 + messageIndex) % availableUsers.length];
    const ageHours = placeIndex * 2 + messageIndex * 5 + 1;
    const createdAt = new Date(now.getTime() - ageHours * 60 * 60 * 1000);
    return {
      id: uuidFromSeed(`development-place-message:${place.slug}:${messageIndex}`),
      placeId: place.id,
      userId: user.id,
      content: BOARD_MESSAGES[(placeIndex + messageIndex) % BOARD_MESSAGES.length],
      createdAt,
      expiresAt: null
    };
  }));

  const ratingUsers = availableUsers.slice(0, 10);
  const ratings = places.flatMap((place, placeIndex) => ratingUsers.flatMap((user, userIndex) =>
    RATING_CATEGORIES.map((category, categoryIndex) => ({
      placeId: place.id,
      userId: user.id,
      category,
      stars: 3 + ((placeIndex + userIndex * 2 + categoryIndex) % 3)
    }))
  ));

  const checkins = availableUsers.slice(0, 12).map((user, index) => {
    const checkedInAt = new Date(now.getTime() - (5 + index * 3) * 60 * 1000);
    return {
      placeId: places[index % Math.min(5, places.length)].id,
      userId: user.id,
      visible: index % 3 === 0,
      checkedInAt,
      expiresAt: new Date(now.getTime() + (28 + (index % 5) * 6) * 60 * 1000)
    };
  });

  const activity = places.flatMap((place, placeIndex) => Array.from({ length: 28 }, (_, dayOffset) => {
    const bucketStart = new Date(now);
    bucketStart.setUTCDate(bucketStart.getUTCDate() - dayOffset);
    bucketStart.setUTCHours([12, 17, 20, 23][(placeIndex + dayOffset) % 4], 0, 0, 0);
    return {
      placeId: place.id,
      bucketStart,
      checkinCount: 3 + ((placeIndex * 3 + dayOffset) % 10)
    };
  }));

  return { messages, ratings, checkins, activity };
}

export async function seedDevelopmentPlacesWithDb(config: AppConfig, db: DbClient) {
  assertDevelopmentPlaceSeedConfig(config);
  const [userResult, placeResult] = await Promise.all([
    db.query<SeedUser>(
      `select id::text, email from app_users
       where email like 'test-cruush-%@cruush.local'
       order by email`
    ),
    db.query<SeedPlace>(
      `select id::text, slug from places
       where status = 'published' and slug = any($1::text[])
       order by array_position($1::text[], slug)`,
      [[...DEVELOPMENT_PLACE_SEED_SLUGS]]
    )
  ]);
  const plan = buildDevelopmentPlaceSeedPlan(new Date(), userResult.rows, placeResult.rows);

  await db.query("begin");
  try {
    for (const message of plan.messages) {
      const encrypted = encryptTextContent(config, "feed", message.content);
      await db.query(
        `insert into place_board_messages (
           id, place_id, user_id, content, content_ciphertext, content_nonce,
           content_auth_tag, content_key_version, created_at, expires_at
         ) values ($1, $2, $3, '[encrypted]', $4, $5, $6, $7, $8, $9)
         on conflict (id) do update set
           place_id = excluded.place_id,
           user_id = excluded.user_id,
           content = excluded.content,
           content_ciphertext = excluded.content_ciphertext,
           content_nonce = excluded.content_nonce,
           content_auth_tag = excluded.content_auth_tag,
           content_key_version = excluded.content_key_version,
           created_at = excluded.created_at,
           expires_at = excluded.expires_at`,
        [message.id, message.placeId, message.userId, encrypted.ciphertext, encrypted.nonce, encrypted.authTag, encrypted.keyVersion, message.createdAt, message.expiresAt]
      );
    }

    for (const rating of plan.ratings) {
      await db.query(
        `insert into place_ratings (place_id, user_id, category, stars)
         values ($1, $2, $3, $4)
         on conflict (place_id, user_id, category) do update
         set stars = excluded.stars, updated_at = now()`,
        [rating.placeId, rating.userId, rating.category, rating.stars]
      );
    }

    for (const checkin of plan.checkins) {
      await db.query(
        `insert into place_checkins (user_id, place_id, visible, checked_in_at, expires_at)
         values ($1, $2, $3, $4, $5)
         on conflict (user_id) do update set
           place_id = excluded.place_id,
           visible = excluded.visible,
           checked_in_at = excluded.checked_in_at,
           expires_at = excluded.expires_at`,
        [checkin.userId, checkin.placeId, checkin.visible, checkin.checkedInAt, checkin.expiresAt]
      );
    }

    for (const aggregate of plan.activity) {
      await db.query(
        `insert into place_activity_hourly (place_id, bucket_start, checkin_count)
         values ($1, $2, $3)
         on conflict (place_id, bucket_start) do update
         set checkin_count = excluded.checkin_count`,
        [aggregate.placeId, aggregate.bucketStart, aggregate.checkinCount]
      );
    }

    await db.query("commit");
    return {
      places: placeResult.rows.length,
      messages: plan.messages.length,
      ratings: plan.ratings.length,
      checkins: plan.checkins.length,
      popularTimeBuckets: plan.activity.length
    };
  } catch (error) {
    await db.query("rollback");
    throw error;
  }
}

export async function seedDevelopmentPlaces() {
  const config = loadSeedConfig();
  config.DATABASE_URL = process.env.DATABASE_URL || config.DATABASE_URL;
  config.SESSION_SECRET = process.env.SESSION_SECRET || config.SESSION_SECRET;
  config.FEED_ENCRYPTION_KEY = process.env.FEED_ENCRYPTION_KEY || config.FEED_ENCRYPTION_KEY;
  config.FEED_ENCRYPTION_KEY_VERSION = process.env.FEED_ENCRYPTION_KEY_VERSION || config.FEED_ENCRYPTION_KEY_VERSION;
  config.NODE_ENV = process.env.NODE_ENV === "production" || process.env.NODE_ENV === "test" ? process.env.NODE_ENV : config.NODE_ENV;
  config.APP_DEPLOYMENT_STAGE = process.env.APP_DEPLOYMENT_STAGE === "production" || process.env.APP_DEPLOYMENT_STAGE === "staging"
    ? process.env.APP_DEPLOYMENT_STAGE
    : config.APP_DEPLOYMENT_STAGE;
  const db = createPool(config);
  try {
    return await seedDevelopmentPlacesWithDb(config, db);
  } finally {
    await db.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const result = await seedDevelopmentPlaces();
    console.log(`Seeded ${result.places} Places with ${result.messages} board messages, ${result.ratings} ratings, ${result.checkins} active check-ins, and ${result.popularTimeBuckets} popular-time buckets.`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
