export type ReservationItem = { productId: string; quantity: number };
export type ReserveResult = { success: true } | { success: false; insufficient: { productId: string; available: number; requested: number }[] };

export interface InventoryPort {
  getStock(productId: string): Promise<number>;
  setStock(productId: string, quantity: number): Promise<void>;
  reserve(items: ReservationItem[]): Promise<ReserveResult>;
  release(items: ReservationItem[]): Promise<void>;
}

export const INVENTORY_PORT = Symbol('INVENTORY_PORT');
