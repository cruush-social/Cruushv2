import { z } from "zod";
import { multilineTextSchema, uuidSchema } from "./input-schema.js";

export const conversationTimerSchema = z.enum(["off", "24h", "7d", "30d"]);

export const createMessagePayloadSchema = z.object({
  conversationId: uuidSchema,
  content: multilineTextSchema({ min: 1, max: 4000 })
}).strict();

export const createMessagePhotoFieldsSchema = z.object({
  conversationId: uuidSchema,
  content: multilineTextSchema({ max: 4000 }).optional().default("")
}).strict();

export const openDirectConversationPayloadSchema = z.object({
  otherUserId: uuidSchema
}).strict();

export const createGroupConversationPayloadSchema = z.object({
  title: multilineTextSchema({ min: 1, max: 80 }),
  memberIds: z.array(uuidSchema).min(1).max(49),
  disappearingTimer: conversationTimerSchema.optional().default("off")
}).strict();

export const updateGroupConversationPayloadSchema = z.object({
  title: multilineTextSchema({ min: 1, max: 80 }).optional(),
  disappearingTimer: conversationTimerSchema.optional()
}).strict().refine((payload) => payload.title !== undefined || payload.disappearingTimer !== undefined, {
  message: "At least one group setting must be provided."
});

export const groupMemberPayloadSchema = z.object({
  userId: uuidSchema
}).strict();

export type CreateMessagePayload = z.infer<typeof createMessagePayloadSchema>;
export type CreateMessagePhotoFields = z.infer<typeof createMessagePhotoFieldsSchema>;
