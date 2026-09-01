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
  device?: {
    model?: string;
    platform?: string;
    platformVersion?: string;
    mobile?: boolean;
  } | null;
  requesterUserId: string | null;
  screenshot?: EmailAttachment | null;
  source: string;
  subject: string;
};

export type UserReportEmailInput = {
  conversationId: string | null;
  createdAt: string;
  details: string;
  id: string;
  mediaObjectId: string | null;
  messageId: string | null;
  postId: string | null;
  profilePhotoUrl: string | null;
  placeId?: string | null;
  placeMessageId?: string | null;
  reason: string;
  reporterUserId: string;
  targetType: string;
  targetUserId: string | null;
};

type SupportRequestInboxEmailInput = {
  config: AppConfig;
  logger: FastifyBaseLogger;
  request: SupportRequestEmailInput;
};

type SupportRequestReplyEmailInput = {
  config: AppConfig;
  logger: FastifyBaseLogger;
  replyToEmail: string;
  request: SupportRequestEmailInput;
  replyMessage: string;
};

type UserReportInboxEmailInput = {
  config: AppConfig;
  logger: FastifyBaseLogger;
  report: UserReportEmailInput;
};

export type VerificationDeliveryResult = {
  previewUrl: string | null;
};

export type EmailAttachment = {
  content: string;
  filename: string;
};

type ResendTemplate = {
  id: string;
  variables: Record<string, string | number>;
};

