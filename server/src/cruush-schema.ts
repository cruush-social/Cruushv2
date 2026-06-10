import { z } from "zod";
import { publicHttpsUrlSchema, singleLineTextSchema, uuidSchema } from "./input-schema.js";

const targetUserSchema = z.object({
  name: singleLineTextSchema({ min: 1, max: 120 }),
  pronouns: singleLineTextSchema({ max: 120 }).optional().default(""),
  photo: publicHttpsUrlSchema({
    message: "Photo URLs must be public HTTPS URLs."
  }).nullable().optional().default(null)
}).strict();

export const createCruushPayloadSchema = z.object({
  toUserId: uuidSchema,
  targetUser: targetUserSchema.optional()
}).strict();

export type CreateCruushPayload = z.infer<typeof createCruushPayloadSchema>;
