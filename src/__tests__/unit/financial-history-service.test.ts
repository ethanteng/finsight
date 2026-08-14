import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockFindFirst = jest.fn();
const mockCreate = jest.fn();

jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn(() => ({
    financialSummaryHistory: {
      findFirst: mockFindFirst,
      create: mockCreate,
    },
  })),
}));

import { FinancialHistoryService } from '../../services/financial-history-service';

const computedAt = new Date('2026-08-14T12:00:00.000Z');
const asOf = new Date('2026-08-14T09:00:00.000Z');
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

describe('FinancialHistoryService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('copies canonical values and timestamps exactly into history', async () => {
    mockFindFirst.mockResolvedValue(null as never);
    mockCreate.mockResolvedValue({ id: 'history-1' } as never);

    await FinancialHistoryService.saveHistoricalSnapshot('user-1', snapshot);

    expect(mockCreate).toHaveBeenCalledWith({
      data: {
        userId: 'user-1',
        computedAt,
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
      },
    });
  });

  it('does not create duplicate history when source time, quality, and values are unchanged', async () => {
    mockFindFirst.mockResolvedValue({
      ...snapshot.financialOverview,
      asOf,
      status: 'current',
      reportingCurrency: 'USD',
    } as never);

    await FinancialHistoryService.saveHistoricalSnapshot('user-1', snapshot);

    expect(mockCreate).not.toHaveBeenCalled();
  });
});
