import type { FastifyBaseLogger } from "fastify";
import { ApiError } from "./errors.js";
import type { AppConfig } from "./config.js";

type VerificationEmailInput = {
  config: AppConfig;
  email: string;
  logger: FastifyBaseLogger;
  verificationUrl: string;
};

export type VerificationDeliveryResult = {
  previewUrl: string | null;
};

export async function sendVerificationEmail(input: VerificationEmailInput): Promise<VerificationDeliveryResult> {
  const { config, email, logger, verificationUrl } = input;

  if (config.RESEND_API_KEY && config.MAIL_FROM) {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.RESEND_API_KEY}`
      },
      body: JSON.stringify({
        from: config.MAIL_FROM,
        to: [email],
        subject: "Verify your cruush email",
        html: `<p>Verify your email for cruush.</p><p><a href="${verificationUrl}">Verify email</a></p>`,
        text: `Verify your email for cruush: ${verificationUrl}`
      })
    });

    if (!response.ok) {
      const responseBody = await response.text();
      logger.error({ email, responseBody, statusCode: response.status }, "verification email delivery failed");
      throw new ApiError(502, "INTERNAL_ERROR", "Failed to send verification email.");
    }

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
