import { OrdersService } from './orders.service';
import { OrdersPrismaService } from './prisma/orders-prisma.service';
import { ProductsApi } from '../products/api/products.api';
import { NotificationsApi } from '../notifications/api/notifications.api';
import { InventoryPort } from '../inventory/api/inventory.port';
import { OrderStatus, Prisma } from '.prisma/orders-client';
import { Role } from '../common/enums/role.enum';
import { Logger } from '@nestjs/common';
import { RecentWritesService } from '../common/cache/recent-writes.service';
import { OrderEventsPublisher } from './events/order-events.publisher';


const noEvents = { publishOrderCreated: jest.fn().mockResolvedValue(undefined) } as unknown as OrderEventsPublisher;
const noRecentWrites = { mark: async () => undefined, isRecent: async () => false } as unknown as RecentWritesService;

describe('OrdersService compensation', () => {
  it('releases a successful reservation if the database transaction fails', async () => {
    const prisma = { $transaction: jest.fn().mockRejectedValue(new Error('database failed')) } as unknown as OrdersPrismaService;
    const reserve = jest.fn().mockResolvedValue({ success: true });
    const release = jest.fn().mockResolvedValue(undefined);
    const inventory = { reserve, release } as unknown as InventoryPort;
    const notifications = { notify: jest.fn() } as unknown as NotificationsApi;
    const products = { findActiveByIds: jest.fn().mockResolvedValue([{ id: 'p1', name: 'P', price: '1.00' }]) } as unknown as ProductsApi;
    const service = new OrdersService(prisma, inventory, products, notifications, noRecentWrites, noEvents);
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
      readClient: replica, hasReplica: true,
    };
    const primary = primaryMock as unknown as OrdersPrismaService;
    const service = new OrdersService(
      primary,
      {} as InventoryPort,
      {} as ProductsApi,
      {} as NotificationsApi,
      noRecentWrites,
      noEvents,
    );

    await service.list({ id: 'u1', role: Role.CUSTOMER }, {});

    expect(replica.order.findMany).toHaveBeenCalledTimes(1);
    expect(replica.order.count).toHaveBeenCalledTimes(1);
    expect(primaryMock.order.findMany).not.toHaveBeenCalled();
  });

  it('reads from the primary right after the same user wrote (read-your-writes)', async () => {
    const replica = { order: { findMany: jest.fn(), count: jest.fn() } };
    const primaryMock = { order: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) }, readClient: replica, hasReplica: true };
    const recent = { isRecent: jest.fn().mockResolvedValue(true) } as unknown as RecentWritesService;
    const service = new OrdersService(primaryMock as unknown as OrdersPrismaService, {} as InventoryPort, {} as ProductsApi, {} as NotificationsApi, recent, noEvents);

    await service.list({ id: 'u1', role: Role.CUSTOMER }, {});

    expect((recent as any).isRecent).toHaveBeenCalledWith('orders:user:u1');
    expect(primaryMock.order.findMany).toHaveBeenCalledTimes(1);
    expect(replica.order.findMany).not.toHaveBeenCalled();
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
    return { service: new OrdersService(prisma, inventory, products, notifications, noRecentWrites, noEvents), tx, release };
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

describe('OrdersService email outbox (requirement 4)', () => {
  const build = (publish: jest.Mock) => {
    const created = { id: 'o1', orderNumber: 7, userId: 'u1', totalAmount: new Prisma.Decimal('20.00'), createdAt: new Date('2026-11-16T10:00:00Z'), items: [{ productId: 'p1', quantity: 2, unitPrice: new Prisma.Decimal('10.00') }] };
    const tx = { order: { create: jest.fn().mockResolvedValue(created) }, emailJob: { create: jest.fn().mockResolvedValue({}) } };
    const prisma = { $transaction: jest.fn((cb: any) => cb(tx)) } as unknown as OrdersPrismaService;
    const inventory = { reserve: jest.fn().mockResolvedValue({ success: true }), release: jest.fn() } as unknown as InventoryPort;
    const products = { findActiveByIds: jest.fn().mockResolvedValue([{ id: 'p1', name: 'Shirt', price: '10.00' }]) } as unknown as ProductsApi;
    const notifications = { notify: jest.fn().mockResolvedValue(undefined) } as unknown as NotificationsApi;
    const events = { publishOrderCreated: publish } as unknown as OrderEventsPublisher;
    return { service: new OrdersService(prisma, inventory, products, notifications, noRecentWrites, events), tx, inventory };
  };

  it('stores the email job in the same transaction as the order, then publishes after commit', async () => {
    const publish = jest.fn().mockResolvedValue(undefined);
    const { service, tx } = build(publish);
    await service.create('u1', { items: [{ productId: 'p1', quantity: 2 }] }, 'a@b.com');
    expect(tx.emailJob.create).toHaveBeenCalledTimes(1);
    const data = tx.emailJob.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ orderId: 'o1', recipient: 'a@b.com' });
    expect(data.payload).toMatchObject({ orderNumber: 7, to: 'a@b.com', totalAmount: '20.00', items: [{ name: 'Shirt', quantity: 2, unitPrice: '10.00' }] });
    expect(publish).toHaveBeenCalledWith(expect.objectContaining({ jobId: data.id, orderId: 'o1' }));
  });

  it('still returns the order and keeps the stock reserved when publishing fails', async () => {
    const { service, inventory } = build(jest.fn().mockRejectedValue(new Error('rabbit down')));
    const order = await service.create('u1', { items: [{ productId: 'p1', quantity: 2 }] }, 'a@b.com');
    expect(order.id).toBe('o1');
    expect(inventory.release).not.toHaveBeenCalled();
  });
});
