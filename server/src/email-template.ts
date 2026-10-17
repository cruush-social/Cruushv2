// Default email shell copied from the exact sent v2.4.1 release HTML.
// Source SHA256: adf94240034bbe01539b5f63e19393105f37dbdf046eb07005dd325ced5cb1e0.
export const DEFAULT_EMAIL_TEMPLATE_VERSION = "release-v2.4.1";

// Inputs are trusted generated markup or HTML-escaped by the mailer.
export function defaultEmailHtml(input: { title: string; heading?: string; intro?: string; buttonUrl?: string; buttonLabel?: string; body: string; footerHtml?: string }) {
  return `<!doctype html>
<html dir="ltr" lang="en">
  <head>
    <meta charset="utf-8" />
    <meta content="width=device-width" name="viewport" />
    <meta name="x-apple-disable-message-reformatting" />
    <meta content="IE=edge" http-equiv="X-UA-Compatible" />
    <meta content="telephone=no,address=no,email=no,date=no,url=no" name="format-detection" />
    <title>${input.title}</title>
    <style>
      .email-content { color:#eeeef2;font-size:18px;line-height:1.62;overflow-wrap:anywhere; }
      .email-content a { color:#ff6bb0; }
      .email-content table { max-width:100%; }
      @media only screen and (max-width: 620px) {
        .email-frame { padding: 24px 12px !important; }
        .glass-panel { padding: 26px 20px !important; }
        .hero-title { font-size: 40px !important; line-height: 1 !important; }
        .feature-title { font-size: 27px !important; }
        .feature-copy, .email-content { font-size: 16px !important; }
        .feature-shot { width: 100% !important; max-width: 360px !important; }
      }
    </style>
  </head>
  <body dir="ltr" lang="en" style="margin:0;background:#050507;color:#fff;font-family:Georgia,'Times New Roman',serif;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">
      ${input.intro ?? ''}
    </div>
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#050507;">
      <tr>
        <td
          class="email-frame"
          align="center"
          style="padding:32px 16px;background:radial-gradient(circle at 50% 112%,rgba(111,0,255,.38),transparent 40%),radial-gradient(circle at 16% 8%,rgba(255,0,114,.18),transparent 29%),radial-gradient(circle at 86% 12%,rgba(17,129,255,.17),transparent 31%),#080808;background-size:100% 950px,100% 950px,100% 950px;background-position:center bottom,center top,center top;background-repeat:no-repeat;"
        >
          <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="max-width:600px;">
            <tr>
              <td align="center" style="padding:0 0 22px;">
                <img
                  src="https://cruush.app/email/cruush-logo-no-notch.png"
                  alt="cruush"
                  width="100"
                  height="104"
                  style="display:block;margin:0 auto;border:0;border-radius:0;mix-blend-mode:screen;object-fit:contain;"
                />
              </td>
            </tr>
            <tr>
              <td
                class="glass-panel"
                style="padding:30px 28px;border:1px solid rgba(255,255,255,.18);border-radius:22px;background:rgba(0,0,0,.02);background-image:linear-gradient(180deg,rgba(255,255,255,.026),rgba(255,255,255,0));box-shadow:0 0 2px 1px rgba(255,255,255,.35) inset,0 0 10px 4px rgba(255,255,255,.15) inset,0 18px 48px rgba(0,0,0,.38);backdrop-filter:blur(22px) saturate(1.48);-webkit-backdrop-filter:blur(22px) saturate(1.48);"
              >
<h1 class="hero-title" style="margin:0 0 18px;color:#fff;font-size:50px;line-height:.98;font-weight:700;letter-spacing:-.035em;">${input.heading ?? input.title}</h1>
${input.intro ? `<p class="feature-copy" style="margin:0 0 24px;color:#eeeef2;font-size:18px;line-height:1.62;">${input.intro}</p>` : ''}
${input.buttonUrl && input.buttonLabel ? `<table cellpadding="0" cellspacing="0" role="presentation"><tr><td bgcolor="#3826FF" style="border-radius:999px;background:#3826FF;background-image:linear-gradient(90deg, #FF0072 6.08%, #6F00FF 43.11%, #3826FF 58.46%, #004BFF 73.81%, #1181FF 100%);box-shadow:0 0 0 1px rgba(255,255,255,.26) inset,0 8px 24px rgba(255,0,114,.28);"><a href="${input.buttonUrl}" rel="noopener noreferrer nofollow" target="_blank" style="display:inline-block;padding:13px 22px;color:#fff;text-decoration:none;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:700;">${input.buttonLabel}</a></td></tr></table>` : ''}
<div class="email-content" style="color:#eeeef2;font-size:18px;line-height:1.62;overflow-wrap:anywhere;">${input.body}</div>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:22px 10px 0;color:#898995;font-size:12px;line-height:1.6;">
                ${input.footerHtml ?? 'Comments? Questions? Concerns?<br /><a href="mailto:hello@cruush.app" style="color:#c7c7d0;">hello@cruush.app</a><br />'}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}
