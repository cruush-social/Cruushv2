import { orderWalletEmailInstructions, walletEmailAmount, type OrderWalletEmailDetails } from "./order-wallet-email-details.js";
import { defaultEmailHtml } from "./email-template.js";
import type { FastifyBaseLogger } from "fastify";
import { ApiError } from "./errors.js";
import type { AppConfig } from "./config.js";
import { OWNER_FULL_ACCESS_EMAIL } from "./owner-access.js";

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

type EmailChangeConfirmationInput = {
  config: AppConfig;
  email: string;
  logger: FastifyBaseLogger;
  confirmUrl: string;
};

type EmailChangeNoticeInput = {
  config: AppConfig;
  email: string;
  logger: FastifyBaseLogger;
  newEmail: string;
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

export type BitcoinMonitoringCapacityLevel = "warning" | "critical";

type BitcoinMonitoringCapacityAlertEmailInput = {
  activeAddresses: number;
  config: AppConfig;
  level: BitcoinMonitoringCapacityLevel;
  logger: FastifyBaseLogger;
};

type WeeklyOrderReportEmailInput = {
  config: AppConfig;
  csv: string;
  logger: FastifyBaseLogger;
  weekEnd: string;
  weekStart: string;
};

export type SupportRequestEmailInput = {
  category: string;
  contactEmail: string | null;
  createdAt: string;
  id: string;
  message: string;
  pageUrl: string;
  device?: {
    platform?: string;
    browser?: string;
    appVersion?: string;
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
  idempotencyKey?: string;
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

const REPORTS_INBOX_EMAIL = "reports@cruush.app";
const REPORTS_FROM_EMAIL = "cruush <reports@cruush.app>";
const AGE_SUSPENSION_REASON_CODES = new Set(["minor_face_detected"]);

const SUSPENSION_REASON_COPY: Record<string, string> = {
  abuse_confirmed: "A human review confirmed abusive behavior that violated the cruush rules.",
  credible_threat: "We detected content that may contain a credible threat of harm.",
  drug_sales: "We detected content offering or arranging the sale of drugs.",
  manual_review_rejected: "A human review found content or activity that violated the cruush rules.",
  minor_face_detected: "The profile photo age check could not confirm that the person shown is an adult.",
  reviewed_valid_report: "A human review confirmed a report about activity on your account."
};

export function isAgeRelatedSuspensionReason(reasonCode: string) {
  return AGE_SUSPENSION_REASON_CODES.has(reasonCode);
}

function suspensionReasonCopy(reasonCode: string) {
  return SUSPENSION_REASON_COPY[reasonCode]
    ?? `The recorded suspension reason is ${reasonCode.replace(/[_-]+/g, " ").trim()}.`;
}

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

// All account actions share the last sent release email's default glass shell.
function buildAccountEmailHtml(input: {
  title: string; heading: string; intro: string; buttonLabel: string;
  escapedUrl: string; footnote: string;
}) {
  return defaultEmailHtml({
    title: input.title, heading: input.heading, intro: input.intro,
    buttonLabel: input.buttonLabel, buttonUrl: input.escapedUrl,
    body: `<p>${input.footnote}</p><p>If the button does not open, copy and paste this link into your browser:</p><p><a href="${input.escapedUrl}" style="overflow-wrap:anywhere;">${input.escapedUrl}</a></p>`
  });
}

function buildVerificationEmailHtml(escapedVerificationUrl: string) {
  return buildAccountEmailHtml({
    title: "Verify your cruush email",
    heading: "verify your email",
    intro: "Tap the button below to confirm this address and finish setting up your cruush account.",
    buttonLabel: "Verify email",
    escapedUrl: escapedVerificationUrl,
    footnote: "This verification link expires in 24 hours. If you did not create a cruush account, you can ignore this email."
  });
}

export class CryptoGasEmailRejectedError extends Error {
  constructor(readonly statusCode: number) {
    super("Gas warning email was rejected before acceptance.");
    this.name = "CryptoGasEmailRejectedError";
  }
}

async function sendResendEmail(input: {
  cc?: string[];
  attachments?: EmailAttachment[];
  config: AppConfig;
  email: string;
  from?: string;
  logger: FastifyBaseLogger;
  replyTo?: string | null;
  subject: string;
  failureMessage: string;
  idempotencyKey?: string;
  redactRecipientInFailureLog?: boolean;
  classifyGasRejection?: boolean;
} & ResendEmailContent) {
  const { attachments, config, email, failureMessage, from, logger, replyTo, subject } = input;
  const content = input.template
    ? { template: input.template }
    : { html: /<!doctype html/i.test(input.html) ? input.html : defaultEmailHtml({ title: escapeHtml(subject), body: input.html }), text: input.text };

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    ...(input.idempotencyKey ? { signal: AbortSignal.timeout(15_000) } : {}),
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.RESEND_API_KEY}`,
      ...(input.idempotencyKey ? { "Idempotency-Key": input.idempotencyKey } : {})
    },
    body: JSON.stringify({
      from: from ?? config.MAIL_FROM,
      to: [email],
      ...(input.cc?.length ? { cc: input.cc } : {}),
      subject,
      ...content,
      ...(attachments && attachments.length > 0 ? { attachments } : {}),
      ...(replyTo ? { reply_to: replyTo } : {})
    })
  });

  if (!response.ok) {
    // Provider responses may echo the email content, including token URLs.
    logger.error(input.redactRecipientInFailureLog
      ? { statusCode: response.status }
      : { email, statusCode: response.status }, failureMessage);
    if (input.classifyGasRejection && response.status >= 400 && response.status < 500
      && response.status !== 408 && response.status !== 409) {
      throw new CryptoGasEmailRejectedError(response.status);
    }
    throw new ApiError(502, "INTERNAL_ERROR", "Failed to send email.");
  }

  let providerMessageId: string | null = null;
  if (typeof response.json === "function") {
    try {
      const body = await response.json() as { id?: unknown };
      providerMessageId = typeof body.id === "string" ? body.id : null;
    } catch {
      // A successful provider response without readable JSON is still accepted.
    }
  }
  return { providerMessageId };
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
      html: buildVerificationEmailHtml(escapedVerificationUrl),
      text: `verify your email\n\nTap the button below to confirm this address and finish setting up your cruush account.\n\nVerify email: ${verificationUrl}\n\nThis verification link expires in 24 hours. If you did not create a cruush account, you can ignore this email.\n\nhello@cruush.app`,
      failureMessage: "verification email delivery failed"
    });

    return {
      previewUrl: null
    };
  }

  if (!config.EMAIL_PREVIEW_ENABLED) {
    throw new ApiError(500, "INTERNAL_ERROR", "Email delivery is not configured.");
  }

  logger.info({ email }, "verification email preview");

  return {
    previewUrl: verificationUrl
  };
}

function buildPasswordResetEmailHtml(escapedResetUrl: string) {
  return buildAccountEmailHtml({
    title: "Reset your cruush password", heading: "forgot your password?",
    intro: "We received a request to reset the password for your cruush account. Use the button below to choose a new one.",
    buttonLabel: "Reset password", escapedUrl: escapedResetUrl,
    footnote: "This password reset link expires in 1 hour. If you did not request a reset, you can safely ignore this email."
  });
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
      html: buildPasswordResetEmailHtml(escapedResetUrl),
      // The plain text part carries the raw URL. Escaping belongs to the HTML
      // attribute; an &amp; here would be pasted into a browser literally.
      text: [
        "forgot your password?",
        "",
        "We received a request to reset the password for your cruush account.",
        "Open this link to choose a new one:",
        resetUrl,
        "",
        "This password reset link expires in 1 hour. If you did not request a reset,",
        "you can safely ignore this email.",
        "",
        "A message from cruush, hello@cruush.app"
      ].join("\n"),
      failureMessage: "password reset email delivery failed"
    });

    return {
      previewUrl: null
    };
  }

  if (!config.EMAIL_PREVIEW_ENABLED) {
    throw new ApiError(500, "INTERNAL_ERROR", "Email delivery is not configured.");
  }

  logger.info({ email }, "password reset email preview");

  return {
    previewUrl: resetUrl
  };
}

// Sent to the address a member wants to move to. The change only happens when
// this link is opened, which is what proves they can read mail at that address.
function buildEmailChangeConfirmationHtml(escapedConfirmUrl: string) {
  return buildAccountEmailHtml({
    title: "Confirm your new cruush email",
    heading: "confirm your new email",
    intro: "Tap the button below to confirm this address for your cruush account.",
    buttonLabel: "Confirm email",
    escapedUrl: escapedConfirmUrl,
    footnote: "This link expires in 1 hour, and your address does not change until you open it. If you did not ask for this, you can ignore this email."
  });
}

function buildEmailChangeNoticeHtml(escapedNewEmail: string, escapedSupportUrl: string) {
  return buildAccountEmailHtml({
    title: "A new email was requested for your cruush account",
    heading: "a change was requested",
    intro: `Someone asked to move your cruush account to ${escapedNewEmail}. Nothing has changed yet, and the move only happens if that address is confirmed.`,
    buttonLabel: "Contact cruush",
    escapedUrl: escapedSupportUrl,
    footnote: "If this was not you, change your password now and contact hello@cruush.app."
  });
}

export async function sendEmailChangeConfirmationEmail(input: EmailChangeConfirmationInput): Promise<VerificationDeliveryResult> {
  const { config, email, logger, confirmUrl } = input;

  if (config.RESEND_API_KEY && config.MAIL_FROM) {
    await sendResendEmail({
      config,
      email,
      logger,
      subject: "Confirm your new cruush email",
      html: buildEmailChangeConfirmationHtml(escapeHtml(confirmUrl)),
      text: [
        "confirm your new email",
        "",
        "You asked to use this address for your cruush account.",
        "Open this link to confirm it:",
        confirmUrl,
        "",
        "This link expires in 1 hour. Your address does not change until you open it.",
        "If you did not ask for this, you can ignore this email.",
        "",
        "A message from cruush, hello@cruush.app"
      ].join("\n"),
      failureMessage: "email change confirmation delivery failed"
    });

    return { previewUrl: null };
  }

  if (!config.EMAIL_PREVIEW_ENABLED) {
    throw new ApiError(500, "INTERNAL_ERROR", "Email delivery is not configured.");
  }

  logger.info({ email }, "email change confirmation preview");

  return { previewUrl: confirmUrl };
}

// Sent to the address currently on the account, so a member finds out that a
// change was requested even when someone else asked for it.
export async function sendEmailChangeNoticeEmail(input: EmailChangeNoticeInput) {
  const { config, email, logger, newEmail } = input;

  if (!config.RESEND_API_KEY || !config.MAIL_FROM) {
    logger.info({ email, newEmail }, "email change notice preview");
    return;
  }

  await sendResendEmail({
    config,
    email,
    logger,
    subject: "A new email was requested for your cruush account",
    html: buildEmailChangeNoticeHtml(escapeHtml(newEmail), "mailto:hello@cruush.app"),
    text: [
      "a change was requested",
      "",
      `Someone asked to move your cruush account to ${newEmail}.`,
      "Nothing has changed yet. The move only happens if that address is confirmed.",
      "",
      "If this was not you, change your password now and contact hello@cruush.app.",
      "",
      "A message from cruush, hello@cruush.app"
    ].join("\n"),
    failureMessage: "email change notice delivery failed"
  });
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

export async function sendBitcoinMonitoringCapacityAlertEmail(input: BitcoinMonitoringCapacityAlertEmailInput) {
  const { activeAddresses, config, level, logger } = input;
  if (!config.RESEND_API_KEY || !config.MAIL_FROM) {
    logger.info({ activeAddresses, level }, "bitcoin monitoring capacity email skipped, mail is not configured");
    return;
  }

  const critical = level === "critical";
  const threshold = critical ? 50 : 40;
  const subject = critical
    ? "[CRITICAL] cruush Bitcoin monitoring capacity reached"
    : "[WARNING] cruush Bitcoin monitoring capacity is near its limit";
  const summary = critical
    ? "The active checkout-address warning line has been reached. Scale the Bitcoin monitoring source before opening more simultaneous checkouts."
    : "The active checkout-address warning line has been reached. Plan the next Bitcoin monitoring source before opening more simultaneous checkouts.";
  const text = [
    summary,
    "",
    `Active checkout addresses: ${activeAddresses}`,
    `Alert threshold: ${threshold}`,
    "",
    "The public Mempool WebSocket remains the current low-cost monitoring source. Esplora remains the independent settlement verifier."
  ].join("\n");
  const html = `<p>${escapeHtml(summary)}</p><p><strong>Active checkout addresses:</strong> ${activeAddresses}<br><strong>Alert threshold:</strong> ${threshold}</p><p>The public Mempool WebSocket remains the current low-cost monitoring source. Esplora remains the independent settlement verifier.</p>`;

  await sendResendEmail({
    config,
    email: OWNER_FULL_ACCESS_EMAIL,
    logger,
    subject,
    html,
    text,
    failureMessage: "bitcoin monitoring capacity email delivery failed"
  });
}

export async function sendWeeklyOrderReportEmail(input: WeeklyOrderReportEmailInput) {
  const { config, csv, logger, weekEnd, weekStart } = input;
  if (!config.RESEND_API_KEY || !config.MAIL_FROM) {
    logger.info({ weekStart }, "weekly order report email skipped, mail is not configured");
    return { accepted: false, providerMessageId: null };
  }

  const delivery = await sendResendEmail({
    attachments: [{
      content: Buffer.from(csv, "utf8").toString("base64"),
      filename: `cruush-orders-${weekStart}.csv`
    }],
    config,
    email: OWNER_FULL_ACCESS_EMAIL,
    idempotencyKey: `weekly-orders/${weekStart}`,
    logger,
    subject: `cruush weekly orders: ${weekStart} to ${weekEnd}`,
    html: `<p>The completed weekly cruush order report for <strong>${escapeHtml(weekStart)}</strong> through <strong>${escapeHtml(weekEnd)}</strong> is attached.</p>`,
    text: `The completed weekly cruush order report for ${weekStart} through ${weekEnd} is attached.`,
    failureMessage: "weekly order report email delivery failed"
  });

  return { accepted: true, providerMessageId: delivery.providerMessageId };
}

export async function sendCryptoGasAlertEmail(input: {
  cc?: string[];
  config: AppConfig;
  logger: FastifyBaseLogger;
  idempotencyKey: string;
  mailFrom?: string;
  network: string;
  address: string;
  balanceEth: string;
  topUpEth: string;
  targetEth: string;
}) {
  if (!input.config.RESEND_API_KEY || !(input.mailFrom ?? input.config.MAIL_FROM)) {
    return { accepted: false, providerMessageId: null };
  }
  const lines = [
    `cruush needs gas on ${input.network}.`,
    `Current balance: ${input.balanceEth} ETH.`,
    `Send ${input.topUpEth} ETH on ${input.network} to restore the ${input.targetEth} ETH working balance. Your sending fee is separate.`,
    `Forwarding address: ${input.address}`,
    "Check the network and address before approving the transfer. Each network has a separate ETH balance.",
    "cruush accepts PYUSD and USDC payments. ETH is used only for network fees when forwarding those stablecoins to ELLIPAL.",
    "No automatic purchase or swap has been made. Forwarding may wait if gas runs out.",
  ];
  const delivery = await sendResendEmail({
    config: input.config, email: OWNER_FULL_ACCESS_EMAIL, cc: input.cc ?? ["hello@cruush.app"], logger: input.logger,
    from: input.mailFrom, classifyGasRejection: true,
    idempotencyKey: input.idempotencyKey, redactRecipientInFailureLog: true,
    subject: `cruush gas refill needed: ${input.network}`,
    html: lines.map(line => `<p>${escapeHtml(line)}</p>`).join(""),
    text: lines.join("\n\n"), failureMessage: "owner gas warning email failed",
  });
  return { accepted: true, providerMessageId: delivery.providerMessageId };
}

type AgeSuspensionAppealEmailInput = {
  appealUrl: string;
  config: AppConfig;
  email: string;
  logger: FastifyBaseLogger;
  reasonCode?: string;
};

export async function sendAgeSuspensionAppealEmail(input: AgeSuspensionAppealEmailInput) {
  const { appealUrl, config, email, logger, reasonCode = "minor_face_detected" } = input;

  if (!config.RESEND_API_KEY || !config.MAIL_FROM) {
    logger.info({ email }, "age suspension appeal email skipped, mail is not configured");
    return;
  }

  const escapedAppealUrl = escapeHtml(appealUrl);
  const escapedReason = escapeHtml(suspensionReasonCopy(reasonCode));
  const html = `
    <p>Your cruush account was suspended.</p>
    <p><strong>Reason:</strong> ${escapedReason}</p>
    <p>A person reviews these. Send your details and we will look at it again:</p>
    <p><a href="${escapedAppealUrl}">${escapedAppealUrl}</a></p>
    <p>You will be asked for a photo of your ID with everything except your date of birth and photo covered, plus a selfie holding a handwritten card with your account email and today's date. Both stay encrypted, expire after 24 hours, and are deleted once the review is done.</p>
    <p>You do not need to be signed in to use that page.</p>
  `;
  const text = [
    "Your cruush account was suspended.",
    `Reason: ${suspensionReasonCopy(reasonCode)}`,
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
    from: REPORTS_FROM_EMAIL,
    logger,
    replyTo: REPORTS_INBOX_EMAIL,
    subject: "Appeal your cruush age-related suspension",
    html,
    text,
    failureMessage: "age suspension appeal email delivery failed"
  });
}

type GeneralSuspensionAppealEmailInput = {
  appealUrl: string;
  config: AppConfig;
  email: string;
  logger: FastifyBaseLogger;
  reasonCode?: string;
};

export async function sendGeneralSuspensionAppealEmail(input: GeneralSuspensionAppealEmailInput) {
  const { appealUrl, config, email, logger, reasonCode = "account_suspension" } = input;

  if (!config.RESEND_API_KEY || !config.MAIL_FROM) {
    logger.info({ email }, "suspension appeal email skipped, mail is not configured");
    return;
  }

  const escapedAppealUrl = escapeHtml(appealUrl);
  const reason = suspensionReasonCopy(reasonCode);
  const escapedReason = escapeHtml(reason);
  const html = `
    <p>Your cruush account was suspended.</p>
    <p><strong>Reason:</strong> ${escapedReason}</p>
    <p>You can ask a person to review the decision here:</p>
    <p><a href="${escapedAppealUrl}">${escapedAppealUrl}</a></p>
    <p>You do not need to be signed in to use that page.</p>
  `;
  const text = [
    "Your cruush account was suspended.",
    `Reason: ${reason}`,
    "",
    "You can ask a person to review the decision here:",
    appealUrl,
    "",
    "You do not need to be signed in to use that page."
  ].join("\n");

  await sendResendEmail({
    config,
    email,
    from: REPORTS_FROM_EMAIL,
    logger,
    replyTo: REPORTS_INBOX_EMAIL,
    subject: "Appeal your cruush suspension",
    html,
    text,
    failureMessage: "suspension appeal email delivery failed"
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
    ["Browser", request.device?.browser || "unknown"],
    ["Platform", request.device?.platform || "unknown"],
    ["App version", request.device?.appVersion || "unknown"],
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
    ...(request.category === "bug" && input.idempotencyKey ? {
      idempotencyKey: input.idempotencyKey,
      redactRecipientInFailureLog: true
    } : {}),
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

export const SUBSCRIPTION_EXPIRY_EMAIL_TEMPLATE_ID = "subscription-expiry";
export const SUBSCRIPTION_EXPIRY_RENEWAL_URL = "https://cruush.app/store";

export type SubscriptionExpiryEmailPayload = {
  email: string;
  from: string;
  subject: string;
  html?: string;
  text?: string;
  templateId: string;
  variables: {
    BODY: string;
    RENEW_URL: string;
    TITLE: string;
  };
};

export function buildSubscriptionExpiryEmail(input: {
  body: string;
  email: string;
  from: string;
  title: string;
}): SubscriptionExpiryEmailPayload {
  return {
    email: input.email,
    from: input.from,
    subject: input.title,
    html: defaultEmailHtml({ title: escapeHtml(input.title), intro: escapeHtml(input.body), buttonLabel: "Renew cruush+", buttonUrl: SUBSCRIPTION_EXPIRY_RENEWAL_URL, body: "" }),
    text: `${input.title}\n\n${input.body}\n\nRenew cruush+: ${SUBSCRIPTION_EXPIRY_RENEWAL_URL}`,
    templateId: SUBSCRIPTION_EXPIRY_EMAIL_TEMPLATE_ID,
    variables: {
      BODY: input.body,
      RENEW_URL: SUBSCRIPTION_EXPIRY_RENEWAL_URL,
      TITLE: input.title
    }
  };
}

export async function sendSubscriptionExpiryEmail(input: {
  config: AppConfig;
  idempotencyKey: string;
  logger: FastifyBaseLogger;
  payload: SubscriptionExpiryEmailPayload;
}) {
  if (!input.config.RESEND_API_KEY || !input.config.MAIL_FROM) {
    return { accepted: false, providerMessageId: null };
  }
  const delivery = await sendResendEmail({
    config: input.config,
    email: input.payload.email,
    from: input.payload.from,
    idempotencyKey: input.idempotencyKey,
    logger: input.logger,
    subject: input.payload.subject,
    // Previously frozen payloads must retry unchanged under their existing key.
    ...(input.payload.html && input.payload.text
      ? { html: input.payload.html, text: input.payload.text }
      : { template: { id: input.payload.templateId, variables: input.payload.variables } }),
    failureMessage: "Subscription reminder email failed."
  });
  return { accepted: true, providerMessageId: delivery.providerMessageId };
}

export async function sendOutOfSightWelcomeEmail(input: {
  config: AppConfig;
  email: string;
  idempotencyKey: string;
  logger: FastifyBaseLogger;
}) {
  const { config, email, idempotencyKey, logger } = input;
  if (!config.RESEND_API_KEY || !config.MAIL_FROM) {
    return { accepted: false, providerMessageId: null };
  }

  const appUrl = escapeHtml(config.APP_URL.replace(/\/$/, ""));
  const subject = "congratulations, you have entered Purgatory";
  const text = [
    "The app just noticed that you are outside the service area. Congratulations, your GPS has promoted you to the waiting room. Do not panic. This is not a ban, a breakup, or an exorcism.",
    "You are still a full cruush member. You can post, message, connect, and use Confessional, Covens, Messages, and Profiles globally. The Map is taking a personal day and will not be accepting visitors in this state.",
    "As a Purgatory member, profile location pins stay dark and unavailable to you, regardless of cruush status. Ghost Mode is unavailable here and points toward Mile High Club (MHC). If you use MHC to access the service area, location controls work under the normal privacy rules.",
    "You can also use Visibility Controls to hide your profile and activity from Purgatory members completely. Existing chats and history stay available. Purgatory members can never access your precise location. Please enjoy the rest of the app and resist the urge to negotiate with your pin.",
    `Open cruush: ${config.APP_URL.replace(/\/$/, "")}/settings`,
    "xoxo,\nJulien Lenaz\nlead developer of cruush 🖤",
    "Questions? hello@cruush.app"
  ].join("\n\n");
  const html = defaultEmailHtml({ title: subject, heading: 'you have entered Purgatory.', body: `<div style="margin:0 0 18px;color:#ff5c9a;font-family:Arial,sans-serif;font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;">congratulations, sort of</div>

<div style="color:#eeeeF2;font-size:18px;line-height:1.62;">
The app just noticed that you are outside the service area. Congratulations, your GPS has promoted you to the waiting room. Do not panic. This is not a ban, a breakup, or an exorcism.<br /><br />
You are still a full cruush member. You can post, message, connect, and use Confessional, Covens, Messages, and Profiles globally. The Map is taking a personal day and will not be accepting visitors in this state.<br /><br />
As a Purgatory member, profile location pins stay dark and unavailable to you, regardless of cruush status. Ghost Mode is unavailable here and points toward Mile High Club (MHC). If you use MHC to access the service area, location controls work under the normal privacy rules.<br /><br />
You can also use Visibility Controls to hide your profile and activity from Purgatory members completely. Existing chats and history stay available. Purgatory members can never access your precise location. Please enjoy the rest of the app and resist the urge to negotiate with your pin.
</div>
<table cellpadding="0" cellspacing="0" role="presentation" style="margin:28px 0 0;"><tr><td bgcolor="#6f00ff" style="border-radius:999px;background:#ff0072;background:linear-gradient(90deg,#ff0072 6.08%,#6f00ff 43.11%,#3826ff 58.46%,#004bff 73.81%,#1181ff 100%);"><a href="${appUrl}/settings" style="display:inline-block;padding:13px 22px;color:#fff;text-decoration:none;font-family:'Spectral',Georgia,'Times New Roman',serif;font-size:14px;font-weight:700;">Open cruush</a></td></tr></table>
<p style="margin:28px 0 0;color:#eeeeF2;font-size:18px;line-height:1.62;">xoxo,<br />Julien Lenaz<br />lead developer of cruush 🖤</p>
` });

  const delivery = await sendResendEmail({
    config,
    email,
    idempotencyKey,
    redactRecipientInFailureLog: true,
    logger,
    subject,
    html,
    text,
    failureMessage: "Out of Sight welcome email delivery failed"
  });
  return { accepted: true, providerMessageId: delivery.providerMessageId };
}

export async function sendSinnersWelcomeEmail(input: {
  config: AppConfig;
  email: string;
  idempotencyKey: string;
  logger: FastifyBaseLogger;
}) {
  const { config, email, idempotencyKey, logger } = input;
  if (!config.RESEND_API_KEY || !config.MAIL_FROM) {
    return { accepted: false, providerMessageId: null };
  }

  // Approved preview copy, including the owner's latest techno-occult correction.
  // Content stays separate; both welcome emails use the default shell.
  const subject = "welcome to the Sinner's Map";
  const paragraphs = [
    "You signed the cruush Code of Conduct. In the old language, that means your soul is now marked for the Sinner's Map. If you are returning from Purgatory, welcome back. The gates noticed you made it home.",
    "cruush is a technopagan occult artifact powered by sex magic and digital alchemy. You are not merely opening an app. You are crossing the threshold into the Confessional, Covens, Crowds, Carousel, and everything else waiting beyond the oath.",
    "Be honest. Respect boundaries. Keep private things private. Do not spoof your location. Location spoofing is a reportable violation, and accounts caught doing it will be banned. The Sinner's Map has many mysteries. Fake GPS coordinates are not one of them.",
    "You have been welcomed, witnessed, and technically warned. Try to behave."
  ];
  const appUrl = escapeHtml(config.APP_URL.replace(/\/$/, ""));
  const text = [
    "the oath is sealed", "welcome to the Sinner's Map.", ...paragraphs,
    `Enter cruush: ${config.APP_URL.replace(/\/$/, "")}/settings`,
    "xoxo,\nJulien Lenaz\nlead developer of cruush 🖤", "Questions? hello@cruush.app"
  ].join("\n\n");
  const html = defaultEmailHtml({ title: subject, heading: "welcome to the Sinner's Map.", body: `<div style="margin:0 0 18px;color:#ff5c9a;font-family:Arial,sans-serif;font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;">the oath is sealed</div>

<div style="color:#eeeeF2;font-size:18px;line-height:1.62;">${paragraphs.join("<br /><br />\n")}</div>
<table cellpadding="0" cellspacing="0" role="presentation" style="margin:28px 0 0;"><tr><td bgcolor="#6f00ff" style="border-radius:999px;background:#ff0072;background:linear-gradient(90deg,#ff0072 6.08%,#6f00ff 43.11%,#3826ff 58.46%,#004bff 73.81%,#1181ff 100%);"><a href="${appUrl}/settings" style="display:inline-block;padding:13px 22px;color:#fff;text-decoration:none;font-family:'Spectral',Georgia,'Times New Roman',serif;font-size:14px;font-weight:700;">Enter cruush</a></td></tr></table>
<p style="margin:28px 0 0;color:#eeeeF2;font-size:18px;line-height:1.62;">xoxo,<br />Julien Lenaz<br />lead developer of cruush 🖤</p>
` });

  const delivery = await sendResendEmail({ config, email, idempotencyKey,
    redactRecipientInFailureLog: true, logger, subject, html, text,
    failureMessage: "Sinners welcome email delivery failed" });
  return { accepted: true, providerMessageId: delivery.providerMessageId };
}


export function buildOrderWalletReadyEmail(appUrl: string, productType: string, planId: string, order: OrderWalletEmailDetails) {
  const base = appUrl.replace(/\/$/, "");
  const history = `${base}/settings/orders`;
  const checkout = `${base}${productType === "ping_pack" ? "/store/pulse" : "/store"}`;
  const security = `${base}/blog/payment-security.html`;
  const guide = `${base}/blog/stablecoin-payments.html`;
  const why = `${base}/blog/crypto-first.html`;
  const subject = "Your order’s payment wallet is ready";
  const access = productType === "ping_pack"
    ? "This is a one-time Pulse purchase. Nothing renews and you will not be charged again automatically."
    : planId.includes("lifetime")
      ? "This is a one-time lifetime cruush+ purchase. Nothing renews and you will not be charged again automatically. Lifetime access has no expiry reminder."
      : "This is a one-time payment for the cruush+ time you chose. Nothing renews and you will not be charged again automatically. Once your payment is confirmed, your time is activated. We’ll remind you before your time expires.";
  const instructions = orderWalletEmailInstructions(order);
  const steps = instructions.steps;
  const usd = (cents: number) => `$${(cents / 100).toFixed(2)} USD`;
  const date = (value: string | Date | null) => new Date(value!).toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, ' UTC');
  const discount = order.discount ?? order.sale;
  const details: Array<[string, string]> = [
    ["Order ID", order.id], ["Purchase", order.planName],
    ["Status when prepared", "Awaiting payment"], ["Payment app", instructions.appName],
    ...(discount ? [["Original price", usd(discount.originalAmountUsdCents)], ["Discount", usd(discount.discountAmountUsdCents)],
      ...(order.discount ? [["Coupon", order.discount.code]] : [])] as Array<[string, string]> : []),
    ["Purchase price", usd(order.amountUsdCents)], ["cruush processing fee", usd(order.gasFeeUsdCents ?? 0)],
    ["Order total", usd(order.amountUsdCents + (order.gasFeeUsdCents ?? 0))],
    ["Send exactly", `${walletEmailAmount(order)} ${order.asset}`], ["Network", instructions.network],
    ["Payment wallet ID", order.paymentAddress!], ["Order created", date(order.createdAt)],
    ["Payment deadline", date(order.expiresAt)],
  ];
  const privacy = "Your order gets its own payment address so cruush can match the transfer to your order. Creating it does not move money or give us control of your wallet. We never ask for your private key or recovery phrase. Your order is linked to your cruush account; blockchain transfers are public and your payment app may keep its own records. This is not an anonymous payment.";
  const refunds = "We offer voluntary refunds for paid orders that were not applied or for technical checkout issues. Contact payment support for a review.";
  const thanks = "cruush is self-funded. Thank you for supporting the app.";
  const help = "If your payment app says sent but your order is still unconfirmed after 30 minutes, use the payment support link below. Do not pay again while we check it.";
  const link = (url: string, label: string) => `<a href="${escapeHtml(url)}" style="color:#ff6bb0;text-decoration:underline;">${label}</a>`;
  const wordmark = `<span style="font-family:'Iowan Old Style','Baskerville','Times New Roman',serif;font-style:italic;font-weight:400;">sovereignpay</span>`;
  const html = defaultEmailHtml({
    title: subject,
    intro: "Your order’s payment address is ready. No money has moved just by creating this order.",
    buttonUrl: escapeHtml(checkout),
    buttonLabel: "Return to checkout",
    body: `<div>
      <h2 class="feature-title" style="margin:28px 0 12px;color:#fff;font-size:30px;line-height:1.15;font-weight:700;">Your order</h2>
      ${details.map(([label, value]) => `<p class="feature-copy" style="margin:0 0 16px;color:#eeeef2;font-size:18px;line-height:1.62;overflow-wrap:anywhere;word-break:break-word;"><strong>${escapeHtml(label)}</strong><br>${escapeHtml(value)}</p>`).join("")}
      <h2 class="feature-title" style="margin:28px 0 12px;color:#fff;font-size:30px;line-height:1.15;font-weight:700;">How to pay with ${escapeHtml(instructions.appName)}</h2>
      ${instructions.appUrl ? `<p>${link(instructions.appUrl, `Open ${instructions.appName}`)}</p>` : ""}
      ${instructions.guideUrl ? `<p>${link(instructions.guideUrl, `${instructions.appName} transfer guide`)}</p>` : ""}
      ${steps.map((step, i) => `<p class="feature-copy" style="margin:0 0 24px;color:#eeeef2;font-size:18px;line-height:1.62;">${i + 1}. ${escapeHtml(step)}</p>`).join("")}
      <h2 class="feature-title" style="margin:28px 0 12px;color:#fff;font-size:30px;line-height:1.15;font-weight:700;">Secure checkout by ${wordmark}</h2><p class="feature-copy" style="margin:0 0 24px;color:#eeeef2;font-size:18px;line-height:1.62;">${privacy}</p>
      <p class="feature-copy" style="margin:0 0 24px;color:#eeeef2;font-size:18px;line-height:1.62;">${link(security, "How cruush protects your payment")}<br>${link(guide, "How to pay with PayPal, Venmo or a crypto wallet")}<br>${link(why, "Why cruush takes crypto")}</p>
      <h2 class="feature-title" style="margin:28px 0 12px;color:#fff;font-size:30px;line-height:1.15;font-weight:700;">One payment, no automatic renewal</h2><p class="feature-copy" style="margin:0 0 24px;color:#eeeef2;font-size:18px;line-height:1.62;">${access}</p>
      <p class="feature-copy" style="margin:0 0 24px;color:#eeeef2;font-size:18px;line-height:1.62;">${help}</p><p class="feature-copy" style="margin:0 0 24px;color:#eeeef2;font-size:18px;line-height:1.62;">${link(history, "View your order history")} · ${link(`${base}/support?billing=payment`, "Payment support")}</p><p class="feature-copy" style="margin:0 0 24px;color:#eeeef2;font-size:18px;line-height:1.62;">${refunds} ${link(`${base}/support?billing=payment`, "Submit a billing issue")} or email ${link("mailto:reports@cruush.app", "reports@cruush.app")}.</p><p class="feature-copy" style="margin:0 0 24px;color:#eeeef2;font-size:18px;line-height:1.62;">${thanks}</p>
    </div>`
  });
  const text = [subject, "Your order’s payment address is ready. No money has moved just by creating this order.", `Return to checkout: ${checkout}`, `Order history: ${history}`, "Your order", ...details.map(([label, value]) => `${label}: ${value}`), `How to pay with ${instructions.appName}`, ...(instructions.appUrl ? [`Open ${instructions.appName}: ${instructions.appUrl}`] : []), ...(instructions.guideUrl ? [`Transfer guide: ${instructions.guideUrl}`] : []), ...steps.map((s, i) => `${i + 1}. ${s}`), "Secure checkout by sovereignpay", privacy, `How cruush protects your payment: ${security}`, `Payment guide: ${guide}`, `Why cruush takes crypto: ${why}`, access, help, refunds, `Submit a billing issue: ${base}/support?billing=payment`, "Or email reports@cruush.app.", thanks].join("\n\n");
  return { subject, html, text };
}

export async function sendOrderWalletReadyEmail(input: {
  config: AppConfig; email: string; idempotencyKey: string; logger: FastifyBaseLogger;
  content: ReturnType<typeof buildOrderWalletReadyEmail>;
}) {
  if (!input.config.RESEND_API_KEY || !input.config.MAIL_FROM) return { accepted: false, providerMessageId: null };
  const delivery = await sendResendEmail({ ...input, ...input.content,
    redactRecipientInFailureLog: true, failureMessage: "Order wallet email failed." });
  return { accepted: true, providerMessageId: delivery.providerMessageId };
}


export function buildOrderPaymentConfirmationEmail(appUrl: string, order: {
  id: string; planName: string; productType: string; amountUsdCents: number;
  accessExpiresAt: string | Date | null;
}) {
  const base = appUrl.replace(/\/$/, "");
  if (!Number.isSafeInteger(order.amountUsdCents) || order.amountUsdCents < 0) throw new Error("Invalid order amount.");
  const pulse = order.productType === "ping_pack";
  const expires = order.accessExpiresAt
    ? new Date(order.accessExpiresAt).toISOString().replace("T", " ").replace(/\.\d{3}Z$/, " UTC") : null;
  const subject = "Your cruush payment is confirmed";
  const intro = pulse ? "Payment confirmed. Your Pulses have been added to your account."
    : expires ? `Payment confirmed. Your cruush+ time is active until ${expires}.`
    : "Payment confirmed. Your lifetime cruush+ access is active and does not expire.";
  const access = pulse ? "Your Pulse credits do not expire. View your purchase in order history."
    : "See your remaining time in the cruush+ time capsule in the app. This was a one-time payment; nothing renews automatically.";
  const destination = `${base}${pulse ? "/settings/orders" : "/rewards"}`;
  const support = "If your order was not applied or you had a technical checkout issue, contact us. We offer voluntary refunds for these issues.";
  const text = [subject, intro, `Order ID: ${order.id}`, `Purchase: ${order.planName}`,
    `Purchase price: $${(order.amountUsdCents / 100).toFixed(2)} USD`, access, destination,
    `Order history: ${base}/settings/orders`, support, `Billing issues: ${base}/support?billing=payment`,
    "Or email reports@cruush.app."].join("\n\n");
  const paragraph = (content: string) => `<p class="feature-copy" style="margin:0 0 24px;color:#eeeef2;font-size:18px;line-height:1.62;">${content}</p>`;
  const link = (url: string, label: string) => `<a href="${escapeHtml(url)}" style="color:#ff6bb0;text-decoration:underline;">${escapeHtml(label)}</a>`;
  const html = defaultEmailHtml({ title: subject, intro: escapeHtml(intro),
    buttonUrl: escapeHtml(destination), buttonLabel: pulse ? "View your order" : "View your remaining time",
    body: paragraph(`<strong>Purchase</strong><br>${escapeHtml(order.planName)}`)
      + paragraph(`<strong>Order ID</strong><br>${escapeHtml(order.id)}`)
      + paragraph(`<strong>Purchase price</strong><br>$${(order.amountUsdCents / 100).toFixed(2)} USD`)
      + paragraph(escapeHtml(access)) + paragraph(link(`${base}/settings/orders`, "View your order history"))
      + paragraph(`${escapeHtml(support)} ${link(`${base}/support?billing=payment`, "Submit a billing issue")} or email ${link("mailto:reports@cruush.app", "reports@cruush.app")}.`) });
  return { subject, html, text };
}

export async function sendOrderPaymentConfirmationEmail(input: {
  config: AppConfig; email: string; idempotencyKey: string; logger: FastifyBaseLogger;
  content: ReturnType<typeof buildOrderPaymentConfirmationEmail>;
}) {
  if (!input.config.RESEND_API_KEY || !input.config.MAIL_FROM) return { accepted: false, providerMessageId: null };
  const delivery = await sendResendEmail({ ...input, ...input.content,
    redactRecipientInFailureLog: true, failureMessage: "Order confirmation email failed." });
  return { accepted: true, providerMessageId: delivery.providerMessageId };
}
