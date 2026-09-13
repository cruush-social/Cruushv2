/** Apply an explicitly reconciled public transit plan without replacing Spot IDs.
 * Usage: DATABASE_URL=... tsx src/import-transit-spots.ts plan.json [--apply]
 * Raw prepare-transit-spots.py output is intentionally not an import plan.
 */
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import { createPool } from './db.js';
import { transitScheduleUrl, type PlaceTransitDetails } from './place-transit.js';

const publicUrl = z.string().refine((value) => transitScheduleUrl(value) !== null, 'A public HTTPS source URL is required');
const text = z.string().trim().min(1).max(500);
const detailsSchema = z.object({
  services: z.array(z.object({
    route: text, operator: text, direction: z.string().max(500).optional(), destinations: z.array(text),
  }).strict()).min(1),
  scheduleLinks: z.array(z.object({ label: text, url: publicUrl }).strict()),
  entrances: z.array(z.object({
    name: text, side: text.optional(), direction: text.optional(),
    latitude: z.number().min(-90).max(90).optional(), longitude: z.number().min(-180).max(180).optional(),
    sourceUrl: publicUrl,
  }).strict()),
  sms: z.object({ operator: z.literal('mta-bus'), locality: z.literal('nyc'), stopCode: z.string().regex(/^\d{6}$/) }).strict().optional(),
}).strict();
const planSchema = z.array(z.object({
  key: text,
  existingPlaceId: z.string().uuid().nullable(),
  name: z.string().trim().min(2).max(120),
  latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180),
  facilityType: z.enum(['rail_station', 'bus_stop', 'transit']),
  sourceKeys: z.array(text).min(1),
  sources: z.array(z.object({ url: publicUrl, sha256: z.string().regex(/^[a-f0-9]{64}$/) }).strict()).min(1),
  transitDetails: detailsSchema,
}).strict());

function stablePlaceId(key: string) {
  const digest = createHash('sha256').update(`cruush:transit:${key}`).digest('hex');
  return `${digest.slice(0, 8)}-${digest.slice(8, 12)}-5${digest.slice(13, 16)}-a${digest.slice(17, 20)}-${digest.slice(20, 32)}`;
}

const input = process.argv.slice(2).find((arg) => !arg.startsWith('--'));
if (!input || !process.env.DATABASE_URL) throw new Error('Provide plan.json and DATABASE_URL');
const plan = planSchema.parse(JSON.parse(await readFile(input, 'utf8')));
const seenPlaces = new Set<string>();
const seenSources = new Set<string>();
for (const item of plan) {
  const id = item.existingPlaceId ?? stablePlaceId(item.key);
  if (seenPlaces.has(id)) throw new Error(`Combine all services for retained parent ${id} in one plan row`);
  seenPlaces.add(id);
  if (item.facilityType !== 'bus_stop' && item.transitDetails.sms) throw new Error('SMS is only supported on bus-stop Spots');
  if (!item.transitDetails.sms && !item.transitDetails.scheduleLinks.length) throw new Error(`Missing official schedule for ${item.key}`);
  for (const key of new Set([item.key, ...item.sourceKeys])) {
    if (seenSources.has(key)) throw new Error(`Source identity appears under two parent Spots: ${key}`);
    seenSources.add(key);
  }
}
const pool = createPool({ DATABASE_URL: process.env.DATABASE_URL });
let inserted = 0;
let updated = 0;
try {
  await pool.transaction(async (db) => {
    for (const item of plan) {
      const id = item.existingPlaceId ?? stablePlaceId(item.key);
      const sourceKeys = [...new Set([item.key, ...item.sourceKeys])];
      const conflicting = await db.query<{ place_id: string }>(
        'select place_id::text from place_transit_sources where source_key = any($1::text[]) and place_id <> $2', [sourceKeys, id],
      );
      if (conflicting.rows.length) throw new Error(`Source already belongs to another Spot: ${item.key}`);
      const existing = await db.query<{ status: string }>('select status from places where id = $1 for update', [id]);
      if (item.existingPlaceId && !existing.rows.length) throw new Error(`Existing Spot not found: ${id}`);
      if (existing.rows.length && existing.rows[0].status !== 'published') throw new Error(`Never automatically restore an unpublished Spot: ${id}`);
      const details: PlaceTransitDetails = item.transitDetails;
      // Raw feed archives remain provenance only. The public Source link opens
      // the verified operator schedule or that MTA stop's arrivals page.
      const sourcePageUrl = details.sms
        ? `https://bustime.mta.info/?search=${details.sms.stopCode}`
        : details.scheduleLinks[0].url;
      if (existing.rows.length) {
        updated++;
        if (process.argv.includes('--apply')) {
          await db.query('insert into place_transit_originals_20260912 (place_id, original_record) select id, to_jsonb(p) from places p where id = $1 on conflict do nothing', [id]);
          await db.query(
            `update places
             set name = $2, latitude = $3, longitude = $4, facility_type = $5,
                 source_url = $6, transit_details = $7::jsonb, updated_at = now()
             where id = $1`,
            [id, item.name, item.latitude, item.longitude, item.facilityType, sourcePageUrl, JSON.stringify(details)],
          );
        }
      } else {
        inserted++;
        if (process.argv.includes('--apply')) await db.query(
          `insert into places (id, slug, name, latitude, longitude, facility_type, status, source_kind, source_url, source_attribution, transit_details, verified_at)
           values ($1, $2, $3, $4, $5, $6, 'published', 'official', $7, $8, $9::jsonb, now())`,
          [id, `transit-${id}`, item.name, item.latitude, item.longitude, item.facilityType, sourcePageUrl,
            [...new Set(details.services.map((service) => service.operator))].join(', '), JSON.stringify(details)],
        );
      }
      if (process.argv.includes('--apply')) for (const key of sourceKeys) await db.query(
        `insert into place_transit_sources (source_key, place_id, source_url, source_sha256) values ($1, $2, $3, $4)
         on conflict (source_key) do update set source_url = excluded.source_url, source_sha256 = excluded.source_sha256, imported_at = now()`,
        [key, id, item.sources[0].url, item.sources[0].sha256],
      );
    }
  });
  console.log(JSON.stringify({ applied: process.argv.includes('--apply'), inserted, updated }));
} finally {
  await pool.end();
}
