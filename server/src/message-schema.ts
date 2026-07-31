import { z } from "zod";
import { multilineTextSchema, uuidSchema } from "./input-schema.js";

export const conversationTimerSchema = z.enum(["off", "1h", "24h", "7d", "30d"]);
export const MAX_GROUP_CONVERSATION_MEMBERS = 500;

const booleanishSchema = z.preprocess((value) => {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
  }

  return false;
}, z.boolean());

export const createMessagePayloadSchema = z.object({
  conversationId: uuidSchema,
  content: multilineTextSchema({ min: 1, max: 4000 })
}).strict();

export const createMessagePhotoFieldsSchema = z.object({
  conversationId: uuidSchema,
  content: multilineTextSchema({ max: 4000 }).optional().default(""),
  viewOnce: booleanishSchema.optional().default(false)
}).strict();

export const favoriteMessageImageUploadFieldsSchema = z.object({
  label: multilineTextSchema({ max: 80 }).optional().default("")
}).strict();

export const sendFavoriteMessageImagePayloadSchema = z.object({
  conversationId: uuidSchema,
  content: multilineTextSchema({ max: 4000 }).optional().default(""),
  viewOnce: booleanishSchema.optional().default(false)
}).strict();

export const openDirectConversationPayloadSchema = z.object({
  otherUserId: uuidSchema
}).strict();

export const createGroupConversationPayloadSchema = z.object({
  title: multilineTextSchema({ min: 1, max: 80 }),
  memberIds: z.array(uuidSchema).min(1).max(MAX_GROUP_CONVERSATION_MEMBERS - 1),
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
export type FavoriteMessageImageUploadFields = z.infer<typeof favoriteMessageImageUploadFieldsSchema>;
export type SendFavoriteMessageImagePayload = z.infer<typeof sendFavoriteMessageImagePayloadSchema>;
