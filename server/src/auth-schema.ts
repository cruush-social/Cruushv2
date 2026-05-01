import { z } from "zod";

export const authEmailSchema = z.string().trim().email().max(320).transform((value) => value.toLowerCase());

export const signUpPayloadSchema = z.object({
  email: authEmailSchema,
  password: z.string().min(8).max(200),
  displayName: z.string().trim().min(2).max(80),
  captchaToken: z.string().trim().max(4096).optional()
}).strict();

export const signInPayloadSchema = z.object({
  email: authEmailSchema,
  password: z.string().min(1).max(200),
  captchaToken: z.string().trim().max(4096).optional()
}).strict();

export const verifyEmailPayloadSchema = z.object({
  token: z.string().trim().min(20).max(512)
}).strict();

export const forgotPasswordPayloadSchema = z.object({
  email: authEmailSchema
}).strict();

export const resetPasswordPayloadSchema = z.object({
  token: z.string().trim().min(20).max(512),
  password: z.string().min(8).max(200)
}).strict();

export const resendVerificationPayloadSchema = z.object({
  email: authEmailSchema,
  password: z.string().min(1).max(200)
}).strict();

export type SignUpPayload = z.infer<typeof signUpPayloadSchema>;
export type SignInPayload = z.infer<typeof signInPayloadSchema>;
