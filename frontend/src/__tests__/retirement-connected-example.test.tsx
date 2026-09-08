import React from 'react';
import { render, screen } from '@testing-library/react';
import { RetirementConnectedExample } from '@/components/marketing/RetirementConnectedExample';
import { RETIREMENT_CALCULATOR_EXAMPLE as EXAMPLE } from '@/lib/retirement-calculator-example.generated';

/**
 * The panel's whole claim is that these numbers are engine output rather than
 * marketing copy. That claim survives a regeneration only if the generated file
 * still hangs together and the page still shows the awkward parts of it.
 */
describe('connected-accounts example data', () => {
  it('accounts for every dollar it read', () => {
    const { modeledValue, unmodeledValue } = EXAMPLE.coverage;

    expect(modeledValue + unmodeledValue).toBeCloseTo(EXAMPLE.portfolio.totalInvestments, 2);
    expect(EXAMPLE.coverage.valueCoverage).toBeCloseTo(
      modeledValue / EXAMPLE.portfolio.totalInvestments,
      6
    );
  });

  it('keeps the part the engine could not model, which is the point of the panel', () => {
    expect(EXAMPLE.coverage.unmodeledValue).toBeGreaterThan(0);
    expect(EXAMPLE.coverage.valueCoverage).toBeLessThan(1);
    expect([...EXAMPLE.coverage.unresolved, ...EXAMPLE.coverage.unsupported].length).toBeGreaterThan(0);
  });

  it('reports a survival rate and a horizon the engine could produce', () => {
    expect(EXAMPLE.result.survivalRate).toBeGreaterThanOrEqual(0);
    expect(EXAMPLE.result.survivalRate).toBeLessThanOrEqual(1);
    expect(EXAMPLE.result.sequencesTested).toBeGreaterThan(0);
    expect(EXAMPLE.result.firstMonth).toMatch(/^\d{4}-\d{2}$/);
  });

  it('keeps international and TIPS as subsets of the lines that contain them', () => {
    // `internationalAllocation` is part of `equityAllocation`, and
    // `fixedIncomeAllocation` already counts `tipsAllocation`. Treated as
    // siblings, the mix adds up past the portfolio.
    expect(EXAMPLE.allocation.international).toBeLessThanOrEqual(EXAMPLE.allocation.equity);
    expect(EXAMPLE.allocation.tips).toBeLessThanOrEqual(EXAMPLE.allocation.fixedIncome);
    expect(
      EXAMPLE.allocation.equity + EXAMPLE.allocation.fixedIncome + EXAMPLE.allocation.cash
    ).toBeLessThanOrEqual(100.0001);
  });

  it('stores the survivor count as an integer rather than a rate to re-derive', () => {
    // Reconstructing it in the render is a rounding decision made in the wrong
    // place, and can disagree with the rate by one.
    expect(Number.isInteger(EXAMPLE.result.sequencesSurvived)).toBe(true);
    expect(EXAMPLE.result.sequencesSurvived).toBeLessThanOrEqual(EXAMPLE.result.sequencesTested);
    expect(EXAMPLE.result.sequencesSurvived / EXAMPLE.result.sequencesTested)
      .toBeCloseTo(EXAMPLE.result.survivalRate, 6);
  });

  it('counts accounts from the book rather than asserting a number', () => {
    // Derived from the distinct account ids on the book. A hand-typed count
    // would break the panel's "engine output, not invented" claim, which is the
    // only reason the number is on the page at all.
    expect(EXAMPLE.portfolio.accountCount).toBeGreaterThan(1);
    expect(EXAMPLE.portfolio.accountCount).toBeLessThanOrEqual(EXAMPLE.portfolio.holdingCount);
  });

  it('carries no clock in its output, so the drift check means what it says', () => {
    // A regeneration timestamp would make every run a diff and the CI drift
    // check unable to tell a stale file from a passing day.
    expect(EXAMPLE).not.toHaveProperty('generatedAt');
    expect(EXAMPLE.asOfDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('carries a run for every retirement age the panel bands, on one denominator', () => {
    const ladder = EXAMPLE.byRetirementAge;

    expect(ladder.length).toBeGreaterThan(1);
    expect(ladder.map((entry) => entry.age)).toContain(EXAMPLE.plan.retirementAge);

    const ages = ladder.map((entry) => entry.age);
    expect([...ages].sort((a, b) => a - b)).toEqual(ages);
    expect(new Set(ages).size).toBe(ages.length);

    for (const entry of ladder) {
      expect(entry.age).toBeGreaterThan(EXAMPLE.plan.currentAge);
      expect(entry.survivalRate).toBeGreaterThanOrEqual(0);
      expect(entry.survivalRate).toBeLessThanOrEqual(1);
      expect(Number.isInteger(entry.sequencesSurvived)).toBe(true);
      expect(entry.sequencesSurvived).toBeLessThanOrEqual(entry.sequencesTested);
      // Retirement age moves the withdrawal start inside a window that always
      // runs from today to life expectancy, so the bars share a denominator and
      // the rates are comparable. A mismatch would make the band misleading.
      expect(entry.sequencesTested).toBe(EXAMPLE.result.sequencesTested);
    }
  });

  it('agrees with the headline result at the plan\'s own retirement age', () => {
    const atPlan = EXAMPLE.byRetirementAge.find((entry) => entry.age === EXAMPLE.plan.retirementAge);

    expect(atPlan).toBeDefined();
    expect(atPlan!.survivalRate).toBeCloseTo(EXAMPLE.result.survivalRate, 9);
    expect(atPlan!.sequencesSurvived).toBe(EXAMPLE.result.sequencesSurvived);
    expect(atPlan!.projectedPortfolioAtRetirement).toBeCloseTo(
      EXAMPLE.result.projectedPortfolioAtRetirement,
      6
    );
  });

  it('describes a plan the landing-page form could have submitted', () => {
    const { plan } = EXAMPLE;

    expect(plan.retirementAge).toBeGreaterThanOrEqual(plan.currentAge);
    expect(plan.lifeExpectancy).toBeGreaterThan(plan.retirementAge);
    expect(plan.annualSpending).toBeGreaterThan(0);
  });
});

describe('connected-accounts example panel', () => {
  it('leads with what the model could not model, not with a better number', () => {
    render(<RetirementConnectedExample />);

    const unmodeled = `$${Math.round(EXAMPLE.coverage.unmodeledValue).toLocaleString('en-US')}`;
    expect(screen.getByText(unmodeled)).toBeInTheDocument();

    for (const label of [...EXAMPLE.coverage.unresolved, ...EXAMPLE.coverage.unsupported]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it('labels the subset rows as subsets, not as separate sleeves', () => {
    render(<RetirementConnectedExample />);

    // `internationalAllocation` is inside `equityAllocation` and
    // `tipsAllocation` is inside `fixedIncomeAllocation`. A bare "TIPS" row
    // would double-count and push the mix past 100% of the book.
    expect(screen.getByText('of which international')).toBeInTheDocument();
    expect(screen.getByText('of which TIPS')).toBeInTheDocument();
    expect(screen.queryByText(/^TIPS$/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^International$/)).not.toBeInTheDocument();
  });

  it('says the bond line is what was identified, not all of what was run', () => {
    render(<RetirementConnectedExample />);

    // Part of that percentage is also in the "cannot see" list next to it.
    expect(
      screen.getByText(/what the model could identify, not all of what it could run/i)
    ).toBeInTheDocument();
  });

  it('shows the coverage and confidence the engine reported', () => {
    render(<RetirementConnectedExample />);

    expect(
      screen.getByText(`${(EXAMPLE.coverage.valueCoverage * 100).toFixed(1)}%`)
    ).toBeInTheDocument();
    expect(screen.getByText(EXAMPLE.coverage.confidence)).toBeInTheDocument();
  });

  it('describes unmodeled gaps from the generated counts, not hardcoded copy', () => {
    render(<RetirementConnectedExample />);

    const unresolved = EXAMPLE.coverage.unresolved.length;
    const unsupported = EXAMPLE.coverage.unsupported.length;
    expect(unresolved).toBeGreaterThan(0);
    expect(unsupported).toBeGreaterThan(0);

    expect(
      screen.getByText(
        new RegExp(`${unresolved === 2 ? 'Two' : unresolved} do not say clearly enough what they hold or where`, 'i')
      )
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        new RegExp(`${unsupported === 2 ? 'two' : unsupported} are kinds of investment with no century of history`, 'i')
      )
    ).toBeInTheDocument();
  });

  it('says the two results are read against the same record', () => {
    render(<RetirementConnectedExample />);

    // They are, now that an international sleeve no longer truncates the window
    // to 1975. Before that fix this panel had to disclaim the comparison.
    expect(screen.getByText(/Same record as the result above/i)).toBeInTheDocument();
    expect(EXAMPLE.result.firstMonth.startsWith('1926')).toBe(true);
  });

  it('discloses any sleeve represented by a stand-in for part of the window', () => {
    render(<RetirementConnectedExample />);

    const [proxied] = EXAMPLE.result.proxiedSeries;
    expect(proxied).toBeDefined();
    expect(proxied.months).toBeGreaterThan(0);
    expect(proxied.months).toBeLessThan(proxied.windowMonths);
    expect(screen.getByText(/those months use the US market return instead/i)).toBeInTheDocument();
  });

  it('answers the page\'s question before showing its work', () => {
    render(<RetirementConnectedExample />);

    // The section used to open with the asset mix and close with a sentence
    // about "balanced allocation characteristics" — machinery, never an answer
    // to "can I retire at 60?".
    const survived = EXAMPLE.result.sequencesSurvived.toLocaleString('en-US');
    const tested = EXAMPLE.result.sequencesTested.toLocaleString('en-US');

    expect(
      screen.getByText(new RegExp(`Retiring at ${EXAMPLE.plan.retirementAge} lasted in`, 'i'))
    ).toBeInTheDocument();
    expect(screen.getByText(`${survived} of the ${tested}`)).toBeInTheDocument();
    expect(screen.queryByText(/Engine's own read/i)).not.toBeInTheDocument();
  });

  it('bands the answer across retirement ages, each with its own count', () => {
    render(<RetirementConnectedExample />);

    for (const entry of EXAMPLE.byRetirementAge) {
      expect(screen.getByText(`Retire at ${entry.age}`)).toBeInTheDocument();
      expect(
        screen.getByText(
          `${entry.sequencesSurvived.toLocaleString('en-US')} of ${entry.sequencesTested.toLocaleString('en-US')} lasted`
        )
      ).toBeInTheDocument();
    }
  });

  it('reads the "when" sentence off the band rather than asserting an age', () => {
    render(<RetirementConnectedExample />);

    const ordered = [...EXAMPLE.byRetirementAge].sort((a, b) => a.age - b.age);
    const clearedEvery = ordered.find((entry) => entry.survivalRate >= 1);
    const earliestStrong = ordered.find((entry) => entry.survivalRate >= 0.9);

    expect(
      screen.getByText(new RegExp(`At ${ordered[0].age} it lasted in`, 'i'))
    ).toBeInTheDocument();

    if (clearedEvery) {
      expect(
        screen.getByText(new RegExp(`From ${clearedEvery.age} on, none of them ran out`, 'i'))
      ).toBeInTheDocument();
      // "None ran out" is a claim about this record, not about the future.
      expect(screen.getByText(/not a guarantee/i)).toBeInTheDocument();
    } else if (earliestStrong) {
      expect(
        screen.getByText(
          new RegExp(`${earliestStrong.age} is the earliest age tested where at least nine in ten`, 'i')
        )
      ).toBeInTheDocument();
    } else {
      expect(screen.getByText(/No age tested here reached nine in ten/i)).toBeInTheDocument();
    }
  });

  it('colours each rung by what it says, not uniformly', () => {
    const { container } = render(<RetirementConnectedExample />);

    const rungs = container.querySelectorAll('.qp-example-ladder li');
    expect(rungs).toHaveLength(EXAMPLE.byRetirementAge.length);

    const ordered = [...EXAMPLE.byRetirementAge].sort((a, b) => a.age - b.age);
    rungs.forEach((rung, index) => {
      const rate = ordered[index].survivalRate;
      const expected = rate >= 0.9 ? 'strong' : rate >= 0.7 ? 'mixed' : 'weak';
      expect(rung.getAttribute('data-outcome')).toBe(expected);
    });
  });

  it('hands over from the result above rather than ruling a line under it', () => {
    render(<RetirementConnectedExample />);

    // "Without the guesswork", not "a real answer": the six-number result above
    // is a real calculation, and what it lacks is knowledge of the portfolio.
    expect(screen.getByText(/Now, without the guesswork/i)).toBeInTheDocument();
    expect(screen.queryByText(/a real answer/i)).not.toBeInTheDocument();
  });

  it('says plainly that the profile is an example rather than a customer', () => {
    render(<RetirementConnectedExample />);

    expect(screen.getByText(/Example profile, not a customer/i)).toBeInTheDocument();
  });
});
