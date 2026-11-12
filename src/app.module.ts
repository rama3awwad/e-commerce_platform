import 'dotenv/config';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { HealthController } from './health.controller';
import { ProductsModule } from './products/products.module';
import { OrdersModule } from './orders/orders.module';
import { NotificationsModule } from './notifications/notifications.module';
import { InventoryModule } from './inventory/inventory.module';
import { CacheModule } from './common/cache/cache.module';

@Module({
  imports: [
    // ===== Configuration =====
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env'],
      validate: (config) => {
        if (!config.INTERNAL_API_TOKEN || config.INTERNAL_API_TOKEN.length < 16) throw new Error('INTERNAL_API_TOKEN must be at least 16 characters');
        for (const key of ['USERS_DATABASE_URL','PRODUCTS_DATABASE_URL','ORDERS_DATABASE_URL','NOTIFICATIONS_DATABASE_URL']) if (!config[key]) throw new Error(`${key} is required`);
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

    // ===== Requirement 3: Redis cache + read-your-writes markers =====
    CacheModule,

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
