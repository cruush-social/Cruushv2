import { z } from "zod";
import { multilineTextSchema, optionalSingleLineTextSchema, singleLineTextSchema } from "./input-schema.js";

const currentYear = new Date().getFullYear();

function calendarDateParts(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return { year, month, day };
}

export function ageFromDateOfBirth(value: string, today = new Date()) {
  const birthDate = calendarDateParts(value);

  if (!birthDate) {
    return null;
  }

  const currentDate = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "numeric",
    day: "numeric"
  }).formatToParts(today).reduce<Record<string, number>>((parts, part) => {
    if (part.type === "year" || part.type === "month" || part.type === "day") {
      parts[part.type] = Number(part.value);
    }
    return parts;
  }, {});
  const currentYear = currentDate.year ?? today.getUTCFullYear();
  const currentMonth = currentDate.month ?? today.getUTCMonth() + 1;
  const currentDay = currentDate.day ?? today.getUTCDate();
  const birthdayHasPassed = currentMonth > birthDate.month ||
    (currentMonth === birthDate.month && currentDay >= birthDate.day);

  return currentYear - birthDate.year - (birthdayHasPassed ? 0 : 1);
}

export function birthYearFromDateOfBirth(value: string) {
  return calendarDateParts(value)?.year ?? null;
}

const adultDateOfBirthSchema = z.preprocess(
  (value) => typeof value === "string" ? value : "",
  z.string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Enter your complete date of birth.")
    .superRefine((value, ctx) => {
      const age = ageFromDateOfBirth(value);

      if (age === null || age < 0 || age > 120) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Enter a valid date of birth."
        });
      } else if (age < 18) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "You must be at least 18 to use cruush."
        });
      }
    })
);

const shortStringField = optionalSingleLineTextSchema(120);
const arrayField = z.array(singleLineTextSchema({ min: 1, max: 120 })).max(25).optional().default([]);
const cappedArrayField = (max: number) =>
  z.array(singleLineTextSchema({ min: 1, max: 120 }))
    .max(25)
    .optional()
    .default([])
    .transform((values) => {
      const seen = new Set<string>();
      const nextValues: string[] = [];

      for (let index = values.length - 1; index >= 0; index -= 1) {
        const value = values[index]?.trim();

        if (!value || seen.has(value)) {
          continue;
        }

        seen.add(value);
        nextValues.unshift(value);
      }

      return nextValues.slice(-max);
    });
const upToThreeArrayField = cappedArrayField(3);
const singleArrayField = cappedArrayField(1);
const kinkArrayField = upToThreeArrayField;

const profileVisibilitySchema = z.enum(["public", "mutual_cruushes", "mutual_crowds"]);
const healthPreferenceSchema = z.enum(["COVID tested", "Masks"]);
const birthControlSchema = z.enum([
  "Arm implant",
  "Ask me",
  "Condoms",
  "Hormonal",
  "IUD",
  "Prefer not to say",
  "Rhythm method",
  "Spermicide"
]);
const transStatusSchema = z.boolean().nullable().optional().default(null);
const crowdSchema = z.preprocess((value) => {
  if (typeof value !== "string") {
    return value;
  }

  const trimmedValue = value.trim();
  return trimmedValue === "Sapphic" ? "Dyke" : trimmedValue;
}, z.enum(["T4T", "Dyke", "Gay"]));
const visibilityArrayField = z.array(singleLineTextSchema({ min: 1, max: 120 })).max(50).optional().default([]);

const appOwnedProfilePhotoPathSchema = z.string()
  .trim()
  .max(256)
  .regex(
    /^\/api\/media\/(?:profile-photos\/[0-9a-f-]{36}-[0-9a-f-]{8}-[0-9a-f-]{4}-[0-9a-f-]{4}-[0-9a-f-]{4}-[0-9a-f-]{12}\.(?:jpg|png|webp)|assets\/[0-9a-f-]{36}\/display)$/i,
    "Photo paths must be uploaded cruush profile photos."
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
  photos: z.array(appOwnedProfilePhotoPathSchema).max(4).optional().default([]),
  bio: multilineTextSchema({ max: 2000 }).optional().default(""),
  signal: optionalSingleLineTextSchema(180),
  pronouns: upToThreeArrayField,
  custom_pronouns: shortStringField,
  year_of_birth: z.number().int().min(currentYear - 120).max(currentYear - 18).nullable().optional().default(null),
  date_of_birth: adultDateOfBirthSchema.optional(),
  ethnicity: optionalSingleLineTextSchema(120),
  identities: upToThreeArrayField,
  presentation: upToThreeArrayField,
  sexuality: upToThreeArrayField,
  body_type: upToThreeArrayField,
  height: shortStringField,
  weight: shortStringField,
  position: upToThreeArrayField,
  role: upToThreeArrayField,
  is_trans: transStatusSchema,
  trans_status_visibility: profileVisibilitySchema.optional().default("mutual_cruushes"),
  crowds: z.array(crowdSchema).max(3).optional().default([]),
  availability: upToThreeArrayField,
  hosting_travel: upToThreeArrayField,
  kinks: kinkArrayField,
  kink_interests: z.array(profileKinkInterestSchema).max(3).optional().default([]),
  kinks_visibility: profileVisibilitySchema.optional().default("public"),
  vibes: upToThreeArrayField,
  scenes: arrayField,
  archetypes: arrayField,
  hobbies: upToThreeArrayField,
  custom_hobby: shortStringField,
  looking_for: upToThreeArrayField,
  hiv_status: singleArrayField,
  hiv_status_visibility: profileVisibilitySchema.optional().default("mutual_cruushes"),
  custom_hiv_status: shortStringField,
  condoms: singleArrayField,
  custom_condoms: shortStringField,
  prep: singleArrayField,
  custom_prep: shortStringField,
  doxypep: singleArrayField,
  custom_doxypep: shortStringField,
  covid_vaccine: singleArrayField,
  custom_covid_vaccine: shortStringField,
  mpox_vaccine: singleArrayField,
  custom_mpox_vaccine: shortStringField,
  health_preferences: z.array(healthPreferenceSchema).max(2).optional().default([]),
  birth_control: z.array(birthControlSchema).max(8).optional().default([]),
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
  fuzz_radius_meters: z.number().int().min(0).max(500).optional().default(0),
  sync_reason: z.literal("PING").optional()
}).strict();

export type ProfileLocationPayload = z.infer<typeof profileLocationPayloadSchema>;

export const emptyProfile = {
  display_name: "",
  photos: [],
  bio: "",
  signal: "",
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
  health_preferences: [],
  birth_control: [],
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
