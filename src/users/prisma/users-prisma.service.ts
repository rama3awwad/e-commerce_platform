import { Injectable, OnModuleDestroy, OnModuleInit, Logger } from '@nestjs/common';
import { PrismaClient } from '.prisma/users-client';

@Injectable()
export class UsersPrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(UsersPrismaService.name);
  async onModuleInit() { await this.$connect(); this.logger.log('Database connected successfully'); }
  async onModuleDestroy() { await this.$disconnect(); }
}

