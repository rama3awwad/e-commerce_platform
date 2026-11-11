import 'dotenv/config';
import { createHash } from 'crypto';
import { mkdir, readFile, writeFile } from 'fs/promises';
import { createInterface } from 'readline';
import { PrismaClient as UsersPrismaClient, Role } from '../node_modules/.prisma/users-client';
import { PrismaClient as ProductsPrismaClient } from '../node_modules/.prisma/products-client';
import { PrismaClient as OrdersPrismaClient, OrderStatus, Prisma as OrdersPrisma } from '../node_modules/.prisma/orders-client';
import * as bcrypt from 'bcryptjs';
import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import * as path from 'path';

const PERF_EMAIL_DOMAIN = '@perf.local';
const PERF_PASSWORD = process.env.PERF_USER_PASSWORD || 'Perf@12345';
const STOCK_QUANTITY = 1_000_000;
const BATCH_SIZE = 1000;

const userCount = readCount('PERF_USERS', 5000);
const productCount = readCount('PERF_PRODUCTS', 20000);
const orderCount = readCount('PERF_ORDERS', 300000);
if (userCount < 2) throw new Error('PERF_USERS must be at least 2');
const heavyUserCount = Math.min(readCount('PERF_HEAVY_USERS', 20), userCount - 1);
const outputPath = path.join(process.cwd(), 'results', 'perf-seed.json');

interface InventoryClient {
  close(): void;
  setStocks(
    request: { productIds: string[]; quantity: number },
    callback: (error: grpc.ServiceError | null, response: { updatedCount: number }) => void,
  ): void;
}

interface SizeRow {
  schemaname: string;
  relname: string;
  total_bytes: string;
  index_bytes: string;
  total_size: string;
  index_size: string;
}

