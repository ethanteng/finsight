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
    // The brokerage account is in the prior revision and absent from this
    // partial fetch: publishing would take it off the page and out of net
    // worth. Coverage loss is what retention is for.
    getLatestFinancialSnapshot.mockResolvedValue({
      status: 'current',
      computedAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
      financialOverview: { netWorth: 1 },
      accounts: [{ account_id: 'checking-1' }, { account_id: 'brokerage-1' }],
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
      accounts: [{ account_id: 'checking-1' }, { account_id: 'brokerage-1' }],
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

  // Retention costs the user a whole refresh cycle, so it has to be earned by
  // an actual regression. A partial run that still describes every account --
  // the usual shape, because an erroring token keeps yielding last known
  // balances -- is strictly newer than the revision it replaces.
  it('publishes a partial revision that still covers every prior account', async () => {
    getLatestFinancialSnapshot.mockResolvedValue({
      status: 'current',
      computedAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
      financialOverview: { netWorth: 1 },
      accounts: [{ account_id: 'checking-1' }],
    });

    const result = await SummaryCacheService.computeForUser('user-1');

    expect(upsertFinancialSnapshot).toHaveBeenCalledTimes(1);
    expect((result as Record<string, unknown>).retainedPriorRevision).toBeUndefined();
  });

  // Accounts alone are not enough: a holdings fetch can fail while every
  // account row still arrives. Publishing would blank the portfolio.
  it('retains when prior holdings disappear from an otherwise complete account list', async () => {
    getLatestFinancialSnapshot.mockResolvedValue({
      status: 'current',
      computedAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
      financialOverview: { netWorth: 1 },
      accounts: [{ account_id: 'checking-1' }],
      holdings: [{
        id: 'checking-1_sec-1_1_100',
        account_id: 'checking-1',
        security_id: 'sec-1',
        institution_value: 100,
      }],
    });

    await expect(SummaryCacheService.computeForUser('user-1')).resolves.toMatchObject({
      status: 'current',
      retainedPriorRevision: true,
    });

    expect(upsertFinancialSnapshot).not.toHaveBeenCalled();
  });

  it('keeps the provider error attached to a published partial revision', async () => {
    // Invariant 5 of the financial truth contract: a successful cache write
    // never erases provider errors. Publishing instead of retaining must not
    // quietly drop the reason the revision was partial.
    getLatestFinancialSnapshot.mockResolvedValue({
      status: 'current',
      computedAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
      accounts: [{ account_id: 'checking-1' }],
    });

    await SummaryCacheService.computeForUser('user-1');

    const written = upsertFinancialSnapshot.mock.calls[0][1] as any;
    expect(written.status).toBe('partial');
    expect(JSON.stringify(written.sourceObservations)).toContain('Plaid unavailable');
  });
});
