import { describe, expect, it } from '@jest/globals';
import {
  describeUnmodeledInvestmentValue,
  summarizeUnmodeledInvestmentValue,
  UNMODELED_VALUE_NOTE_PREFIX,
} from '../../services/investment-coverage';
import {
  calculateConfidenceCeiling,
  calculateDataQuality,
  generateDisclaimers,
} from '../../retirement-analytics/interpretation/uncertainty-quantifier';

const holding = (accountId: string, value: number) => ({
  id: `${accountId}-h`,
  account_id: accountId,
  security_id: `${accountId}-sec`,
  ticker_symbol: accountId.toUpperCase(),
  institution_value: value,
  iso_currency_code: 'USD',
});

const mapping = {
  usEquityWeight: 1,
  internationalEquityWeight: 0,
  nominalBondsWeight: 0,
  cashWeight: 0,
  totalValue: 804_827.9,
  mappedValue: 804_827.9,
  unmappedValue: 0,
  valueCoverage: 1,
  proxiedValue: 0,
  proxiedValuePercentage: 0,
  holdingExposures: [],
  mappingConfidence: 'high' as const,
  unmappedHoldings: [],
  partiallyMappedHoldings: [],
  mappingMethod: 'direct' as const,
  targetDateFunds: [],
};

describe('unmodeled investment value', () => {
  it('measures value a partial holdings feed leaves out and names the account', () => {
    const summary = summarizeUnmodeledInvestmentValue({
      totalInvestments: 1_191_430.96,
      holdings: [holding('401k', 804_827.9)],
      accounts: [{ id: '401k', name: 'Wells Fargo 401(k) Plan', type: 'investment', balance: 1_191_430.96 }],
      coverageGaps: [{ accountId: '401k', unexplainedValue: 386_603.06 }],
    });

    expect(summary).not.toBeNull();
    expect(summary!.modeledValue).toBeCloseTo(804_827.9, 2);
    expect(summary!.unmodeledValue).toBeCloseTo(386_603.06, 2);
    expect(summary!.valueCoverage).toBeCloseTo(804_827.9 / 1_191_430.96, 6);
    expect(summary!.reasons).toEqual([{
      accountId: '401k',
      label: 'Wells Fargo 401(k) Plan',
      amount: 386_603.06,
      kind: 'partial-holdings',
    }]);
  });

  it('counts an investment account that has a balance and no holdings at all', () => {
    // A manual account is invisible to a position-level model however complete
    // the holdings it never supplied are.
    const summary = summarizeUnmodeledInvestmentValue({
      totalInvestments: 145_894.76,
      holdings: [holding('brokerage', 100_000)],
      accounts: [
        { id: 'brokerage', name: 'Brokerage', type: 'investment', balance: 100_000 },
        { id: 'pension', name: 'Pension', type: 'investment', balance: 45_894.76 },
      ],
    });

    expect(summary!.unmodeledValue).toBeCloseTo(45_894.76, 2);
    expect(summary!.reasons).toEqual([{
      accountId: 'pension',
      label: 'Pension',
      amount: 45_894.76,
      kind: 'no-holdings',
    }]);
  });

  it('reports both causes together, largest first', () => {
    const summary = summarizeUnmodeledInvestmentValue({
      totalInvestments: 2_300_988.67,
      holdings: [holding('401k', 804_827.9), holding('ira', 1_063_662.66)],
      accounts: [
        { id: '401k', name: '401(k)', type: 'investment', balance: 1_191_430.96 },
        { id: 'ira', name: 'IRA', type: 'investment', balance: 1_063_662.66 },
        { id: 'pension', name: 'Pension', type: 'investment', balance: 45_894.76 },
      ],
      coverageGaps: [{ accountId: '401k', unexplainedValue: 386_603.06 }],
    });

    expect(summary!.unmodeledValue).toBeCloseTo(432_498.11, 2);
    expect(summary!.reasons.map(reason => reason.label)).toEqual(['401(k)', 'Pension']);
  });

  it('stays silent when the holdings explain the canonical total', () => {
    expect(summarizeUnmodeledInvestmentValue({
      totalInvestments: 100_000,
      holdings: [holding('brokerage', 100_000)],
      accounts: [{ id: 'brokerage', name: 'Brokerage', type: 'investment', balance: 100_000 }],
    })).toBeNull();
  });

  it('treats a sub-dollar difference as pricing skew rather than missing value', () => {
    expect(summarizeUnmodeledInvestmentValue({
      totalInvestments: 100_000.4,
      holdings: [holding('brokerage', 100_000)],
    })).toBeNull();
  });

  it('does not count a cash account that simply holds no securities', () => {
    const summary = summarizeUnmodeledInvestmentValue({
      totalInvestments: 150_000,
      holdings: [holding('brokerage', 100_000)],
      accounts: [
        { id: 'brokerage', name: 'Brokerage', type: 'investment', balance: 100_000 },
        { id: 'checking', name: 'Checking', type: 'depository', balance: 50_000 },
      ],
    });

    // The total is still short, but a checking account is not an unmodeled
    // investment -- it belongs to cash and must not be attributed here.
    expect(summary!.unmodeledValue).toBeCloseTo(50_000, 2);
    expect(summary!.reasons).toEqual([]);
  });

  it('counts every holding the engine sums, including one priced in another currency', () => {
    // The retirement engine applies no currency rule to institution_value, so a
    // modeled basis that filtered by currency would describe the projection as
    // running on a figure it never used.
    const summary = summarizeUnmodeledInvestmentValue({
      totalInvestments: 150_000,
      holdings: [
        holding('brokerage', 100_000),
        { ...holding('eu', 50_000), iso_currency_code: 'EUR' },
      ],
    });

    // Both holdings are in the basis, so nothing is left unexplained.
    expect(summary).toBeNull();
  });
});

