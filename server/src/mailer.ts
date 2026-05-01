import type { FastifyBaseLogger } from "fastify";
import { ApiError } from "./errors.js";
import type { AppConfig } from "./config.js";

type VerificationEmailInput = {
  config: AppConfig;
  email: string;
  logger: FastifyBaseLogger;
  verificationUrl: string;
};

type PasswordResetEmailInput = {
  config: AppConfig;
  email: string;
  logger: FastifyBaseLogger;
  resetUrl: string;
};

export type VerificationDeliveryResult = {
  previewUrl: string | null;
};

async function sendResendEmail(input: {
  config: AppConfig;
  email: string;
  html: string;
  logger: FastifyBaseLogger;
  subject: string;
  text: string;
  failureMessage: string;
}) {
  const { config, email, failureMessage, html, logger, subject, text } = input;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.RESEND_API_KEY}`
    },
    body: JSON.stringify({
      from: config.MAIL_FROM,
      to: [email],
      subject,
      html,
      text
    })
  });

  if (!response.ok) {
    const responseBody = await response.text();
    logger.error({ email, responseBody, statusCode: response.status }, failureMessage);
    throw new ApiError(502, "INTERNAL_ERROR", "Failed to send email.");
  }
}

export async function sendVerificationEmail(input: VerificationEmailInput): Promise<VerificationDeliveryResult> {
  const { config, email, logger, verificationUrl } = input;

  if (config.RESEND_API_KEY && config.MAIL_FROM) {
    await sendResendEmail({
      config,
      email,
      logger,
      subject: "Verify your cruush email",
      html: `<p>Verify your email for cruush.</p><p><a href="${verificationUrl}">Verify email</a></p>`,
      text: `Verify your email for cruush: ${verificationUrl}`,
      failureMessage: "verification email delivery failed"
    });

    return {
      previewUrl: null
    };
  }

  if (config.NODE_ENV === "production") {
    throw new ApiError(500, "INTERNAL_ERROR", "Email delivery is not configured.");
  }

  logger.info({ email, verificationUrl }, "verification email preview");

  return {
    previewUrl: verificationUrl
  };
}

export async function sendPasswordResetEmail(input: PasswordResetEmailInput): Promise<VerificationDeliveryResult> {
  const { config, email, logger, resetUrl } = input;

  if (config.RESEND_API_KEY && config.MAIL_FROM) {
    await sendResendEmail({
      config,
      email,
      logger,
      subject: "Reset your cruush password",
      html: `<p>Reset your cruush password.</p><p><a href="${resetUrl}">Reset password</a></p><p>This link expires soon. If you did not request it, ignore this email.</p>`,
      text: `Reset your cruush password: ${resetUrl}`,
      failureMessage: "password reset email delivery failed"
    });

    return {
      previewUrl: null
    };
  }

  if (config.NODE_ENV === "production") {
    throw new ApiError(500, "INTERNAL_ERROR", "Email delivery is not configured.");
  }

  logger.info({ email, resetUrl }, "password reset email preview");

  return {
    previewUrl: resetUrl
  };
}
