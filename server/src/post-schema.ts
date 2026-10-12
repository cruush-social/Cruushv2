import { z } from "zod";
import { multilineTextSchema } from "./input-schema.js";
import { normalizeCrowdOption } from "./profile-sensitive.js";

export const postExpirySchema = z.enum(["30m", "1h", "3h", "6h", "12h", "24h", "2d", "3d", "5d", "7d", "8d", "9d", "10d", "11d", "12d", "13d", "14d", "15d", "16d", "17d", "18d", "19d", "20d", "21d", "22d", "23d", "24d", "25d", "26d", "27d", "28d", "29d", "30d", "never"]);
export const feedPostAudienceSchema = z.enum(["public", "mutuals", "crowd"]);
export const feedLocationPinVisibilitySchema = z.enum(["off", "mutuals", "same_crowd", "public"]);
// Never removes the post-age cutoff; post expiry remains a separate setting.
export const feedWindowSchema = z.enum(["1h", "3h", "6h", "24h", "7d", "8d", "9d", "10d", "11d", "12d", "13d", "14d", "15d", "16d", "17d", "18d", "19d", "20d", "21d", "22d", "23d", "24d", "25d", "26d", "27d", "28d", "29d", "30d", "never"]);

export const crowdTargetsSchema = z.array(z.string()).optional().default([])
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

/** Tags are a cruush+ feature; the route rejects any tag from a basic account. */
export const MAX_FEED_POST_TAGS = 10;

const feedPostTagsSchema = z.array(
  z.string().trim().regex(/^#?[a-zA-Z0-9_]{1,24}$/, "Tags can use letters, numbers, and underscores."),
).max(MAX_FEED_POST_TAGS).optional().default([]).transform((values) => (
  [...new Set(values.map((value) => value.replace(/^#/, "").toLowerCase()))]
));

export const createPostPayloadSchema = z.object({
  content: multilineTextSchema({ min: 1, max: 1000 }),
  expiresIn: postExpirySchema.optional().default("never"),
  audience: feedPostAudienceSchema.optional().default("public"),
  showDistance: z.boolean().optional().default(true),
  crowdTargets: crowdTargetsSchema,
  photoMediaIds: z.array(z.uuid()).max(3).optional().default([]),
  tags: feedPostTagsSchema
}).strict().superRefine((payload, ctx) => {
  if (new Set(payload.photoMediaIds).size !== payload.photoMediaIds.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["photoMediaIds"],
      message: "Choose each Confessional photo once."
    });
  }

  if (payload.audience === "crowd" && payload.crowdTargets.length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["crowdTargets"],
      message: "Pick at least one Crowd to post to, or choose a different audience."
    });
  }

  if (payload.audience !== "crowd" && payload.crowdTargets.length > 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["crowdTargets"],
      message: "Crowd targets require the Crowd audience."
    });
  }
});

export const updateFeedSettingsPayloadSchema = z.object({
  locationPinVisibility: feedLocationPinVisibilitySchema,
  hideFromPurgatory: z.boolean().optional(),
  showDistanceLabels: z.boolean().optional().default(true),
  postExpiryDefault: postExpirySchema.optional(),
  feedWindow: feedWindowSchema.optional()
}).strict();

export type CreatePostPayload = z.infer<typeof createPostPayloadSchema>;
export type FeedLocationPinVisibility = z.infer<typeof feedLocationPinVisibilitySchema>;
export type FeedPostAudience = z.infer<typeof feedPostAudienceSchema>;
export type PostExpiry = z.infer<typeof postExpirySchema>;
