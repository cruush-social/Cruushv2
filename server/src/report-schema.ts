import { z } from "zod";
import { multilineTextSchema, uuidSchema } from "./input-schema.js";

export const reportReasonSchema = z.enum([
  "non_consensual_imagery",
  "minor_safety",
  "impersonation",
  "coercion_trafficking",
  "illegal_activity",
  "spam_scam",
  "harassment",
  "hate",
  "violence_threat",
  "privacy_location",
  "other"
]);

export const createReportPayloadSchema = z.object({
  targetType: z.enum(["profile", "conversation", "message"]),
  targetUserId: uuidSchema.optional(),
  conversationId: uuidSchema.optional(),
  messageId: uuidSchema.optional(),
  reason: reportReasonSchema,
  details: multilineTextSchema({ max: 2000 }).optional().default("")
}).strict().superRefine((payload, ctx) => {
  if (payload.targetType === "profile" && !payload.targetUserId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Profile reports require targetUserId.",
      path: ["targetUserId"]
    });
  }

  if (payload.targetType === "conversation" && !payload.conversationId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Conversation reports require conversationId.",
      path: ["conversationId"]
    });
  }

  if (payload.targetType === "message" && !payload.messageId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Message reports require messageId.",
      path: ["messageId"]
    });
  }
});

export type CreateReportPayload = z.infer<typeof createReportPayloadSchema>;
export type ReportReason = z.infer<typeof reportReasonSchema>;
