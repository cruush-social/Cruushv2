import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import Fastify from 'fastify';
import pg from 'pg';
import { readFile } from 'node:fs/promises';
import { encryptPreference, decryptPreference } from './account-preferences.js';
import { registerAccountPreferenceRoutes } from './routes/account-preferences.js';
import type { AppConfig } from './config.js';
import type { DbClient } from './db.js';
import { formatError, toApiError } from './errors.js';
const config = { NODE_ENV:'test', SESSION_SECRET:'synthetic-only-preferences-key', PROFILE_ENCRYPTION_KEY:'synthetic-only-profile-key' } as AppConfig;
it('encrypts values with fresh nonces and authenticates account plus preference key', () => {
  const a = encryptPreference(config, 'one', 'map.seeking', { roles:['switch'] });
  const b = encryptPreference(config, 'one', 'map.seeking', { roles:['switch'] });
  expect(a.ciphertext).not.toContain('switch'); expect(a.nonce).not.toBe(b.nonce);
  expect(decryptPreference(config, 'one', 'map.seeking', a)).toEqual({roles:['switch']});
  expect(()=>decryptPreference(config, 'two', 'map.seeking', a)).toThrow();
  expect(()=>decryptPreference(config, 'one', 'feed.seeking', a)).toThrow();
  expect(()=>decryptPreference(config, 'one', 'map.seeking', {...a,auth_tag:Buffer.alloc(16).toString('base64')})).toThrow();
});
const url = process.env.PREFERENCES_TEST_DATABASE_URL;
describe.skipIf(!url)('encrypted account preferences routes with isolated Postgres', () => {
  const db = new pg.Pool({connectionString:url});
  const app = Fastify();
  const one='00000000-0000-4000-8000-000000000001',two='00000000-0000-4000-8000-000000000002';
  beforeAll(async()=>{
    await db.query('create table if not exists app_users(id uuid primary key)');
    await db.query(await readFile(new URL('../sql/234_account_preferences.sql', import.meta.url),'utf8'));
    app.decorate('db',db as unknown as DbClient);app.decorate('config',config);
    app.setErrorHandler((error,request,reply)=>{const e=toApiError(error);reply.code(e.statusCode).send(formatError(e));});
    await registerAccountPreferenceRoutes(app); await app.ready();
  });
  beforeEach(async()=>{await db.query('truncate app_users cascade');await db.query('insert into app_users(id) values($1),($2)',[one,two]);});
  afterAll(async()=>{await app.close();await db.end();});
  const put=(owner:string,key:string,value:unknown)=>app.inject({method:'PUT',url:'/api/users/me/preferences/'+key,headers:{'x-user-id':owner},payload:{value}});
  const get=(owner:string)=>app.inject({url:'/api/users/me/preferences',headers:{'x-user-id':owner}});
  it('uses authenticated owner, persists distinct concurrent keys, and stores no plaintext value',async()=>{
    const results=await Promise.all([put(one,'map.seeking',{roles:['switch']}),put(one,'feed.purgatory','only')]);
    results.forEach(r=>expect(r.statusCode).toBe(200));
    expect((await get(one)).json().data).toEqual({'map.seeking':{roles:['switch']},'feed.purgatory':'only'});
    expect((await get(two)).json().data).toEqual({});
    const rows=await db.query('select * from account_preferences');expect(JSON.stringify(rows.rows)).not.toContain('switch');
    expect((await app.inject({url:'/api/users/me/preferences'})).statusCode).toBe(401);
  });
  it('retains explicit Clear and cascades account deletion',async()=>{
    await put(one,'map.seeking',{roles:['switch']});await put(one,'map.seeking',{roles:[]});
    expect((await get(one)).json().data['map.seeking']).toEqual({roles:[]});
    await db.query('delete from app_users where id=$1',[one]);expect((await db.query('select count(*) from account_preferences')).rows[0].count).toBe('0');
  });
  it('rejects oversized or invalid payloads and fails closed for corrupted ciphertext',async()=>{
    expect((await put(one,'auth.token','secret')).statusCode).toBe(400);
    expect((await put(one,'messages.search','x'.repeat(17000))).statusCode).toBe(413);
    await put(one,'map.seeking',{roles:['switch']});await db.query("update account_preferences set auth_tag='AAAAAAAAAAAAAAAAAAAAAA=='");
    expect((await get(one)).statusCode).toBe(500);
  });
});
