import { CacheService } from './cache.service';

// Redis وهمي في الذاكرة يكفي لـ get / set (EX, PX, NX) / eval (تحرير القفل).
function fakeRedis() {
  const store = new Map<string, string>();
  return {
    store,
    status: 'ready',
    get: async (key: string) => store.get(key) ?? null,
    set: async (key: string, value: string, ...args: unknown[]) => {
      if (args.includes('NX') && store.has(key)) return null;
      store.set(key, value);
      return 'OK';
    },
    eval: async (_script: string, _n: number, key: string, token: string) => {
      if (store.get(key) === token) { store.delete(key); return 1; }
      return 0;
    },
  };
}

describe('CacheService stampede protection', () => {
  it('lets only one of 50 concurrent requests load from the database when the key is missing', async () => {
    const service = new CacheService();
    (service as any).redis = fakeRedis();
    const load = jest.fn(async () => { await new Promise((r) => setTimeout(r, 200)); return { id: 'p1' }; });

    const results = await Promise.all(Array.from({ length: 50 }, () => service.getOrLoad('products:v0:detail:p1', load)));

    expect(load).toHaveBeenCalledTimes(1);
    expect(results.every((r) => r.id === 'p1')).toBe(true);
    expect(await service.stats()).toMatchObject({ dbLoads: 1, stampedeWaits: 49, lockTimeouts: 0 });
  });

  it('recovers by reading the database itself when the lock holder never fills the cache', async () => {
    const service = new CacheService();
    const redis = fakeRedis();
    redis.store.set('lock:k', 'someone-who-crashed');
    (service as any).redis = redis;
    (service as any).lockWaitMs = 200;

    await expect(service.getOrLoad('k', async () => 'fresh')).resolves.toBe('fresh');
    expect(await service.stats()).toMatchObject({ lockTimeouts: 1, dbLoads: 1 });
  });
});
