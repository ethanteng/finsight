import { UserTier } from '../../data/types';
import { gatherContextSnapshot } from '../../openai/context-service';
import { analyzeQuestionNeeds } from '../../openai/question-analysis';

describe('gatherContextSnapshot demo mode', () => {
  it('includes canonical overview and cash-flow aggregates for broad demo questions', async () => {
    const question = 'How am I doing financially?';
    const snapshot = await gatherContextSnapshot({
      isDemo: true,
      question,
      questionNeeds: analyzeQuestionNeeds(question),
      tier: UserTier.STARTER,
    });

    expect(snapshot.financialSummary?.financialOverview?.netWorth).toBeGreaterThan(0);
    expect(snapshot.incomeAnalysis).toContain('Average Monthly Income');
    expect(snapshot.expenseAnalysis).toContain('Average Monthly Expenses');
    expect(snapshot.contextSelection?.accountsIncluded).toBe(false);
  });
});
