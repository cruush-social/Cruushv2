import { z } from "zod";
import { multilineTextSchema, uuidSchema } from "./input-schema.js";

export const createMessagePayloadSchema = z.object({
  conversationId: uuidSchema,
  content: multilineTextSchema({ min: 1, max: 4000 })
}).strict();

export const openDirectConversationPayloadSchema = z.object({
  otherUserId: uuidSchema
}).strict();

export type CreateMessagePayload = z.infer<typeof createMessagePayloadSchema>;
