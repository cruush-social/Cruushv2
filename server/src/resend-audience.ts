type AudienceConfig = {
  APP_DEPLOYMENT_STAGE?: string;
  RESEND_API_KEY?: string;
  RESEND_CRUUSH_APP_AUDIENCE_ID?: string;
};

type VerifiedMemberDb = {
  query: <T>(sql: string) => Promise<{ rows: T[] }>;
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

export async function syncAllVerifiedMembersToResendAudience(input: {
  config: AudienceConfig;
  db: VerifiedMemberDb;
  logger: { warn: (context: unknown, message: string) => void; info?: (context: unknown, message: string) => void };
}) {
  if (input.config.APP_DEPLOYMENT_STAGE !== "production" || !input.config.RESEND_API_KEY || !input.config.RESEND_CRUUSH_APP_AUDIENCE_ID) return;
  const result = await input.db.query<{ email: string }>(
    `select email
     from app_users
     where email_verified_at is not null
       and coalesce(account_status, 'active') <> 'deleted'
     order by created_at asc`
  );
  for (const row of result.rows) {
    await syncVerifiedMemberToResendAudience({ config: input.config, email: row.email, logger: input.logger });
  }
  input.logger.info?.({ count: result.rows.length }, "verified member audience reconciliation complete");
}
