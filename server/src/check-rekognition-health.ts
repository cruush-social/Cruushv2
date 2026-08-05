// Probes Amazon Rekognition with a real request and emails an alert when it fails.
//
// Photo moderation now fails closed: if Rekognition cannot score an image the upload is
// refused. That is the safe direction, but it makes Rekognition a hard dependency, and a
// broken credential looks identical to a quiet night unless something checks. Run this on
// a schedule so a failure reaches a person instead of only reaching the logs.
//
//   pnpm --dir server health:rekognition
//
// Exits 0 when healthy, 1 when not, so a cron or uptime checker can act on the status
// even if email delivery is itself broken.

import { DetectLabelsCommand, RekognitionClient } from "@aws-sdk/client-rekognition";
import sharp from "sharp";

// Deliberately reads process.env directly rather than going through loadConfig(). A
// health probe has to keep working when the app config is the thing that is broken, and
// validating the entire schema would make this refuse to run for reasons unrelated to
// Rekognition.
const config = {
  PROFILE_PHOTO_REKOGNITION_ENABLED: process.env.PROFILE_PHOTO_REKOGNITION_ENABLED === "true",
  PROFILE_PHOTO_REKOGNITION_REGION: process.env.PROFILE_PHOTO_REKOGNITION_REGION ?? "",
  RESEND_API_KEY: process.env.RESEND_API_KEY ?? "",
  MAIL_FROM: process.env.MAIL_FROM ?? "",
  TRUST_SAFETY_ALERT_EMAIL: process.env.TRUST_SAFETY_ALERT_EMAIL ?? "",
  SUPPORT_INBOX_EMAIL: process.env.SUPPORT_INBOX_EMAIL ?? ""
};

// A 64x64 solid image. Rekognition returns few or no labels for it, which is fine: this
// checks that credentials, permissions and the endpoint all work, not what is in the
// picture.
async function probeImage() {
  return sharp({
    create: { width: 64, height: 64, channels: 3, background: { r: 128, g: 128, b: 128 } }
  }).jpeg().toBuffer();
}

function alertRecipient() {
  return config.TRUST_SAFETY_ALERT_EMAIL || config.SUPPORT_INBOX_EMAIL || "";
}

async function sendAlert(subject: string, body: string) {
  const to = alertRecipient();

  if (!config.RESEND_API_KEY || !config.MAIL_FROM || !to) {
    console.error("Rekognition alert not sent: RESEND_API_KEY, MAIL_FROM or an alert recipient is missing.");
    return;
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.RESEND_API_KEY}`
    },
    body: JSON.stringify({
      from: config.MAIL_FROM,
      to: [to],
      subject,
      text: body,
      html: `<pre style="font-family:ui-monospace,monospace;white-space:pre-wrap">${body
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")}</pre>`
    })
  });

  if (!response.ok) {
    console.error(`Rekognition alert email failed: ${response.status} ${await response.text()}`);
    return;
  }

  console.error(`Rekognition alert emailed to ${to}.`);
}

async function main() {
  if (!config.PROFILE_PHOTO_REKOGNITION_ENABLED) {
    console.log("Rekognition is disabled; nothing to check.");
    return;
  }

  const region = config.PROFILE_PHOTO_REKOGNITION_REGION || "us-east-1";
  const client = new RekognitionClient({ region });
  const startedAt = Date.now();

  try {
    await client.send(new DetectLabelsCommand({
      Image: { Bytes: await probeImage() },
      MaxLabels: 1,
      MinConfidence: 99
    }));
    console.log(`Rekognition OK in ${region} (${Date.now() - startedAt}ms).`);
  } catch (error) {
    const name = error instanceof Error ? error.name : "UnknownError";
    const message = error instanceof Error ? error.message : String(error);
    const body = [
      "Amazon Rekognition is not answering, so cruush cannot screen photos.",
      "",
      "Photo moderation fails closed, which means profile and message photo uploads are",
      "being REFUSED right now with 'We could not check this photo for harmful content.'",
      "",
      `Region:  ${region}`,
      `Error:   ${name}`,
      `Message: ${message}`,
      `Elapsed: ${Date.now() - startedAt}ms`,
      "",
      "Most likely causes: the AWS access key was rotated and only half the pair was",
      "updated, the key was disabled, or the IAM user lost rekognition:DetectLabels.",
      "Check AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY on the cruush-api application."
    ].join("\n");

    console.error(body);
    await sendAlert("[cruush] Rekognition is down - photo uploads are being refused", body);
    process.exitCode = 1;
  }
}

await main();
