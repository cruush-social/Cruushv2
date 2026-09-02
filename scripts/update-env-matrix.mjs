#!/usr/bin/env node
// Regenerates docs/env-matrix.md: every environment variable the code reads,
// whether it is documented in server/.env.example, and (optionally) whether it
// is actually set on the Coolify apps. See the standing rules, I1 and I2.
//
//   node scripts/update-env-matrix.mjs
//   node scripts/update-env-matrix.mjs --coolify   # also query the live apps
//   node scripts/update-env-matrix.mjs --check     # non-zero if stale or undocumented
//
// --coolify needs COOLIFY_API_BASE_URL and COOLIFY_API_TOKEN (they live in the
// gitignored .env.coolify.local at the repo root) plus the app UUIDs in
// COOLIFY_PRODUCTION_FRONTEND_UUID / COOLIFY_PRODUCTION_API_UUID.

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const ROOT = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
const OUTPUT = path.join(ROOT, 'docs', 'env-matrix.md');
const EXAMPLE = path.join(ROOT, 'server', '.env.example');
const CHECK_ONLY = process.argv.includes('--check');
const WITH_COOLIFY = process.argv.includes('--coolify');

const SKIP_DIRECTORIES = new Set(['node_modules', 'dist', 'build', '.git', 'coverage']);
const CODE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs']);
// Vite injects these; they are not deployment configuration.
const BUILTIN_VITE = new Set(['DEV', 'PROD', 'MODE', 'SSR', 'BASE_URL']);

function walk(target, files = []) {
  let stats;
  try {
    stats = statSync(target);
  } catch {
    return files;
  }
  if (stats.isFile()) {
    if (CODE_EXTENSIONS.has(path.extname(target))) files.push(target);
    return files;
  }
  if (!stats.isDirectory()) return files;
  for (const entry of readdirSync(target)) {
    if (SKIP_DIRECTORIES.has(entry)) continue;
    walk(path.join(target, entry), files);
  }
  return files;
}

function collect(roots, pattern) {
  const found = new Map();
  for (const file of roots.flatMap((entry) => walk(path.join(ROOT, entry)))) {
    const source = readFileSync(file, 'utf8');
    const isTest = /\.(test|spec)\.[tj]sx?$/.test(file);
    let match;
    pattern.lastIndex = 0;
    while ((match = pattern.exec(source)) !== null) {
      const name = match[1];
      if (BUILTIN_VITE.has(name) || name.length < 3) continue;
      if (!found.has(name)) found.set(name, { testOnly: true, files: new Set() });
      const record = found.get(name);
      record.files.add(path.relative(ROOT, file));
      if (!isTest) record.testOnly = false;
    }
  }
  return found;
}

const serverVars = collect(['server/src', 'scripts', 'server/scripts'], /process\.env\.([A-Z0-9_]+)/g);
const clientVars = collect(['src'], /import\.meta\.env\.([A-Z0-9_]+)/g);

// The server reads its configuration through a zod schema rather than touching
// process.env per variable, so the schema keys are the real inventory.
const CONFIG_SCHEMA = path.join(ROOT, 'server', 'src', 'config.ts');
if (existsSync(CONFIG_SCHEMA)) {
  const source = readFileSync(CONFIG_SCHEMA, 'utf8');
  const relative = path.relative(ROOT, CONFIG_SCHEMA);
  const pattern = /^ {2}([A-Z][A-Z0-9_]+):/gm;
  let match;
  while ((match = pattern.exec(source)) !== null) {
    const name = match[1];
    if (!serverVars.has(name)) serverVars.set(name, { testOnly: false, files: new Set() });
    const record = serverVars.get(name);
    record.testOnly = false;
    record.files.add(relative);
  }
}

const documented = new Set();
if (existsSync(EXAMPLE)) {
  for (const line of readFileSync(EXAMPLE, 'utf8').split('\n')) {
    const match = /^\s*([A-Z0-9_]+)\s*=/.exec(line);
    if (match) documented.add(match[1]);
  }
}

async function coolifyEnv() {
  const base = process.env.COOLIFY_API_BASE_URL;
  const token = process.env.COOLIFY_API_TOKEN;
  const apps = [
    ['api', process.env.COOLIFY_PRODUCTION_API_UUID],
    ['frontend', process.env.COOLIFY_PRODUCTION_FRONTEND_UUID],
  ].filter(([, uuid]) => uuid);

  if (!base || !token || apps.length === 0) {
    console.warn('env-matrix: --coolify needs COOLIFY_API_BASE_URL, COOLIFY_API_TOKEN, and the production UUIDs. Skipping live columns.');
    return null;
  }

  const live = new Map();
  for (const [label, uuid] of apps) {
    const response = await fetch(`${base}/applications/${encodeURIComponent(uuid)}/envs`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      console.warn(`env-matrix: Coolify ${label} envs returned ${response.status}. Skipping live column.`);
      continue;
    }
    const payload = await response.json();
    const names = (Array.isArray(payload) ? payload : payload?.data ?? []).map((row) => row.key ?? row.name).filter(Boolean);
    live.set(label, new Set(names));
  }
  return live.size ? live : null;
}

