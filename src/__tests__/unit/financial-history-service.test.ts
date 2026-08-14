import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockUserFindUnique = jest.fn();
const mockFindUnique = jest.fn();
const mockFindFirst = jest.fn();
const mockFindMany = jest.fn();
const mockUpdateMany = jest.fn();
const mockCreate = jest.fn();

jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn(() => ({
    user: { findUnique: mockUserFindUnique },
    financialSummaryHistory: {
      findUnique: mockFindUnique,
      findFirst: mockFindFirst,
      findMany: mockFindMany,
      updateMany: mockUpdateMany,
      create: mockCreate,
    },
  })),
}));

import { FinancialHistoryService } from '../../services/financial-history-service';

const computedAt = new Date('2026-08-15T06:30:00.000Z');
const asOf = new Date('2026-08-15T05:00:00.000Z');
const snapshot = {
  computedAt,
  asOf,
  status: 'current' as const,
  reportingCurrency: 'USD',
  financialOverview: {
    reportingCurrency: 'USD',
    totalCash: 10,
    totalInvestments: 20,
    homeValue: null,
    otherAssets: 0,
    totalAssets: 30,
    totalDebt: 5,
    otherLiabilities: 0,
    totalLiabilities: 5,
    netWorth: 25,
  },
};

const canonicalValues = {
  asOf,
  status: 'current',
  reportingCurrency: 'USD',
  netWorth: 25,
  totalCash: 10,
  totalInvestments: 20,
  totalDebt: 5,
  homeValue: null,
  totalAssets: 30,
  totalLiabilities: 5,
};

describe('FinancialHistoryService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUserFindUnique.mockResolvedValue({ timeZone: 'America/Los_Angeles' } as never);
    mockFindUnique.mockResolvedValue(null as never);
    mockFindFirst.mockResolvedValue(null as never);
    mockUpdateMany.mockResolvedValue({ count: 1 } as never);
    mockCreate.mockResolvedValue({ id: 'material-1' } as never);
  });

  it('creates one daily observation using the user calendar date', async () => {
    await FinancialHistoryService.saveHistoricalSnapshot('user-1', snapshot);

    const data = {
      userId: 'user-1',
      computedAt,
      ...canonicalValues,
      observationDate: new Date('2026-08-14T00:00:00.000Z'),
      observationKind: 'daily',
      observationReason: null,
      timeZone: 'America/Los_Angeles',
      dailyKey: 'user-1:2026-08-14',
    };
    expect(mockCreate).toHaveBeenCalledWith({ data });
    expect(mockUpdateMany).not.toHaveBeenCalled();
  });

  it('does not rewrite an identical daily observation', async () => {
    mockFindUnique.mockResolvedValue(canonicalValues as never);

    await FinancialHistoryService.saveHistoricalSnapshot('user-1', snapshot);

    expect(mockUpdateMany).not.toHaveBeenCalled();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('records a changed material observation with its reason and updates the daily point', async () => {
    mockFindFirst.mockResolvedValue({ ...canonicalValues, netWorth: 20 } as never);

    await FinancialHistoryService.saveHistoricalSnapshot('user-1', snapshot, {
      kind: 'material',
      reason: 'manual-account-created',
    });

    expect(mockCreate).toHaveBeenCalledTimes(2);
    expect(mockCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'user-1',
        observationKind: 'material',
        observationReason: 'manual-account-created',
        dailyKey: null,
        netWorth: 25,
      }),
    });
  });

  it('does not create a material event when canonical values did not change', async () => {
    mockFindUnique.mockResolvedValue(canonicalValues as never);
    mockFindFirst.mockResolvedValue(canonicalValues as never);

    await FinancialHistoryService.saveHistoricalSnapshot('user-1', snapshot, {
      kind: 'material',
      reason: 'user-refresh',
    });

    expect(mockUpdateMany).not.toHaveBeenCalled();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('updates daily provenance without treating freshness alone as a material change', async () => {
    mockFindUnique.mockResolvedValue({ ...canonicalValues, asOf: new Date(0) } as never);
    mockFindFirst.mockResolvedValue({ ...canonicalValues, asOf: new Date(0) } as never);

    await FinancialHistoryService.saveHistoricalSnapshot('user-1', snapshot, {
      kind: 'material',
      reason: 'account-sync',
    });

    expect(mockUpdateMany).toHaveBeenCalledWith({
      where: {
        dailyKey: 'user-1:2026-08-14',
        computedAt: { lte: computedAt },
      },
      data: expect.objectContaining({ observationKind: 'daily' }),
    });
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('skips history entirely for non-financial mutations such as renames', async () => {
    await FinancialHistoryService.saveHistoricalSnapshot('user-1', snapshot, { kind: 'none' });

    expect(mockUserFindUnique).not.toHaveBeenCalled();
    expect(mockFindUnique).not.toHaveBeenCalled();
    expect(mockUpdateMany).not.toHaveBeenCalled();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('does not create a material observation when there is no prior snapshot', async () => {
    mockFindFirst.mockResolvedValue(null as never);

    await FinancialHistoryService.saveHistoricalSnapshot('user-1', snapshot, {
      kind: 'material',
      reason: 'account-sync',
    });

    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(mockCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ observationKind: 'daily' }),
    });
  });

  it('does not let an older computation replace a newer daily observation', async () => {
    mockFindUnique.mockResolvedValue({
      ...canonicalValues,
      computedAt: new Date('2026-08-15T06:45:00.000Z'),
      netWorth: 30,
    } as never);

    await FinancialHistoryService.saveHistoricalSnapshot('user-1', snapshot);

    expect(mockUpdateMany).not.toHaveBeenCalled();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('conditionally updates after another computation wins the daily create race', async () => {
    mockCreate.mockRejectedValueOnce({ code: 'P2002' } as never);

    await FinancialHistoryService.saveHistoricalSnapshot('user-1', snapshot);

    expect(mockUpdateMany).toHaveBeenCalledWith({
      where: {
        dailyKey: 'user-1:2026-08-14',
        computedAt: { lte: computedAt },
      },
      data: expect.objectContaining({ observationKind: 'daily' }),
    });
  });

  it('returns only daily observations by default', async () => {
    mockFindMany.mockResolvedValue([] as never);

    await FinancialHistoryService.getHistoricalSnapshots('user-1');

    expect(mockFindMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', observationKind: 'daily' },
      orderBy: [
        { observationDate: 'desc' },
        { computedAt: 'desc' },
      ],
      take: undefined,
    });
  });

  it('filters calendar ranges by observationDate', async () => {
    mockFindMany.mockResolvedValue([] as never);
    const startDate = new Date('2026-08-01T00:00:00.000Z');
    const endDate = new Date('2026-08-14T00:00:00.000Z');

    await FinancialHistoryService.getHistoricalSnapshots(
      'user-1',
      startDate,
      endDate,
      undefined,
      true
    );

    expect(mockFindMany).toHaveBeenCalledWith({
      where: {
        userId: 'user-1',
        observationKind: { in: ['daily', 'material'] },
        observationDate: { gte: startDate, lte: endDate },
      },
      orderBy: [
        { observationDate: 'desc' },
        { computedAt: 'desc' },
      ],
      take: undefined,
    });
  });
});
