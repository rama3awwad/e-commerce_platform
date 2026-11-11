import { OrdersService } from './orders.service';
import { OrdersPrismaService } from './prisma/orders-prisma.service';
import { ProductsApi } from '../products/api/products.api';
import { NotificationsApi } from '../notifications/api/notifications.api';
import { InventoryPort } from '../inventory/api/inventory.port';
import { OrderStatus } from '.prisma/orders-client';
import { Role } from '../common/enums/role.enum';
import { Logger } from '@nestjs/common';

describe('OrdersService compensation', () => {
  it('releases a successful reservation if the database transaction fails', async () => {
    const prisma = { $transaction: jest.fn().mockRejectedValue(new Error('database failed')) } as unknown as OrdersPrismaService;
    const reserve = jest.fn().mockResolvedValue({ success: true });
    const release = jest.fn().mockResolvedValue(undefined);
    const inventory = { reserve, release } as unknown as InventoryPort;
    const notifications = { notify: jest.fn() } as unknown as NotificationsApi;
    const products = { findActiveByIds: jest.fn().mockResolvedValue([{ id: 'p1', name: 'P', price: '1.00' }]) } as unknown as ProductsApi;
    const service = new OrdersService(prisma, inventory, products, notifications);
    await expect(service.create('u1', { items: [{ productId: 'p1', quantity: 2 }] })).rejects.toThrow('database failed');
    expect(reserve).toHaveBeenCalledWith(expect.any(String), [{ productId: 'p1', quantity: 2 }]);
    expect(release).toHaveBeenCalledWith(reserve.mock.calls[0][0], [{ productId: 'p1', quantity: 2 }]);
  });
});

describe('OrdersService read routing', () => {
  it('uses the read client for order listings', async () => {
    const replica = {
      order: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
    };
    const primaryMock = {
      order: { findMany: jest.fn(), count: jest.fn() },
      readClient: replica,
    };
    const primary = primaryMock as unknown as OrdersPrismaService;
    const service = new OrdersService(
      primary,
      {} as InventoryPort,
      {} as ProductsApi,
      {} as NotificationsApi,
    );

    await service.list({ id: 'u1', role: Role.CUSTOMER }, {});

    expect(replica.order.findMany).toHaveBeenCalledTimes(1);
    expect(replica.order.count).toHaveBeenCalledTimes(1);
    expect(primaryMock.order.findMany).not.toHaveBeenCalled();
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
    const prisma = { order: { findUnique: jest.fn().mockResolvedValue(order) }, $transaction: jest.fn((callback: any) => callback(tx)) } as unknown as OrdersPrismaService;
    const inventory = { release } as unknown as InventoryPort;
    const notifications = { notify: jest.fn().mockResolvedValue(undefined) } as unknown as NotificationsApi;
    const products = { findActiveByIds: jest.fn() } as unknown as ProductsApi;
    return { service: new OrdersService(prisma, inventory, products, notifications), tx, release };
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

  it('allows an admin to cancel another customer order through cancel and releases stock once', async () => {
    const { service, release } = setup();
    await service.cancel('o1', { id: 'admin', role: Role.ADMIN });
    expect(release).toHaveBeenCalledTimes(1);
  });
  it('rejects a customer cancelling another user order', async () => {
    const { service } = setup();
    await expect(service.cancel('o1', { id: 'other', role: Role.CUSTOMER })).rejects.toMatchObject({ response: { code: 'FORBIDDEN' } });
  });
});
