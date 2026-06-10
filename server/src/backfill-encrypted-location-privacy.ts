import { createPool, type DbClient } from "./db.js";
import { loadConfig, type AppConfig } from "./config.js";
import {
  DEFAULT_GHOST_RADIUS_METERS,
  saveVisibilityPolicy,
  storeLocationEnvelope,
  type VisibilityBaseMode
} from "./location-privacy.js";

type LegacyLocationRow = {
  id: string;
  lat: number | null;
  lng: number | null;
  location_updated_at: string | Date | null;
};

type LegacyPrivacyRow = {
  user_id: string;
  ghost_mode_enabled: boolean | null;
  precise_location_visibility: "none" | "mutual_cruushes" | null;
};

export type LocationPrivacyBackfillOptions = {
  apply?: boolean;
  purgeLegacyLocation?: boolean;
};

type BackfillContext = {
  config: AppConfig;
  db: Pick<DbClient, "query">;
};

async function countRows(db: Pick<DbClient, "query">, tableName: string) {
  try {
    const result = await db.query<{ count: string }>(`select count(*)::text as count from ${tableName}`);
    return Number(result.rows[0]?.count ?? 0);
  } catch {
    return 0;
  }
}

export async function getLocationPrivacyBackfillCounts(db: Pick<DbClient, "query">) {
  const [
    legacyLocations,
    legacyPrivacy,
    encryptedLocations,
    encryptedPolicies
  ] = await Promise.all([
    countRows(db, "profiles where lat is not null and lng is not null"),
    countRows(db, "user_privacy_settings"),
    countRows(db, "encrypted_location_envelopes"),
    countRows(db, "encrypted_visibility_tokens")
  ]);

  return {
    legacyLocations,
    legacyPrivacy,
    encryptedLocations,
    encryptedPolicies
  };
}

async function backfillLocations(context: BackfillContext) {
  const result = await context.db.query<LegacyLocationRow>(
    `select id::text as id, lat, lng, location_updated_at
     from profiles
     where lat is not null
       and lng is not null`
  );

  for (const row of result.rows) {
    if (row.lat == null || row.lng == null) {
      continue;
    }

    await storeLocationEnvelope(context, {
      subjectUserId: row.id,
      lat: row.lat,
      lng: row.lng,
      accuracyM: 0,
      source: "SYSTEM",
      deviceReportedAtMs: row.location_updated_at
        ? new Date(row.location_updated_at).getTime()
        : Date.now()
    });
  }

  return result.rows.length;
}

async function backfillPolicies(context: BackfillContext) {
  const result = await context.db.query<LegacyPrivacyRow>(
    `select user_id::text as user_id, ghost_mode_enabled, precise_location_visibility
     from user_privacy_settings`
  );

  for (const row of result.rows) {
    const baseMode: VisibilityBaseMode = row.ghost_mode_enabled === true ? "GHOST" : "PUBLIC_PRECISE";

    await saveVisibilityPolicy(context, row.user_id, {
      baseMode,
      ghostRadiusMeters: DEFAULT_GHOST_RADIUS_METERS,
      preciseToMutualCruushes: row.precise_location_visibility === "mutual_cruushes",
      preciseLocationVisibility: row.precise_location_visibility === "mutual_cruushes"
        ? "mutual_cruushes"
        : "none"
    });
  }

  return result.rows.length;
}

async function purgeLegacyLocationColumns(db: Pick<DbClient, "query">) {
  await db.query(
    `update profiles
     set lat = null,
         lng = null,
         fuzzy_lat = null,
         fuzzy_lng = null,
         location_fuzz_radius_meters = 0`
  );
}

export async function runLocationPrivacyBackfill(context: BackfillContext, options: LocationPrivacyBackfillOptions) {
  const before = await getLocationPrivacyBackfillCounts(context.db);

  if (!options.apply) {
    return {
      mode: "dry-run",
      before,
      written: {
        encryptedLocations: 0,
        encryptedPolicies: 0
      },
      purgedLegacyLocation: false,
      after: before
    };
  }

  const encryptedLocations = await backfillLocations(context);
  const encryptedPolicies = await backfillPolicies(context);

  if (options.purgeLegacyLocation) {
    await purgeLegacyLocationColumns(context.db);
  }

  return {
    mode: "apply",
    before,
    written: {
      encryptedLocations,
      encryptedPolicies
    },
    purgedLegacyLocation: options.purgeLegacyLocation === true,
    after: await getLocationPrivacyBackfillCounts(context.db)
  };
}

function parseOptions(argv: string[]): LocationPrivacyBackfillOptions {
  return {
    apply: argv.includes("--apply"),
    purgeLegacyLocation: argv.includes("--purge-legacy-location")
  };
}

if (process.argv[1]?.endsWith("backfill-encrypted-location-privacy.ts") || process.argv[1]?.endsWith("backfill-encrypted-location-privacy.js")) {
  const config = loadConfig();
  const pool = createPool(config);

  try {
    const result = await runLocationPrivacyBackfill({ config, db: pool }, parseOptions(process.argv.slice(2)));
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await pool.end();
  }
}
