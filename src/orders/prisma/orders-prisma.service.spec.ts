import { OrdersPrismaService } from './orders-prisma.service';

describe('OrdersPrismaService', () => {
  const original = process.env.READ_REPLICA_ENABLED;
  afterEach(() => {
    if (original === undefined) delete process.env.READ_REPLICA_ENABLED;
    else process.env.READ_REPLICA_ENABLED = original;
  });

  it('reads from the primary when the replica is disabled', () => {
    process.env.READ_REPLICA_ENABLED = 'false';
    const service = new OrdersPrismaService();
    expect(service.hasReplica).toBe(false);
  });
});
