import { Injectable, OnModuleDestroy, OnModuleInit, Logger } from '@nestjs/common';
import { PrismaClient } from '.prisma/notifications-client';

@Injectable()
export class NotificationsPrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NotificationsPrismaService.name);
  async onModuleInit() { await this.$connect(); this.logger.log('Database connected successfully'); }
  async onModuleDestroy() { await this.$disconnect(); }
}

