import {
  createCipheriv,
  createDecipheriv,
  randomBytes
} from "node:crypto";
import { generateSecret, generateURI, verify } from "otplib";
import QRCode from "qrcode";
import type { FastifyInstance } from "fastify";
import type { AppConfig } from "./config.js";
import { deriveKey } from "./crypto-keys.js";
import { runTransaction, type DbClient } from "./db.js";
import { ApiError } from "./errors.js";
import { hashPassword, verifyPassword } from "./auth.js";
import { loadRewardConfig } from "./reward-config.js";
import { insertTrustEvent, recalculateTrustProfile } from "./trust-engine.js";

type TwoFactorRow = {
  user_id: string;
  secret_ciphertext: string;
  secret_nonce: string;
  secret_auth_tag: string;
  secret_key_version: string;
  enabled_at: string | Date | null;
  setup_created_at: string | Date;
  trust_awarded_at: string | Date | null;
  last_used_time_step: string | number | null;
};

type CredentialRow = {
  email: string;
  password_hash: string;
};

function encryptionSecret(config: AppConfig) {
  return config.TWO_FACTOR_ENCRYPTION_KEY || config.SESSION_SECRET;
}

function encryptSecret(config: AppConfig, secret: string) {
  const keyVersion = config.TWO_FACTOR_ENCRYPTION_KEY_VERSION || "v1";
  const key = deriveKey(encryptionSecret(config), "two-factor-totp", keyVersion);
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  const ciphertext = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);

  return {
    ciphertext: ciphertext.toString("base64"),
    nonce: nonce.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
    keyVersion
  };
}

function decryptSecret(config: AppConfig, row: TwoFactorRow) {
  const key = deriveKey(encryptionSecret(config), "two-factor-totp", row.secret_key_version);
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(row.secret_nonce, "base64"));
  decipher.setAuthTag(Buffer.from(row.secret_auth_tag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(row.secret_ciphertext, "base64")),
    decipher.final()
  ]).toString("utf8");
}

function recoveryCode() {
  return randomBytes(8)
    .toString("base64url")
    .replace(/[^A-Za-z0-9]/g, "")
    .slice(0, 10)
    .toUpperCase()
    .replace(/^(.{5})(.{5})$/, "$1-$2");
}

async function loadTwoFactorForUpdate(db: DbClient, userId: string) {
  const result = await db.query<TwoFactorRow>(
    `select user_id::text, secret_ciphertext, secret_nonce, secret_auth_tag,
       secret_key_version, enabled_at, setup_created_at, trust_awarded_at,
       last_used_time_step
     from user_two_factor_auth
     where user_id = $1
     for update`,
    [userId]
  );
  return result.rows[0] ?? null;
}

async function verifyTotpRow(
  db: DbClient,
  config: AppConfig,
  row: TwoFactorRow,
  token: string,
  updateReplayState = true
) {
  if (!/^\d{6}$/.test(token)) {
    return false;
  }

  const lastTimeStep = row.last_used_time_step == null
    ? undefined
    : Number(row.last_used_time_step);
  const result = await verify({
    secret: decryptSecret(config, row),
    token,
    epochTolerance: 30,
    ...(lastTimeStep === undefined ? {} : { afterTimeStep: lastTimeStep })
  });

  if (!result.valid) {
    return false;
  }

  if (updateReplayState) {
    const timeStep = "timeStep" in result
      ? result.timeStep
      : Math.floor(Date.now() / 1000 / 30);
    await db.query(
      `update user_two_factor_auth
       set last_used_time_step = $2, updated_at = now()
       where user_id = $1`,
      [row.user_id, timeStep]
    );
  }

  return true;
}

async function verifyRecoveryCode(db: DbClient, userId: string, token: string) {
  const result = await db.query<{ id: string; code_hash: string }>(
    `select id::text, code_hash
     from user_two_factor_recovery_codes
     where user_id = $1 and used_at is null
     for update`,
    [userId]
  );

  for (const code of result.rows) {
    if (await verifyPassword(token.toUpperCase(), code.code_hash)) {
      await db.query(
        `update user_two_factor_recovery_codes
         set used_at = now()
         where id = $1 and used_at is null`,
        [code.id]
      );
      return true;
    }
  }

  return false;
}

