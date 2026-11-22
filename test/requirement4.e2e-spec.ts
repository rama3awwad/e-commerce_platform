import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import type PusherClient from 'pusher-js';
import { createTestApp, listenInternalApiUrls } from './configure-test-app';
import { ProductsPrismaService } from '../src/products/prisma/products-prisma.service';
import { UsersPrismaService } from '../src/users/prisma/users-prisma.service';
import { OrdersPrismaService } from '../src/orders/prisma/orders-prisma.service';
import { MessagingModule } from '../src/common/messaging/messaging.module';
import { RabbitService } from '../src/common/messaging/rabbit.service';
import { MailModule } from '../src/common/mail/mail.module';
import { MailService } from '../src/common/mail/mail.service';
import { OrderEventsPublisher } from '../src/orders/events/order-events.publisher';
import { OrderEmailConsumer } from '../src/orders/email/order-email.consumer';
import { OutboxRelayService } from '../src/orders/email/outbox-relay.service';

process.env.LOGIN_THROTTLE_LIMIT = '5';
process.env.LOGIN_THROTTLE_TTL = '60000';
const { AppModule } = require('../src/app.module');
// pusher-js على Node يُصدَّر مباشرة (module.exports = Pusher) فنستعمل require بدل import default
const Pusher: typeof PusherClient = require('pusher-js');

jest.setTimeout(90000);

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aG9sAAAAASUVORK5CYII=', 'base64');
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function waitFor<T>(fn: () => Promise<T | null | undefined | false>, what: string, ms = 20000): Promise<T> {
  const end = Date.now() + ms;
  while (Date.now() < end) { const v = await fn(); if (v) return v as T; await sleep(200); }
  throw new Error(`Timed out waiting for ${what}`);
}

/**
 * المتطلب الرابع (e2e): كل الاختبارات تمر من الفلو الحقيقي للمشروع:
 *   HTTP (إنشاء طلب) ثم قاعدة البيانات (Outbox) ثم RabbitMQ ثم الـ Worker (consumer) ثم الإيميل،
 *   وSoketi الحقيقي (حاوية docker-compose.test.yml) مع pusher-js وتوكنات JWT حقيقية عبر /realtime/auth.
 *   الإيميل وحده مُستبدل بـ spy كي لا نرسل بريداً فعلياً.
 */
