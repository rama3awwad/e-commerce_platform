import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { createTestApp } from './configure-test-app';
import { PrismaService } from '../src/prisma/prisma.service';

jest.setTimeout(90000);
describe('Requirement 1 security/API e2e', () => {
  let app: INestApplication;
  let prisma: PrismaService;
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
    app = await createTestApp(moduleRef.createNestApplication());
    prisma = app.get(PrismaService);
    const http = request(app.getHttpServer());
    const login = async (identifier: string) => (await http.post('/api/v1/auth/login').send({ identifier, password: 'Admin@123' }).expect(200)).body.data.accessToken;
    adminToken = await login('admin@store.com');
    customerAToken = await login('customer@test.com');
    customerBToken = await login('customer2@test.com');
    const category = await prisma.category.findUnique({ where: { slug: 'clothing' } });
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
    const largeImage = await http.post('/api/v1/products').set('Authorization', `Bearer ${adminToken}`).field('name', 'large').field('price', '5').field('categoryId', String(categoryId)).attach('image', Buffer.alloc(2 * 1024 * 1024 + 1), { filename: 'large.png', contentType: 'image/png' }).expect(400);
    expect(largeImage.body.code).toBe('IMAGE_TOO_LARGE');
    const filtered = await http.get(`/api/v1/products?category=${categoryId}&page=1&limit=2`).set('Authorization', `Bearer ${customerAToken}`).expect(200);
    expect(filtered.body.data.items.every((p: any) => p.categoryId === categoryId)).toBe(true);
    expect(filtered.body.data.meta).toMatchObject({ page: 1, limit: 2 });
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
    const stock = await http.get(`/api/v1/products/${createdProductId}`).set('Authorization', `Bearer ${customerAToken}`).expect(200);
    expect(stock.body.data.stock).toBe(Number(process.env.STUB_DEFAULT_STOCK || 50) - 2);
  });

  it('returns insufficient stock conflict without creating an order', async () => {
    const http = request(app.getHttpServer());
    const product = await http.post('/api/v1/products').set('Authorization', `Bearer ${adminToken}`).field('name', 'Low stock').field('price', '3').field('categoryId', String(categoryId)).attach('image', Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aG9sAAAAASUVORK5CYII=', 'base64'), { filename: 'low.png', contentType: 'image/png' }).expect(201);
    await http.patch(`/api/v1/products/${product.body.data.id}/stock`).set('Authorization', `Bearer ${adminToken}`).send({ quantity: 0 }).expect(200);
    const before = await prisma.order.count();
    const response = await http.post('/api/v1/orders').set('Authorization', `Bearer ${customerAToken}`).send({ items: [{ productId: product.body.data.id, quantity: 1 }] }).expect(409);
    expect(response.body.code).toBe('INSUFFICIENT_STOCK');
    expect(await prisma.order.count()).toBe(before);
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

  it('rate limits login attempts with 429', async () => {
    const http = request(app.getHttpServer());
    await http.post('/api/v1/auth/login').send({ identifier: 'admin@store.com', password: 'Admin@123' }).expect(200);
    await http.post('/api/v1/auth/login').send({ identifier: 'admin@store.com', password: 'Admin@123' }).expect(200);
    const limited = await http.post('/api/v1/auth/login').send({ identifier: 'admin@store.com', password: 'Admin@123' }).expect(429);
    expect(limited.body.code).toBe('TOO_MANY_REQUESTS');
  });
});
