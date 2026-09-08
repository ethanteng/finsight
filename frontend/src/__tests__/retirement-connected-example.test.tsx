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

  it('shows the coverage and confidence the engine reported', () => {
    render(<RetirementConnectedExample />);

    expect(
      screen.getByText(`${(EXAMPLE.coverage.valueCoverage * 100).toFixed(1)}%`)
    ).toBeInTheDocument();
    expect(screen.getByText(EXAMPLE.coverage.confidence)).toBeInTheDocument();
  });

  it('refuses to let its survival figure be read against the one above it', () => {
    render(<RetirementConnectedExample />);

    // The two runs cover different stretches of history, so an unqualified
    // comparison would be exactly the error the rest of the page avoids.
    expect(screen.getByText(/Not comparable to the figure above/i)).toBeInTheDocument();
    expect(screen.getByText(/cost of the richer answer, not a bonus/i)).toBeInTheDocument();
  });

  it('says plainly that the profile is an example rather than a customer', () => {
    render(<RetirementConnectedExample />);

    expect(screen.getByText(/Example profile, not a customer/i)).toBeInTheDocument();
  });
});