async function requirePassword(db: DbClient, userId: string, password: string) {
  const result = await db.query<CredentialRow>(
    "select email, password_hash from app_users where id = $1 limit 1",
    [userId]
  );
  const credential = result.rows[0];

  if (!credential || !await verifyPassword(password, credential.password_hash)) {
    throw new ApiError(401, "AUTH_REQUIRED", "Current password is incorrect.");
  }

  return credential;
}

async function createRecoveryCodes(db: DbClient, userId: string) {
  const codes = Array.from({ length: 10 }, recoveryCode);
  const hashes = await Promise.all(codes.map((code) => hashPassword(code)));
  await db.query(
    "delete from user_two_factor_recovery_codes where user_id = $1",
    [userId]
  );

  for (const hash of hashes) {
    await db.query(
      `insert into user_two_factor_recovery_codes (user_id, code_hash)
       values ($1, $2)`,
      [userId, hash]
    );
  }

  return codes;
}

export async function getTwoFactorStatus(
  app: Pick<FastifyInstance, "db">,
  userId: string
) {
  const result = await app.db.query<{
    enabled_at: string | Date | null;
    recovery_codes_remaining: number;
  }>(
    `select
       two_factor.enabled_at,
       count(recovery.id) filter (where recovery.used_at is null)::int as recovery_codes_remaining
     from user_two_factor_auth two_factor
     left join user_two_factor_recovery_codes recovery
       on recovery.user_id = two_factor.user_id
     where two_factor.user_id = $1
     group by two_factor.enabled_at`,
    [userId]
  );
  const row = result.rows[0];

  return {
    enabled: Boolean(row?.enabled_at),
    enabledAt: row?.enabled_at ? new Date(row.enabled_at).toISOString() : null,
    recoveryCodesRemaining: Number(row?.recovery_codes_remaining ?? 0)
  };
}

export async function startTwoFactorSetup(
  app: Pick<FastifyInstance, "db" | "config">,
  userId: string,
  password: string
) {
  return runTransaction(app.db, async (db) => {
    const credential = await requirePassword(db, userId, password);
    const existing = await loadTwoFactorForUpdate(db, userId);

    if (existing?.enabled_at) {
      throw new ApiError(409, "VALIDATION_ERROR", "Two-factor authentication is already enabled.");
    }

    const secret = generateSecret({ length: 20 });
    const encrypted = encryptSecret(app.config, secret);
    await db.query(
      `insert into user_two_factor_auth (
         user_id, secret_ciphertext, secret_nonce, secret_auth_tag,
         secret_key_version, setup_created_at
       )
       values ($1, $2, $3, $4, $5, now())
       on conflict (user_id) do update
       set secret_ciphertext = excluded.secret_ciphertext,
           secret_nonce = excluded.secret_nonce,
           secret_auth_tag = excluded.secret_auth_tag,
           secret_key_version = excluded.secret_key_version,
           enabled_at = null,
           setup_created_at = now(),
           last_used_time_step = null,
           updated_at = now()`,
      [
        userId,
        encrypted.ciphertext,
        encrypted.nonce,
        encrypted.authTag,
        encrypted.keyVersion
      ]
    );
    const uri = generateURI({
      issuer: "cruush",
      label: credential.email,
      secret
    });

    return {
      secret,
      otpauthUri: uri,
      qrCodeDataUrl: await QRCode.toDataURL(uri, {
        errorCorrectionLevel: "M",
        margin: 2,
        width: 256
      })
    };
  });
}

