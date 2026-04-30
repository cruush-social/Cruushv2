import { z } from "zod";

const currentYear = new Date().getFullYear();

const stringField = z.string().trim().max(500).optional().default("");
const shortStringField = z.string().trim().max(120).optional().default("");
const arrayField = z.array(z.string().trim().min(1).max(120)).max(25).optional().default([]);

export const profilePayloadSchema = z.object({
  display_name: z.string().trim().min(2).max(80),
  photos: z.array(z.string().trim().url().max(2048)).max(9).optional().default([]),
  bio: z.string().trim().max(2000).optional().default(""),
  pronouns: arrayField,
  custom_pronouns: shortStringField,
  year_of_birth: z.number().int().min(currentYear - 120).max(currentYear - 18).nullable().optional().default(null),
  ethnicity: z.string().trim().max(120).optional().default(""),
  identities: arrayField,
  presentation: arrayField,
  sexuality: arrayField,
  body_type: arrayField,
  height: shortStringField,
  weight: shortStringField,
  position: arrayField,
  availability: arrayField,
  hosting_travel: arrayField,
  kinks: arrayField,
  vibes: arrayField,
  hobbies: arrayField,
  custom_hobby: shortStringField,
  looking_for: arrayField,
  hiv_status: arrayField,
  custom_hiv_status: shortStringField,
  condoms: arrayField,
  custom_condoms: shortStringField,
  prep: arrayField,
  custom_prep: shortStringField,
  doxypep: arrayField,
  custom_doxypep: shortStringField,
  covid_vaccine: arrayField,
  custom_covid_vaccine: shortStringField,
  mpox_vaccine: arrayField,
  custom_mpox_vaccine: shortStringField,
  smoking: arrayField,
  custom_smoking: shortStringField,
  drinking: arrayField,
  custom_drinking: shortStringField,
  drugs: arrayField,
  custom_drugs: shortStringField,
  weed: arrayField,
  custom_weed: shortStringField
}).strict();

export type ProfilePayload = z.infer<typeof profilePayloadSchema>;

export const profileLocationPayloadSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  fuzz_radius_meters: z.number().int().min(0).max(500).optional().default(0)
}).strict();

export type ProfileLocationPayload = z.infer<typeof profileLocationPayloadSchema>;

export const emptyProfile = {
  display_name: "",
  photos: [],
  bio: "",
  pronouns: [],
  custom_pronouns: "",
  year_of_birth: null,
  ethnicity: "",
  identities: [],
  presentation: [],
  sexuality: [],
  body_type: [],
  height: "",
  weight: "",
  position: [],
  availability: [],
  hosting_travel: [],
  kinks: [],
  vibes: [],
  hobbies: [],
  custom_hobby: "",
  looking_for: [],
  hiv_status: [],
  custom_hiv_status: "",
  condoms: [],
  custom_condoms: "",
  prep: [],
  custom_prep: "",
  doxypep: [],
  custom_doxypep: "",
  covid_vaccine: [],
  custom_covid_vaccine: "",
  mpox_vaccine: [],
  custom_mpox_vaccine: "",
  smoking: [],
  custom_smoking: "",
  drinking: [],
  custom_drinking: "",
  drugs: [],
  custom_drugs: "",
  weed: [],
  custom_weed: ""
} satisfies ProfilePayload;
