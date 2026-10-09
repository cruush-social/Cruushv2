import type { FastifyInstance } from "fastify";
import type { DbClient } from "./db.js";
import type { AccountStatus } from "./account-status.js";

export const OWNER_FULL_ACCESS_EMAIL = "julienlenazny@gmail.com";

const OWNER_FULL_ACCESS_EMAILS = new Set([OWNER_FULL_ACCESS_EMAIL]);

export function normalizeOwnerAccessEmail(email: string | null | undefined) {
  return (email ?? "").trim().toLowerCase();
}

export function isOwnerFullAccessEmail(email: string | null | undefined) {
  return OWNER_FULL_ACCESS_EMAILS.has(normalizeOwnerAccessEmail(email));
}

export function ownerCanBypassAccountStatus(email: string | null | undefined, accountStatus: AccountStatus) {
  return ownerFullAccessCanBypassAccountStatus(isOwnerFullAccessEmail(email), accountStatus);
}

export function ownerFullAccessCanBypassAccountStatus(ownerFullAccess: boolean, accountStatus: AccountStatus) {
  return ownerFullAccess && accountStatus !== "deleted";
}

export async function dbUserHasOwnerFullAccess(db: DbClient, userId: string) {
  const result = await db.query<{ email: string | null }>(
    `select email
     from app_users
     where id = $1
     limit 1`,
    [userId]
  );

  return isOwnerFullAccessEmail(result.rows[0]?.email);
}

export async function userHasOwnerFullAccess(app: FastifyInstance, userId: string) {
  return dbUserHasOwnerFullAccess(app.db, userId);
}
