import { describe, expect, beforeEach, it, jest } from '@jest/globals';

jest.mock('../../prisma-client', () => {
  const mockPrisma = {
    snapTradeUser: { findUnique: jest.fn() },
    snapTradeActivity: {
      findUnique: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
    },
  };
  return {
    getPrismaClient: () => mockPrisma,
    __mockPrisma: mockPrisma,
  };
});

const { __mockPrisma: mockPrisma } = jest.requireMock('../../prisma-client') as {
  __mockPrisma: {
    snapTradeUser: { findUnique: jest.Mock };
    snapTradeActivity: { findUnique: jest.Mock; update: jest.Mock; create: jest.Mock };
  };
};

import { persistSnapTradeActivitiesToDb } from '../../data/persistence';

/** The account-scoped key the current code writes for a provider-less activity. */
const SCOPED_ID = 'brokerage-1_XYZ_2026-08-15_BUY_2';

describe('SnapTrade activity legacy-key migration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (mockPrisma.snapTradeUser.findUnique as any).mockResolvedValue({ id: 'snaptrade-user-1' });
    (mockPrisma.snapTradeActivity.create as any).mockResolvedValue({});
    (mockPrisma.snapTradeActivity.update as any).mockResolvedValue({});
  });

  const activity = (overrides: Record<string, unknown> = {}) => ({
    account_id: 'brokerage-1',
    type: 'BUY',
    units: 2,
    price: 125,
    amount: -250,
    trade_date: '2026-08-15',
    symbol: { symbol: { symbol: 'XYZ' } },
    ...overrides,
  });

  it('migrates the row written under the caller-synthesized legacy key', async () => {
    const legacyKey = '2026-08-15-security-2-BUY-2';
    (mockPrisma.snapTradeActivity.findUnique as any).mockImplementation(async (args: any) =>
      args.where.activityId === legacyKey
        ? { id: 'row-1', activityId: legacyKey, snapTradeUserId: 'snaptrade-user-1' }
        : null,
    );

    await persistSnapTradeActivitiesToDb('user-1', [
      activity({ activityId: SCOPED_ID, legacyActivityId: legacyKey }),
    ]);

    expect(mockPrisma.snapTradeActivity.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { activityId: legacyKey },
        data: { activityId: SCOPED_ID },
      }),
    );
    // Migrated, so the sync must not insert a second row beside the legacy one.
    expect(mockPrisma.snapTradeActivity.create).not.toHaveBeenCalled();
  });

  it("migrates the row written under this function's own unscoped fallback key", async () => {
    const legacyFallback = 'XYZ_2026-08-15_BUY_2';
    (mockPrisma.snapTradeActivity.findUnique as any).mockImplementation(async (args: any) =>
      args.where.activityId === legacyFallback
        ? { id: 'row-2', activityId: legacyFallback, snapTradeUserId: 'snaptrade-user-1' }
        : null,
    );

    // No activityId, snapTradeData.activity_id, or id: persistence synthesizes
    // the key itself, and older rows carry the pre-scoping shape.
    await persistSnapTradeActivitiesToDb('user-1', [activity()]);

    expect(mockPrisma.snapTradeActivity.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { activityId: legacyFallback },
        data: { activityId: SCOPED_ID },
      }),
    );
    expect(mockPrisma.snapTradeActivity.create).not.toHaveBeenCalled();
  });

  it('never reparents a legacy row owned by a different SnapTrade user', async () => {
    const legacyFallback = 'XYZ_2026-08-15_BUY_2';
    (mockPrisma.snapTradeActivity.findUnique as any).mockImplementation(async (args: any) =>
      args.where.activityId === legacyFallback
        ? { id: 'row-3', activityId: legacyFallback, snapTradeUserId: 'someone-else' }
        : null,
    );

    await persistSnapTradeActivitiesToDb('user-1', [activity()]);

    expect(mockPrisma.snapTradeActivity.update).not.toHaveBeenCalled();
    expect(mockPrisma.snapTradeActivity.create).toHaveBeenCalled();
  });

  it('does not look for a legacy row when SnapTrade supplied a provider ID', async () => {
    (mockPrisma.snapTradeActivity.findUnique as any).mockResolvedValue(null);

    await persistSnapTradeActivitiesToDb('user-1', [activity({ activityId: 'provider-uuid' })]);

    const lookups = (mockPrisma.snapTradeActivity.findUnique as any).mock.calls
      .map(([args]: any[]) => args.where.activityId);
    expect(lookups).toEqual(['provider-uuid']);
    expect(mockPrisma.snapTradeActivity.update).not.toHaveBeenCalled();
  });
});
