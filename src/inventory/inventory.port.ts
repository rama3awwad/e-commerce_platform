export type ReservationItem = { productId: string; quantity: number };
export type ReserveResult = { success: true } | { success: false; insufficient: { productId: string; available: number; requested: number }[] };

export interface InventoryPort {
  getStock(productId: string): Promise<number>;
  getStocks(productIds: string[]): Promise<Record<string, number>>;
  setStock(productId: string, quantity: number): Promise<void>;
  reserve(reference: string, items: ReservationItem[]): Promise<ReserveResult>;
  release(reference: string, items: ReservationItem[]): Promise<void>;
}

export const INVENTORY_PORT = Symbol('INVENTORY_PORT');
