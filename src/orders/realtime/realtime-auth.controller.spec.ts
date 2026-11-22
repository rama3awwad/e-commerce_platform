import { ForbiddenException } from '@nestjs/common';
import { RealtimeAuthController } from './realtime-auth.controller';
import { PusherService } from './pusher.service';
import { OrdersPrismaService } from '../prisma/orders-prisma.service';

const ORDER_ALICE = '11111111-1111-4111-8111-111111111111';
const ORDER_DONE = '22222222-2222-4222-8222-222222222222';
const orders: Record<string, { userId: string; status: string }> = {
  [ORDER_ALICE]: { userId: 'alice', status: 'PENDING' },
  [ORDER_DONE]: { userId: 'alice', status: 'CANCELLED' },
};
const admin = { id: 'admin', role: 'ADMIN' } as any;
const alice = { id: 'alice', role: 'CUSTOMER' } as any;
const bob = { id: 'bob', role: 'CUSTOMER' } as any;

function setup() {
  const pusher = { authorizeChannel: jest.fn((socketId: string, channel: string) => ({ auth: `key:sig(${socketId}:${channel})` })) } as unknown as PusherService;
  const prisma = { order: { findUnique: jest.fn(async ({ where }: any) => orders[where.id] ?? null) } } as unknown as OrdersPrismaService;
  const res: any = { status: jest.fn().mockReturnThis(), json: jest.fn() };
  const controller = new RealtimeAuthController(pusher, prisma);
  const call = (user: any, channel: string) => controller.authorize(user, { socket_id: '123.456', channel_name: channel }, res);
  return { call, pusher, res };
}

describe('RealtimeAuthController (channel authorization)', () => {
  it('signs the admin channel for an admin only', async () => {
    const { call, pusher, res } = setup();
    await call(admin, 'private-admin.orders');
    expect(pusher.authorizeChannel).toHaveBeenCalledWith('123.456', 'private-admin.orders');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ auth: 'key:sig(123.456:private-admin.orders)' });
  });

  it('refuses the admin channel for a customer and never signs it', async () => {
    const { call, pusher, res } = setup();
    await expect(call(alice, 'private-admin.orders')).rejects.toMatchObject({ response: { code: 'FORBIDDEN' } });
    expect(pusher.authorizeChannel).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });

  it('signs an order channel for the order owner', async () => {
    const { call, pusher } = setup();
    await call(alice, `private-order.${ORDER_ALICE}`);
    expect(pusher.authorizeChannel).toHaveBeenCalledWith('123.456', `private-order.${ORDER_ALICE}`);
  });

  it('refuses another customer, an admin, a missing order and a malformed id with the same FORBIDDEN answer', async () => {
    const { call, pusher } = setup();
    for (const [user, channel] of [[bob, `private-order.${ORDER_ALICE}`], [admin, `private-order.${ORDER_ALICE}`], [bob, 'private-order.33333333-3333-4333-8333-333333333333'], [alice, 'private-order.not-a-uuid']] as const) {
      await expect(call(user, channel)).rejects.toBeInstanceOf(ForbiddenException);
      await expect(call(user, channel)).rejects.toMatchObject({ response: { code: 'FORBIDDEN' } });
    }
    expect(pusher.authorizeChannel).not.toHaveBeenCalled();
  });

  it('does not let anyone subscribe to a cancelled (closed) order', async () => {
    const { call, pusher } = setup();
    await expect(call(alice, `private-order.${ORDER_DONE}`)).rejects.toMatchObject({ response: { code: 'ORDER_CLOSED' } });
    expect(pusher.authorizeChannel).not.toHaveBeenCalled();
  });

  it('refuses unknown channels', async () => {
    const { call } = setup();
    await expect(call(admin, 'private-something.else')).rejects.toMatchObject({ response: { code: 'FORBIDDEN' } });
  });
});