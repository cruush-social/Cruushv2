import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

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
  const windowsCommand = /\.(cmd|bat|exe)$/i.test(command) ? command : `${command}.cmd`;
  const resolvedCommand = process.platform === 'win32'
    ? process.env.ComSpec ?? 'cmd.exe'
    : command;
  const resolvedArgs = process.platform === 'win32'
    ? ['/d', '/s', '/c', windowsCommand, ...args]
    : args;
  const child = spawn(resolvedCommand, resolvedArgs, {
    stdio: 'inherit',
    env,
    shell: false,
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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function verifyDatabaseConnection(serverEnv, serverDir) {
  let databaseUrl;

  try {
    databaseUrl = new URL(serverEnv.DATABASE_URL);
  } catch {
    console.error('DATABASE_URL is not a valid Postgres connection URL.');
    process.exit(1);
  }

  const requireFromServer = createRequire(path.join(serverDir, 'package.json'));
  const { Pool } = requireFromServer('pg');
  let lastError = null;

  for (let attempt = 1; attempt <= 5; attempt += 1) {
    const pool = new Pool({
      connectionString: serverEnv.DATABASE_URL,
      connectionTimeoutMillis: 3000,
      max: 1,
    });

    try {
      await pool.query('select 1');
      await pool.end();
      return;
    } catch (error) {
      lastError = error;
      await pool.end().catch(() => undefined);

      if (!['ECONNREFUSED', '57P03'].includes(error?.code) || attempt === 5) {
        break;
      }

      await sleep(1000);
    }
  }

  const host = databaseUrl.hostname || 'localhost';
  const port = databaseUrl.port || '5432';
  const database = databaseUrl.pathname.replace(/^\//, '') || '(default)';

  console.error(`Cannot connect to local Postgres at ${host}:${port}/${database}.`);

  if (lastError?.code === 'ECONNREFUSED') {
    console.error('No database service is listening on that host and port.');
    console.error('Start the bundled database with: docker compose -f docker-compose.selfhost.yml up -d postgres');
    console.error('Or update server/.env.local DATABASE_URL to the Postgres instance you are actually running.');
  } else if (lastError?.code === '28P01') {
    console.error('Postgres rejected the username/password in server/.env.local.');
    console.error('For the repo default credentials, reset the local Docker volume and start the bundled Postgres service:');
    console.error('  docker compose -f docker-compose.selfhost.yml down -v --remove-orphans');
    console.error('  docker compose -f docker-compose.selfhost.yml up -d postgres');
  } else if (lastError?.code === '3D000') {
    console.error(`The database "${database}" does not exist on that Postgres server.`);
    console.error('Create it first, or reset/start the bundled Docker Postgres service.');
  } else {
    console.error(lastError?.message ?? lastError);
  }

  process.exit(1);
}

function mergeOrigins(...values) {
  const origins = new Set();

  for (const value of values) {
    if (!value) {
      continue;
    }

    for (const origin of value.split(',')) {
      const trimmed = origin.trim();

      if (trimmed) {
        origins.add(trimmed);
      }
    }
  }

  return Array.from(origins).join(',');
}

function isDisabled(value) {
  return typeof value === 'string' && ['0', 'false'].includes(value.trim().toLowerCase());
}

function isEnabled(value) {
  return typeof value === 'string' && ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
}

const rootDir = process.cwd();
const serverDir = path.join(rootDir, 'server');
const shouldSeedDevProfiles = process.argv.includes('--seed-dev-profiles');
const localFrontendOrigins = [
  'http://localhost:5173',
  'https://localhost:5173',
  'http://127.0.0.1:5173',
  'https://127.0.0.1:5173',
].join(',');

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
const localFrontendUrl = isDisabled(frontendEnv.VITE_DEV_HTTPS)
  ? 'http://localhost:5173'
  : 'https://localhost:5173';

const serverEnv = {
  ...process.env,
  ...serverEnvFromFiles,
  PORT: serverEnvFromFiles.PORT ?? '3001',
  HOST: serverEnvFromFiles.HOST ?? '0.0.0.0',
  CORS_ORIGIN: mergeOrigins(serverEnvFromFiles.CORS_ORIGIN, localFrontendOrigins),
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
  serverEnv.APP_URL = localFrontendUrl;
}

<<<<<<< Updated upstream
function startLocalStack() {
=======
await verifyDatabaseConnection(serverEnv, serverDir);

const migration = spawnProcess('npm', ['--prefix', 'server', 'run', 'migrate:dev'], serverEnv, 'migrate');

function startLocalApps() {
>>>>>>> Stashed changes
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
}

<<<<<<< Updated upstream
const migration = spawnProcess('npm', ['--prefix', 'server', 'run', 'migrate:dev'], serverEnv, 'migrate');

=======
>>>>>>> Stashed changes
migration.on('exit', (code) => {
  if (code !== 0) {
    process.exit(code ?? 1);
  }

<<<<<<< Updated upstream
  if (!shouldSeedDevProfiles) {
    startLocalStack();
    return;
  }

  const seed = spawnProcess('npm', ['--prefix', 'server', 'run', 'seed:dev-profiles'], serverEnv, 'seed');

  seed.on('exit', (seedCode) => {
    if (seedCode !== 0) {
      process.exit(seedCode ?? 1);
    }

    startLocalStack();
  });
=======
  if (isEnabled(serverEnv.DEVELOPMENT_ADMIN_ENABLED) && serverEnv.DEVELOPMENT_ADMIN_PASSWORD) {
    const seed = spawnProcess('npm', ['--prefix', 'server', 'run', 'seed:dev-profiles'], serverEnv, 'seed');

    seed.on('exit', (seedCode) => {
      if (seedCode !== 0) {
        process.exit(seedCode ?? 1);
      }

      startLocalApps();
    });
    return;
  }

  startLocalApps();
>>>>>>> Stashed changes
});
