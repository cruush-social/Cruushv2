import type { FastifyInstance, FastifyReply } from "fastify";
import { ApiError } from "../errors.js";
import {
  emptyProfile,
  profileLocationPayloadSchema,
  profilePayloadSchema,
  type ProfilePayload
} from "../profile-schema.js";
import { getAuthenticatedUserId } from "../request-auth.js";
import { assertRateLimit } from "../rate-limit.js";

type ProfileRow = {
  id: string;
  display_name: string | null;
  photos: string[] | null;
  bio: string | null;
  pronouns: string[] | null;
  custom_pronouns: string | null;
  year_of_birth: number | null;
  ethnicity: string[] | null;
  identities: string[] | null;
  presentation: string[] | null;
  sexuality: string[] | null;
  body_type: string[] | null;
  height: string | null;
  weight: string | null;
  position: string[] | null;
  role: string[] | null;
  availability: string[] | null;
  hosting_travel: string[] | null;
  kinks: string[] | null;
  kinks_visibility: ProfileVisibility | null;
  vibes: string[] | null;
  hobbies: string[] | null;
  custom_hobby: string | null;
  looking_for: string[] | null;
  hiv_status: string[] | null;
  custom_hiv_status: string | null;
  condoms: string[] | null;
  custom_condoms: string | null;
  prep: string[] | null;
  custom_prep: string | null;
  doxypep: string[] | null;
  custom_doxypep: string | null;
  covid_vaccine: string[] | null;
  custom_covid_vaccine: string | null;
  mpox_vaccine: string[] | null;
  custom_mpox_vaccine: string | null;
  substance_boundaries: string[] | null;
  updated_at: string | Date;
};

type ProfileVisibility = "public" | "mutual_cruushes" | "mutual_crowds";

type ProfileKinkInterest = {
  kink_id: string;
  label?: string;
  category?: string;
};

type ProfileKinkInterestRow = {
  kink_id: string | null;
  label: string | null;
  category: string | null;
};

type ProfileLocationRow = {
  id: string;
  lat: number | null;
  lng: number | null;
  fuzzy_lat: number | null;
  fuzzy_lng: number | null;
  location_fuzz_radius_meters: number | null;
  location_updated_at: string | Date | null;
};

const PROFILE_COLUMNS = [
  "id",
  "display_name",
  "photos",
  "bio",
  "pronouns",
  "custom_pronouns",
  "year_of_birth",
  "ethnicity",
  "identities",
  "presentation",
  "sexuality",
  "body_type",
  "height",
  "weight",
  "position",
  "role",
  "availability",
  "hosting_travel",
  "kinks",
  "kinks_visibility",
  "vibes",
  "hobbies",
  "custom_hobby",
  "looking_for",
  "hiv_status",
  "custom_hiv_status",
  "condoms",
  "custom_condoms",
  "prep",
  "custom_prep",
  "doxypep",
  "custom_doxypep",
  "covid_vaccine",
  "custom_covid_vaccine",
  "mpox_vaccine",
  "custom_mpox_vaccine",
  "substance_boundaries"
] as const;

