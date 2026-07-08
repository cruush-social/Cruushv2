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

export type TrustSafetyAlertIncident = {
  id: string;
  userId: string;
  userEmail: string | null;
  surface: string;
  environment: string;
  testMode: boolean;
  providerRequestId: string | null;
  createdAt: string;
  internalReviewUrl: string;
};

type TrustSafetyAlertEmailInput = {
  config: AppConfig;
  incident: TrustSafetyAlertIncident;
  logger: FastifyBaseLogger;
};

export type SupportRequestEmailInput = {
  category: string;
  contactEmail: string | null;
  createdAt: string;
  id: string;
  message: string;
  pageUrl: string;
  requesterUserId: string | null;
  source: string;
  subject: string;
};

type SupportRequestInboxEmailInput = {
  config: AppConfig;
  logger: FastifyBaseLogger;
  request: SupportRequestEmailInput;
};

export type VerificationDeliveryResult = {
  previewUrl: string | null;
};

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => {
    switch (character) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case "\"":
        return "&quot;";
      default:
        return "&#39;";
    }
  });
}

async function sendResendEmail(input: {
  config: AppConfig;
  email: string;
  html: string;
  logger: FastifyBaseLogger;
  replyTo?: string | null;
  subject: string;
  text: string;
  failureMessage: string;
}) {
  const { config, email, failureMessage, html, logger, replyTo, subject, text } = input;

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
      text,
      ...(replyTo ? { reply_to: replyTo } : {})
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
    const escapedVerificationUrl = escapeHtml(verificationUrl);

    await sendResendEmail({
      config,
      email,
      logger,
      subject: "Verify your cruush email",
      html: `<p>Verify your email for cruush.</p><p><a href="${escapedVerificationUrl}">Verify email</a></p>`,
      text: `Verify your email for cruush: ${verificationUrl}`,
      failureMessage: "verification email delivery failed"
    });

    return {
      previewUrl: null
    };
  }

  if (!config.EMAIL_PREVIEW_ENABLED) {
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
    const escapedResetUrl = escapeHtml(resetUrl);

    await sendResendEmail({
      config,
      email,
      logger,
      subject: "Reset your cruush password",
      html: `<p>Reset your cruush password.</p><p><a href="${escapedResetUrl}">Reset password</a></p><p>This link expires soon. If you did not request it, ignore this email.</p>`,
      text: `Reset your cruush password: ${resetUrl}`,
      failureMessage: "password reset email delivery failed"
    });

    return {
      previewUrl: null
    };
  }

  if (!config.EMAIL_PREVIEW_ENABLED) {
    throw new ApiError(500, "INTERNAL_ERROR", "Email delivery is not configured.");
  }

  logger.info({ email, resetUrl }, "password reset email preview");

  return {
    previewUrl: resetUrl
  };
}

export async function sendTrustSafetyAlertEmail(input: TrustSafetyAlertEmailInput) {
  const { config, incident, logger } = input;
  const alertEmail = config.TRUST_SAFETY_ALERT_EMAIL ?? "";

  if (!config.RESEND_API_KEY || !config.MAIL_FROM || !alertEmail) {
    throw new ApiError(500, "INTERNAL_ERROR", "Trust safety alert email is not configured.");
  }

  const prefix = incident.testMode ? "[TEST]" : "[CRITICAL]";
  const subject = `${prefix} PhotoDNA match incident ${incident.id}`;
  const fields = [
    ["Incident ID", incident.id],
    ["Environment", incident.environment],
    ["Test mode", String(incident.testMode)],
    ["User ID", incident.userId],
    ["User email", incident.userEmail ?? "unknown"],
    ["Surface", incident.surface],
    ["PhotoDNA request ID", incident.providerRequestId ?? "unknown"],
    ["Created at", incident.createdAt],
    ["Internal review", incident.internalReviewUrl]
  ];
  const htmlRows = fields
    .map(([label, value]) => `<tr><th align="left">${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`)
    .join("");
  const text = fields
    .map(([label, value]) => `${label}: ${value}`)
    .join("\n");

  await sendResendEmail({
    config,
    email: alertEmail,
    logger,
    subject,
    html: `<p>PhotoDNA returned a match. Review the incident internally and follow the CyberTipline workflow.</p><table>${htmlRows}</table>`,
    text: `PhotoDNA returned a match. Review the incident internally and follow the CyberTipline workflow.\n\n${text}`,
    failureMessage: "trust safety alert email delivery failed"
  });
}

export async function sendSupportRequestInboxEmail(input: SupportRequestInboxEmailInput) {
  const { config, logger, request } = input;
  const supportInboxEmail = config.SUPPORT_INBOX_EMAIL ?? "";

  if (!config.RESEND_API_KEY || !config.MAIL_FROM || !supportInboxEmail) {
    throw new ApiError(500, "INTERNAL_ERROR", "Support inbox email is not configured.");
  }

  const fields = [
    ["Request ID", request.id],
    ["Category", request.category],
    ["Source", request.source],
    ["Requester user ID", request.requesterUserId ?? "signed out"],
    ["Reply email", request.contactEmail ?? "none provided"],
    ["Page", request.pageUrl || "unknown"],
    ["Created at", request.createdAt]
  ];
  const htmlRows = fields
    .map(([label, value]) => `<tr><th align="left">${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`)
    .join("");
  const escapedMessage = escapeHtml(request.message).replace(/\n/g, "<br>");
  const text = [
    "New cruush support request",
    "",
    ...fields.map(([label, value]) => `${label}: ${value}`),
    "",
    request.message
  ].join("\n");

  await sendResendEmail({
    config,
    email: supportInboxEmail,
    logger,
    replyTo: request.contactEmail,
    subject: `[support] ${request.category}: ${request.subject}`,
    html: `<p>New cruush support request.</p><table>${htmlRows}</table><h2>${escapeHtml(request.subject)}</h2><p>${escapedMessage}</p>`,
    text,
    failureMessage: "support inbox email delivery failed"
  });
}
