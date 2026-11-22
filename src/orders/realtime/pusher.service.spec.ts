import { ADMIN_CHANNEL, PusherService, orderChannel } from './pusher.service';

const config = { get: (_k: string, fallback?: string) => fallback } as any;

describe('PusherService', () => {
  const build = () => {
    const service = new PusherService(config);
    const trigger = jest.fn().mockResolvedValue({ ok: true, status: 200 });
    (service as any).client = { ...(service as any).client, trigger };
    return { service, trigger };
  };

  it('publishes a new order only to the admin channel', () => {
    const { service, trigger } = build();
    service.emitOrderCreated({ id: 'o1', userId: 'u1', status: 'PENDING' });
    expect(trigger).toHaveBeenCalledWith([ADMIN_CHANNEL], 'order.created', expect.objectContaining({ id: 'o1' }));
  });

  it('publishes a status change to the order channel and the admin channel', () => {
    const { service, trigger } = build();
    service.emitOrderStatusChanged({ id: 'o1', userId: 'u1', status: 'CONFIRMED' });
    expect(trigger).toHaveBeenCalledWith([orderChannel('o1'), ADMIN_CHANNEL], 'order.status.changed', expect.objectContaining({ status: 'CONFIRMED' }));
  });

  it('never throws when Soketi is down', async () => {
    const { service, trigger } = build();
    trigger.mockRejectedValue(new Error('ECONNREFUSED'));
    expect(() => service.emitOrderCreated({ id: 'o1', userId: 'u1', status: 'PENDING' })).not.toThrow();
    await new Promise((r) => setTimeout(r, 10));
  });

  it('signs private channels with the app secret (pusher protocol)', () => {
    const service = new PusherService(config);
    const { auth } = service.authorizeChannel('123.456', 'private-admin.orders');
    expect(auth).toMatch(/^app-key:[0-9a-f]{64}$/);
  });
});