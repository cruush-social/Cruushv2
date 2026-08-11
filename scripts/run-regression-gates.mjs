#!/usr/bin/env node

import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import process from 'node:process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const REGRESSION_CHECKS = [
  ['pnpm', ['check:cruush-casing']],
  ['pnpm', ['check:copy']],
  ['pnpm', ['security:check']],
  ['pnpm', ['check:layout']],
  ['pnpm', ['test']],
  ['pnpm', ['build']],
  ['npm', ['--prefix', 'server', 'test']],
  ['npm', ['--prefix', 'server', 'run', 'build']],
  ['git', ['diff', '--check']],
];

function runCheck(command, args) {
  console.log(`\n> ${command} ${args.join(' ')}`);
  const result = spawnSync(command, args, {
    cwd: root,
    env: process.env,
    stdio: 'inherit',
  });

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`Regression gate failed: ${command} ${args.join(' ')}`);
  }
}

async function waitForServer(url, child) {
  const deadline = Date.now() + 30_000;

  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Layout server exited before becoming ready with code ${child.exitCode}.`);
    }
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      // Vite has not started listening yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  throw new Error(`Layout server did not become ready at ${url}.`);
}

async function runLayoutCheck() {
  const url = 'http://127.0.0.1:4174';
  const child = spawn('pnpm', ['exec', 'vite', '--host', '127.0.0.1'], {
    cwd: root,
    env: {
      ...process.env,
      VITE_DEV_HTTPS: '0',
      VITE_DEV_PORT: '4174',
    },
    stdio: 'ignore',
  });

  try {
    await waitForServer(url, child);
    runCheck('node', ['scripts/check-layout-invariants.mjs', '--url', url]);
  } finally {
    child.kill('SIGTERM');
  }
}

export async function runRegressionGates() {
  for (const [command, args] of REGRESSION_CHECKS) {
    if (command === 'pnpm' && args[0] === 'check:layout') {
      await runLayoutCheck();
    } else {
      runCheck(command, args);
    }
  }

  console.log('\nAll local regression gates passed.');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runRegressionGates().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
