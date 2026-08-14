import { buildQuestionContextPack } from '../../openai/context-pack';
import { buildCanonicalFactPack } from '../../openai/canonical-facts';
import { analyzeQuestionNeeds } from '../../openai/question-analysis';

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
    const needs = analyzeQuestionNeeds(question);
    const pack = buildQuestionContextPack(snapshot, needs, buildCanonicalFactPack(snapshot, question, needs));
    expect(pack.details).toEqual({});
    expect(JSON.stringify(pack)).not.toContain('Coffee');
    expect(JSON.stringify(pack)).not.toContain('Checking');
  });

  it('includes only requested transaction details', () => {
    const question = 'Show my recent transactions.';
    const needs = analyzeQuestionNeeds(question);
    const pack = buildQuestionContextPack(snapshot, needs, buildCanonicalFactPack(snapshot, question, needs));
    expect(pack.details.recentTransactions).toEqual(snapshot.bankingTransactions);
    expect(pack.details.accounts).toBeUndefined();
  });
});
