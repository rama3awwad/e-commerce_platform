import { InMemoryInventoryAdapter } from './in-memory-inventory.adapter';
import { ConfigService } from '@nestjs/config';

describe('InMemoryInventoryAdapter reservations', () => {
  it('makes reservation and release idempotent by reference', async () => {
    const adapter = new InMemoryInventoryAdapter({ get: () => 20 } as unknown as ConfigService);
    await adapter.setStock('p1', 10);
    const items = [{ productId: 'p1', quantity: 4 }];

    expect(await adapter.reserve('order-1', items)).toEqual({ success: true });
    expect(await adapter.reserve('order-1', items)).toEqual({ success: true });
    expect(await adapter.getStock('p1')).toBe(6);
    await adapter.release('order-1', items);
    await adapter.release('order-1', items);
    expect(await adapter.getStock('p1')).toBe(10);
  });
});
