import { describe, expect, it, beforeAll } from '@jest/globals';
import { simulateWithdrawals } from '../../retirement-analytics/engine/withdrawal-simulator';
import { summarizeHoldingExposures } from '../../retirement-analytics/engine/portfolio-mapper';
import type { HistoricalSequence } from '../../retirement-analytics/types';
import { analyzeRetirementPortfolio } from '../../retirement-analytics';
import {
  clearQuickPlanCache,
  normalizeQuickPlanRequest,
  QuickPlanValidationError,
  QUICKPLAN_ALLOCATIONS,
  runRetirementQuickPlan,
  DEFAULT_LIFE_EXPECTANCY,
  DEFAULT_PLANNING_RETIREMENT_AGE,
  DEFAULT_SOCIAL_SECURITY_START_AGE,
  resolveQuickPlanRequest,
} from '../../services/retirement-quickplan';

/** An all-cash portfolio with zero returns and zero inflation: pure arithmetic. */
function cashOnlyMapping() {
  return summarizeHoldingExposures([
    {
      holdingId: 'cash',
      label: 'Cash',
      value: 100_000,
      status: 'mapped',
      weights: { usEquity: 0, internationalEquity: 0, nominalBonds: 0, tips: 0, cash: 1 },
      method: 'provider',
      confidence: 'high',
    },
  ]);
}

function flatSequence(months: number): HistoricalSequence {
  const zeroes = Array.from({ length: months }, () => 0);
  return {
    startDate: new Date('2000-01-01T00:00:00.000Z'),
    endDate: new Date('2000-01-01T00:00:00.000Z'),
    sequenceId: 'flat',
    assetBasketReturns: {
      usEquity: [...zeroes],
      internationalEquity: [...zeroes],
      nominalBonds: [...zeroes],
      cash: [...zeroes],
    },
    inflationRates: [...zeroes],
  };
}

const BASE_REQUEST = {
  currentAge: 52,
  retirementAge: 60,
  investableAssets: 1_200_000,
  annualSpending: 95_000,
  annualContributions: 35_000,
  socialSecurityAnnual: 36_000,
  socialSecurityStartAge: 67,
  allocation: 'balanced' as const,
};

describe('withdrawal simulator income offset', () => {
  it('reduces the portfolio withdrawal only from the income start month', () => {
    const mapping = cashOnlyMapping();
    const months = 24;

    const withoutIncome = simulateWithdrawals(mapping, 100_000, flatSequence(months), 12_000);
    // Income covering the whole withdrawal, but only for the second year.
    const withIncome = simulateWithdrawals(mapping, 100_000, flatSequence(months), 12_000, {
      incomeOffset: { annualAmount: 12_000, startMonth: 12 },
    });

    expect(withoutIncome.finalValue).toBeCloseTo(100_000 - 24_000, 6);
    expect(withIncome.finalValue).toBeCloseTo(100_000 - 12_000, 6);
  });

  it('does not reinvest income above that year\'s spending', () => {
    const mapping = cashOnlyMapping();
    const withSurplus = simulateWithdrawals(mapping, 100_000, flatSequence(12), 12_000, {
      incomeOffset: { annualAmount: 60_000, startMonth: 0 },
    });

    // Withdrawals floor at zero; the extra $48k is not credited to the portfolio.
    expect(withSurplus.finalValue).toBeCloseTo(100_000, 6);
  });

  it('never pays income before withdrawals begin', () => {
    const mapping = cashOnlyMapping();
    const outcome = simulateWithdrawals(mapping, 100_000, flatSequence(24), 12_000, {
      withdrawalDelayMonths: 12,
      incomeOffset: { annualAmount: 12_000, startMonth: 0 },
    });

    // Year one: not withdrawing, and the income is not banked. Year two:
    // withdrawing $12k fully covered by the income.
    expect(outcome.finalValue).toBeCloseTo(100_000, 6);
  });

  it('rejects a negative or non-finite income offset', () => {
    const mapping = cashOnlyMapping();
    expect(() =>
      simulateWithdrawals(mapping, 100_000, flatSequence(12), 12_000, {
        incomeOffset: { annualAmount: -1, startMonth: 0 },
      })
    ).toThrow(/non-negative/);
    expect(() =>
      simulateWithdrawals(mapping, 100_000, flatSequence(12), 12_000, {
        incomeOffset: { annualAmount: 12_000, startMonth: Number.NaN },
      })
    ).toThrow(/start month/);
  });

  it('leaves results unchanged when no income offset is supplied', () => {
    const mapping = cashOnlyMapping();
    const a = simulateWithdrawals(mapping, 100_000, flatSequence(24), 12_000);
    const b = simulateWithdrawals(mapping, 100_000, flatSequence(24), 12_000, {});
    expect(a).toEqual(b);
  });
});

