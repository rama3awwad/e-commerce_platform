import { Injectable, OnModuleDestroy, OnModuleInit, Logger } from '@nestjs/common';
import { PrismaClient } from '.prisma/orders-client';

@Injectable()
export class OrdersPrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OrdersPrismaService.name);
  async onModuleInit() { await this.$connect(); this.logger.log('Database connected successfully'); }
  async onModuleDestroy() { await this.$disconnect(); }
}

