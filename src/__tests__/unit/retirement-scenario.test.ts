import {
  DEFAULT_FIXED_WITHDRAWAL_GROWTH_RATE,
  compactRetirementScenarioExecution,
  parseRetirementScenarioPlan,
  runRetirementScenario,
} from '../../scenarios/retirement-scenario';
import type { RetirementAnalysisOutput } from '../../retirement-analytics';

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
      metadataConfidence: 'high',
      portfolioMappingConfidence: 'high',
      proxiedValuePercentage: 0,
      proxyUsage: {
        usEquityProxy: 'VTI',
        internationalEquityProxy: 'US equity history',
        bondsProxy: 'AGG',
        unmappedHoldings: [],
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
