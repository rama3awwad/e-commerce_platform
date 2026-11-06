/**
 * سكربت تهيئة المخزون لمنتجات الـSeed
 * 
 * التشغيل:
 *   ts-node scripts/init-inventory-stocks.ts
 * 
 * ماذا يفعل:
 *   1. يتصل بـecommerce_db ويجلب كل معرفات المنتجات
 *   2. يتصل بخدمة المخزون عبر gRPC ويعيّن كمية افتراضية لكل منتج
 * 
 * استخدم هذا السكربت بعد أول تشغيل لـseed، أو بعد استيراد بيانات تجريبية جديدة.
 */
import { PrismaClient } from '@prisma/client';
import * as path from 'path';
import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';

const PROTO_PATH = path.join(__dirname, '../proto/inventory.proto');
const INVENTORY_URL = process.env.INVENTORY_GRPC_URL || 'localhost:9090';
const DEFAULT_STOCK = Number(process.env.STUB_DEFAULT_STOCK || 50);

interface InventoryClient {
  setStock(
    req: { productId: string; quantity: number },
    cb: (err: grpc.ServiceError | null, res: { success: boolean; available: number }) => void,
  ): void;
}

async function main() {
  console.log('Connecting to inventory service at', INVENTORY_URL);
  
  const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
    keepCase: false,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true,
  });
  const proto = grpc.loadPackageDefinition(packageDefinition) as any;
  const client: InventoryClient = new proto.inventory.v1.InventoryService(
    INVENTORY_URL,
    grpc.credentials.createInsecure(),
  );

  const prisma = new PrismaClient();
  
  try {
    const products = await prisma.product.findMany({ select: { id: true, name: true } });
    console.log('Found', products.length, 'products in ecommerce_db');
    
    let success = 0;
    let failed = 0;
    
    for (const p of products) {
      await new Promise<void>((resolve) => {
        client.setStock({ productId: p.id, quantity: DEFAULT_STOCK }, (err, res) => {
          if (err || !res.success) {
            console.error('FAILED for', p.name, '→', err?.message || 'unknown');
            failed++;
          } else {
            console.log('OK   ', p.name, '→ stock =', res.available);
            success++;
          }
          resolve();
        });
      });
    }
    
    console.log('\n========================================');
    console.log('Result: ' + success + ' succeeded, ' + failed + ' failed');
    console.log('========================================');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});