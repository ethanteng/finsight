import { describe, expect, it } from '@jest/globals';
import {
  buildRetirementResultsEmail,
  buildRetirementResultsText,
} from '../../email/retirement-results';
import type {
  QuickPlanScenario,
  RetirementQuickPlanResult,
} from '../../services/retirement-quickplan';

/**
 * A stand-in for one run of the model. Built by hand rather than by running
 * the engine: this file is about what the message says, and a real run costs
 * seconds of CPU per case.
 */
function scenario(overrides: Partial<QuickPlanScenario> = {}): QuickPlanScenario {
  return {
    id: 'primary',
    label: 'Your plan',
    change: null,
    retirementAge: 65,
    annualSpending: 80_000,
    survivalRate: 0.94,
    sequencesTested: 800,
    sequencesSurvived: 752,
    projectedPortfolioAtRetirement: 1_840_000,
    firstYearPortfolioWithdrawal: 50_000,
    firstYearWithdrawalRate: 0.0272,
    depletionYears: { p10: 22, p25: 25, p50: 27 },
    primaryObservation: 'A balanced mix rode out the worst sequences',
    characteristics: {
      growthPotential: 'moderate',
      drawdownResistance: 'moderate',
      withdrawalFragility: 'low',
      inflationProtection: 'moderate',
    },
    tradeoffs: {
      upside: 'Participates in most of the equity recovery',
      downside: 'Gives up some of the best decades',
    },
    ...overrides,
  };
}

function planResult(primary: QuickPlanScenario): RetirementQuickPlanResult {
  return {
    version: 1,
    computedAt: '2026-09-12T00:00:00.000Z',
    durationMs: 300,
    cached: false,
    mode: 'plan',
    assumed: [],
    missing: [],
    inputs: {
      currentAge: 48,
      retirementAge: 65,
      investableAssets: 900_000,
      annualSpending: 80_000,
      annualContributions: 35_000,
      socialSecurityAnnual: 30_000,
      socialSecurityStartAge: 67,
      lifeExpectancy: 95,
      allocation: 'balanced',
    },
    allocation: {
      id: 'balanced',
      label: 'Balanced',
      description: 'A mix of stocks and bonds',
      equityPercent: 60,
    } as RetirementQuickPlanResult['allocation'],
    history: {
      firstMonth: '1926-07',
      lastMonth: '2025-12',
      sequencesTested: 800,
      horizonYears: 47,
      firstStartMonth: '1926-07',
      lastStartMonth: '1993-02',
    },
    primary,
    alternatives: [
      scenario({ id: 'later', label: 'Retire at 67', change: 'two years later', survivalRate: 0.98 }),
      scenario({ id: 'leaner', label: 'Spend $72,000', change: '10% less each year', survivalRate: 0.99 }),
    ],
    sustainableSpending: null,
    sustainableSpendingRates: {
      p10: 0.052, p25: 0.046, p50: 0.041, p75: 0.036, p90: 0.031,
      solverFloorRate: 0.02, solverCeilingRate: 0.08,
    },
    assumptions: ['Spending is inflation adjusted every year'],
    limitations: [
      'No taxes are modeled.',
      'Your actual holdings are unknown; an asset-mix preset stood in for them.',
    ],
  };
}

const OPTIONS = {
  email: 'reader@example.com',
  ctaUrl: 'https://asklinc.com/retirement/continue?ref=abc',
  calculatorUrl: 'https://asklinc.com/retirement-calculator',
};

describe('the retirement results email', () => {
  it('leads with the verdict the page led with', () => {
    const primary = scenario();
    const message = buildRetirementResultsEmail(planResult(primary), primary, OPTIONS);

    expect(message.subject).toContain('94.0%');
    expect(message.html).toContain('retiring at 65 worked in 752 of the 800');
    expect(message.text).toContain('retiring at 65 worked in 752 of the 800');
  });

  /*
   * The subject line is the first thing an inbox shows, and it used to round
   * to whole percent — turning a 99.6% survival rate into "100%" while the
   * message itself said 99.6%. An overstated survival figure is the one
   * rounding error worth being careful about here.
   */
  it('never rounds the subject up to a claim the message does not make', () => {
    const primary = scenario({ survivalRate: 0.996, sequencesSurvived: 797 });
    const message = buildRetirementResultsEmail(planResult(primary), primary, OPTIONS);

    expect(message.subject).toContain('99.6%');
    expect(message.subject).not.toContain('100%');
  });

  /*
   * A client that will not render HTML has to get the results, not a "view
   * this in a browser" stub. Every figure the card shows is in the text part.
   */
  it('carries the same figures and the same caveats in plain text', () => {
    const primary = scenario();
    const message = buildRetirementResultsEmail(planResult(primary), primary, OPTIONS);

    expect(message.text).toContain('$1,840,000');
    expect(message.text).toContain('$50,000');
    expect(message.text).toContain('2.72%');
    expect(message.text).toContain('Retire at 67');
    expect(message.text).toContain('No taxes are modeled.');
    expect(message.text).toContain('not financial advice');
    expect(message.text).toContain(OPTIONS.ctaUrl);
    expect(message.text).not.toContain('<');
  });

  it('carries the signup link as a button and as a pasteable URL', () => {
    const primary = scenario();
    const message = buildRetirementResultsEmail(planResult(primary), primary, OPTIONS);

    expect(message.html).toContain(`href="${OPTIONS.ctaUrl}"`);
    expect(message.html).toContain('Stress-test this with my actual finances');
    expect(message.html.match(/retirement\/continue/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it('uses the brand shell, so the message is not a bare table', () => {
    const primary = scenario();
    const message = buildRetirementResultsEmail(planResult(primary), primary, OPTIONS);

    expect(message.html).toContain('#123c2f');
    expect(message.html).toContain('ask-linc-logo.png');
  });

  /*
   * A 45% survival rate rendered in the same confident green as a 99% one is
   * a lie of presentation, in an inbox as much as on a page.
   */
  it('colours the verdict by what the number actually says', () => {
    const strong = scenario({ survivalRate: 0.96 });
    const weak = scenario({ survivalRate: 0.44, sequencesSurvived: 352 });

    expect(buildRetirementResultsEmail(planResult(strong), strong, OPTIONS).html)
      .toContain('#2b8f5d');
    expect(buildRetirementResultsEmail(planResult(weak), weak, OPTIONS).html)
      .toContain('#b4352b');
  });

  it('says which Social Security case the first-year draw reflects', () => {
    const primary = scenario();
    const claimsLater = planResult(primary);
    expect(buildRetirementResultsText(claimsLater, primary, OPTIONS))
      .toContain('Social Security starts at 67');

    const noBenefit = planResult(primary);
    noBenefit.inputs = { ...noBenefit.inputs, socialSecurityAnnual: 0 };
    expect(buildRetirementResultsText(noBenefit, primary, OPTIONS))
      .toContain('No Social Security offset');
  });

  it('reports a plan that never ran short without inventing a median failure', () => {
    const primary = scenario({
      survivalRate: 1,
      sequencesSurvived: 800,
      depletionYears: null,
    });
    const message = buildRetirementResultsEmail(planResult(primary), primary, OPTIONS);

    expect(message.text).toContain('The portfolio lasted in every tested history');
    expect(message.text).toContain('Histories that ran short: 0');
  });
});
