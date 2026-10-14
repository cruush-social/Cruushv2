import Fastify from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerContentVisibilityRoutes } from './routes/content-visibility.js';
const authenticate = vi.hoisted(() => vi.fn());
vi.mock('./request-auth.js', () => ({ getAuthenticatedUserId: authenticate }));
afterEach(() => vi.resetAllMocks());
describe('content visibility revision', () => {
  it('returns only the opaque revision and prevents response caching', async () => {
    const app = Fastify();
    const query = vi.fn().mockResolvedValue({ rows: [{ revision: 'opaque-ban-revision', privateUserId: 'must-not-leak' }] });
    app.decorate('db', { query, end: vi.fn() });
    authenticate.mockResolvedValue('authenticated-member');
    await registerContentVisibilityRoutes(app);
    try {
      const response = await app.inject('/api/content/visibility-revision');
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ data: { revision: 'opaque-ban-revision' } });
      expect(response.headers['cache-control']).toBe('private, no-store');
      // A successful deletion removes the account row, so the count must include
      // active accounts as well as retained moderation/deletion rows.
      expect(query.mock.calls[0][0]).toContain("count(*)");
      expect(query.mock.calls[0][0]).toContain("max(account_status_updated_at)");
      expect(query.mock.calls[0][0]).toContain("max(created_at)");
      expect(query.mock.calls[0][0]).not.toContain("where account_status");
    } finally { await app.close(); }
  });
  it('rejects unauthenticated requests before reading moderation state', async () => {
    const app = Fastify();
    const query = vi.fn();
    app.decorate('db', { query, end: vi.fn() });
    authenticate.mockRejectedValue(Object.assign(new Error('Unauthorized'), { statusCode: 401 }));
    await registerContentVisibilityRoutes(app);
    try {
      expect((await app.inject('/api/content/visibility-revision')).statusCode).toBe(401);
      expect(query).not.toHaveBeenCalled();
    } finally { await app.close(); }
  });
});
