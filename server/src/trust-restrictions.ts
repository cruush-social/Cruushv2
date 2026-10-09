import type { DbClient } from "./db.js";
import { OWNER_FULL_ACCESS_EMAIL } from "./owner-access.js";
import { estimateTrustRecoveryAt } from "./trust-engine.js";

const FEATURES = {
  direct_messages: { restriction: "direct_messages", ownerExempt: true, adminExempt: true },
  group_messages: { restriction: "group_messages", ownerExempt: true, adminExempt: true },
  group_creation: { restriction: "group_creation", ownerExempt: true, adminExempt: false },
  photo_uploads: { restriction: "photo_uploads", ownerExempt: true, adminExempt: false },
  feed_posting: { restriction: "feed_posting", ownerExempt: true, adminExempt: false },
  pink_book: { restriction: "feed_posting", ownerExempt: false, adminExempt: false },
  map_pings: { restriction: "map_visibility", ownerExempt: false, adminExempt: false },
  direct_message_photos: { restriction: "direct_messages", ownerExempt: true, adminExempt: false },
  group_message_photos: { restriction: "group_messages", ownerExempt: true, adminExempt: false },
  favorite_images: { restriction: null, ownerExempt: true, adminExempt: true },
} as const;

export async function getTrustRestrictions(db: DbClient, userId: string, now = new Date()) {
  const profile = (await db.query<{
    trust_score: number; max_future_trust: number | null; suspended: boolean;
    account_status: string; owner_exempt: boolean; admin: boolean; active_suspensions: number;
  }>(
    `select coalesce(trust.trust_score, 50) as trust_score, trust.max_future_trust,
       coalesce(trust.is_suspended, false) as suspended, u.account_status,
       lower(trim(coalesce(u.email, ''))) = $2 as owner_exempt, exists (
         select 1 from moderator_users moderator where moderator.user_id = u.id and moderator.role = 'admin'
       ) as admin,
       (select count(*)::int from suspensions s where s.user_id = u.id
         and (s.permanent or s.ends_at is null or s.ends_at > $3)) as active_suspensions
     from app_users u left join user_trust_profiles trust on trust.user_id = u.id where u.id = $1`,
    [userId, OWNER_FULL_ACCESS_EMAIL, now]
  )).rows[0];
  if (!profile) throw new Error("Account not found.");

  const lowTrust = profile.trust_score <= 20;
  const restrictions = (await db.query<{ feature: string; starts_at: Date | string; ends_at: Date | string | null }>(
    "select feature, starts_at, ends_at from feature_restrictions where user_id = $1 and (ends_at is null or ends_at > $2)",
    [userId, now]
  )).rows;
  let recovery: Date | null = now;
  if (lowTrust) {
    const events = (await db.query<{ value: number; decays: boolean; permanent: boolean; created_at: Date | string }>(
      "select value, decays, permanent, created_at from trust_events where user_id = $1", [userId]
    )).rows.map((event) => ({ ...event, value: Number(event.value), createdAt: new Date(event.created_at) }));
    recovery = estimateTrustRecoveryAt(events, profile.max_future_trust, now);
    // A stored score that has not yet been refreshed has no known unlock time.
    if (recovery && recovery.getTime() <= now.getTime()) recovery = null;
  }
  const features = Object.fromEntries(Object.entries(FEATURES).map(([feature, policy]) => {
    const exempt = (policy.ownerExempt && profile.owner_exempt) || (policy.adminExempt && profile.admin);
    const featureRestrictions = restrictions.filter((item) => item.feature === policy.restriction
      && (feature !== "map_pings" || new Date(item.starts_at).getTime() <= now.getTime()));
    const restricted = !exempt && (lowTrust || featureRestrictions.length > 0);
    const status = { restricted, dueToTrust: restricted && lowTrust, recoveryAt: null as string | null };
    // Do not promise an unlock while an indefinite restriction or suspension remains.
    if (restricted && recovery && !profile.suspended && profile.active_suspensions === 0
      && profile.account_status === "active" && !featureRestrictions.some((item) => item.ends_at == null)) {
      status.recoveryAt = new Date(Math.max(recovery.getTime(),
        ...featureRestrictions.map((item) => new Date(item.ends_at!).getTime()))).toISOString();
    }
    return [feature, status];
  }));
  return { checkedAt: now.toISOString(), features };
}
