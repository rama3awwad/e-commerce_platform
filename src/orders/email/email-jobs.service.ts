import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EmailJobStatus } from '.prisma/orders-client';
import { CodedException } from '../../common/exceptions/coded.exception';
import { parseRetryDelays, QUEUES } from '../../common/messaging/messaging.constants';
import { OrdersPrismaService } from '../prisma/orders-prisma.service';
import { OrderEventsPublisher } from '../events/order-events.publisher';
import { OrderCreatedEvent } from '../events/order-created.event';

export const FORCE_FAIL_FLAG = 'mail.forceFail';
const fetchFn = globalThis.fetch;

/** شاشة مراقبة الإيميلات للأدمن (المتطلب الرابع): الحالات، المحاولات، الـ DLQ، وإعادة المعالجة. */
@Injectable()
export class EmailJobsService {
  private readonly maxAttempts: number;
  constructor(private readonly prisma: OrdersPrismaService, private readonly publisher: OrderEventsPublisher, private readonly config: ConfigService) {
    this.maxAttempts = parseRetryDelays(config.get<string>('RETRY_DELAYS_MS')).length + 1;
  }

  async list(query: { status?: EmailJobStatus; page?: number; limit?: number }) {
    const { page = 1, limit = 20, status } = query;
    const where = status ? { status } : {};
    const [rows, total, grouped] = await Promise.all([
      this.prisma.emailJob.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * limit, take: limit }),
      this.prisma.emailJob.count({ where }),
      this.prisma.emailJob.groupBy({ by: ['status'], _count: { _all: true } }),
    ]);
    const counts: Record<EmailJobStatus, number> = { QUEUED: 0, RETRYING: 0, SENT: 0, DEAD: 0 };
    for (const g of grouped) counts[g.status] = g._count._all;
    const items = rows.map((j) => ({
      id: j.id, orderId: j.orderId, orderNumber: (j.payload as unknown as OrderCreatedEvent).orderNumber, recipient: j.recipient,
      status: j.status, attempts: j.attempts, maxAttempts: this.maxAttempts, lastError: j.lastError, processedBy: j.processedBy, publishedAt: j.publishedAt, sentAt: j.sentAt, createdAt: j.createdAt,
    }));
    const totalPages = Math.ceil(total / limit);
    return { items, counts, meta: { total, page, limit, totalPages, hasNext: page < totalPages, hasPrev: page > 1 } };
  }

  async workersOverview() {
    const [grouped, queue] = await Promise.all([
      this.prisma.emailJob.groupBy({ by: ['processedBy'], where: { processedBy: { not: null } }, _count: { _all: true }, _max: { updatedAt: true } }),
      this.fetchQueueStats(),
    ]);
    const byWorker = grouped.map((g) => ({ worker: g.processedBy as string, processed: g._count._all, lastActivityAt: g._max.updatedAt })).sort((a, b) => a.worker.localeCompare(b.worker));
    return { queue, byWorker };
  }

  private async fetchQueueStats() {
    const base = this.config.get<string>('RABBITMQ_MANAGEMENT_URL', 'http://rabbitmq:15672');
    const user = this.config.get<string>('RABBITMQ_USER', 'guest');
    const pass = this.config.get<string>('RABBITMQ_PASSWORD', 'guest');
    try {
      const res = await fetchFn(`${base}/api/queues/%2F/${encodeURIComponent(QUEUES.EMAIL)}`, {
        headers: { Authorization: `Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}` },
        signal: AbortSignal.timeout(2000),
      });
      if (!res.ok) return { available: false as const, reason: `RabbitMQ management returned HTTP ${res.status}` };
      const q = await res.json() as { consumers?: number; messages_ready?: number; messages_unacknowledged?: number };
      return { available: true as const, consumers: q.consumers ?? 0, messagesReady: q.messages_ready ?? 0, messagesUnacknowledged: q.messages_unacknowledged ?? 0 };
    } catch (e) {
      return { available: false as const, reason: (e as Error).message };
    }
  }

  /** إعادة معالجة رسالة من الـ DLQ: نصفّر الـ job وننشره من جديد (لو فشل النشر يعيده الـ relay). */
  async requeue(id: string) {
    const job = await this.prisma.emailJob.findUnique({ where: { id } });
    if (!job) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Email job not found' });
    if (job.status !== 'DEAD') throw new CodedException(409, 'INVALID_STATE', 'Only dead-lettered jobs can be requeued', { status: job.status });
    await this.prisma.emailJob.update({ where: { id }, data: { status: 'QUEUED', attempts: 0, lastError: null, publishedAt: null } });
    let published = true;
    try { await this.publisher.publishOrderCreated(job.payload as unknown as OrderCreatedEvent); } catch { published = false; }
    return { id, requeued: true, published };
  }

  async getSettings() {
    const flag = await this.prisma.appFlag.findUnique({ where: { key: FORCE_FAIL_FLAG } });
    return { forceFail: flag?.value === 'true' };
  }

  async setForceFail(forceFail: boolean) {
    await this.prisma.appFlag.upsert({ where: { key: FORCE_FAIL_FLAG }, create: { key: FORCE_FAIL_FLAG, value: String(forceFail) }, update: { value: String(forceFail) } });
    return { forceFail };
  }
}
