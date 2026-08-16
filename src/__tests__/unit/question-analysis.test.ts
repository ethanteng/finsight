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
    expect(
      analyzeQuestionNeeds('Yes, I can confirm $125K as my target annual spending', [
        'Re-run my retirement analysis.',
      ])
    ).toMatchObject({
      needsRetirement: true,
      needsSecondaryValidation: true,
    });
  });

  it('inherits data needs for a bare value answer', () => {
    // The reply to "how much do you expect to spend per year?" is often just
    // the number. It names no topic, so on its own words it routes as a
    // generic question and the analysis waiting on it never runs.
    expect(analyzeQuestionNeeds('$125K a year', ['Re-run my retirement analysis.'])).toMatchObject({
      needsRetirement: true,
    });
    expect(analyzeQuestionNeeds('125,000', ['Re-run my retirement analysis.'])).toMatchObject({
      needsRetirement: true,
    });
    expect(analyzeQuestionNeeds('125000', ['Re-run my retirement analysis.'])).toMatchObject({
      needsRetirement: true,
    });
  });

  it('does not inherit unrelated data needs for a standalone question', () => {
    expect(analyzeQuestionNeeds('What is my net worth?', ['Show all my accounts.'])).toMatchObject({
      needsAccountDetails: false,
    });
    // Carries an amount, but asks its own question — not an answer to the last one.
    expect(
      analyzeQuestionNeeds('Can I afford a $50k car?', ['Am I on track to retire at 68?'])
    ).toMatchObject({
      needsRetirement: false,
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

  it('loads market context for retirement questions that never say "inflation"', () => {
    // A runway projection is stated against inflation and rates whichever words
    // the user used. Withholding that context produced an answer telling a
    // 77-year-old it lacked the assumptions the projection needed.
    for (const question of [
      'I am already retired, turning 77 this year. And I plan to withdrawal approximately $36K per year.',
      'At my current rate of spend, how long will my money last?',
      'Am I on track to retire at 68?',
    ]) {
      expect(analyzeQuestionNeeds(question)).toMatchObject({
        needsRetirement: true,
        needsMarketContext: true,
      });
    }

    // Still off for the questions that have no projection behind them.
    expect(analyzeQuestionNeeds('What is my current net worth?')).toMatchObject({
      needsMarketContext: false,
    });
  });

  it('loads rates-and-rules context when the user asks for a lookup or names a benefit program', () => {
    for (const question of [
      "Can't you do a web search to find some good numbers to plug in for my Social Security benefit and Medicare costs?",
      'Factor in Social Security and Medicare into my retirement plan.',
      'Can you look up the current Medicare Part B premium?',
      'I do not know the figure — look it up.',
    ]) {
      expect(analyzeQuestionNeeds(question)).toMatchObject({ needsSearchContext: true });
    }

    // A lookup phrasing aimed at the user's own data is not an outside lookup.
    for (const question of [
      'Look up my Amazon charges from last month.',
      'How much Google stock do I own?',
    ]) {
      expect(analyzeQuestionNeeds(question)).toMatchObject({ needsSearchContext: false });
    }
  });

  it('recognizes every form of the word "retire"', () => {
    // "retiring" contains neither "retire" nor "retirement", so the substring
    // checks this replaced withheld the retirement analysis from the question
    // that reported this bug.
    for (const question of [
      'What is my goal of retiring by age 62 or sooner?',
      'I retired last year — how am I doing?',
      'As a retiree, what should I watch?',
      'When can I stop working?',
      'Is my nest egg big enough?',
    ]) {
      expect(analyzeQuestionNeeds(question)).toMatchObject({
        needsRetirement: true,
        needsUserProfile: true,
        needsSecondaryValidation: true,
      });
    }
  });

  it('loads the spending breakdown when asked to evaluate spending', () => {
    const question = 'Evaluate my entire financial portfolio, including my income and spending. ' +
      'Give me your assessment of its strengths and weaknesses, especially as it relates to ' +
      'my goal of retiring by age 62 or sooner.';
    expect(analyzeQuestionNeeds(question)).toMatchObject({
      needsTransactionDetails: true,
      needsRetirement: true,
      needsInvestments: true,
    });

    expect(analyzeQuestionNeeds('Where is my money going?')).toMatchObject({ needsTransactionDetails: true });
    expect(analyzeQuestionNeeds('Where does all my money go?')).toMatchObject({ needsTransactionDetails: true });
    expect(analyzeQuestionNeeds('How can I reduce my expenses?')).toMatchObject({ needsTransactionDetails: true });
    // A plain total is still answered from the monthly summary.
    expect(analyzeQuestionNeeds('How much do I spend each month?')).toMatchObject({ needsTransactionDetails: false });
  });

  it('loads the breakdown when spending is named against a category', () => {
    // "spending on dining out" asks what the total is made of; "my monthly
    // spending" asks for the total itself.
    for (const question of [
      'How much am I spending on dining out?',
      'What do I spend on groceries?',
      'How much am I spending at Costco?',
    ]) {
      expect(analyzeQuestionNeeds(question)).toMatchObject({ needsTransactionDetails: true });
    }

    for (const question of [
      'What is my average monthly spending?',
      'How much do I spend each month?',
    ]) {
      expect(analyzeQuestionNeeds(question)).toMatchObject({ needsTransactionDetails: false });
    }

    // "on track" is a progress idiom, not "spending on [category]".
    for (const question of [
      'Am I spending on track to retire?',
      'Is my spending on track for retirement?',
    ]) {
      expect(analyzeQuestionNeeds(question)).toMatchObject({ needsTransactionDetails: false });
    }

    // Past tense asks the same question of the same data.
    expect(analyzeQuestionNeeds('What did I spent on groceries?')).toMatchObject({
      needsTransactionDetails: true,
    });
  });

  it('does not load transactions for questions that merely say "money"', () => {
    // "money" plus a review verb is not a spending question; loading the raw
    // rows for these costs latency and puts unrelated detail in the prompt.
    for (const question of [
      'Review where my money is invested.',
      'Assess how much money I need to retire.',
      'Where is my money?',
    ]) {
      expect(analyzeQuestionNeeds(question)).toMatchObject({ needsTransactionDetails: false });
    }
  });

  it('separates retiring a debt from retiring from work', () => {
    expect(analyzeQuestionNeeds('Should I retire my mortgage early?')).toMatchObject({
      needsRetirement: false,
    });
    // Both senses in one question still routes as retirement.
    expect(analyzeQuestionNeeds('Should I retire my mortgage early so I can retire at 62?')).toMatchObject({
      needsRetirement: true,
    });
  });

  it('does not load holdings for general stock-market questions', () => {
    expect(analyzeQuestionNeeds('How is the stock market doing today?')).toMatchObject({
      needsMarketContext: true,
      needsInvestments: false,
    });
  });
});