describe('unmodeled value note', () => {
  it('states the amount, the accounts, the reason, and the direction of the error', () => {
    const note = describeUnmodeledInvestmentValue({
      totalInvestments: 2_300_988.67,
      modeledValue: 1_868_490.56,
      unmodeledValue: 432_498.11,
      valueCoverage: 1_868_490.56 / 2_300_988.67,
      reasons: [
        { accountId: '401k', label: 'Wells Fargo 401(k)', amount: 386_603.06, kind: 'partial-holdings' },
        { accountId: 'pension', label: 'Pension', amount: 45_894.76, kind: 'no-holdings' },
      ],
    });

    expect(note).toContain('$432,498');
    expect(note).toContain('$386,603 of Wells Fargo 401(k) is not itemized by the provider');
    expect(note).toContain('$45,895 in Pension has no holdings detail');
    expect(note).toContain('19%');
    expect(note).toContain('$1,868,491');
    expect(note).toContain('floor');
    expect(note).toContain('overstated');
    expect(note).toContain('ceilings on the true rate');
    expect(note!.startsWith(UNMODELED_VALUE_NOTE_PREFIX)).toBe(true);
  });

  it('still states the amount when the cause cannot be attributed to an account', () => {
    // A snapshot written before per-account residuals were recorded knows the
    // total is short without knowing which account is short. Naming no account
    // is better than staying silent about the money.
    const note = describeUnmodeledInvestmentValue({
      totalInvestments: 1_000_000,
      modeledValue: 900_000,
      unmodeledValue: 100_000,
      valueCoverage: 0.9,
      reasons: [],
    });

    expect(note).toContain('$100,000');
    expect(note).toContain('10%');
    expect(note).not.toContain('()');
  });

  it('says nothing when nothing is excluded', () => {
    expect(describeUnmodeledInvestmentValue(null)).toBeNull();
  });
});

