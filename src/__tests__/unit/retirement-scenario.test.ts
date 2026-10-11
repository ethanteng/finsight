import {
  DEFAULT_FIXED_WITHDRAWAL_GROWTH_RATE,
  compactRetirementScenarioExecution,
  describeRetirementScenarioExecution,
  parseRetirementScenarioPlan,
  retirementScenarioCanonicalFacts,
  runRetirementScenario,
} from '../../scenarios/retirement-scenario';
import type { RetirementAnalysisOutput } from '../../retirement-analytics';
import { householdTimeline } from '../../services/household';

function analysis(survivalRate = 0.8): RetirementAnalysisOutput {
  return {
    summary: {
      characteristics: {
        growthPotential: 'moderate',
        drawdownResistance: 'moderate',
        withdrawalFragility: 'moderate',
        inflationProtection: 'moderate',
      },
      tradeoffs: { upside: '', downside: '' },
      primaryObservation: '',
      confidence: 'high',
      timelineBucket: '30',
      timelineBucketNote: '',
    },
    metrics: {
      equityAllocation: 60,
      withdrawalRate: 0.04,
      yearsOfExpenses: 25,
      projectedPortfolioAtWithdrawalStart: 1_000_000,
      yearsToWithdrawalStart: 10,
      historicalWithdrawalRates: { p10: 0.03, p25: 0.035, p50: 0.04, p75: 0.045, p90: 0.05 },
    },
    stressTest: {
      totalSequences: 100,
      survivalRate,
      depletionPercentiles: { p10: 12, p25: 18, p50: 24, p75: 28, p90: 30 },
      worstSequences: { byDepletion: [], byDrawdown: [], byRecovery: [] },
    },
    historicalImplications: [],
    dataQuality: {
      completeness: 1,
      priceHistoryCoverage: 1,
      modeledValue: 100000,
      unmodeledValue: 0,
      valueCoverage: 1,
      unmodeledReasons: [],
      metadataConfidence: 'high',
      portfolioMappingConfidence: 'high',
      proxiedValuePercentage: 0,
      proxyUsage: {
        usEquityProxy: 'VTI',
        internationalEquityProxy: 'US equity history',
        bondsProxy: 'AGG',
        unmappedHoldings: [],
        unsupportedHoldings: [],
        usListingFallbackHoldings: [],
        mappingMethod: 'direct',
      },
      assumptions: [],
      missingData: [],
    },
    disclaimers: [],
  };
}

function snapshot() {
  return {
    investments: {
      totalValue: 1_000_000,
      holdingCount: 1,
      summaryLines: [],
      holdings: [{ id: 'h1', security_id: 's1', institution_value: 1_000_000 }],
      securities: [{ security_id: 's1', ticker_symbol: 'VTI' }],
    },
    retirementAnalysis: {
      ...analysis(0.9),
      _storedInputParams: {
        currentAge: 50,
        retirementAge: 60,
        lifeExpectancy: 95,
        annualWithdrawalAmount: 40_000,
        withdrawalStartAge: 60,
      },
    },
  } as any;
}

