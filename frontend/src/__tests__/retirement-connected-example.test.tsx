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
    expect(EXAMPLE.portfolio.accountCount).toBeGreaterThan(1);
    expect(EXAMPLE.portfolio.accountCount).toBeLessThanOrEqual(EXAMPLE.portfolio.holdingCount);
  });

  it('carries no clock in its output, so the drift check means what it says', () => {
    // A regeneration timestamp would make every run a diff and the CI drift
    // check unable to tell a stale file from a passing day.
    expect(EXAMPLE).not.toHaveProperty('generatedAt');
    expect(EXAMPLE.asOfDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('describes a plan the landing-page form could have submitted', () => {
    const { plan } = EXAMPLE;

    expect(plan.retirementAge).toBeGreaterThanOrEqual(plan.currentAge);
    expect(plan.lifeExpectancy).toBeGreaterThan(plan.retirementAge);
    expect(plan.annualSpending).toBeGreaterThan(0);
  });

  it('reports a real account count rather than an invented one', () => {
    // The generator derives this from distinct account_ids on the book.
    // A hand-typed count would break the panel's "engine output, not invented" claim.
    expect(EXAMPLE.portfolio.accountCount).toBeGreaterThan(1);
    expect(EXAMPLE.portfolio.accountCount).toBeLessThanOrEqual(EXAMPLE.portfolio.holdingCount);
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

    expect(screen.getByText('of which international')).toBeInTheDocument();
    expect(screen.getByText('of which TIPS')).toBeInTheDocument();
  });

  it('says the bond line is what was classified, not what was simulated', () => {
    render(<RetirementConnectedExample />);

    // Part of that percentage is also in the "could not model" list next to it.
    expect(screen.getByText(/what the\s+mapper classified, not what it simulated/i)).toBeInTheDocument();
  });

  it('shows the coverage and confidence the engine reported', () => {
    render(<RetirementConnectedExample />);

    expect(
      screen.getByText(`${(EXAMPLE.coverage.valueCoverage * 100).toFixed(1)}%`)
    ).toBeInTheDocument();
    expect(screen.getByText(EXAMPLE.coverage.confidence)).toBeInTheDocument();
  });

  it('nests TIPS under bonds the way international nests under stocks', () => {
    render(<RetirementConnectedExample />);

    // fixedIncomeAllocation already includes tipsAllocation; a sibling "TIPS"
    // row would double-count and make the mix sum past 100% of the book.
    expect(screen.getByText('of which TIPS')).toBeInTheDocument();
    expect(screen.queryByText(/^TIPS$/)).not.toBeInTheDocument();
  });

  it('describes unmodeled gaps from the generated counts, not hardcoded copy', () => {
    render(<RetirementConnectedExample />);

    const unresolved = EXAMPLE.coverage.unresolved.length;
    const unsupported = EXAMPLE.coverage.unsupported.length;
    expect(unresolved).toBeGreaterThan(0);
    expect(unsupported).toBeGreaterThan(0);

    expect(
      screen.getByText(new RegExp(`${unresolved === 2 ? 'Two' : unresolved} have no resolvable asset class`, 'i'))
    ).toBeInTheDocument();
    expect(
      screen.getByText(new RegExp(`${unsupported === 2 ? 'two' : unsupported} have one the engine has no return series for`, 'i'))
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
    expect(screen.getByText(/carries the US market return rather than its own/i)).toBeInTheDocument();
  });

  it('says plainly that the profile is an example rather than a customer', () => {
    render(<RetirementConnectedExample />);

    expect(screen.getByText(/Example profile, not a customer/i)).toBeInTheDocument();
  });
});