describe('quick plan input validation', () => {
  it('applies documented defaults for the optional fields', () => {
    const inputs = normalizeQuickPlanRequest({
      currentAge: 40,
      retirementAge: 65,
      investableAssets: 500_000,
      annualSpending: 70_000,
      annualContributions: 20_000,
      socialSecurityAnnual: 30_000,
    });

    expect(inputs.lifeExpectancy).toBe(DEFAULT_LIFE_EXPECTANCY);
    expect(inputs.socialSecurityStartAge).toBe(DEFAULT_SOCIAL_SECURITY_START_AGE);
    expect(inputs.allocation).toBe('balanced');
  });

  it('extends the default horizon when retirement age meets the usual life expectancy', () => {
    const inputs = normalizeQuickPlanRequest({
      ...BASE_REQUEST,
      currentAge: 90,
      retirementAge: 95,
    });

    expect(inputs.lifeExpectancy).toBe(96);
  });

  it('accepts formatted currency strings from the form', () => {
    const inputs = normalizeQuickPlanRequest({
      ...BASE_REQUEST,
      investableAssets: '$1,200,000',
      annualSpending: ' 95,000 ',
    });

    expect(inputs.investableAssets).toBe(1_200_000);
    expect(inputs.annualSpending).toBe(95_000);
  });

  it('rejects a retirement age before the current age', () => {
    expect(() => normalizeQuickPlanRequest({ ...BASE_REQUEST, currentAge: 62, retirementAge: 60 }))
      .toThrow(QuickPlanValidationError);
  });

  // The engine only projects forward, so an already-retired visitor entering
  // both of their real ages is rejected. Stating the rule leaves them stuck;
  // the message has to name the input that models their situation.
  it('tells an already retired visitor how to model retiring now', () => {
    try {
      normalizeQuickPlanRequest({ ...BASE_REQUEST, currentAge: 70, retirementAge: 62 });
      throw new Error('expected a validation error');
    } catch (error) {
      expect(error).toBeInstanceOf(QuickPlanValidationError);
      expect((error as QuickPlanValidationError).field).toBe('retirementAge');
      expect((error as QuickPlanValidationError).message).toContain('already retired');
    }
  });

  it('rejects a horizon that ends at or before retirement', () => {
    expect(() => normalizeQuickPlanRequest({ ...BASE_REQUEST, lifeExpectancy: 60 }))
      .toThrow(/must end after your retirement age/);
  });

  it('rejects an unknown allocation preset', () => {
    expect(() => normalizeQuickPlanRequest({ ...BASE_REQUEST, allocation: 'aggressive' }))
      .toThrow(/Allocation must be one of/);
  });

  it('rejects out-of-range and non-numeric values with the offending field', () => {
    expect.assertions(2);
    try {
      normalizeQuickPlanRequest({ ...BASE_REQUEST, investableAssets: 0 });
    } catch (error) {
      expect((error as QuickPlanValidationError).field).toBe('investableAssets');
    }
    try {
      normalizeQuickPlanRequest({ ...BASE_REQUEST, currentAge: 'soon' });
    } catch (error) {
      expect((error as QuickPlanValidationError).field).toBe('currentAge');
    }
  });
});

/**
 * One full-record run is shared across the assertions below. Each engine run is
 * hundreds of overlapping century-long sequences, so a fresh run per test would
 * dominate the suite; the service caches on normalized inputs, and the results
 * are deterministic, so reusing it changes nothing that is being asserted.
 */
