import React from 'react';
import { render, screen } from '@testing-library/react';
import { RETIREMENT_CALCULATOR_EXAMPLE as REAL } from '@/lib/retirement-calculator-example.generated';

/**
 * The partial-exclusion case, which the checked-in book does not produce.
 *
 * `analyzeRetirementPortfolio` files a holding with some sleeves modeled and
 * some withheld in `proxyUsage.partiallyMappedHoldings` and in neither
 * `unmappedHoldings` nor `unsupportedHoldings` (see `portfolio-mapper.ts`,
 * "Both lists now require that nothing at all was modeled"). Its withheld slice
 * still counts toward `unmodeledValue`.
 *
 * So a panel that decides which face to show by the length of those two lists
 * claims it tested every dollar over a coverage figure below 100%. That is the
 * one over-claim this section exists to avoid, and no fixture in the repo
 * exercises it today — which is exactly why it needs its own test rather than
 * an assertion about the current book.
 */
function withCoverage(coverage: Partial<typeof REAL.coverage> & Record<string, unknown>) {
  return {
    ...REAL,
    coverage: { ...REAL.coverage, ...coverage },
  };
}

function renderWith(example: unknown) {
  jest.resetModules();
  jest.doMock('@/lib/retirement-calculator-example.generated', () => ({
    RETIREMENT_CALCULATOR_EXAMPLE: example,
  }));
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { RetirementConnectedExample } = require('@/components/marketing/RetirementConnectedExample');
  return render(<RetirementConnectedExample />);
}

describe('connected-accounts example panel, partial exclusions', () => {
  afterEach(() => {
    jest.resetModules();
    jest.restoreAllMocks();
  });

  it('shows the gap face when the only gap is a partially mapped holding', () => {
    const { container } = renderWith(
      withCoverage({
        modeledValue: 2_000_000,
        unmodeledValue: 273_872,
        valueCoverage: 2_000_000 / 2_273_872,
        unresolved: [],
        unsupported: [],
        partiallyMapped: ['Target Retirement 2035 Fund'],
      })
    );

    expect(container.querySelector('.qp-example-card-clear')).toBeNull();
    expect(container.querySelector('.qp-example-card-flag')).not.toBeNull();
    expect(screen.queryByText('It tested every dollar')).not.toBeInTheDocument();
    expect(screen.getByText('It says what it cannot see')).toBeInTheDocument();
  });

  it('names the partially mapped holding rather than printing a figure over nothing', () => {
    renderWith(
      withCoverage({
        modeledValue: 2_000_000,
        unmodeledValue: 273_872,
        valueCoverage: 2_000_000 / 2_273_872,
        unresolved: [],
        unsupported: [],
        partiallyMapped: ['Target Retirement 2035 Fund'],
      })
    );

    expect(screen.getByText('$273,872')).toBeInTheDocument();
    expect(screen.getByText('Target Retirement 2035 Fund')).toBeInTheDocument();
  });

  it('calls a partial exclusion placed-but-withheld, not unplaceable', () => {
    renderWith(
      withCoverage({
        modeledValue: 2_000_000,
        unmodeledValue: 273_872,
        valueCoverage: 2_000_000 / 2_273_872,
        unresolved: [],
        unsupported: [],
        partiallyMapped: ['Target Retirement 2035 Fund'],
      })
    );

    // The engine ran most of this holding. Telling a reader it could not be
    // placed would send them looking for a mapping that already exists.
    expect(
      screen.getByText(/placed but has a sleeve with no history to run/i)
    ).toBeInTheDocument();
    expect(screen.queryByText(/does not say clearly enough what it holds/i)).not.toBeInTheDocument();
  });

  it('still shows the clear face when coverage really is complete', () => {
    const { container } = renderWith(
      withCoverage({
        modeledValue: 2_273_872,
        unmodeledValue: 0,
        valueCoverage: 1,
        unresolved: [],
        unsupported: [],
        partiallyMapped: [],
      })
    );

    expect(container.querySelector('.qp-example-card-clear')).not.toBeNull();
    expect(container.querySelector('.qp-example-card-flag')).toBeNull();
  });
});
