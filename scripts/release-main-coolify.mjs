#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import process from 'node:process';

const DEFAULT_SOURCE_BRANCH = 'codex/beta-launch-release-20260731';
const REQUIRED_ENVS = [
  'COOLIFY_API_BASE_URL',
  'COOLIFY_API_TOKEN',
  'COOLIFY_STAGING_FRONTEND_UUID',
  'COOLIFY_STAGING_API_UUID',
  'COOLIFY_PRODUCTION_FRONTEND_UUID',
  'COOLIFY_PRODUCTION_API_UUID',
];
const CHECKS = [
  ['pnpm', ['--dir', 'server', 'test']],
  ['pnpm', ['--dir', 'server', 'run', 'build']],
  ['pnpm', ['test']],
  ['pnpm', ['run', 'build']],
  ['git', ['diff', '--check']],
];

function parseArgs(argv) {
  const parsed = {
    source: DEFAULT_SOURCE_BRANCH,
    target: 'staging',
    confirmProduction: false,
    dryRun: true,
    skipChecks: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--source') {
      parsed.source = argv[index + 1] ?? '';
      index += 1;
    } else if (arg === '--target') {
      parsed.target = argv[index + 1] ?? '';
      index += 1;
    } else if (arg === '--confirm-production') {
      parsed.confirmProduction = true;
    } else if (arg === '--no-dry-run') {
      parsed.dryRun = false;
    } else if (arg === '--skip-checks') {
      parsed.skipChecks = true;
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!['staging', 'production', 'both'].includes(parsed.target)) {
    throw new Error('--target must be staging, production, or both.');
  }

  if ((parsed.target === 'production' || parsed.target === 'both') && !parsed.confirmProduction) {
    throw new Error('Production deployment requires --confirm-production.');
  }

  if (!parsed.source) {
    throw new Error('--source is required.');
  }

  return parsed;
}

function printHelp() {
  console.log(`Usage:
  node scripts/release-main-coolify.mjs --source ${DEFAULT_SOURCE_BRANCH} --target both --confirm-production --no-dry-run

Defaults:
  --target staging
  dry-run enabled until --no-dry-run is passed

Options:
  --skip-checks       Do not run local test/build checks`);
}

function run(command, args, options = {}) {
  console.log(`$ ${command} ${args.join(' ')}`);
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    encoding: 'utf8',
    stdio: options.capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
  });

  if (result.status !== 0) {
    const stderr = result.stderr?.trim();
    throw new Error(stderr || `Command failed: ${command} ${args.join(' ')}`);
  }

  return result.stdout ?? '';
}

