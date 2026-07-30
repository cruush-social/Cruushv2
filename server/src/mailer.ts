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

export type EmailAttachment = {
  content: string;
  filename: string;
};

type EventPassEmailInput = {
  attachment: EmailAttachment;
  config: AppConfig;
  email: string;
  event: {
    address: string;
    passIconName: string;
    venueName: string;
  };
  logger: FastifyBaseLogger;
};

const CRUUSH_EMAIL_LOGO_URL = "https://cdn.resend.app/ff1dfa96-8b85-4552-8e56-d09cf53fb13e";

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

function buildVerificationEmailHtml(escapedVerificationUrl: string) {
  return `<!DOCTYPE html>
<html dir="ltr" lang="en">
  <head>
    <meta content="width=device-width" name="viewport" />
    <meta content="text/html; charset=UTF-8" http-equiv="Content-Type" />
    <meta name="x-apple-disable-message-reformatting" />
    <meta content="IE=edge" http-equiv="X-UA-Compatible" />
    <meta content="telephone=no,address=no,email=no,date=no,url=no" name="format-detection" />
    <title>Verify your cruush email</title>
  </head>
  <body
    dir="ltr"
    lang="en"
    bgcolor="#050507"
    style="margin:0;padding:0;background-color:#050507;color:#ffffff;font-family:Georgia,'Times New Roman',Times,serif;"
  >
    <table
      border="0"
      width="100%"
      cellpadding="0"
      cellspacing="0"
      role="presentation"
      align="center"
      bgcolor="#050507"
      style="width:100%;background-color:#050507;color:#ffffff;"
    >
      <tbody>
        <tr>
          <td
            align="center"
            bgcolor="#050507"
            style="padding:28px 14px;background-color:#050507;color:#ffffff;font-family:Georgia,'Times New Roman',Times,serif;line-height:155%;"
          >
            <table
              align="center"
              width="100%"
              border="0"
              cellpadding="0"
              cellspacing="0"
              role="presentation"
              bgcolor="#050507"
              style="max-width:600px;width:100%;background-color:#050507;color:#ffffff;line-height:155%;"
            >
              <tbody>
                <tr>
                  <td align="center" style="padding:0 0 18px;background-color:#050507;color:#ffffff;">
                    <img
                      alt="cruush"
                      height="156"
                      src="${CRUUSH_EMAIL_LOGO_URL}"
                      style="display:block;outline:none;border:none;text-decoration:none;border-radius:8px;"
                      width="150"
                    />
                  </td>
                </tr>

                <tr>
                  <td
                    align="center"
                    bgcolor="#050507"
                    style="padding:0;background-color:#050507;color:#ffffff;font-family:Georgia,'Times New Roman',Times,serif;text-align:center;"
                  >
                    <h1
                      style="margin:0 0 14px;padding:0;color:#ffffff;font-family:Georgia,'Times New Roman',Times,serif;font-size:34px;line-height:1.15;font-weight:700;text-align:center;"
                    >
                      verify your email
                    </h1>

                    <p
                      style="margin:0 0 20px;padding:0;color:#ffffff;font-family:Georgia,'Times New Roman',Times,serif;font-size:17px;line-height:1.55;text-align:center;"
                    >
                      Tap the button below to confirm this address and finish setting up your cruush account.
                    </p>

                    <table
                      align="center"
                      border="0"
                      cellpadding="0"
                      cellspacing="0"
                      role="presentation"
                      style="margin:0 auto 22px;"
                    >
                      <tbody>
                        <tr>
                          <td
                            align="center"
                            bgcolor="#ff0072"
                            style="border-radius:8px;background-color:#ff0072;"
                          >
                            <a
                              href="${escapedVerificationUrl}"
                              rel="noopener noreferrer nofollow"
                              target="_blank"
                              style="display:inline-block;padding:13px 22px;color:#ffffff;font-family:Georgia,'Times New Roman',Times,serif;font-size:16px;font-weight:700;text-decoration:none;"
                            >
                              Verify email
                            </a>
                          </td>
                        </tr>
                      </tbody>
                    </table>

                    <table
                      align="center"
                      border="0"
                      cellpadding="0"
                      cellspacing="0"
                      role="presentation"
                      style="margin:0 auto 20px;width:100%;max-width:430px;"
                    >
                      <tbody>
                        <tr>
                          <td
                            align="center"
                            bgcolor="#111111"
                            style="padding:14px 16px;border:1px solid #ffffff;background-color:#111111;color:#ffffff;font-family:Georgia,'Times New Roman',Times,serif;text-align:center;"
                          >
                            <p
                              style="margin:0;padding:0;color:#ffffff;font-size:15px;line-height:1.55;text-align:center;"
                            >
                              This verification link expires in 24 hours. If you did not create a cruush account, you can ignore this email.
                            </p>
                          </td>
                        </tr>
                      </tbody>
                    </table>

                    <p
                      style="margin:0 0 20px;padding:0;color:#ffffff;font-family:Georgia,'Times New Roman',Times,serif;font-size:15px;line-height:1.55;text-align:center;"
                    >
                      If the button does not open, copy and paste this link into your browser:
                    </p>

                    <p
                      style="margin:0;padding:0;color:#ffffff;font-family:Georgia,'Times New Roman',Times,serif;font-size:13px;line-height:1.5;text-align:center;word-break:break-all;"
                    >
                      <a
                        href="${escapedVerificationUrl}"
                        rel="noopener noreferrer nofollow"
                        target="_blank"
                        style="color:#ffffff;text-decoration:underline;"
                      >
                        ${escapedVerificationUrl}
                      </a>
                    </p>

                    <p
                      style="margin:28px 0 0;padding:0;color:#ffffff;font-family:Georgia,'Times New Roman',Times,serif;font-size:14px;line-height:1.5;text-align:center;"
                    >
                      Comments? Questions? Concerns?<br />
                      <a
                        href="mailto:hello@cruush.app"
                        style="color:#ffffff;text-decoration:underline;"
                        target="_blank"
                      >
                        hello@cruush.app
                      </a>
                    </p>
                  </td>
                </tr>
              </tbody>
            </table>
          </td>
        </tr>
      </tbody>
    </table>
  </body>
</html>`;
}

