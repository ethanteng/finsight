import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockUserFindUnique = jest.fn();
const mockFindUnique = jest.fn();
const mockFindFirst = jest.fn();
const mockFindMany = jest.fn();
const mockUpsert = jest.fn();
const mockCreate = jest.fn();

jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn(() => ({
    user: { findUnique: mockUserFindUnique },
    financialSummaryHistory: {
      findUnique: mockFindUnique,
      findFirst: mockFindFirst,
      findMany: mockFindMany,
      upsert: mockUpsert,
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
    mockUpsert.mockResolvedValue({ id: 'daily-1' } as never);
    mockCreate.mockResolvedValue({ id: 'material-1' } as never);
  });

  it('upserts one daily observation using the user calendar date', async () => {
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
    expect(mockUpsert).toHaveBeenCalledWith({
      where: { dailyKey: 'user-1:2026-08-14' },
      create: data,
      update: data,
    });
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('does not rewrite an identical daily observation', async () => {
    mockFindUnique.mockResolvedValue(canonicalValues as never);

    await FinancialHistoryService.saveHistoricalSnapshot('user-1', snapshot);

    expect(mockUpsert).not.toHaveBeenCalled();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('records a changed material observation with its reason and updates the daily point', async () => {
    mockFindFirst.mockResolvedValue({ ...canonicalValues, netWorth: 20 } as never);

    await FinancialHistoryService.saveHistoricalSnapshot('user-1', snapshot, {
      kind: 'material',
      reason: 'manual-account-created',
    });

    expect(mockUpsert).toHaveBeenCalledTimes(1);
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

    expect(mockUpsert).not.toHaveBeenCalled();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('updates daily provenance without treating freshness alone as a material change', async () => {
    mockFindUnique.mockResolvedValue({ ...canonicalValues, asOf: new Date(0) } as never);
    mockFindFirst.mockResolvedValue({ ...canonicalValues, asOf: new Date(0) } as never);

    await FinancialHistoryService.saveHistoricalSnapshot('user-1', snapshot, {
      kind: 'material',
      reason: 'account-sync',
    });

    expect(mockUpsert).toHaveBeenCalledTimes(1);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('skips history entirely for non-financial mutations such as renames', async () => {
    await FinancialHistoryService.saveHistoricalSnapshot('user-1', snapshot, { kind: 'none' });

    expect(mockUserFindUnique).not.toHaveBeenCalled();
    expect(mockFindUnique).not.toHaveBeenCalled();
    expect(mockUpsert).not.toHaveBeenCalled();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('does not create a material observation when there is no prior snapshot', async () => {
    mockFindFirst.mockResolvedValue(null as never);

    await FinancialHistoryService.saveHistoricalSnapshot('user-1', snapshot, {
      kind: 'material',
      reason: 'account-sync',
    });

    expect(mockUpsert).toHaveBeenCalledTimes(1);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('returns only daily observations by default', async () => {
    mockFindMany.mockResolvedValue([] as never);

    await FinancialHistoryService.getHistoricalSnapshots('user-1');

    expect(mockFindMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', observationKind: 'daily' },
      orderBy: { computedAt: 'desc' },
      take: undefined,
    });
  });
});
