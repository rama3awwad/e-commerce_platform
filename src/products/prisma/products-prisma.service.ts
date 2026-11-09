import { Injectable, OnModuleDestroy, OnModuleInit, Logger } from '@nestjs/common';
import { PrismaClient } from '.prisma/products-client';

@Injectable()
export class ProductsPrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ProductsPrismaService.name);
  async onModuleInit() { await this.$connect(); this.logger.log('Database connected successfully'); }
  async onModuleDestroy() { await this.$disconnect(); }
}

