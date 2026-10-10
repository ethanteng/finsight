import { describe, expect, it } from '@jest/globals';
import {
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
    expect(resolveRetirementIncome({ retirementAge: 65 })).toEqual({ streams: [], origins: {} });
  });

  it('takes Your numbers, defaulting only the terms of an income the user has', () => {
    const { streams, origins } = resolveRetirementIncome({
      statedFigures: { socialSecurityAnnual: saved(28_000), retirementIncome: saved(24_000) },
      retirementAge: 62,
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
    });

    expect(streams).toEqual([
      { label: PENSION_LABEL, annualAmount: 30_000, startAge: 60, inflationAdjusted: true },
    ]);
    expect(origins).toEqual({ pension: { amount: 'stated', startAge: 'stated', inflation: 'stated' } });
  });

  it('moves a pension that only ever started "when you retire" with a what-if retirement age', () => {
    const resolved = resolveRetirementIncome({ stated: { pensionAnnual: 20_000, socialSecurityAnnual: 25_000 }, retirementAge: 65 });
    const moved = incomeForRetirementAge(resolved.streams, resolved.origins, 60);
    expect(moved.find((stream) => stream.label === PENSION_LABEL)?.startAge).toBe(60);
    expect(moved.find((stream) => stream.label === SOCIAL_SECURITY_LABEL)?.startAge).toBe(67);

    const named = resolveRetirementIncome({ stated: { pensionAnnual: 20_000, pensionStartAge: 63 }, retirementAge: 65 });
    expect(incomeForRetirementAge(named.streams, named.origins, 60)[0].startAge).toBe(63);
  });

  it('matches a stored run whatever order its keys came back in', () => {
    const { streams } = resolveRetirementIncome({ stated: { socialSecurityAnnual: 30_000, pensionAnnual: 20_000 }, retirementAge: 65 });
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
    });

    it('names each income, its start, and the terms it assumed', () => {
      const line = describeRetirementAssumptions(analysis(resolved.streams, resolved.origins) as any)!;

      expect(line).toContain('Social Security $28,000 a year in today\'s dollars from 67, an age I assumed (from Your numbers, saved Sep 14, 2026)');
      expect(line).toContain(
        'a pension of $24,000 a year from 62, a fixed amount that buys less each year prices rise ' +
        '(I assumed that it starts when you retire and that it does not rise with inflation)'
      );
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