describe('retirement data quality with excluded value', () => {
  const holdings = [holding('401k', 804_827.9)] as any[];
  const securities = [{ security_id: '401k-sec', type: 'equity', ticker_symbol: '401K' }] as any[];

  it('reports what was modeled and what was left out', () => {
    const quality = calculateDataQuality(holdings, securities, mapping, 1, [], [], {
      totalInvestments: 1_191_430.96,
      modeledValue: 804_827.9,
      unmodeledValue: 386_603.06,
      valueCoverage: 804_827.9 / 1_191_430.96,
      reasons: [{ accountId: '401k', label: '401(k)', amount: 386_603.06, kind: 'partial-holdings' }],
    });

    expect(quality.modeledValue).toBeCloseTo(804_827.9, 2);
    expect(quality.unmodeledValue).toBeCloseTo(386_603.06, 2);
    expect(quality.valueCoverage).toBeLessThan(0.7);
    expect(quality.unmodeledReasons).toEqual([{ label: '401(k)', amount: 386_603.06, kind: 'partial-holdings' }]);
  });

  it('combines not-itemized value with itemized holdings the mapper excluded', () => {
    const internalGap = {
      ...mapping,
      mappedValue: 704_827.9,
      unmappedValue: 100_000,
      valueCoverage: 704_827.9 / 804_827.9,
      mappingConfidence: 'low' as const,
      unmappedHoldings: ['Unknown Plan Fund'],
    };
    const quality = calculateDataQuality(holdings, securities, internalGap, 1, [], [], {
      totalInvestments: 1_191_430.96,
      modeledValue: 804_827.9,
      unmodeledValue: 386_603.06,
      valueCoverage: 804_827.9 / 1_191_430.96,
      reasons: [{ accountId: '401k', label: '401(k)', amount: 386_603.06, kind: 'partial-holdings' }],
    });

    expect(quality.modeledValue).toBeCloseTo(704_827.9, 2);
    expect(quality.unmodeledValue).toBeCloseTo(486_603.06, 2);
    expect(quality.valueCoverage).toBeCloseTo(704_827.9 / 1_191_430.96, 8);
    expect(quality.unmodeledReasons).toEqual([
      { label: '401(k)', amount: 386_603.06, kind: 'partial-holdings' },
      { label: 'Unrecognized or unsupported holdings', amount: 100_000, kind: 'unrecognized-holdings' },
    ]);
    expect(generateDisclaimers(quality)[0]).toContain(
      '$100,000 in Unrecognized or unsupported holdings has no supported asset-class mapping',
    );
  });

  it('does not report a partially supported fund as wholly missing', () => {
    const partialFund = {
      ...mapping,
      mappedValue: 780_000,
      unmappedValue: 24_827.9,
      valueCoverage: 780_000 / 804_827.9,
      mappingConfidence: 'medium' as const,
      partiallyMappedHoldings: ['Target Retirement 2040 Fund'],
    };

    const quality = calculateDataQuality(holdings, securities, partialFund, 1, []);

    expect(quality.missingData).not.toContain('Target Retirement 2040 Fund');
    expect(quality.proxyUsage.unmappedHoldings).toEqual([]);
    expect(quality.unmodeledReasons).toContainEqual({
      label: 'Unrecognized or unsupported holdings',
      amount: 24_827.9,
      kind: 'unrecognized-holdings',
    });
  });

  it('treats a fully explained portfolio as complete rather than unmodeled', () => {
    const quality = calculateDataQuality(holdings, securities, mapping, 1, []);
    expect(quality.unmodeledValue).toBe(0);
    expect(quality.valueCoverage).toBe(1);
    expect(quality.modeledValue).toBeCloseTo(804_827.9, 2);
  });

  it('caps confidence when dollars are missing even though every holding has metadata', () => {
    // completeness is holdings-count based and stays at 1.0 here; only the
    // dollar-weighted measure notices that a fifth of the money is absent.
    const quality = calculateDataQuality(holdings, securities, mapping, 1, [], [], {
      totalInvestments: 1_191_430.96,
      modeledValue: 804_827.9,
      unmodeledValue: 386_603.06,
      valueCoverage: 804_827.9 / 1_191_430.96,
      reasons: [],
    });

    expect(quality.completeness).toBe(1);
    expect(calculateConfidenceCeiling(quality)).toBe('medium');
  });

  it('hard-caps the result at low when portfolio mapping confidence is low', () => {
    const quality = calculateDataQuality(
      holdings,
      securities,
      { ...mapping, mappingConfidence: 'low' as const },
      1,
      [],
    );

    expect(calculateConfidenceCeiling(quality)).toBe('low');
  });

  it('still caps confidence when only valueCoverage is restated onto otherwise-high data quality', () => {
    // Cache hits restate coverage onto a stored analysis without re-running the
    // engine; the ceiling must still see the restated valueCoverage.
    const quality = calculateDataQuality(holdings, securities, mapping, 1, []);
    expect(calculateConfidenceCeiling(quality)).toBe('high');
    expect(calculateConfidenceCeiling({
      ...quality,
      valueCoverage: 0.812,
      unmodeledValue: 386_603.06,
      modeledValue: 804_827.9,
    })).toBe('medium');
  });

  it('never promotes a stored low confidence, because a ceiling only caps', () => {
    // A newly calculated high or medium ceiling must not promote a stored low.
    const quality = calculateDataQuality(holdings, securities, mapping, 1, []);
    const ceiling = calculateConfidenceCeiling(quality);
    const rank: Record<string, number> = { low: 0, medium: 1, high: 2 };
    const capped = (stored: string) => (rank[stored] < rank[ceiling] ? stored : ceiling);

    expect(capped('low')).toBe('low');
    expect(capped('high')).toBe(ceiling);
  });

  it('still allows high confidence when the whole portfolio is modeled', () => {
    expect(calculateConfidenceCeiling(calculateDataQuality(holdings, securities, mapping, 1, [])))
      .toBe('high');
  });

  it('leads the disclaimers with the exclusion rather than burying it', () => {
    const quality = calculateDataQuality(holdings, securities, mapping, 1, [], [], {
      totalInvestments: 1_191_430.96,
      modeledValue: 804_827.9,
      unmodeledValue: 386_603.06,
      valueCoverage: 804_827.9 / 1_191_430.96,
      reasons: [{ accountId: '401k', label: '401(k)', amount: 386_603.06, kind: 'partial-holdings' }],
    });
    const disclaimers = generateDisclaimers(quality);

    expect(disclaimers[0].startsWith(UNMODELED_VALUE_NOTE_PREFIX)).toBe(true);
    expect(disclaimers[0]).toContain('$386,603');
  });

  it('adds no exclusion disclaimer when nothing is excluded', () => {
    const disclaimers = generateDisclaimers(calculateDataQuality(holdings, securities, mapping, 1, []));
    expect(disclaimers.some(text => text.startsWith(UNMODELED_VALUE_NOTE_PREFIX))).toBe(false);
  });
});
