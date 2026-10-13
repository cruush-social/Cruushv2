import pg from 'pg';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildServer } from './app.js';
import type { AppConfig } from './config.js';
import type { DbClient } from './db.js';
import { encryptMediaBytes } from './media-encryption.js';
import { writeEncryptedMediaObject } from './media-storage.js';

const databaseUrl = process.env.CRUUSH_MESSAGE_EXPIRY_POSTGRES_URL;
const sender = '78000000-0000-4000-8000-000000000011';
const recipient = '78000000-0000-4000-8000-000000000012';
const asset = '78000000-0000-4000-8000-000000000013';
const message = '78000000-0000-4000-8000-000000000014';
const conversation = '78000000-0000-4000-8000-000000000015';

describe.skipIf(!databaseUrl)('regular message photo expiry with PostgreSQL', () => {
  it('denies recipient reload and cached revalidation after the database deadline while retaining the underlying asset', async () => {
    const url = new URL(databaseUrl!);
    if (!['localhost', '127.0.0.1'].includes(url.hostname) || !/^\/cruush_(sovereignpay|message_expiry)_[a-z0-9]+$/.test(url.pathname)) {
      throw new Error('Use an isolated local sovereignpay or message_expiry fixture database.');
    }
    const client = new pg.Client({ connectionString: databaseUrl });
    const mediaDir = await mkdtemp(path.join(tmpdir(), 'cruush-photo-expiry-'));
    let app: ReturnType<typeof buildServer> | undefined;
    try {
      await client.connect();
      // All fixtures are connection-local temporary tables; public data is untouched.
      await client.query(`
        create temp table app_users (id uuid, account_status text);
        create temp table media_objects (id uuid, owner_user_id uuid, surface text, explicit_classification text, moderation_status text, deleted_at timestamptz);
        create temp table media_variants (media_object_id uuid, variant_type text, object_key text, mime_type text, encrypted_data_key text, data_key_nonce text, data_key_auth_tag text, content_nonce text, content_auth_tag text, key_version text, deleted_at timestamptz);
        create temp table messages (id uuid, conversation_id uuid, created_at timestamptz, expires_at timestamptz);
        create temp table conversations (id uuid, cleared_at timestamptz);
        create temp table conversation_members (conversation_id uuid, user_id uuid);
        create temp table message_media_attachments (message_id uuid, media_object_id uuid, view_once boolean);
      `);
      const config = {
        NODE_ENV: 'test', DATABASE_URL: databaseUrl, CORS_ORIGIN: 'http://localhost',
        SESSION_SECRET: 'synthetic-expiry-fixture-secret', APP_URL: 'http://localhost', APP_DEPLOYMENT_STAGE: 'staging',
        MEDIA_STORAGE_DIR: mediaDir, MEDIA_OBJECT_STORAGE_DRIVER: 'local',
        MEDIA_ENCRYPTION_KEY: '0123456789abcdef0123456789abcdef', MEDIA_ENCRYPTION_KEY_VERSION: 'v1',
      } as AppConfig;
      const bytes = Buffer.from('synthetic regular photo fixture');
      const encrypted = encryptMediaBytes(config, bytes);
      const objectKey = 'message-photos/expiry-fixture.enc';
      await writeEncryptedMediaObject(config, objectKey, encrypted.ciphertext);
      await client.query("insert into app_users values ($1, 'active'), ($2, 'active')", [sender, recipient]);
      await client.query("insert into media_objects values ($1, $2, 'message_photo', 'non_explicit', 'approved', null)", [asset, sender]);
      await client.query("insert into media_variants values ($1, 'display', $2, 'image/png', $3, $4, $5, $6, $7, $8, null)",
        [asset, objectKey, encrypted.encryptedDataKey, encrypted.dataKeyNonce, encrypted.dataKeyAuthTag, encrypted.nonce, encrypted.authTag, encrypted.keyVersion]);
      await client.query('insert into conversations values ($1, null)', [conversation]);
      await client.query('insert into conversation_members values ($1, $2)', [conversation, recipient]);
      await client.query("insert into messages values ($1, $2, now(), now() + interval '1 hour')", [message, conversation]);
      await client.query('insert into message_media_attachments values ($1, $2, false)', [message, asset]);
      app = buildServer(config, { db: {
        query: (sql, params) => client.query(sql, params), end: async () => {},
      } as DbClient });
      const fetch = (etag?: string) => app!.inject({ method: 'GET', url: `/api/media/assets/${asset}/display`,
        headers: { 'x-user-id': recipient, ...(etag ? { 'if-none-match': etag } : {}) } });
      const before = await fetch();
      expect(before.statusCode).toBe(200);
      expect(before.rawPayload.equals(bytes)).toBe(true);
      const etag = before.headers.etag as string;
      expect((await fetch(etag)).statusCode).toBe(304);
      // PostgreSQL's own clock crosses the fixture deadline; no cleanup runs.
      await client.query("update messages set expires_at = clock_timestamp() + interval '50 milliseconds' where id = $1", [message]);
      await client.query('select pg_sleep(0.08)');
      for (const validator of [undefined, etag]) {
        const after = await fetch(validator);
        expect(after.statusCode).toBe(404);
        expect(after.rawPayload.equals(bytes)).toBe(false);
        expect(after.headers.etag).toBeUndefined();
      }
      expect((await client.query('select count(*)::int as total from media_objects')).rows[0].total).toBe(1);
      expect((await client.query('select count(*)::int as total from messages')).rows[0].total).toBe(1);
    } finally {
      await app?.close();
      await client.end();
      await rm(mediaDir, { recursive: true, force: true });
    }
  });
});
