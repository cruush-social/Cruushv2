import { z } from "zod";
import { multilineTextSchema } from "./input-schema.js";

export const postExpirySchema = z.enum(["1h", "6h", "24h"]);

export const createPostPayloadSchema = z.object({
  content: multilineTextSchema({ min: 1, max: 1000 }),
  expiresIn: postExpirySchema.optional().default("6h")
}).strict();

export type CreatePostPayload = z.infer<typeof createPostPayloadSchema>;
