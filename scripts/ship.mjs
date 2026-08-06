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

async function verifyApi(expectedSha) {
  const deadline = Date.now() + VERIFY_TIMEOUT_MS;
  let last = null;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${API_BUILD_URL}?ship=${Date.now()}`, { cache: 'no-store' });
      if (response.ok) {
        const payload = await response.json();
        last = payload?.sha ?? null;
        if (last === expectedSha) return { ok: true, sha: last, stage: payload?.stage };
      }
    } catch {
      // The API restarts during deploy; keep polling.
    }
    process.stdout.write('.');
    await sleep(POLL_INTERVAL_MS);
  }
  return { ok: false, sha: last };
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
  const frontendUuid = process.env.COOLIFY_PRODUCTION_FRONTEND_UUID;
  const apiUuid = process.env.COOLIFY_PRODUCTION_API_UUID;

  if (process.env.COOLIFY_API_TOKEN) {
    for (const [label, uuid] of [['api', apiUuid], ['frontend', frontendUuid]]) {
      if (!uuid) {
        console.log(`Deploy ${label}: skipped (no UUID configured).`);
        continue;
      }
      const triggered = await coolify(`/deploy?uuid=${encodeURIComponent(uuid)}`);
      console.log(`Deploy ${label}: triggered (${JSON.stringify(triggered?.deployments ?? triggered)})`);
    }
  } else {
    console.log(`Deploy: no Coolify credentials found${envFile ? ` in ${envFile}` : ''}; relying on auto-deploy.`);
  }

  process.stdout.write('Verifying api  ');
  const api = await verifyApi(sha);
  console.log(api.ok ? ` matched (${api.sha.slice(0, 12)}, stage ${api.stage})` : ` MISMATCH (serving ${api.sha ?? 'unknown'})`);

  process.stdout.write('Verifying web  ');
  const web = await verifyFrontend(sha, frontendUuid);
  if (web.ok === null) console.log(` skipped — ${web.reason}`);
  else console.log(web.ok ? ` matched (${web.sha.slice(0, 12)}, ${web.status})` : ` MISMATCH (deployed ${web.sha ?? 'unknown'})`);

  console.log(`\nCommit   ${sha}`);
  console.log(`Frontend ${FRONTEND_URL}`);
  console.log(`API      ${API_BUILD_URL}`);

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
