import { ProductsService } from './products.service';
import { ProductsPrismaService } from './prisma/products-prisma.service';
import { InventoryPort } from '../inventory/api/inventory.port';
import { CacheService } from '../common/cache/cache.service';
import { RecentWritesService } from '../common/cache/recent-writes.service';

// بدائل بسيطة: الكاش معطل ولا توجد كتابات حديثة.
const noCache = { getOrLoad: (_key: string, load: () => unknown) => load(), version: async () => '0', invalidate: async () => undefined } as unknown as CacheService;
const noRecentWrites = { mark: async () => undefined, isRecent: async () => false } as unknown as RecentWritesService;

describe('ProductsService creation', () => {
  it('uses the read client for product listings', async () => {
    const replica = {
      product: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
    };
    const primaryMock = {
      product: { findMany: jest.fn(), count: jest.fn() },
      readClient: replica, hasReplica: true,
    };
    const primary = primaryMock as unknown as ProductsPrismaService;
    const inventory = { getStocks: jest.fn().mockResolvedValue({}) } as unknown as InventoryPort;
    const service = new ProductsService(primary, inventory, noCache, noRecentWrites);

    await service.list({});

    expect(replica.product.findMany).toHaveBeenCalledTimes(1);
    expect(replica.product.count).toHaveBeenCalledTimes(1);
    expect(primaryMock.product.findMany).not.toHaveBeenCalled();
  });

  it('returns a newly created product from the primary after initializing stock', async () => {
    const primaryMock = {
      category: { findUnique: jest.fn().mockResolvedValue({ id: 'c1' }) },
      product: {
        create: jest.fn().mockResolvedValue({ id: 'p1' }),
        findFirst: jest.fn().mockResolvedValue({ id: 'p1', name: 'Product', category: { id: 'c1' } }),
      },
      readClient: { product: { findFirst: jest.fn() } },
    };
    const primary = primaryMock as unknown as ProductsPrismaService;
    const inventory = {
      setStock: jest.fn().mockResolvedValue(undefined),
      getStock: jest.fn().mockResolvedValue(5),
    } as unknown as InventoryPort;
    const service = new ProductsService(primary, inventory, noCache, noRecentWrites);

    await expect(service.create({ name: 'Product', price: 10, categoryId: 'c1' }))
      .resolves.toMatchObject({ id: 'p1', stock: 5 });

    expect(primaryMock.product.findFirst).toHaveBeenCalledTimes(1);
    expect(primaryMock.readClient.product.findFirst).not.toHaveBeenCalled();
  });

  it('serves a cached product page without touching the database, but always reads live stock', async () => {
    const store = new Map<string, unknown>();
    const cache = {
      getOrLoad: async (key: string, load: () => Promise<unknown>) => { if (!store.has(key)) store.set(key, await load()); return store.get(key); },
      version: async () => '0',
      invalidate: async () => store.clear(),
    } as unknown as CacheService;
    const replica = { product: { findMany: jest.fn().mockResolvedValue([{ id: 'p1' }]), count: jest.fn().mockResolvedValue(1) } };
    const prisma = { readClient: replica, hasReplica: true } as unknown as ProductsPrismaService;
    const inventory = { getStocks: jest.fn().mockResolvedValueOnce({ p1: 5 }).mockResolvedValueOnce({ p1: 4 }) } as unknown as InventoryPort;
    const service = new ProductsService(prisma, inventory, cache, noRecentWrites);

    const first = await service.list({});
    const second = await service.list({});

    expect(replica.product.findMany).toHaveBeenCalledTimes(1);
    expect(first.items[0].stock).toBe(5);
    expect(second.items[0].stock).toBe(4);
  });

  it('reads products from the primary right after a product write (read-your-writes)', async () => {
    const replica = { product: { findMany: jest.fn(), count: jest.fn() } };
    const primaryMock = { product: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) }, readClient: replica, hasReplica: true };
    const recent = { mark: async () => undefined, isRecent: async () => true } as unknown as RecentWritesService;
    const service = new ProductsService(primaryMock as unknown as ProductsPrismaService, { getStocks: jest.fn().mockResolvedValue({}) } as unknown as InventoryPort, noCache, recent);

    await service.list({});

    expect(primaryMock.product.findMany).toHaveBeenCalledTimes(1);
    expect(replica.product.findMany).not.toHaveBeenCalled();
  });

  it('deletes the product row and returns 503 when stock initialization fails', async () => {
    const rows = new Map<string, { id: string }>();
    const prisma = {
      category: { findUnique: jest.fn().mockResolvedValue({ id: 'c1' }) },
      product: {
        create: jest.fn().mockImplementation(async () => { const product = { id: 'p1' }; rows.set(product.id, product); return product; }),
        delete: jest.fn().mockImplementation(async ({ where }: any) => { rows.delete(where.id); return { id: where.id }; }),
      },
    } as unknown as ProductsPrismaService;
    const inventory = { setStock: jest.fn().mockRejectedValue(new Error('inventory unavailable')) } as unknown as InventoryPort;
    const service = new ProductsService(prisma, inventory, noCache, noRecentWrites);

    try {
      await service.create({ name: 'Product', price: 10, categoryId: 'c1' });
      fail('Expected inventory initialization to fail');
    } catch (error) {
      expect((error as any).getStatus()).toBe(503);
      expect((error as any).getResponse()).toMatchObject({ code: 'INVENTORY_UNAVAILABLE' });
    }
    expect((prisma as any).product.delete).toHaveBeenCalledWith({ where: { id: 'p1' } });
    expect(rows.has('p1')).toBe(false);
  });
});
