import { Injectable, OnModuleDestroy, OnModuleInit, Logger } from '@nestjs/common';
import { PrismaClient } from '.prisma/notifications-client';
import { proxyPrismaDelegates, requestQueryCounter } from '../../common/perf/request-query-counter';

@Injectable()
export class NotificationsPrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NotificationsPrismaService.name);
  constructor() {
    super();
    if (process.env.PRISMA_QUERY_COUNT_ENABLED === 'true') {
      const extended = this.$extends({
        query: {
          $allModels: {
            async $allOperations({ args, query }) {
              requestQueryCounter.increment();
              return query(args);
            },
          },
        },
      });
      return proxyPrismaDelegates(this, extended, ['notification']);
    }
  }

  async onModuleInit() {
    await this.$connect();
    this.logger.log('Database connected successfully');
  }
  async onModuleDestroy() { await this.$disconnect(); }
}
