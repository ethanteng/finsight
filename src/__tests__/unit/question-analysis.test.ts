import { analyzeQuestionNeeds } from '../../openai/question-analysis';

describe('question-aware LLM context routing', () => {
  it('keeps a current net-worth lookup on persisted data only', () => {
    expect(analyzeQuestionNeeds('What is my current net worth?')).toMatchObject({
      needsMarketContext: false,
      needsSearchContext: false,
      needsAccountDetails: false,
      needsTransactionDetails: false,
      needsUserProfile: false,
      needsSecondaryValidation: false,
    });
  });

  it('loads transaction detail without unrelated external context for spending questions', () => {
    expect(analyzeQuestionNeeds('Which merchants did I spend the most with?')).toMatchObject({
      needsMarketContext: false,
      needsSearchContext: false,
      needsTransactionDetails: true,
    });
  });

  it('answers monthly cash-flow totals from the canonical summary without raw transactions', () => {
    expect(analyzeQuestionNeeds('How much do I spend each month?')).toMatchObject({
      needsTransactionDetails: false,
    });
    expect(analyzeQuestionNeeds('What is my average monthly income?')).toMatchObject({
      needsTransactionDetails: false,
    });
  });

  it('loads the persisted monthly breakdown for time-bounded cash-flow questions', () => {
    expect(analyzeQuestionNeeds('How much did I spend last month?')).toMatchObject({
      needsMonthlyCashFlow: true,
      needsTransactionDetails: false,
    });
    expect(analyzeQuestionNeeds('What was my income in July?')).toMatchObject({
      needsMonthlyCashFlow: true,
      needsTransactionDetails: false,
    });
  });

  it('inherits data needs for short contextual follow-ups', () => {
    expect(analyzeQuestionNeeds('Which one?', ['Show all my accounts.'])).toMatchObject({
      needsAccountDetails: true,
    });
    expect(analyzeQuestionNeeds('What about 65 instead?', ['Am I on track to retire at 68?'])).toMatchObject({
      needsRetirement: true,
      needsSecondaryValidation: true,
    });
  });

  it('does not inherit unrelated data needs for a standalone question', () => {
    expect(analyzeQuestionNeeds('What is my net worth?', ['Show all my accounts.'])).toMatchObject({
      needsAccountDetails: false,
    });
  });

  it('requests external context only for explicit current-rate or market questions', () => {
    expect(analyzeQuestionNeeds('What are current mortgage rates?')).toMatchObject({
      needsSearchContext: true,
      needsAccountDetails: true,
    });
    expect(analyzeQuestionNeeds('How are market conditions affecting my portfolio?')).toMatchObject({
      needsMarketContext: true,
      needsInvestments: true,
    });
    expect(analyzeQuestionNeeds('What capital gains tax rate applies?')).toMatchObject({
      needsSearchContext: true,
      needsSecondaryValidation: true,
    });
  });

  it('routes retirement scenarios through holdings and secondary validation', () => {
    expect(analyzeQuestionNeeds('Am I on track to retire at 68?')).toMatchObject({
      needsInvestments: false,
      needsRetirement: true,
      needsUserProfile: true,
      needsSecondaryValidation: true,
    });
  });

  it('does not load holdings for general stock-market questions', () => {
    expect(analyzeQuestionNeeds('How is the stock market doing today?')).toMatchObject({
      needsMarketContext: true,
      needsInvestments: false,
    });
  });
});
