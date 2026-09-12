import { describe, expect, it } from '@jest/globals';
import {
  calculateCoastFire,
  coastFireSensitivity,
  CoastFireValidationError,
  parseCoastFireInputs,
  type CoastFireInputs,
} from '../../services/coast-fire';
import { buildCoastFireResultsEmail } from '../../email/coast-fire-results';

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

  it('refuses a figure larger than the calculator models', () => {
    expect(() => calculateCoastFire({ ...DEFAULTS, currentSavings: 5e12 }))
      .toThrow(/larger than this calculator models/);
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

describe('the return-assumption comparison', () => {
  it('brackets the chosen rate by a point either way', () => {
    const rates = coastFireSensitivity(calculateCoastFire(DEFAULTS)).map((row) => row.rate);
    expect(rates).toEqual([4, 5, 6]);
  });

  it('collapses duplicates at the ends of the allowed range', () => {
    const rates = coastFireSensitivity(calculateCoastFire({ ...DEFAULTS, realReturnRate: 0 }))
      .map((row) => row.rate);
    expect(rates).toEqual([0, 1]);
  });
});

describe('the results email', () => {
  const options = {
    email: 'reader@example.com',
    ctaUrl: 'https://asklinc.com/getstarted?source=coast-fire-calculator&ref=abc',
    calculatorUrl: 'https://asklinc.com/coast-fire-calculator',
  };

  it('leads with the number, in both parts', () => {
    const message = buildCoastFireResultsEmail(calculateCoastFire(DEFAULTS), options);

    expect(message.subject).toContain('$369,128');
    expect(message.html).toContain('$369,128');
    expect(message.text).toContain('$369,128');
  });

  /*
   * A client that will not render HTML has to get the results, not a "view
   * this in a browser" stub. Everything the card shows is in the text part.
   */
  it('carries the same figures and the same caveats in plain text', () => {
    const message = buildCoastFireResultsEmail(calculateCoastFire(DEFAULTS), options);

    expect(message.text).toContain('$1,250,000');
    expect(message.text).toContain('$1,354,542');
    expect(message.text).toContain('4.0% real return');
    expect(message.text).toContain('6.0% real return');
    expect(message.text).toContain('not financial advice');
    expect(message.text).toContain(options.ctaUrl);
    expect(message.text).not.toContain('<');
  });

  it('carries the signup link as a button and as a pasteable URL', () => {
    const message = buildCoastFireResultsEmail(calculateCoastFire(DEFAULTS), options);

    expect(message.html).toContain(`href="${options.ctaUrl.replace(/&/g, '&amp;')}"`);
    expect(message.html).toContain('Stress-test this with my actual finances');
    expect(message.html.match(/asklinc\.com\/getstarted/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it('uses the brand shell, so the message is not a bare table', () => {
    const message = buildCoastFireResultsEmail(calculateCoastFire(DEFAULTS), options);

    // Deep green, lime, and the logo from `email/templates`.
    expect(message.html).toContain('#123c2f');
    expect(message.html).toContain('#cfff68');
    expect(message.html).toContain('ask-linc-logo.png');
  });

  it('says which status it is reporting', () => {
    const reached = buildCoastFireResultsEmail(calculateCoastFire(DEFAULTS), options);
    const building = buildCoastFireResultsEmail(
      calculateCoastFire({ ...DEFAULTS, currentSavings: 200_000 }),
      options,
    );

    expect(reached.html).toContain('Reached');
    expect(reached.text).toContain('You’ve reached Coast FIRE.');
    expect(building.html).toContain('Not yet');
    expect(building.text).toContain('You’re still building your coast.');
  });
});
