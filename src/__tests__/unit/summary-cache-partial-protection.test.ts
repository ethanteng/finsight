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
    getLatestFinancialSnapshot.mockResolvedValue({ status: 'current', financialOverview: { netWorth: 1 } });

    await expect(SummaryCacheService.computeForUser('user-1')).resolves.toMatchObject({
      status: 'current',
      financialOverview: { netWorth: 1 },
    });

    expect(upsertFinancialSnapshot).not.toHaveBeenCalled();
    expect(saveHistoricalSnapshot).not.toHaveBeenCalled();
  });

  it('allows a first partial snapshot so available sources remain visible', async () => {
    getLatestFinancialSnapshot.mockResolvedValue(null);

    await expect(SummaryCacheService.computeForUser('user-1')).resolves.toMatchObject({
      status: 'partial',
    });

    expect(upsertFinancialSnapshot).toHaveBeenCalledTimes(1);
  });
});
