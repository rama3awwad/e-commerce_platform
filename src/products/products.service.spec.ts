import { ProductsService } from './products.service';
import { ProductsPrismaService } from './prisma/products-prisma.service';
import { InventoryPort } from '../inventory/api/inventory.port';

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
      readClient: replica,
    };
    const primary = primaryMock as unknown as ProductsPrismaService;
    const inventory = { getStocks: jest.fn().mockResolvedValue({}) } as unknown as InventoryPort;
    const service = new ProductsService(primary, inventory);

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
    const service = new ProductsService(primary, inventory);

    await expect(service.create({ name: 'Product', price: 10, categoryId: 'c1' }))
      .resolves.toMatchObject({ id: 'p1', stock: 5 });

    expect(primaryMock.product.findFirst).toHaveBeenCalledTimes(1);
    expect(primaryMock.readClient.product.findFirst).not.toHaveBeenCalled();
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
    const service = new ProductsService(prisma, inventory);

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
