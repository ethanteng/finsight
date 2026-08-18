import { Prisma } from '@prisma/client';
import { getPrismaClient } from '../../prisma-client';
import {
  acquireScheduledRefreshLease,
  completeScheduledRefreshLease,
  failScheduledRefreshLease,
  releaseScheduledRefreshLease,
} from '../../market-news/refresh-lease';

jest.mock('../../prisma-client', () => ({ getPrismaClient: jest.fn() }));

const mockedGetPrismaClient = getPrismaClient as jest.MockedFunction<typeof getPrismaClient>;

function prismaMock() {
  return {
    scheduledJobLease: {
      updateMany: jest.fn(),
      create: jest.fn(),
      findUnique: jest.fn(),
    },
  };
}

describe('scheduled market-news refresh lease', () => {
  beforeEach(() => jest.clearAllMocks());

  it('atomically acquires an expired due lease', async () => {
    const prisma = prismaMock();
    prisma.scheduledJobLease.updateMany.mockResolvedValue({ count: 1 });
    mockedGetPrismaClient.mockReturnValue(prisma as any);

    const result = await acquireScheduledRefreshLease({
      name: 'market-news-refresh',
      minimumIntervalMs: 60_000,
      leaseDurationMs: 30_000,
    });

    expect(result.acquired).toBe(true);
    expect(prisma.scheduledJobLease.create).not.toHaveBeenCalled();
    expect(prisma.scheduledJobLease.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ name: 'market-news-refresh', leaseUntil: expect.any(Object) }),
      data: expect.objectContaining({ ownerId: expect.any(String), lastStartedAt: expect.any(Date) }),
    }));
  });

  it('does not overlap an active lease held by another instance', async () => {
    const prisma = prismaMock();
    prisma.scheduledJobLease.updateMany.mockResolvedValue({ count: 0 });
    prisma.scheduledJobLease.create.mockRejectedValue(new Prisma.PrismaClientKnownRequestError(
      'Unique constraint',
      { code: 'P2002', clientVersion: 'test' }
    ));
    prisma.scheduledJobLease.findUnique.mockResolvedValue({
      name: 'market-news-refresh',
      leaseUntil: new Date(Date.now() + 60_000),
    });
    mockedGetPrismaClient.mockReturnValue(prisma as any);

    await expect(acquireScheduledRefreshLease({
      name: 'market-news-refresh',
      minimumIntervalMs: 60_000,
      leaseDurationMs: 30_000,
      force: true,
    })).resolves.toMatchObject({ acquired: false, reason: 'active_lease' });
  });

  it('uses a distinct fencing token for every acquisition', async () => {
    const prisma = prismaMock();
    prisma.scheduledJobLease.updateMany.mockResolvedValue({ count: 1 });
    mockedGetPrismaClient.mockReturnValue(prisma as any);

    const options = {
      name: 'market-news-refresh',
      minimumIntervalMs: 60_000,
      leaseDurationMs: 30_000,
    };
    const first = await acquireScheduledRefreshLease(options);
    const second = await acquireScheduledRefreshLease(options);

    expect(first.acquired).toBe(true);
    expect(second.acquired).toBe(true);
    expect(first.ownerId).not.toBe(second.ownerId);
    expect(prisma.scheduledJobLease.updateMany.mock.calls[0][0].data.ownerId).toBe(first.ownerId);
    expect(prisma.scheduledJobLease.updateMany.mock.calls[1][0].data.ownerId).toBe(second.ownerId);
  });

  it('releases only the owner lease and records completion or failure', async () => {
    const prisma = prismaMock();
    prisma.scheduledJobLease.updateMany.mockResolvedValue({ count: 1 });
    mockedGetPrismaClient.mockReturnValue(prisma as any);

    await completeScheduledRefreshLease('market-news-refresh', 'owner-1');
    await failScheduledRefreshLease('market-news-refresh', 'owner-2', new Error('provider unavailable'));

    expect(prisma.scheduledJobLease.updateMany).toHaveBeenNthCalledWith(1, {
      where: { name: 'market-news-refresh', ownerId: 'owner-1' },
      data: expect.objectContaining({ leaseUntil: expect.any(Date), lastCompletedAt: expect.any(Date), lastError: null }),
    });
    expect(prisma.scheduledJobLease.updateMany).toHaveBeenNthCalledWith(2, {
      where: { name: 'market-news-refresh', ownerId: 'owner-2' },
      data: expect.objectContaining({ leaseUntil: expect.any(Date), lastError: 'provider unavailable' }),
    });
  });

  it('releases a partial run without advancing lastCompletedAt', async () => {
    const prisma = prismaMock();
    prisma.scheduledJobLease.updateMany.mockResolvedValue({ count: 1 });
    mockedGetPrismaClient.mockReturnValue(prisma as any);

    await releaseScheduledRefreshLease('market-news-refresh', 'owner-partial');

    expect(prisma.scheduledJobLease.updateMany).toHaveBeenCalledWith({
      where: { name: 'market-news-refresh', ownerId: 'owner-partial' },
      data: {
        leaseUntil: expect.any(Date),
        lastError: null,
      },
    });
    const data = prisma.scheduledJobLease.updateMany.mock.calls[0][0].data;
    expect(data).not.toHaveProperty('lastCompletedAt');
  });
});
