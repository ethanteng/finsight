// @ts-nocheck
import { describe, expect, it, jest } from '@jest/globals';
import { askOpenAIWithEnhancedContext } from '../../src/openai';

let mockCreate: jest.Mock;

jest.mock('openai', () => {
  const create = jest.fn(async () => ({
    choices: [
      {
        message: {
          content: 'Mock final answer'
        }
      }
    ]
  }));

  const OpenAI = jest.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create
      }
    }
  }));

  return {
    __esModule: true,
    default: OpenAI,
    OpenAI,
    __mockCreate: create
  };
});

const { __mockCreate } = require('openai');
mockCreate = __mockCreate as jest.Mock;

const mockGetUserFinancialData = jest.fn() as jest.Mock;

jest.mock('../../src/services/financial-data-service', () => {
  return {
    FinancialDataService: jest.fn().mockImplementation(() => ({
      getUserFinancialData: mockGetUserFinancialData
    }))
  };
});

// Avoid hitting real summary service during perf spec
jest.mock('../../src/services/financial-summary-service', () => {
  return {
    FinancialSummaryService: jest.fn().mockImplementation(() => ({
      getUserSummary: jest.fn().mockResolvedValue({
        financialOverview: {
          netWorth: 0,
          totalCash: 0,
          totalInvestments: 0,
          totalDebt: 0,
          homeValue: null
        },
        investmentPortfolio: {
          totalValue: 0,
          holdingsCount: 0,
          securityCount: 0,
          assetAllocation: []
        },
        lastUpdated: new Date()
      })
    }))
  };
});

jest.mock('../../src/data/orchestrator', () => {
  const buildTierAwareContext = jest.fn();
  const moduleMock = {
    dataOrchestrator: {
      buildTierAwareContext,
      getMarketContextSummary: jest.fn().mockResolvedValue('' as any),
      getMarketContext: jest.fn()
    },
    __mockBuildTierContext: buildTierAwareContext
  };

  return {
    __esModule: true,
    ...moduleMock
  };
});

const { dataOrchestrator, __mockBuildTierContext } = require('../../src/data/orchestrator');
const mockBuildTierContext = __mockBuildTierContext as jest.Mock;

describe('askOpenAIWithEnhancedContext performance safeguards', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    mockGetUserFinancialData.mockResolvedValue({
      accounts: [],
      balances: {},
      investments: {
        holdings: [],
        securities: [],
        portfolio: {
          totalValue: 0,
          assetAllocation: [],
          holdingCount: 0,
          securityCount: 0
        },
        transactions: []
      },
      bankingTransactions: [],
      homeValue: null,
      transactionAggregates: {
        expense: [
          ['groceries', 450],
          ['travel', 320]
        ],
        income: [
          ['salary', 5200]
        ]
      },
      metadata: {
        lastUpdated: new Date(),
        tokenHealth: { plaid: [], snaptrade: { status: 'ok' } },
        errors: { plaid: [], snaptrade: [], homeValue: null },
        partialData: false,
        dataSources: { plaid: 'persisted', snaptrade: 'live' },
        performance: {
          totalDuration: 15,
          plaidDuration: 7,
          snaptradeDuration: 5
        },
        transactionAggregates: {
          expense: [
            ['groceries', 450],
            ['travel', 320]
          ],
          income: [
            ['salary', 5200]
          ]
        }
      }
    });

    mockBuildTierContext.mockResolvedValue({
      accounts: [],
      transactions: [],
      marketContext: {},
      tierInfo: {
        currentTier: 'starter',
        availableSources: [],
        unavailableSources: [],
        upgradeSuggestions: [],
        upgradeHints: []
      },
      upgradeHints: []
    });
  });

  it('responds within acceptable latency budget with aggregated summaries', async () => {
    const start = Date.now();
    const answer = await askOpenAIWithEnhancedContext(
      'How is my spending trending?',
      [],
      'starter',
      'user-123'
    );
    const duration = Date.now() - start;

    expect(answer).toContain('Mock final answer');
    expect(duration).toBeLessThan(500);

    expect(mockCreate).toHaveBeenCalled();
    // Ensure we prepared a prompt (content exists)
    const request = mockCreate.mock.calls[0]?.[0] as any;
    const systemPrompt = request.messages[0].content as string;
    expect(typeof systemPrompt).toBe('string');
    expect(systemPrompt.length).toBeGreaterThan(0);
  });
});
