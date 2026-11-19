import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MessagingModule } from '../common/messaging/messaging.module';
import { MailModule } from '../common/mail/mail.module';
import { OrdersPrismaService } from '../orders/prisma/orders-prisma.service';
import { OrderEventsPublisher } from '../orders/events/order-events.publisher';
import { OrderEmailConsumer } from '../orders/email/order-email.consumer';
import { OutboxRelayService } from '../orders/email/outbox-relay.service';

/** تطبيق الـ Worker المستقل: لا HTTP ولا JWT، فقط consumer وrelay. */
@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env'] }), MessagingModule, MailModule],
  providers: [OrdersPrismaService, OrderEventsPublisher, OrderEmailConsumer, OutboxRelayService],
})
export class WorkerModule {}