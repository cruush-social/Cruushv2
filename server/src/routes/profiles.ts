import type { FastifyInstance, FastifyReply } from "fastify";
import { ApiError } from "../errors.js";
import { emptyProfile, profilePayloadSchema, type ProfilePayload } from "../profile-schema.js";
import { getAuthenticatedUserId } from "../request-auth.js";

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
  availability: string[] | null;
  hosting_travel: string[] | null;
  kinks: string[] | null;
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
  smoking: string[] | null;
  custom_smoking: string | null;
  drinking: string[] | null;
  custom_drinking: string | null;
  drugs: string[] | null;
  custom_drugs: string | null;
  weed: string[] | null;
  custom_weed: string | null;
  updated_at: string | Date;
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
  "availability",
  "hosting_travel",
  "kinks",
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
  "smoking",
  "custom_smoking",
  "drinking",
  "custom_drinking",
  "drugs",
  "custom_drugs",
  "weed",
  "custom_weed"
] as const;

function mapProfileRow(row: ProfileRow) {
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
    availability: row.availability ?? [],
    hosting_travel: row.hosting_travel ?? [],
    kinks: row.kinks ?? [],
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
    smoking: row.smoking ?? [],
    custom_smoking: row.custom_smoking ?? "",
    drinking: row.drinking ?? [],
    custom_drinking: row.custom_drinking ?? "",
    drugs: row.drugs ?? [],
    custom_drugs: row.custom_drugs ?? "",
    weed: row.weed ?? [],
    custom_weed: row.custom_weed ?? "",
    updated_at: new Date(row.updated_at).toISOString()
  };
}

async function loadProfile(app: FastifyInstance, userId: string, reply: FastifyReply) {
  const result = await app.db.query<ProfileRow>(
    `select ${PROFILE_COLUMNS.join(", ")}, updated_at
     from profiles
     where id = $1`,
    [userId]
  );

  if (!result.rows[0]) {
    throw new ApiError(404, "NOT_FOUND", "Profile not found");
  }

  return reply.send({
    data: mapProfileRow(result.rows[0])
  });
}

export async function registerProfileRoutes(app: FastifyInstance) {
  app.get("/api/profiles/me", async (request, reply) => {
    const userId = getAuthenticatedUserId(request);
    return loadProfile(app, userId, reply);
  });

  app.put("/api/profiles/me", async (request, reply) => {
    const userId = getAuthenticatedUserId(request);
    const payload = profilePayloadSchema.parse(request.body);
    const values = PROFILE_COLUMNS.map((column) => {
      if (column === "id") {
        return userId;
      }

      if (column === "ethnicity") {
        return payload.ethnicity ? [payload.ethnicity] : [];
      }

      return payload[column as keyof ProfilePayload];
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

    return reply.send({
      data: mapProfileRow(result.rows[0])
    });
  });
}