describe('retirement scenario runner', () => {
  it('validates semantic plans and drops implausible model-supplied rates', () => {
    expect(parseRetirementScenarioPlan({
      requested: true,
      primary: { type: 'fixed_growth', annualRate: 3, source: '3% a year' },
      comparison: { type: 'flat_nominal', annualRate: null, source: 'flat version' },
    })).toEqual({
      requested: true,
      primary: { type: 'fixed_growth', source: '3% a year' },
      comparison: { type: 'flat_nominal', source: 'flat version' },
    });
    expect(parseRetirementScenarioPlan({
      requested: false,
      primary: { type: 'none' },
      comparison: { type: 'none' },
    })).toBeUndefined();
    expect(parseRetirementScenarioPlan({
      requested: true,
      primary: { type: 'fixed_growth', annualRate: -0.2, source: 'reduce 20% each year' },
      comparison: { type: 'none' },
    })?.primary.annualRate).toBe(-0.2);
  });

  it('runs two explicitly requested policies and holds the inherited baseline inputs constant', async () => {
    const analyzer = jest.fn(async (input: any) =>
      analysis(input.withdrawalPolicy.type === 'flat_nominal' ? 0.95 : 0.75)
    );
    const execution = await runRetirementScenario(snapshot(), {
      requested: true,
      primary: { type: 'fixed_growth', annualRate: 0.03, source: '3% bump per year' },
      comparison: { type: 'flat_nominal', source: 'flat-dollar version' },
    }, analyzer);

    expect(execution.status).toBe('completed');
    if (execution.status !== 'completed') return;
    expect(analyzer).toHaveBeenCalledTimes(2);
    expect(analyzer.mock.calls.map(([input]) => input.withdrawalPolicy)).toEqual([
      { type: 'fixed_growth', annualRate: 0.03 },
      { type: 'flat_nominal' },
    ]);
    expect(execution.scenarios.map((scenario) => scenario.analysis.stressTest.survivalRate)).toEqual([0.75, 0.95]);
    expect(execution.scenarios[0].assumptions).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'annual_growth_rate', value: 0.03, origin: 'user' }),
      expect.objectContaining({ key: 'annual_withdrawal_amount', value: 40_000, origin: 'inherited' }),
      expect.objectContaining({ key: 'pre_withdrawal_contributions', value: 0, origin: 'default' }),
    ]));
  });

  it('keeps the baseline\'s income in every variant, moving only a pension that starts when the user retires', async () => {
    const analyzer = jest.fn(async (input: any) => analysis(input.incomeStreams?.length ? 0.8 : 0.7));
    const data = snapshot();
    data.retirementAnalysis._storedInputParams.incomeStreams = [
      { label: 'Social Security', annualAmount: 30_000, startAge: 67, inflationAdjusted: true },
      { label: 'pension or other income', annualAmount: 20_000, startAge: 60, inflationAdjusted: false },
    ];
    data.retirementAnalysis._incomeOrigins = {
      socialSecurity: { amount: 'stated', startAge: 'stated' },
      pension: { amount: 'stated', startAge: 'default', inflation: 'default' },
    };
    const execution = await runRetirementScenario(data, {
      requested: true,
      primary: {
        type: 'historical_cpi',
        overrides: { retirementAge: 55, withdrawalStartAge: 55, sources: { retirementAge: 'retire at 55', withdrawalStartAge: 'retire at 55' } },
      },
    }, analyzer);

    expect(execution.status).toBe('completed');
    const [variantInput] = analyzer.mock.calls.map(([input]) => input);
    expect(variantInput.incomeStreams).toEqual([
      { label: 'Social Security', annualAmount: 30_000, startAge: 67, inflationAdjusted: true },
      { label: 'pension or other income', annualAmount: 20_000, startAge: 55, inflationAdjusted: false },
    ]);
  });

  describe('with a partner', () => {
    /** The user 50, their married partner 48 with the larger benefit: the plan runs to the user's 97. */
    function coupleSnapshot() {
      const data = snapshot();
      const plan = { age: 48, planThroughAge: 95, socialSecurity: { annualAmount: 32_000, startAge: 67, quote: { amount: 32_000, age: 67 } } };
      const timeline = householdTimeline({ currentAge: 50, userPlanThroughAge: 95, partner: plan });
      Object.assign(data.retirementAnalysis._storedInputParams, {
        lifeExpectancy: 97,
        incomeStreams: [
          { label: 'Social Security', annualAmount: 30_000, startAge: 67, inflationAdjusted: true, endAge: 95 },
          { label: 'your partner\'s Social Security', annualAmount: 32_000, startAge: 69, inflationAdjusted: true },
        ],
      });
      data.retirementAnalysis._household = {
        plan,
        origins: { age: 'stated', socialSecurityAnnual: 'stated', socialSecurityStartAge: 'default', planThroughAge: 'default' },
        married: { value: true, origin: 'stated' },
        timeline,
      };
      return data;
    }

    it('pays the survivor the user\'s benefit when claiming later makes it the larger', async () => {
      const analyzer = jest.fn(async () => analysis(0.85));
      await runRetirementScenario(coupleSnapshot(), {
        requested: true,
        primary: {
          type: 'historical_cpi',
          overrides: { socialSecurityStartAge: 70, sources: { socialSecurityStartAge: 'claim at 70' } },
        },
      }, analyzer);

      const input = (analyzer.mock.calls[0] as any[])[0];
      expect(input.lifeExpectancy).toBe(97);
      expect(input.incomeStreams).toEqual([
        { label: 'Social Security', annualAmount: 37_200, startAge: 70, inflationAdjusted: true, endAge: 95 },
        { label: 'your partner\'s Social Security', annualAmount: 32_000, startAge: 69, inflationAdjusted: true },
        // The user's $37,200 is now the larger: the partner is paid $5,200 above their own.
        { label: 'your partner\'s survivor benefit on your record', annualAmount: 5_200, startAge: 95, inflationAdjusted: true },
      ]);
    });

    it('runs a planning-age what-if that only moves when the survivor years begin', async () => {
      // A younger partner with no incomes: living to 98 leaves the horizon at
      // the partner's 100 and moves only the survivor's spending.
      const data = snapshot();
      const plan = { age: 45, planThroughAge: 95, survivorAnnualSpending: 30_000 };
      const timeline = householdTimeline({ currentAge: 50, userPlanThroughAge: 95, partner: plan });
      Object.assign(data.retirementAnalysis._storedInputParams, {
        lifeExpectancy: 100,
        incomeStreams: [],
        survivorSpending: { fromAge: 95, annualAmount: 30_000 },
      });
      data.retirementAnalysis._household = {
        plan,
        origins: { age: 'stated', planThroughAge: 'default', survivorAnnualSpending: 'stated' },
        timeline,
      };
      const analyzer = jest.fn(async () => analysis(0.85));
      const execution = await runRetirementScenario(data, {
        requested: true,
        primary: {
          type: 'historical_cpi',
          overrides: { lifeExpectancy: 98, sources: { lifeExpectancy: 'if I live to 98' } },
        },
      }, analyzer);

      expect(analyzer).toHaveBeenCalledTimes(1);
      expect((analyzer.mock.calls[0] as any[])[0]).toMatchObject({
        lifeExpectancy: 100,
        survivorSpending: { fromAge: 98, annualAmount: 30_000 },
      });
      if (execution.status !== 'completed') throw new Error('not completed');
      expect(execution.scenarios.map((scenario) => scenario.reusedBaseline)).toEqual([false, true]);
    });

    it('moves the user\'s own planning age, and the household\'s horizon with it', async () => {
      const analyzer = jest.fn(async () => analysis(0.85));
      await runRetirementScenario(coupleSnapshot(), {
        requested: true,
        primary: {
          type: 'historical_cpi',
          overrides: { lifeExpectancy: 100, sources: { lifeExpectancy: 'if I live to 100' } },
        },
      }, analyzer);

      const input = (analyzer.mock.calls[0] as any[])[0];
      // The partner reaches 95 at the user's 97 now, before the user reaches 100.
      expect(input.lifeExpectancy).toBe(100);
      expect(input.incomeStreams).toEqual([
        { label: 'Social Security', annualAmount: 30_000, startAge: 67, inflationAdjusted: true },
        { label: 'your partner\'s Social Security', annualAmount: 32_000, startAge: 69, inflationAdjusted: true, endAge: 97 },
        // The user outlives the partner and is paid their $32,000: $2,000 above their own.
        { label: 'survivor benefit on your partner\'s record', annualAmount: 2_000, startAge: 97, inflationAdjusted: true },
      ]);
    });

    it('rejects a planning-age what-if that ends before withdrawals even when a younger partner extends the horizon', async () => {
      const data = coupleSnapshot();
      // Partner 10 years younger: household horizon stays past withdrawal start
      // while the user's own planning age of 55 does not.
      const plan = { age: 40, planThroughAge: 95 };
      const timeline = householdTimeline({ currentAge: 50, userPlanThroughAge: 95, partner: plan });
      data.retirementAnalysis._household = {
        plan,
        origins: { age: 'stated', planThroughAge: 'default' },
        timeline,
      };
      data.retirementAnalysis._storedInputParams.lifeExpectancy = timeline.horizonAge;
      data.retirementAnalysis._storedInputParams.incomeStreams = [];

      const execution = await runRetirementScenario(data, {
        requested: true,
        primary: {
          type: 'historical_cpi',
          overrides: { lifeExpectancy: 55, sources: { lifeExpectancy: 'if I only live to 55' } },
        },
      }, jest.fn(async () => analysis(0.85)));

      expect(execution.status).toBe('unavailable');
      if (execution.status === 'unavailable') {
        expect(execution.reason).toMatch(/Life expectancy must be later/i);
      }
    });
  });

  it('claims the baseline\'s Social Security at another age by Social Security\'s rules', async () => {
    const analyzer = jest.fn(async () => analysis(0.85));
    const data = snapshot();
    data.retirementAnalysis._storedInputParams.incomeStreams = [
      { label: 'Social Security', annualAmount: 30_000, startAge: 67, inflationAdjusted: true },
      { label: 'pension or other income', annualAmount: 20_000, startAge: 60, inflationAdjusted: false },
    ];
    const execution = await runRetirementScenario(data, {
      requested: true,
      primary: {
        type: 'historical_cpi',
        overrides: { socialSecurityStartAge: 70, sources: { socialSecurityStartAge: 'claim at 70' } },
      },
    }, analyzer);

    expect(execution.status).toBe('completed');
    expect(analyzer).toHaveBeenCalledTimes(1);
    expect((analyzer.mock.calls[0] as any[])[0].incomeStreams).toEqual([
      { label: 'Social Security', annualAmount: 37_200, startAge: 70, inflationAdjusted: true },
      { label: 'pension or other income', annualAmount: 20_000, startAge: 60, inflationAdjusted: false },
    ]);
    if (execution.status !== 'completed') return;
    const [claimed, baseline] = execution.scenarios;
    expect(claimed.label).toBe('Historical CPI-linked withdrawals with Social Security claimed at 70');
    expect(claimed.claiming).toMatchObject({ fromAmount: 30_000, fromAge: 67, toAge: 70, amount: 37_200 });
    expect(baseline.reusedBaseline).toBe(true);
    expect(describeRetirementScenarioExecution(execution)).toContain(
      'Claimed at 70 instead of 67, Social Security of $30,000 a year becomes $37,200 by Social Security\'s own rules'
    );
    expect(compactRetirementScenarioExecution(execution)).toMatchObject({
      scenarios: [expect.objectContaining({ claiming: expect.objectContaining({ amount: 37_200 }) }), expect.anything()],
    });
    const facts = retirementScenarioCanonicalFacts(execution);
    expect(facts.find((fact) => fact.id.endsWith('_social_security_at_claiming_age'))?.value).toBe(37_200);
    expect(facts.find((fact) => fact.id.endsWith('_assumption_social_security_start_age'))?.value).toBe(70);
  });

  it('keeps the baseline\'s contributions in a what-if, and drops them where withdrawals begin now', async () => {
    const analyzer = jest.fn(async () => analysis(0.85));
    const data = snapshot();
    data.retirementAnalysis._storedInputParams.annualContributionAmount = 18_000;

    const later = await runRetirementScenario(data, {
      requested: true,
      primary: {
        type: 'historical_cpi',
        overrides: { annualWithdrawalAmount: 45_000, sources: { annualWithdrawalAmount: 'spend $45k' } },
      },
    }, analyzer);
    expect(later.status).toBe('completed');
    expect((analyzer.mock.calls[0] as any[])[0].annualContributionAmount).toBe(18_000);
    if (later.status === 'completed') {
      expect(later.scenarios[1].reusedBaseline).toBe(true);
      expect(describeRetirementScenarioExecution(later)).toContain('$18,000 a year in pre-withdrawal contributions');
    }

    analyzer.mockClear();
    const now = await runRetirementScenario(data, {
      requested: true,
      primary: {
        type: 'historical_cpi',
        overrides: {
          retirementAge: 50,
          withdrawalStartAge: 50,
          sources: { retirementAge: 'retire now', withdrawalStartAge: 'retire now' },
        },
      },
    }, analyzer);
    expect(now.status).toBe('completed');
    expect((analyzer.mock.calls[0] as any[])[0].annualContributionAmount).toBe(0);
  });

  it('says there is no Social Security to move rather than comparing nothing', async () => {
    const analyzer = jest.fn(async () => analysis(0.85));
    const execution = await runRetirementScenario(snapshot(), {
      requested: true,
      primary: {
        type: 'historical_cpi',
        overrides: { socialSecurityStartAge: 70, sources: { socialSecurityStartAge: 'claim at 70' } },
      },
    }, analyzer);

    expect(execution).toMatchObject({ status: 'unavailable', reason: expect.stringMatching(/no Social Security benefit/) });
    expect(analyzer).not.toHaveBeenCalled();
  });

  it('compares one requested policy with the existing CPI baseline and discloses the fixed-growth default', async () => {
    const analyzer = jest.fn(async () => analysis(0.7));
    const execution = await runRetirementScenario(snapshot(), {
      requested: true,
      primary: { type: 'fixed_growth', source: 'increase it each year' },
    }, analyzer);

    expect(execution.status).toBe('completed');
    if (execution.status !== 'completed') return;
    expect(analyzer).toHaveBeenCalledTimes(1);
    expect(execution.scenarios[0].withdrawalPolicy).toEqual({
      type: 'fixed_growth',
      annualRate: DEFAULT_FIXED_WITHDRAWAL_GROWTH_RATE,
    });
    expect(execution.scenarios[0].assumptions).toContainEqual(expect.objectContaining({
      key: 'annual_growth_rate',
      origin: 'default',
    }));
    expect(execution.scenarios[1]).toMatchObject({
      withdrawalPolicy: { type: 'historical_cpi' },
      reusedBaseline: true,
    });
    expect(compactRetirementScenarioExecution(execution)).toMatchObject({
      status: 'completed',
      scenarios: [{ metrics: { survivalRate: 0.7 } }, { metrics: { survivalRate: 0.9 } }],
    });
  });

  it('does not give an untraceable model-supplied rate user-input authority', async () => {
    const analyzer = jest.fn(async () => analysis(0.7));
    const execution = await runRetirementScenario(snapshot(), {
      requested: true,
      primary: { type: 'fixed_growth', annualRate: 0.04 },
    }, analyzer);

    expect(execution.status).toBe('completed');
    if (execution.status !== 'completed') return;
    expect(execution.scenarios[0].withdrawalPolicy).toEqual({
      type: 'fixed_growth',
      annualRate: DEFAULT_FIXED_WITHDRAWAL_GROWTH_RATE,
    });
    expect(execution.scenarios[0].assumptions).toContainEqual(expect.objectContaining({
      key: 'annual_growth_rate',
      origin: 'default',
    }));
  });

  it('applies traced contribution, retirement-date, spending, and longevity overrides', async () => {
    const analyzer = jest.fn(async () => analysis(0.82));
    const execution = await runRetirementScenario(snapshot(), {
      requested: true,
      primary: {
        type: 'historical_cpi',
        source: 'retire at 65, contribute $12,000, spend $50,000, and plan to 100',
        overrides: {
          annualWithdrawalAmount: 50_000,
          annualContributionAmount: 12_000,
          retirementAge: 65,
          withdrawalStartAge: 65,
          lifeExpectancy: 100,
          sources: {
            annualWithdrawalAmount: 'spend $50,000',
            annualContributionAmount: 'contribute $12,000',
            retirementAge: 'retire at 65',
            withdrawalStartAge: 'retire at 65',
            lifeExpectancy: 'plan to 100',
          },
        },
      },
    }, analyzer);

    expect(execution.status).toBe('completed');
    if (execution.status !== 'completed') return;
    expect(analyzer).toHaveBeenCalledTimes(1);
    expect(analyzer).toHaveBeenCalledWith(expect.objectContaining({
      annualWithdrawalAmount: 50_000,
      annualContributionAmount: 12_000,
      retirementAge: 65,
      withdrawalStartAge: 65,
      lifeExpectancy: 100,
      withdrawalPolicy: { type: 'historical_cpi' },
    }));
    expect(execution.scenarios[0].assumptions).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'annual_withdrawal_amount', value: 50_000, origin: 'user' }),
      expect.objectContaining({ key: 'pre_withdrawal_contributions', value: 12_000, origin: 'user' }),
      expect.objectContaining({ key: 'retirement_age', value: 65, origin: 'user' }),
      expect.objectContaining({ key: 'life_expectancy', value: 100, origin: 'user' }),
    ]));
    expect(execution.scenarios[1]).toMatchObject({ reusedBaseline: true });
  });

  it('drops untraceable numeric overrides before execution', () => {
    expect(parseRetirementScenarioPlan({
      requested: true,
      primary: {
        type: 'historical_cpi',
        overrides: {
          annualWithdrawalAmount: 50_000,
          annualContributionAmount: 12_000,
          retirementAge: 65,
          withdrawalStartAge: 65,
          lifeExpectancy: 100,
          sources: {
            annualWithdrawalAmount: null,
            annualContributionAmount: null,
            retirementAge: null,
            withdrawalStartAge: null,
            lifeExpectancy: null,
          },
        },
      },
      comparison: { type: 'none' },
    })).toEqual({ requested: true, primary: { type: 'historical_cpi' } });
  });

  it('rejects cross-field date overrides that cannot form a valid horizon', async () => {
    const execution = await runRetirementScenario(snapshot(), {
      requested: true,
      primary: {
        type: 'historical_cpi',
        overrides: {
          withdrawalStartAge: 100,
          lifeExpectancy: 95,
          sources: {
            withdrawalStartAge: 'start at 100',
            lifeExpectancy: 'plan to 95',
          },
        },
      },
    });

    expect(execution).toMatchObject({
      status: 'unavailable',
      reason: expect.stringMatching(/life expectancy/i),
    });
  });

  it('returns an actionable unavailable result instead of estimating without a baseline', async () => {
    const execution = await runRetirementScenario({} as any, {
      requested: true,
      primary: { type: 'flat_nominal' },
    });
    expect(execution).toMatchObject({
      status: 'unavailable',
      reason: expect.stringMatching(/baseline/i),
    });
  });

  it('stays silent when the answer already explains why the baseline did not run', async () => {
    // No holdings linked: the missing-input note says so, and what linking adds.
    // "A completed retirement baseline is required" after it repeated the wall.
    const blocked = await runRetirementScenario({
      retirementAnalysisNeedsInfo: { missingParams: [], detectedParams: {}, unavailableCode: 'no_holdings' },
    } as any, { requested: true, primary: { type: 'flat_nominal' } });
    expect(blocked).toMatchObject({ status: 'unavailable', baselineBlockerExplained: true });
    expect(describeRetirementScenarioExecution(blocked)).toBeNull();

    const missingInput = await runRetirementScenario({
      retirementAnalysisNeedsInfo: { missingParams: ['annualWithdrawalAmount'], detectedParams: {} },
    } as any, { requested: true, primary: { type: 'flat_nominal' } });
    expect(describeRetirementScenarioExecution(missingInput)).toBeNull();

    // A stale baseline with holdings gone: same wall, same silence. Reporting
    // "holdings are required" after the missing-input note repeated it.
    const staleBaseline = await runRetirementScenario({
      retirementAnalysis: { _storedInputParams: { currentAge: 40, retirementAge: 65 } },
      retirementAnalysisNeedsInfo: { missingParams: [], detectedParams: {}, unavailableCode: 'no_holdings' },
      investments: { holdings: [], securities: [] },
    } as any, { requested: true, primary: { type: 'flat_nominal' } });
    expect(staleBaseline).toMatchObject({ status: 'unavailable', baselineBlockerExplained: true });
    expect(describeRetirementScenarioExecution(staleBaseline)).toBeNull();
  });

  it('still reports a baseline that failed for a reason the user is not told about', async () => {
    const execution = await runRetirementScenario({
      retirementAnalysisNeedsInfo: { missingParams: [], detectedParams: {}, unavailableCode: 'service_error' },
    } as any, { requested: true, primary: { type: 'flat_nominal' } });
    expect(describeRetirementScenarioExecution(execution)).toMatch(/could not run the requested scenario/);
  });

  it('treats an empty securities list as missing investment details', async () => {
    const incomplete = snapshot();
    incomplete.investments.securities = [];
    const analyzer = jest.fn(async () => analysis(0.7));
    const execution = await runRetirementScenario(incomplete, {
      requested: true,
      primary: { type: 'flat_nominal' },
    }, analyzer);

    expect(analyzer).not.toHaveBeenCalled();
    expect(execution).toMatchObject({
      status: 'unavailable',
      reason: expect.stringMatching(/investment holdings and security details/i),
    });
  });
});