describe('quick plan results', () => {
  type PlanResult = Awaited<ReturnType<typeof runRetirementQuickPlan>>;
  /**
   * `primary` and the dollar spending distribution are null in rates mode, so
   * the type will not let them be read without a check. Every case here
   * supplies a complete plan, and this narrows once rather than per assertion.
   */
  type CompletePlan = PlanResult & {
    primary: NonNullable<PlanResult['primary']>;
    sustainableSpending: NonNullable<PlanResult['sustainableSpending']>;
  };
  let full: CompletePlan;

  beforeAll(async () => {
    clearQuickPlanCache();
    const result = await runRetirementQuickPlan(BASE_REQUEST);
    if (result.mode !== 'plan' || !result.primary || !result.sustainableSpending) {
      throw new Error('a complete request must produce a plan-mode result');
    }
    full = result as CompletePlan;
  }, 120_000);

  it('runs the engine against the full record, not just the post-1975 window', () => {
    // Every preset is US-only precisely so the international series' 1975 start
    // does not truncate the record. If a sleeve is ever added back, this fails.
    expect(full.history.firstMonth.startsWith('1926')).toBe(true);
    expect(full.history.firstStartMonth).toBe(full.history.firstMonth);
    expect(full.history.sequencesTested).toBeGreaterThan(500);
    expect(full.primary.sequencesTested).toBe(full.history.sequencesTested);
    for (const allocation of Object.values(QUICKPLAN_ALLOCATIONS)) {
      expect(allocation.usEquity + allocation.bonds + allocation.cash).toBeCloseTo(1, 10);
    }
  });

  it('reports the last start window one month per sequence after the first', () => {
    const [firstYear, firstMonth] = full.history.firstStartMonth.split('-').map(Number);
    const [lastYear, lastMonth] = full.history.lastStartMonth.split('-').map(Number);
    const spanMonths = (lastYear * 12 + lastMonth) - (firstYear * 12 + firstMonth);

    expect(spanMonths).toBe(full.history.sequencesTested - 1);
  });

  it('offers later retirement and lower spending as alternatives', () => {
    expect(full.alternatives.map((alternative) => alternative.id))
      .toEqual(['retire-at-62', 'retire-at-65', 'spend-10-less']);
    for (const alternative of full.alternatives) {
      expect(alternative.survivalRate).toBeGreaterThanOrEqual(full.primary.survivalRate);
    }
  });

  it('counts surviving sequences consistently with the rate it reports', () => {
    expect(full.primary.sequencesSurvived)
      .toBe(Math.round(full.primary.survivalRate * full.primary.sequencesTested));
  });

  it('states every assumption the visitor did not supply', () => {
    const limitations = full.limitations.join(' ');

    expect(limitations).toContain('Balanced');
    expect(limitations).toContain('Fund fees are not modeled');
    expect(limitations).toContain('Taxes');
    expect(limitations).toContain('no international stocks');
    expect(limitations).toContain('July 1926');
    expect(limitations).toContain('all 7 years between retiring and claiming');
    expect(full.assumptions.some((line) => line.includes('Kenneth French'))).toBe(true);
    expect(full.assumptions.some((line) => line.includes('$36,000 of annual retirement income begins at age 67')))
      .toBe(true);
  });

  it('charges the portfolio for the whole first year when Social Security starts later', () => {
    expect(full.primary.firstYearPortfolioWithdrawal).toBe(BASE_REQUEST.annualSpending);
    expect(full.primary.firstYearWithdrawalRate)
      .toBeCloseTo(BASE_REQUEST.annualSpending / full.primary.projectedPortfolioAtRetirement, 12);
  });

  it('scales sustainable spending off the projected portfolio at retirement', () => {
    const { p10, p25, p50, p75, p90, solverFloorRate, solverCeilingRate } = full.sustainableSpending;
    const projected = full.primary.projectedPortfolioAtRetirement;

    expect(p10).toBeLessThanOrEqual(p25);
    expect(p25).toBeLessThanOrEqual(p50);
    expect(p50).toBeLessThanOrEqual(p75);
    expect(p75).toBeLessThanOrEqual(p90);
    expect(p10 / projected).toBeGreaterThanOrEqual(solverFloorRate - 1e-9);
    expect(p90 / projected).toBeLessThanOrEqual(solverCeilingRate + 1e-9);
  });

  it('serves an identical repeat request from cache', async () => {
    const second = await runRetirementQuickPlan({ ...BASE_REQUEST });

    expect(full.cached).toBe(false);
    expect(second.cached).toBe(true);
    expect(second.primary).toEqual(full.primary);
  });
});

