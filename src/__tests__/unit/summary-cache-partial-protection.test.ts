const ingestFinancialData = jest.fn();
const upsertFinancialSnapshot = jest.fn();
const getLatestFinancialSnapshot = jest.fn();
const saveHistoricalSnapshot = jest.fn();

jest.mock('../../services/financial-ingestion', () => ({ ingestFinancialData }));
jest.mock('../../services/financial-snapshot-persistence', () => ({
  upsertFinancialSnapshot,
  getLatestFinancialSnapshot,
}));
jest.mock('../../services/transaction-summary-service', () => ({
  buildTransactionSummary: jest.fn(() => ({ windowedTransactions: [], transactionsSummary: {} })),
}));
jest.mock('../../services/finances-overview-service', () => ({
  buildAccountDisplayBalances: jest.fn(() => []),
}));
jest.mock('../../services/financial-calculations', () => ({
  extractWindowedInvestmentActivities: jest.fn(() => []),
}));
jest.mock('../../services/financial-history-service', () => ({
  FinancialHistoryService: { saveHistoricalSnapshot },
}));
jest.mock('../../prisma-client', () => ({
  getPrismaClient: jest.fn(() => ({ user: { findMany: jest.fn() } })),
}));

import { SummaryCacheService } from '../../services/summary-cache-service';

function partialProviderData() {
  return {
    accounts: [{
      account_id: 'checking-1',
      type: 'depository',
      subtype: 'checking',
      balance: { current: 1_000, iso_currency_code: 'USD' },
      snapshotTimestamp: new Date().toISOString(),
    }],
    bankingTransactions: [],
    investments: { holdings: [], securities: [], transactions: [] },
    homeValue: null,
    metadata: {
      partialData: true,
      errors: {
        plaid: [{ tokenId: 'token-1', error: 'Plaid unavailable' }],
        snaptrade: [],
        homeValue: null,
      },
    },
  };
}

describe('SummaryCacheService partial-provider protection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    ingestFinancialData.mockResolvedValue(partialProviderData());
  });

  it('retains a usable prior snapshot instead of publishing disappearing assets', async () => {
    getLatestFinancialSnapshot.mockResolvedValue({
      status: 'current',
      computedAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
      financialOverview: { netWorth: 1 },
    });

    await expect(SummaryCacheService.computeForUser('user-1')).resolves.toMatchObject({
      status: 'current',
      financialOverview: { netWorth: 1 },
    });

    expect(upsertFinancialSnapshot).not.toHaveBeenCalled();
    expect(saveHistoricalSnapshot).not.toHaveBeenCalled();
  });

  it('flags a retained snapshot so callers cannot read its status as a fresh refresh', async () => {
    // The retained revision can be 'current' or 'stale'. Either way the status describes
    // the run that produced it, not this one, so the fallback needs its own signal.
    getLatestFinancialSnapshot.mockResolvedValue({
      status: 'stale',
      computedAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
      financialOverview: { netWorth: 1 },
    });

    await expect(SummaryCacheService.computeForUser('user-1')).resolves.toMatchObject({
      status: 'stale',
      retainedPriorRevision: true,
    });
  });

  it('does not flag a revision it actually published', async () => {
    getLatestFinancialSnapshot.mockResolvedValue(null);

    const result = await SummaryCacheService.computeForUser('user-1');

    expect((result as Record<string, unknown>).retainedPriorRevision).toBeUndefined();
  });

  it('retains the full snapshot view so callers still receive account detail', async () => {
    getLatestFinancialSnapshot.mockResolvedValue({
      status: 'current',
      computedAt: new Date(),
      accounts: [{ account_id: 'checking-1' }],
    });

    await SummaryCacheService.computeForUser('user-1');

    expect(getLatestFinancialSnapshot).toHaveBeenCalledWith('user-1', 'full');
  });

  it('stops retaining once the prior snapshot outlives the protection window', async () => {
    // A connection stuck in ITEM_LOGIN_REQUIRED keeps partialData true until the
    // user re-authenticates. Retaining forever would keep serving week-old
    // figures under the stored 'current' status.
    getLatestFinancialSnapshot.mockResolvedValue({
      status: 'current',
      computedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
      financialOverview: { netWorth: 1 },
    });

    await expect(SummaryCacheService.computeForUser('user-1')).resolves.toMatchObject({
      status: 'partial',
    });

    expect(upsertFinancialSnapshot).toHaveBeenCalledTimes(1);
  });

  it('allows a first partial snapshot so available sources remain visible', async () => {
    getLatestFinancialSnapshot.mockResolvedValue(null);

    await expect(SummaryCacheService.computeForUser('user-1')).resolves.toMatchObject({
      status: 'partial',
    });

    expect(upsertFinancialSnapshot).toHaveBeenCalledTimes(1);
  });
});
