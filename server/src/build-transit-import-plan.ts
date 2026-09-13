/** Build a source-backed batch import plan from reviewed transit candidates.
 *
 * Usage:
 * DATABASE_URL=... tsx src/build-transit-import-plan.ts input.json output.json
 *
 * Candidates lacking an official schedule/SMS link or carrying a source-coordinate
 * review issue remain out of the batch. Those records need their own reconciliation,
 * never a proximity/name merge.
 */
import { readFile, rename, writeFile } from 'node:fs/promises';
import { createPool } from './db.js';

type PreparedRecord = {
  key: string;
  name: string;
  latitude: number;
  longitude: number;
  sourceKeys: string[];
  sources: Array<{ url: string; sha256: string }>;
  modes: string[];
  scheduleLinks: Array<{ label: string; url: string }>;
  entrances: Array<{
    name: string;
    side?: string;
    direction?: string;
    latitude?: number;
    longitude?: number;
    sourceUrl: string;
  }>;
  services: Array<{
    route: string;
    operator: string;
    direction?: string;
    destinations: string[];
  }>;
  sms?: { operator: 'mta-bus'; locality: 'nyc'; stopCode: string };
  reviewIssues?: unknown[];
  explicitParentKey?: string;
};

type PlanRecord = {
  key: string;
  existingPlaceId: string | null;
  name: string;
  latitude: number;
  longitude: number;
  facilityType: 'rail_station' | 'bus_stop';
  explicitParentKey?: string;
  sourceKeys: string[];
  sources: Array<{ url: string; sha256: string }>;
  transitDetails: {
    services: Array<{ route: string; operator: string; direction?: string; destinations: string[] }>;
    scheduleLinks: Array<{ label: string; url: string }>;
    entrances: PreparedRecord['entrances'];
    sms?: NonNullable<PreparedRecord['sms']>;
  };
};

function uniqueBy<T>(items: T[], identity: (item: T) => string): T[] {
  return [...new Map(items.map((item) => [identity(item), item])).values()];
}

function blocksImport(issue: unknown): boolean {
  if (!issue || typeof issue !== 'object') return true;
  const value = issue as { reason?: unknown };
  return value.reason !== 'Official feeds disagree on shared stop coordinates';
}

function combineRetainedParent(
  parent: { name: string; latitude: number; longitude: number; facilityType: 'rail_station' | 'bus_stop' },
  records: PlanRecord[],
): PlanRecord {
  const sms = uniqueBy(records.flatMap((record) => record.transitDetails.sms ? [record.transitDetails.sms] : []), (value) => value.stopCode);
  if (parent.facilityType === 'rail_station' && sms.length) {
    throw new Error('A retained train station cannot carry a bus-stop SMS code: ' + records[0].existingPlaceId);
  }
  if (parent.facilityType === 'bus_stop' && sms.length > 1) {
    throw new Error('A retained bus stop has multiple SMS codes: ' + records[0].existingPlaceId);
  }
  const services = uniqueBy(records.flatMap((record) => record.transitDetails.services), (service) =>
    [service.operator, service.route, service.direction ?? '', [...service.destinations].sort().join('|')].join('\u0000'),
  );
  return {
    key: records[0].key,
    existingPlaceId: records[0].existingPlaceId,
    name: parent.name,
    latitude: parent.latitude,
    longitude: parent.longitude,
    facilityType: parent.facilityType,
    sourceKeys: uniqueBy(records.flatMap((record) => [record.key, ...record.sourceKeys]), (key) => key),
    sources: uniqueBy(records.flatMap((record) => record.sources), (source) => source.url + '\u0000' + source.sha256),
    transitDetails: {
      services,
      scheduleLinks: uniqueBy(records.flatMap((record) => record.transitDetails.scheduleLinks), (link) => link.url),
      entrances: uniqueBy(records.flatMap((record) => record.transitDetails.entrances), (entrance) =>
        [entrance.name, entrance.side ?? '', entrance.direction ?? '', entrance.latitude ?? '', entrance.longitude ?? '', entrance.sourceUrl].join('\u0000'),
      ),
      ...(parent.facilityType === 'bus_stop' && sms.length ? { sms: sms[0] } : {}),
    },
  };
}

function combineExplicitParent(records: PlanRecord[]): PlanRecord {
  const first = records[0];
  if (!first.explicitParentKey || records.some((record) =>
    record.explicitParentKey !== first.explicitParentKey ||
    record.facilityType !== first.facilityType ||
    record.name !== first.name ||
    record.latitude !== first.latitude ||
    record.longitude !== first.longitude,
  )) {
    throw new Error('Explicit parent reconciliation is inconsistent: ' + first.explicitParentKey);
  }
  const sms = uniqueBy(records.flatMap((record) => record.transitDetails.sms ? [record.transitDetails.sms] : []), (value) => value.stopCode);
  if (sms.length > 1) throw new Error('Explicit parent has multiple bus-stop SMS codes: ' + first.explicitParentKey);
  const services = uniqueBy(records.flatMap((record) => record.transitDetails.services), (service) =>
    [service.operator, service.route, service.direction ?? '', [...service.destinations].sort().join('|')].join('\u0000'),
  );
  return {
    key: first.key,
    existingPlaceId: null,
    explicitParentKey: first.explicitParentKey,
    name: first.name,
    latitude: first.latitude,
    longitude: first.longitude,
    facilityType: first.facilityType,
    sourceKeys: uniqueBy(records.flatMap((record) => [record.key, ...record.sourceKeys]), (key) => key),
    sources: uniqueBy(records.flatMap((record) => record.sources), (source) => source.url + '\u0000' + source.sha256),
    transitDetails: {
      services,
      scheduleLinks: uniqueBy(records.flatMap((record) => record.transitDetails.scheduleLinks), (link) => link.url),
      entrances: uniqueBy(records.flatMap((record) => record.transitDetails.entrances), (entrance) =>
        [entrance.name, entrance.side ?? '', entrance.direction ?? '', entrance.latitude ?? '', entrance.longitude ?? '', entrance.sourceUrl].join('\u0000'),
      ),
      ...(first.facilityType === 'bus_stop' && sms.length ? { sms: sms[0] } : {}),
    },
  };
}