type ResendEmailContent =
  | {
      html: string;
      template?: never;
      text: string;
    }
  | {
      html?: never;
      template: ResendTemplate;
      text?: never;
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
const VERIFICATION_EMAIL_TEMPLATE_ID = "0dc8f32c-76e2-45b2-aaf7-f4649ab48ab0";
const PASSWORD_RESET_EMAIL_TEMPLATE_ID = "c4c95694-b788-4862-804d-e0fb146304c3";
const REPORTS_INBOX_EMAIL = "reports@cruush.app";

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
  logger: FastifyBaseLogger;
  replyTo?: string | null;
  subject: string;
  failureMessage: string;
} & ResendEmailContent) {
  const { attachments, config, email, failureMessage, logger, replyTo, subject } = input;
  const content = input.template
    ? { template: input.template }
    : { html: input.html, text: input.text };

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
      ...content,
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
      html: `<p>Your cruush door pass for ${escapedVenueName} is attached.</p><p>Show the JPG at the door during the current hour. Your pass icon is <strong>${escapedIconName}</strong>.</p><p>${escapedAddress}</p>`,
      text: `Your cruush door pass for ${event.venueName} is attached.\nShow the JPG at the door during the current hour. Your pass icon is ${event.passIconName}.\n${event.address}`,
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
      template: {
        id: VERIFICATION_EMAIL_TEMPLATE_ID,
        variables: {
          VERIFICATION_URL: escapedVerificationUrl
        }
      },
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
      template: {
        id: PASSWORD_RESET_EMAIL_TEMPLATE_ID,
        variables: {
          RESET_URL: escapedResetUrl
        }
      },
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

type AgeSuspensionAppealEmailInput = {
  appealUrl: string;
  config: AppConfig;
  email: string;
  logger: FastifyBaseLogger;
};

export async function sendAgeSuspensionAppealEmail(input: AgeSuspensionAppealEmailInput) {
  const { appealUrl, config, email, logger } = input;

  if (!config.RESEND_API_KEY || !config.MAIL_FROM) {
    logger.info({ email }, "age suspension appeal email skipped, mail is not configured");
    return;
  }

  const escapedAppealUrl = escapeHtml(appealUrl);
  const html = `
    <p>Your cruush profile photo was suspended because our automated check could not confirm an adult.</p>
    <p>A person reviews these. Send your details and we will look at it again:</p>
    <p><a href="${escapedAppealUrl}">${escapedAppealUrl}</a></p>
    <p>You will be asked for a photo of your ID with everything except your date of birth and photo covered, plus a selfie holding a handwritten card with your account email and today's date. Both stay encrypted, expire after 24 hours, and are deleted once the review is done.</p>
    <p>You do not need to be signed in to use that page.</p>
  `;
  const text = [
    "Your cruush profile photo was suspended because our automated check could not confirm an adult.",
    "",
    "A person reviews these. Send your details and we will look at it again:",
    appealUrl,
    "",
    "You will be asked for a photo of your ID with everything except your date of birth and photo covered, plus a selfie holding a handwritten card with your account email and today's date. Both stay encrypted, expire after 24 hours, and are deleted once the review is done.",
    "",
    "You do not need to be signed in to use that page."
  ].join("\n");

  await sendResendEmail({
    config,
    email,
    logger,
    replyTo: REPORTS_INBOX_EMAIL,
    subject: "Appeal your cruush age-related suspension",
    html,
    text,
    failureMessage: "age suspension appeal email delivery failed"
  });
}

type AgeSuspensionInboxEmailInput = {
  config: AppConfig;
  logger: FastifyBaseLogger;
  userEmail: string | null;
  userId: string;
};

export async function sendAgeSuspensionInboxEmail(input: AgeSuspensionInboxEmailInput) {
  const { config, logger, userEmail, userId } = input;

  if (!config.RESEND_API_KEY || !config.MAIL_FROM) {
    return;
  }

  const fields = [
    ["User ID", userId],
    ["User email", userEmail ?? "unknown"]
  ];
  const htmlRows = fields
    .map(([label, value]) => `<tr><th align="left">${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`)
    .join("");

  await sendResendEmail({
    config,
    email: REPORTS_INBOX_EMAIL,
    logger,
    subject: "age-related suspension applied",
    html: `<p>An age-related profile photo suspension was applied. The person was emailed the appeal form.</p><table>${htmlRows}</table>`,
    text: `An age-related profile photo suspension was applied. The person was emailed the appeal form.\n\n${fields.map(([label, value]) => `${label}: ${value}`).join("\n")}`,
    failureMessage: "age suspension inbox email delivery failed"
  });
}

export async function sendSupportRequestInboxEmail(input: SupportRequestInboxEmailInput) {
  const { config, logger, request } = input;

  if (!config.RESEND_API_KEY || !config.MAIL_FROM) {
    throw new ApiError(500, "INTERNAL_ERROR", "Reports inbox email is not configured.");
  }

  const fields = [
    ["Request ID", request.id],
    ["Category", request.category],
    ["Source", request.source],
    ["Requester user ID", request.requesterUserId ?? "signed out"],
    ["Reply email", request.contactEmail ?? "none provided"],
    ["Page", request.pageUrl || "unknown"],
    ["Device model", request.device?.model || "browser did not provide one"],
    ["Platform", [request.device?.platform, request.device?.platformVersion].filter(Boolean).join(" ") || "unknown"],
    ["Screenshot", request.screenshot ? request.screenshot.filename : "none"],
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
  const inboxSubject = request.source === "survey"
    ? `[survey] ${request.subject}`
    : `[support] ${request.category}: ${request.subject}`;

  await sendResendEmail({
    config,
    email: REPORTS_INBOX_EMAIL,
    logger,
    replyTo: request.contactEmail,
    subject: inboxSubject,
    html: `<p>New cruush support request.</p><table>${htmlRows}</table><h2>${escapeHtml(request.subject)}</h2><p>${escapedMessage}</p>`,
    text,
    attachments: request.screenshot ? [request.screenshot] : undefined,
    failureMessage: "support inbox email delivery failed"
  });
}

export async function sendSupportRequestReplyEmail(input: SupportRequestReplyEmailInput) {
  const { config, logger, replyMessage, replyToEmail, request } = input;

  if (!config.RESEND_API_KEY || !config.MAIL_FROM) {
    throw new ApiError(500, "INTERNAL_ERROR", "Reports inbox email is not configured.");
  }

  const escapedSubject = escapeHtml(request.subject);
  const escapedReplyMessage = escapeHtml(replyMessage).replace(/\n/g, "<br>");
  const escapedOriginalMessage = escapeHtml(request.message).replace(/\n/g, "<br>");
  const html = `
    <p>A cruush support reply is ready.</p>
    <table>
      <tr><th align="left">Request ID</th><td>${escapeHtml(request.id)}</td></tr>
      <tr><th align="left">Category</th><td>${escapeHtml(request.category)}</td></tr>
      <tr><th align="left">Source</th><td>${escapeHtml(request.source)}</td></tr>
      <tr><th align="left">Page</th><td>${escapeHtml(request.pageUrl || "unknown")}</td></tr>
      <tr><th align="left">Created at</th><td>${escapeHtml(request.createdAt)}</td></tr>
    </table>
    <h2>${escapedSubject}</h2>
    <p>${escapedReplyMessage}</p>
    <hr />
    <p><strong>Original message</strong></p>
    <p>${escapedOriginalMessage}</p>
  `;
  const text = [
    "cruush support reply",
    "",
    `Request ID: ${request.id}`,
    `Category: ${request.category}`,
    `Source: ${request.source}`,
    `Page: ${request.pageUrl || "unknown"}`,
    `Created at: ${request.createdAt}`,
    "",
    `Subject: ${request.subject}`,
    "",
    replyMessage,
    "",
    "Original message",
    "",
    request.message
  ].join("\n");

  await sendResendEmail({
    config,
    email: replyToEmail,
    logger,
    replyTo: REPORTS_INBOX_EMAIL,
    subject: `Re: [support] ${request.category}: ${request.subject}`,
    html,
    text,
    failureMessage: "support reply email delivery failed"
  });
}

export async function sendUserReportInboxEmail(input: UserReportInboxEmailInput) {
  const { config, logger, report } = input;

  if (!config.RESEND_API_KEY || !config.MAIL_FROM) {
    throw new ApiError(500, "INTERNAL_ERROR", "Reports inbox email is not configured.");
  }

  const fields = [
    ["Report ID", report.id],
    ["Target type", report.targetType],
    ["Reason", report.reason],
    ["Reporter user ID", report.reporterUserId],
    ["Target user ID", report.targetUserId ?? "none"],
    ["Conversation ID", report.conversationId ?? "none"],
    ["Message ID", report.messageId ?? "none"],
    ["Post ID", report.postId ?? "none"],
    ["Media object ID", report.mediaObjectId ?? "none"],
    ["Profile photo URL", report.profilePhotoUrl ?? "none"],
    ["Spot ID", report.placeId ?? "none"],
    ["Spot message ID", report.placeMessageId ?? "none"],
    ["Created at", report.createdAt]
  ];
  const htmlRows = fields
    .map(([label, value]) => `<tr><th align="left">${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`)
    .join("");
  const escapedDetails = escapeHtml(report.details).replace(/\n/g, "<br>");
  const text = [
    "New cruush moderation report",
    "",
    ...fields.map(([label, value]) => `${label}: ${value}`),
    "",
    report.details
  ].join("\n");

  await sendResendEmail({
    config,
    email: REPORTS_INBOX_EMAIL,
    logger,
    subject: `[report] ${report.targetType}: ${report.reason}`,
    html: `<p>New cruush moderation report.</p><table>${htmlRows}</table><p>${escapedDetails}</p>`,
    text,
    failureMessage: "reports inbox email delivery failed"
  });
}
