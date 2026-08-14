import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const getLatestSnapshot = jest.fn();
const computeForUser = jest.fn();

jest.mock('../../services/summary-cache-service', () => ({
  SummaryCacheService: {
    getLatestSnapshot,
    computeForUser,
  },
}));

import { FinancialSummaryService } from '../../services/financial-summary-service';

const currentSnapshot = (overrides: Record<string, unknown> = {}) => ({
  computedAt: new Date(),
  asOf: new Date(),
  status: 'current',
  reportingCurrency: 'USD',
  financialOverview: {
    reportingCurrency: 'USD',
    netWorth: 90_000,
    totalCash: 50_000,
    totalInvestments: 40_000,
    totalDebt: 0,
    homeValue: null,
    totalAssets: 90_000,
    totalLiabilities: 0,
  },
  investmentPortfolio: {
    reportingCurrency: 'USD',
    totalValue: 40_000,
    holdingCount: 2,
    assetAllocation: [],
    securityCount: 2,
  },
  ...overrides,
});

describe('FinancialSummaryService compatibility facade', () => {
  let service: FinancialSummaryService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new FinancialSummaryService();
  });

  it('returns a current canonical snapshot without starting a second computation', async () => {
    getLatestSnapshot.mockResolvedValue(currentSnapshot() as never);

    const result = await service.getUserSummary('user-1');

    expect(result.financialOverview.netWorth).toBe(90_000);
    expect(result.status).toBe('current');
    expect(computeForUser).not.toHaveBeenCalled();
  });

  it('returns a stale snapshot immediately and refreshes through SummaryCacheService', async () => {
    getLatestSnapshot.mockResolvedValue(currentSnapshot({ status: 'stale' }) as never);
    computeForUser.mockResolvedValue(currentSnapshot() as never);

    const result = await service.getUserSummary('user-1');
    expect(result.status).toBe('stale');

    await new Promise(resolve => setImmediate(resolve));
    expect(computeForUser).toHaveBeenCalledWith('user-1', { categorize: false });
  });

  it('computes synchronously when no canonical snapshot exists', async () => {
    getLatestSnapshot.mockResolvedValueOnce(null as never);
    computeForUser.mockResolvedValue(currentSnapshot() as never);

    const result = await service.getUserSummary('user-1');

    expect(result.financialOverview.totalCash).toBe(50_000);
    expect(computeForUser).toHaveBeenCalledTimes(1);
  });

  it('falls back to the latest snapshot when a refresh fails', async () => {
    computeForUser.mockRejectedValue(new Error('provider unavailable') as never);
    getLatestSnapshot.mockResolvedValue(
      currentSnapshot({ status: 'partial', computedAt: new Date('2026-08-12T00:00:00Z') }) as never
    );

    const result = await service.refreshUserSummary('user-1');

    expect(result.status).toBe('partial');
    expect(result.lastUpdated).toEqual(new Date('2026-08-12T00:00:00Z'));
  });

  it('throws when refresh fails and there is no persisted snapshot', async () => {
    computeForUser.mockRejectedValue(new Error('provider unavailable') as never);
    getLatestSnapshot.mockResolvedValue(null as never);

    await expect(service.refreshUserSummary('user-1')).rejects.toThrow(
      'Failed to refresh summary and no cached data is available: provider unavailable'
    );
  });
});
