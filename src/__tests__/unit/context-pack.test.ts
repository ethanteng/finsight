import { buildQuestionContextPack } from '../../openai/context-pack';
import { buildCanonicalFactPack } from '../../openai/canonical-facts';
import { questionNeedsFromPacks } from '../../openai/context-packs';

const snapshot = {
  accounts: [{ id: 'a', name: 'Checking', type: 'depository', balance: 100 }],
  bankingTransactions: [{ id: 't', name: 'Coffee', amount: 5, date: '2026-08-14', typeLabel: '(EXPENSE)' }],
  metadata: { lastUpdated: new Date(), dataSources: {}, errors: [] },
  tierContext: { tierInfo: { currentTier: 'starter', availableSources: [] }, upgradeHints: [] },
  financialSummary: {
    reportingCurrency: 'USD',
    financialOverview: { netWorth: 100, totalCash: 100, totalInvestments: 0, totalDebt: 0, homeValue: null },
  },
} as any;

describe('buildQuestionContextPack', () => {
  it('omits account and transaction rows from a net-worth lookup', () => {
    const question = 'What is my net worth?';
    const needs = questionNeedsFromPacks([], false);
    const pack = buildQuestionContextPack(snapshot, needs, buildCanonicalFactPack(snapshot, question, needs));
    expect(pack.details).toEqual({});
    expect(JSON.stringify(pack)).not.toContain('Coffee');
    expect(JSON.stringify(pack)).not.toContain('Checking');
  });

  it('includes only requested transaction details', () => {
    const question = 'Show my recent transactions.';
    const needs = questionNeedsFromPacks(['transaction_details'], false);
    const pack = buildQuestionContextPack(snapshot, needs, buildCanonicalFactPack(snapshot, question, needs));
    expect(pack.details.recentTransactions).toEqual(snapshot.bankingTransactions);
    expect(pack.details.accounts).toBeUndefined();
  });

  it('publishes compact scenario evidence by registered calculator id', () => {
    const question = 'Compare my retirement scenarios.';
    const needs = questionNeedsFromPacks(['retirement_analysis'], true);
    const scenarioSnapshot = {
      ...snapshot,
      scenarioExecutions: {
        retirement: {
          version: 2,
          calculator: 'retirement',
          status: 'unavailable',
          computedAt: '2026-08-17T00:00:00.000Z',
          durationMs: 2,
          reason: 'Missing baseline.',
        },
      },
    } as any;
    const pack = buildQuestionContextPack(
      scenarioSnapshot,
      needs,
      buildCanonicalFactPack(scenarioSnapshot, question, needs)
    );
    expect(pack.details.scenarios).toMatchObject({
      retirement: { status: 'unavailable', reason: 'Missing baseline.' },
    });
  });

  it('keeps aggregate exposure but only includes per-fund vectors for a named security', () => {
    const investmentSnapshot = {
      ...snapshot,
      investments: {
        totalValue: 100,
        holdingCount: 1,
        summaryLines: ['- SPY: $100.00'],
        holdings: [],
        securities: [],
        externalData: {
          asOf: '2026-08-18T15:00:00Z',
          sources: ['fmp', 'tiingo'],
          portfolioExposure: {
            countryAllocations: [{ name: 'United States', percentage: 98 }],
            sectorAllocations: [{ name: 'Technology', percentage: 35 }],
            countryCoverage: 1,
            sectorCoverage: 1,
            expenseRatioWeighted: 0.0009,
            expenseRatioCoverage: 1,
          },
          securities: [{
            ticker: 'SPY',
            countryAllocations: [{ name: 'United States', weight: 0.98 }],
            sectorAllocations: [{ name: 'Technology', weight: 0.35 }],
            quote: { price: 700, feed: 'tiingo_iex' },
          }],
        },
      },
    } as any;
    const packForPortfolio = buildQuestionContextPack(
      investmentSnapshot,
      questionNeedsFromPacks(['investment_details'], false),
      { version: 1, facts: [] },
      'Review my portfolio',
    );
    const genericSecurity = (packForPortfolio.details.investments as any).externalData.securities[0];
    expect(genericSecurity.countryAllocations).toBeUndefined();
    expect(genericSecurity.sectorAllocations).toBeUndefined();
    expect((packForPortfolio.details.investments as any).externalData.portfolioExposure).toBeDefined();

    const packForSpy = buildQuestionContextPack(
      investmentSnapshot,
      questionNeedsFromPacks(['investment_details'], false),
      { version: 1, facts: [] },
      'What sectors are in SPY?',
    );
    expect((packForSpy.details.investments as any).externalData.securities[0].sectorAllocations)
      .toEqual([{ name: 'Technology', weight: 0.35 }]);
  });
});