/**
 * A deliberately short horizon. These assertions are about the direction the
 * model moves, not the size of the move, and a 15-year window costs a fraction
 * of a full retirement to simulate.
 */
/**
 * The engine-level guard for the fix. An international sleeve used to truncate
 * the tested record to 1975 onward, which quietly removed every bad starting
 * point from the sample and made the same plan look materially safer.
 */
describe('short-series policy', () => {
  const withInternational = [
    { id: 'us', name: 'US Total Stock Market Index', type: 'equity', value: 600_000 },
    { id: 'intl', name: 'International Developed Markets Index Fund', type: 'equity', value: 150_000 },
    { id: 'bond', name: 'US Government Bond Index', type: 'fixed income', value: 200_000 },
    { id: 'cash', name: 'Cash and Cash Equivalents', type: 'cash', value: 50_000 },
  ];

  const run = (policy?: 'proxy' | 'truncate') => {
    const holdings = withInternational.map(entry => ({
      id: entry.id,
      account_id: 'a',
      security_id: entry.id,
      institution_value: entry.value,
      institution_price: null,
      institution_price_as_of: '2026-09-01',
      cost_basis: null,
      quantity: null,
      iso_currency_code: 'USD',
      security_name: entry.name,
      security_type: entry.type,
    }));
    const securities = withInternational.map(entry => ({
      security_id: entry.id,
      name: entry.name,
      type: entry.type,
      iso_currency_code: 'USD',
    }));

    return analyzeRetirementPortfolio({
      holdings,
      securities,
      currentAge: 60,
      retirementAge: 60,
      withdrawalStartAge: 60,
      lifeExpectancy: 90,
      annualWithdrawalAmount: 45_000,
      asOfDate: '2026-09-01',
      ...(policy ? { shortSeriesPolicy: policy } : {}),
    });
  };

  it('tests an international portfolio against the whole record by default', async () => {
    const [byDefault, truncated] = await Promise.all([run(), run('truncate')]);

    expect(byDefault.historicalData?.firstMonth).toBe('1926-07');
    expect(truncated.historicalData?.firstMonth).toBe('1975-01');
    expect(byDefault.stressTest.totalSequences).toBeGreaterThan(
      truncated.stressTest.totalSequences * 2
    );
  }, 300_000);

  it('removes the optimism the truncated window was producing', async () => {
    const [byDefault, truncated] = await Promise.all([run(), run('truncate')]);

    // The 1975-onward window excluded 1929, 1937, 1966 and 1973, so it reported
    // a sustainable rate far above what the literature or the full record
    // supports. This is the substance of the fix, not a cosmetic difference.
    expect(byDefault.metrics.historicalWithdrawalRates.p10).toBeLessThan(
      truncated.metrics.historicalWithdrawalRates.p10
    );
    expect(byDefault.metrics.historicalWithdrawalRates.p10).toBeLessThan(0.055);
    expect(truncated.metrics.historicalWithdrawalRates.p10).toBeGreaterThan(0.06);
  }, 300_000);

  it('discloses the substituted months rather than absorbing them silently', async () => {
    const byDefault = await run();
    const [proxied] = byDefault.historicalData?.proxiedSeries ?? [];

    expect(proxied).toBeDefined();
    expect(proxied.series).toBe('intl_equity');
    expect(proxied.proxy).toBe('us_equity');
    expect(proxied.months).toBeGreaterThan(0);
    expect(proxied.months).toBeLessThan(proxied.windowMonths);
    expect(
      byDefault.dataQuality.assumptions.some(line =>
        line.includes('use the US market return') && line.includes('1926-07')
      )
    ).toBe(true);
  }, 300_000);
});

