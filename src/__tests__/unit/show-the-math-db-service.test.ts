import { getPrismaClient } from '../../prisma-client';
import { fetchShowTheMathDBData } from '../../openai/show-the-math-db-service';

jest.mock('../../prisma-client', () => ({
  getPrismaClient: jest.fn(),
}));

const mockedGetPrismaClient = getPrismaClient as jest.MockedFunction<typeof getPrismaClient>;

describe('fetchShowTheMathDBData', () => {
  beforeEach(() => jest.clearAllMocks());

  it('captures the exact analysis projection without another database read for simple questions', async () => {
    const snapshot = {
      accounts: [],
      bankingTransactions: [],
      metadata: { lastUpdated: new Date('2026-08-14T00:00:00.000Z'), dataSources: {}, errors: [] },
      tierContext: { tierInfo: { currentTier: 'starter', availableSources: [] }, upgradeHints: [] },
      contextSelection: {
        accountsIncluded: false,
        transactionDetailsIncluded: false,
        investmentDetailsIncluded: false,
        marketContextRequested: false,
        searchContextRequested: false,
      },
      financialSummary: {
        financialOverview: {
          netWorth: 100,
          totalCash: 100,
          totalInvestments: 0,
          totalDebt: 0,
          homeValue: null,
        },
      },
    } as any;

    const result = await fetchShowTheMathDBData('user-1', snapshot);

    expect(mockedGetPrismaClient).not.toHaveBeenCalled();
    expect(result.analysis_context_snapshot).toMatchObject({
      financialSummary: { financialOverview: { netWorth: 100 } },
    });
  });
});
