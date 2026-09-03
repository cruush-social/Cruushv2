import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CRUUSH_PLUS_FEATURES,
  CRUUSH_PLUS_SERVER_GATE_COUNT,
} from './cruushPlusFeatures';

const REPOSITORY_ROOT = path.resolve(__dirname, '../../..');
const SERVER_SRC = path.join(REPOSITORY_ROOT, 'server/src');

const IMPLEMENTATION_MARKERS = [
  {
    title: 'Full activity',
    file: 'server/src/routes/cruush.ts',
    marker: 'const incoming = lockable(incomingRows, isCruushPlus);',
  },
  {
    title: 'More Pulses',
    file: 'server/src/map-pings.ts',
    marker: 'const limit = entitlement.cruushPlus ? MAP_PING_PLUS_DAILY_LIMIT : MAP_PING_BASIC_DAILY_LIMIT;',
  },
  {
    title: 'Mile High Club',
    file: 'server/src/routes/privacy.ts',
    marker: '"Mile High Club is part of cruush+."',
  },
  {
    title: 'Feed+',
    file: 'server/src/routes/posts.ts',
    marker: '"Posting to a specific Crowd is part of cruush+."',
  },
  {
    title: 'Cruise carousel',
    file: 'src/app/components/FeelingLucky.tsx',
    marker: 'if (!billingStatus.cruushPlus)',
  },
  {
    title: 'All seeking and visibility controls',
    file: 'server/src/routes/users.ts',
    marker: '"Upgrade to cruush+ to use all seeking filters."',
  },
  {
    title: 'Dark Room',
    file: 'server/src/routes/privacy.ts',
    marker: 'return input.baseMode === "STEALTH";',
  },
] as const;

function countEntitlementGates(dir: string): number {
  return readdirSync(dir).reduce((total, entry) => {
    const full = path.join(dir, entry);

    if (statSync(full).isDirectory()) {
      return total + countEntitlementGates(full);
    }

    if (!entry.endsWith('.ts') || entry.includes('.test.') || entry === 'billing.ts') {
      return total;
    }

    const matches = readFileSync(full, 'utf8').match(/requireCruushPlus\(app,/g);
    return total + (matches?.length ?? 0);
  }, 0);
}

describe('cruush+ benefits copy tracks the gates', () => {
  it('has not gained or lost a gate without the copy moving', () => {
    expect(countEntitlementGates(SERVER_SRC)).toBe(CRUUSH_PLUS_SERVER_GATE_COUNT);
  }, 15_000);

  it('keeps each listed capability tied to its entitlement implementation', () => {
    expect(IMPLEMENTATION_MARKERS.map(({ title }) => title)).toEqual(
      CRUUSH_PLUS_FEATURES.map(({ title }) => title),
    );

    for (const { file, marker } of IMPLEMENTATION_MARKERS) {
      expect(readFileSync(path.join(REPOSITORY_ROOT, file), 'utf8')).toContain(marker);
    }

    expect(readFileSync(path.join(REPOSITORY_ROOT, 'server/src/routes/posts.ts'), 'utf8'))
      .toContain('"Choosing a Feed timer is part of cruush+."');

    // The "More Pulses" promise only holds while the paid limit stays above the basic one.
    const mapPings = readFileSync(path.join(REPOSITORY_ROOT, 'server/src/map-pings.ts'), 'utf8');
    const basicLimit = Number(mapPings.match(/MAP_PING_BASIC_DAILY_LIMIT = (\d+)/)?.[1]);
    const plusLimit = Number(mapPings.match(/MAP_PING_PLUS_DAILY_LIMIT = (\d+)/)?.[1]);
    expect(basicLimit).toBeGreaterThan(0);
    expect(plusLimit).toBeGreaterThan(basicLimit);
  });

  it('names every current capability', () => {
    const copy = CRUUSH_PLUS_FEATURES.map((feature) =>
      `${feature.title} ${feature.description}`).join(' ').toLowerCase();

    for (const promise of [
      'full incoming',
      'pulse',
      'mile high club',
      'specific crowd',
      'expires',
      'cruise carousel',
      'seeking',
      'visibility',
      'dark room',
    ]) {
      expect(copy).toContain(promise);
    }
  });

  it('does not sell free Feed posting as a paid feature', () => {
    const copy = CRUUSH_PLUS_FEATURES.map((feature) =>
      `${feature.title} ${feature.description}`).join(' ').toLowerCase();

    expect(copy).not.toMatch(/post on the local feed|create posts on the local feed|\bping\b|voyeur/);
  });
});