/**
 * Answering with what is missing.
 *
 * The page must never dead-end on a blank box, and must never invent one of
 * the two figures it has no basis for. These pin both halves: a horizon comes
 * from a stated convention, a portfolio never comes from anywhere.
 */
describe('quick plan with inputs left blank', () => {
  const AGES_ONLY = { currentAge: 68, retirementAge: 70, lifeExpectancy: 85 };

  it('answers an entirely empty request rather than rejecting it', async () => {
    const result = await runRetirementQuickPlan({ lifeExpectancy: 85 });

    expect(result.mode).toBe('rates');
    expect(result.sustainableSpendingRates.p50).toBeGreaterThan(0);
    expect(result.history.sequencesTested).toBeGreaterThan(0);
  }, 120_000);

  it('assumes the conventional horizon and says so, when no age is given', () => {
    const resolved = resolveQuickPlanRequest({ investableAssets: 500_000, annualSpending: 40_000 });

    expect(resolved.inputs.retirementAge).toBe(DEFAULT_PLANNING_RETIREMENT_AGE);
    // No accumulation is invented on top of an unknown current age.
    expect(resolved.inputs.currentAge).toBe(DEFAULT_PLANNING_RETIREMENT_AGE);
    expect(resolved.assumed.map((entry) => entry.field)).toEqual(['retirementAge', 'currentAge']);
    expect(resolved.assumed.every((entry) => entry.note.length > 0)).toBe(true);
  });

  it('keeps a retirement still ahead of a visitor who gave only their age', () => {
    expect(resolveQuickPlanRequest({ currentAge: 40 }).inputs.retirementAge).toBe(65);
    // Already past it: the question is about retiring now, not at 65.
    expect(resolveQuickPlanRequest({ currentAge: 72 }).inputs.retirementAge).toBe(72);
  });

  it('never reports a dollar figure for a portfolio it was not given', async () => {
    const result = await runRetirementQuickPlan({ ...AGES_ONLY, annualSpending: 40_000 });

    expect(result.mode).toBe('rates');
    expect(result.sustainableSpending).toBeNull();
    // A survival rate would be a verdict on a portfolio the visitor never named.
    expect(result.primary).toBeNull();
    expect(result.alternatives).toEqual([]);
    expect(result.assumed.map((entry) => entry.field)).not.toContain('investableAssets');
  }, 120_000);

  it('still prices sustainable spending in dollars when only spending is blank', async () => {
    const result = await runRetirementQuickPlan({ ...AGES_ONLY, investableAssets: 500_000 });

    expect(result.mode).toBe('rates');
    // The projection needs the portfolio, contributions and horizon -- never
    // the spending level -- so these dollars rest on nothing invented.
    expect(result.sustainableSpending).not.toBeNull();
    expect(result.sustainableSpending!.p50).toBeGreaterThan(0);
    expect(result.primary).toBeNull();
  }, 120_000);

  it('describes no Social Security rather than when a benefit of zero starts', async () => {
    const result = await runRetirementQuickPlan({
      currentAge: 68, retirementAge: 70, investableAssets: 500_000,
      annualSpending: 40_000, lifeExpectancy: 85,
    });
    const limitations = result.limitations.join(' ');

    // The claiming age defaults to 67 and means nothing without a benefit;
    // narrating when it starts would describe income this plan does not have.
    expect(limitations).toContain('No Social Security is included');
    expect(limitations).not.toContain('between retiring and claiming');
    expect(limitations).not.toContain('an amount you actually receive');
  }, 120_000);

  it('treats a blank contribution or benefit as zero, not as a rejection', () => {
    const resolved = resolveQuickPlanRequest({
      currentAge: 60, retirementAge: 65, investableAssets: 800_000, annualSpending: 50_000,
      annualContributions: '', socialSecurityAnnual: '',
    });

    expect(resolved.mode).toBe('plan');
    expect(resolved.inputs.annualContributions).toBe(0);
    expect(resolved.inputs.socialSecurityAnnual).toBe(0);
  });

  it('still rejects a figure the visitor did supply and the model cannot use', () => {
    // Blank is "I did not answer"; 0 is an answer, and substituting a default
    // for it would change the result without saying so.
    expect(() => resolveQuickPlanRequest({ investableAssets: 0 })).toThrow(QuickPlanValidationError);
    expect(() => resolveQuickPlanRequest({ currentAge: 'soon' })).toThrow(QuickPlanValidationError);
  });

  it('names the field for a decimal the model cannot use, rather than reading it as blank', () => {
    // The form now sends a typed decimal through instead of deleting the
    // point, so these have to come back as rejections naming the field.
    try {
      resolveQuickPlanRequest({ currentAge: 62.5, investableAssets: 500_000, annualSpending: 40_000 });
      throw new Error('expected a validation error');
    } catch (error) {
      expect((error as QuickPlanValidationError).field).toBe('currentAge');
      expect((error as QuickPlanValidationError).message).toContain('whole number');
    }

    // 1.2 typed for 1.2 million: below the floor, and said so by name.
    try {
      resolveQuickPlanRequest({ currentAge: 60, retirementAge: 65, investableAssets: 1.2 });
      throw new Error('expected a validation error');
    } catch (error) {
      expect((error as QuickPlanValidationError).field).toBe('investableAssets');
    }

    // Money itself takes decimals; only ages have to be whole.
    expect(resolveQuickPlanRequest({ investableAssets: 500_000.5 }).inputs.investableAssets).toBe(500_000.5);
  });

  it('serves a repeated empty form from cache rather than re-running the century', async () => {
    clearQuickPlanCache();
    // Every empty submission normalizes to the same run, so the open form
    // costs one simulation however many visitors submit it untouched.
    const first = await runRetirementQuickPlan({});
    const second = await runRetirementQuickPlan({});

    expect(first.cached).toBe(false);
    expect(second.cached).toBe(true);
  }, 180_000);

  it('does not serve a blank-age run from the cache of the same age typed in', async () => {
    const typed = await runRetirementQuickPlan({
      currentAge: 65, retirementAge: 65, investableAssets: 600_000, annualSpending: 30_000, lifeExpectancy: 85,
    });
    const blank = await runRetirementQuickPlan({
      investableAssets: 600_000, annualSpending: 30_000, lifeExpectancy: 85,
    });

    expect(typed.assumed).toEqual([]);
    expect(blank.assumed.map((entry) => entry.field)).toEqual(['retirementAge', 'currentAge']);
    expect(blank.cached).toBe(false);
  }, 180_000);
});

