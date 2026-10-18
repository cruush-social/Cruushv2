import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getAuthenticatedUserId } from '../request-auth.js';
import { decryptPreference, encryptPreference } from '../account-preferences.js';

const keySchema = z.enum([
  'map.seeking',
  'map.mutualsOnly',
  'map.zoom',
  'feed.seeking',
  'feed.excludeMileHighClub',
  'feed.purgatory',
  'messages.search',
  'messages.tab',
  'messages.groupSearch',
  'messages.clubSearch',
  'messages.groupSort',
  'messages.sort',
  'messages.seeking',
  'places.query',
  'places.sort',
  'places.excludedFacilityTypes',
  'places.tags',
  'places.vibes',
  'places.amenities',
  'places.radiusMiles',
  'clubs.view',
  'clubs.sort',
  'activity.tab',
  'requests.status',
  'requests.category',
  'moderation.view',
  'moderation.source',
  'moderation.state',
  'moderation.userSearch',
  'moderation.userStatusFilter',
  'moderation.notificationFilter',
  'moderation.supportStatusFilter',
  'moderation.supportCategoryFilter',
  'display.accessibility',
  'display.desktopLayout',
  'display.dlMode',
  'display.dlException',
  'display.settingsSearch',
  'display.benefitsOpen',
  'display.dock.left',
  'display.dock.right',
  'display.pulseGeometry',
]);
const bodySchema = z.object({ value: z.json() }).strict();

export async function registerAccountPreferenceRoutes(app: FastifyInstance) {
  app.get('/api/users/me/preferences', async (request, reply) => {
    const userId = await getAuthenticatedUserId(request);
    const result = await app.db.query<{ preference_key: string; ciphertext: string; nonce: string; auth_tag: string; key_version: string }>('select preference_key, ciphertext, nonce, auth_tag, key_version from account_preferences where user_id = $1', [userId]);
    // Fail closed on unreadable ciphertext; never replace saved choices with defaults.
    const preferences = Object.fromEntries(result.rows.map(row => [row.preference_key, decryptPreference(app.config, userId, row.preference_key, row)]));
    reply.header('Cache-Control', 'no-store');
    return { data: preferences };
  });
  app.put('/api/users/me/preferences/:key', { bodyLimit: 16384, errorHandler(error, _request, reply) {
    if ((error as { code?: string }).code === 'FST_ERR_CTP_BODY_TOO_LARGE') return reply.code(413).send({ error: { code: 'PAYLOAD_TOO_LARGE', message: 'Preferences exceed the size limit.' } });
    throw error;
  } }, async (request, reply) => {
    const userId = await getAuthenticatedUserId(request);
    const name = keySchema.parse((request.params as { key: string }).key);
    const { value } = bodySchema.parse(request.body);
    const encrypted = encryptPreference(app.config, userId, name, value);
    await app.db.query(`insert into account_preferences (user_id, preference_key, ciphertext, nonce, auth_tag, key_version)
      values ($1,$2,$3,$4,$5,$6) on conflict (user_id, preference_key) do update set
      ciphertext=excluded.ciphertext, nonce=excluded.nonce, auth_tag=excluded.auth_tag,
      key_version=excluded.key_version, updated_at=now()`,
    [userId, name, encrypted.ciphertext, encrypted.nonce, encrypted.auth_tag, encrypted.key_version]);
    reply.header('Cache-Control', 'no-store');
    return { data: { saved: true } };
  });
}
