#!/usr/bin/env node
// One command for CRUUSH-RULES A1-A3: get the work onto main, deploy it, and
// prove the deployed commit is the commit that was pushed.
//
//   pnpm ship -m "fix the thing"     # commit, push to main, deploy, verify
//   pnpm ship                        # tree already clean
//   pnpm ship --skip-checks          # hotfix: skip the guards, still verify
//   pnpm ship --no-deploy            # push only
//   pnpm ship --dry-run              # print the plan, touch nothing
//
// Verification is the point. The API serves its build SHA at /api/build, and
// Coolify reports the frontend's deployed commit, so "is it deployed?" and
// "does the deploy have my commit?" get answered here instead of by hand.

import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const ROOT = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
const API_BUILD_URL = process.env.CRUUSH_API_BUILD_URL ?? 'https://api.cruush.app/api/build';
const FRONTEND_URL = process.env.CRUUSH_FRONTEND_URL ?? 'https://www.cruush.app/';
const VERIFY_TIMEOUT_MS = Number(process.env.CRUUSH_SHIP_TIMEOUT_MS ?? 15 * 60 * 1000);
const POLL_INTERVAL_MS = 15_000;

// Matches AWS keys, PEM blocks, bearer-ish assignments, and Postgres URLs with
// inline credentials. Cheap, but it catches the mistakes that actually happen.
const SECRET_PATTERNS = [
  /AKIA[0-9A-Z]{16}/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /\b(api[_-]?key|secret|token|password)\b\s*[:=]\s*["'][A-Za-z0-9/+_-]{20,}["']/i,
  /postgres(?:ql)?:\/\/[^\s:]+:[^\s@]+@/,
];

function parseArgs(argv) {
  const args = { message: null, skipChecks: false, deploy: true, dryRun: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '-m' || arg === '--message') args.message = argv[++index];
    else if (arg === '--skip-checks') args.skipChecks = true;
    else if (arg === '--no-deploy') args.deploy = false;
    else if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--help' || arg === '-h') {
      console.log(readFileSync(new URL(import.meta.url), 'utf8').split('\n').slice(1, 14).join('\n'));
      process.exit(0);
    } else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function git(args, options = {}) {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', ...options }).trim();
}

function run(command, args, label) {
  process.stdout.write(`  ${label} ... `);
  const result = spawnSync(command, args, { cwd: ROOT, encoding: 'utf8' });
  if (result.status !== 0) {
    console.log('FAILED');
    const output = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim();
    if (output) console.error(output.split('\n').slice(-25).join('\n'));
    throw new Error(`${label} failed. Fix it, or re-run with --skip-checks if this is a hotfix.`);
  }
  console.log('ok');
}

function loadCoolifyEnv() {
  // The credentials live in a gitignored file at the root of the main
  // checkout; a worktree shares the repo but not that file.
  const candidates = [
    path.join(ROOT, '.env.coolify.local'),
    path.join(git(['rev-parse', '--git-common-dir']).replace(/\/\.git$/, ''), '.env.coolify.local'),
    path.join(path.dirname(path.dirname(path.dirname(ROOT))), '.env.coolify.local'),
  ];
  for (const candidate of candidates) {
    if (!existsSync(candidate)) continue;
    for (const line of readFileSync(candidate, 'utf8').split('\n')) {
      const match = /^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
      if (!match) continue;
      const value = match[2].trim().replace(/^["']|["']$/g, '');
      if (!process.env[match[1]]) process.env[match[1]] = value;
    }
    return candidate;
  }
  return null;
}

async function coolify(pathname) {
  const base = process.env.COOLIFY_API_BASE_URL;
  const token = process.env.COOLIFY_API_TOKEN;
  if (!base || !token) return null;
  const response = await fetch(`${base}${pathname}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) throw new Error(`Coolify ${pathname} returned ${response.status}`);
  return response.json();
}

// Coolify names its apps; the UUIDs are the only handle the API takes. Looking
// them up by name means .env.coolify.local needs the token and nothing else.
async function resolveAppUuids() {
  const resolved = {
    api: process.env.COOLIFY_PRODUCTION_API_UUID ?? null,
    frontend: process.env.COOLIFY_PRODUCTION_FRONTEND_UUID ?? null,
  };
  if (resolved.api && resolved.frontend) return resolved;
  if (!process.env.COOLIFY_API_TOKEN) return resolved;

  try {
    const apps = await coolify('/applications');
    const list = Array.isArray(apps) ? apps : apps?.data ?? [];
    for (const app of list) {
      if (!resolved.api && app.name === 'cruush-api') resolved.api = app.uuid;
      if (!resolved.frontend && app.name === 'cruush-frontend') resolved.frontend = app.uuid;
    }
  } catch (error) {
    console.warn(`  could not list Coolify applications: ${error.message}`);
  }
  return resolved;
}

// Pushing to main deploys nothing if the Coolify app is pointed at another
// branch. That has happened, and it is invisible from the git side, so say it
// out loud before spending fifteen minutes polling for a SHA that cannot land.
async function warnOnBranchDrift(uuids) {
  const drifted = [];
  for (const [label, uuid] of Object.entries(uuids)) {
    if (!uuid) continue;
    try {
      const app = await coolify(`/applications/${encodeURIComponent(uuid)}`);
      if (app?.git_branch && app.git_branch !== 'main') {
        drifted.push(`${label} is deployed from "${app.git_branch}" (currently ${app.git_commit_sha ?? 'unknown'})`);
      }
    } catch {
      // Reported elsewhere; never block the push on a status read.
    }
  }
  if (drifted.length > 0) {
    console.warn('\n  WARNING: production is not tracking main.');
    for (const line of drifted) console.warn(`    ${line}`);
    console.warn('  Pushing to main will not deploy until the Coolify app is pointed back at main.\n');
  }
  return drifted;
}

async function verifyApi(expectedSha, uuid) {
  const deadline = Date.now() + VERIFY_TIMEOUT_MS;
  let last = null;
  let routeMissing = false;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${API_BUILD_URL}?ship=${Date.now()}`, { cache: 'no-store' });
      if (response.ok) {
        routeMissing = false;
        const payload = await response.json();
        last = payload?.sha ?? null;
        if (last === expectedSha) return { ok: true, sha: last, stage: payload?.stage };
      } else if (response.status === 404) {
        // The running build predates /api/build, which means it is not main.
        routeMissing = true;
      }
    } catch {
      // The API restarts during deploy; keep polling.
    }
    // Coolify knows which commit it deployed even when the build has no
    // metadata route, so fall back to it rather than reporting "unknown".
    if (routeMissing && uuid) {
      try {
        const app = await coolify(`/applications/${encodeURIComponent(uuid)}`);
        last = app?.git_commit_sha ?? last;
        if (last === expectedSha) return { ok: true, sha: last, stage: 'coolify' };
      } catch {
        // Fall through and keep polling.
      }
    }
    process.stdout.write('.');
    await sleep(POLL_INTERVAL_MS);
  }
  return { ok: false, sha: last, routeMissing };
}

async function verifyFrontend(expectedSha, uuid) {
  if (!uuid) return { ok: null, reason: 'no COOLIFY_PRODUCTION_FRONTEND_UUID; cannot read the deployed commit' };
  const deadline = Date.now() + VERIFY_TIMEOUT_MS;
  let last = null;
  while (Date.now() < deadline) {
    try {
      const app = await coolify(`/applications/${encodeURIComponent(uuid)}`);
      last = app?.git_commit_sha ?? null;
      if (last === expectedSha) return { ok: true, sha: last, status: app?.status };
    } catch {
      // Transient Coolify errors during a build are expected.
    }
    process.stdout.write('.');
    await sleep(POLL_INTERVAL_MS);
  }
  return { ok: false, sha: last };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const branch = git(['rev-parse', '--abbrev-ref', 'HEAD']);
  if (branch === 'HEAD') throw new Error('Detached HEAD. Check out a branch before shipping.');

  const dirty = git(['status', '--porcelain']);
  if (dirty && !args.message) {
    console.error('Working tree is dirty:');
    console.error(dirty.split('\n').slice(0, 20).join('\n'));
    throw new Error('Pass -m "message" to commit these, or commit them yourself first.');
  }

  console.log(`Branch: ${branch}`);
  git(['fetch', '--quiet', 'origin', 'main']);

  const behind = git(['rev-list', '--count', 'HEAD..origin/main']);
  if (behind !== '0') {
    throw new Error(
      `origin/main has ${behind} commit(s) you do not have. Rebase first:\n  git rebase origin/main`,
    );
  }

  if (!args.skipChecks) {
    console.log('Checks:');
    run('node', ['scripts/check-lowercase-cruush.mjs'], 'lowercase cruush (F1)');
    run('git', ['diff', '--check'], 'whitespace');

    const diff = git(['diff', 'origin/main...HEAD']) + (dirty ? git(['diff']) : '');
    const leak = SECRET_PATTERNS.find((pattern) => pattern.test(diff));
    if (leak) throw new Error(`Possible secret in the diff (${leak}). CRUUSH-RULES I5. Refusing to push.`);
    console.log('  secret scan ... ok');

    if (existsSync(path.join(ROOT, 'node_modules'))) {
      run('pnpm', ['test:smoke'], 'frontend smoke');
    } else {
      console.log('  smoke tests ... skipped (no node_modules in this worktree)');
    }
  } else {
    console.log('Checks: skipped (--skip-checks)');
  }

  if (args.dryRun) {
    console.log(`\n[dry-run] Would commit${args.message ? ` "${args.message}"` : ' nothing'}, push ${branch} to main, deploy, and verify.`);
    return;
  }

  if (dirty) {
    git(['add', '-A']);
    execFileSync('git', ['commit', '-m', args.message], { cwd: ROOT, stdio: 'ignore' });
    console.log(`Committed: ${args.message}`);
  }

  const sha = git(['rev-parse', 'HEAD']);
  execFileSync('git', ['push', 'origin', `HEAD:main`], { cwd: ROOT, stdio: 'inherit' });
  console.log(`Pushed ${sha.slice(0, 12)} to main.`);

  if (!args.deploy) {
    console.log('Deploy skipped (--no-deploy).');
    return;
  }

  const envFile = loadCoolifyEnv();
  const { api: apiUuid, frontend: frontendUuid } = await resolveAppUuids();
  const drift = await warnOnBranchDrift({ api: apiUuid, frontend: frontendUuid });

  if (process.env.COOLIFY_API_TOKEN) {
    for (const [label, uuid] of [['api', apiUuid], ['frontend', frontendUuid]]) {
      if (!uuid) {
        console.log(`Deploy ${label}: skipped (could not resolve the Coolify app UUID).`);
        continue;
      }
      const triggered = await coolify(`/deploy?uuid=${encodeURIComponent(uuid)}`);
      console.log(`Deploy ${label}: triggered (${JSON.stringify(triggered?.deployments ?? triggered)})`);
    }
  } else {
    console.log(`Deploy: no Coolify credentials found${envFile ? ` in ${envFile}` : ''}; relying on auto-deploy.`);
  }

  process.stdout.write('Verifying api  ');
  const api = await verifyApi(sha, apiUuid);
  if (api.ok) {
    console.log(` matched (${api.sha.slice(0, 12)}, stage ${api.stage})`);
  } else {
    console.log(` MISMATCH (serving ${api.sha ? api.sha.slice(0, 12) : 'unknown'})`);
    if (api.routeMissing) console.log('    /api/build 404s, so the running build is older than that route — production is not on main.');
  }

  process.stdout.write('Verifying web  ');
  const web = await verifyFrontend(sha, frontendUuid);
  if (web.ok === null) console.log(` skipped — ${web.reason}`);
  else console.log(web.ok ? ` matched (${web.sha.slice(0, 12)}, ${web.status})` : ` MISMATCH (deployed ${web.sha ?? 'unknown'})`);

  console.log(`\nCommit   ${sha}`);
  console.log(`Frontend ${FRONTEND_URL}`);
  console.log(`API      ${API_BUILD_URL}`);

  if (drift.length > 0) {
    console.error('\nProduction is deployed from another branch, so this commit is not live. Point the Coolify app back at main first.');
    process.exit(1);
  }

  if (api.ok === false || web.ok === false) {
    console.error('\nDeployed commit does not match what was pushed. Do not report this as shipped.');
    process.exit(1);
  }
  console.log('\nShipped and verified.');
}

main().catch((error) => {
  console.error(`\nship: ${error.message}`);
  process.exit(1);
});