async function sendResendEmail(input: {
  attachments?: EmailAttachment[];
  config: AppConfig;
  email: string;
  html: string;
  logger: FastifyBaseLogger;
  replyTo?: string | null;
  subject: string;
  text: string;
  failureMessage: string;
}) {
  const { attachments, config, email, failureMessage, html, logger, replyTo, subject, text } = input;

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
      ...(attachments && attachments.length > 0 ? { attachments } : {}),
      ...(replyTo ? { reply_to: replyTo } : {})
    })
  });

  if (!response.ok) {
    const responseBody = await response.text();
    logger.error({ email, responseBody, statusCode: response.status }, failureMessage);
    throw new ApiError(502, "INTERNAL_ERROR", "Failed to send email.");
  }
}

export async function sendEventPassEmail(input: EventPassEmailInput): Promise<VerificationDeliveryResult> {
  const { attachment, config, email, event, logger } = input;
  const escapedVenueName = escapeHtml(event.venueName);
  const escapedAddress = escapeHtml(event.address);
  const escapedIconName = escapeHtml(event.passIconName);
  const subject = `${event.venueName} door pass`;

  if (config.RESEND_API_KEY && config.MAIL_FROM) {
    await sendResendEmail({
      attachments: [attachment],
      config,
      email,
      logger,
      subject,
      html: `<p>Your cruush door pass for ${escapedVenueName} is attached.</p><p>Show the JPG at the door. Your pass icon is <strong>${escapedIconName}</strong>.</p><p>${escapedAddress}</p>`,
      text: `Your cruush door pass for ${event.venueName} is attached.\nShow the JPG at the door. Your pass icon is ${event.passIconName}.\n${event.address}`,
      failureMessage: "event pass email delivery failed"
    });

    return {
      previewUrl: null
    };
  }

  if (!config.EMAIL_PREVIEW_ENABLED) {
    throw new ApiError(500, "INTERNAL_ERROR", "Email delivery is not configured.");
  }

  logger.info({
    email,
    eventVenue: event.venueName,
    passIconName: event.passIconName,
    attachmentFilename: attachment.filename
  }, "event pass email preview");

  return {
    previewUrl: `preview:event-pass:${event.passIconName}`
  };
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
      html: buildVerificationEmailHtml(escapedVerificationUrl),
      text: `Verify your email for cruush within 24 hours: ${verificationUrl}\n\nIf you did not create a cruush account, you can ignore this email.`,
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
