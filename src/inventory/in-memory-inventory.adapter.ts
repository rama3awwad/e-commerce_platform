import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InventoryPort, ReservationItem, ReserveResult } from './inventory.port';

@Injectable()
export class InMemoryInventoryAdapter implements InventoryPort {
  private readonly quantities = new Map<string, number>();
  private readonly reservations = new Map<string, ReservationItem[]>();
  constructor(private readonly config: ConfigService) {}
  private stock(productId: string) { return this.quantities.get(productId) ?? Number(this.config.get('STUB_DEFAULT_STOCK', 50)); }
  async getStock(productId: string) { return this.stock(productId); }
  async getStocks(productIds: string[]) { return Object.fromEntries(productIds.map((productId) => [productId, this.stock(productId)])); }
  async setStock(productId: string, quantity: number) { this.quantities.set(productId, quantity); }
  async reserve(reference: string, items: ReservationItem[]): Promise<ReserveResult> {
    if (this.reservations.has(reference)) return { success: true };
    const insufficient: { productId: string; available: number; requested: number }[] = [];
    for (const item of items) { const available = this.stock(item.productId); if (available < item.quantity) insufficient.push({ productId: item.productId, available, requested: item.quantity }); }
    if (insufficient.length) return { success: false, insufficient };
    for (const item of items) this.quantities.set(item.productId, this.stock(item.productId) - item.quantity);
    this.reservations.set(reference, items.map((item) => ({ ...item })));
    return { success: true };
  }
  async release(reference: string, _items: ReservationItem[]) {
    const reservedItems = this.reservations.get(reference);
    if (!reservedItems) return;
    this.reservations.delete(reference);
    for (const item of reservedItems) this.quantities.set(item.productId, this.stock(item.productId) + item.quantity);
  }
}
