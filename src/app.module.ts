import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { PrismaModule } from './prisma/prisma.module';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { HealthController } from './health.controller';

@Module({
  imports: [
    // ===== Configuration =====
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env'],
    }),

    // ===== Rate Limiting =====
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        throttlers: [
          {
            ttl: configService.get('THROTTLE_TTL', 60000),
            limit: configService.get('THROTTLE_LIMIT', 10),
          },
        ],
      }),
    }),

    // ===== Database =====
    PrismaModule,

    // ===== Features =====
    UsersModule,
    AuthModule,
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
