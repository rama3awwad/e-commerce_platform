import { Injectable, OnModuleDestroy, OnModuleInit, Logger } from '@nestjs/common';
import { PrismaClient } from '.prisma/orders-client';

/**
 * هذا الكلاس نفسه هو الاتصال بالقاعدة الأساسية (primary) — كل الكتابات تمر منه.
 * المتطلب الثالث: إذا READ_REPLICA_ENABLED=true نفتح اتصالاً ثانياً بنسخة القراءة،
 * والخدمات تستخدم readClient للقراءات العادية.
 */
@Injectable()
export class OrdersPrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OrdersPrismaService.name);
  private readonly replica?: PrismaClient;

  constructor() {
    super();
    if (process.env.READ_REPLICA_ENABLED === 'true') {
      const url = process.env.ORDERS_READ_DATABASE_URL;
      if (!url) throw new Error('ORDERS_READ_DATABASE_URL is required when READ_REPLICA_ENABLED=true');
      this.replica = new PrismaClient({ datasources: { db: { url } } });
    }
  }

  /** نسخة القراءة إن كانت مفعلة، وإلا القاعدة الأساسية. */
  get readClient(): PrismaClient { return this.replica ?? this; }
  get hasReplica(): boolean { return this.replica !== undefined; }

  async onModuleInit() {
    await this.$connect();
    this.logger.log('Database connected successfully');
    if (this.replica) {
      await this.replica.$connect();
      this.logger.log('Read replica connected (order reads go to the replica)');
    }
  }

  async onModuleDestroy() { await Promise.all([this.$disconnect(), this.replica?.$disconnect()]); }
}
