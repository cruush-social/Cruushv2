#!/usr/bin/env node
// Enforces CRUUSH-RULES F1 and F4: `cruush` and `cruush+` are lowercase in
// user-facing copy, and public copy contains no Unicode em dash characters.
//
// Scans string literals, JSX text, and HTML text. Identifiers (CruushActivity,
// useCruushFeed), import paths, and test fixtures are not user-facing and are
// ignored. Put `cruush-case-ok` in a comment on the same line to allow a
// deliberate exception.
//
//   node scripts/check-lowercase-cruush.mjs
//   node scripts/check-lowercase-cruush.mjs --fix

import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const ROOTS = ['src', 'server/src', 'public', 'index.html', 'docs/previews'];
const EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.html', '.css']);
const SKIP_DIRECTORIES = new Set(['node_modules', 'dist', 'build', '.git', 'coverage']);
// Test fixtures are not user-facing copy. The explicitly scanned preview
// directory contains public email and release-preview copy.
const SKIP_FILE = /\.(test|spec)\.[tj]sx?$/;
const ALLOW_MARKER = 'cruush-case-ok';

// `Cruush` not glued to another identifier character on either side.
const OFFENDER = /(?<![A-Za-z0-9_$])Cruush(?![A-Za-z0-9_$])/g;
const EM_DASH = /—/g;

function walk(target, files = []) {
  let stats;
  try {
    stats = statSync(target);
  } catch {
    return files;
  }
  if (stats.isFile()) {
    if (EXTENSIONS.has(path.extname(target)) && !SKIP_FILE.test(target)) files.push(target);
    return files;
  }
  if (!stats.isDirectory()) return files;
  for (const entry of readdirSync(target)) {
    if (SKIP_DIRECTORIES.has(entry)) continue;
    walk(path.join(target, entry), files);
  }
  return files;
}

// Returns the character ranges of every quoted string on the line, so that a
// `Cruush` sitting in code (a type name, a URL segment) is not reported.
function quotedRanges(line) {
  const ranges = [];
  let quote = null;
  let start = 0;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '\\') {
      index += 1;
      continue;
    }
    if (quote) {
      if (char === quote) {
        ranges.push([start, index]);
        quote = null;
      }
      continue;
    }
    if (char === '"' || char === "'" || char === '`') {
      quote = char;
      start = index;
    }
  }
  // An unterminated quote means a template literal spanning lines; treat the
  // rest of the line as quoted rather than silently dropping it.
  if (quote) ranges.push([start, line.length]);
  return ranges;
}

// JSX and HTML text nodes are user-facing without being quoted: >cruush<.
function textNodeRanges(line) {
  const ranges = [];
  const pattern = />([^<>]+)</g;
  let match;
  while ((match = pattern.exec(line)) !== null) {
    ranges.push([match.index + 1, match.index + match[0].length - 1]);
  }
  return ranges;
}

function isUserFacing(line, column) {
  if (line.includes(ALLOW_MARKER)) return false;
  // Import paths and module specifiers are code, not copy.
  if (/^\s*(import|export)\s/.test(line) && /from\s+['"]/.test(line)) return false;
  const ranges = [...quotedRanges(line), ...textNodeRanges(line)];
  return ranges.some(([from, to]) => column > from && column < to);
}

const files = ROOTS.flatMap((entry) => walk(path.join(ROOT, entry)));
const shouldFix = process.argv.includes('--fix');
const violations = [];
const emDashViolations = [];

for (const file of files) {
  const original = readFileSync(file, 'utf8');
  const lines = original.split('\n');
  let changed = false;

  lines.forEach((line, index) => {
    OFFENDER.lastIndex = 0;
    let match;
    while ((match = OFFENDER.exec(line)) !== null) {
      if (!isUserFacing(line, match.index)) continue;
      violations.push({
        file: path.relative(ROOT, file),
        line: index + 1,
        column: match.index + 1,
        text: line.trim().slice(0, 140),
      });
      changed = true;
    }
    EM_DASH.lastIndex = 0;
    while ((match = EM_DASH.exec(line)) !== null) {
      if (!isUserFacing(line, match.index)) continue;
      emDashViolations.push({
        file: path.relative(ROOT, file),
        line: index + 1,
        column: match.index + 1,
        text: line.trim().slice(0, 140),
      });
    }
    if (changed && shouldFix) {
      let rebuilt = '';
      let cursor = 0;
      OFFENDER.lastIndex = 0;
      let inner;
      while ((inner = OFFENDER.exec(line)) !== null) {
        if (!isUserFacing(line, inner.index)) continue;
        rebuilt += line.slice(cursor, inner.index) + 'cruush';
        cursor = inner.index + inner[0].length;
      }
      lines[index] = rebuilt + line.slice(cursor);
    }
  });

  if (changed && shouldFix) writeFileSync(file, lines.join('\n'));
}

if (violations.length === 0 && emDashViolations.length === 0) {
  console.log(`public-copy: clean (${files.length} files scanned)`);
  process.exit(0);
}

if (shouldFix && violations.length > 0) {
  console.log(`lowercase-cruush: rewrote ${violations.length} occurrence(s) to lowercase.`);
  for (const violation of violations) {
    console.log(`  ${violation.file}:${violation.line}`);
  }
}

if (!shouldFix && violations.length > 0) {
  console.error(`lowercase-cruush: ${violations.length} user-facing "Cruush" occurrence(s). CRUUSH-RULES F1 says always lowercase.`);
  for (const violation of violations) {
    console.error(`  ${violation.file}:${violation.line}:${violation.column}  ${violation.text}`);
  }
  console.error('\nFix with: node scripts/check-lowercase-cruush.mjs --fix');
  console.error(`Deliberate exception: add a "${ALLOW_MARKER}" comment on the line.`);
}

if (emDashViolations.length > 0) {
  console.error(`public-copy: ${emDashViolations.length} public em dash occurrence(s). CRUUSH-RULES F4 forbids them.`);
  for (const violation of emDashViolations) {
    console.error(`  ${violation.file}:${violation.line}:${violation.column}  ${violation.text}`);
  }
  console.error('Replace each one with punctuation appropriate to its sentence. This checker does not auto-fix punctuation.');
}

if (shouldFix && emDashViolations.length === 0) process.exit(0);
process.exit(1);
