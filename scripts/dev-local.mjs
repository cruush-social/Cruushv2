import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';

function parseEnvFile(contents) {
  const result = {};

  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }

    const separatorIndex = line.indexOf('=');
    if (separatorIndex === -1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    let value = line.slice(separatorIndex + 1).trim();

    if (!key) {
      continue;
    }

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    result[key] = value;
  }

  return result;
}

async function readEnvFile(filePath) {
  if (!existsSync(filePath)) {
    return {};
  }

  return parseEnvFile(await readFile(filePath, 'utf8'));
}

function spawnProcess(command, args, env, label) {
  const child = spawn(command, args, {
    stdio: 'inherit',
    env,
    shell: process.platform === 'win32',
  });

  child.on('exit', (code, signal) => {
    if (signal) {
      console.log(`${label} exited via ${signal}`);
    } else {
      console.log(`${label} exited with code ${code ?? 0}`);
    }
  });

  return child;
}

const rootDir = process.cwd();
const serverDir = path.join(rootDir, 'server');

const rootEnv = {
  ...(await readEnvFile(path.join(rootDir, '.env'))),
  ...(await readEnvFile(path.join(rootDir, '.env.local'))),
};

const serverEnvFromFiles = {
  ...(await readEnvFile(path.join(serverDir, '.env.example'))),
  ...(await readEnvFile(path.join(serverDir, '.env'))),
  ...(await readEnvFile(path.join(serverDir, '.env.local'))),
};

const frontendEnv = {
  ...process.env,
  ...rootEnv,
  VITE_API_BASE_URL: rootEnv.VITE_API_BASE_URL ?? '',
};

const serverEnv = {
  ...process.env,
  ...serverEnvFromFiles,
  PORT: serverEnvFromFiles.PORT ?? '3001',
  HOST: serverEnvFromFiles.HOST ?? '0.0.0.0',
  CORS_ORIGIN: serverEnvFromFiles.CORS_ORIGIN ?? 'http://localhost:5173',
};

if (!serverEnv.DATABASE_URL) {
  console.error('DATABASE_URL is missing for the local server.');
  console.error('Create server/.env.local from server/.env.local.example and point it at a local Postgres database.');
  process.exit(1);
}

if (!serverEnv.SESSION_SECRET) {
  console.error('SESSION_SECRET is missing for the local server.');
  console.error('Create server/.env.local from server/.env.local.example and set a non-empty secret.');
  process.exit(1);
}

if (!serverEnv.APP_URL) {
  serverEnv.APP_URL = 'http://localhost:5173';
}

const migration = spawnProcess('npm', ['--prefix', 'server', 'run', 'migrate:dev'], serverEnv, 'migrate');

migration.on('exit', (code) => {
  if (code !== 0) {
    process.exit(code ?? 1);
  }

  const server = spawnProcess('npm', ['--prefix', 'server', 'run', 'dev'], serverEnv, 'server');
  const frontend = spawnProcess('npm', ['run', 'dev'], frontendEnv, 'frontend');

  const shutdown = () => {
    server.kill('SIGINT');
    frontend.kill('SIGINT');
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  server.on('exit', (serverCode) => {
    frontend.kill('SIGINT');
    process.exit(serverCode ?? 0);
  });

  frontend.on('exit', (frontendCode) => {
    server.kill('SIGINT');
    process.exit(frontendCode ?? 0);
  });
});
