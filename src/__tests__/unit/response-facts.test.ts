import { buildCanonicalFactPack } from '../../openai/canonical-facts';
import { questionNeedsFromPacks } from '../../openai/context-packs';
import {
  canonicalizeResponseNumbers,
  hasUnsupportedPercentValue,
  salvageUngroundedResponse,
  salvageUngroundedResponseWithDetail,
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
  const pack = buildCanonicalFactPack(snapshot, question, questionNeedsFromPacks([], false));

  it('replaces matching legacy model values with server-authored unit and provenance', () => {
    const response = canonicalizeResponseNumbers({ summary: 'Your net worth is -$5,000.', key_numbers: { net_worth: -5000 } }, pack);
    expect(response.key_numbers).toEqual({
      net_worth: { value: -5000, unit: 'usd', provenance: 'net_worth', provenanceLabel: 'Net worth' },
    });
    expect(validateResponseFacts(response, pack)).toMatchObject({ valid: true });
  });

  it('carries the fact label so the client never renders a raw fact id', () => {
    // Fact ids are unique, not readable. A per-holding id embeds the account
    // and security identifiers, and the client had only the id to work from --
    // so a source line read "Holding Value Qq9wmog6pvh1xrv4dpaqc11orpeexyfzzodop
    // 96d5ao5gljc9eowv7zy1tb1ydryymnfajrrjp 2893".
    const response = canonicalizeResponseNumbers(
      { summary: 'Your net worth is -$5,000.', key_numbers: { net_worth: -5000 } },
      pack
    );
    const metric = response.key_numbers!.net_worth as { provenanceLabel?: string };
    expect(metric.provenanceLabel).toBe('Net worth');
  });

  it('discards a model-authored label, like the rest of the metadata', () => {
    // This function exists to replace model-written provenance with the server
    // contract. A label is metadata too, and an unverified one would be shown
    // to the user as though the server had vouched for it.
    const response = canonicalizeResponseNumbers({
      summary: 'Result.',
      key_numbers: {
        net_worth: { value: -1, unit: 'usd', provenance: 'net_worth', provenanceLabel: 'Totally Legit Source' } as any,
      },
    }, pack);

    const metric = response.key_numbers!.net_worth as { provenanceLabel?: string };
    expect(metric.provenanceLabel).toBeUndefined();
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

  it('reads a written percent without a % sign as a rate claim', () => {
    const result = validateResponseFacts({ summary: 'Inflation is running at 3.1 percent.' }, pack);
    expect(result.valid).toBe(false);
    expect(result.issues).toContain('User-facing percent value 3.1 is not present in the canonical fact pack.');
    expect(hasUnsupportedPercentValue(result.issues)).toBe(true);
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
    const scenarioPack = buildCanonicalFactPack(snapshot, scenarioQuestion, questionNeedsFromPacks([], true));
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

describe('RentCast canonical estimate bounds', () => {
  const homeSnapshot = {
    ...snapshot,
    financialSummary: {
      computedAt: '2026-08-18T00:00:00.000Z',
      financialOverview: {
        ...snapshot.financialSummary.financialOverview,
        homeValue: 750_000,
      },
    },
    homeValueData: {
      address: '1 Main St',
      propertyId: 'property-123',
      valueMid: 750_000,
      valueLow: 700_000,
      valueHigh: 810_000,
      lastUpdated: '2026-08-17T00:00:00.000Z',
      isManualOverride: false,
    },
  } as any;

  it('adds both 85% bounds when the home-value pack is selected', () => {
    const needs = { ...questionNeedsFromPacks([], false), needsHomeValue: true };
    const factPack = buildCanonicalFactPack(homeSnapshot, 'What is my home worth?', needs);

    expect(factPack.facts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'home_value_low',
        value: 700_000,
        provenance: expect.objectContaining({ asOf: '2026-08-17T00:00:00.000Z' }),
      }),
      expect.objectContaining({ id: 'home_value_high', value: 810_000 }),
    ]));
  });

  it('stamps the midpoint with the home observation time, not the aggregate snapshot time', () => {
    // The midpoint and its bounds describe one RentCast observation, so a
    // home-value answer must not cite two different provenance timestamps.
    const needs = { ...questionNeedsFromPacks([], false), needsHomeValue: true };
    const factPack = buildCanonicalFactPack(
      {
        ...homeSnapshot,
        financialSummary: { ...homeSnapshot.financialSummary, asOf: '2026-06-01T00:00:00.000Z' },
      },
      'What is my home worth?',
      needs
    );

    const midpoint = factPack.facts.find((fact: any) => fact.id === 'home_value');
    expect(midpoint?.provenance.asOf).toBe('2026-08-17T00:00:00.000Z');
  });

  it('keeps the aggregate snapshot time when the overview value is not the stored home value', () => {
    const needs = { ...questionNeedsFromPacks([], false), needsHomeValue: true };
    const factPack = buildCanonicalFactPack(
      {
        ...homeSnapshot,
        financialSummary: { ...homeSnapshot.financialSummary, asOf: '2026-06-01T00:00:00.000Z' },
        homeValueData: { ...homeSnapshot.homeValueData, valueMid: 640_000 },
      },
      'What is my home worth?',
      needs
    );

    const midpoint = factPack.facts.find((fact: any) => fact.id === 'home_value');
    expect(midpoint?.provenance.asOf).toBe('2026-06-01T00:00:00.000Z');
  });

  it('does not expose bounds when home value is not selected or the value is manual', () => {
    const unselected = buildCanonicalFactPack(
      homeSnapshot,
      'What is my net worth?',
      questionNeedsFromPacks([], false)
    );
    const manual = buildCanonicalFactPack(
      {
        ...homeSnapshot,
        homeValueData: { ...homeSnapshot.homeValueData, isManualOverride: true },
      },
      'What is my home worth?',
      { ...questionNeedsFromPacks([], false), needsHomeValue: true }
    );

    expect(unselected.facts.some((fact: any) => fact.id === 'home_value_low')).toBe(false);
    expect(manual.facts.some((fact: any) => fact.id === 'home_value_low')).toBe(false);
  });
});

describe('negative canonical values written as magnitudes', () => {
  // The reported failure: a user whose manual overrides put income below
  // expenses. Both overrides reach the fact pack, and the derived cash-flow
  // fact is -3000 -- but the answer says "a $3,000 monthly shortfall", which
  // parsed as +3000 and took the whole cash-flow sentence out of the answer.
  const negativeCashFlow = {
    accounts: [],
    bankingTransactions: [],
    averageMonthlyIncome: 9_000,
    averageMonthlyExpense: 12_000,
    metadata: { lastUpdated: new Date(), dataSources: {}, errors: [] },
    tierContext: { tierInfo: { currentTier: 'premium', availableSources: [] }, upgradeHints: [] },
    financialSummary: {
      financialOverview: { netWorth: 500_000, totalCash: 40_000, totalInvestments: 460_000, totalDebt: 0, homeValue: null },
    },
  } as any;
  const pack = buildCanonicalFactPack(
    negativeCashFlow,
    'Can I afford a second home?',
    questionNeedsFromPacks([], false)
  );

  it('publishes the signed cash-flow fact the sentences cite', () => {
    expect(pack.facts.find((fact) => fact.id === 'average_monthly_operating_cash_flow'))
      .toMatchObject({ value: -3_000 });
  });

  it.each([
    ['negative $3,000', 'Your average monthly cash flow is negative $3,000.'],
    ['a $3,000 monthly shortfall', 'Income of $9,000 against expenses of $12,000 is a $3,000 monthly shortfall.'],
    ['a shortfall of $3,000', 'You are running a shortfall of $3,000 each month.'],
    ['a $3,000 deficit', 'That leaves a $3,000 deficit before any mortgage payment.'],
    ['negative 33%', 'Your savings rate is negative 33%.'],
  ])('accepts %s as the signed fact it names', (_label, summary) => {
    expect(validateResponseFacts({ summary }, pack)).toMatchObject({ valid: true });
  });

  it('keeps the cash-flow sentence in the delivered answer', () => {
    const response = {
      summary: 'Your day-to-day cash flow is running negative most months (average monthly income of $9,000 against average monthly expenses of $12,000, a $3,000 monthly shortfall), which is a real flag before adding a mortgage payment.',
      insights: ['Your average monthly cash flow is negative $3,000.'],
    };
    const result = validateResponseFacts(response, pack);
    expect(result.valid).toBe(true);
    expect(salvageUngroundedResponseWithDetail(response, pack, result).removals.sentences).toEqual([]);
  });

  it('still rejects a magnitude no fact carries as a negative', () => {
    expect(validateResponseFacts({ summary: 'You are running a $4,200 monthly shortfall.' }, pack).valid).toBe(false);
    // The negative wording moves the number it marks, not every number in the
    // sentence.
    expect(validateResponseFacts({ summary: 'A negative $3,000 month leaves $77,000 uncovered.' }, pack).valid).toBe(false);
  });

  it('refuses to read a positive fact as a shortfall', () => {
    // The reversal the reasoning prompt forbids: a surplus reported as a
    // deficit reverses the user's position, so negative wording must match
    // the negated fact and only that one.
    const surplus = buildCanonicalFactPack(
      { ...negativeCashFlow, averageMonthlyIncome: 12_000, averageMonthlyExpense: 9_000 },
      'Can I afford a second home?',
      questionNeedsFromPacks([], false)
    );
    expect(surplus.facts.find((fact) => fact.id === 'average_monthly_operating_cash_flow'))
      .toMatchObject({ value: 3_000 });
    expect(validateResponseFacts({ summary: 'You are running a $3,000 monthly shortfall.' }, surplus).valid).toBe(false);
    expect(validateResponseFacts({ summary: 'Your cash flow is negative $3,000.' }, surplus).valid).toBe(false);
    // Stated correctly, the same fact still grounds.
    expect(validateResponseFacts({ summary: 'You have $3,000 left over each month.' }, surplus).valid).toBe(true);
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
  const pack = buildCanonicalFactPack(messy, question, questionNeedsFromPacks([], true));

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
        provenanceLabel: 'Average monthly operating cash flow',
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

  it('carries removal across adjacent list items', () => {
    // A claim and the sentence depending on it are as often two bullets as two
    // sentences, and each bullet is stripped separately.
    const response = {
      summary: 'Your portfolio is worth $1.92 million.',
      insights: ['Equities are 59% of the portfolio.', 'That is risky this close to retirement.'],
    };
    const salvaged = salvageUngroundedResponse(response, pack, validateResponseFacts(response, pack));

    expect(salvaged.insights).toEqual([]);
  });

  it('keeps self-contained sentences that merely start with a demonstrative', () => {
    // "This year" is a date, not a reference to the sentence before it, and
    // "It is prudent" is a dummy subject — neither should be collateral.
    const response = {
      summary: 'Your portfolio is worth $1.92 million. Equities are 59% of it. This year, review your beneficiaries.',
      insights: ['Equities are 15% overweight.', 'It is prudent to rebalance.'],
    };
    const salvaged = salvageUngroundedResponse(response, pack, validateResponseFacts(response, pack));

    expect(salvaged.summary).toContain('This year, review your beneficiaries.');
    expect(salvaged.summary).not.toContain('59%');
    expect(salvaged.insights).toEqual(['It is prudent to rebalance.']);
  });

  it('does not pass an abbreviation off as a surviving summary', () => {
    // "U.S." must not read as a complete sentence that outlived the strip.
    const response = { summary: 'U.S. stocks could lose $999,999 next year.' };
    const salvaged = salvageUngroundedResponse(response, pack, validateResponseFacts(response, pack));

    expect(salvaged.summary).toBe(UNVERIFIABLE_SUMMARY);
  });

  it('records which sentences and key numbers salvage removed', () => {
    const response = {
      summary: 'Your portfolio is worth $1.92 million. A 20% drop would cost you $384,000. That is a big hit.',
      insights: ['You could add $50,000 a year.'],
      key_numbers: { made_up: { value: 42, unit: 'usd' as const, provenance: 'no_such_fact' } },
    };
    const { response: salvaged, removals } = salvageUngroundedResponseWithDetail(
      response,
      pack,
      validateResponseFacts(response, pack)
    );

    expect(salvaged.summary).toContain('$1.92 million');
    // Summary sentences first, in order, then each list item.
    expect(removals.sentences.map((sentence) => sentence.reason)).toEqual([
      'unsupported_value',
      'dependent_on_removed',
      'unsupported_value',
    ]);
    const dropped = removals.sentences.find((sentence) => sentence.text.includes('384,000'));
    expect(dropped).toMatchObject({ field: 'summary', unsupportedValues: ['20%', '$384,000'] });
    expect(removals.sentences.find((sentence) => sentence.field === 'insight')).toMatchObject({ index: 0 });
    expect(removals.keyNumbers).toEqual([{
      key: 'made_up',
      value: 42,
      unit: 'usd',
      provenance: 'no_such_fact',
      issues: ['made_up does not cite a canonical fact.'],
    }]);
    expect(removals.replacedSummary).toBeUndefined();
  });

  it('keeps the discarded summary when the answer is replaced wholesale', () => {
    const response = { summary: 'Your net worth is $12,345,678.', insights: ['Also unverifiable: $99,999.'] };
    const { response: salvaged, removals } = salvageUngroundedResponseWithDetail(
      response,
      pack,
      validateResponseFacts(response, pack)
    );

    expect(salvaged.summary).toBe(UNVERIFIABLE_SUMMARY);
    expect(removals.replacedSummary).toBe('Your net worth is $12,345,678.');
    expect(removals.sentences).toHaveLength(2);
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