const live = WITH_COOLIFY ? await coolifyEnv() : null;

// A variable read only from scripts/ is developer tooling (Coolify tokens, a
// Chrome path), not deployment configuration, so it does not belong in
// server/.env.example and must not be reported as a gap.
const isToolingOnly = (record) => [...record.files].every((file) => file.startsWith('scripts/'));

function rows(map, kind) {
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, record]) => {
      const inExample = documented.has(name);
      const tooling = isToolingOnly(record);
      const exempt = record.testOnly || tooling || kind === 'client';
      const notes = [];
      if (record.testOnly) notes.push('test-only');
      if (tooling) notes.push('tooling');
      if (kind === 'client') notes.push('build-time, ships to the browser');
      if (!inExample && !exempt) notes.push('**missing from .env.example**');
      const liveCells = live
        ? [...live.keys()].map((label) => (live.get(label).has(name) ? 'set' : 'not set'))
        : [];
      const sample = [...record.files].slice(0, 2).map((file) => `\`${file}\``).join(', ');
      return {
        name,
        kind,
        inExample,
        exempt,
        line: `| \`${name}\` | ${kind} | ${inExample ? 'yes' : 'no'} |${liveCells.map((cell) => ` ${cell} |`).join('')} ${sample} | ${notes.join(', ')} |`,
      };
    });
}

const serverRows = rows(serverVars, 'server');
const clientRows = rows(clientVars, 'client');
const allRows = [...serverRows, ...clientRows];
const undocumented = allRows.filter((row) => !row.inExample && !row.exempt);
const unused = [...documented].filter((name) => !serverVars.has(name) && !clientVars.has(name)).sort();

const liveHeaders = live ? [...live.keys()].map((label) => ` prod ${label} |`).join('') : '';
const liveDivider = live ? [...live.keys()].map(() => ' --- |').join('') : '';

const body = `# Environment variable matrix

Generated by \`node scripts/update-env-matrix.mjs\`${live ? ' --coolify' : ''}. Regenerate it in the
same change that adds or renames a variable: see the standing rules, I1 and I2.

- **In .env.example**: whether \`server/.env.example\` documents it.
${live ? '- **prod api / prod frontend**: whether the variable is actually set on the Coolify app.\n' : ''}- Variables read only from tests are marked \`test-only\` and do not need documenting.

## Read by the code

| Variable | Side | In .env.example |${liveHeaders} Read in | Notes |
| --- | --- | --- |${liveDivider} --- | --- |
${allRows.map((row) => row.line).join('\n')}

## Undocumented (action needed)

${undocumented.length === 0
  ? 'None. Every non-test variable the code reads is documented in `server/.env.example`.'
  : undocumented.map((row) => `- \`${row.name}\` (${row.kind}): add it to \`server/.env.example\`.`).join('\n')}

## Documented but unread

${unused.length === 0
  ? 'None.'
  : `These appear in \`server/.env.example\` but nothing reads them. Either they are consumed by
infrastructure (Docker, Coolify, migrations) or they are dead and should be removed.

${unused.map((name) => `- \`${name}\``).join('\n')}`}

## Rules that apply here

- **I1**: a change that adds or renames a variable ends with an explicit
  \`NEW ENV VARS\` block naming the variable, its value shape, the service, and where to set it.
- **I2**: update \`server/.env.example\` and this file in the same change.
- **I4**: never ask Julien to paste a secret into chat.
- **I5**: no secrets in frontend \`VITE_*\` variables. They ship to every browser.
`;

if (CHECK_ONLY) {
  const current = existsSync(OUTPUT) ? readFileSync(OUTPUT, 'utf8') : '';
  if (current.trim() !== body.trim()) {
    console.error('env-matrix: docs/env-matrix.md is stale. Run: node scripts/update-env-matrix.mjs');
    process.exit(1);
  }
  if (undocumented.length > 0) {
    console.error(`env-matrix: ${undocumented.length} variable(s) read by the code but missing from server/.env.example:`);
    for (const row of undocumented) console.error(`  ${row.name} (${row.kind})`);
    process.exit(1);
  }
  console.log('env-matrix: current');
  process.exit(0);
}

writeFileSync(OUTPUT, body);
console.log(`env-matrix: wrote ${path.relative(ROOT, OUTPUT)} (${allRows.length} variables, ${undocumented.length} undocumented)`);
