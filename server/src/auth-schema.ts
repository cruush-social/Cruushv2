import { z } from "zod";

export const authEmailSchema = z.string().trim().email().max(320).transform((value) => value.toLowerCase());

export const signUpPayloadSchema = z.object({
  email: authEmailSchema,
  password: z.string().min(8).max(200),
  displayName: z.string().trim().min(2).max(80)
}).strict();

export const signInPayloadSchema = z.object({
  email: authEmailSchema,
  password: z.string().min(1).max(200)
}).strict();

export type SignUpPayload = z.infer<typeof signUpPayloadSchema>;
export type SignInPayload = z.infer<typeof signInPayloadSchema>;
