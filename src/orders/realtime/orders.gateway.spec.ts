import { INestApplication, UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { io, Socket } from 'socket.io-client';
import { OrdersGateway } from './orders.gateway';
import { RealtimeAuthService, RealtimeUser } from './realtime-auth.service';
import { OrdersPrismaService } from '../prisma/orders-prisma.service';

const users: Record<string, RealtimeUser> = {
  'admin-token': { id: 'admin', role: 'ADMIN', email: 'admin@x.com' },
  'alice-token': { id: 'alice', role: 'CUSTOMER', email: 'alice@x.com' },
  'bob-token': { id: 'bob', role: 'CUSTOMER', email: 'bob@x.com' },
};
const orders: Record<string, { userId: string; status: string }> = {
  'order-alice': { userId: 'alice', status: 'PENDING' },
  'order-done': { userId: 'alice', status: 'CANCELLED' },
};
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('OrdersGateway (real Socket.IO server, mocked auth and database)', () => {
  let app: INestApplication;
  let gateway: OrdersGateway;
  let url: string;
  const sockets: Socket[] = [];

  beforeAll(async () => {
    const auth = { authenticate: jest.fn(async (t?: string) => { const u = t ? users[t] : undefined; if (!u) throw new UnauthorizedException('Invalid or expired token'); return u; }) };
    const prisma = { order: { findUnique: jest.fn(async ({ where }: any) => orders[where.id] ?? null) } };
    const moduleRef = await Test.createTestingModule({
      providers: [OrdersGateway, { provide: RealtimeAuthService, useValue: auth }, { provide: OrdersPrismaService, useValue: prisma }],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.listen(0);
    gateway = app.get(OrdersGateway);
    url = `http://localhost:${(app.getHttpServer().address() as any).port}/realtime`;
  });
  afterEach(() => { sockets.splice(0).forEach((s) => s.close()); });
  afterAll(async () => { await app.close(); });

  const connect = (token?: string) => new Promise<Socket>((resolve, reject) => {
    const s = io(url, { auth: { token }, transports: ['websocket'], reconnection: false });
    sockets.push(s);
    s.on('connect', () => resolve(s));
    s.on('connect_error', (e) => reject(e));
  });
  const collect = (s: Socket, event: string) => { const got: any[] = []; s.on(event, (p) => got.push(p)); return got; };

  it('rejects a connection without a valid token', async () => {
    await expect(connect(undefined)).rejects.toThrow('Invalid or expired token');
    await expect(connect('garbage')).rejects.toThrow('Invalid or expired token');
  });

  it('lets only an admin subscribe to the admin channel', async () => {
    const customer = await connect('alice-token');
    expect(await customer.emitWithAck('subscribe:admin')).toMatchObject({ ok: false, code: 'FORBIDDEN' });
    const admin = await connect('admin-token');
    expect(await admin.emitWithAck('subscribe:admin')).toEqual({ ok: true });
  });

  it('lets only the owner subscribe to an order channel', async () => {
    const alice = await connect('alice-token');
    const bob = await connect('bob-token');
    expect(await alice.emitWithAck('subscribe:order', { orderId: 'order-alice' })).toEqual({ ok: true });
    expect(await bob.emitWithAck('subscribe:order', { orderId: 'order-alice' })).toMatchObject({ ok: false, code: 'FORBIDDEN' });
    expect(await bob.emitWithAck('subscribe:order', { orderId: 'does-not-exist' })).toMatchObject({ ok: false, code: 'FORBIDDEN' });
    expect(await alice.emitWithAck('subscribe:order', {})).toMatchObject({ ok: false, code: 'BAD_REQUEST' });
  });

  it('does not subscribe to an order that already ended', async () => {
    const alice = await connect('alice-token');
    expect(await alice.emitWithAck('subscribe:order', { orderId: 'order-done' })).toEqual({ ok: true, closed: true });
  });

  it('pushes order.created to admins only, without a page refresh', async () => {
    const admin = await connect('admin-token'); await admin.emitWithAck('subscribe:admin');
    const alice = await connect('alice-token');
    const adminGot = collect(admin, 'order.created'); const aliceGot = collect(alice, 'order.created');
    gateway.emitOrderCreated({ id: 'order-alice', userId: 'alice', status: 'PENDING' });
    await wait(150);
    expect(adminGot).toHaveLength(1);
    expect(aliceGot).toHaveLength(0);
  });

  it('pushes status changes to the owner and the admin, but not to other customers', async () => {
    const admin = await connect('admin-token'); await admin.emitWithAck('subscribe:admin');
    const alice = await connect('alice-token'); await alice.emitWithAck('subscribe:order', { orderId: 'order-alice' });
    const bob = await connect('bob-token');
    const a = collect(admin, 'order.status.changed'); const o = collect(alice, 'order.status.changed'); const b = collect(bob, 'order.status.changed');
    gateway.emitOrderStatusChanged({ id: 'order-alice', userId: 'alice', status: 'CONFIRMED' });
    await wait(150);
    expect(a).toHaveLength(1); expect(o).toHaveLength(1); expect(b).toHaveLength(0);
    expect(o[0].status).toBe('CONFIRMED');
  });

  it('closes the order channel once the order is cancelled', async () => {
    const alice = await connect('alice-token'); await alice.emitWithAck('subscribe:order', { orderId: 'order-alice' });
    const got = collect(alice, 'order.status.changed');
    gateway.emitOrderStatusChanged({ id: 'order-alice', userId: 'alice', status: 'CANCELLED' });
    await wait(150);
    gateway.emitOrderStatusChanged({ id: 'order-alice', userId: 'alice', status: 'CANCELLED' });
    await wait(150);
    expect(got).toHaveLength(1); // الأول وصل، بعده أُلغي الاشتراك
  });
});