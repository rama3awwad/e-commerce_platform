import { ProductsPrismaService } from './products-prisma.service';

describe('ProductsPrismaService', () => {
  const original = process.env.READ_REPLICA_ENABLED;
  afterEach(() => {
    if (original === undefined) delete process.env.READ_REPLICA_ENABLED;
    else process.env.READ_REPLICA_ENABLED = original;
  });

  it('reads from the primary when the replica is disabled', () => {
    process.env.READ_REPLICA_ENABLED = 'false';
    const service = new ProductsPrismaService();
    expect(service.hasReplica).toBe(false);
  });
});
