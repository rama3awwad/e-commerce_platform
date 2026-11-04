/*import { Module } from '@nestjs/common';
import { InMemoryInventoryAdapter } from './in-memory-inventory.adapter';
import { INVENTORY_PORT } from './inventory.port';

@Module({ providers: [InMemoryInventoryAdapter, { provide: INVENTORY_PORT, useExisting: InMemoryInventoryAdapter }], exports: [INVENTORY_PORT] })
// Requirement 2 can replace this provider with a gRPC-backed adapter without changing Products or Orders.
export class InventoryModule {}
*/
import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { join } from 'path';
import { GrpcInventoryAdapter } from './grpc-inventory.adapter';
import { INVENTORY_PORT } from './inventory.port';

/**
 * وحدة المخزون - تستخدم GrpcInventoryAdapter للحجز والإرجاع عبر gRPC.
 *
 * المتطلب الثاني: التواصل بين الخدمات.
 * تطبيق NestJS يتواصل مع خدمة Spring Boot عبر gRPC فقط، ولا يصل
 * مباشرة إلى قاعدة بيانات المخزون.
 *
 * العقد المشترك: proto/inventory.proto (موجود في جذر المستودع).
 *
 * ملاحظة: InMemoryInventoryAdapter ما زال موجوداً للرجوع إليه في الاختبارات،
 * لكنه لم يعد مستخدماً في الإنتاج.
 */
@Module({
  imports: [
    ClientsModule.registerAsync([
      {
        name: 'INVENTORY_PACKAGE',
        imports: [ConfigModule],
        inject: [ConfigService],
        useFactory: (config: ConfigService) => ({
          transport: Transport.GRPC,
          options: {
            // عنوان خدمة المخزون. محلياً: localhost:9090. في Docker: inventory-service:9090
            url: config.get<string>('INVENTORY_GRPC_URL', 'localhost:9090'),
            package: 'inventory.v1',
            protoPath: join(__dirname, 'proto/inventory.proto'),
            // فعّل هذا لرؤية رسائل gRPC في الـconsole (للتطوير)
            // keepalive: { keepaliveTimeoutMs: 3000 },
          },
        }),
      },
    ]),
  ],
  providers: [
    GrpcInventoryAdapter,
    { provide: INVENTORY_PORT, useExisting: GrpcInventoryAdapter },
  ],
  exports: [INVENTORY_PORT],
})
export class InventoryModule {}
