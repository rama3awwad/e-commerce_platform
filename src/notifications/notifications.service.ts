import { Injectable, NotFoundException } from '@nestjs/common';

import { NotificationsPrismaService } from './prisma/notifications-prisma.service';
import { NotificationQueryDto } from './dto/notification-query.dto';
import { CodedException } from '../common/exceptions/coded.exception';


@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: NotificationsPrismaService) {}
  create(userId: string, type: string, title: string, message: string) { return this.prisma.notification.create({ data: { userId, type, title, message } }); }
  async list(userId: string, query: NotificationQueryDto) {
    const { page = 1, limit = 10 } = query; const where = { userId };
    const [items, total, unreadCount] = await Promise.all([this.prisma.notification.findMany({ where, skip: (page - 1) * limit, take: limit, orderBy: { createdAt: 'desc' } }), this.prisma.notification.count({ where }), this.prisma.notification.count({ where: { userId, isRead: false } })]);
    const totalPages = Math.ceil(total / limit);
    return { items, meta: { total, page, limit, totalPages, hasNext: page < totalPages, hasPrev: page > 1, unreadCount } };
  }
  async markRead(userId: string, id: string) { const record = await this.prisma.notification.findUnique({ where: { id } }); if (!record) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Notification not found' }); if (record.userId !== userId) throw new CodedException(403, 'FORBIDDEN', 'This notification belongs to another user'); return this.prisma.notification.update({ where: { id }, data: { isRead: true } }); }
  markAllRead(userId: string) { return this.prisma.notification.updateMany({ where: { userId, isRead: false }, data: { isRead: true } }); }
}
