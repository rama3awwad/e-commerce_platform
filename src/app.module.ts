import 'dotenv/config';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { PrismaModule } from './prisma/prisma.module';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { HealthController } from './health.controller';
import { ProductsModule } from './products/products.module';
import { OrdersModule } from './orders/orders.module';
import { NotificationsModule } from './notifications/notifications.module';
import { InventoryModule } from './inventory/inventory.module';

@Module({
  imports: [
    // ===== Configuration =====
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env'],
      validate: (config) => {
        if (!config.DATABASE_URL) throw new Error('DATABASE_URL is required');
        if (!config.JWT_SECRET || config.JWT_SECRET.length < 32) throw new Error('JWT_SECRET is required and must be at least 32 characters');
        return config;
      },
    }),

    // ===== Rate Limiting =====
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        throttlers: [
          {
            ttl: Number(configService.get('THROTTLE_TTL', 60000)),
            limit: Number(configService.get('THROTTLE_LIMIT', 100)),
          },
        ],
      }),
    }),

    // ===== Database =====
    PrismaModule,

    // ===== Features =====
    UsersModule,
    AuthModule,
    InventoryModule,
    ProductsModule,
    NotificationsModule,
    OrdersModule,
  ],
  controllers: [HealthController],
  providers: [
    // Apply ThrottlerGuard globally
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