/**
 * `primary` is null only in rates mode, which needs a blank portfolio or
 * spending. Every request below supplies both, so this narrows the type
 * without each assertion having to.
 */
function planOf(result: Awaited<ReturnType<typeof runRetirementQuickPlan>>) {
  if (!result.primary) throw new Error('expected a plan-mode result');
  return result.primary;
}

describe('quick plan sensitivity to Social Security', () => {
  const SHORT = {
    currentAge: 68,
    retirementAge: 70,
    investableAssets: 500_000,
    annualSpending: 70_000,
    annualContributions: 10_000,
    lifeExpectancy: 85,
    allocation: 'balanced' as const,
  };

  it('makes Social Security change the answer, and claiming earlier change it more', async () => {
    const none = await runRetirementQuickPlan({ ...SHORT, socialSecurityAnnual: 0, socialSecurityStartAge: 75 });
    const atSeventyFive = await runRetirementQuickPlan({ ...SHORT, socialSecurityAnnual: 34_000, socialSecurityStartAge: 75 });
    const atSeventy = await runRetirementQuickPlan({ ...SHORT, socialSecurityAnnual: 34_000, socialSecurityStartAge: 70 });

    expect(planOf(atSeventyFive).survivalRate).toBeGreaterThan(planOf(none).survivalRate);
    expect(planOf(atSeventy).survivalRate).toBeGreaterThan(planOf(atSeventyFive).survivalRate);

    // Claiming at retirement takes the benefit straight off the first year's draw.
    expect(planOf(atSeventy).firstYearPortfolioWithdrawal).toBe(SHORT.annualSpending - 34_000);
    expect(planOf(atSeventyFive).firstYearPortfolioWithdrawal).toBe(SHORT.annualSpending);
  }, 180_000);
});