export async function completeTwoFactorSetup(
  app: Pick<FastifyInstance, "db" | "config">,
  userId: string,
  token: string
) {
  const rewardConfig = await loadRewardConfig(app.db);

  return runTransaction(app.db, async (db) => {
    const row = await loadTwoFactorForUpdate(db, userId);

    if (!row || row.enabled_at) {
      throw new ApiError(400, "VALIDATION_ERROR", "Start two-factor setup first.");
    }

    if (new Date(row.setup_created_at).getTime() < Date.now() - 15 * 60 * 1000) {
      throw new ApiError(400, "VALIDATION_ERROR", "Two-factor setup expired. Start again.");
    }

    if (!await verifyTotpRow(db, app.config, row, token)) {
      throw new ApiError(400, "INVALID_TWO_FACTOR_CODE", "Authenticator code is invalid.");
    }

    const recoveryCodes = await createRecoveryCodes(db, userId);
    await db.query(
      `update user_two_factor_auth
       set enabled_at = now(), updated_at = now()
       where user_id = $1`,
      [userId]
    );

    if (!row.trust_awarded_at && rewardConfig.twoFactorTrustPoints > 0) {
      await insertTrustEvent(db, {
        userId,
        eventType: "two_factor_enabled",
        value: rewardConfig.twoFactorTrustPoints,
        decays: false,
        permanent: true,
        source: "system",
        idempotencyKey: `two-factor-enabled:${userId}`,
        metadata: { method: "totp" }
      });
      await recalculateTrustProfile(db, userId);
      await db.query(
        `update user_two_factor_auth
         set trust_awarded_at = now(), updated_at = now()
         where user_id = $1`,
        [userId]
      );
    }

    return {
      enabled: true,
      recoveryCodes
    };
  });
}

export async function verifyLoginSecondFactor(
  app: Pick<FastifyInstance, "db" | "config">,
  userId: string,
  token: string | undefined
) {
  return runTransaction(app.db, async (db) => {
    const row = await loadTwoFactorForUpdate(db, userId);

    if (!row?.enabled_at) {
      return false;
    }

    if (!token) {
      throw new ApiError(401, "TWO_FACTOR_REQUIRED", "Enter your authenticator or recovery code.");
    }

    const valid = await verifyTotpRow(db, app.config, row, token) ||
      await verifyRecoveryCode(db, userId, token);

    if (!valid) {
      throw new ApiError(401, "INVALID_TWO_FACTOR_CODE", "Two-factor code is invalid.");
    }

    return true;
  });
}

export async function regenerateRecoveryCodes(
  app: Pick<FastifyInstance, "db" | "config">,
  userId: string,
  input: { password: string; token: string }
) {
  return runTransaction(app.db, async (db) => {
    await requirePassword(db, userId, input.password);
    const row = await loadTwoFactorForUpdate(db, userId);

    if (!row?.enabled_at || !await verifyTotpRow(db, app.config, row, input.token)) {
      throw new ApiError(401, "INVALID_TWO_FACTOR_CODE", "Authenticator code is invalid.");
    }

    return {
      recoveryCodes: await createRecoveryCodes(db, userId)
    };
  });
}

export async function disableTwoFactor(
  app: Pick<FastifyInstance, "db" | "config">,
  userId: string,
  input: { password: string; token: string }
) {
  return runTransaction(app.db, async (db) => {
    await requirePassword(db, userId, input.password);
    const row = await loadTwoFactorForUpdate(db, userId);

    if (!row?.enabled_at) {
      throw new ApiError(400, "VALIDATION_ERROR", "Two-factor authentication is not enabled.");
    }

    const valid = await verifyTotpRow(db, app.config, row, input.token) ||
      await verifyRecoveryCode(db, userId, input.token);

    if (!valid) {
      throw new ApiError(401, "INVALID_TWO_FACTOR_CODE", "Two-factor code is invalid.");
    }

    await db.query(
      `update user_two_factor_auth
       set enabled_at = null, last_used_time_step = null, updated_at = now()
       where user_id = $1`,
      [userId]
    );
    await db.query(
      "delete from user_two_factor_recovery_codes where user_id = $1",
      [userId]
    );
    return { disabled: true };
  });
}
