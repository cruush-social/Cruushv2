type AudienceConfig = {
  APP_DEPLOYMENT_STAGE?: string;
  RESEND_API_KEY?: string;
  RESEND_CRUUSH_APP_AUDIENCE_ID?: string;
};

export async function syncVerifiedMemberToResendAudience(input: { config: AudienceConfig; email: string; logger: { warn: (context: unknown, message: string) => void } }) {
  const { config, email, logger } = input;
  if (config.APP_DEPLOYMENT_STAGE !== "production" || !config.RESEND_API_KEY || !config.RESEND_CRUUSH_APP_AUDIENCE_ID) return;
  const base = `https://api.resend.com/audiences/${encodeURIComponent(config.RESEND_CRUUSH_APP_AUDIENCE_ID)}/contacts`;
  const headers = { Authorization: `Bearer ${config.RESEND_API_KEY}` };
  try {
    const existing = await fetch(`${base}/${encodeURIComponent(email)}`, { headers });
    if (existing.ok) return;
    if (existing.status !== 404) throw new Error(`lookup_${existing.status}`);
    const created = await fetch(base, { method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify({ email }) });
    if (!created.ok && created.status !== 409) throw new Error(`create_${created.status}`);
  } catch (error) {
    logger.warn({ email, error: error instanceof Error ? error.message : "unknown" }, "verified member audience sync failed");
  }
}
