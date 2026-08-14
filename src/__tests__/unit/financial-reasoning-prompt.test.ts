import { buildFinancialReasoningPrompt, FinancialReasoningPromptInput } from '../../openai/financial-reasoning-prompt';

const baseInput: FinancialReasoningPromptInput = {
  question: 'How much do I spend each month?',
  financialContext: '# Financial Overview\nNet Worth: $250,000.00',
  userProfile: 'Age 40, married.',
  marketSummary: 'Markets were flat.',
  ragKnowledge: 'Some retrieved knowledge.'
};

describe('buildFinancialReasoningPrompt – system prompt safeguards', () => {
  const { systemPrompt } = buildFinancialReasoningPrompt(baseInput);

  it('instructs the model not to invent data', () => {
    expect(systemPrompt).toMatch(/Do not invent financial data/i);
  });

  it('instructs the model to treat amounts as USD', () => {
    expect(systemPrompt).toMatch(/USD/);
  });

  it('instructs the model to use authoritative totals and not recompute them', () => {
    expect(systemPrompt).toMatch(/Canonical facts are exact/i);
    expect(systemPrompt).toMatch(/never recompute/i);
    expect(systemPrompt).toMatch(/Do not perform authoritative arithmetic/i);
  });

  it('includes the (EXPENSE)/(FEE) transaction filtering rule', () => {
    expect(systemPrompt).toContain('(EXPENSE)');
    expect(systemPrompt).toContain('(FEE)');
    expect(systemPrompt).toMatch(/Exclude transfers, income, trades, deposits, and withdrawals/i);
  });

  it('requires typed key numbers with canonical provenance', () => {
    expect(systemPrompt).toContain('"value"');
    expect(systemPrompt).toContain('"unit"');
    expect(systemPrompt).toContain('"provenance"');
    expect(systemPrompt).toMatch(/copy value, unit, and provenance exactly/i);
    expect(systemPrompt).toMatch(/Every numeric value mentioned anywhere/i);
  });
});

describe('buildFinancialReasoningPrompt – user message assembly', () => {
  it('marks the financial context as canonical and source of truth', () => {
    const { userMessage } = buildFinancialReasoningPrompt(baseInput);
    expect(userMessage).toContain('## User Question');
    expect(userMessage).toContain('How much do I spend each month?');
    expect(userMessage).toContain('CANONICAL');
    expect(userMessage).toContain('# Financial Overview');
    expect(userMessage).toContain('## User Profile');
    expect(userMessage).toContain('## Daily Market Summary');
    expect(userMessage).toContain('## Retrieved Financial Knowledge');
  });

  it('omits unused context sections instead of spending prompt tokens on placeholders', () => {
    const { userMessage } = buildFinancialReasoningPrompt({
      ...baseInput,
      financialContext: '',
      userProfile: '',
      marketSummary: '',
      ragKnowledge: ''
    });
    expect(userMessage).toContain('(No financial data available)');
    expect(userMessage).not.toContain('## User Profile');
    expect(userMessage).not.toContain('## Daily Market Summary');
    expect(userMessage).not.toContain('## Retrieved Financial Knowledge');
  });

  it('prepends validation feedback when provided', () => {
    const { userMessage } = buildFinancialReasoningPrompt({
      ...baseInput,
      validationFeedback: ['Withdrawal rate was miscalculated', 'Net worth invented']
    });
    expect(userMessage).toContain('## Validation Feedback — Must Fix');
    expect(userMessage).toContain('- Withdrawal rate was miscalculated');
    expect(userMessage).toContain('- Net worth invented');
  });

  it('includes only the last 3 conversation history entries, labeled non-canonical', () => {
    const history = Array.from({ length: 6 }, (_, i) => ({
      question: `Q${i}`,
      answer: `A${i}`
    }));
    const { userMessage } = buildFinancialReasoningPrompt({ ...baseInput, conversationHistory: history });
    expect(userMessage).toContain('NOT canonical data');
    // Oldest three should be dropped (only last 3 kept)
    expect(userMessage).not.toContain('Q0');
    expect(userMessage).not.toContain('Q1');
    expect(userMessage).not.toContain('Q2');
    expect(userMessage).toContain('Q3');
    expect(userMessage).toContain('Q5');
  });
});
