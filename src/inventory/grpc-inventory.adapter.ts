import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClientGrpc } from '@nestjs/microservices';
import { lastValueFrom, Observable, timeout } from 'rxjs';
import { InventoryPort, ReservationItem, ReserveResult } from './api/inventory.port';

// gRPC client interface
// تطابق service InventoryService المعرفة في proto/inventory.proto
// ملاحظة: NestJS gRPC client تُرجِع Observable<T> وليس Promise<T>

interface InventoryGrpcClient {
  getStock(request: { productId: string }): Observable<GetStockGrpcResponse>;
  getStocks(request: { productIds: string[] }): Observable<GetStocksGrpcResponse>;
  setStock(request: { productId: string; quantity: number }): Observable<SetStockGrpcResponse>;
  reserveStock(request: {
    reservationId: string;
    items: Array<{ productId: string; quantity: number }>;
  }): Observable<ReserveStockGrpcResponse>;
  releaseStock(request: { reservationId: string }): Observable<ReleaseStockGrpcResponse>;
}

interface GetStockGrpcResponse {
  productId: string;
  available: number;
}

interface GetStocksGrpcResponse {
  items?: Array<{ productId: string; quantity: number }>;
}

interface SetStockGrpcResponse {
  success: boolean;
  available: number;
}

interface ReserveStockGrpcResponse {
  success: boolean;
  shortages?: Array<{
    productId: string;
    requested: number;
    available: number;
  }>;
}

interface ReleaseStockGrpcResponse {
  released: boolean;
}

// ============================================================
//  الـAdapter - يُنفّذ InventoryPort ويُحوّل الاستدعاءات إلى gRPC
// ============================================================

@Injectable()
export class GrpcInventoryAdapter implements InventoryPort, OnModuleInit {
  private readonly logger = new Logger(GrpcInventoryAdapter.name);
  private client!: InventoryGrpcClient;
  private readonly deadlineMs: number;

  constructor(
    @Inject('INVENTORY_PACKAGE') private readonly grpcClient: ClientGrpc,
    private readonly config: ConfigService,
  ) {
    this.deadlineMs = Number(this.config.get<string>('INVENTORY_GRPC_DEADLINE_MS', '3000'));
  }

  onModuleInit(): void {
    this.client = this.grpcClient.getService<InventoryGrpcClient>('InventoryService');
    this.logger.log('gRPC Inventory client ready (deadline=' + this.deadlineMs + 'ms)');
  }

  async getStock(productId: string): Promise<number> {
    const res = await this.call('getStock', () => lastValueFrom(
      this.client.getStock({ productId }).pipe(timeout(this.deadlineMs)),
    ));
      return res.available ?? 0;
  }

  // المتطلب الثالث — مشكلة N+1:
  //   قبل: نداء gRPC (واستعلام SQL في خدمة المخزون) لكل منتج في الصفحة → 20 منتج = 20 نداء.
  //   بعد: نداء GetStocks واحد واستعلام SQL واحد مهما كان عدد المنتجات.
  // INVENTORY_BATCH_STOCKS=false يعيد السلوك القديم فقط لقياس الفرق قبل/بعد.
  async getStocks(productIds: string[]): Promise<Record<string, number>> {
    if (!productIds.length) return {};
    const res = await this.call('getStocks', () => lastValueFrom(
        this.client.getStocks({ productIds }).pipe(timeout(this.deadlineMs)),
      ));
      const stocks: Record<string, number> = Object.fromEntries(productIds.map((id) => [id, 0]));
      for (const item of res.items ?? []) stocks[item.productId] = item.quantity ?? 0;
      return stocks;
  }

  async setStock(productId: string, quantity: number): Promise<void> {
    const res = await this.call('setStock', () => lastValueFrom(
        this.client
          .setStock({ productId, quantity })
          .pipe(timeout(this.deadlineMs)),
      ));
      if (!res.success) {
        throw new Error('SetStock returned success=false');
      }
  }

  async reserve(reference: string, items: ReservationItem[]): Promise<ReserveResult> {
    const res = await this.call('reserve', () => lastValueFrom(
        this.client
          .reserveStock({
            reservationId: reference,
            items: items.map((i) => ({ productId: i.productId, quantity: i.quantity })),
          })
          .pipe(timeout(this.deadlineMs)),
      ));

      if (!res.success) {
        const insufficient = (res.shortages ?? []).map((s) => ({
          productId: s.productId,
          available: s.available,
          requested: s.requested,
        }));
        return { success: false, insufficient };
      }
      return { success: true };
  }

  async release(reference: string, _items: ReservationItem[]): Promise<void> {
    await this.call('release', () => lastValueFrom(
        this.client.releaseStock({ reservationId: reference }).pipe(timeout(this.deadlineMs)),
      ));
  }

  private async call<T>(operation: string, request: () => Promise<T>): Promise<T> {
    const startedAt = Date.now();
    try {
      const result = await request();
      this.logger.log(`Inventory RPC ${operation} completed in ${Date.now() - startedAt}ms`);
      return result;
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      this.logger.error(`Inventory RPC ${operation} failed after ${Date.now() - startedAt}ms: ${reason}`);
      throw err;
    }
  }
}
