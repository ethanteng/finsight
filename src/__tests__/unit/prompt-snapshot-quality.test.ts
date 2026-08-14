import { describe, expect, it } from '@jest/globals';
import { buildPromptPayload, buildFinancialContextForPrompt } from '../../openai/prompt-builder';
import type { FinancialContextSnapshot } from '../../openai/types';

const snapshot = {
  accounts: [],
  bankingTransactions: [],
  metadata: {},
  tierContext: {
    accounts: [],
    transactions: [],
    marketContext: {},
    tierInfo: {
      currentTier: 'starter',
      availableSources: [],
      unavailableSources: [],
      upgradeSuggestions: [],
      limitations: [],
    },
    upgradeHints: [],
  },
  financialSummary: {
    computedAt: '2026-08-14T12:00:00.000Z',
    asOf: '2026-08-12T09:00:00.000Z',
    status: 'stale',
    reportingCurrency: 'USD',
    financialOverview: {
      netWorth: 0,
      totalCash: 0,
      totalInvestments: 0,
      totalDebt: 0,
      homeValue: 0,
    },
    investmentPortfolio: {
      totalValue: 0,
      holdingCount: 0,
      assetAllocation: [],
      securityCount: 0,
    },
  },
} as unknown as FinancialContextSnapshot;

describe('LLM canonical snapshot context', () => {
  it('includes snapshot provenance and preserves known zero values', () => {
    const { systemPrompt } = buildPromptPayload({
      question: 'What is my net worth?',
      snapshot,
      conversationHistory: [],
    });

    expect(systemPrompt).toContain('Snapshot Status: stale');
    expect(systemPrompt).toContain('Source Data As Of: 2026-08-12T09:00:00.000Z');
    expect(systemPrompt).toContain('Some source data is stale');
    expect(systemPrompt).toContain('Home Value: $0.00');
    expect(systemPrompt).toContain('Holdings: 0');
    expect(systemPrompt).not.toContain('Home Value: Not estimated yet');
  });

  it('uses the same canonical metadata in the Claude financial context', () => {
    const context = buildFinancialContextForPrompt(snapshot);

    expect(context).toContain('Snapshot Status: stale');
    expect(context).toContain('Net Worth: $0.00');
    expect(context).toContain('Home Value: $0.00');
  });
});
