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
  "survey",
  "unknown"
]);

const supportScreenshotSchema = z.object({
  filename: singleLineTextSchema({ min: 1, max: 120 }),
  contentType: z.enum(["image/jpeg", "image/png", "image/webp"]),
  contentBase64: z.string()
    .min(1)
    .max(5_000_000)
    .regex(/^[A-Za-z0-9+/]+={0,2}$/)
}).strict();

const supportDeviceSchema = z.object({
  model: singleLineTextSchema({ min: 1, max: 120 }).optional(),
  platform: singleLineTextSchema({ min: 1, max: 80 }).optional(),
  platformVersion: singleLineTextSchema({ min: 1, max: 80 }).optional(),
  mobile: z.boolean().optional()
}).strict();

export const createSupportRequestPayloadSchema = z.object({
  category: supportRequestCategorySchema,
  subject: singleLineTextSchema({ min: 3, max: 140 }),
  message: multilineTextSchema({ min: 10, max: 4000 }),
  contactEmail: optionalEmailSchema,
  source: supportRequestSourceSchema.optional().default("unknown"),
  pageUrl: singleLineTextSchema({ max: 1000 }).optional().default(""),
  device: supportDeviceSchema.optional(),
  screenshot: supportScreenshotSchema.optional()
}).strict();

export const generalSuspensionAppealPayloadSchema = z.object({
  contactEmail: optionalEmailSchema,
  message: multilineTextSchema({ min: 10, max: 4000 })
}).strict();

export const replySupportRequestPayloadSchema = z.object({
  message: multilineTextSchema({ min: 1, max: 4000 })
}).strict();

export type CreateSupportRequestPayload = z.infer<typeof createSupportRequestPayloadSchema>;
export type ReplySupportRequestPayload = z.infer<typeof replySupportRequestPayloadSchema>;
export type SupportRequestCategory = z.infer<typeof supportRequestCategorySchema>;
export type SupportRequestSource = z.infer<typeof supportRequestSourceSchema>;
