import { z } from "zod";

export const createMessagePayloadSchema = z.object({
  conversationId: z.string().trim().min(1).max(120),
  content: z.string().trim().min(1).max(4000)
}).strict();

export const openDirectConversationPayloadSchema = z.object({
  otherUserId: z.uuid()
}).strict();

export type CreateMessagePayload = z.infer<typeof createMessagePayloadSchema>;
