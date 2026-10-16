import Fastify from 'fastify';
import { hasUserBlockBetween } from './user-blocks.js';
import { describe, expect, it, vi } from 'vitest';
import { batchRequestRead, registerRequestReadScopes, reuseRequestRead, withRequestReadScope } from './request-read-scope.js';

describe('response-scoped permission reads', () => {
  it('shares concurrent and subsequent lookups in one response, with independent result objects', async () => {
    const owner = {};
    const read = vi.fn(async () => ({ allowed: true, values: [1] }));
    await withRequestReadScope(async () => {
      const [a, b] = await Promise.all([reuseRequestRead(owner, 'same', read), reuseRequestRead(owner, 'same', read)]);
      a.values.push(2);
      expect(b.values).toEqual([1]);
      expect(await reuseRequestRead(owner, 'same', read)).toEqual(b);
    });
    expect(read).toHaveBeenCalledTimes(1);
    await reuseRequestRead(owner, 'same', read);
    await reuseRequestRead(owner, 'same', read);
    expect(read).toHaveBeenCalledTimes(3);
  });

  it('isolates simultaneous requests, owners and directional permission keys', async () => {
    const owner = {};
    const read = vi.fn(async () => true);
    await Promise.all([1, 2].map(() => withRequestReadScope(async () => {
      await Promise.all([
        reuseRequestRead(owner, 'a:b', read), reuseRequestRead(owner, 'b:a', read),
        reuseRequestRead({}, 'a:b', read), reuseRequestRead(owner, 'a:b', read),
      ]);
    })));
    expect(read).toHaveBeenCalledTimes(6);
  });

  it('never retains a failed lookup', async () => {
    const read = vi.fn().mockRejectedValueOnce(new Error('unavailable')).mockResolvedValueOnce(false);
    const owner = {};
    await withRequestReadScope(async () => {
      await expect(reuseRequestRead(owner, 'grant', read)).rejects.toThrow('unavailable');
      await expect(reuseRequestRead(owner, 'grant', read)).resolves.toBe(false);
    });
    expect(read).toHaveBeenCalledTimes(2);
  });

  it('checks changed permissions again on the next HTTP request and never enables mutation routes', async () => {
    const app = Fastify();
    registerRequestReadScopes(app);
    let allowed = true;
    const read = vi.fn(async () => allowed);
    const handler = async () => ({ values: await Promise.all([
      reuseRequestRead(app, 'grant', read), reuseRequestRead(app, 'grant', read),
    ]) });
    for (const url of ['/api/users', '/api/cruush/me', '/api/posts', '/api/profiles/me']) app.get(url, handler);
    app.post('/api/posts', handler);
    try {
      expect((await app.inject('/api/users')).json()).toEqual({ values: [true, true] });
      allowed = false;
      expect((await app.inject('/api/users')).json()).toEqual({ values: [false, false] });
      expect(read).toHaveBeenCalledTimes(2);
      await app.inject('/api/cruush/me');
      await app.inject('/api/posts');
      expect(read).toHaveBeenCalledTimes(4);
      await app.inject('/api/profiles/me');
      await app.inject({ method: 'POST', url: '/api/posts' });
      expect(read).toHaveBeenCalledTimes(8);
    } finally { await app.close(); }
  });

  it('batches pending unique keys, keeps namespaces separate, and rereads missing rows after creation', async () => {
    const owner = {};
    const rows = new Map([['one', { value: 1 }]]);
    const many = vi.fn(async (keys: string[]) => new Map(keys.flatMap(key => rows.has(key) ? [[key, rows.get(key)!]] : [])));
    const one = vi.fn(async () => null);
    const load = (key: string, namespace = 'rows') => batchRequestRead(owner, namespace, key, many, one);
    await withRequestReadScope(async () => {
      expect(await Promise.all([load('one'), load('one'), load('missing')])).toEqual([{ value: 1 }, { value: 1 }, null]);
      expect(many.mock.calls).toEqual([[['one', 'missing']]]);
      rows.set('missing', { value: 2 });
      expect(await load('missing')).toEqual({ value: 2 });
      await Promise.all([load('one', 'a'), load('one', 'b')]);
    });
    expect(many).toHaveBeenCalledTimes(4);
    await load('one');
    expect(one).toHaveBeenCalledTimes(1);
  });

  it('rejects every waiter when a batch fails and allows a later fresh read', async () => {
    const owner = {};
    const many = vi.fn().mockRejectedValueOnce(new Error('database unavailable')).mockResolvedValueOnce(new Map([['a', false]]));
    const load = (key: string) => batchRequestRead(owner, 'rows', key, many, async () => null);
    await withRequestReadScope(async () => {
      const results = await Promise.allSettled([load('a'), load('b')]);
      expect(results.every(result => result.status === 'rejected')).toBe(true);
      expect(await load('a')).toBe(false);
    });
  });
  it('preserves symmetric block results and fails closed on a production batch error', async () => {
    const query = vi.fn(async (_sql, params) => ({ rows: params[0].map((a: string, i: number) => ({
      user_a: a, user_b: params[1][i], blocked: a === 'a' && params[1][i] === 'b',
    })) }));
    const app = { config: { NODE_ENV: 'production' }, db: { query } } as never;
    expect(await withRequestReadScope(() => Promise.all([
      hasUserBlockBetween(app, 'a', 'b'), hasUserBlockBetween(app, 'b', 'a'), hasUserBlockBetween(app, 'a', 'c'),
    ]))).toEqual([true, true, false]);
    expect(query).toHaveBeenCalledTimes(1);
    query.mockRejectedValueOnce(Object.assign(new Error('missing block table'), { code: '42P01' }));
    await expect(withRequestReadScope(() => hasUserBlockBetween(app, 'a', 'b'))).rejects.toThrow('missing block table');
  });

});