const [input, output] = process.argv.slice(2).filter((value) => !value.startsWith('--'));
if (!input || !output || !process.env.DATABASE_URL) {
  throw new Error('Usage: DATABASE_URL=... tsx src/build-transit-import-plan.ts input.json output.json');
}

const prepared = JSON.parse(await readFile(input, 'utf8')) as PreparedRecord[];
const eligible = prepared.filter((record) =>
  (record.sms || record.scheduleLinks.length > 0) && !(record.reviewIssues?.some(blocksImport)),
);
const deferred = prepared.length - eligible.length;
const sourceKeys = [...new Set(eligible.flatMap((record) => [record.key, ...record.sourceKeys]))];
const pool = createPool({ DATABASE_URL: process.env.DATABASE_URL });

try {
  const sourceRows = await pool.query<{ source_key: string; place_id: string }>(
    'select source_key, place_id::text from place_transit_sources where source_key = any($1::text[])',
    [sourceKeys],
  );
  const existingBySource = new Map(sourceRows.rows.map((row) => [row.source_key, row.place_id]));
  const candidates: PlanRecord[] = eligible.map((record) => {
    const existingIds = [...new Set(
      [record.key, ...record.sourceKeys].map((key) => existingBySource.get(key)).filter((id): id is string => Boolean(id)),
    )];
    if (existingIds.length > 1) throw new Error('Source aliases map to multiple existing Spots: ' + record.key);
    const facilityType = record.modes.includes('rail_station') ? 'rail_station' : 'bus_stop';
    return {
      key: record.key,
      existingPlaceId: existingIds[0] ?? null,
      name: record.name,
      latitude: record.latitude,
      longitude: record.longitude,
      facilityType,
      ...(record.explicitParentKey ? { explicitParentKey: record.explicitParentKey } : {}),
      sourceKeys: record.sourceKeys,
      sources: record.sources.map(({ url, sha256 }) => ({ url, sha256 })),
      transitDetails: {
        services: record.services.map((service) => ({
          route: service.route,
          operator: service.operator,
          ...(service.direction ? { direction: service.direction } : {}),
          destinations: service.destinations,
        })),
        scheduleLinks: record.scheduleLinks,
        entrances: record.entrances,
        ...(record.sms ? { sms: record.sms } : {}),
      },
    };
  });
  const retainedIds = [...new Set(candidates.flatMap((record) => record.existingPlaceId ? [record.existingPlaceId] : []))];
  const retainedRows = await pool.query<{
    id: string;
    name: string;
    latitude: number;
    longitude: number;
    status: string;
    facility_type: string;
  }>(
    'select id::text, name, latitude, longitude, status, facility_type from places where id = any($1::uuid[])',
    [retainedIds],
  );
  const retainedById = new Map(retainedRows.rows.map((row) => [row.id, row]));
  for (const id of retainedIds) {
    const retained = retainedById.get(id);
    if (!retained) throw new Error('Existing transit Spot disappeared: ' + id);
    if (retained.status !== 'published') throw new Error('Existing transit Spot remains archived: ' + id);
    if (retained.facility_type !== 'rail_station' && retained.facility_type !== 'bus_stop') {
      throw new Error('Existing transit Spot has an unsupported category: ' + id);
    }
  }
  const groupedRetained = new Map<string, PlanRecord[]>();
  const groupedExplicitParents = new Map<string, PlanRecord[]>();
  const plan: PlanRecord[] = [];
  for (const candidate of candidates) {
    if (!candidate.existingPlaceId && !candidate.explicitParentKey) {
      plan.push(candidate);
      continue;
    }
    if (!candidate.existingPlaceId && candidate.explicitParentKey) {
      const group = groupedExplicitParents.get(candidate.explicitParentKey) ?? [];
      group.push(candidate);
      groupedExplicitParents.set(candidate.explicitParentKey, group);
      continue;
    }
    const group = groupedRetained.get(candidate.existingPlaceId) ?? [];
    group.push(candidate);
    groupedRetained.set(candidate.existingPlaceId, group);
  }
  for (const [id, records] of groupedRetained) {
    const retained = retainedById.get(id);
    if (!retained) throw new Error('Existing transit Spot disappeared: ' + id);
    plan.push(combineRetainedParent({
      name: retained.name,
      latitude: retained.latitude,
      longitude: retained.longitude,
      facilityType: retained.facility_type,
    }, records));
  }
  for (const records of groupedExplicitParents.values()) {
    plan.push(records.length === 1 ? records[0] : combineExplicitParent(records));
  }
  const importPlan = plan.map(({ explicitParentKey: _explicitParentKey, ...record }) => record);
  const temporary = output + '.tmp';
  await writeFile(temporary, JSON.stringify(importPlan), 'utf8');
  await rename(temporary, output);
  console.log(JSON.stringify({
    totalCandidates: prepared.length,
    planned: importPlan.length,
    deferred,
    existing: importPlan.filter((record) => record.existingPlaceId).length,
    railStations: importPlan.filter((record) => record.facilityType === 'rail_station').length,
    busStops: importPlan.filter((record) => record.facilityType === 'bus_stop').length,
  }));
} finally {
  await pool.end();
}
