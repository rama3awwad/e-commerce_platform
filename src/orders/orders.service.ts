import { ForbiddenException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { OrderStatus, Prisma, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { INVENTORY_PORT, InventoryPort } from '../inventory/inventory.port';
import { NotificationsService } from '../notifications/notifications.service';
import { CodedException } from '../common/exceptions/coded.exception';
import { CreateOrderDto, OrderQueryDto, UpdateOrderStatusDto } from './dto/order.dto';
import { canTransition } from './order-transitions';
import { randomUUID } from 'crypto';

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);
  constructor(private readonly prisma: PrismaService, @Inject(INVENTORY_PORT) private readonly inventory: InventoryPort, private readonly notifications: NotificationsService) {}

  async create(userId: string, dto: CreateOrderDto) {
    const products = await this.prisma.product.findMany({ where: { id: { in: dto.items.map((i) => i.productId) }, isActive: true } });
    if (products.length !== dto.items.length) throw new NotFoundException({ code: 'NOT_FOUND', message: 'One or more products do not exist or are inactive' });
    const reserveItems = dto.items.map(({ productId, quantity }) => ({ productId, quantity }));
    const id = randomUUID();
    let reserved = false;
    try {
      const result = await this.inventory.reserve(id, reserveItems);
      if (!result.success) throw new CodedException(409, 'INSUFFICIENT_STOCK', 'Insufficient inventory for one or more products', result.insufficient);
      reserved = true;
    } catch (error) { if (error instanceof CodedException) throw error; throw new CodedException(503, 'INVENTORY_UNAVAILABLE', 'Inventory service is temporarily unavailable'); }
    try {
      const order = await this.prisma.$transaction(async (tx) => {
        const totalAmount = dto.items.reduce((sum, item) => { const p = products.find((x) => x.id === item.productId)!; return sum.plus(p.price.mul(item.quantity)); }, new Prisma.Decimal(0));
        const created = await tx.order.create({ data: { id, userId, totalAmount, items: { create: dto.items.map((item) => { const p = products.find((x) => x.id === item.productId)!; return { productId: p.id, quantity: item.quantity, unitPrice: p.price }; }) } }, include: { items: true } });
        await this.notifications.create(userId, 'ORDER_CREATED', 'Order created', `Order #${created.orderNumber} was created.`, tx);
        return created;
      });
      return order;
    } catch (error) {
      if (reserved) { try { await this.inventory.release(id, reserveItems); } catch (releaseError) { this.logger.error('Inventory compensation failed after order transaction error', releaseError instanceof Error ? releaseError.stack : undefined); } }
      throw error;
    }
  }

  async list(user: { id: string; role: Role }, query: OrderQueryDto) {
    const where: Prisma.OrderWhereInput = { ...(user.role === Role.ADMIN ? (query.userId ? { userId: query.userId } : {}) : { userId: user.id }), ...(query.status ? { status: query.status } : {}) };
    const { page = 1, limit = 10 } = query;
    const [items, total] = await Promise.all([this.prisma.order.findMany({ where, include: { items: true }, skip: (page - 1) * limit, take: limit, orderBy: { createdAt: 'desc' } }), this.prisma.order.count({ where })]);
    const totalPages = Math.ceil(total / limit); return { items, meta: { total, page, limit, totalPages, hasNext: page < totalPages, hasPrev: page > 1 } };
  }
  async findOne(id: string, requester: { id: string; role: Role }) {
    const order = await this.prisma.order.findUnique({ where: { id }, include: { items: true } });
    if (!order) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Order not found' });
    if (requester.role !== Role.ADMIN && order.userId !== requester.id) throw new ForbiddenException({ code: 'FORBIDDEN', message: 'You cannot access this order' });
    return order;
  }
  async changeStatus(id: string, status: OrderStatus, requester: { id: string; role: Role }, ownerCancel = false) {
    const order = await this.prisma.order.findUnique({ where: { id }, include: { items: true } });
    if (!order) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Order not found' });
    if (ownerCancel) { if (order.userId !== requester.id) throw new ForbiddenException({ code: 'FORBIDDEN', message: 'You cannot cancel another user\'s order' }); if (requester.role !== Role.CUSTOMER) throw new ForbiddenException({ code: 'FORBIDDEN', message: 'Only the order owner can cancel it' }); }
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
      await this.notifications.create(order.userId, 'ORDER_STATUS_CHANGED', 'Order status changed', `Order #${order.orderNumber} is now ${status}.`, tx);
      return tx.order.findUnique({ where: { id }, include: { items: true } });
    });
    // Commit the database transition first; reconcile logged release failures manually.
    if (status === OrderStatus.CANCELLED && updated) {
      const items = updated.items.map(({ productId, quantity }) => ({ productId, quantity }));
      try { await this.inventory.release(id, items); }
      catch (error) { this.logger.error(`Inventory release failed after cancellation for order ${id}; items=${JSON.stringify(items)}`, error instanceof Error ? error.stack : undefined); }
    }
    return updated;
  }
  cancel(id: string, requester: { id: string; role: Role }) { return this.changeStatus(id, OrderStatus.CANCELLED, requester, true); }
}
