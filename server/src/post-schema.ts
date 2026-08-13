import { z } from "zod";
import { multilineTextSchema } from "./input-schema.js";
import { normalizeCrowdOption } from "./profile-sensitive.js";

export const postExpirySchema = z.enum(["1h", "6h", "24h", "7d", "never"]);
export const feedLocationPinVisibilitySchema = z.enum(["off", "mutuals", "same_crowd", "public"]);
export const feedWindowSchema = z.enum(["1h", "3h", "6h", "24h", "7d"]);

const crowdTargetsSchema = z.array(z.string()).optional().default([])
  .transform((values, ctx) => {
    const normalizedValues: string[] = [];

    for (const value of values) {
      const normalizedValue = normalizeCrowdOption(value);

      if (!normalizedValue) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Invalid crowd target."
        });
        return z.NEVER;
      }

      if (!normalizedValues.includes(normalizedValue)) {
        normalizedValues.push(normalizedValue);
      }
    }

    return normalizedValues;
  });

export const createPostPayloadSchema = z.object({
  content: multilineTextSchema({ min: 1, max: 1000 }),
  expiresIn: postExpirySchema.optional().default("never"),
  crowdTargets: crowdTargetsSchema
}).strict();

export const updateFeedSettingsPayloadSchema = z.object({
  locationPinVisibility: feedLocationPinVisibilitySchema,
  showDistanceLabels: z.boolean().optional().default(true),
  postExpiryDefault: postExpirySchema.optional(),
  feedWindow: feedWindowSchema.optional()
}).strict();

export type CreatePostPayload = z.infer<typeof createPostPayloadSchema>;
export type FeedLocationPinVisibility = z.infer<typeof feedLocationPinVisibilitySchema>;
export type PostExpiry = z.infer<typeof postExpirySchema>;
