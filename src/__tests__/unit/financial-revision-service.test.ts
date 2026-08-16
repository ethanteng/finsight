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

  describe('schedule', () => {
    it('runs the revision in the background instead of blocking the caller', async () => {
      FinancialRevisionService.schedule('user-1', { categorize: false }, 'test');

      expect(computeForUser).not.toHaveBeenCalled();

      await FinancialRevisionService.whenIdle('user-1');
      await new Promise(resolve => setImmediate(resolve));
      await FinancialRevisionService.whenIdle('user-1');

      expect(computeForUser).toHaveBeenCalledWith('user-1', { categorize: false });
    });

    it('collapses bursts for one user into a single follow-up run', async () => {
      let release: () => void = () => {};
      computeForUser.mockImplementationOnce(
        () => new Promise(resolve => {
          release = () => resolve({ computedAt: new Date() });
        })
      );

      FinancialRevisionService.schedule('user-1', { history: { kind: 'none' } }, 'first');
      await new Promise(resolve => setImmediate(resolve));

      FinancialRevisionService.schedule('user-1', { history: { kind: 'none' } }, 'second');
      FinancialRevisionService.schedule('user-1', { history: { kind: 'material', reason: 'manual-account-deleted' } }, 'third');

      expect(computeForUser).toHaveBeenCalledTimes(1);

      release();
      await FinancialRevisionService.whenIdle('user-1');

      // The two requests made while the first run was in flight coalesce into one rerun,
      // carrying the most recent intent.
      expect(computeForUser).toHaveBeenCalledTimes(2);
      expect(computeForUser).toHaveBeenLastCalledWith('user-1', {
        history: { kind: 'material', reason: 'manual-account-deleted' },
      });
    });

    it('keeps the strongest queued history intent when collapsing a burst', async () => {
      let release: () => void = () => {};
      computeForUser.mockImplementationOnce(
        () => new Promise(resolve => {
          release = () => resolve({ computedAt: new Date() });
        })
      );

      FinancialRevisionService.schedule('user-1', { history: { kind: 'none' } }, 'first');
      await new Promise(resolve => setImmediate(resolve));

      // A material balance-sheet change queues behind the running revision...
      FinancialRevisionService.schedule(
        'user-1',
        { history: { kind: 'material', reason: 'manual-account-updated' } },
        'material'
      );
      // ...and a later rename must not downgrade it out of financial history.
      FinancialRevisionService.schedule('user-1', { history: { kind: 'none' } }, 'rename');

      release();
      await FinancialRevisionService.whenIdle('user-1');

      expect(computeForUser).toHaveBeenLastCalledWith('user-1', {
        history: { kind: 'material', reason: 'manual-account-updated' },
      });
    });

    it('reports a revision as pending from the moment it is scheduled until nothing is left', async () => {
      let release: () => void = () => {};
      computeForUser.mockImplementationOnce(
        () => new Promise(resolve => {
          release = () => resolve({ computedAt: new Date() });
        })
      );

      expect(FinancialRevisionService.isPending('user-1')).toBe(false);

      // Pending before the deferred dispatch even runs, so an overview request served in
      // between still learns that newer numbers are coming.
      FinancialRevisionService.schedule('user-1', { history: { kind: 'none' } }, 'first');
      expect(FinancialRevisionService.isPending('user-1')).toBe(true);

      await new Promise(resolve => setImmediate(resolve));
      expect(FinancialRevisionService.isPending('user-1')).toBe(true);

      // Still pending across the handoff to the queued follow-up run.
      FinancialRevisionService.schedule('user-1', { history: { kind: 'none' } }, 'second');
      release();
      await FinancialRevisionService.whenIdle('user-1');

      expect(computeForUser).toHaveBeenCalledTimes(2);
      expect(FinancialRevisionService.isPending('user-1')).toBe(false);
    });

    it('keeps a failed background revision from rejecting into the request path', async () => {
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
      computeForUser.mockRejectedValueOnce(new Error('provider unavailable'));

      FinancialRevisionService.schedule('user-1', { categorize: false }, 'failing');
      await new Promise(resolve => setImmediate(resolve));
      await FinancialRevisionService.whenIdle('user-1');

      expect(warn).toHaveBeenCalledWith(
        'failing: financial revision refresh failed',
        expect.any(Error)
      );
      warn.mockRestore();
    });
  });
});
