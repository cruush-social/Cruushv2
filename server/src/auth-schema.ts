import { z } from "zod";
import { singleLineTextSchema } from "./input-schema.js";
import { ageFromDateOfBirth } from "./profile-schema.js";

export const authEmailSchema = z.string().trim().email().max(320).transform((value) => value.toLowerCase());

const clientSecurityCheckSchema = z.object({
  startedAt: z.number().int().nonnegative(),
  submittedAt: z.number().int().nonnegative(),
  trap: z.string().max(200).optional().default("")
}).strict();

const betaAccessLocationSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  accuracyMeters: z.number().nonnegative().max(100_000).optional()
}).strict();

export const adultDateOfBirthSchema = z.preprocess(
  (value) => typeof value === "string" ? value : "",
  z.string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Enter your complete date of birth.")
    .superRefine((value, ctx) => {
      const age = ageFromDateOfBirth(value);

      if (age === null || age < 0 || age > 120) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Enter a valid date of birth."
        });
      } else if (age < 18) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "You must be at least 18 to use cruush."
        });
      }
    })
);

export const signUpPayloadSchema = z.object({
  email: authEmailSchema,
  password: z.string().min(8).max(200),
  dateOfBirth: adultDateOfBirthSchema,
  termsAccepted: z.literal(true, { message: "Accept the Terms to create an account." }),
  privacyAccepted: z.literal(true, { message: "Accept the Privacy Policy to create an account." }),
  productUpdatesOptIn: z.boolean().default(false),
  displayName: singleLineTextSchema({ min: 2, max: 80 }).optional(),
  alphaPassword: z.string().trim().min(1).max(200).optional(),
  captchaToken: z.string().trim().max(4096).optional(),
  clientCheck: clientSecurityCheckSchema.optional(),
  referralCode: z.string().trim().regex(/^[A-Za-z0-9_-]{16,64}$/).optional(),
  betaAccessLocation: betaAccessLocationSchema.optional()
}).strict();

export const ageVerificationPayloadSchema = z.object({
  dateOfBirth: adultDateOfBirthSchema
}).strict();

export const signInPayloadSchema = z.object({
  email: authEmailSchema,
  password: z.string().min(1).max(200),
  captchaToken: z.string().trim().max(4096).optional(),
  clientCheck: clientSecurityCheckSchema.optional(),
  twoFactorCode: z.string().trim().min(6).max(64).optional(),
  betaAccessLocation: betaAccessLocationSchema.optional()
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

export const changePasswordPayloadSchema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: z.string().min(8).max(200)
}).strict();

export const deleteAccountPayloadSchema = z.object({
  password: z.string().min(1).max(200),
  confirmation: z.literal("DELETE")
}).strict();

export const resendVerificationPayloadSchema = z.object({
  email: authEmailSchema,
  password: z.string().min(1).max(200)
}).strict();

export type SignUpPayload = z.infer<typeof signUpPayloadSchema>;
export type SignInPayload = z.infer<typeof signInPayloadSchema>;
