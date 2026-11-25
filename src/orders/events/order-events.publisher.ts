import { Injectable } from '@nestjs/common';
import { RabbitService } from '../../common/messaging/rabbit.service';
import { ATTEMPT_HEADER, EXCHANGES, ROUTING_KEYS } from '../../common/messaging/messaging.constants';
import { OrdersPrismaService } from '../prisma/orders-prisma.service';
import { OrderCreatedEvent } from './order-created.event';
import { Prisma } from '.prisma/orders-client';

@Injectable()
export class OrderEventsPublisher {
  constructor(private readonly rabbit: RabbitService, private readonly prisma: OrdersPrismaService) {}

  /** ينشر order.created ثم يعلّم الـ job بأنه نُشر (publishedAt) كي لا يعيد الـ relay نشره. */
  async publishOrderCreated(event: OrderCreatedEvent, db: Pick<Prisma.TransactionClient, 'emailJob'> = this.prisma): Promise<void> {
    await this.rabbit.publish(EXCHANGES.ORDERS, ROUTING_KEYS.ORDER_CREATED, event, { [ATTEMPT_HEADER]: 0 });
    await db.emailJob.update({ where: { id: event.jobId }, data: { publishedAt: new Date() } });
  }
}
