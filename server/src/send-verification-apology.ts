/**
 * One-off recovery send for members who signed up, were told to check their
 * email, and never got a working verification link.
 *
 * Signup used to report `verificationEmailSent: true` even when the mailer took
 * its preview branch and nothing was delivered, so the client never offered its
 * resend control. Those members are still sitting on expired tokens. Every
 * verification token is single-use and short-lived, so there is no old link to
 * re-send: each person needs a freshly minted one, which is why this cannot be
 * a Resend broadcast.
 *
 * Dry run by default. Pass --confirm-send to actually deliver.
 *
 *   npx tsx src/send-verification-apology.ts                 # list recipients, send nothing
 *   npx tsx src/send-verification-apology.ts --confirm-send  # deliver
 *
 * Requires DATABASE_URL, RESEND_API_KEY, MAIL_FROM and APP_URL in the
 * environment. Refuses to run without a real Resend key so it can never
 * silently no-op the way signup did.
 */
import { randomBytes, createHash } from "node:crypto";
import pg from "pg";

const { Pool } = pg;

/** Members who signed up on or after this date. Earlier accounts are stale. */
const SIGNUP_CUTOFF = "2026-08-01";

/** Longer than the 24h signup token: these people already missed one window. */
const TOKEN_TTL_MS = 1000 * 60 * 60 * 24 * 7;

/** Resend's published ceiling is higher, but there is no reason to rush 15 sends. */
const DELAY_BETWEEN_SENDS_MS = 600;

const CRUUSH_EMAIL_LOGO_URL = "https://cdn.resend.app/ff1dfa96-8b85-4552-8e56-d09cf53fb13e";

const confirmSend = process.argv.includes("--confirm-send");

function requireEnv(name: string) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} is required. Refusing to run without it.`);
  }

  return value;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Addresses that cannot receive mail. Seed and smoke accounts, plus two real
 * signups whose domains were mistyped and will hard bounce.
 */
function isUndeliverable(email: string) {
  const undeliverablePatterns = [
    /^test\d*@/i,
    /@test\./i,
    /@example\.(com|invalid)$/i,
    /^codex-/i,
    /\.coml$/i,
    /@cruush\.app\.com$/i,
    /@cruush\.local$/i
  ];

  return undeliverablePatterns.some((pattern) => pattern.test(email));
}

function buildApologyHtml(verificationUrl: string) {
  const href = escapeHtml(verificationUrl);

  return `<!DOCTYPE html>
<html dir="ltr" lang="en">
  <head>
    <meta content="width=device-width" name="viewport" />
    <meta content="text/html; charset=UTF-8" http-equiv="Content-Type" />
    <meta name="x-apple-disable-message-reformatting" />
    <title>Your cruush verification link</title>
  </head>
  <body dir="ltr" lang="en" bgcolor="#050507" style="margin:0;padding:0;background-color:#050507;color:#ffffff;font-family:Georgia,'Times New Roman',Times,serif;">
    <table border="0" width="100%" cellpadding="0" cellspacing="0" role="presentation" align="center" bgcolor="#050507" style="width:100%;background-color:#050507;color:#ffffff;">
      <tbody>
        <tr>
          <td align="center" bgcolor="#050507" style="padding:28px 14px;background-color:#050507;color:#ffffff;font-family:Georgia,'Times New Roman',Times,serif;line-height:155%;">
            <table align="center" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" bgcolor="#050507" style="max-width:600px;width:100%;background-color:#050507;color:#ffffff;line-height:155%;">
              <tbody>
                <tr>
                  <td align="center" style="padding:0 0 18px;background-color:#050507;color:#ffffff;">
                    <img alt="cruush" height="156" src="${CRUUSH_EMAIL_LOGO_URL}" style="display:block;outline:none;border:none;text-decoration:none;border-radius:8px;" width="150" />
                  </td>
                </tr>
                <tr>
                  <td align="center" bgcolor="#050507" style="padding:0;background-color:#050507;color:#ffffff;font-family:Georgia,'Times New Roman',Times,serif;text-align:center;">
                    <h1 style="margin:0 0 14px;padding:0;color:#ffffff;font-family:Georgia,'Times New Roman',Times,serif;font-size:34px;line-height:1.15;font-weight:700;text-align:center;">
                      we owe you an apology
                    </h1>

                    <p style="margin:0 0 16px;padding:0;color:#ffffff;font-family:Georgia,'Times New Roman',Times,serif;font-size:17px;line-height:1.55;text-align:center;">
                      You signed up for cruush and we told you to check your email. That verification link either never arrived or had already expired by the time it did. That was our fault, not yours, and it is fixed now.
                    </p>

                    <p style="margin:0 0 20px;padding:0;color:#ffffff;font-family:Georgia,'Times New Roman',Times,serif;font-size:17px;line-height:1.55;text-align:center;">
                      Here is a fresh link. It works for the next 7 days.
                    </p>

                    <table align="center" border="0" cellpadding="0" cellspacing="0" role="presentation" style="margin:0 auto 22px;">
                      <tbody>
                        <tr>
                          <td align="center" bgcolor="#ff0072" style="border-radius:8px;background-color:#ff0072;">
                            <a href="${href}" rel="noopener noreferrer nofollow" target="_blank" style="display:inline-block;padding:13px 22px;color:#ffffff;font-family:Georgia,'Times New Roman',Times,serif;font-size:16px;font-weight:700;text-decoration:none;">
                              Verify my email
                            </a>
                          </td>
                        </tr>
                      </tbody>
                    </table>

                    <p style="margin:0 0 20px;padding:0;color:#ffffff;font-family:Georgia,'Times New Roman',Times,serif;font-size:14px;line-height:1.55;text-align:center;">
                      If the button does not work, paste this into your browser:<br />
                      <a href="${href}" rel="noopener noreferrer nofollow" target="_blank" style="color:#ffffff;text-decoration:underline;word-break:break-all;">${href}</a>
                    </p>

                    <p style="margin:0;padding:0;color:#ffffff;font-family:Georgia,'Times New Roman',Times,serif;font-size:14px;line-height:1.55;text-align:center;">
                      Your account and everything on it is exactly where you left it. If you would rather not continue, ignore this and nothing happens.<br />
                      <a href="mailto:hello@cruush.app" style="color:#ffffff;text-decoration:underline;" target="_blank">hello@cruush.app</a>
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

