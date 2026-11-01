import { OrdersService } from './orders.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { InventoryPort } from '../inventory/inventory.port';

describe('OrdersService compensation', () => {
  it('releases a successful reservation if the database transaction fails', async () => {
    const prisma = { product: { findMany: jest.fn().mockResolvedValue([{ id: 'p1', price: { mul: () => ({}) } }]) }, $transaction: jest.fn().mockRejectedValue(new Error('database failed')) } as unknown as PrismaService;
    const inventory = { reserve: jest.fn().mockResolvedValue({ success: true }), release: jest.fn().mockResolvedValue(undefined) } as unknown as InventoryPort;
    const notifications = {} as NotificationsService;
    const service = new OrdersService(prisma, inventory, notifications);
    await expect(service.create('u1', { items: [{ productId: 'p1', quantity: 2 }] })).rejects.toThrow('database failed');
    expect(inventory.reserve).toHaveBeenCalledWith([{ productId: 'p1', quantity: 2 }]);
    expect(inventory.release).toHaveBeenCalledWith([{ productId: 'p1', quantity: 2 }]);
  });
});