describe('Requirement 4 async processing and real-time e2e', () => {
  let app: INestApplication;
  let ordersPrisma: OrdersPrismaService;
  let rabbit: RabbitService;
  let relay: OutboxRelayService;
  let adminToken: string; let customerAToken: string; let customerBToken: string;
  let productId: string;
  const mail = { sent: [] as { to: string; subject: string }[], fail: false, send: jest.fn() };
  const clients: PusherClient[] = [];

  const sentFor = (orderNumber: number) => mail.sent.find((m) => m.subject.includes(`#${orderNumber}`));
  const createOrder = async (token = customerAToken) => (await request(app.getHttpServer()).post('/api/v1/orders').set('Authorization', `Bearer ${token}`).send({ items: [{ productId, quantity: 1 }] }).expect(201)).body.data;
  const jobOf = (orderId: string) => ordersPrisma.emailJob.findUnique({ where: { orderId } });
  const jobWithStatus = (orderId: string, status: string) => waitFor(async () => { const j = await jobOf(orderId); return j && j.status === status ? j : null; }, `job ${orderId} to be ${status}`);
  // طلب التفويض الحقيقي لقناة (نفس ما يرسله pusher-js): form-urlencoded + JWT
  const authChannel = (token: string | undefined, channel: string, socketId = '123.456') => {
    const req = request(app.getHttpServer()).post('/api/v1/realtime/auth').type('form').send({ socket_id: socketId, channel_name: channel });
    return token ? req.set('Authorization', `Bearer ${token}`) : req;
  };
  // اتصال حقيقي بـ Soketi؛ التفويض يمرّ عبر الـ API الحقيقي (customHandler بدل XHR لأننا خارج المتصفح)
  const connect = (token: string) => new Promise<PusherClient>((resolve, reject) => {
    const client = new Pusher(process.env.PUSHER_APP_KEY || 'app-key', {
      cluster: 'mt1', wsHost: process.env.SOKETI_HOST || 'localhost', wsPort: Number(process.env.SOKETI_PORT || 6001),
      forceTLS: false, enabledTransports: ['ws'], disableStats: true,
      channelAuthorization: {
        customHandler: ({ socketId, channelName }, callback) => {
          authChannel(token, channelName, socketId).then((res) => (res.status === 200 ? callback(null, res.body) : callback(new Error(`${res.status} ${res.body.code}`), null)), (e) => callback(e, null));
        },
      },
    });
    clients.push(client);
    client.connection.bind('connected', () => resolve(client));
    client.connection.bind('error', reject);
  });
  const subscribe = (client: PusherClient, channel: string) => new Promise<{ ok: boolean; error?: string }>((resolve) => {
    const ch = client.subscribe(channel);
    ch.bind('pusher:subscription_succeeded', () => resolve({ ok: true }));
    ch.bind('pusher:subscription_error', (e: { error?: string }) => resolve({ ok: false, error: e?.error }));
  });
  const nextEvent = (client: PusherClient, channel: string, event: string, match: (p: any) => boolean = () => true, ms = 8000) => new Promise<any>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${event}`)), ms);
    client.channel(channel).bind(event, (p: any) => { if (match(p)) { clearTimeout(timer); resolve(p); } });
  });

  beforeAll(async () => {
    mail.send.mockImplementation(async (m: { to: string; subject: string }) => {
      if (mail.fail) throw new Error('smtp down');
      mail.sent.push({ to: m.to, subject: m.subject });
    });
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule, MessagingModule, MailModule],
      // نشغّل الـ consumer والـ relay داخل نفس التطبيق (بالإنتاج هما بحاوية الـ worker)
      providers: [OrdersPrismaService, OrderEventsPublisher, OrderEmailConsumer, OutboxRelayService],
    }).overrideProvider(MailService).useValue(mail).compile();
    app = await createTestApp(moduleRef.createNestApplication());
    await listenInternalApiUrls(app);
    ordersPrisma = app.get(OrdersPrismaService); rabbit = app.get(RabbitService); relay = app.get(OutboxRelayService);
    await app.get(UsersPrismaService).user.updateMany({ where: { email: { in: ['admin@store.com', 'customer@test.com', 'customer2@test.com'] } }, data: { loginAttempts: 0, lockUntil: null } });
    const http = request(app.getHttpServer());
    const login = async (identifier: string) => (await http.post('/api/v1/auth/login').send({ identifier, password: 'Admin@123' }).expect(200)).body.data.accessToken;
    adminToken = await login('admin@store.com'); customerAToken = await login('customer@test.com'); customerBToken = await login('customer2@test.com');
    const category = await app.get(ProductsPrismaService).category.findUnique({ where: { slug: 'clothing' } });
    if (!category) throw new Error('Seed category clothing is missing');
    const product = await http.post('/api/v1/products').set('Authorization', `Bearer ${adminToken}`).field('name', `Async ${Date.now()}`).field('price', '4').field('categoryId', category.id).attach('image', PNG, { filename: 'a.png', contentType: 'image/png' }).expect(201);
    productId = product.body.data.id;
    await http.patch(`/api/v1/products/${productId}/stock`).set('Authorization', `Bearer ${adminToken}`).send({ quantity: 500 }).expect(200);
    await waitFor(async () => rabbit.isConnected, 'RabbitMQ connection', 30000);
    await sleep(500); // ليبدأ الـ consumer
  });
  afterEach(() => { mail.fail = false; clients.splice(0).forEach((c) => c.disconnect()); });
  afterAll(async () => { await app?.close(); });

  it('responds immediately, stores the outbox job with the order, and the worker sends the email', async () => {
    const order = await createOrder();
    const job = await jobOf(order.id); // موجود فور الرد: حُفظ بنفس transaction الطلب
    expect(job).toMatchObject({ recipient: 'customer@test.com' });
    const sent = await jobWithStatus(order.id, 'SENT');
    expect(sent).toMatchObject({ attempts: 1, lastError: null });
    expect(sent.publishedAt).not.toBeNull();
    expect(sentFor(order.orderNumber)).toMatchObject({ to: 'customer@test.com' });
  });

  it('retries with backoff, parks the email in the DLQ after 3 failures, and the admin can requeue it', async () => {
    mail.fail = true;
    const order = await createOrder();
    const dead = await jobWithStatus(order.id, 'DEAD');
    expect(dead).toMatchObject({ attempts: 3, lastError: 'smtp down' });
    expect(sentFor(order.orderNumber)).toBeUndefined();

    const http = request(app.getHttpServer());
    const listed = await http.get('/api/v1/admin/email-jobs?status=DEAD').set('Authorization', `Bearer ${adminToken}`).expect(200);
    expect(listed.body.data.items.some((j: any) => j.id === dead.id && j.maxAttempts === 3)).toBe(true);
    expect(listed.body.data.counts.DEAD).toBeGreaterThanOrEqual(1);

    mail.fail = false;
    await http.post(`/api/v1/admin/email-jobs/${dead.id}/requeue`).set('Authorization', `Bearer ${adminToken}`).expect(200);
    await jobWithStatus(order.id, 'SENT');
    expect(sentFor(order.orderNumber)).toBeDefined();
  });

  it('lets the admin switch make every attempt fail, then recovers when it is turned off', async () => {
    const http = request(app.getHttpServer());
    const toggle = (forceFail: boolean) => http.patch('/api/v1/admin/email-jobs/settings').set('Authorization', `Bearer ${adminToken}`).send({ forceFail }).expect(200);
    await toggle(true);
    try {
      const order = await createOrder();
      const retrying = await waitFor(async () => { const j = await jobOf(order.id); return j && j.attempts >= 1 && j.status !== 'SENT' ? j : null; }, 'first failed attempt');
      expect(retrying.lastError).toContain('admin switch');
      await toggle(false);
      await jobWithStatus(order.id, 'SENT');
    } finally { await toggle(false); }
  });

  it('still creates the order when RabbitMQ publishing fails, and the outbox relay delivers it later', async () => {
    jest.spyOn(rabbit, 'publish').mockRejectedValueOnce(new Error('rabbit down'));
    const order = await createOrder(); // الطلب ينجح رغم فشل النشر
    const job = await jobOf(order.id);
    expect(job).toMatchObject({ status: 'QUEUED', publishedAt: null });
    await sleep(500);
    expect((await jobOf(order.id))!.status).toBe('QUEUED'); // لم يُرسل بعد
    await ordersPrisma.emailJob.update({ where: { id: job!.id }, data: { createdAt: new Date(Date.now() - 120000) } });
    expect(await relay.tick()).toBeGreaterThanOrEqual(1);
    await jobWithStatus(order.id, 'SENT');
  });

  it('protects the email monitoring endpoints by role', async () => {
    const http = request(app.getHttpServer());
    await http.get('/api/v1/admin/email-jobs').expect(401);
    await http.get('/api/v1/admin/email-jobs').set('Authorization', `Bearer ${customerAToken}`).expect(403);
    await http.patch('/api/v1/admin/email-jobs/settings').set('Authorization', `Bearer ${customerAToken}`).send({ forceFail: true }).expect(403);
    const order = await createOrder();
    const job = await jobWithStatus(order.id, 'SENT');
    await http.post(`/api/v1/admin/email-jobs/${job.id}/requeue`).set('Authorization', `Bearer ${customerAToken}`).expect(403);
    const notDead = await http.post(`/api/v1/admin/email-jobs/${job.id}/requeue`).set('Authorization', `Bearer ${adminToken}`).expect(409);
    expect(notDead.body.code).toBe('INVALID_STATE');
    await http.post('/api/v1/admin/email-jobs/00000000-0000-4000-8000-000000000000/requeue').set('Authorization', `Bearer ${adminToken}`).expect(404);
  });

  it('authorizes real-time channels by identity and role (no token, customer vs admin, owner vs other customer)', async () => {
    const order = await createOrder(customerAToken);
    const admin = 'private-admin.orders'; const mine = `private-order.${order.id}`;

    await authChannel(undefined, admin).expect(401);
    await authChannel('not-a-jwt', admin).expect(401);
    expect((await authChannel(customerAToken, admin).expect(403)).body.code).toBe('FORBIDDEN');
    expect((await authChannel(customerBToken, mine).expect(403)).body.code).toBe('FORBIDDEN');
    expect((await authChannel(adminToken, mine).expect(403)).body.code).toBe('FORBIDDEN');
    await authChannel(adminToken, admin).expect(200).expect((r) => expect(r.body.auth).toMatch(/^.+:[0-9a-f]{64}$/));
    await authChannel(customerAToken, mine).expect(200).expect((r) => expect(r.body.auth).toMatch(/^.+:[0-9a-f]{64}$/));
  });

  it('pushes new orders to the admin and status changes to the owner in real time, and nobody else receives them', async () => {
    const admin = await connect(adminToken); const alice = await connect(customerAToken); const bob = await connect(customerBToken);
    expect(await subscribe(admin, 'private-admin.orders')).toEqual({ ok: true });
    expect((await subscribe(alice, 'private-admin.orders')).ok).toBe(false);

    const created = nextEvent(admin, 'private-admin.orders', 'order.created');
    const order = await createOrder(customerAToken);
    expect(await created).toMatchObject({ id: order.id, status: 'PENDING' });

    const mine = `private-order.${order.id}`;
    expect(await subscribe(alice, mine)).toEqual({ ok: true });
    expect((await subscribe(bob, mine)).ok).toBe(false);

    const bobEvents: any[] = []; bob.bind_global((name: string, data: any) => { if (!name.startsWith('pusher:')) bobEvents.push(data); });
    const aliceGot = nextEvent(alice, mine, 'order.status.changed', (p) => p.id === order.id);
    const adminGot = nextEvent(admin, 'private-admin.orders', 'order.status.changed', (p) => p.id === order.id);
    await request(app.getHttpServer()).patch(`/api/v1/orders/${order.id}/status`).set('Authorization', `Bearer ${adminToken}`).send({ status: 'CONFIRMED' }).expect(200);
    expect((await aliceGot).status).toBe('CONFIRMED');
    expect((await adminGot).status).toBe('CONFIRMED');
    await sleep(300);
    expect(bobEvents).toHaveLength(0);

    // الإلغاء يصل للزبون، وبعده لا يُسمح باشتراك جديد بهذا الطلب
    const cancelled = nextEvent(alice, mine, 'order.status.changed', (p) => p.id === order.id && p.status === 'CANCELLED');
    await request(app.getHttpServer()).post(`/api/v1/orders/${order.id}/cancel`).set('Authorization', `Bearer ${adminToken}`).expect(200);
    await cancelled;
    expect((await authChannel(customerAToken, mine).expect(403)).body.code).toBe('ORDER_CLOSED');
  });
});