function readCount(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${name} must be a positive safe integer`);
  }
  return value;
}

function stableId(namespace: string, index: number): string {
  const bytes = createHash('sha256').update(`${namespace}:${index}`).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function perfUser(index: number) {
  const suffix = String(index + 1).padStart(5, '0');
  return {
    id: stableId('perf-user', index),
    email: `perf-user-${suffix}${PERF_EMAIL_DOMAIN}`,
    username: `perf-user-${suffix}`,
  };
}

function getInventoryClient(): InventoryClient {
  const protoPath = path.join(__dirname, '../proto/inventory.proto');
  const packageDefinition = protoLoader.loadSync(protoPath, {
    keepCase: false,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true,
  });
  const proto = grpc.loadPackageDefinition(packageDefinition) as any;
  const url = process.env.INVENTORY_GRPC_URL || 'localhost:9090';
  return new proto.inventory.v1.InventoryService(url, grpc.credentials.createInsecure());
}

function setStocks(client: InventoryClient, productIds: string[], quantity: number): Promise<number> {
  return new Promise((resolve, reject) => {
    client.setStocks({ productIds, quantity }, (error, response) => {
      if (error) reject(error);
      else resolve(response.updatedCount);
    });
  });
}

async function confirmReset(): Promise<boolean> {
  const readline = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await new Promise<string>((resolve) => {
      readline.question('This deletes only performance users, their orders/items, and [PERF] products. Type RESET PERF DATA to continue: ', resolve);
    });
    return answer === 'RESET PERF DATA';
  } finally {
    readline.close();
  }
}

async function resetPerfData(
  users: UsersPrismaClient,
  products: ProductsPrismaClient,
  orders: OrdersPrismaClient,
  inventory: InventoryClient,
) {
  const perfUsers = await users.user.findMany({
    where: { email: { startsWith: 'perf-user-', endsWith: PERF_EMAIL_DOMAIN } },
    select: { id: true },
  });
  const perfProducts = await products.product.findMany({
    where: { name: { startsWith: '[PERF] Product ' } },
    select: { id: true },
  });

  for (let offset = 0; offset < perfProducts.length; offset += 1000) {
    const ids = perfProducts.slice(offset, offset + 1000).map((product) => product.id);
    const updated = await setStocks(inventory, ids, 0);
    if (updated !== ids.length) {
      throw new Error(`Inventory reset updated ${updated} of ${ids.length} product stocks`);
    }
  }
  if (perfUsers.length) {
    await orders.order.deleteMany({ where: { userId: { in: perfUsers.map((user) => user.id) } } });
    await users.user.deleteMany({ where: { id: { in: perfUsers.map((user) => user.id) } } });
  }
  await products.product.deleteMany({ where: { name: { startsWith: '[PERF] Product ' } } });
  console.log(`Reset performance data: ${perfUsers.length} users, ${perfProducts.length} products.`);
}

async function createUsers(users: UsersPrismaClient, password: string) {
  for (let offset = 0; offset < userCount; offset += BATCH_SIZE) {
    const data = Array.from({ length: Math.min(BATCH_SIZE, userCount - offset) }, (_, batchIndex) => {
      const index = offset + batchIndex;
      const user = perfUser(index);
      return {
        ...user,
        password,
        firstName: 'Performance',
        lastName: `User ${index + 1}`,
        role: Role.CUSTOMER,
      };
    });
    await users.user.createMany({ data, skipDuplicates: true });
  }
}

async function createProducts(products: ProductsPrismaClient, categoryIds: string[]) {
  const now = new Date();
  for (let offset = 0; offset < productCount; offset += BATCH_SIZE) {
    const data = Array.from({ length: Math.min(BATCH_SIZE, productCount - offset) }, (_, batchIndex) => {
      const index = offset + batchIndex;
      return {
        id: stableId('perf-product', index),
        name: `[PERF] Product ${String(index + 1).padStart(5, '0')} searchterm${index % 100}`,
        description: 'Generated product for performance testing.',
        price: Number((5 + (index % 50000) / 100).toFixed(2)),
        categoryId: categoryIds[index % categoryIds.length],
        isActive: index % 20 !== 19,
        createdAt: new Date(now.getTime() - (productCount - index) * 1000),
        updatedAt: now,
      };
    });
    await products.product.createMany({ data, skipDuplicates: true });
  }
}

async function initializeInventory(inventory: InventoryClient) {
  let updated = 0;
  for (let offset = 0; offset < productCount; offset += 500) {
    const ids = Array.from(
      { length: Math.min(500, productCount - offset) },
      (_, batchIndex) => stableId('perf-product', offset + batchIndex),
    );
    const batchUpdated = await setStocks(inventory, ids, STOCK_QUANTITY);
    if (batchUpdated !== ids.length) {
      throw new Error(`Inventory initialization updated ${batchUpdated} of ${ids.length} product stocks`);
    }
    updated += batchUpdated;
  }
  return updated;
}

async function createOrders(
  orders: OrdersPrismaClient,
  productPrices: number[],
  userIds: string[],
) {
  const statuses = [OrderStatus.PENDING, OrderStatus.CONFIRMED, OrderStatus.CANCELLED];
  const now = Date.now();
  const yearAgo = now - 365 * 24 * 60 * 60 * 1000;
  const itemCountTotal = { value: 0 };

  for (let offset = 0; offset < orderCount; offset += 1000) {
    const batchLength = Math.min(1000, orderCount - offset);
    const batchOrders: OrdersPrisma.OrderCreateManyInput[] = [];
    const batchItems: OrdersPrisma.OrderItemCreateManyInput[] = [];

    for (let batchIndex = 0; batchIndex < batchLength; batchIndex++) {
      const index = offset + batchIndex;
      const userIndex = index % 5 === 0
        ? heavyUserCount + (Math.floor(index / 5) % (userCount - heavyUserCount))
        : Math.floor(index / 5) % heavyUserCount;
      const createdAt = new Date(yearAgo + Math.floor((index / Math.max(1, orderCount - 1)) * (now - yearAgo)));
      const itemsInOrder = 1 + (index % 5);
      let total = 0;

      batchOrders.push({
        id: stableId('perf-order', index),
        userId: userIds[userIndex],
        status: statuses[index % statuses.length],
        totalAmount: 0,
        createdAt,
        updatedAt: createdAt,
      });

      for (let itemIndex = 0; itemIndex < itemsInOrder; itemIndex++) {
        const productIndex = (index * 17 + itemIndex * 997) % productPrices.length;
        const quantity = 1 + ((index + itemIndex) % 4);
        const unitPrice = productPrices[productIndex];
        total += unitPrice * quantity;
        batchItems.push({
          id: stableId(`perf-order-item-${itemIndex}`, index),
          orderId: stableId('perf-order', index),
          productId: stableId('perf-product', productIndex),
          quantity,
          unitPrice,
        });
      }

      batchOrders[batchOrders.length - 1].totalAmount = Number(total.toFixed(2));
      itemCountTotal.value += itemsInOrder;
    }

    await orders.order.createMany({ data: batchOrders, skipDuplicates: true });
    await orders.orderItem.createMany({ data: batchItems, skipDuplicates: true });
  }
  return itemCountTotal.value;
}

async function assignHeavyOrders(orders: OrdersPrismaClient, userIds: string[]) {
  let updated = 0;
  for (let offset = 0; offset < orderCount; offset += 5 * BATCH_SIZE) {
    const batchLength = Math.min(5 * BATCH_SIZE, orderCount - offset);
    const assignments = [];
    for (let batchIndex = 0; batchIndex < batchLength; batchIndex++) {
      const index = offset + batchIndex;
      if (index % 5 === 0) {
        const heavyUserIndex = Math.floor(index / 5) % heavyUserCount;
        assignments.push(OrdersPrisma.sql`(${stableId('perf-order', index)}, ${userIds[heavyUserIndex]})`);
      }
    }
    if (!assignments.length) continue;

    updated += await orders.$executeRaw(OrdersPrisma.sql`
      UPDATE "orders"."orders" AS target
      SET "userId" = assignments.user_id
      FROM (VALUES ${OrdersPrisma.join(assignments)}) AS assignments(order_id, user_id)
      WHERE target.id = assignments.order_id
        AND target."userId" <> assignments.user_id
    `);
  }
  return updated;
}

async function getSizes(client: ProductsPrismaClient): Promise<SizeRow[]> {
  return client.$queryRawUnsafe<SizeRow[]>(`
    SELECT schemaname, relname,
           pg_total_relation_size(format('%I.%I', schemaname, relname)::regclass)::text AS total_bytes,
           pg_indexes_size(format('%I.%I', schemaname, relname)::regclass)::text AS index_bytes,
           pg_size_pretty(pg_total_relation_size(format('%I.%I', schemaname, relname)::regclass)) AS total_size,
           pg_size_pretty(pg_indexes_size(format('%I.%I', schemaname, relname)::regclass)) AS index_size
    FROM pg_stat_user_tables
    WHERE schemaname IN ('users', 'products', 'orders')
    ORDER BY pg_total_relation_size(format('%I.%I', schemaname, relname)::regclass) DESC
  `);
}

function formatSizes(rows: SizeRow[]) {
  return rows.map((row) => ({
    schema: row.schemaname,
    table: row.relname,
    totalBytes: Number(row.total_bytes),
    indexBytes: Number(row.index_bytes),
    totalSize: row.total_size,
    indexSize: row.index_size,
  }));
}

async function main() {
  if (process.argv.includes('--repair-heavy-users') && process.argv.includes('--reset')) {
    throw new Error('--repair-heavy-users cannot be combined with --reset');
  }
  if (process.argv.includes('--repair-heavy-users')) {
    const users = new UsersPrismaClient();
    const products = new ProductsPrismaClient();
    const orders = new OrdersPrismaClient();
    try {
      const generatedUsers = await users.user.count({
        where: { email: { startsWith: 'perf-user-', endsWith: PERF_EMAIL_DOMAIN } },
      });
      if (generatedUsers < userCount) {
        throw new Error(`Expected ${userCount} performance users, found ${generatedUsers}`);
      }

      const userIds = Array.from({ length: userCount }, (_, index) => perfUser(index).id);
      const reassignedOrders = await assignHeavyOrders(orders, userIds);
      await products.$executeRawUnsafe('ANALYZE "products"."products"');
      await orders.$executeRawUnsafe('ANALYZE "orders"."orders"');
      await orders.$executeRawUnsafe('ANALYZE "orders"."order_items"');

      const existing = JSON.parse(await readFile(outputPath, 'utf8'));
      existing.performanceRows.ordersAssignedToHeavyUsers =
        (existing.performanceRows.ordersAssignedToHeavyUsers || 0) + reassignedOrders;
      existing.tableSizes = formatSizes(await getSizes(products));
      await writeFile(outputPath, `${JSON.stringify(existing, null, 2)}\n`, 'utf8');
      console.log(JSON.stringify({
        ordersAssignedToHeavyUsers: reassignedOrders,
        summaryPath: path.relative(process.cwd(), outputPath),
      }, null, 2));
    } finally {
      await Promise.all([users.$disconnect(), products.$disconnect(), orders.$disconnect()]);
    }
    return;
  }

  if (process.argv.includes('--reset') && !(await confirmReset())) {
    console.log('Reset cancelled; no data was changed.');
    return;
  }

  const users = new UsersPrismaClient();
  const products = new ProductsPrismaClient();
  const orders = new OrdersPrismaClient();
  const inventory = getInventoryClient();
  const startedAt = new Date();
  const started = Date.now();

  try {
    if (process.argv.includes('--reset')) {
      await resetPerfData(users, products, orders, inventory);
    }

    const categories = await products.category.findMany({ select: { id: true } });
    if (!categories.length) {
      throw new Error('No categories found. Start the application once with its regular seed before running seed:perf.');
    }

    const password = await bcrypt.hash(PERF_PASSWORD, 10);
    await createUsers(users, password);
    await createProducts(products, categories.map((category) => category.id));
    const initializedStocks = await initializeInventory(inventory);
    const productPrices = Array.from(
      { length: productCount },
      (_, index) => Number((5 + (index % 50000) / 100).toFixed(2)),
    );
    const userIds = Array.from({ length: userCount }, (_, index) => perfUser(index).id);
    const expectedItems = await createOrders(orders, productPrices, userIds);
    const reassignedOrders = await assignHeavyOrders(orders, userIds);

    const [usersCount, productsCount, ordersCount, orderItemsCount, sizes] = await Promise.all([
      users.user.count({ where: { email: { startsWith: 'perf-user-', endsWith: PERF_EMAIL_DOMAIN } } }),
      products.product.count({ where: { name: { startsWith: '[PERF] Product ' } } }),
      orders.order.count({ where: { userId: { in: userIds } } }),
      orders.orderItem.count({ where: { order: { userId: { in: userIds } } } }),
      getSizes(products),
    ]);

    const summary = {
      startedAt: startedAt.toISOString(),
      durationSeconds: Number(((Date.now() - started) / 1000).toFixed(2)),
      configuration: { users: userCount, products: productCount, orders: orderCount, heavyUsers: heavyUserCount },
      performanceRows: {
        users: usersCount,
        products: productsCount,
        orders: ordersCount,
        orderItems: orderItemsCount,
        orderItemsGenerated: expectedItems,
        inventoryStocksInitialized: initializedStocks,
        ordersAssignedToHeavyUsers: reassignedOrders,
      },
      k6LoginEmails: Array.from({ length: Math.min(50, userCount) }, (_, index) => perfUser(index).email),
      tableSizes: formatSizes(sizes),
    };

    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
    console.log(JSON.stringify(summary, null, 2));
    console.log(`Seed summary written to ${path.relative(process.cwd(), outputPath)}`);
  } finally {
    inventory.close();
    await Promise.all([users.$disconnect(), products.$disconnect(), orders.$disconnect()]);
  }
}

main().catch((error: unknown) => {
  console.error('Performance seed failed:', error);
  process.exitCode = 1;
});
