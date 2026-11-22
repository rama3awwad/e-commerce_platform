import { EmailJobsService } from './email-jobs.service';
import { OrdersPrismaService } from '../prisma/orders-prisma.service';
import { OrderEventsPublisher } from '../events/order-events.publisher';
import { ConfigService } from '@nestjs/config';

const config = { get: () => '30000,90000' } as unknown as ConfigService;
const payload = { jobId: 'j1', orderId: 'o1', orderNumber: 9, to: 'a@b.com' };

function setup(job: any, publish = jest.fn().mockResolvedValue(undefined)) {
  const prisma = { emailJob: { findUnique: jest.fn().mockResolvedValue(job), update: jest.fn().mockResolvedValue({}), findMany: jest.fn().mockResolvedValue(job ? [job] : []), count: jest.fn().mockResolvedValue(1), groupBy: jest.fn().mockResolvedValue([{ status: 'DEAD', _count: { _all: 1 } }]) }, appFlag: { findUnique: jest.fn(), upsert: jest.fn().mockResolvedValue({}) } } as unknown as OrdersPrismaService;
  return { service: new EmailJobsService(prisma, { publishOrderCreated: publish } as unknown as OrderEventsPublisher, config), prisma, publish };
}

describe('EmailJobsService', () => {
  it('lists jobs with counts per status and the max attempts', async () => {
    const { service } = setup({ id: 'j1', orderId: 'o1', recipient: 'a@b.com', status: 'DEAD', attempts: 3, lastError: 'x', payload, createdAt: new Date() });
    const res = await service.list({});
    expect(res.counts).toEqual({ QUEUED: 0, RETRYING: 0, SENT: 0, DEAD: 1 });
    expect(res.items[0]).toMatchObject({ orderNumber: 9, status: 'DEAD', attempts: 3, maxAttempts: 3 });
  });

  it('requeues a dead job: resets it and publishes the event again', async () => {
    const { service, prisma, publish } = setup({ id: 'j1', status: 'DEAD', payload });
    await expect(service.requeue('j1')).resolves.toEqual({ id: 'j1', requeued: true, published: true });
    expect((prisma as any).emailJob.update).toHaveBeenCalledWith({ where: { id: 'j1' }, data: { status: 'QUEUED', attempts: 0, lastError: null, publishedAt: null } });
    expect(publish).toHaveBeenCalledWith(payload);
  });

  it('refuses to requeue a job that is not dead', async () => {
    const { service } = setup({ id: 'j1', status: 'SENT', payload });
    await expect(service.requeue('j1')).rejects.toMatchObject({ response: { code: 'INVALID_STATE' } });
  });

  it('keeps the job queued for the relay when publishing fails', async () => {
    const { service } = setup({ id: 'j1', status: 'DEAD', payload }, jest.fn().mockRejectedValue(new Error('down')));
    await expect(service.requeue('j1')).resolves.toEqual({ id: 'j1', requeued: true, published: false });
  });

  it('stores the failure switch as an app flag', async () => {
    const { service, prisma } = setup(null);
    await service.setForceFail(true);
    expect((prisma as any).appFlag.upsert).toHaveBeenCalledWith({ where: { key: 'mail.forceFail' }, create: { key: 'mail.forceFail', value: 'true' }, update: { value: 'true' } });
  });
});