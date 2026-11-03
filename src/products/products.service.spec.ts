import { ProductsService } from './products.service';
import { PrismaService } from '../prisma/prisma.service';
import { InventoryPort } from '../inventory/inventory.port';

describe('ProductsService creation', () => {
  it('deletes the product row and returns 503 when stock initialization fails', async () => {
    const rows = new Map<string, { id: string }>();
    const prisma = {
      category: { findUnique: jest.fn().mockResolvedValue({ id: 'c1' }) },
      product: {
        create: jest.fn().mockImplementation(async () => { const product = { id: 'p1' }; rows.set(product.id, product); return product; }),
        delete: jest.fn().mockImplementation(async ({ where }: any) => { rows.delete(where.id); return { id: where.id }; }),
      },
    } as unknown as PrismaService;
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
