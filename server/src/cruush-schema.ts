import { z } from "zod";
import { singleLineTextSchema, uuidSchema } from "./input-schema.js";

const targetUserSchema = z.object({
  name: singleLineTextSchema({ min: 1, max: 120 }),
  pronouns: singleLineTextSchema({ max: 120 }).optional().default(""),
  // Snapshot photo URLs are no longer stored. The field is still accepted so
  // older clients that send it keep working, but every value becomes null.
  photo: z.unknown().optional().transform((): null => null).default(null)
}).strict();

export const createCruushPayloadSchema = z.object({
  toUserId: uuidSchema,
  targetUser: targetUserSchema.optional()
}).strict();

export type CreateCruushPayload = z.infer<typeof createCruushPayloadSchema>;
