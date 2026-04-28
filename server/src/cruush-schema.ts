import { z } from "zod";

const targetUserSchema = z.object({
  name: z.string().trim().min(1).max(120),
  pronouns: z.string().trim().max(120).optional().default(""),
  photo: z.string().trim().url().max(2048).nullable().optional().default(null)
}).strict();

export const createCruushPayloadSchema = z.object({
  toUserId: z.string().trim().min(1).max(120),
  targetUser: targetUserSchema.optional()
}).strict();

export type CreateCruushPayload = z.infer<typeof createCruushPayloadSchema>;
