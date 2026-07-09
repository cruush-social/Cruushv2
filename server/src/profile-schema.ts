import { z } from "zod";
import { multilineTextSchema, optionalSingleLineTextSchema, singleLineTextSchema } from "./input-schema.js";

const currentYear = new Date().getFullYear();

const shortStringField = optionalSingleLineTextSchema(120);
const arrayField = z.array(singleLineTextSchema({ min: 1, max: 120 })).max(25).optional().default([]);
const kinkArrayField = z.array(singleLineTextSchema({ min: 1, max: 120 })).max(50).optional().default([]);

const profileVisibilitySchema = z.enum(["public", "mutual_cruushes", "mutual_crowds"]);
const transStatusSchema = z.boolean().nullable().optional().default(null);
const crowdSchema = z.preprocess((value) => {
  if (typeof value !== "string") {
    return value;
  }

  const trimmedValue = value.trim();
  return trimmedValue === "Sapphic" ? "Dyke" : trimmedValue;
}, z.enum(["T4T", "Dyke", "Gay"]));
const visibilityArrayField = z.array(singleLineTextSchema({ min: 1, max: 120 })).max(50).optional().default([]);

function isPrivateIpv4(hostname: string) {
  const match = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);

  if (!match) {
    return false;
  }

  const octets = match.slice(1).map(Number);

  if (octets.some((octet) => octet < 0 || octet > 255)) {
    return false;
  }

  const [first, second] = octets;

  return (
    first === 10 ||
    first === 127 ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) ||
    (first === 169 && second === 254)
  );
}

function isUnsafePhotoHost(hostname: string) {
  const normalized = hostname.toLowerCase();

  return (
    normalized === "localhost" ||
    normalized === "metadata.google.internal" ||
    normalized === "169.254.169.254" ||
    normalized.endsWith(".local") ||
    isPrivateIpv4(normalized)
  );
}

const profilePhotoUrlSchema = z.string()
  .trim()
  .url()
  .max(2048)
  .refine((value) => {
    try {
      const url = new URL(value);

      return url.protocol === "https:" && !url.username && !url.password && !isUnsafePhotoHost(url.hostname);
    } catch {
      return false;
    }
  }, "Photo URLs must be public HTTPS URLs.");

const appOwnedProfilePhotoPathSchema = z.string()
  .trim()
  .max(256)
  .regex(
    /^\/(?:api\/media|media)\/profile-photos\/[0-9a-f-]{36}-[0-9a-f-]{8}-[0-9a-f-]{4}-[0-9a-f-]{4}-[0-9a-f-]{4}-[0-9a-f-]{12}\.(jpg|png|webp)$/i,
    "Photo paths must be uploaded Cruush profile photos."
  );

export const profileVisibilityRulesSchema = z.object({
  active_crowd_modes: z.array(crowdSchema).max(3).optional().default([]),
  age_range: z.tuple([
    z.number().int().min(18).max(99),
    z.number().int().min(18).max(99)
  ]).nullable().optional().default(null),
  distance: z.number().int().min(1).max(100).nullable().optional().default(null),
  identities: visibilityArrayField,
  presentations: visibilityArrayField,
  looking_for: visibilityArrayField,
  timing: visibilityArrayField,
  hosting: visibilityArrayField,
  vibes: visibilityArrayField,
  crowds: z.array(crowdSchema).max(3).optional().default([]),
  hobbies: visibilityArrayField,
  positions: visibilityArrayField,
  roles: visibilityArrayField,
  kinks: visibilityArrayField,
  body_types: visibilityArrayField,
  sexuality: visibilityArrayField,
  substance_boundaries: visibilityArrayField
}).strict().superRefine((rules, ctx) => {
  if (rules.age_range && rules.age_range[0] > rules.age_range[1]) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Visibility age range minimum cannot be greater than maximum.",
      path: ["age_range"]
    });
  }
});

