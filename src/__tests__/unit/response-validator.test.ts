import { buildSnapshotSummaryForValidation, formatMetricPercent } from '../../openai/response-validator';

describe('formatMetricPercent', () => {
  it('converts decimal fractions to whole-number percents', () => {
    expect(formatMetricPercent(0.153846)).toBe('15.38%');
    expect(formatMetricPercent(0.08)).toBe('8.00%');
  });

  it('handles zero survival rate', () => {
    expect(formatMetricPercent(0, 1)).toBe('0.0%');
  });

  it('handles rates above 1 as fractions (e.g. 150% withdrawal/portfolio)', () => {
    expect(formatMetricPercent(1.5)).toBe('150.00%');
  });

  it('returns N/A for non-finite values', () => {
    expect(formatMetricPercent(undefined)).toBe('N/A');
    expect(formatMetricPercent(NaN)).toBe('N/A');
  });
});

describe('buildSnapshotSummaryForValidation', () => {
  const snapshot = {
    accounts: [],
    bankingTransactions: [],
    metadata: { lastUpdated: new Date(), dataSources: {}, errors: [] },
    tierContext: { tierInfo: { currentTier: 'premium', availableSources: [] }, upgradeHints: [] },
    financialSummary: {
      financialOverview: { netWorth: 500000, totalCash: 40000, totalInvestments: 460000, totalDebt: 0, homeValue: null },
    },
  } as any;

  it('shows the reviewer the remembered personal context the model was given', () => {
    // Omitting it made the reviewer object that an answer had invented the
    // user's age -- demographics the primary model was in fact handed.
    const summary = buildSnapshotSummaryForValidation({
      ...snapshot,
      userProfile: '- The user is 77 years old.\n- Retirement status: retired',
    });
    expect(summary).toContain('Remembered personal context');
    expect(summary).toContain('77 years old');
    expect(summary).toContain('retired');
  });

  it('bounds each line without dropping the fields written last', () => {
    // formatPersonalContextForModel emits occupation, employment status and
    // retirement status at the end, so a prefix cut on the whole block would
    // hide exactly the details the reported objection was about.
    const profile = [
      `- Occupation: ${'x'.repeat(2_000)}`,
      '- Employment status: retired',
      '- Retirement status: retired',
    ].join('\n');
    const summary = buildSnapshotSummaryForValidation({ ...snapshot, userProfile: profile });

    expect(summary).toContain('x'.repeat(180));
    expect(summary).not.toContain('x'.repeat(201));
    expect(summary).toContain('- Employment status: retired');
    expect(summary).toContain('- Retirement status: retired');
  });

  it('says nothing about personal context when none was loaded', () => {
    expect(buildSnapshotSummaryForValidation(snapshot)).not.toContain('Remembered personal context');
  });
});
