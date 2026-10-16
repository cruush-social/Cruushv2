import { AsyncLocalStorage } from "node:async_hooks";
import type { FastifyInstance } from "fastify";

type PendingRead = { resolve(value: unknown): void; reject(error: unknown): void };
type ReadScope = {
  active: boolean;
  reads: Map<object, Map<string, Promise<unknown>>>;
  batches: Map<object, Map<string, Map<string, PendingRead[]>>>;
};
const storage = new AsyncLocalStorage<ReadScope>();

/** A consistent set of lookup results for one list response, never another request. */
export async function withRequestReadScope<T>(work: () => Promise<T>): Promise<T> {
  const scope: ReadScope = { active: true, reads: new Map(), batches: new Map() };
  try {
    return await storage.run(scope, work);
  } finally {
    scope.active = false;
    scope.reads.clear();
    scope.batches.clear();
  }
}

export async function reuseRequestRead<T>(owner: object, key: string, read: () => Promise<T>): Promise<T> {
  const scope = storage.getStore();
  if (!scope?.active) return read();
  let reads = scope.reads.get(owner);
  if (!reads) scope.reads.set(owner, reads = new Map());
  let pending = reads.get(key) as Promise<T> | undefined;
  if (!pending) {
    pending = Promise.resolve().then(read);
    reads.set(key, pending);
  }
  try {
    // Existing callers own their result objects and may enrich them locally.
    return structuredClone(await pending);
  } catch (error) {
    if (reads.get(key) === pending) reads.delete(key);
    throw error;
  }
}

/** Batch only pending rows. A later read can observe a row created by its caller. */
export function batchRequestRead<T>(
  owner: object,
  namespace: string,
  key: string,
  readMany: (keys: string[]) => Promise<Map<string, T>>,
  readOne: () => Promise<T | null>,
): Promise<T | null> {
  const scope = storage.getStore();
  if (!scope?.active) return readOne();
  let batches = scope.batches.get(owner);
  if (!batches) scope.batches.set(owner, batches = new Map());
  let batch = batches.get(namespace);
  if (!batch) {
    batch = new Map();
    batches.set(namespace, batch);
    const queued = batch;
    queueMicrotask(async () => {
      if (batches.get(namespace) === queued) batches.delete(namespace);
      try {
        const rows = await readMany([...queued.keys()]);
        queued.forEach((waiters, rowKey) => waiters.forEach(({ resolve }) => resolve(rows.get(rowKey) ?? null)));
      } catch (error) {
        queued.forEach((waiters) => waiters.forEach(({ reject }) => reject(error)));
      }
    });
  }
  return new Promise<T | null>((resolve, reject) => {
    const waiters = batch.get(key) ?? [];
    waiters.push({ resolve: resolve as PendingRead["resolve"], reject });
    batch.set(key, waiters);
  });
}

export function registerRequestReadScopes(app: FastifyInstance) {
  const listRoutes = new Set(["/api/users", "/api/cruush/me", "/api/posts"]);
  app.addHook("onRoute", (route) => {
    if (route.method !== "GET" || !listRoutes.has(route.url)) return;
    const handler = route.handler;
    route.handler = function (request, reply) {
      return withRequestReadScope(async () => handler.call(this, request, reply));
    };
  });
}
