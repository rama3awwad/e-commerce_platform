import { OrdersService } from './orders.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { InventoryPort } from '../inventory/inventory.port';
import { OrderStatus, Role } from '@prisma/client';
import { Logger } from '@nestjs/common';

describe('OrdersService compensation', () => {
  it('releases a successful reservation if the database transaction fails', async () => {
    const prisma = { product: { findMany: jest.fn().mockResolvedValue([{ id: 'p1', price: { mul: () => ({}) } }]) }, $transaction: jest.fn().mockRejectedValue(new Error('database failed')) } as unknown as PrismaService;
    const reserve = jest.fn().mockResolvedValue({ success: true });
    const release = jest.fn().mockResolvedValue(undefined);
    const inventory = { reserve, release } as unknown as InventoryPort;
    const notifications = {} as NotificationsService;
    const service = new OrdersService(prisma, inventory, notifications);
    await expect(service.create('u1', { items: [{ productId: 'p1', quantity: 2 }] })).rejects.toThrow('database failed');
    expect(reserve).toHaveBeenCalledWith(expect.any(String), [{ productId: 'p1', quantity: 2 }]);
    expect(release).toHaveBeenCalledWith(reserve.mock.calls[0][0], [{ productId: 'p1', quantity: 2 }]);
  });
});

describe('OrdersService status changes', () => {
  const order = { id: 'o1', userId: 'u1', orderNumber: 42, status: OrderStatus.CONFIRMED, items: [{ id: 'i1', productId: 'p1', quantity: 3 }] };
  const setup = (updateCount = 1, release = jest.fn().mockResolvedValue(undefined)) => {
    const tx = {
      order: {
        updateMany: jest.fn().mockResolvedValue({ count: updateCount }),
        findUnique: jest.fn().mockResolvedValue(updateCount ? { ...order, status: OrderStatus.CANCELLED } : { status: OrderStatus.CANCELLED }),
      },
    };
    const prisma = { order: { findUnique: jest.fn().mockResolvedValue(order) }, $transaction: jest.fn((callback: any) => callback(tx)) } as unknown as PrismaService;
    const inventory = { release } as unknown as InventoryPort;
    const notifications = { create: jest.fn().mockResolvedValue(undefined) } as unknown as NotificationsService;
    return { service: new OrdersService(prisma, inventory, notifications), tx, release };
  };

  it('rejects a stale status update and does not release stock', async () => {
    const { service, tx, release } = setup(0);
    try {
      await service.changeStatus('o1', OrderStatus.CANCELLED, { id: 'u1', role: Role.ADMIN });
      fail('Expected stale status update to be rejected');
    } catch (error) {
      expect((error as any).getStatus()).toBe(409);
      expect((error as any).getResponse()).toMatchObject({ code: 'INVALID_STATUS_TRANSITION' });
    }
    expect(tx.order.updateMany).toHaveBeenCalledWith({ where: { id: 'o1', status: OrderStatus.CONFIRMED }, data: { status: OrderStatus.CANCELLED } });
    expect(release).not.toHaveBeenCalled();
  });

  it('releases the order items once after a successful cancellation', async () => {
    const { service, release } = setup();
    await service.changeStatus('o1', OrderStatus.CANCELLED, { id: 'u1', role: Role.ADMIN });
    expect(release).toHaveBeenCalledTimes(1);
    expect(release).toHaveBeenCalledWith('o1', [{ productId: 'p1', quantity: 3 }]);
  });

  it('keeps a committed cancellation successful and logs a failed release', async () => {
    const log = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    const { service } = setup(1, jest.fn().mockRejectedValue(new Error('inventory unavailable')));
    await expect(service.changeStatus('o1', OrderStatus.CANCELLED, { id: 'u1', role: Role.ADMIN }))
      .resolves.toMatchObject({ status: OrderStatus.CANCELLED });
    expect(log).toHaveBeenCalledWith(expect.stringContaining('order o1'), expect.any(String));
    log.mockRestore();
  });
});