export const profileKinkInterestSchema = z.object({
  kink_id: singleLineTextSchema({ min: 1, max: 120 }),
  label: singleLineTextSchema({ min: 1, max: 120 }).optional(),
  category: singleLineTextSchema({ min: 1, max: 120 }).optional()
}).strip();

export const profilePayloadSchema = z.object({
  display_name: singleLineTextSchema({ min: 2, max: 80 }),
  photos: z.array(z.union([profilePhotoUrlSchema, appOwnedProfilePhotoPathSchema])).max(4).optional().default([]),
  bio: multilineTextSchema({ max: 2000 }).optional().default(""),
  pronouns: arrayField,
  custom_pronouns: shortStringField,
  year_of_birth: z.number().int().min(currentYear - 120).max(currentYear - 18).nullable().optional().default(null),
  ethnicity: optionalSingleLineTextSchema(120),
  identities: arrayField,
  presentation: arrayField,
  sexuality: arrayField,
  body_type: arrayField,
  height: shortStringField,
  weight: shortStringField,
  position: arrayField,
  role: arrayField,
  is_trans: transStatusSchema,
  trans_status_visibility: profileVisibilitySchema.optional().default("mutual_cruushes"),
  crowds: z.array(crowdSchema).max(3).optional().default([]),
  availability: arrayField,
  hosting_travel: arrayField,
  kinks: kinkArrayField,
  kink_interests: z.array(profileKinkInterestSchema).max(50).optional().default([]),
  kinks_visibility: profileVisibilitySchema.optional().default("public"),
  vibes: arrayField,
  scenes: arrayField,
  archetypes: arrayField,
  hobbies: arrayField,
  custom_hobby: shortStringField,
  looking_for: arrayField,
  hiv_status: arrayField,
  hiv_status_visibility: profileVisibilitySchema.optional().default("mutual_cruushes"),
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
  substance_boundaries: arrayField,
  visibility_rules: profileVisibilityRulesSchema.optional().default({
    active_crowd_modes: [],
    age_range: null,
    distance: null,
    identities: [],
    presentations: [],
    looking_for: [],
    timing: [],
    hosting: [],
    vibes: [],
    crowds: [],
    hobbies: [],
    positions: [],
    roles: [],
    kinks: [],
    body_types: [],
    sexuality: [],
    substance_boundaries: []
  })
}).strict().superRefine((payload, ctx) => {
  if (payload.crowds.includes("T4T") && payload.is_trans !== true) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "T4T crowd membership requires trans status.",
      path: ["crowds"]
    });
  }

  if (payload.visibility_rules.active_crowd_modes.includes("T4T") && (payload.is_trans !== true || !payload.crowds.includes("T4T"))) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "T4T crowd mode requires trans status and T4T crowd membership.",
      path: ["visibility_rules", "active_crowd_modes"]
    });
  }

  for (const crowdMode of payload.visibility_rules.active_crowd_modes) {
    if (!payload.crowds.includes(crowdMode)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Crowd mode requires matching crowd membership.",
        path: ["visibility_rules", "active_crowd_modes"]
      });
      break;
    }
  }
});

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
  role: [],
  is_trans: null,
  trans_status_visibility: "mutual_cruushes",
  crowds: [],
  availability: [],
  hosting_travel: [],
  kinks: [],
  kink_interests: [],
  kinks_visibility: "public",
  vibes: [],
  scenes: [],
  archetypes: [],
  hobbies: [],
  custom_hobby: "",
  looking_for: [],
  hiv_status: [],
  hiv_status_visibility: "mutual_cruushes",
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
  substance_boundaries: [],
  visibility_rules: {
    active_crowd_modes: [],
    age_range: null,
    distance: null,
    identities: [],
    presentations: [],
    looking_for: [],
    timing: [],
    hosting: [],
    vibes: [],
    crowds: [],
    hobbies: [],
    positions: [],
    roles: [],
    kinks: [],
    body_types: [],
    sexuality: [],
    substance_boundaries: []
  }
} satisfies ProfilePayload;
