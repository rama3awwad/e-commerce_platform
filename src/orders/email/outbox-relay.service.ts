import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { OrdersPrismaService } from '../prisma/orders-prisma.service';
import { OrderEventsPublisher } from '../events/order-events.publisher';
import { OrderCreatedEvent } from '../events/order-created.event';

/**
 * شبكة أمان (Outbox): لو نجح حفظ الطلب وفشل النشر (RabbitMQ كان واقعاً)
 * يبقى الـ job بحالة QUEUED وpublishedAt فارغ، فنعيد نشره هنا.
 */
@Injectable()
export class OutboxRelayService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(OutboxRelayService.name);
  private timer?: NodeJS.Timeout;
  private running = false;
  constructor(private readonly prisma: OrdersPrismaService, private readonly publisher: OrderEventsPublisher) {}

  onApplicationBootstrap() { this.timer = setInterval(() => void this.tick(), 15000); }
  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }

  async tick(): Promise<number> {
    if (this.running) return 0;
    this.running = true;
    let sent = 0;
    try {
      const stale = await this.prisma.emailJob.findMany({
        where: { status: 'QUEUED', publishedAt: null, createdAt: { lt: new Date(Date.now() - 30000) } },
        orderBy: { createdAt: 'asc' }, take: 50,
      });
      for (const job of stale) {
        try { await this.publisher.publishOrderCreated(job.payload as unknown as OrderCreatedEvent); sent++; }
        catch (e) { this.logger.warn(`Relay publish failed for job ${job.id}: ${(e as Error).message}`); break; }
      }
      if (sent) this.logger.log(`Relayed ${sent} unpublished email job(s)`);
    } catch (e) { this.logger.error(`Outbox relay tick failed: ${(e as Error).message}`); }
    finally { this.running = false; }
    return sent;
  }
}