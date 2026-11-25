import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { RabbitService, Delivery } from '../../common/messaging/rabbit.service';
import { ATTEMPT_HEADER, QUEUES, retryQueueName } from '../../common/messaging/messaging.constants';
import { MailService } from '../../common/mail/mail.service';
import { OrdersPrismaService } from '../prisma/orders-prisma.service';
import { OrderCreatedEvent } from '../events/order-created.event';
import { decideRetry } from './retry-policy';
import { renderOrderCreatedEmail } from './order-email.template';
import { Prisma } from '.prisma/orders-client';

/**
 * الـ Worker: يسحب order.created ويرسل الإيميل.
 * - ack فقط بعد النجاح (أو بعد نقل الرسالة بأمان إلى retry/DLQ).
 * - لو مات الـ Worker قبل الـ ack تعود الرسالة للـ queue تلقائياً (لا ضياع).
 */
@Injectable()
export class OrderEmailConsumer implements OnApplicationBootstrap {
  private readonly logger = new Logger(OrderEmailConsumer.name);
  constructor(private readonly rabbit: RabbitService, private readonly prisma: OrdersPrismaService, private readonly mail: MailService) {}

  async onApplicationBootstrap() { await this.rabbit.consume(QUEUES.EMAIL, (d) => this.handle(d), 1); }

  private async forceFailEnabled(): Promise<boolean> {
    try { return (await this.prisma.appFlag.findUnique({ where: { key: 'mail.forceFail' } }))?.value === 'true'; }
    catch { return false; }
  }

  async handle(d: Delivery): Promise<void> {
    let event: OrderCreatedEvent;
    try { event = JSON.parse(d.msg.content.toString()); }
    catch {
      await this.rabbit.publish('', QUEUES.EMAIL_DLQ, { raw: d.msg.content.toString(), error: 'invalid JSON' });
      d.ack(); return;
    }
    const failures = Number(d.msg.properties.headers?.[ATTEMPT_HEADER] ?? 0);
    await this.prisma.$transaction((tx) => this.process(tx, event, failures), { timeout: 60000, maxWait: 10000 });
    d.ack();
  }

  private async process(tx: Prisma.TransactionClient, event: OrderCreatedEvent, failures: number): Promise<void> {
    const rows = await tx.$queryRaw<{ status: string }[]>`SELECT status FROM email_jobs WHERE id = ${event.jobId} FOR UPDATE`;
    if (!rows.length) { this.logger.warn(`email_job ${event.jobId} not found, dropping message`); return; }
    if (rows[0].status === 'SENT') return;

    let sendError: unknown;
    try {
      // مفتاح الأدمن (من الواجهة): يجعل كل المحاولات تفشل عمداً لعرض الـ Retry والـ DLQ
      if (await this.forceFailEnabled()) throw new Error('Simulated mail failure (admin switch)');
      await this.mail.send({ to: event.to, ...renderOrderCreatedEmail(event) });
    } catch (e) { sendError = e; }

    if (!sendError) {
      await tx.emailJob.update({ where: { id: event.jobId }, data: { status: 'SENT', attempts: failures + 1, sentAt: new Date(), lastError: null } });
      return;
    }

    const message = sendError instanceof Error ? sendError.message : String(sendError);
    const attempts = failures + 1;
    const decision = decideRetry(attempts, this.rabbit.retryDelays);
    if (decision.action === 'retry') {
      this.logger.warn(`Email for order #${event.orderNumber} failed (attempt ${attempts}); retry in ${decision.delayMs}ms: ${message}`);
      await this.rabbit.publish('', retryQueueName(decision.delayMs), event, { [ATTEMPT_HEADER]: attempts });
      await tx.emailJob.update({ where: { id: event.jobId }, data: { status: 'RETRYING', attempts, lastError: message } });
    } else {
      this.logger.error(`Email for order #${event.orderNumber} failed ${attempts} times; moving to DLQ: ${message}`);
      await this.rabbit.publish('', QUEUES.EMAIL_DLQ, event, { [ATTEMPT_HEADER]: attempts, 'x-last-error': message });
      await tx.emailJob.update({ where: { id: event.jobId }, data: { status: 'DEAD', attempts, lastError: message } });
    }
  }
}
