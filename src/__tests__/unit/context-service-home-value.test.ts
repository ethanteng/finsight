import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockGetSnapshot = jest.fn<any>();
const mockBuildTierContext = jest.fn<any>();
const mockFindUser = jest.fn<any>();
const mockGetMarketContextObservation = jest.fn<any>();

jest.mock('../../services/financial-snapshot-persistence', () => ({
  getFinancialSnapshotForAnalysis: mockGetSnapshot,
}));

jest.mock('../../data/orchestrator', () => ({
  dataOrchestrator: { buildTierAwareContext: mockBuildTierContext },
}));

jest.mock('../../prisma-client', () => ({
  getPrismaClient: () => ({ user: { findUnique: mockFindUser } }),
}));

jest.mock('../../market-news/manager', () => ({
  MarketNewsManager: jest.fn().mockImplementation(() => ({
    getMarketContextObservation: mockGetMarketContextObservation,
  })),
}));

import { gatherContextSnapshot } from '../../openai/context-service';

describe('gatherContextSnapshot home value context', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockBuildTierContext.mockResolvedValue({
      tierInfo: { currentTier: 'starter', availableSources: [] },
      upgradeHints: [],
    });
    mockFindUser.mockResolvedValue(null);
    mockGetMarketContextObservation.mockResolvedValue({
      id: 'market-premium',
      contextText: 'Mortgage and economic context.',
      lastUpdate: new Date('2026-08-20T00:00:00.000Z'),
    });
    mockGetSnapshot.mockResolvedValue({
      computedAt: new Date('2026-08-18T01:00:00.000Z'),
      asOf: new Date('2026-08-18T00:00:00.000Z'),
      status: 'current',
      reportingCurrency: 'USD',
      accounts: [],
      transactions: [],
      transactionsSummary: {},
      financialOverview: {
        netWorth: 1_000_000,
        totalCash: 100_000,
        totalInvestments: 500_000,
        totalDebt: 350_000,
        homeValue: 750_000,
      },
      investmentPortfolio: {},
      meta: {
        home: {
          address: '1 Main St, Austin, TX 78701',
          propertyId: 'property-123',
          valueMid: 750_000,
          valueLow: 700_000,
          valueHigh: 810_000,
          lastUpdated: '2026-08-17T00:00:00.000Z',
          isManualOverride: false,
        },
      },
    });
  });

  it('preserves RentCast range, provenance, timestamp, and identity from a numeric snapshot value', async () => {
    const result = await gatherContextSnapshot({
      userId: 'user-1',
      question: 'What is my home worth?',
      questionNeeds: {
        needsMarketContext: false,
        needsSearchContext: false,
        needsHomeValue: true,
        needsInvestments: false,
        needsRetirement: false,
        needsAccountDetails: false,
        needsTransactionDetails: false,
        needsMonthlyCashFlow: false,
        needsUserProfile: false,
        needsSecondaryValidation: false,
      },
      tier: 'basic' as any,
      deferRetirementAnalysis: true,
    });

    expect(result.homeValueData).toEqual({
      address: '1 Main St, Austin, TX 78701',
      propertyId: 'property-123',
      valueMid: 750_000,
      valueLow: 700_000,
      valueHigh: 810_000,
      lastUpdated: '2026-08-17T00:00:00.000Z',
      isManualOverride: false,
    });
    expect(result.homeValueSummary).toContain('Estimated range (85% confidence): $700,000 – $810,000');
    expect(result.homeValueSummary).toContain('Source: RentCast automated valuation model');
    expect(result.homeValueSummary).toContain('Last updated: Aug 17, 2026');
  });

  it('loads typed market observations when a calculator selects market context', async () => {
    mockBuildTierContext.mockResolvedValue({
      marketContext: {
        economicIndicators: {
          mortgageRate: {
            value: 6.5,
            date: '2026-08-20',
            source: 'FRED',
            lastUpdated: '2026-08-20T00:00:00.000Z',
          },
        },
      },
      tierInfo: { currentTier: 'premium', availableSources: [] },
      upgradeHints: [],
    });

    const result = await gatherContextSnapshot({
      userId: 'user-1',
      question: 'Can I afford a $700,000 home?',
      questionNeeds: {
        needsMarketContext: true,
        needsSearchContext: false,
        needsHomeValue: false,
        needsInvestments: false,
        needsRetirement: false,
        needsAccountDetails: false,
        needsTransactionDetails: false,
        needsMonthlyCashFlow: false,
        needsUserProfile: false,
        needsSecondaryValidation: true,
      },
      tier: 'premium' as any,
      includeStructuredMarketContext: true,
      deferRetirementAnalysis: true,
    });

    expect(mockBuildTierContext).toHaveBeenCalledWith(
      'premium',
      [],
      [],
      { includeMarketContext: true }
    );
    expect(result.tierContext.marketContext.economicIndicators?.mortgageRate?.value).toBe(6.5);
  });

  it('does not load every typed economic series for narrative-only market context', async () => {
    await gatherContextSnapshot({
      userId: 'user-1',
      question: 'What is happening in markets?',
      questionNeeds: {
        needsMarketContext: true,
        needsSearchContext: false,
        needsHomeValue: false,
        needsInvestments: false,
        needsRetirement: false,
        needsAccountDetails: false,
        needsTransactionDetails: false,
        needsMonthlyCashFlow: false,
        needsUserProfile: false,
        needsSecondaryValidation: true,
      },
      tier: 'premium' as any,
      deferRetirementAnalysis: true,
    });

    expect(mockBuildTierContext).toHaveBeenCalledWith(
      'premium',
      [],
      [],
      { includeMarketContext: false }
    );
  });
});
