import { ForbiddenException, Inject, Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { OrderStatus, Prisma, PrismaClient } from '.prisma/orders-client';
import { Role } from '../common/enums/role.enum';
import { OrdersPrismaService } from './prisma/orders-prisma.service';
import { INVENTORY_PORT, InventoryPort } from '../inventory/api/inventory.port';
import { NotificationsApi } from '../notifications/api/notifications.api';
import { ProductsApi } from '../products/api/products.api';
import { CodedException } from '../common/exceptions/coded.exception';
import { CreateOrderDto, OrderQueryDto, UpdateOrderStatusDto } from './dto/order.dto';
import { canTransition } from './order-transitions';
import { randomUUID } from 'crypto';
import { RecentWritesService } from '../common/cache/recent-writes.service';
import { setResponseHeader } from '../common/perf/response-headers';
import { OrderEventsPublisher } from './events/order-events.publisher';
import { OrderCreatedEvent } from './events/order-created.event';
import { PusherService } from './realtime/pusher.service';

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);
  constructor(private readonly prisma: OrdersPrismaService, @Inject(INVENTORY_PORT) private readonly inventory: InventoryPort, private readonly products: ProductsApi, private readonly notifications: NotificationsApi, private readonly recentWrites: RecentWritesService, private readonly events: OrderEventsPublisher, @Optional() private readonly realtime?: PusherService) {}

  // المتطلب الثالث: الطلبات لا تُخزّن في Redis (خاصة بكل مستخدم وتتغير حالتها).
  // القراءة من نسخة القراءة، إلا إذا كتب هذا المستخدم شيئاً خلال آخر ثوانٍ → القاعدة الأساسية،
  // حتى يرى الطلب الذي أنشأه للتو (read-your-writes).
  private async reader(userId: string): Promise<PrismaClient> {
    const usePrimary = !this.prisma.hasReplica || await this.recentWrites.isRecent(`orders:user:${userId}`);
    setResponseHeader('X-Read-Source', usePrimary ? 'primary' : 'replica');
    return usePrimary ? this.prisma : this.prisma.readClient;
  }

  async create(userId: string, dto: CreateOrderDto, email?: string) {
    const products = await this.products.findActiveByIds(dto.items.map((i) => i.productId));
    if (products.length !== dto.items.length) throw new NotFoundException({ code: 'NOT_FOUND', message: 'One or more products do not exist or are inactive' });
    const reserveItems = dto.items.map(({ productId, quantity }) => ({ productId, quantity }));
    const id = randomUUID();
    let reserved = false;
    let event: OrderCreatedEvent | undefined;
    try {
      const result = await this.inventory.reserve(id, reserveItems);
      if (!result.success) throw new CodedException(409, 'INSUFFICIENT_STOCK', 'Insufficient inventory for one or more products', result.insufficient);
      reserved = true;
    } catch (error) { if (error instanceof CodedException) throw error; throw new CodedException(503, 'INVENTORY_UNAVAILABLE', 'Inventory service is temporarily unavailable'); }
    try {
      const order = await this.prisma.$transaction(async (tx) => {
        const totalAmount = dto.items.reduce((sum, item) => { const p = products.find((x) => x.id === item.productId)!; return sum.plus(new Prisma.Decimal(p.price).mul(item.quantity)); }, new Prisma.Decimal(0));
        const created = await tx.order.create({ data: { id, userId, totalAmount, items: { create: dto.items.map((item) => { const p = products.find((x) => x.id === item.productId)!; return { productId: p.id, quantity: item.quantity, unitPrice: new Prisma.Decimal(p.price) }; }) } }, include: { items: true } });
        // المتطلب الرابع (Outbox): حدث الإيميل يُحفظ بنفس transaction الطلب، فإما يُحفظان معاً أو لا شيء.
        if (email) {
          const jobId = randomUUID();
          event = {
            jobId, orderId: created.id, orderNumber: created.orderNumber, userId, to: email,
            totalAmount: totalAmount.toFixed(2),
            items: created.items.map((i) => ({ productId: i.productId, name: products.find((p) => p.id === i.productId)?.name ?? i.productId, quantity: i.quantity, unitPrice: i.unitPrice.toFixed(2) })),
            createdAt: created.createdAt.toISOString(),
          };
          await tx.emailJob.create({ data: { id: jobId, orderId: created.id, recipient: email, payload: event as unknown as Prisma.InputJsonValue } });
        }
        return created;
      });
      await this.recentWrites.mark(`orders:user:${userId}`);
      await this.publishSafely(event);
            this.realtime?.emitOrderCreated(order); // المتطلب الرابع: لوحة الأدمن تتحدث فوراً
      await this.notifySafely(userId, 'ORDER_CREATED', 'Order created', `Order #${order.orderNumber} was created.`);
      return order;
    } catch (error) {
      if (reserved) { try { await this.inventory.release(id, reserveItems); } catch (releaseError) { this.logger.error('Inventory compensation failed after order transaction error', releaseError instanceof Error ? releaseError.stack : undefined); } }
      throw error;
    }
  }

  async list(user: { id: string; role: Role }, query: OrderQueryDto) {
    const where: Prisma.OrderWhereInput = { ...(user.role === Role.ADMIN ? (query.userId ? { userId: query.userId } : {}) : { userId: user.id }), ...(query.status ? { status: query.status } : {}) };
    const { page = 1, limit = 10 } = query;
    const reader = await this.reader(user.id);
    const [items, total] = await Promise.all([reader.order.findMany({ where, include: { items: true }, skip: (page - 1) * limit, take: limit, orderBy: { createdAt: 'desc' } }), reader.order.count({ where })]);
    const totalPages = Math.ceil(total / limit); return { items, meta: { total, page, limit, totalPages, hasNext: page < totalPages, hasPrev: page > 1 } };
  }
  async findOne(id: string, requester: { id: string; role: Role }) {
    const order = await (await this.reader(requester.id)).order.findUnique({ where: { id }, include: { items: true } });
    if (!order) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Order not found' });
    if (requester.role !== Role.ADMIN && order.userId !== requester.id) throw new ForbiddenException({ code: 'FORBIDDEN', message: 'You cannot access this order' });
    return order;
  }
  async changeStatus(id: string, status: OrderStatus, requester: { id: string; role: Role }, ownerCancel = false) {
    const order = await this.prisma.order.findUnique({ where: { id }, include: { items: true } });
    if (!order) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Order not found' });
    if (ownerCancel) { const isOwnerCustomer = order.userId === requester.id && requester.role === Role.CUSTOMER; if (!isOwnerCustomer && requester.role !== Role.ADMIN) throw new ForbiddenException({ code: 'FORBIDDEN', message: 'You cannot cancel this order' }); }
    else if (requester.role !== Role.ADMIN) throw new ForbiddenException({ code: 'FORBIDDEN', message: 'Only administrators can change order status' });
    if (!canTransition(order.status, status)) throw new CodedException(409, 'INVALID_STATUS_TRANSITION', `Cannot change order status from ${order.status} to ${status}`, { current: order.status, requested: status });
    const updated = await this.prisma.$transaction(async (tx) => {
      const res = await tx.order.updateMany({ where: { id, status: order.status }, data: { status } });
      if (res.count === 0) {
        const current = await tx.order.findUnique({ where: { id }, select: { status: true } });
        throw new CodedException(409, 'INVALID_STATUS_TRANSITION',
          `Order status changed concurrently (now ${current?.status})`,
          { current: current?.status, requested: status });
      }
      return tx.order.findUnique({ where: { id }, include: { items: true } });
    });
    await this.recentWrites.mark(`orders:user:${order.userId}`, `orders:user:${requester.id}`);
        if (updated) this.realtime?.emitOrderStatusChanged(updated); // المتطلب الرابع: صفحة الزبون ولوحة الأدمن تتحدثان فوراً
    await this.notifySafely(order.userId, 'ORDER_STATUS_CHANGED', 'Order status changed', `Order #${order.orderNumber} is now ${status}.`);
    // Commit the database transition first; reconcile logged release failures manually.
    if (status === OrderStatus.CANCELLED && updated) {
      const items = updated.items.map(({ productId, quantity }) => ({ productId, quantity }));
      try { await this.inventory.release(id, items); }
      catch (error) { this.logger.error(`Inventory release failed after cancellation for order ${id}; items=${JSON.stringify(items)}`, error instanceof Error ? error.stack : undefined); }
    }
    return updated;
  }
    // النشر لا يُفشل الطلب أبداً: لو RabbitMQ واقع يبقى الـ job بحالة QUEUED ويعيد نشره الـ OutboxRelay في الـ Worker.
  private async publishSafely(event?: OrderCreatedEvent) { if (!event) return; try { await this.events.publishOrderCreated(event); } catch (e) { this.logger.error(`Publishing order.created failed for order ${event.orderId}; relay will retry`, e instanceof Error ? e.stack : undefined); } }
  private async notifySafely(userId: string, type: string, title: string, message: string) { try { await this.notifications.notify({ userId, type, title, message }); } catch (e) { this.logger.error(`Notification failed: ${type} for ${userId}`, e instanceof Error ? e.stack : undefined); } }
  cancel(id: string, requester: { id: string; role: Role }) { return this.changeStatus(id, OrderStatus.CANCELLED, requester, true); }
}
