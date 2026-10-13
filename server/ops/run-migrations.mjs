import { lstatSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { parseEnv } from 'node:util';
import { fileURLToPath } from 'node:url';

const fields = ['DATABASE_URL', 'SESSION_SECRET', 'LOCATION_ENCRYPTION_KEY',
  'LOCATION_ENCRYPTION_KEY_PREVIOUS', 'LOCATION_ENCRYPTION_KEY_VERSION'];

export function migrationEnvironment(file) {
  const stat = lstatSync(file);
  if (!stat.isFile() || stat.size > 64 * 1024 || (stat.mode & 0o077) !== 0) {
    throw new Error('Migration configuration must be a private regular file.');
  }
  const values = parseEnv(readFileSync(file, 'utf8'));
  if (Object.keys(values).some(key => !fields.includes(key))) {
    throw new Error('Migration configuration contains unsupported fields.');
  }
  const url = new URL(values.DATABASE_URL);
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname || !url.pathname.slice(1)
    || !values.SESSION_SECRET || !values.LOCATION_ENCRYPTION_KEY) {
    throw new Error('Migration configuration is incomplete.');
  }
  // Never inherit API mail, payment, runtime DB or other service credentials.
  return Object.fromEntries([['NODE_ENV', 'production'],
    ...fields.filter(key => values[key] !== undefined).map(key => [key, values[key]])]);
}

export function runCandidateMigrations({ file = '/run/cruush/migration.env', run = spawnSync } = {}) {
  try {
    const env = migrationEnvironment(file);
    const result = run(process.execPath, ['--enable-source-maps', '/app/dist/migrate.js'], {
      cwd: '/app', env, encoding: 'utf8', timeout: 15 * 60 * 1000,
      maxBuffer: 16 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'],
    });
    // PG errors can contain credentials or member data. Never forward child output.
    if (result.error || result.signal || result.status !== 0) {
      throw new Error('Candidate migration failed.');
    }
    return true;
  } catch {
    return false;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (runCandidateMigrations()) console.log('Candidate database migrations completed.');
  else { console.error('Candidate database migrations failed; API deployment must stop.'); process.exitCode = 1; }
}
