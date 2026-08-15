import { buildCanonicalFactPack } from '../../openai/canonical-facts';
import { analyzeQuestionNeeds } from '../../openai/question-analysis';
import {
  canonicalizeResponseNumbers,
  salvageUngroundedResponse,
  validateResponseFacts,
  UNVERIFIED_PROSE_NOTICE,
} from '../../openai/response-facts';
import { UNVERIFIABLE_SUMMARY } from '../../openai/response-grounding';

const snapshot = {
  accounts: [],
  bankingTransactions: [],
  metadata: { lastUpdated: new Date(), dataSources: {}, errors: [] },
  tierContext: { tierInfo: { currentTier: 'starter', availableSources: [] }, upgradeHints: [] },
  financialSummary: {
    financialOverview: { netWorth: -5000, totalCash: 0, totalInvestments: 0, totalDebt: 7500, homeValue: null },
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

  it('rejects bare money-sized numbers but not planning integers', () => {
    expect(validateResponseFacts({ summary: 'You could add 250,000 to savings.' }, pack).valid).toBe(false);
    expect(validateResponseFacts({ summary: 'You could reach this in 7 years.' }, pack).valid).toBe(true);
  });

  it('does not read a range as a negative number', () => {
    // "2026-2029" used to parse as the year 2026 and the value -2029, and the
    // calendar-year exemption only covers positive years.
    const planning = 'Between 2026-2029, at age 62, hold a 60/40 mix for 10-15 years.';
    expect(validateResponseFacts({ summary: planning }, pack).valid).toBe(true);
  });

  it('reads a small bare number as money when the sentence says so', () => {
    expect(validateResponseFacts({ summary: 'You can afford 900 per month.' }, pack).issues).toContain(
      'User-facing usd value 900 is not present in the canonical fact pack.'
    );
    expect(validateResponseFacts({ summary: 'You could save 250 a month.' }, pack).valid).toBe(false);
    // The same small numbers stay prose when they measure time or count things.
    expect(validateResponseFacts({ summary: 'You could save 3 years of expenses.' }, pack).valid).toBe(true);
    expect(validateResponseFacts({ summary: 'You pay into 4 accounts.' }, pack).valid).toBe(true);
  });

  it('checks both ends of a money range', () => {
    const result = validateResponseFacts({ summary: 'Keep a $50,000-100,000 buffer.' }, pack);
    expect(result.issues).toEqual(expect.arrayContaining([
      'User-facing usd value 50000 is not present in the canonical fact pack.',
      'User-facing usd value 100000 is not present in the canonical fact pack.',
    ]));
  });

  it('does not treat account types or historical years as numeric claims', () => {
    expect(validateResponseFacts({ summary: 'Consider your 401k allocation.' }, pack).valid).toBe(true);
    expect(validateResponseFacts({ summary: 'Compare your 401(k) and 403(b) allocations with the S&P 500.' }, pack).valid).toBe(true);
    expect(validateResponseFacts({ summary: 'In 2008 markets crashed.' }, pack).valid).toBe(true);
  });

  it('accepts typed scenario premises supplied by the user', () => {
    const scenarioQuestion = 'Can I afford a $500k house with 20% down?';
    const scenarioPack = buildCanonicalFactPack(snapshot, scenarioQuestion, analyzeQuestionNeeds(scenarioQuestion));
    expect(validateResponseFacts({
      summary: 'A $500,000 home with 20% down is the scenario to compare with your cash flow.',
      key_numbers: {
        purchase_price: { value: 500_000, unit: 'usd', provenance: 'user_input_usd_1' },
        down_payment_rate: { value: 20, unit: 'percent', provenance: 'user_input_percent_2' },
      },
    }, scenarioPack).valid).toBe(true);
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

describe('rounded canonical values', () => {
  // The values behind the reported failure: every canonical fact carries full
  // precision, and the UI itself renders them rounded.
  const messy = {
    accounts: [],
    bankingTransactions: [],
    averageMonthlyIncome: 10_843.8725,
    averageMonthlyExpense: 9_848.3025,
    metadata: { lastUpdated: new Date(), dataSources: {}, errors: [] },
    tierContext: { tierInfo: { currentTier: 'starter', availableSources: [] }, upgradeHints: [] },
    financialSummary: {
      financialOverview: {
        netWorth: 3_304_889.12,
        totalCash: 75_038.94,
        totalInvestments: 1_919_844.10243441,
        totalDebt: 350_095.4,
        homeValue: 1_660_100,
      },
    },
  } as any;
  const question = 'Evaluate my entire financial portfolio, including my income and spending.';
  const pack = buildCanonicalFactPack(messy, question, analyzeQuestionNeeds(question));

  it.each([
    ['$1.92 million', 'Your portfolio is worth $1.92 million.'],
    ['$996', 'That leaves about $996 a month.'],
    ['9%', 'Your savings rate is 9%.'],
    ['9.2%', 'Your savings rate is 9.2%.'],
    ['$350,000', 'You carry $350,000 of debt.'],
    ['$3.3 million', 'Net worth is $3.3 million.'],
  ])('accepts %s as a canonical fact rounded for readability', (_label, summary) => {
    expect(validateResponseFacts({ summary }, pack)).toMatchObject({ valid: true });
  });

  it('still rejects a number that is not any fact at that precision', () => {
    expect(validateResponseFacts({ summary: 'Your portfolio is worth $1.5 million.' }, pack).valid).toBe(false);
    // 42.17% ETF plus 25.74% mutual funds is arithmetic, not a supplied fact.
    expect(validateResponseFacts({ summary: 'Equities are 68% of the portfolio.' }, pack).valid).toBe(false);
  });

  it('snaps a rounded key number back onto the fact it cites', () => {
    const response = canonicalizeResponseNumbers({
      summary: 'Result.',
      key_numbers: {
        monthly_cash_flow: { value: 996, unit: 'usd', provenance: 'average_monthly_operating_cash_flow' },
      },
    }, pack);

    expect(response.key_numbers).toEqual({
      monthly_cash_flow: {
        value: 995.5699999999997,
        unit: 'usd',
        provenance: 'average_monthly_operating_cash_flow',
      },
    });
    expect(validateResponseFacts(response, pack)).toMatchObject({ valid: true });
  });

  it('keeps the grounded part of an answer instead of discarding all of it', () => {
    const response = {
      summary: 'Your portfolio is worth $1.92 million. A 20% drop would cost you $384,000.',
      insights: ['That leaves about $996 a month.', 'You could add $50,000 a year.'],
      suggested_actions: ['Keep contributing.'],
    };
    const salvaged = salvageUngroundedResponse(response, pack, validateResponseFacts(response, pack));

    expect(salvaged.summary).toContain('$1.92 million');
    expect(salvaged.summary).not.toContain('384,000');
    expect(salvaged.summary).toContain(UNVERIFIED_PROSE_NOTICE);
    expect(salvaged.insights).toEqual(['That leaves about $996 a month.']);
    expect(salvaged.suggested_actions).toEqual(['Keep contributing.']);
  });

  it('falls back to the placeholder when the summary itself cannot be salvaged', () => {
    const response = { summary: 'Your net worth is $12,345,678.', insights: ['Also unverifiable: $99,999.'] };
    const salvaged = salvageUngroundedResponse(response, pack, validateResponseFacts(response, pack));

    expect(salvaged).toEqual({
      summary: UNVERIFIABLE_SUMMARY,
      key_numbers: undefined,
      insights: [],
      suggested_actions: [],
    });
  });

  it('removes a sentence left pointing at one it just dropped', () => {
    // Reported from production: stripping "equities are 59%" left "That's
    // risky…" behind, and the secondary validator flagged the fragment.
    const response = {
      summary: 'Your portfolio is worth $1.92 million. Equities are 59% of it. That is risky this close to retirement.',
      insights: ['Cash is $75,038.94. It could cover more months than that.'],
      suggested_actions: ['Keep contributing.'],
    };
    const salvaged = salvageUngroundedResponse(response, pack, validateResponseFacts(response, pack));

    expect(salvaged.summary).toContain('$1.92 million');
    expect(salvaged.summary).not.toContain('59%');
    expect(salvaged.summary).not.toContain('That is risky');
    // A dependent opener whose antecedent survived is kept.
    expect(salvaged.insights).toEqual(['Cash is $75,038.94. It could cover more months than that.']);
  });

  it('does not pass an abbreviation off as a surviving summary', () => {
    // "U.S." must not read as a complete sentence that outlived the strip.
    const response = { summary: 'U.S. stocks could lose $999,999 next year.' };
    const salvaged = salvageUngroundedResponse(response, pack, validateResponseFacts(response, pack));

    expect(salvaged.summary).toBe(UNVERIFIABLE_SUMMARY);
  });

  it('keeps a verified answer when only a key number was miscited', () => {
    const response = {
      summary: 'Your portfolio is worth $1.92 million.',
      key_numbers: { made_up: { value: 42, unit: 'usd' as const, provenance: 'no_such_fact' } },
    };
    const salvaged = salvageUngroundedResponse(response, pack, validateResponseFacts(response, pack));

    expect(salvaged.summary).toBe('Your portfolio is worth $1.92 million.');
    expect(salvaged.key_numbers).toBeUndefined();
  });
});