function requireCleanWorktree() {
  const status = run('git', ['status', '--porcelain'], { capture: true }).trim();
  if (status) {
    throw new Error('Worktree must be clean before release.');
  }
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required.`);
  }
  return value;
}

// The frontend builds the repo-root Dockerfile (nginx, port 80); the API builds
// server/Dockerfile (Fastify, port 3001). A frontend base_directory on the API
// resource silently ships the nginx image as the API, which answers 502.
const FRONTEND_BUILD = {
  baseDirectory: '/',
  portsExposes: '80',
  healthCheckPath: '/',
  minHealthCheckBudgetSeconds: 30,
};
const API_BUILD = {
  baseDirectory: '/server',
  portsExposes: '3001',
  healthCheckPath: '/health',
  // The API runs migrations before it listens, so the probe budget must outlast them.
  minHealthCheckBudgetSeconds: 600,
};

function appTargets(target) {
  const staging = [
    {
      label: 'staging frontend',
      uuid: requireEnv('COOLIFY_STAGING_FRONTEND_UUID'),
      expectedHost: 'staging.cruush.app',
      smokeUrl: 'https://staging.cruush.app/',
      expectsHtml: true,
      build: FRONTEND_BUILD,
    },
    {
      label: 'staging api',
      uuid: requireEnv('COOLIFY_STAGING_API_UUID'),
      expectedHost: 'api-staging.cruush.app',
      smokeUrl: 'https://api-staging.cruush.app/health',
      build: API_BUILD,
    },
  ];
  const production = [
    {
      label: 'production frontend',
      uuid: requireEnv('COOLIFY_PRODUCTION_FRONTEND_UUID'),
      expectedHost: 'cruush.app',
      smokeUrl: 'https://www.cruush.app/',
      expectsHtml: true,
      build: FRONTEND_BUILD,
    },
    {
      label: 'production api',
      uuid: requireEnv('COOLIFY_PRODUCTION_API_UUID'),
      expectedHost: 'api.cruush.app',
      smokeUrl: 'https://api.cruush.app/health',
      build: API_BUILD,
    },
  ];

  if (target === 'staging') return staging;
  if (target === 'production') return production;
  return [...staging, ...production];
}

function appDomainString(app) {
  return [
    app.fqdn,
    app.domains,
    app.domain,
    app.url,
    Array.isArray(app.urls) ? app.urls.join(',') : '',
  ].filter(Boolean).join(',');
}

function assertExpectedDomain(app, target) {
  const domainString = appDomainString(app);
  if (!domainString.includes(target.expectedHost)) {
    throw new Error(`${target.label} domain mismatch. Expected ${target.expectedHost}; got ${domainString || '(empty)'}.`);
  }
}

function assertBuildConfig(app, target) {
  const expected = target.build;
  const problems = [];

  if (app.base_directory !== expected.baseDirectory) {
    problems.push(`base_directory is ${JSON.stringify(app.base_directory)}, expected ${JSON.stringify(expected.baseDirectory)}`);
  }
  if (String(app.ports_exposes) !== expected.portsExposes) {
    problems.push(`ports_exposes is ${JSON.stringify(app.ports_exposes)}, expected ${JSON.stringify(expected.portsExposes)}`);
  }
  if (!app.health_check_enabled) {
    problems.push('health_check_enabled is false, so Coolify cannot retire the previous container and orphans accumulate');
  }
  if (app.health_check_path !== expected.healthCheckPath) {
    problems.push(`health_check_path is ${JSON.stringify(app.health_check_path)}, expected ${JSON.stringify(expected.healthCheckPath)}`);
  }

  const budget = Number(app.health_check_retries ?? 0) * Number(app.health_check_interval ?? 0);
  if (budget < expected.minHealthCheckBudgetSeconds) {
    problems.push(`health check budget is ${budget}s (retries x interval), needs at least ${expected.minHealthCheckBudgetSeconds}s or the deploy rolls back a healthy container`);
  }

  if (problems.length > 0) {
    throw new Error(`${target.label} Coolify build config drifted:\n  - ${problems.join('\n  - ')}`);
  }
}

function releaseRuntimeEnvData() {
  return {
    data: [
      {
        key: 'ALPHA_TEST_ENABLED',
        value: 'false',
        is_preview: false,
        is_buildtime: false,
        is_runtime: true,
      },
      {
        key: 'ALPHA_TEST_PASSWORD_HASH',
        value: '',
        is_preview: false,
        is_buildtime: false,
        is_runtime: true,
      },
      {
        key: 'ALPHA_TEST_ENDS_AT',
        value: '',
        is_preview: false,
        is_buildtime: false,
        is_runtime: true,
      },
      {
        key: 'BETA_ACCESS_GEOFENCE_ENABLED',
        value: 'true',
        is_preview: false,
        is_buildtime: false,
        is_runtime: true,
      },
      {
        key: 'BETA_ACCESS_CENTER_LATITUDE',
        value: '40.70982',
        is_preview: false,
        is_buildtime: false,
        is_runtime: true,
      },
      {
        key: 'BETA_ACCESS_CENTER_LONGITUDE',
        value: '-73.92256',
        is_preview: false,
        is_buildtime: false,
        is_runtime: true,
      },
      {
        key: 'BETA_ACCESS_RADIUS_MILES',
        value: '15',
        is_preview: false,
        is_buildtime: false,
        is_runtime: true,
      },
      {
        key: 'BETA_ACCESS_VENUE_NAME',
        value: '70 Scott Ave',
        is_preview: false,
        is_buildtime: false,
        is_runtime: true,
      },
      {
        key: 'SUPPORT_INBOX_EMAIL',
        value: 'reports@cruush.app',
        is_preview: false,
        is_buildtime: false,
        is_runtime: true,
      },
      {
        key: 'LAUNCH_PARTY_ENABLED',
        value: 'true',
        is_preview: false,
        is_buildtime: false,
        is_runtime: true,
      },
      {
        key: 'LAUNCH_PARTY_LATITUDE',
        value: '40.70982',
        is_preview: false,
        is_buildtime: false,
        is_runtime: true,
      },
      {
        key: 'LAUNCH_PARTY_LONGITUDE',
        value: '-73.92256',
        is_preview: false,
        is_buildtime: false,
        is_runtime: true,
      },
      {
        key: 'LAUNCH_PARTY_RADIUS_MILES',
        value: '1',
        is_preview: false,
        is_buildtime: false,
        is_runtime: true,
      },
      {
        key: 'LAUNCH_PARTY_STARTS_AT',
        value: '2026-07-31T22:00:00-04:00',
        is_preview: false,
        is_buildtime: false,
        is_runtime: true,
      },
      {
        key: 'LAUNCH_PARTY_ENDS_AT',
        value: '2026-08-01T05:00:00-04:00',
        is_preview: false,
        is_buildtime: false,
        is_runtime: true,
      },
      {
        key: 'LAUNCH_PARTY_CHAT_EXPIRES_AT',
        value: '2026-08-07T03:59:00-04:00',
        is_preview: false,
        is_buildtime: false,
        is_runtime: true,
      },
      {
        key: 'LAUNCH_PARTY_CHAT_ADMIN_EMAIL',
        value: 'julienlenazny@gmail.com',
        is_preview: false,
        is_buildtime: false,
        is_runtime: true,
      },
      {
        key: 'LAUNCH_PARTY_CHAT_MAX_MEMBERS',
        value: '500',
        is_preview: false,
        is_buildtime: false,
        is_runtime: true,
      },
      {
        key: 'LAUNCH_PARTY_RA_URL',
        value: 'https://ra.co/events/2483120',
        is_preview: false,
        is_buildtime: false,
        is_runtime: true,
      },
    ],
  };
}

async function coolifyRequest(path, options = {}) {
  const baseUrl = requireEnv('COOLIFY_API_BASE_URL').replace(/\/$/, '');
  const token = requireEnv('COOLIFY_API_TOKEN');
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      accept: 'application/json',
      authorization: `Bearer ${token}`,
      ...(options.body ? { 'content-type': 'application/json' } : {}),
      ...(options.headers ?? {}),
    },
  });
  const text = await response.text();
  let body = null;

  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = { message: text };
    }
  }

  if (!response.ok) {
    throw new Error(`Coolify ${options.method ?? 'GET'} ${path} failed with ${response.status}: ${body?.message ?? 'request failed'}`);
  }

  return body;
}

async function validateAndPatchApps(targets, dryRun) {
  for (const target of targets) {
    const app = await coolifyRequest(`/applications/${encodeURIComponent(target.uuid)}`);
    assertExpectedDomain(app, target);
    assertBuildConfig(app, target);
    console.log(`Validated ${target.label} domain ${target.expectedHost} and build config.`);

    if (dryRun) {
      console.log(`[dry-run] Would set ${target.label} git_branch=main, alpha env cutoff values, 15-mile beta access geofence, reports inbox, and launch party pin.`);
      continue;
    }

    await coolifyRequest(`/applications/${encodeURIComponent(target.uuid)}`, {
      method: 'PATCH',
      body: JSON.stringify({ git_branch: 'main' }),
    });
    await coolifyRequest(`/applications/${encodeURIComponent(target.uuid)}/envs/bulk`, {
      method: 'PATCH',
      body: JSON.stringify(releaseRuntimeEnvData()),
    });
    console.log(`Updated ${target.label} branch, alpha envs, beta access geofence, reports inbox, and launch party pin.`);
  }
}

async function deployTargets(targets, dryRun) {
  for (const target of targets) {
    if (dryRun) {
      console.log(`[dry-run] Would deploy ${target.label}.`);
      continue;
    }

    const deployment = await coolifyRequest(`/deploy?uuid=${encodeURIComponent(target.uuid)}`);
    console.log(`Triggered ${target.label} deployment: ${JSON.stringify(deployment?.deployments ?? deployment)}`);
  }
}

// One request cannot see a split brain: when two containers answer for the same
// domain, half the responses are still fine. Sample repeatedly and require that
// every response is healthy and that the HTML always names the same build.
const SMOKE_REQUEST_COUNT = 8;

async function smokeTargets(targets, dryRun) {
  for (const target of targets) {
    if (dryRun) {
      console.log(`[dry-run] Would smoke ${target.smokeUrl} ${SMOKE_REQUEST_COUNT} times.`);
      continue;
    }

    const statuses = [];
    const builds = new Set();

    for (let attempt = 0; attempt < SMOKE_REQUEST_COUNT; attempt += 1) {
      const separator = target.smokeUrl.includes('?') ? '&' : '?';
      const response = await fetch(`${target.smokeUrl}${separator}smoke=${attempt}`, {
        redirect: 'manual',
        cache: 'no-store',
      });
      statuses.push(response.status);

      if (target.expectsHtml) {
        const match = (await response.text()).match(/assets\/index-[A-Za-z0-9_-]+\.js/);
        if (match) {
          builds.add(match[0]);
        }
      }
    }

    if (statuses.some((status) => status >= 500)) {
      throw new Error(`${target.label} smoke failed at ${target.smokeUrl}: ${statuses.join(' ')}`);
    }

    if (target.expectsHtml && builds.size > 1) {
      throw new Error(`${target.label} served ${builds.size} different builds, so more than one container answers for ${target.expectedHost}: ${[...builds].join(', ')}`);
    }

    const build = target.expectsHtml ? ` build=${[...builds][0] ?? '(none found)'}` : '';
    console.log(`Smoke passed for ${target.label}: ${target.smokeUrl} -> ${statuses.join(' ')}${build}`);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  console.log(`Release source=${args.source} target=${args.target} dryRun=${args.dryRun}`);
  REQUIRED_ENVS.forEach(requireEnv);
  requireCleanWorktree();
  run('git', ['fetch', 'origin']);
  run('git', ['rev-parse', '--verify', args.source], { capture: true });

  if (!args.skipChecks) {
    for (const [command, commandArgs] of CHECKS) {
      run(command, commandArgs);
    }
  }

  const sourceSha = run('git', ['rev-parse', args.source], { capture: true }).trim();
  console.log(`Verified ${args.source} at ${sourceSha}.`);

  if (args.dryRun) {
    console.log(`[dry-run] Would push ${args.source}:main.`);
  } else {
    run('git', ['push', 'origin', `${args.source}:main`]);
  }

  const targets = appTargets(args.target);
  const stagingTargets = targets.filter((target) => target.label.startsWith('staging'));
  const productionTargets = targets.filter((target) => target.label.startsWith('production'));

  await validateAndPatchApps(targets, args.dryRun);

  if (stagingTargets.length > 0) {
    await deployTargets(stagingTargets, args.dryRun);
    await smokeTargets(stagingTargets, args.dryRun);
  }

  if (productionTargets.length > 0) {
    await deployTargets(productionTargets, args.dryRun);
    await smokeTargets(productionTargets, args.dryRun);
  }

  console.log('Release script completed.');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
