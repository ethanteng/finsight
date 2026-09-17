import React from 'react';
import { render, screen, within } from '@testing-library/react';
import { RetirementConnectedExample } from '@/components/marketing/RetirementConnectedExample';
import { RETIREMENT_CALCULATOR_EXAMPLE as EXAMPLE } from '@/lib/retirement-calculator-example.generated';

/**
 * The panel's whole claim is that these numbers are engine output rather than
 * marketing copy. That claim survives a regeneration only if the generated file
 * still hangs together and the page still shows whatever the engine reported —
 * including, when the book has one, the part it could not model.
 *
 * So these tests read the branch out of the generated data rather than pinning
 * the example to one profile. Swapping EXAMPLE_BOOK in the generator is a
 * supported edit; a test that hardcodes "there is a gap" turns that edit into a
 * failure and tempts the next person to fix it by editing the generated file.
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

  it('keeps its coverage figures consistent with its own unmodeled list', () => {
    // Either the engine placed and ran everything, or it named what it did not.
    // "Some value unmodeled but nothing listed" is the state that would let the
    // panel show a shortfall it cannot account for.
    //
    // All three buckets, because `partiallyMappedHoldings` is not a subset of
    // the other two: a holding with some sleeves modeled and some withheld is
    // filed there alone, while its withheld slice still counts toward
    // `unmodeledValue`.
    const listed = [
      ...EXAMPLE.coverage.unresolved,
      ...EXAMPLE.coverage.unsupported,
      ...(EXAMPLE.coverage.partiallyMapped ?? []),
    ];

    if (EXAMPLE.coverage.unmodeledValue > 0) {
      expect(EXAMPLE.coverage.valueCoverage).toBeLessThan(1);
      expect(listed.length).toBeGreaterThan(0);
    } else {
      expect(EXAMPLE.coverage.valueCoverage).toBe(1);
      expect(listed).toHaveLength(0);
    }
  });

  it('exports the partially mapped bucket, which the other two do not contain', () => {
    // The generator used to export `unmappedHoldings` and `unsupportedHoldings`
    // only. A registry fund with a withheld sleeve lands in neither, so a page
    // reading just those two would have shown full coverage over a book with a
    // real gap. The field has to exist for the page to be able to check it.
    expect(EXAMPLE.coverage).toHaveProperty('partiallyMapped');
    expect(Array.isArray(EXAMPLE.coverage.partiallyMapped)).toBe(true);
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
  it('states its coverage either way, naming every holding it did not fully test', () => {
    render(<RetirementConnectedExample />);

    const listed = [
      ...EXAMPLE.coverage.unresolved,
      ...EXAMPLE.coverage.unsupported,
      ...(EXAMPLE.coverage.partiallyMapped ?? []),
    ];

    if (listed.length > 0) {
      const unmodeled = `$${Math.round(EXAMPLE.coverage.unmodeledValue).toLocaleString('en-US')}`;
      expect(screen.getByText(unmodeled)).toBeInTheDocument();
      for (const label of listed) {
        expect(screen.getByText(label)).toBeInTheDocument();
      }
    } else {
      // Full coverage is a claim too, and it still has to say what it means:
      // nothing dropped, nothing substituted for an unplaceable holding.
      expect(screen.getByText('It tested every dollar')).toBeInTheDocument();
      expect(screen.getByText(/Nothing dropped for being unrecognized/i)).toBeInTheDocument();
      // Placement ≠ complete history: this book still proxies intl/TIPS months.
      // Claiming "recorded history" here would contradict the trust card next door.
      expect(screen.queryByText(/own recorded history/i)).not.toBeInTheDocument();
      // The offer to declare a gap must survive having none to declare, or the
      // card reads as a product that never has them.
      expect(
        screen.getByText(/cannot place says so here instead of guessing/i)
      ).toBeInTheDocument();
    }
  });

  it('labels the subset rows as subsets, not as separate sleeves', () => {
    const { container } = render(<RetirementConnectedExample />);

    // `internationalAllocation` is inside `equityAllocation` and
    // `tipsAllocation` is inside `fixedIncomeAllocation`. A bare "TIPS" row
    // would double-count and push the mix past 100% of the book.
    //
    // Scoped to the mix list, which is where double-counting is possible. The
    // trust card names the same sleeves when it discloses a stand-in, and that
    // is not a mix row — a page-wide match cannot tell the two apart.
    const mix = container.querySelector('.qp-example-mix') as HTMLElement;

    expect(within(mix).getByText('of which international')).toBeInTheDocument();
    expect(within(mix).getByText('of which TIPS')).toBeInTheDocument();
    expect(within(mix).queryByText(/^TIPS$/)).not.toBeInTheDocument();
    expect(within(mix).queryByText(/^International$/)).not.toBeInTheDocument();
  });

  it('says where the mix came from without claiming a list that may not exist', () => {
    render(<RetirementConnectedExample />);

    // The mix card used to point at the "cannot see" list beside it for the
    // overlap. With a book the engine places in full there is no such list, so
    // the sentence has to stand on the holdings themselves.
    expect(
      screen.getByText(/read off the holdings themselves/i)
    ).toBeInTheDocument();
  });

  it('shows the coverage and confidence the engine reported', () => {
    const { container } = render(<RetirementConnectedExample />);

    // Scoped to the trust card: survival rates render in the same "100.0%"
    // shape, so a page-wide text match is ambiguous rather than wrong.
    const trustCard = Array.from(container.querySelectorAll('.qp-example-card')).find(
      (card) => card.querySelector('h3')?.textContent === 'It shows how much to trust the answer'
    ) as HTMLElement;

    expect(within(trustCard).getByText(`${(EXAMPLE.coverage.valueCoverage * 100).toFixed(1)}%`))
      .toBeInTheDocument();
    expect(within(trustCard).getByText(EXAMPLE.coverage.confidence)).toBeInTheDocument();
  });

  it('picks the card face from the coverage figure, not the length of a list', () => {
    const { container } = render(<RetirementConnectedExample />);

    // The two faces have to agree with the number printed beside them. Keying
    // the branch off list length alone let a book whose only gap was a partial
    // exclusion render "It tested every dollar" over a sub-100% coverage
    // figure, because that bucket is in neither list the page used to read.
    const clear = container.querySelector('.qp-example-card-clear');
    const flagged = container.querySelector('.qp-example-card-flag');
    const fullyCovered = EXAMPLE.coverage.unmodeledValue === 0 && EXAMPLE.coverage.valueCoverage === 1;

    expect(Boolean(clear)).toBe(fullyCovered);
    expect(Boolean(flagged)).toBe(!fullyCovered);
  });

  it('flags the mapping rating as a warning only when it reads low', () => {
    const { container } = render(<RetirementConnectedExample />);

    const rating = container.querySelector('.qp-example-low, .qp-example-rating');
    expect(rating).not.toBeNull();
    expect(rating!.textContent).toBe(EXAMPLE.coverage.confidence);
    // A medium or high rating rendered in the low rating's colour understates
    // the answer as surely as the reverse overstates it.
    expect(rating!.classList.contains('qp-example-low')).toBe(
      EXAMPLE.coverage.confidence === 'low'
    );
  });

  it('describes unmodeled gaps from the generated counts, not hardcoded copy', () => {
    const unresolved = EXAMPLE.coverage.unresolved.length;
    const unsupported = EXAMPLE.coverage.unsupported.length;

    if (unresolved === 0 && unsupported === 0) {
      // Nothing to describe on this book. The full-coverage branch is covered
      // by its own case above; asserting gap wording here would only pin the
      // page to a profile the generator is meant to be able to change.
      return;
    }

    render(<RetirementConnectedExample />);

    // Both branches, because the counts move with the engine: TIPS left the
    // unsupported list when they gained a return series, and a test that only
    // knew the plural wording read that as the copy breaking.
    const word = (count: number) => (count === 1 ? 'one' : count === 2 ? 'two' : String(count));
    if (unresolved > 0) {
      expect(
        screen.getByText(
          new RegExp(
            unresolved === 1
              ? 'One does not say clearly enough what it holds or where'
              : `${word(unresolved)} do not say clearly enough what they hold or where`,
            'i',
          )
        )
      ).toBeInTheDocument();
    }
    if (unsupported > 0) {
      expect(
        screen.getByText(
          new RegExp(
            unsupported === 1
              ? 'one is a kind of investment with no century of history to test it against'
              : `${word(unsupported)} are kinds of investment with no century of history`,
            'i',
          )
        )
      ).toBeInTheDocument();
    }
  });

  it('says the two results are read against the same record', () => {
    render(<RetirementConnectedExample />);

    // They are, now that an international sleeve no longer truncates the window
    // to 1975. Before that fix this panel had to disclaim the comparison.
    expect(screen.getByText(/Same record as the result above/i)).toBeInTheDocument();
    expect(EXAMPLE.result.firstMonth.startsWith('1926')).toBe(true);
  });

  it('discloses any sleeve represented by a stand-in for part of the window', () => {
    const { container } = render(<RetirementConnectedExample />);

    // Every one of them, not just the first. There are two now -- international
    // equity before 1975 and TIPS before 2003 -- and a panel that discloses one
    // substitution while staying silent about another is worse than one that
    // discloses none, because it reads as though it listed them all.
    //
    // The disclosure is a row per sleeve rather than a paragraph per sleeve, so
    // this reads the rows. Shortening the copy is allowed; dropping a sleeve or
    // its share of the window is not.
    expect(EXAMPLE.result.proxiedSeries.length).toBeGreaterThan(0);

    const rows = Array.from(container.querySelectorAll('.qp-example-standins li'));
    expect(rows).toHaveLength(EXAMPLE.result.proxiedSeries.length);

    EXAMPLE.result.proxiedSeries.forEach((proxied, index) => {
      const row = rows[index] as HTMLElement;
      expect(proxied.months).toBeGreaterThan(0);
      expect(proxied.months).toBeLessThan(proxied.windowMonths);
      expect(
        within(row).getByText(
          `${proxied.months.toLocaleString('en-US')} of ${proxied.windowMonths.toLocaleString('en-US')} months`
        )
      ).toBeInTheDocument();
      // What replaced it, not just that something did. The row names the
      // substitute; the sentence above the rows carries "stands in".
      expect(row.textContent!.length).toBeGreaterThan(
        `${proxied.months.toLocaleString('en-US')} of ${proxied.windowMonths.toLocaleString('en-US')} months`.length
      );
    });

    expect(
      screen.getByText(/closest recorded series stands in for the early months/i)
    ).toBeInTheDocument();
  });

  it('keeps the direction of the TIPS stand-in, which is the actionable part', () => {
    render(<RetirementConnectedExample />);

    const series = EXAMPLE.result.proxiedSeries.map((proxied) => proxied.series);
    if (!series.includes('tips')) return;

    // Substituting ordinary government bonds for TIPS drops the inflation
    // protection TIPS are bought for, so those stretches test the plan harder
    // than the real record would. Trimming the copy must not trim that: it is
    // the one part a reader can act on, and it cuts in the plan's favour.
    expect(
      screen.getByText(/test the plan harder than the real record would/i)
    ).toBeInTheDocument();
  });

  it('does not dress the stand-ins up as caution', () => {
    const { container } = render(<RetirementConnectedExample />);

    if (EXAMPLE.result.proxiedSeries.length === 0) return;

    // Only the TIPS substitution is known to cut in the plan's favour. Using US
    // returns for months with no overseas record is uninformative about holding
    // money abroad, not cautious about it, and shortening this copy must not
    // round the pair up to reassurance — that is the claim the panel exists to
    // avoid making.
    const trustCard = Array.from(container.querySelectorAll('.qp-example-card')).find(
      (card) => card.querySelector('h3')?.textContent === 'It shows how much to trust the answer'
    ) as HTMLElement;

    expect(trustCard.textContent).not.toMatch(/conservative|cautious|err(s|ed)? on the safe side/i);
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
    const { container } = render(<RetirementConnectedExample />);

    const rungs = Array.from(container.querySelectorAll('.qp-example-ladder li'));
    const ordered = [...EXAMPLE.byRetirementAge].sort((a, b) => a.age - b.age);
    expect(rungs).toHaveLength(ordered.length);

    // Per rung rather than page-wide: two ages that both clear every history
    // print the same count, and a page-wide match cannot tell which rung it
    // found — or that one of them is missing.
    ordered.forEach((entry, index) => {
      const rung = rungs[index] as HTMLElement;
      expect(within(rung).getByText(`Retire at ${entry.age}`)).toBeInTheDocument();
      expect(
        within(rung).getByText(
          `${entry.sequencesSurvived.toLocaleString('en-US')} of ${entry.sequencesTested.toLocaleString('en-US')} lasted`
        )
      ).toBeInTheDocument();
    });
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

  it('says plainly that the profile is an example rather than a customer', () => {
    render(<RetirementConnectedExample />);

    expect(screen.getByText(/Example profile, not a customer/i)).toBeInTheDocument();
  });
});
