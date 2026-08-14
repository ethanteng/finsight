import { buildCanonicalFactPack } from '../../openai/canonical-facts';
import { analyzeQuestionNeeds } from '../../openai/question-analysis';
import { canonicalizeResponseNumbers, validateResponseFacts } from '../../openai/response-facts';

const snapshot = {
  accounts: [],
  bankingTransactions: [],
  metadata: { lastUpdated: new Date(), dataSources: {}, errors: [] },
  tierContext: { tierInfo: { currentTier: 'starter', availableSources: [] }, upgradeHints: [] },
  financialSummary: {
    financialOverview: { netWorth: -5000, totalCash: 0, totalInvestments: 0, totalDebt: 5000, homeValue: null },
  },
} as any;

describe('canonical response facts', () => {
  const question = 'What is my net worth?';
  const pack = buildCanonicalFactPack(snapshot, question, analyzeQuestionNeeds(question));

  it('replaces matching legacy model values with server-authored unit and provenance', () => {
    const response = canonicalizeResponseNumbers({ summary: 'Your net worth is -$5,000.', key_numbers: { net_worth: -5000 } }, pack);
    expect(response.key_numbers).toEqual({
      net_worth: { value: -5000, unit: 'usd', provenance: 'net_worth' },
    });
    expect(validateResponseFacts(response, pack)).toMatchObject({ valid: true });
  });

  it('rejects an unsupported structured value or provenance', () => {
    const result = validateResponseFacts({
      summary: 'Result.',
      key_numbers: { net_worth: { value: -4000, unit: 'usd', provenance: 'net_worth' } },
    }, pack);
    expect(result.valid).toBe(false);
    expect(result.invalidKeyNumbers).toEqual(['net_worth']);
  });

  it('validates the sign of currency claims in prose', () => {
    expect(validateResponseFacts({ summary: 'Your net worth is $5,000.' }, pack).valid).toBe(false);
    expect(validateResponseFacts({ summary: 'Your net worth is -$5,000.' }, pack).valid).toBe(true);
  });

  it('rejects unsupported untyped numbers in prose', () => {
    expect(validateResponseFacts({ summary: 'You could reach this in 7 years.' }, pack).valid).toBe(false);
  });

  it('does not treat account types or historical years as numeric claims', () => {
    expect(validateResponseFacts({ summary: 'Consider your 401k allocation.' }, pack).valid).toBe(true);
    expect(validateResponseFacts({ summary: 'In 2008 markets crashed.' }, pack).valid).toBe(true);
  });

  it('does not allow internal calculation inputs to be displayed', () => {
    const internalPack = {
      ...pack,
      facts: [...pack.facts, {
        id: 'internal_ratio',
        label: 'Internal ratio',
        value: 0.04,
        unit: 'ratio' as const,
        displayable: false,
        provenance: { kind: 'snapshot' as const, source: 'internal.ratio' },
      }],
    };
    expect(validateResponseFacts({
      summary: 'Result.',
      key_numbers: { ratio: { value: 0.04, unit: 'ratio', provenance: 'internal_ratio' } },
    }, internalPack).valid).toBe(false);
  });
});
