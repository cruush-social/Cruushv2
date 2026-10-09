import { z } from "zod";
import { profileVisibilityRulesSchema } from "./profile-schema.js";

const clubVisibilityRulesSchema = profileVisibilityRulesSchema.refine(
  (rules) => rules.outside_service_area_members === false,
  { path: ["outside_service_area_members"], message: "Purgatory member visibility applies to member profiles, not Clubs." }
);

const normalizeTags = (values: string[]) => Array.from(new Set(
  values
    .flatMap((value) => value.split(","))
    .map((tag) => tag.normalize("NFKC").trim().replace(/^#+/, "").toLowerCase())
    .filter(Boolean)
));

const normalizedTagsSchema = z.array(z.string())
  .transform(normalizeTags)
  .pipe(z.array(z.string().regex(/^[a-z0-9_]{1,24}$/)).min(1).max(10));

export const clubDirectoryQuerySchema = z.object({
  q: z.string().trim().max(120).optional()
    .transform((value) => value?.normalize("NFKC").toLowerCase() ?? ""),
  tags: z.string().optional()
    .transform((value) => value ? normalizeTags([value]) : [])
    .pipe(z.array(z.string().min(1).max(64)).max(10)),
  sort: z.enum(["recent", "nearby"]).optional().default("recent")
}).strict();

export const clubParamsSchema = z.object({
  clubId: z.uuid()
}).strict();

const clubMetadataShape = {
  title: z.string().trim().min(1).max(120),
  summary: z.string().trim().max(1000),
  tags: normalizedTagsSchema
};

export const createClubPayloadSchema = z.object({
  ...clubMetadataShape,
  visibilityRules: clubVisibilityRulesSchema.optional(),
  memberIds: z.array(z.uuid()).max(999)
    .transform((ids) => Array.from(new Set(ids)))
}).strict();

export const updateClubPayloadSchema = z.object(clubMetadataShape).strict();

export const clubVisibilityPayloadSchema = z.object({
  visibilityRules: clubVisibilityRulesSchema
}).strict();

export const reviewClubJoinRequestParamsSchema = clubParamsSchema.extend({
  requesterUserId: z.uuid()
}).strict();

export const reviewClubJoinRequestPayloadSchema = z.object({
  decision: z.enum(["approve", "deny"])
}).strict();
