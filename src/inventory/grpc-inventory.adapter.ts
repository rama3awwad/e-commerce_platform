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
    try {
      const res = await lastValueFrom(
        this.client.getStock({ productId: productId }).pipe(timeout(this.deadlineMs)),
      );
      return res.available ?? 0;
    } catch (err) {
      this.logger.error('getStock failed for ' + productId + ': ' + this.errMsg(err));
      throw err;
    }
  }

  // المتطلب الثالث — مشكلة N+1:
  //   قبل: نداء gRPC (واستعلام SQL في خدمة المخزون) لكل منتج في الصفحة → 20 منتج = 20 نداء.
  //   بعد: نداء GetStocks واحد واستعلام SQL واحد مهما كان عدد المنتجات.
  // INVENTORY_BATCH_STOCKS=false يعيد السلوك القديم فقط لقياس الفرق قبل/بعد.
  async getStocks(productIds: string[]): Promise<Record<string, number>> {
    if (!productIds.length) return {};
    try {
      if (process.env.INVENTORY_BATCH_STOCKS === 'false') {
        const results = await Promise.all(
          productIds.map(async (id) => [id, await this.getStock(id)] as const),
        );
        return Object.fromEntries(results);
      }
      const res = await lastValueFrom(
        this.client.getStocks({ productIds }).pipe(timeout(this.deadlineMs)),
      );
      const stocks: Record<string, number> = Object.fromEntries(productIds.map((id) => [id, 0]));
      for (const item of res.items ?? []) stocks[item.productId] = item.quantity ?? 0;
      return stocks;
    } catch (err) {
      this.logger.error('getStocks failed: ' + this.errMsg(err));
      throw err;
    }
  }

  async setStock(productId: string, quantity: number): Promise<void> {
    try {
      const res = await lastValueFrom(
        this.client
          .setStock({ productId: productId, quantity: quantity })
          .pipe(timeout(this.deadlineMs)),
      );
      if (!res.success) {
        throw new Error('SetStock returned success=false for product ' + productId);
      }
    } catch (err) {
      this.logger.error(
        'setStock failed for ' + productId + ' (qty=' + quantity + '): ' + this.errMsg(err),
      );
      throw err;
    }
  }

  async reserve(reference: string, items: ReservationItem[]): Promise<ReserveResult> {
    try {
      const res = await lastValueFrom(
        this.client
          .reserveStock({
            reservationId: reference,
            items: items.map((i) => ({ productId: i.productId, quantity: i.quantity })),
          })
          .pipe(timeout(this.deadlineMs)),
      );

      if (!res.success) {
        const insufficient = (res.shortages ?? []).map((s) => ({
          productId: s.productId,
          available: s.available,
          requested: s.requested,
        }));
        return { success: false, insufficient };
      }
      return { success: true };
    } catch (err) {
      this.logger.error('reserve failed (ref=' + reference + '): ' + this.errMsg(err));
      throw err;
    }
  }

  async release(reference: string, _items: ReservationItem[]): Promise<void> {
    try {
      await lastValueFrom(
        this.client.releaseStock({ reservationId: reference }).pipe(timeout(this.deadlineMs)),
      );
    } catch (err) {
      this.logger.error('release failed (ref=' + reference + '): ' + this.errMsg(err));
      throw err;
    }
  }

  private errMsg(err: unknown): string {
    if (err instanceof Error) return err.message;
    return String(err);
  }
}
