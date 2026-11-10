import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { createTestApp, listenInternalApiUrls } from './configure-test-app';
import { UsersPrismaService } from '../src/users/prisma/users-prisma.service';
import { ProductsPrismaService } from '../src/products/prisma/products-prisma.service';
import { OrdersPrismaService } from '../src/orders/prisma/orders-prisma.service';
import { NotificationsPrismaService } from '../src/notifications/prisma/notifications-prisma.service';
import { readdirSync } from 'fs';
import { join } from 'path';
import { runSeed } from '../prisma/seed';

process.env.LOGIN_THROTTLE_LIMIT = '5';
process.env.LOGIN_THROTTLE_TTL = '60000';
const { AppModule } = require('../src/app.module');

jest.setTimeout(90000);
describe('Requirement 1 security/API e2e', () => {
  let app: INestApplication;
  let usersPrisma: UsersPrismaService;
  let productsPrisma: ProductsPrismaService;
  let ordersPrisma: OrdersPrismaService;
  let notificationsPrisma: NotificationsPrismaService;
  let adminToken: string;
  let customerAToken: string;
  let customerBToken: string;
  let firstOrderId: string;
  let createdProductId: string;
  let categoryId: string;

  beforeAll(async () => {
    process.env.LOGIN_THROTTLE_LIMIT = '5';
    process.env.LOGIN_THROTTLE_TTL = '60000';
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = await createTestApp(moduleRef.createNestApplication()); await listenInternalApiUrls(app);
    usersPrisma = app.get(UsersPrismaService); productsPrisma = app.get(ProductsPrismaService); ordersPrisma = app.get(OrdersPrismaService); notificationsPrisma = app.get(NotificationsPrismaService);
    await usersPrisma.user.updateMany({ where: { email: { in: ['admin@store.com', 'customer@test.com', 'customer2@test.com'] } }, data: { loginAttempts: 0, lockUntil: null } });
    const http = request(app.getHttpServer());
    const login = async (identifier: string) => (await http.post('/api/v1/auth/login').send({ identifier, password: 'Admin@123' }).expect(200)).body.data.accessToken;
    adminToken = await login('admin@store.com');
    customerAToken = await login('customer@test.com');
    customerBToken = await login('customer2@test.com');
    const category = await productsPrisma.category.findUnique({ where: { slug: 'clothing' } });
    if (!category) throw new Error('Seed category clothing is missing');
    categoryId = category.id;
  });
  afterAll(async () => { await app?.close(); });

  it('returns 401 for protected endpoints without a token', async () => {
    const http = request(app.getHttpServer());
    for (const path of ['/api/v1/users', '/api/v1/products', '/api/v1/categories', '/api/v1/orders', '/api/v1/notifications']) await http.get(path).expect(401);
  });

  it('enforces product roles, upload validation, filter and pagination', async () => {
    const http = request(app.getHttpServer());
    const customer = await http.post('/api/v1/products').set('Authorization', `Bearer ${customerAToken}`).field('name', 'Nope').expect(403);
    expect(JSON.stringify(customer.body)).not.toMatch(/password|loginAttempts|lockUntil/i);
    const upload = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aG9sAAAAASUVORK5CYII=', 'base64');
    const created = await http.post('/api/v1/products').set('Authorization', `Bearer ${adminToken}`).field('name', 'Test product').field('description', 'e2e').field('price', '5.50').field('categoryId', String(categoryId)).attach('image', upload, { filename: 'tiny.png', contentType: 'image/png' }).expect(201);
    createdProductId = created.body.data.id;
    expect(created.body.data.imageUrl).toMatch(/^\/uploads\//);
    const invalidImage = await http.post('/api/v1/products').set('Authorization', `Bearer ${adminToken}`).field('name', 'bad').field('price', '5').field('categoryId', String(categoryId)).attach('image', Buffer.from('no image'), { filename: 'bad.txt', contentType: 'text/plain' }).expect(400);
    expect(invalidImage.body.code).toBe('INVALID_IMAGE_TYPE');
    const uploadDir = process.env.UPLOAD_DIR || join(process.cwd(), 'uploads');
    const filesBeforeInvalidSignature = new Set(readdirSync(uploadDir));
    const spoofedImage = await http.post('/api/v1/products').set('Authorization', `Bearer ${adminToken}`).field('name', 'spoofed image').field('price', '5').field('categoryId', String(categoryId)).attach('image', Buffer.from('plain text pretending to be png'), { filename: 'x.png', contentType: 'image/png' }).expect(400);
    expect(spoofedImage.body.code).toBe('INVALID_IMAGE_TYPE');
    expect(readdirSync(uploadDir).filter((name) => !filesBeforeInvalidSignature.has(name))).toHaveLength(0);
    const largeImage = await http.post('/api/v1/products').set('Authorization', `Bearer ${adminToken}`).field('name', 'large').field('price', '5').field('categoryId', String(categoryId)).attach('image', Buffer.alloc(2 * 1024 * 1024 + 1), { filename: 'large.png', contentType: 'image/png' }).expect(400);
    expect(largeImage.body.code).toBe('IMAGE_TOO_LARGE');
    const filtered = await http.get(`/api/v1/products?category=${categoryId}&page=1&limit=2`).set('Authorization', `Bearer ${customerAToken}`).expect(200);
    expect(filtered.body.data.items.every((p: any) => p.categoryId === categoryId)).toBe(true);
    expect(filtered.body.data.meta).toMatchObject({ page: 1, limit: 2 });
    const invalidCategory = await http.get('/api/v1/products?category=not-a-uuid').set('Authorization', `Bearer ${customerAToken}`).expect(400);
    expect(invalidCategory.body.code).toBe('VALIDATION_ERROR');
    const changed = await http.patch(`/api/v1/products/${createdProductId}`).set('Authorization', `Bearer ${adminToken}`).field('price', '6.75').expect(200);
    expect(Number(changed.body.data.price)).toBe(6.75);
    expect(changed.body.data.stock).toEqual(expect.any(Number));
    expect(changed.body.data.category).toBeDefined();
    expect(changed.body.data.category.id).toBe(categoryId);
  });

  it('validates unknown fields and pagination maximum', async () => {
    const http = request(app.getHttpServer());
    const invalid = await http.post('/api/v1/auth/register').send({ email: 'bad@example.com', username: 'baduser', password: 'Password@123', role: 'ADMIN' }).expect(400);
    expect(invalid.body.code).toBe('VALIDATION_ERROR');
    await http.get('/api/v1/products?limit=1000').set('Authorization', `Bearer ${customerAToken}`).expect(400);
  });

  it('protects order ownership and status transition rules; reserves inventory', async () => {
    const http = request(app.getHttpServer());
    const order = await http.post('/api/v1/orders').set('Authorization', `Bearer ${customerAToken}`).send({ items: [{ productId: createdProductId, quantity: 2 }] }).expect(201);
    expect(order.body.data.orderNumber).toEqual(expect.any(Number));
    firstOrderId = order.body.data.id;
    const anotherRead = await http.get(`/api/v1/orders/${firstOrderId}`).set('Authorization', `Bearer ${customerBToken}`).expect(403);
    expect(anotherRead.body.code).toBe('FORBIDDEN');
    const bList = await http.get('/api/v1/orders').set('Authorization', `Bearer ${customerBToken}`).expect(200);
    expect(bList.body.data.items.some((x: any) => x.id === firstOrderId)).toBe(false);
    await http.get(`/api/v1/orders/${firstOrderId}`).set('Authorization', `Bearer ${adminToken}`).expect(200);
    await http.patch(`/api/v1/orders/${firstOrderId}/status`).set('Authorization', `Bearer ${customerAToken}`).send({ status: 'CONFIRMED' }).expect(403);
    await http.patch(`/api/v1/orders/${firstOrderId}/status`).set('Authorization', `Bearer ${adminToken}`).send({ status: 'CONFIRMED' }).expect(200);
    const invalidTransition = await http.patch(`/api/v1/orders/${firstOrderId}/status`).set('Authorization', `Bearer ${adminToken}`).send({ status: 'PENDING' }).expect(409);
    expect(invalidTransition.body.code).toBe('INVALID_STATUS_TRANSITION');
    await http.patch(`/api/v1/orders/${firstOrderId}/status`).set('Authorization', `Bearer ${adminToken}`).send({ status: 'SHIPPED' }).expect(400);
    await http.patch(`/api/v1/orders/${firstOrderId}/status`).set('Authorization', `Bearer ${adminToken}`).send({ status: 'DELIVERED' }).expect(400);
    const stock = await http.get(`/api/v1/products/${createdProductId}`).set('Authorization', `Bearer ${customerAToken}`).expect(200);
    expect(stock.body.data.stock).toBe(Number(process.env.STUB_DEFAULT_STOCK || 50) - 2);
  });

  it('allows admins to cancel pending and confirmed orders from both cancel routes', async () => {
    const http = request(app.getHttpServer());
    const image = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aG9sAAAAASUVORK5CYII=', 'base64');
    const product = await http.post('/api/v1/products').set('Authorization', `Bearer ${adminToken}`).field('name', `Admin cancel ${Date.now()}`).field('price', '2').field('categoryId', categoryId).attach('image', image, { filename: 'cancel.png', contentType: 'image/png' }).expect(201);
    await http.patch(`/api/v1/products/${product.body.data.id}/stock`).set('Authorization', `Bearer ${adminToken}`).send({quantity:20}).expect(200);
    const create = async () => (await http.post('/api/v1/orders').set('Authorization', `Bearer ${customerAToken}`).send({items:[{productId:product.body.data.id,quantity:2}]}).expect(201)).body.data;
    const pendingPatch = await create();
    await http.patch(`/api/v1/orders/${pendingPatch.id}/status`).set('Authorization', `Bearer ${adminToken}`).send({status:'CANCELLED'}).expect(200);
    const pendingCancel = await create();
    await http.post(`/api/v1/orders/${pendingCancel.id}/cancel`).set('Authorization', `Bearer ${adminToken}`).expect(200);
    const confirmed = await create();
    await http.patch(`/api/v1/orders/${confirmed.id}/status`).set('Authorization', `Bearer ${adminToken}`).send({status:'CONFIRMED'}).expect(200);
    await http.post(`/api/v1/orders/${confirmed.id}/cancel`).set('Authorization', `Bearer ${adminToken}`).expect(200);
    const customerOwn = await create();
    await http.post(`/api/v1/orders/${customerOwn.id}/cancel`).set('Authorization', `Bearer ${customerBToken}`).expect(403);
  });

  it('returns insufficient stock conflict without creating an order', async () => {
    const http = request(app.getHttpServer());
    const product = await http.post('/api/v1/products').set('Authorization', `Bearer ${adminToken}`).field('name', 'Low stock').field('price', '3').field('categoryId', String(categoryId)).attach('image', Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aG9sAAAAASUVORK5CYII=', 'base64'), { filename: 'low.png', contentType: 'image/png' }).expect(201);
    await http.patch(`/api/v1/products/${product.body.data.id}/stock`).set('Authorization', `Bearer ${adminToken}`).send({ quantity: 0 }).expect(200);
    const before = await ordersPrisma.order.count();
    const response = await http.post('/api/v1/orders').set('Authorization', `Bearer ${customerAToken}`).send({ items: [{ productId: product.body.data.id, quantity: 1 }] }).expect(409);
    expect(response.body.code).toBe('INSUFFICIENT_STOCK');
    expect(await ordersPrisma.order.count()).toBe(before);
  });

  it('releases stock once when concurrent customer cancellation requests race', async () => {
    const http = request(app.getHttpServer());
    const image = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aG9sAAAAASUVORK5CYII=', 'base64');
    const product = await http.post('/api/v1/products').set('Authorization', `Bearer ${adminToken}`).field('name', `Cancel race ${Date.now()}`).field('price', '3').field('categoryId', categoryId).attach('image', image, { filename: 'race.png', contentType: 'image/png' }).expect(201);
    const productId = product.body.data.id;
    const initialStock = 12;
    await http.patch(`/api/v1/products/${productId}/stock`).set('Authorization', `Bearer ${adminToken}`).send({ quantity: initialStock }).expect(200);
    const order = await http.post('/api/v1/orders').set('Authorization', `Bearer ${customerAToken}`).send({ items: [{ productId, quantity: 3 }] }).expect(201);
    const cancel = () => http.post(`/api/v1/orders/${order.body.data.id}/cancel`).set('Authorization', `Bearer ${customerAToken}`);
    const responses = await Promise.all([cancel(), cancel()]);
    expect(responses.map((response: any) => response.status).sort()).toEqual([200, 409]);
    const productAfterRace = await http.get(`/api/v1/products/${productId}`).set('Authorization', `Bearer ${customerAToken}`).expect(200);
    expect(productAfterRace.body.data.stock).toBe(initialStock);
    await http.post(`/api/v1/orders/${order.body.data.id}/cancel`).set('Authorization', `Bearer ${customerAToken}`).expect(409);
    const productAfterRepeat = await http.get(`/api/v1/products/${productId}`).set('Authorization', `Bearer ${customerAToken}`).expect(200);
    expect(productAfterRepeat.body.data.stock).toBe(initialStock);
  });

  it('releases stock once when customer cancellation races admin status cancellation', async () => {
    const http = request(app.getHttpServer());
    const image = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aG9sAAAAASUVORK5CYII=', 'base64');
    const product = await http.post('/api/v1/products').set('Authorization', `Bearer ${adminToken}`).field('name', `Admin cancel race ${Date.now()}`).field('price', '3').field('categoryId', categoryId).attach('image', image, { filename: 'race.png', contentType: 'image/png' }).expect(201);
    const productId = product.body.data.id;
    const initialStock = 9;
    await http.patch(`/api/v1/products/${productId}/stock`).set('Authorization', `Bearer ${adminToken}`).send({ quantity: initialStock }).expect(200);
    const order = await http.post('/api/v1/orders').set('Authorization', `Bearer ${customerAToken}`).send({ items: [{ productId, quantity: 4 }] }).expect(201);
    const orderId = order.body.data.id;
    const responses = await Promise.all([
      http.post(`/api/v1/orders/${orderId}/cancel`).set('Authorization', `Bearer ${customerAToken}`),
      http.patch(`/api/v1/orders/${orderId}/status`).set('Authorization', `Bearer ${adminToken}`).send({ status: 'CANCELLED' }),
    ]);
    expect(responses.map((response: any) => response.status).sort()).toEqual([200, 409]);
    const productAfterRace = await http.get(`/api/v1/products/${productId}`).set('Authorization', `Bearer ${customerAToken}`).expect(200);
    expect(productAfterRace.body.data.stock).toBe(initialStock);
  });

  it('never exposes password or account lockout fields in API responses', async () => {
    const http = request(app.getHttpServer());
    const responses = [
      (await http.get('/api/v1/auth/me').set('Authorization', `Bearer ${customerAToken}`)).body,
      (await http.get('/api/v1/users/profile').set('Authorization', `Bearer ${customerAToken}`)).body,
      (await http.get('/api/v1/products').set('Authorization', `Bearer ${customerAToken}`)).body,
      (await http.get('/api/v1/orders').set('Authorization', `Bearer ${customerAToken}`)).body,
      (await http.get('/api/v1/notifications').set('Authorization', `Bearer ${customerAToken}`)).body,
    ];
    for (const body of responses) expect(JSON.stringify(body)).not.toMatch(/"(password|loginAttempts|lockUntil)"/i);
  });

  it('rejects invalid order item quantities, empty items, and duplicate products', async () => {
    const http = request(app.getHttpServer());
    const cases = [
      { items: [{ productId: createdProductId, quantity: -1 }] },
      { items: [{ productId: createdProductId, quantity: 0 }] },
      { items: [{ productId: createdProductId, quantity: 101 }] },
      { items: [] },
      { items: [{ productId: createdProductId, quantity: 1 }, { productId: createdProductId, quantity: 1 }] },
    ];
    for (const body of cases) {
      const response = await http.post('/api/v1/orders').set('Authorization', `Bearer ${customerAToken}`).send(body).expect(400);
      expect(response.body.code).toBe('VALIDATION_ERROR');
    }
  });

  it('only lets notification owners read or mark their notifications', async () => {
    const http = request(app.getHttpServer());
    const userA = await usersPrisma.user.findUniqueOrThrow({ where: { email: 'customer@test.com' } });
    const userB = await usersPrisma.user.findUniqueOrThrow({ where: { email: 'customer2@test.com' } });
    const noticeA = await notificationsPrisma.notification.create({ data: { userId: userA.id, type: 'TEST', title: 'A', message: 'A notice' } });
    const noticeB = await notificationsPrisma.notification.create({ data: { userId: userB.id, type: 'TEST', title: 'B', message: 'B notice' } });
    const denied = await http.patch(`/api/v1/notifications/${noticeA.id}/read`).set('Authorization', `Bearer ${customerBToken}`).expect(403);
    expect(denied.body.code).toBe('FORBIDDEN');
    await http.patch('/api/v1/notifications/read-all').set('Authorization', `Bearer ${customerAToken}`).expect(200);
    expect((await notificationsPrisma.notification.findUniqueOrThrow({ where: { id: noticeA.id } })).isRead).toBe(true);
    expect((await notificationsPrisma.notification.findUniqueOrThrow({ where: { id: noticeB.id } })).isRead).toBe(false);
  });

  it('soft-deletes an ordered product from the catalog while preserving old order items', async () => {
    const http = request(app.getHttpServer());
    await http.delete(`/api/v1/products/${createdProductId}`).set('Authorization', `Bearer ${adminToken}`).expect(200);
    const list = await http.get('/api/v1/products').set('Authorization', `Bearer ${customerAToken}`).expect(200);
    expect(list.body.data.items.some((product: any) => product.id === createdProductId)).toBe(false);
    const oldOrder = await http.get(`/api/v1/orders/${firstOrderId}`).set('Authorization', `Bearer ${customerAToken}`).expect(200);
    expect(oldOrder.body.data.items.some((item: any) => item.productId === createdProductId)).toBe(true);
  });

  it('keeps admin edits when the seed is forced on a populated database', async () => {
    const oldForceSeed = process.env.FORCE_SEED;
    try {
      delete process.env.FORCE_SEED;
      await runSeed({users: usersPrisma as any, products: productsPrisma as any});
      const shirt = await productsPrisma.product.findFirstOrThrow({ where: { name: 'Classic T-Shirt' } });
      const hoodie = await productsPrisma.product.findFirstOrThrow({ where: { name: 'Cotton Hoodie' } });
      const clothing = await productsPrisma.category.findUniqueOrThrow({ where: { slug: 'clothing' } });
      const countBefore = await productsPrisma.product.count();
      await productsPrisma.product.update({ where: { id: shirt.id }, data: { price: 1.23 } });
      await productsPrisma.product.update({ where: { id: hoodie.id }, data: { isActive: false } });
      await productsPrisma.category.update({ where: { id: clothing.id }, data: { name: 'Renamed clothing' } });
      process.env.FORCE_SEED = 'true';
      await runSeed({users: usersPrisma as any, products: productsPrisma as any});
      expect(Number((await productsPrisma.product.findUniqueOrThrow({ where: { id: shirt.id } })).price)).toBe(1.23);
      expect((await productsPrisma.product.findUniqueOrThrow({ where: { id: hoodie.id } })).isActive).toBe(false);
      expect((await productsPrisma.category.findUniqueOrThrow({ where: { id: clothing.id } })).name).toBe('Renamed clothing');
      expect(await productsPrisma.product.count()).toBe(countBefore);
    } finally {
      if (oldForceSeed === undefined) delete process.env.FORCE_SEED;
      else process.env.FORCE_SEED = oldForceSeed;
    }
  });
});

describe('isolated login rate limit', () => {
  let app: INestApplication;
  beforeAll(async () => {
    process.env.LOGIN_THROTTLE_LIMIT = '5';
    process.env.LOGIN_THROTTLE_TTL = '60000';
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = await createTestApp(moduleRef.createNestApplication()); await listenInternalApiUrls(app);
  });
  afterAll(async () => { await app?.close(); });
  it('returns 429 after five requests using its own fresh app instance', async () => {
    const http = request(app.getHttpServer());
    for (let attempt = 0; attempt < 5; attempt++) await http.post('/api/v1/auth/login').send({ identifier: 'admin@store.com', password: 'Admin@123' }).expect(200);
    const limited = await http.post('/api/v1/auth/login').send({ identifier: 'admin@store.com', password: 'Admin@123' }).expect(429);
    expect(limited.body.code).toBe('TOO_MANY_REQUESTS');
  });
});

describe('account lockout', () => {
  let app: INestApplication;
  let usersPrisma: UsersPrismaService;
  beforeAll(async () => {
    process.env.LOGIN_THROTTLE_LIMIT = '5';
    process.env.LOGIN_THROTTLE_TTL = '60000';
    process.env.ACCOUNT_LOCKOUT_ATTEMPTS = '5';
    process.env.ACCOUNT_LOCKOUT_DURATION_MINUTES = '15';
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = await createTestApp(moduleRef.createNestApplication()); await listenInternalApiUrls(app);
    usersPrisma = app.get(UsersPrismaService);
    await usersPrisma.user.update({ where: { email: 'customer2@test.com' }, data: { loginAttempts: 0, lockUntil: null } });
  });
  afterAll(async () => { await app?.close(); });
  it('locks the account after the configured five failed attempts', async () => {
    const http = request(app.getHttpServer());
    for (let attempt = 0; attempt < 4; attempt++) await http.post('/api/v1/auth/login').send({ identifier: 'customer2@test.com', password: 'wrong' }).expect(401);
    await http.post('/api/v1/auth/login').send({ identifier: 'customer2@test.com', password: 'wrong' }).expect(403);
    const user = await usersPrisma.user.findUniqueOrThrow({ where: { email: 'customer2@test.com' } });
    expect(user.loginAttempts).toBe(5);
    expect(user.lockUntil?.getTime()).toBeGreaterThan(Date.now());
  });
});
