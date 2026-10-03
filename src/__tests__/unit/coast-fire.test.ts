import { describe, expect, it } from '@jest/globals';
import {
  calculateCoastFire,
  CoastFireValidationError,
  parseCoastFireInputs,
  type CoastFireInputs,
} from '../../services/coast-fire';

/**
 * The same worked example the frontend suite pins
 * (`frontend/src/__tests__/coast-fire.test.tsx`). These are two copies of one
 * formula that cannot import each other, so the shared example is what keeps
 * them honest: change the maths on one side and one of the two suites fails.
 */
const DEFAULTS: CoastFireInputs = {
  currentAge: 40,
  retirementAge: 65,
  currentSavings: 400_000,
  annualRetirementSpending: 80_000,
  annualRetirementIncome: 30_000,
  realReturnRate: 5,
  withdrawalRate: 4,
};

describe('Coast FIRE calculation (server)', () => {
  it('agrees with the browser calculator on the shared example', () => {
    const result = calculateCoastFire(DEFAULTS);

    expect(result.portfolioSpendingNeed).toBe(50_000);
    expect(result.retirementTarget).toBe(1_250_000);
    expect(result.coastFireNumber).toBeCloseTo(369_128, 0);
    expect(result.projectedSavingsAtRetirement).toBeCloseTo(1_354_542, 0);
    expect(result.hasReachedCoastFire).toBe(true);
  });

  it('reports a gap when current savings are below the number', () => {
    const result = calculateCoastFire({ ...DEFAULTS, currentSavings: 300_000 });

    expect(result.hasReachedCoastFire).toBe(false);
    expect(result.differenceToday).toBeCloseTo(-69_128, 0);
  });

  it('asks nothing of the portfolio when retirement income covers spending', () => {
    const result = calculateCoastFire({ ...DEFAULTS, annualRetirementIncome: 80_000 });

    expect(result.retirementTarget).toBe(0);
    expect(result.coastFireNumber).toBe(0);
    expect(result.fundedRatio).toBe(Number.POSITIVE_INFINITY);
  });

  it('names the field it refused, so the form can point at the box', () => {
    expect(() => calculateCoastFire({ ...DEFAULTS, retirementAge: 40 }))
      .toThrow(CoastFireValidationError);
    try {
      calculateCoastFire({ ...DEFAULTS, withdrawalRate: 99 });
    } catch (error) {
      expect((error as CoastFireValidationError).field).toBe('withdrawalRate');
    }
  });

  /*
   * The maxima match the page's, so a figure the calculator accepted cannot be
   * refused by the email endpoint a click later.
   */
  it.each([
    ['currentSavings', 2e8, 'Retirement savings must be $100,000,000 or less.'],
    ['annualRetirementSpending', 5e7, 'Annual spending must be $10,000,000 or less.'],
    ['annualRetirementIncome', 5e7, 'Retirement income must be $10,000,000 or less.'],
  ])('refuses %s above what the calculator models', (field, value, message) => {
    expect(() => calculateCoastFire({ ...DEFAULTS, [field]: value }))
      .toThrow(message);
  });

  it('accepts each money figure at its limit', () => {
    expect(() => calculateCoastFire({
      ...DEFAULTS,
      currentSavings: 100_000_000,
      annualRetirementSpending: 10_000_000,
      annualRetirementIncome: 9_000_000,
    })).not.toThrow();
  });
});

describe('reading the seven inputs off a request', () => {
  it('accepts the strings an HTML number input submits', () => {
    expect(parseCoastFireInputs({
      currentAge: '40',
      retirementAge: '65',
      currentSavings: '$400,000',
      annualRetirementSpending: '80000',
      annualRetirementIncome: '30000',
      realReturnRate: '5',
      withdrawalRate: '4',
    })).toEqual(DEFAULTS);
  });

  /* NaN would otherwise reach the formula and silently poison every figure. */
  it('refuses a value that is not a number rather than letting NaN through', () => {
    expect(() => parseCoastFireInputs({ ...DEFAULTS, currentSavings: 'lots' }))
      .toThrow(/currentSavings must be a number/);
    expect(() => parseCoastFireInputs({})).toThrow(CoastFireValidationError);
  });

  it('ignores anything that is not one of the seven', () => {
    const parsed = parseCoastFireInputs({ ...DEFAULTS, coastFireNumber: 1, __proto__: {} });
    expect(Object.keys(parsed).sort()).toEqual(Object.keys(DEFAULTS).sort());
  });
});
