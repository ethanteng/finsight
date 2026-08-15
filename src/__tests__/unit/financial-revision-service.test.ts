import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const invalidate = jest.fn<(..._args: any[]) => Promise<void>>();
const computeForUser = jest.fn<(..._args: any[]) => Promise<any>>();
const getLatestFinancialSnapshot = jest.fn<(..._args: any[]) => Promise<any>>();

jest.mock('../../data/cache', () => ({ cacheService: { invalidate } }));
jest.mock('../../services/summary-cache-service', () => ({
  SummaryCacheService: { computeForUser },
}));
jest.mock('../../services/financial-snapshot-persistence', () => ({
  getLatestFinancialSnapshot,
}));

import { FinancialRevisionService } from '../../services/financial-revision-service';

describe('FinancialRevisionService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    invalidate.mockResolvedValue(undefined);
    computeForUser.mockResolvedValue({ computedAt: new Date() });
  });

  it('invalidates source data before producing a revision', async () => {
    await FinancialRevisionService.recompute('user-1', {
      categorize: false,
      history: { kind: 'none' },
    });

    expect(invalidate).toHaveBeenCalledWith('financial-data:user-1');
    expect(invalidate.mock.invocationCallOrder[0]).toBeLessThan(computeForUser.mock.invocationCallOrder[0]);
    expect(computeForUser).toHaveBeenCalledWith('user-1', {
      categorize: false,
      history: { kind: 'none' },
    });
  });

  it('reuses a current revision inside the requested age window', async () => {
    const snapshot = { status: 'current', computedAt: new Date() };
    getLatestFinancialSnapshot.mockResolvedValue(snapshot);

    await expect(
      FinancialRevisionService.recomputeIfStale('user-1', 60_000, { categorize: false })
    ).resolves.toBe(snapshot);

    expect(computeForUser).not.toHaveBeenCalled();
  });

  it('recomputes stale revisions through the same invalidation boundary', async () => {
    getLatestFinancialSnapshot.mockResolvedValue({
      status: 'stale',
      computedAt: new Date(),
    });

    await FinancialRevisionService.recomputeIfStale('user-1', 60_000, { categorize: false });

    expect(invalidate).toHaveBeenCalledWith('financial-data:user-1');
    expect(computeForUser).toHaveBeenCalledWith('user-1', { categorize: false });
  });
});
