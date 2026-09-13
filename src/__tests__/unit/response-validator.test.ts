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

  it('shows the reviewer the connection gaps behind an incomplete-totals caveat', () => {
    // The reported objection: the answer said "6 accounts that aren't currently
    // reporting" from the quality block the context pack hands the primary
    // model, and the reviewer -- which could not see it -- called it invented.
    const summary = buildSnapshotSummaryForValidation({
      ...snapshot,
      financialSummary: {
        ...snapshot.financialSummary,
        quality: {
          unavailableSourceIds: ['a', 'b', 'c', 'd', 'e'],
          requiredUnavailableSourceIds: ['f'],
          staleSourceIds: ['g'],
          errors: [{ sourceId: 'a', message: 'login required' }],
        },
      },
    } as any);

    expect(summary).toContain('6 account connection(s) not reporting, so the totals above may be incomplete');
    expect(summary).toContain('1 source(s) too old to count as current');
    expect(summary).toContain('1 source(s) reported an error');
  });

  it('stays silent when the quality report is clean', () => {
    // deriveSnapshotQuality always returns this object, with empty arrays when
    // nothing is wrong. Announcing "0 account connection(s) not reporting"
    // under an incomplete-totals heading would hand the reviewer a false
    // premise for accepting a caveat the answer had no basis for.
    const summary = buildSnapshotSummaryForValidation({
      ...snapshot,
      financialSummary: {
        ...snapshot.financialSummary,
        quality: {
          staleSourceIds: [],
          unavailableSourceIds: [],
          requiredUnavailableSourceIds: [],
          errors: [],
        },
      },
    } as any);

    expect(summary).not.toContain('Data quality');
  });

  it('does not call staleness or a source error an incomplete total', () => {
    // The totals still carry those sources' last known values.
    const summary = buildSnapshotSummaryForValidation({
      ...snapshot,
      financialSummary: {
        ...snapshot.financialSummary,
        quality: { staleSourceIds: ['a'], errors: [{ sourceId: 'b', message: 'timeout' }] },
      },
    } as any);

    expect(summary).toContain('Data quality');
    expect(summary).not.toContain('may be incomplete');
    expect(summary).not.toContain('not reporting');
  });

  it('counts connection gaps the way the user-facing ask counts them', () => {
    // Advisory annotations cannot be cleared by reconnecting, so the ask
    // excludes them. A reviewer told a different number would object to the
    // answer's own wording.
    const summary = buildSnapshotSummaryForValidation({
      ...snapshot,
      financialSummary: {
        ...snapshot.financialSummary,
        quality: {
          unavailableSourceIds: ['a', 'b', 'b', 'c:holdings-coverage', 'd:balance-derived'],
        },
      },
    } as any);

    expect(summary).toContain('2 account connection(s) not reporting');
  });

  it('says nothing about data quality when the snapshot carries none', () => {
    expect(buildSnapshotSummaryForValidation(snapshot)).not.toContain('Data quality');
  });

  it('says nothing about data quality when the quality object is empty', () => {
    // Production snapshots always attach quality; an empty object must not
    // become "0 connections not reporting" / "totals may be incomplete."
    const summary = buildSnapshotSummaryForValidation({
      ...snapshot,
      financialSummary: {
        ...snapshot.financialSummary,
        quality: {
          unavailableSourceIds: [],
          requiredUnavailableSourceIds: [],
          staleSourceIds: [],
          errors: [],
        },
      },
    } as any);

    expect(summary).not.toContain('Data quality');
    expect(summary).not.toContain('not reporting');
  });

  it('names the accounts the model was given', () => {
    // The reviewer objected that answers "invent specific accounts" when they
    // named the accounts a projection left out -- names the primary model had
    // in its context pack and this summary did not carry.
    const summary = buildSnapshotSummaryForValidation({
      ...snapshot,
      contextSelection: { accountsIncluded: true },
      accounts: [
        { id: '1', name: 'Baron Funds IRA', type: 'investment', subtype: 'ira', balance: 100_000, institution: 'Baron' },
        { id: '2', name: 'BEC 401K', type: 'investment', balance: 250_000 },
      ],
    } as any);

    expect(summary).toContain('Baron Funds IRA (investment/ira) at Baron');
    expect(summary).toContain('BEC 401K (investment)');
  });

  it('omits the account list when the plan did not include account details', () => {
    // Snapshot.accounts is always populated for other consumers; only
    // contextSelection says whether the primary model saw them.
    const summary = buildSnapshotSummaryForValidation({
      ...snapshot,
      contextSelection: { accountsIncluded: false },
      accounts: [
        { id: '1', name: 'Baron Funds IRA', type: 'investment', subtype: 'ira', balance: 100_000, institution: 'Baron' },
      ],
    } as any);

    expect(summary).not.toContain('Accounts');
    expect(summary).not.toContain('Baron Funds IRA');
  });

  it('shows what the projection excluded, and from which accounts', () => {
    const summary = buildSnapshotSummaryForValidation({
      ...snapshot,
      retirementAnalysis: {
        dataQuality: {
          modeledValue: 760_134,
          unmodeledValue: 548_586,
          valueCoverage: 0.5808,
          unmodeledReasons: [
            { label: 'Wells Fargo 401(k)', amount: 385_784, kind: 'partial-holdings' },
            { label: 'BEC 401K', amount: 162_802, kind: 'no-holdings' },
          ],
        },
      },
    } as any);

    expect(summary).toContain('Projection coverage: modeledValue=760134, unmodeledValue=548586');
    expect(summary).toContain('41.9% of investments excluded');
    expect(summary).toContain('Wells Fargo 401(k)=385784 (partial-holdings)');
    expect(summary).toContain('BEC 401K=162802 (no-holdings)');
  });

  it('lists the largest exclusion reasons first when capping the list', () => {
    // buildCanonicalFactPack sorts by amount before its own cap. Keeping source
    // order here would drop a large reason past position 15 that grounding still
    // accepts, and the reviewer would reject the caveat this change preserves.
    const unmodeledReasons = Array.from({ length: 16 }, (_, index) => ({
      label: `Account ${index + 1}`,
      amount: index + 1,
      kind: 'no-holdings',
    }));
    unmodeledReasons[15] = { label: 'Largest account', amount: 500_000, kind: 'partial-holdings' };

    const summary = buildSnapshotSummaryForValidation({
      ...snapshot,
      retirementAnalysis: {
        dataQuality: {
          modeledValue: 100_000,
          unmodeledValue: 500_136,
          valueCoverage: 0.1666,
          unmodeledReasons,
        },
      },
    } as any);

    expect(summary).toContain('Largest account=500000 (partial-holdings)');
    expect(summary).not.toContain('Account 1=1');
  });

  it('says nothing about coverage when the whole portfolio was modeled', () => {
    const summary = buildSnapshotSummaryForValidation({
      ...snapshot,
      retirementAnalysis: {
        dataQuality: { modeledValue: 1_000_000, unmodeledValue: 0, valueCoverage: 1, unmodeledReasons: [] },
      },
    } as any);

    expect(summary).not.toContain('Projection coverage');
  });
});
