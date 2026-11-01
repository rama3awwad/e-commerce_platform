import { Module } from '@nestjs/common';
import { InMemoryInventoryAdapter } from './in-memory-inventory.adapter';
import { INVENTORY_PORT } from './inventory.port';

@Module({ providers: [InMemoryInventoryAdapter, { provide: INVENTORY_PORT, useExisting: InMemoryInventoryAdapter }], exports: [INVENTORY_PORT] })
// Requirement 2 can replace this provider with a gRPC-backed adapter without changing Products or Orders.
export class InventoryModule {}
