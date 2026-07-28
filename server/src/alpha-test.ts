import type { AppConfig } from "./config.js";
import { ApiError } from "./errors.js";
import { verifyPassword } from "./auth.js";

const ALPHA_TEST_ENDED_MESSAGE = "The alpha test has ended.";
const ALPHA_TEST_PASSWORD_MESSAGE = "Enter the alpha password.";

function parseAlphaTestEndsAt(config: AppConfig) {
  if (!config.ALPHA_TEST_ENABLED || !config.ALPHA_TEST_ENDS_AT) {
    return null;
  }

  const endsAt = new Date(config.ALPHA_TEST_ENDS_AT);
  return Number.isNaN(endsAt.getTime()) ? null : endsAt;
}

export function getAlphaTestState(config: AppConfig) {
  const endsAt = parseAlphaTestEndsAt(config);
  const ended = Boolean(endsAt && endsAt.getTime() <= Date.now());

  return {
    enabled: Boolean(config.ALPHA_TEST_ENABLED),
    active: Boolean(config.ALPHA_TEST_ENABLED && !ended),
    endsAt: endsAt ? endsAt.toISOString() : null,
    ended
  };
}

export function isAlphaTestExpired(config: AppConfig) {
  return getAlphaTestState(config).ended;
}

export function ensureAlphaTestActive(config: AppConfig) {
  const state = getAlphaTestState(config);

  if (!state.enabled || state.active) {
    return;
  }

  throw new ApiError(403, "ALPHA_TEST_ENDED", ALPHA_TEST_ENDED_MESSAGE);
}

export async function verifyAlphaTestPassword(config: AppConfig, password: string | undefined) {
  if (!config.ALPHA_TEST_ENABLED) {
    return;
  }

  ensureAlphaTestActive(config);

  if (!password?.trim() || !config.ALPHA_TEST_PASSWORD_HASH) {
    throw new ApiError(403, "ALPHA_TEST_PASSWORD_REQUIRED", ALPHA_TEST_PASSWORD_MESSAGE);
  }

  if (!(await verifyPassword(password.trim(), config.ALPHA_TEST_PASSWORD_HASH))) {
    throw new ApiError(403, "ALPHA_TEST_PASSWORD_REQUIRED", ALPHA_TEST_PASSWORD_MESSAGE);
  }
}

export function getAlphaSessionExpiry(config: AppConfig, fallbackExpiresAt: Date) {
  const endsAt = parseAlphaTestEndsAt(config);

  if (!config.ALPHA_TEST_ENABLED || !endsAt) {
    return fallbackExpiresAt;
  }

  return endsAt.getTime() < fallbackExpiresAt.getTime() ? endsAt : fallbackExpiresAt;
}

export function getSessionMaxAgeSeconds(expiresAt: Date) {
  return Math.max(0, Math.ceil((expiresAt.getTime() - Date.now()) / 1000));
}
