import { OrderEmailConsumer } from './order-email.consumer';
import { Delivery, RabbitService } from '../../common/messaging/rabbit.service';
import { MailService } from '../../common/mail/mail.service';
import { OrdersPrismaService } from '../prisma/orders-prisma.service';
import { ATTEMPT_HEADER, QUEUES, retryQueueName } from '../../common/messaging/messaging.constants';


const event = { jobId: 'j1', orderId: 'o1', orderNumber: 5, userId: 'u1', to: 'a@b.com', totalAmount: '10.00', items: [{ productId: 'p1', name: 'Shirt', quantity: 1, unitPrice: '10.00' }], createdAt: new Date().toISOString() };
const delivery = (failures = 0, body: unknown = event): Delivery => ({
  msg: { content: Buffer.from(typeof body === 'string' ? body : JSON.stringify(body)), properties: { headers: { [ATTEMPT_HEADER]: failures } } } as any,
  ack: jest.fn(), nack: jest.fn(),
});

function setup(opts: { sendFails?: boolean; status?: string; missing?: boolean } = {}) {
  const rabbit = { publish: jest.fn().mockResolvedValue(undefined), retryDelays: [30000, 90000] } as unknown as RabbitService;
  const prisma: any = { emailJob: { update: jest.fn().mockResolvedValue({}) }, $queryRaw: jest.fn().mockResolvedValue(opts.missing ? [] : [{ status: opts.status ?? 'QUEUED' }]) };
  prisma.$transaction = jest.fn((fn: (tx: any) => unknown) => fn(prisma));
  const mail = { send: opts.sendFails ? jest.fn().mockRejectedValue(new Error('smtp down')) : jest.fn().mockResolvedValue(undefined) } as unknown as MailService;
  return { consumer: new OrderEmailConsumer(rabbit, prisma, mail), rabbit, prisma, mail };
}

describe('OrderEmailConsumer', () => {
  it('sends the email, marks SENT and acks only after success', async () => {
    const { consumer, prisma, mail } = setup(); const d = delivery();
    await consumer.handle(d);
    expect((mail as any).send).toHaveBeenCalledWith(expect.objectContaining({ to: 'a@b.com' }));
    expect(prisma.emailJob.update).toHaveBeenCalledWith({ where: { id: 'j1' }, data: expect.objectContaining({ status: 'SENT', attempts: 1 }) });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    expect(d.ack).toHaveBeenCalledTimes(1);
  });

  it('moves the first failure to the 30s retry queue', async () => {
    const { consumer, rabbit, prisma } = setup({ sendFails: true }); const d = delivery(0);
    await consumer.handle(d);
    expect((rabbit as any).publish).toHaveBeenCalledWith('', retryQueueName(30000), event, { [ATTEMPT_HEADER]: 1 });
    expect((prisma as any).emailJob.update).toHaveBeenCalledWith({ where: { id: 'j1' }, data: expect.objectContaining({ status: 'RETRYING', attempts: 1, lastError: 'smtp down' }) });
    expect(d.ack).toHaveBeenCalledTimes(1);
  });

  it('moves the third failure to the dead-letter queue and marks DEAD', async () => {
    const { consumer, rabbit, prisma } = setup({ sendFails: true }); const d = delivery(2);
    await consumer.handle(d);
    expect((rabbit as any).publish).toHaveBeenCalledWith('', QUEUES.EMAIL_DLQ, event, expect.objectContaining({ [ATTEMPT_HEADER]: 3 }));
    expect((prisma as any).emailJob.update).toHaveBeenCalledWith({ where: { id: 'j1' }, data: expect.objectContaining({ status: 'DEAD', attempts: 3 }) });
    expect(d.ack).toHaveBeenCalledTimes(1);
  });

  it('does not resend an email that was already sent (duplicate delivery)', async () => {
    const { consumer, mail } = setup({ status: 'SENT' }); const d = delivery();
    await consumer.handle(d);
    expect((mail as any).send).not.toHaveBeenCalled();
    expect(d.ack).toHaveBeenCalledTimes(1);
  });

  it('parks malformed messages in the DLQ instead of looping', async () => {
    const { consumer, rabbit } = setup(); const d = delivery(0, 'not-json{');
    await consumer.handle(d);
    expect((rabbit as any).publish).toHaveBeenCalledWith('', QUEUES.EMAIL_DLQ, expect.objectContaining({ error: 'invalid JSON' }));
    expect(d.ack).toHaveBeenCalledTimes(1);
  });

  it('acks a message for a missing job without sending mail', async () => {
    const { consumer, prisma, mail } = setup({ missing: true }); const d = delivery();
    await consumer.handle(d);
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    expect(mail.send).not.toHaveBeenCalled();
    expect(d.ack).toHaveBeenCalledTimes(1);
  });
});

describe('OrderEmailConsumer admin failure switch', () => {
  it('fails on purpose and schedules a retry when the admin switch is on', async () => {
    const { consumer, rabbit, prisma, mail } = setup();
    (prisma as any).appFlag = { findUnique: jest.fn().mockResolvedValue({ key: 'mail.forceFail', value: 'true' }) };
    const d = delivery(0);
    await consumer.handle(d);
    expect((mail as any).send).not.toHaveBeenCalled();
    expect((rabbit as any).publish).toHaveBeenCalledWith('', retryQueueName(30000), event, { [ATTEMPT_HEADER]: 1 });
    expect((prisma as any).emailJob.update).toHaveBeenCalledWith({ where: { id: 'j1' }, data: expect.objectContaining({ status: 'RETRYING', lastError: expect.stringContaining('admin switch') }) });
  });
});
