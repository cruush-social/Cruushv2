import { z } from "zod";
import { authEmailSchema } from "./auth-schema.js";
import { multilineTextSchema, singleLineTextSchema } from "./input-schema.js";

const optionalEmailSchema = z.preprocess((value) => {
  if (typeof value === "string" && value.trim() === "") {
    return undefined;
  }

  return value;
}, authEmailSchema.optional());

export const supportRequestCategorySchema = z.enum([
  "bug",
  "comment",
  "question",
  "policy"
]);

export const supportRequestSourceSchema = z.enum([
  "auth",
  "settings",
  "policy",
  "unknown"
]);

export const createSupportRequestPayloadSchema = z.object({
  category: supportRequestCategorySchema,
  subject: singleLineTextSchema({ min: 3, max: 140 }),
  message: multilineTextSchema({ min: 10, max: 4000 }),
  contactEmail: optionalEmailSchema,
  source: supportRequestSourceSchema.optional().default("unknown"),
  pageUrl: singleLineTextSchema({ max: 1000 }).optional().default("")
}).strict();

export type CreateSupportRequestPayload = z.infer<typeof createSupportRequestPayloadSchema>;
export type SupportRequestCategory = z.infer<typeof supportRequestCategorySchema>;
export type SupportRequestSource = z.infer<typeof supportRequestSourceSchema>;