function buildApologyText(verificationUrl: string) {
  return [
    "We owe you an apology.",
    "",
    "You signed up for cruush and we told you to check your email. That verification link either never arrived or had already expired by the time it did. That was our fault, not yours, and it is fixed now.",
    "",
    "Here is a fresh link. It works for the next 7 days.",
    "",
    verificationUrl,
    "",
    "Your account and everything on it is exactly where you left it. If you would rather not continue, ignore this and nothing happens.",
    "",
    "hello@cruush.app"
  ].join("\n");
}

async function main() {
  const databaseUrl = requireEnv("DATABASE_URL");
  const appUrl = requireEnv("APP_URL");
  const resendApiKey = requireEnv("RESEND_API_KEY");
  const mailFrom = requireEnv("MAIL_FROM");

  const pool = new Pool({ connectionString: databaseUrl });

  try {
    const candidates = await pool.query<{ id: string; email: string; created_at: string }>(
      `select id, email, created_at
         from app_users
        where email_verified_at is null
          and account_status not in ('deleted', 'banned')
          and created_at >= $1
        order by created_at asc`,
      [SIGNUP_CUTOFF]
    );

    const recipients = candidates.rows.filter((row) => !isUndeliverable(row.email));
    const skipped = candidates.rows.filter((row) => isUndeliverable(row.email));

    console.log(`Unverified since ${SIGNUP_CUTOFF}: ${candidates.rows.length}`);
    console.log(`Undeliverable, skipped: ${skipped.length}`);
    skipped.forEach((row) => console.log(`  skip  ${row.email}`));
    console.log(`Will send to: ${recipients.length}`);
    recipients.forEach((row) => console.log(`  send  ${row.email}`));

    if (!confirmSend) {
      console.log("");
      console.log("Dry run. Nothing was sent and no tokens were minted.");
      console.log("Re-run with --confirm-send to deliver.");
      return;
    }

    let delivered = 0;
    let failed = 0;

    for (const recipient of recipients) {
      const token = randomBytes(32).toString("hex");
      const tokenHash = createHash("sha256").update(token).digest("hex");
      const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);

      const client = await pool.connect();

      try {
        await client.query("begin");
        await client.query(
          "delete from email_verification_tokens where user_id = $1",
          [recipient.id]
        );
        await client.query(
          `insert into email_verification_tokens (user_id, token_hash, expires_at)
           values ($1, $2, $3)`,
          [recipient.id, tokenHash, expiresAt.toISOString()]
        );

        const verificationUrl = new URL("/", appUrl);
        verificationUrl.searchParams.set("verifyEmailToken", token);
        const href = verificationUrl.toString();

        const response = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${resendApiKey}`
          },
          body: JSON.stringify({
            from: mailFrom,
            to: [recipient.email],
            subject: "We owe you an apology, and a working cruush link",
            html: buildApologyHtml(href),
            text: buildApologyText(href)
          })
        });

        if (!response.ok) {
          // The token is rolled back with the transaction, so a failed send
          // never leaves a live token nobody was told about.
          await client.query("rollback");
          failed += 1;
          console.error(`  FAIL  ${recipient.email}: ${response.status} ${await response.text()}`);
          continue;
        }

        await client.query("commit");
        delivered += 1;
        console.log(`  sent  ${recipient.email} (expires ${expiresAt.toISOString()})`);
      } catch (error) {
        await client.query("rollback").catch(() => undefined);
        failed += 1;
        console.error(`  FAIL  ${recipient.email}:`, error);
      } finally {
        client.release();
      }

      await new Promise((resolve) => setTimeout(resolve, DELAY_BETWEEN_SENDS_MS));
    }

    console.log("");
    console.log(`Delivered ${delivered}, failed ${failed}.`);
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
