import { ProductsPrismaService } from './products-prisma.service';

describe('ProductsPrismaService', () => {
  const originalReadReplicaEnabled = process.env.READ_REPLICA_ENABLED;
  const originalQueryCountEnabled = process.env.PRISMA_QUERY_COUNT_ENABLED;

  afterEach(() => {
    if (originalReadReplicaEnabled === undefined) delete process.env.READ_REPLICA_ENABLED;
    else process.env.READ_REPLICA_ENABLED = originalReadReplicaEnabled;
    if (originalQueryCountEnabled === undefined) delete process.env.PRISMA_QUERY_COUNT_ENABLED;
    else process.env.PRISMA_QUERY_COUNT_ENABLED = originalQueryCountEnabled;
  });

  it('returns the primary Prisma proxy for reads when the replica is disabled', () => {
    process.env.READ_REPLICA_ENABLED = 'false';
    process.env.PRISMA_QUERY_COUNT_ENABLED = 'false';

    const service = new ProductsPrismaService();

    expect(typeof service.readClient.product.findMany).toBe('function');
  });
});
