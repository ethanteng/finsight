import { describe, expect, it } from '@jest/globals';
import {
  incomeClaimedAt,
  incomeForRetirementAge,
  PENSION_LABEL,
  resolveRetirementIncome,
  sameIncomeStreams,
  SOCIAL_SECURITY_LABEL,
} from '../../openai/retirement-income';
import { describeRetirementAssumptions } from '../../openai/retirement-assumptions';
import { buildCanonicalFactPack, validateCanonicalFactPack } from '../../openai/canonical-facts';
import { questionNeedsFromPacks } from '../../openai/context-packs';

const SAVED_AT = '2026-09-14T10:00:00.000Z';
const saved = (value: number | string) => ({ value, savedAt: SAVED_AT, source: 'page' as const });

describe('income for the holdings-based projection', () => {
  it('counts nothing when nobody said or saved any', () => {
    expect(resolveRetirementIncome({ retirementAge: 65, currentAge: 50 })).toEqual({
      streams: [],
      origins: {},
      // A spousal benefit still needs a claim age; nobody said what their own is.
      socialSecurityClaim: { claimAge: 67, known: false },
    });
    // A stated zero is a known benefit of none.
    expect(resolveRetirementIncome({ stated: { socialSecurityAnnual: 0, socialSecurityStartAge: 64 }, retirementAge: 65, currentAge: 50 }).socialSecurityClaim)
      .toEqual({ claimAge: 64, known: true });
  });

  it('takes Your numbers, defaulting only the terms of an income the user has', () => {
    const { streams, origins } = resolveRetirementIncome({
      statedFigures: { socialSecurityAnnual: saved(28_000), retirementIncome: saved(24_000) },
      retirementAge: 62,
      currentAge: 55,
    });

    expect(streams).toEqual([
      { label: SOCIAL_SECURITY_LABEL, annualAmount: 28_000, startAge: 67, inflationAdjusted: true },
      { label: PENSION_LABEL, annualAmount: 24_000, startAge: 62, inflationAdjusted: false },
    ]);
    expect(origins).toEqual({
      socialSecurity: { amount: 'saved', startAge: 'default' },
      pension: { amount: 'saved', startAge: 'default', inflation: 'default' },
      savedAt: SAVED_AT,
    });
  });

  it('lets what the user said in this decision win, including a stated zero', () => {
    const { streams, origins } = resolveRetirementIncome({
      stated: { socialSecurityAnnual: 0, pensionAnnual: 30_000, pensionStartAge: 60, pensionInflation: 'rises_with_inflation' },
      statedFigures: {
        socialSecurityAnnual: saved(28_000),
        retirementIncome: saved(24_000),
        retirementIncomeInflation: saved('fixed'),
      },
      retirementAge: 65,
      currentAge: 50,
    });

    expect(streams).toEqual([
      { label: PENSION_LABEL, annualAmount: 30_000, startAge: 60, inflationAdjusted: true },
    ]);
    expect(origins).toEqual({ pension: { amount: 'stated', startAge: 'stated', inflation: 'stated' } });
  });

  it('moves a pension that only ever started "when you retire" with a what-if retirement age', () => {
    const resolved = resolveRetirementIncome({ stated: { pensionAnnual: 20_000, socialSecurityAnnual: 25_000 }, retirementAge: 65, currentAge: 50 });
    const moved = incomeForRetirementAge(resolved.streams, resolved.origins, 60);
    expect(moved.find((stream) => stream.label === PENSION_LABEL)?.startAge).toBe(60);
    expect(moved.find((stream) => stream.label === SOCIAL_SECURITY_LABEL)?.startAge).toBe(67);

    const named = resolveRetirementIncome({ stated: { pensionAnnual: 20_000, pensionStartAge: 63 }, retirementAge: 65, currentAge: 50 });
    expect(incomeForRetirementAge(named.streams, named.origins, 60)[0].startAge).toBe(63);
  });

  it('counts a benefit quoted for one claiming age as Social Security pays it at another', () => {
    const named = resolveRetirementIncome({
      stated: { socialSecurityAnnual: 30_000, socialSecurityAmountAge: 67, socialSecurityStartAge: 70 },
      retirementAge: 65,
      currentAge: 50,
    });
    expect(named.streams).toEqual([
      { label: SOCIAL_SECURITY_LABEL, annualAmount: 37_200, startAge: 70, inflationAdjusted: true },
    ]);
    expect(named.origins.socialSecurity?.claiming).toMatchObject({ fromAmount: 30_000, fromAge: 67, toAge: 70 });

    // A saved benefit is the one for its saved start age.
    const saved62 = resolveRetirementIncome({
      stated: { socialSecurityStartAge: 62 },
      statedFigures: { socialSecurityAnnual: saved(30_000), socialSecurityStartAge: saved(67) },
      retirementAge: 65,
      currentAge: 50,
    });
    expect(saved62.streams[0]).toMatchObject({ annualAmount: 21_000, startAge: 62 });

    // A figure with no age named is the one for when it starts.
    const plain = resolveRetirementIncome({
      stated: { socialSecurityAnnual: 30_000, socialSecurityStartAge: 70 },
      retirementAge: 65,
      currentAge: 50,
    });
    expect(plain.streams[0]).toMatchObject({ annualAmount: 30_000, startAge: 70 });
    expect(plain.origins.socialSecurity?.claiming).toBeUndefined();
  });

  it('moves the baseline\'s Social Security to another claiming age, and nothing else', () => {
    const streams = [
      { label: SOCIAL_SECURITY_LABEL, annualAmount: 30_000, startAge: 67, inflationAdjusted: true },
      { label: PENSION_LABEL, annualAmount: 20_000, startAge: 60, inflationAdjusted: false },
    ];
    const claimed = incomeClaimedAt(streams, 70, 50);
    expect(claimed).toEqual({
      streams: [
        { label: SOCIAL_SECURITY_LABEL, annualAmount: 37_200, startAge: 70, inflationAdjusted: true },
        streams[1],
      ],
      claiming: expect.objectContaining({ fromAmount: 30_000, amount: 37_200 }),
    });
    // Nothing to move, already paid, or a claim in the past: said, not run as no change.
    expect(incomeClaimedAt([streams[1]], 70, 50)).toEqual({ unavailableReason: expect.stringMatching(/no Social Security/) });
    expect(incomeClaimedAt(streams, 70, 68)).toEqual({ unavailableReason: expect.stringMatching(/already being paid/) });
    expect(incomeClaimedAt(streams, 62, 64)).toEqual({ unavailableReason: expect.stringMatching(/already in the past/) });
  });

  it('matches a stored run whatever order its keys came back in', () => {
    const { streams } = resolveRetirementIncome({ stated: { socialSecurityAnnual: 30_000, pensionAnnual: 20_000 }, retirementAge: 65, currentAge: 50 });
    // What a jsonb column hands back: same terms, keys reordered.
    const stored = JSON.parse(JSON.stringify(streams.map((stream) => ({
      startAge: stream.startAge,
      inflationAdjusted: stream.inflationAdjusted,
      annualAmount: stream.annualAmount,
      label: stream.label,
    }))));

    expect(sameIncomeStreams(stored, streams)).toBe(true);
    expect(sameIncomeStreams([], streams)).toBe(false);
    expect(sameIncomeStreams([{ ...stored[0], startAge: 70 }, stored[1]], streams)).toBe(false);
    expect(sameIncomeStreams([], [])).toBe(true);
  });

  describe('in the answer', () => {
    const analysis = (incomeStreams: unknown[], origins: unknown) => ({
      retirementAnalysis: {
        metrics: {
          withdrawalRate: 0.04,
          yearsOfExpenses: 25,
          projectedPortfolioAtWithdrawalStart: 1_500_000,
          firstYearPortfolioWithdrawal: 36_000,
          historicalWithdrawalRates: { p10: 0.03, p25: 0.035, p50: 0.04, p75: 0.045, p90: 0.05 },
        },
        stressTest: { survivalRate: 0.9, totalSequences: 100, depletionPercentiles: { p10: 20, p25: 25, p50: null, p75: null, p90: null } },
        dataQuality: { modeledValue: 1_000_000, unmodeledValue: 0, valueCoverage: 1, unmodeledReasons: [] },
        _storedInputParams: { currentAge: 55, retirementAge: 62, annualWithdrawalAmount: 70_000, withdrawalStartAge: 62, incomeStreams },
        _incomeOrigins: origins,
      },
    });
    const resolved = resolveRetirementIncome({
      statedFigures: { socialSecurityAnnual: saved(28_000), retirementIncome: saved(24_000) },
      retirementAge: 62,
      currentAge: 55,
    });

    it('names each income, its start, and the terms it assumed', () => {
      const line = describeRetirementAssumptions(analysis(resolved.streams, resolved.origins) as any)!;

      expect(line).toContain('Social Security $28,000 a year in today\'s dollars from 67, an age I assumed (from Your numbers, saved Sep 14, 2026)');
      expect(line).toContain(
        'a pension of $24,000 a year from 62, a fixed amount that buys less each year prices rise ' +
        '(I assumed that it starts when you retire and that it does not rise with inflation)'
      );
    });

    it('says when Social Security was moved to its claiming age, and publishes both amounts', () => {
      const claimed = resolveRetirementIncome({
        stated: { socialSecurityAnnual: 30_000, socialSecurityAmountAge: 67, socialSecurityStartAge: 70 },
        retirementAge: 62,
        currentAge: 55,
      });
      const line = describeRetirementAssumptions(analysis(claimed.streams, claimed.origins) as any)!;
      expect(line).toContain(
        'Social Security $37,200 a year in today\'s dollars from 70 (the $30,000 a year you gave for claiming at 67, ' +
        'moved to 70 by Social Security\'s own rules, with full retirement age 67 from your age)'
      );

      const data = {
        accounts: [],
        metadata: { lastUpdated: new Date(), dataSources: {}, errors: [] },
        tierContext: { tierInfo: { currentTier: 'starter', availableSources: [] }, upgradeHints: [] },
        financialSummary: { computedAt: '2026-10-01T00:00:00.000Z', financialOverview: { netWorth: 1_000_000, totalInvestments: 1_000_000 } },
        ...analysis(claimed.streams, claimed.origins),
      } as any;
      const pack = buildCanonicalFactPack(data, 'Am I on track for retirement?', questionNeedsFromPacks(['retirement_analysis'], false));
      const fact = (id: string) => pack.facts.find((item) => item.id === id);
      expect(fact('retirement_social_security_annual')).toMatchObject({ value: 37_200 });
      expect(fact('retirement_social_security_annual')?.label).toContain('claimed at 70 by Social Security\'s claiming rules');
      expect(fact('retirement_social_security_as_given')).toMatchObject({ value: 30_000 });
      expect(validateCanonicalFactPack(pack)).toEqual([]);
    });

    it('says when it counts no income, but not for an analysis that predates income', () => {
      expect(describeRetirementAssumptions(analysis([], {}) as any)).toContain('no Social Security or pension');
      expect(describeRetirementAssumptions(analysis([], undefined) as any)).not.toContain('Social Security');
    });

    it('publishes each income and the first-year draw after it as facts', () => {
      const data = {
        accounts: [],
        metadata: { lastUpdated: new Date(), dataSources: {}, errors: [] },
        tierContext: { tierInfo: { currentTier: 'starter', availableSources: [] }, upgradeHints: [] },
        financialSummary: { computedAt: '2026-10-01T00:00:00.000Z', financialOverview: { netWorth: 1_000_000, totalInvestments: 1_000_000 } },
        ...analysis(resolved.streams, resolved.origins),
      } as any;
      const pack = buildCanonicalFactPack(data, 'Am I on track for retirement?', questionNeedsFromPacks(['retirement_analysis'], false));
      const fact = (id: string) => pack.facts.find((item) => item.id === id);

      expect(fact('retirement_social_security_annual')?.value).toBe(28_000);
      expect(fact('retirement_social_security_start_age')?.label).toContain('assumed: the user named none');
      expect(fact('retirement_pension_annual')?.label).toContain('a fixed dollar amount that does not rise with inflation');
      expect(fact('retirement_pension_start_age')?.label).toContain('assumed: when the user retires');
      expect(fact('first_year_portfolio_withdrawal')?.value).toBe(36_000);
      expect(fact('withdrawal_rate')?.label).toContain('before Social Security or pension income');
      expect(validateCanonicalFactPack(pack)).toEqual([]);
    });
  });
});