function toKinkId(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function legacyKinkToInterest(kink: string): ProfileKinkInterest | null {
  const kinkId = toKinkId(kink);

  if (!kinkId) {
    return null;
  }

  return {
    kink_id: kinkId,
    label: kink
  };
}

function mapKinkInterestRow(row: ProfileKinkInterestRow): ProfileKinkInterest | null {
  if (!row.kink_id) {
    return null;
  }

  return {
    kink_id: row.kink_id,
    label: row.label ?? row.kink_id,
    category: row.category ?? undefined
  };
}

function normalizeKinkInterests(payload: ProfilePayload): ProfileKinkInterest[] {
  const sourceInterests = payload.kink_interests.length > 0
    ? payload.kink_interests
    : payload.kinks.map((kink) => legacyKinkToInterest(kink)).filter((interest): interest is ProfileKinkInterest => Boolean(interest));
  const seen = new Set<string>();
  const interests: ProfileKinkInterest[] = [];

  for (const interest of sourceInterests) {
    const kinkId = toKinkId(interest.kink_id);

    if (!kinkId || seen.has(kinkId)) {
      continue;
    }

    seen.add(kinkId);
    interests.push({
      kink_id: kinkId,
      label: interest.label?.trim() || interest.kink_id,
      category: interest.category?.trim() || undefined
    });
  }

  return interests;
}

function isSchemaCompatibilityError(error: unknown) {
  const code = typeof error === "object" && error !== null && "code" in error
    ? String((error as { code?: string }).code)
    : "";

  if (["42703", "42P01", "42883", "22P02"].includes(code)) {
    return true;
  }

  const message = error instanceof Error ? error.message.toLowerCase() : "";
  return (
    message.includes("column") ||
    message.includes("relation") ||
    message.includes("operator does not exist") ||
    message.includes("does not exist")
  );
}

function mapProfileRow(
  row: ProfileRow,
  kinkInterests: ProfileKinkInterest[] = [],
  options: { showKinks?: boolean } = {}
) {
  const showKinks = options.showKinks ?? true;
  const legacyKinks = showKinks ? row.kinks ?? [] : [];
  const resolvedKinkInterests = kinkInterests.length > 0
    ? kinkInterests
    : legacyKinks
      .map((kink) => legacyKinkToInterest(kink))
      .filter((interest): interest is ProfileKinkInterest => Boolean(interest));

  return {
    id: row.id,
    ...emptyProfile,
    display_name: row.display_name ?? "",
    photos: row.photos ?? [],
    bio: row.bio ?? "",
    pronouns: row.pronouns ?? [],
    custom_pronouns: row.custom_pronouns ?? "",
    year_of_birth: row.year_of_birth,
    ethnicity: row.ethnicity?.[0] ?? "",
    identities: row.identities ?? [],
    presentation: row.presentation ?? [],
    sexuality: row.sexuality ?? [],
    body_type: row.body_type ?? [],
    height: row.height ?? "",
    weight: row.weight ?? "",
    position: row.position ?? [],
    role: row.role ?? [],
    availability: row.availability ?? [],
    hosting_travel: row.hosting_travel ?? [],
    kinks: resolvedKinkInterests.length > 0
      ? resolvedKinkInterests.map((interest) => interest.label ?? interest.kink_id)
      : legacyKinks,
    kink_interests: resolvedKinkInterests,
    kinks_visibility: row.kinks_visibility ?? "public",
    vibes: row.vibes ?? [],
    hobbies: row.hobbies ?? [],
    custom_hobby: row.custom_hobby ?? "",
    looking_for: row.looking_for ?? [],
    hiv_status: row.hiv_status ?? [],
    custom_hiv_status: row.custom_hiv_status ?? "",
    condoms: row.condoms ?? [],
    custom_condoms: row.custom_condoms ?? "",
    prep: row.prep ?? [],
    custom_prep: row.custom_prep ?? "",
    doxypep: row.doxypep ?? [],
    custom_doxypep: row.custom_doxypep ?? "",
    covid_vaccine: row.covid_vaccine ?? [],
    custom_covid_vaccine: row.custom_covid_vaccine ?? "",
    mpox_vaccine: row.mpox_vaccine ?? [],
    custom_mpox_vaccine: row.custom_mpox_vaccine ?? "",
    substance_boundaries: row.substance_boundaries ?? [],
    updated_at: new Date(row.updated_at).toISOString()
  };
}

function mapProfileLocationRow(row: ProfileLocationRow) {
  return {
    id: row.id,
    lat: row.lat,
    lng: row.lng,
    fuzzy_lat: row.fuzzy_lat,
    fuzzy_lng: row.fuzzy_lng,
    fuzz_radius_meters: row.location_fuzz_radius_meters ?? 0,
    location_updated_at: row.location_updated_at
      ? new Date(row.location_updated_at).toISOString()
      : null
  };
}

function clampCoordinate(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function createFuzzyCoordinates(lat: number, lng: number, radiusMeters: number) {
  if (radiusMeters <= 0) {
    return {
      fuzzyLat: lat,
      fuzzyLng: lng
    };
  }

  const angle = Math.random() * Math.PI * 2;
  const distance = Math.sqrt(Math.random()) * radiusMeters;
  const latOffset = (distance * Math.cos(angle)) / 111_320;
  const lngScale = Math.cos((lat * Math.PI) / 180);
  const lngOffset = lngScale === 0
    ? 0
    : (distance * Math.sin(angle)) / (111_320 * lngScale);

  return {
    fuzzyLat: clampCoordinate(lat + latOffset, -90, 90),
    fuzzyLng: clampCoordinate(lng + lngOffset, -180, 180)
  };
}

async function loadProfile(app: FastifyInstance, userId: string, reply: FastifyReply) {
  return reply.send({
    data: await loadProfileData(app, userId, { includePrivateKinks: true })
  });
}

async function loadProfileKinkInterests(app: FastifyInstance, userId: string) {
  try {
    const result = await app.db.query<ProfileKinkInterestRow>(
      `select
         pki.kink_id,
         kc.label,
         kc.category
       from profile_kink_interests pki
       join kink_catalog kc on kc.id = pki.kink_id
       where pki.user_id = $1
       order by kc.sort_order, kc.label`,
      [userId]
    );

    return (result?.rows ?? [])
      .map((row) => mapKinkInterestRow(row))
      .filter((interest): interest is ProfileKinkInterest => Boolean(interest));
  } catch (error) {
    if (isSchemaCompatibilityError(error)) {
      return [];
    }

    throw error;
  }
}

async function syncProfileKinkInterests(app: FastifyInstance, userId: string, kinkInterests: ProfileKinkInterest[]) {
  try {
    await app.db.query(
      "delete from profile_kink_interests where user_id = $1",
      [userId]
    );

    if (kinkInterests.length === 0) {
      return;
    }

    await app.db.query(
      `insert into profile_kink_interests (
         user_id,
         kink_id
       )
       select
         $1,
         interest.payload ->> 'kink_id'
       from jsonb_array_elements($2::jsonb) as interest(payload)
       where interest.payload ? 'kink_id'
       on conflict (user_id, kink_id) do update
       set updated_at = now()`,
      [
        userId,
        JSON.stringify(kinkInterests.map((interest) => ({
          kink_id: interest.kink_id
        })))
      ]
    );
  } catch (error) {
    if (isSchemaCompatibilityError(error)) {
      return;
    }

    throw error;
  }
}

async function loadProfileData(
  app: FastifyInstance,
  userId: string,
  options: { includePrivateKinks: boolean }
) {
  const result = await app.db.query<ProfileRow>(
    `select ${PROFILE_COLUMNS.join(", ")}, updated_at
     from profiles
     where id = $1`,
    [userId]
  );

  if (!result.rows[0]) {
    throw new ApiError(404, "NOT_FOUND", "Profile not found");
  }

  const row = result.rows[0];
  const showKinks = options.includePrivateKinks || (row.kinks_visibility ?? "public") === "public";
  const kinkInterests = showKinks
    ? await loadProfileKinkInterests(app, userId)
    : [];

  return mapProfileRow(row, kinkInterests, { showKinks });
}

export async function registerProfileRoutes(app: FastifyInstance) {
  app.get("/api/profiles/me", async (request, reply) => {
    const userId = await getAuthenticatedUserId(request);
    return loadProfile(app, userId, reply);
  });

  app.get("/api/profiles/:userId", async (request, reply) => {
    const authenticatedUserId = await getAuthenticatedUserId(request);
    assertRateLimit({
      key: `profile-read:${authenticatedUserId}`,
      max: 30,
      windowMs: 60 * 1000,
      message: "Too many profile requests. Try again later."
    });
    const { userId } = request.params as { userId: string };

    return reply.send({
      data: await loadProfileData(app, userId, { includePrivateKinks: false })
    });
  });

  app.put("/api/profiles/me", async (request, reply) => {
    const userId = await getAuthenticatedUserId(request);
    const payload = profilePayloadSchema.parse(request.body);
    const kinkInterests = normalizeKinkInterests(payload);
    const payloadForColumns: ProfilePayload = {
      ...payload,
      kinks: kinkInterests.map((interest) => interest.label ?? interest.kink_id),
      kink_interests: kinkInterests
    };
    const values = PROFILE_COLUMNS.map((column) => {
      if (column === "id") {
        return userId;
      }

      if (column === "ethnicity") {
        return payloadForColumns.ethnicity ? [payloadForColumns.ethnicity] : [];
      }

      return payloadForColumns[column as keyof ProfilePayload];
    });

    const placeholders = PROFILE_COLUMNS.map((_, index) => `$${index + 1}`);
    const updates = PROFILE_COLUMNS
      .filter((column) => column !== "id")
      .map((column) => `${column} = excluded.${column}`);

    const result = await app.db.query<ProfileRow>(
      `insert into profiles (${PROFILE_COLUMNS.join(", ")})
       values (${placeholders.join(", ")})
       on conflict (id) do update
       set ${updates.join(", ")}, updated_at = now()
       returning ${PROFILE_COLUMNS.join(", ")}, updated_at`,
      values
    );
    await syncProfileKinkInterests(app, userId, kinkInterests);

    return reply.send({
      data: mapProfileRow(result.rows[0], kinkInterests)
    });
  });

  app.put("/api/profiles/me/location", async (request, reply) => {
    const userId = await getAuthenticatedUserId(request);
    const payload = profileLocationPayloadSchema.parse(request.body);
    const fuzzyCoordinates = createFuzzyCoordinates(payload.lat, payload.lng, payload.fuzz_radius_meters);

    try {
      const result = await app.db.query<ProfileLocationRow>(
        `insert into profiles (
           id,
           lat,
           lng,
           fuzzy_lat,
           fuzzy_lng,
           location_fuzz_radius_meters,
           location_updated_at
         )
         values ($1, $2, $3, $4, $5, $6, now())
         on conflict (id) do update
         set lat = excluded.lat,
             lng = excluded.lng,
             fuzzy_lat = excluded.fuzzy_lat,
             fuzzy_lng = excluded.fuzzy_lng,
             location_fuzz_radius_meters = excluded.location_fuzz_radius_meters,
             location_updated_at = now(),
             updated_at = now()
         returning
           id::text as id,
           lat,
           lng,
           fuzzy_lat,
           fuzzy_lng,
           location_fuzz_radius_meters,
           location_updated_at`,
        [
          userId,
          payload.lat,
          payload.lng,
          fuzzyCoordinates.fuzzyLat,
          fuzzyCoordinates.fuzzyLng,
          payload.fuzz_radius_meters
        ]
      );

      return reply.send({
        data: mapProfileLocationRow(result.rows[0])
      });
    } catch (error) {
      if (isSchemaCompatibilityError(error)) {
        throw new ApiError(
          503,
          "LOCATION_STORAGE_UNAVAILABLE",
          "Location storage is unavailable until the latest database migrations run."
        );
      }

      throw error;
    }
  });
}
