#!/usr/bin/env node
// Turns on the Rekognition fallback classifier that DL Mode depends on.
//
//   node scripts/sync-rekognition-env.mjs --status          # what is set where
//   node scripts/sync-rekognition-env.mjs --set-flags       # flip flags in Coolify
//   node scripts/sync-rekognition-env.mjs --pull-local      # copy AWS keys into server/.env
//
// Reads COOLIFY_API_BASE_URL / COOLIFY_API_TOKEN plus the app UUID from the
// environment; source .env.coolify.local first.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const SECRET_KEYS = new Set(['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_SESSION_TOKEN']);

const FLAGS = {
  PROFILE_PHOTO_REKOGNITION_ENABLED: 'true',
  PROFILE_PHOTO_REKOGNITION_REGION: 'us-east-1',
  PROFILE_PHOTO_REKOGNITION_HUMAN_CONFIDENCE: '90',
  PROFILE_PHOTO_REKOGNITION_ANIMAL_CONFIDENCE: '80',
  PROFILE_PHOTO_REKOGNITION_FACE_CONFIDENCE: '90',
  PROFILE_PHOTO_REKOGNITION_MINIMUM_AGE: '18',
  PROFILE_PHOTO_REKOGNITION_TIMEOUT_MS: '5000',
};

function requireEnv(name) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} is required. Run: source .env.coolify.local`);
  }

  return value;
}

// The API app uuid lives in a different env file than the token, so fall back to
// asking Coolify which application serves the API rather than making the caller
// hunt for it.
let cachedAppUuid = null;

async function appUuid() {
  const configured = process.env.COOLIFY_API_UUID ?? process.env.COOLIFY_PRODUCTION_API_UUID;

  if (configured) {
    return configured;
  }

  if (cachedAppUuid) {
    return cachedAppUuid;
  }

  const apps = await coolify('/applications');
  const candidates = apps.filter((app) => {
    const haystack = `${app.name ?? ''} ${app.fqdn ?? ''}`.toLowerCase();
    return haystack.includes('api') && !haystack.includes('staging');
  });

  if (candidates.length !== 1) {
    const listed = apps.map((app) => `  ${app.uuid}  ${app.name ?? '(unnamed)'}  ${app.fqdn ?? ''}`).join('\n');
    throw new Error(
      `Could not identify the API application automatically (${candidates.length} matches).\n` +
      `Re-run with COOLIFY_API_UUID=<uuid> from this list:\n${listed}`
    );
  }

  cachedAppUuid = candidates[0].uuid;
  console.log(`Using application ${candidates[0].name ?? cachedAppUuid} (${cachedAppUuid})`);
  return cachedAppUuid;
}

async function coolify(pathname, init = {}) {
  const baseUrl = requireEnv('COOLIFY_API_BASE_URL').replace(/\/$/, '');
  const response = await fetch(`${baseUrl}${pathname}`, {
    ...init,
    headers: {
      authorization: `Bearer ${requireEnv('COOLIFY_API_TOKEN')}`,
      'content-type': 'application/json',
      ...(init.headers ?? {}),
    },
  });

  if (!response.ok) {
    throw new Error(`Coolify ${pathname} failed: ${response.status} ${await response.text()}`);
  }

  return response.status === 204 ? null : response.json();
}

async function listEnvs() {
  return coolify(`/applications/${encodeURIComponent(await appUuid())}/envs`);
}

async function status() {
  const envs = await listEnvs();
  const byKey = new Map(envs.map((env) => [env.key, env]));

  console.log('Coolify:');
  for (const key of [...SECRET_KEYS, ...Object.keys(FLAGS)]) {
    const env = byKey.get(key);
    const shown = !env ? 'MISSING' : SECRET_KEYS.has(key) ? `set (${String(env.value ?? '').length} chars)` : env.value;
    console.log(`  ${key.padEnd(44)} ${shown}`);
  }

  const localPath = path.resolve('server/.env');
  console.log(`\nLocal ${localPath}:`);
  if (!existsSync(localPath)) {
    console.log('  missing');
    return;
  }
  const local = readFileSync(localPath, 'utf8');
  for (const key of SECRET_KEYS) {
    const match = local.match(new RegExp(`^${key}=(.*)$`, 'm'));
    console.log(`  ${key.padEnd(44)} ${match?.[1]?.trim() ? `set (${match[1].trim().length} chars)` : 'EMPTY'}`);
  }
}

async function setFlags() {
  await coolify(`/applications/${encodeURIComponent(await appUuid())}/envs/bulk`, {
    method: 'PATCH',
    body: JSON.stringify({
      data: Object.entries(FLAGS).map(([key, value]) => ({
        key,
        value,
        is_preview: false,
        is_build_time: false,
      })),
    }),
  });
  console.log('Rekognition flags written to Coolify. Redeploy the API for them to take effect.');
}

async function pullLocal() {
  const envs = await listEnvs();
  const localPath = path.resolve('server/.env');
  let local = existsSync(localPath) ? readFileSync(localPath, 'utf8') : '';
  let copied = 0;

  for (const env of envs) {
    if (!SECRET_KEYS.has(env.key) || !env.value) {
      continue;
    }

    const line = `${env.key}=${env.value}`;
    const pattern = new RegExp(`^${env.key}=.*$`, 'm');
    local = pattern.test(local) ? local.replace(pattern, line) : `${local.trimEnd()}\n${line}\n`;
    copied += 1;
  }

  writeFileSync(localPath, local);
  console.log(`Copied ${copied} AWS value(s) from Coolify into ${localPath}.`);
}

const mode = process.argv[2] ?? '--status';
const actions = { '--status': status, '--set-flags': setFlags, '--pull-local': pullLocal };

if (!actions[mode]) {
  console.error(`Unknown mode ${mode}. Use --status, --set-flags, or --pull-local.`);
  process.exit(1);
}

await actions[mode]().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
