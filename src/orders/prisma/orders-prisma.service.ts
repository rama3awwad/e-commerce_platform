import { Injectable, OnModuleDestroy, OnModuleInit, Logger } from '@nestjs/common';
import { Prisma, PrismaClient } from '.prisma/orders-client';
import { proxyPrismaDelegates, requestQueryCounter } from '../../common/perf/request-query-counter';

@Injectable()
export class OrdersPrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OrdersPrismaService.name);
  private readonly replicaClient: PrismaClient | undefined;
  private readonly primaryClient: PrismaClient;

  constructor() {
    super();
    if (process.env.READ_REPLICA_ENABLED === 'true') {
      const replicaUrl = process.env.ORDERS_READ_DATABASE_URL;
      if (!replicaUrl) throw new Error('ORDERS_READ_DATABASE_URL is required when READ_REPLICA_ENABLED=true');

      const replica = new PrismaClient({ datasources: { db: { url: replicaUrl } } });
      this.replicaClient = process.env.PRISMA_QUERY_COUNT_ENABLED === 'true'
        ? proxyPrismaDelegates(replica, replica.$extends({
          query: {
            $allModels: {
              async $allOperations({ args, query }) {
                requestQueryCounter.increment();
                return query(args);
              },
            },
          },
        }), ['order', 'orderItem'])
        : replica;
    } else {
      this.replicaClient = undefined;
    }

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
      this.primaryClient = proxyPrismaDelegates(this, extended, ['order', 'orderItem']);
      return this.primaryClient;
    }

    this.primaryClient = this;
  }

  get readClient(): PrismaClient {
    return this.replicaClient ?? this.primaryClient;
  }

  async onModuleInit() {
    await this.$connect();
    this.logger.log('Database connected successfully');
    if (this.replicaClient) {
      await this.replicaClient.$connect();
      const [replicaState] = await this.replicaClient.$queryRaw<Array<{ inRecovery: boolean }>>(
        Prisma.sql`SELECT pg_is_in_recovery() AS "inRecovery"`,
      );
      if (!replicaState?.inRecovery) {
        throw new Error('Orders read database is not a PostgreSQL standby');
      }
      this.logger.log('Orders read replica connected and in recovery');
    }
  }

  async onModuleDestroy() {
    await Promise.all([
      this.$disconnect(),
      this.replicaClient?.$disconnect() ?? Promise.resolve(),
    ]);
  }
}
