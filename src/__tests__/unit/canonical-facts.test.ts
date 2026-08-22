import { buildCanonicalFactPack, validateCanonicalFactPack } from '../../openai/canonical-facts';
import { questionNeedsFromPacks, type ContextPackId } from '../../openai/context-packs';

const needs = (...packs: ContextPackId[]) => questionNeedsFromPacks(packs, false);

function snapshot() {
  return {
    accounts: [{ id: 'checking-1', name: 'Checking', type: 'depository', balance: 5000 }],
    bankingTransactions: [
      { id: 'expense-1', name: 'Coffee', merchantName: 'Cafe', amount: -12, date: '2026-08-12', typeLabel: '(EXPENSE)' },
      { id: 'expense-2', name: 'Lunch', merchantName: 'Cafe', amount: 20, date: '2026-08-13', typeLabel: '(EXPENSE)' },
      { id: 'transfer-1', name: 'Transfer', amount: 1000, date: '2026-08-13', typeLabel: '(TRANSFER_OUT)' },
    ],
    averageMonthlyIncome: 10_000,
    averageMonthlyExpense: 7_500,
    transactionSummary: { byCategory: { Dining: 32 } },
    metadata: { lastUpdated: new Date(), dataSources: {}, errors: [] },
    tierContext: { tierInfo: { currentTier: 'starter', availableSources: [] }, upgradeHints: [] },
    financialSummary: {
      computedAt: '2026-08-14T00:00:00.000Z',
      financialOverview: { netWorth: 100_000, totalCash: 20_000, totalInvestments: 90_000, totalDebt: 10_000, homeValue: null },
    },
  } as any;
}

describe('buildCanonicalFactPack', () => {
  it('supplies every always-loaded fact, whatever the question names', () => {
    // These all come from snapshot columns that are read on every request, so
    // withholding them buys nothing and only decides whether the model can cite
    // a number it can already see.
    const pack = buildCanonicalFactPack(snapshot(), 'What is my net worth?', needs());
    expect(pack.facts.map((fact) => fact.id)).toEqual([
      'net_worth',
      'total_cash',
      'total_investments',
      'total_debt',
      'average_monthly_income',
      'average_monthly_expenses',
      'average_monthly_operating_cash_flow',
      'savings_rate',
      'category_spending_dining',
    ]);
  });

  it('does not supply facts that need an unloaded column', () => {
    // Accounts, transactions, and holdings are extra JSON columns fetched only
    // when the question routes to them; those facts stay routed.
    const question = 'What is my net worth?';
    const pack = buildCanonicalFactPack(snapshot(), question, needs());
    const ids = pack.facts.map((fact) => fact.id);

    expect(ids.some((id) => id.startsWith('account_balance_'))).toBe(false);
    expect(ids.some((id) => id.startsWith('expense_transaction_'))).toBe(false);
    expect(ids.some((id) => id.startsWith('holding_value_'))).toBe(false);
  });

  it('makes Plaid liability rates and payment amounts citable account facts', () => {
    const data = snapshot();
    data.accounts = [{
      id: 'credit-1',
      name: 'Rewards Card',
      type: 'credit',
      balance: 1200,
      liabilityDetails: [{
        provider: 'plaid',
        kind: 'credit',
        retrievedAt: '2026-08-18T12:00:00Z',
        aprs: [{
          type: 'purchase_apr',
          percentage: 19.99,
          balanceSubjectToApr: 1000,
          interestChargeAmount: 12,
        }],
        minimumPaymentAmount: 50,
      }],
    }];

    const pack = buildCanonicalFactPack(
      data,
      'What is the APR and minimum payment on my Rewards Card?',
      needs('account_details'),
    );

    expect(pack.facts.find(fact => fact.id.startsWith('liability_apr_'))).toMatchObject({
      value: 19.99,
      unit: 'percent',
      provenance: {
        kind: 'snapshot',
        source: 'accounts.credit-1.liabilityDetails.0.aprs.0.percentage',
        asOf: '2026-08-18T12:00:00.000Z',
      },
    });
    expect(pack.facts.find(fact => fact.id.startsWith('liability_minimum_payment_'))).toMatchObject({
      value: 50,
      unit: 'usd',
      provenance: {
        source: 'accounts.credit-1.liabilityDetails.0.minimumPaymentAmount',
      },
    });
  });

  it('grounds FMP exposures and Tiingo quote/performance observations as external facts', () => {
    const data = snapshot();
    data.investments = {
      totalValue: 100,
      holdingCount: 1,
      summaryLines: [],
      holdings: [],
      securities: [],
      externalData: {
        asOf: '2026-08-18T15:00:00Z',
        sources: ['fmp', 'tiingo'],
        portfolioExposure: {
          metadataAsOf: '2026-08-11T00:00:00Z',
          countryAllocations: [{ name: 'United States', percentage: 98 }],
          sectorAllocations: [{ name: 'Technology', percentage: 35 }],
          countryCoverage: 1,
          sectorCoverage: 0.9,
          expenseRatioWeighted: 0.0009,
          expenseRatioCoverage: 1,
        },
        securities: [{
          ticker: 'SPY',
          name: 'SPDR S&P 500 ETF',
          expenseRatio: 0.0009,
          trailing12MonthReturn: 0.12,
          performanceThrough: '2026-07-31T00:00:00Z',
          countryAllocations: [{ name: 'United States', weight: 0.98 }],
          sectorAllocations: [{ name: 'Technology', weight: 0.35 }],
          quote: { price: 700, changePercent: 1.2, timestamp: '2026-08-18T15:00:00Z', feed: 'tiingo_iex' },
        }],
      },
    };
    const pack = buildCanonicalFactPack(data, 'What are SPY fees and sectors?', needs('investment_details'));

    expect(pack.facts.find(fact => fact.id === 'external_quote_spy')).toMatchObject({
      value: 700,
      unit: 'usd',
      provenance: { kind: 'external_context' },
    });
    expect(pack.facts.find(fact => fact.id === 'external_return_spy')).toMatchObject({ value: 12, unit: 'percent' });
    expect(pack.facts.find(fact => fact.id === 'external_expense_spy')).toMatchObject({ value: 0.09, unit: 'percent' });
    expect(pack.facts.find(fact => fact.id === 'external_spy_sector_technology')).toMatchObject({ value: 35, unit: 'percent' });
    expect(pack.facts.find(fact => fact.id === 'external_sector_technology')).toMatchObject({ value: 35, unit: 'percent' });
    // FMP-derived aggregates carry the FMP observation time, not the newer quote time.
    expect(pack.facts.find(fact => fact.id === 'external_country_coverage_source')?.provenance)
      .toMatchObject({ kind: 'external_context', asOf: '2026-08-11T00:00:00.000Z' });
    expect(pack.facts.find(fact => fact.id === 'external_quote_spy')?.provenance)
      .toMatchObject({ asOf: '2026-08-18T15:00:00.000Z' });
    expect(validateCanonicalFactPack(pack)).toEqual([]);
  });

  it('supplies the overview totals for a portfolio review that never names them', () => {
    // The reported failure: this question matched no balance-sheet keyword, so
    // net worth, cash, and debt were withheld while every account row was in
    // context — leaving the model no grounded way to summarize them.
    const question = 'Evaluate my entire financial portfolio, including my income and spending. ' +
      'Give me your assessment of its strengths and weaknesses, especially as it relates to ' +
      'my goal of retiring by age 62 or sooner.';
    const pack = buildCanonicalFactPack(snapshot(), question, needs('transaction_details', 'retirement_analysis'));

    expect(pack.facts.map((fact) => fact.id)).toEqual(expect.arrayContaining([
      'net_worth',
      'total_cash',
      'total_investments',
      'total_debt',
      'average_monthly_income',
      'average_monthly_expenses',
      'average_monthly_operating_cash_flow',
      'savings_rate',
    ]));
  });

  it('supplies category spending without loading the raw transaction rows', () => {
    // byCategory is persisted with every snapshot, so a cash-flow question can
    // be grounded on the breakdown even when the prompt carries no transactions.
    const data = snapshot();
    data.bankingTransactions = [];
    const question = 'How much do I spend each month?';
    const questionNeeds = needs();
    const pack = buildCanonicalFactPack(data, question, questionNeeds);

    expect(questionNeeds.needsTransactionDetails).toBe(false);
    expect(pack.facts.find((fact) => fact.id === 'category_spending_dining')).toMatchObject({
      value: 32,
      unit: 'usd',
    });
    expect(pack.facts.some((fact) => fact.id.startsWith('expense_transaction_'))).toBe(false);
  });

  it('labels category totals with the period they cover', () => {
    // The totals span the snapshot window while the facts beside them are
    // monthly averages, so the label has to say which is which.
    const data = snapshot();
    data.transactionSummary = {
      byCategory: { Dining: 2_400 },
      byMonth: { '2026-06': {}, '2026-07': {}, '2026-08': {} },
    };
    const question = 'What is my savings rate?';
    const pack = buildCanonicalFactPack(data, question, needs());

    expect(pack.facts.find((fact) => fact.id === 'category_spending_dining')?.label)
      .toBe('Dining spending over the last 3 months (total, not a monthly average)');
  });

  it('needs no phrasing heuristic to reach the cash-flow facts', () => {
    // This used to depend on a "is this a broad question?" matcher. Whatever a
    // question is phrased like, the always-loaded facts are there.
    const data = snapshot();
    for (const question of [
      'Assess my overall financial position.',
      'What are the strengths and weaknesses here?',
      'Review my portfolio for me.',
      'Anything I should know?',
      'hi',
    ]) {
      const pack = buildCanonicalFactPack(data, question, needs());
      expect(pack.facts.map((fact) => fact.id)).toEqual(expect.arrayContaining([
        'net_worth',
        'average_monthly_operating_cash_flow',
        'savings_rate',
        'category_spending_dining',
      ]));
    }
  });

  it('supplies and validates deterministic cash-flow calculations', () => {
    const pack = buildCanonicalFactPack(snapshot(), 'What is my savings rate?', needs());
    expect(pack.facts.find((fact) => fact.id === 'average_monthly_operating_cash_flow')?.value).toBe(2500);
    expect(pack.facts.find((fact) => fact.id === 'savings_rate')?.value).toBe(25);
    expect(validateCanonicalFactPack(pack)).toEqual([]);

    pack.facts.find((fact) => fact.id === 'savings_rate')!.value = 30;
    expect(validateCanonicalFactPack(pack)).toContain('savings_rate does not match its deterministic formula.');
  });

  it('includes the compact balance-sheet and cash-flow facts needed for an affordability decision', () => {
    const question = 'Can I afford to buy a $500k house?';
    const pack = buildCanonicalFactPack(snapshot(), question, needs());
    expect(pack.facts.map((fact) => fact.id)).toEqual(expect.arrayContaining([
      'net_worth',
      'total_cash',
      'total_debt',
      'average_monthly_income',
      'average_monthly_expenses',
      'average_monthly_operating_cash_flow',
    ]));
    expect(pack.facts).toContainEqual(expect.objectContaining({
      id: 'user_input_usd_1',
      value: 500_000,
      unit: 'usd',
      provenance: expect.objectContaining({ kind: 'user_input', source: 'userQuestion' }),
    }));
  });

  it('promotes typed values from requested market context into traceable facts', () => {
    const data = snapshot();
    data.marketContext = 'The current average mortgage rate is 6.5%.';
    data.marketContextMetadata = {
      id: 'auto-standard',
      tier: 'standard',
      lastUpdate: '2026-08-18T09:30:00.000Z',
      source: 'stored',
    };
    const question = 'How do current mortgage rates affect me?';
    const questionNeeds = needs('market_context');
    const pack = buildCanonicalFactPack(data, question, questionNeeds);
    expect(pack.facts).toContainEqual(expect.objectContaining({
      id: 'market_context_percent_1',
      value: 6.5,
      unit: 'percent',
      provenance: expect.objectContaining({
        kind: 'external_context',
        source: 'marketContext',
        asOf: '2026-08-18T09:30:00.000Z',
      }),
    }));
  });

  it('recognizes common user-entered retirement premises', () => {
    const question = 'Can I retire at 55 with 2 million?';
    const pack = buildCanonicalFactPack(snapshot(), question, needs('retirement_analysis'));
    expect(pack.facts).toEqual(expect.arrayContaining([
      expect.objectContaining({ value: 55, unit: 'age', provenance: expect.objectContaining({ kind: 'user_input' }) }),
      expect.objectContaining({ value: 2_000_000, unit: 'usd', provenance: expect.objectContaining({ kind: 'user_input' }) }),
    ]));
  });

  it('does not treat retirement account abbreviations as magnitudes', () => {
    const question = 'What is my 401k balance compared to my 403b and 457b?';
    const pack = buildCanonicalFactPack(snapshot(), question, needs('investment_details'));
    expect(pack.facts.some((fact) => fact.value === 401_000 || fact.value === 403_000_000_000 || fact.value === 457_000_000_000)).toBe(false);
  });

  it('aggregates only expense and fee transactions with traceable inputs', () => {
    const question = 'Which merchant has my largest purchases?';
    const pack = buildCanonicalFactPack(snapshot(), question, needs('transaction_details'));
    const merchant = pack.facts.find((fact) => fact.id === 'merchant_spending_cafe');
    expect(merchant).toMatchObject({ value: 32, unit: 'usd' });
    expect(merchant?.provenance.inputFactIds).toHaveLength(2);
    expect(pack.facts.some((fact) => fact.id.includes('transfer'))).toBe(false);
    expect(validateCanonicalFactPack(pack)).toEqual([]);
  });

  it('records fraction-to-percent retirement conversions as deterministic calculations', () => {
    const data = snapshot();
    data.retirementAnalysis = {
      metrics: {
        withdrawalRate: 0.04,
        equityAllocation: 70,
        yearsOfExpenses: 25,
        historicalWithdrawalRates: { p10: 0.03, p25: 0.035, p50: 0.04, p75: 0.045, p90: 0.05 },
      },
      stressTest: {
        survivalRate: 0.91,
        totalSequences: 100,
        depletionPercentiles: { p10: 12, p25: 18, p50: 25, p75: 30, p90: 35 },
      },
      _storedInputParams: { currentAge: 50, retirementAge: 65, annualWithdrawalAmount: 40_000, withdrawalStartAge: 65 },
    };
    const question = 'Am I on track for retirement?';
    const pack = buildCanonicalFactPack(data, question, needs('retirement_analysis'));
    expect(pack.facts.find((fact) => fact.id === 'withdrawal_rate_ratio')).toMatchObject({ value: 0.04, displayable: false });
    expect(pack.facts.find((fact) => fact.id === 'withdrawal_rate')).toMatchObject({
      value: 4,
      unit: 'percent',
      provenance: { kind: 'calculation', formula: 'input * 100', inputFactIds: ['withdrawal_rate_ratio'] },
    });
    expect(validateCanonicalFactPack(pack)).toEqual([]);
  });

  it('publishes excluded investment value and stamps every figure it distorts', () => {
    const data = snapshot();
    data.retirementAnalysis = {
      metrics: {
        withdrawalRate: 0.049,
        equityAllocation: 70,
        fixedIncomeAllocation: 20,
        tipsAllocation: 7,
        tipsAllocationStatus: 'lower-bound',
        cashAllocation: 5,
        internationalAllocation: 5,
        yearsOfExpenses: 20,
        projectedPortfolioAtWithdrawalStart: 1_868_490,
        expenseRatioWeighted: 0.004,
        expenseRatioCoverage: 0.9,
        countryCoverage: 0.85,
        sectorCoverage: 0.85,
        countryAllocation: [{ name: 'United States', percentage: 80 }],
        sectorAllocation: [{ name: 'Technology', percentage: 30 }],
        historicalWithdrawalRates: { p10: 0.03, p25: 0.035, p50: 0.04, p75: 0.045, p90: 0.05 },
      },
      stressTest: {
        survivalRate: 0.62,
        totalSequences: 100,
        depletionPercentiles: { p10: 12, p25: 18, p50: 25, p75: 30, p90: 35 },
      },
      dataQuality: {
        modeledValue: 1_868_490.56,
        unmodeledValue: 432_498.11,
        valueCoverage: 0.812,
        unmodeledReasons: [{ label: '401(k)', amount: 386_603.06, kind: 'partial-holdings' }],
      },
      _storedInputParams: { currentAge: 50, retirementAge: 65, annualWithdrawalAmount: 90_000, withdrawalStartAge: 65 },
    };
    const pack = buildCanonicalFactPack(data, 'Am I on track for retirement?', needs('retirement_analysis'));

    // The answer cannot state the exclusion unless the amounts are citeable.
    expect(pack.facts.find((fact) => fact.id === 'retirement_unmodeled_portfolio_value'))
      .toMatchObject({ value: 432_498.11, unit: 'usd' });
    expect(pack.facts.find((fact) => fact.id === 'retirement_modeled_portfolio_value'))
      .toMatchObject({ value: 1_868_490.56, unit: 'usd' });

    // The caveat travels with each distorted figure, not just in a footnote.
    for (const id of ['withdrawal_rate', 'years_of_expenses', 'survival_rate', 'projected_portfolio_at_withdrawal_start', 'depletion_years_p50']) {
      expect(pack.facts.find((fact) => fact.id === id)?.caveat).toContain('$432,498');
    }
    // Support metrics are floors; the user's withdrawal rate is an overstated ceiling.
    expect(pack.facts.find((fact) => fact.id === 'years_of_expenses')?.caveat).toContain('floor');
    expect(pack.facts.find((fact) => fact.id === 'withdrawal_rate')?.caveat).toContain('overstated');
    expect(pack.facts.find((fact) => fact.id === 'withdrawal_rate')?.caveat).not.toContain('floor');

    // Allocation must retain the itemized denominator rather than silently redistributing
    // value into whichever buckets were resolved.
    for (const id of ['equity_allocation', 'fixed_income_allocation', 'tips_allocation', 'cash_allocation', 'international_allocation']) {
      expect(pack.facts.find((fact) => fact.id === id)?.caveat).toContain(
        'does not renormalize unresolved or unsupported classes',
      );
    }
    expect(pack.facts.find((fact) => fact.id === 'tips_allocation')).toMatchObject({
      label: 'Known TIPS allocation (lower bound)',
      value: 7,
    });
    expect(pack.facts.find((fact) => fact.id === 'tips_allocation')?.caveat).toContain(
      'true TIPS allocation may be higher',
    );

    // Solved sustainable rates are scale-invariant (withdrawal scales with the
    // portfolio), so the exclusion does not move them and they carry no caveat.
    for (const id of ['historical_withdrawal_rate_p50', 'historical_withdrawal_rate_p10_ratio']) {
      expect(pack.facts.find((fact) => fact.id === id)?.caveat).toBeUndefined();
    }

    // Exposure and fee metrics aggregate the same itemized positions, so they
    // describe only itemized holdings however confidently their labels read.
    for (const id of ['portfolio_expense_ratio', 'expense_ratio_coverage', 'country_exposure_united_states', 'sector_exposure_technology']) {
      expect(pack.facts.find((fact) => fact.id === id)?.caveat).toContain('itemized holdings only');
    }
    // Figures the exclusion does not distort stay uncaveated.
    expect(pack.facts.find((fact) => fact.id === 'retirement_current_age')?.caveat).toBeUndefined();
    expect(validateCanonicalFactPack(pack)).toEqual([]);
  });

  it('leaves retirement facts uncaveated when the whole portfolio was modeled', () => {
    const data = snapshot();
    data.retirementAnalysis = {
      metrics: {
        withdrawalRate: 0.04,
        equityAllocation: 70,
        yearsOfExpenses: 25,
        historicalWithdrawalRates: { p10: 0.03, p25: 0.035, p50: 0.04, p75: 0.045, p90: 0.05 },
      },
      stressTest: {
        survivalRate: 0.91,
        totalSequences: 100,
        depletionPercentiles: { p10: 12, p25: 18, p50: 25, p75: 30, p90: 35 },
      },
      dataQuality: { modeledValue: 1_000_000, unmodeledValue: 0, valueCoverage: 1, unmodeledReasons: [] },
      _storedInputParams: { currentAge: 50, retirementAge: 65, annualWithdrawalAmount: 40_000, withdrawalStartAge: 65 },
    };
    const pack = buildCanonicalFactPack(data, 'Am I on track for retirement?', needs('retirement_analysis'));

    expect(pack.facts.find((fact) => fact.id === 'withdrawal_rate')?.caveat).toBeUndefined();
    expect(pack.facts.some((fact) => fact.id === 'retirement_unmodeled_portfolio_value')).toBe(false);
  });

  it('does not apply simulation exclusions to itemized exposure and fee facts', () => {
    const data = snapshot();
    data.retirementAnalysis = {
      metrics: {
        withdrawalRate: 0.04,
        equityAllocation: 60,
        fixedIncomeAllocation: 40,
        expenseRatioWeighted: 0.004,
        expenseRatioCoverage: 1,
        countryCoverage: 1,
        sectorCoverage: 1,
        yearsOfExpenses: 25,
        historicalWithdrawalRates: { p10: 0.03, p25: 0.035, p50: 0.04, p75: 0.045, p90: 0.05 },
      },
      stressTest: {
        survivalRate: 0.91,
        totalSequences: 100,
        depletionPercentiles: { p10: 12, p25: 18, p50: 25, p75: 30, p90: 35 },
      },
      dataQuality: {
        modeledValue: 600_000,
        unmodeledValue: 400_000,
        valueCoverage: 0.6,
        unmodeledReasons: [{
          label: 'Known asset classes without a supported historical return series',
          amount: 400_000,
          kind: 'unsupported-asset-class',
        }],
      },
      _storedInputParams: { currentAge: 50, retirementAge: 65, annualWithdrawalAmount: 40_000, withdrawalStartAge: 65 },
    };
    const pack = buildCanonicalFactPack(data, 'Am I on track for retirement?', needs('retirement_analysis'));

    expect(pack.facts.find(fact => fact.id === 'fixed_income_allocation')?.caveat)
      .toContain('excluded from historical simulation');
    for (const id of ['portfolio_expense_ratio', 'expense_ratio_coverage', 'country_exposure_coverage', 'sector_exposure_coverage']) {
      expect(pack.facts.find(fact => fact.id === id)?.caveat).toBeUndefined();
    }
  });

  it('grounds multiple modeled outcomes as scenario-scoped facts', () => {
    const data = snapshot();
    data.retirementAnalysis = {
      metrics: {
        withdrawalRate: 0.049,
        yearsOfExpenses: 20,
        projectedPortfolioAtWithdrawalStart: 1_868_490,
        historicalWithdrawalRates: { p10: 0.03, p25: 0.035, p50: 0.04, p75: 0.045, p90: 0.05 },
      },
      stressTest: {
        survivalRate: 0.62,
        totalSequences: 100,
        depletionPercentiles: { p10: 12, p25: 18, p50: 25, p75: 30, p90: 35 },
      },
      // Variants inherit the same exclusion; their facts must carry the caveat
      // or a what-if answer can quote them unqualified.
      dataQuality: {
        modeledValue: 1_868_490.56,
        unmodeledValue: 432_498.11,
        valueCoverage: 0.812,
        unmodeledReasons: [],
      },
      _storedInputParams: { currentAge: 50, retirementAge: 65, annualWithdrawalAmount: 90_000, withdrawalStartAge: 65 },
    };
    const scenario = (id: string, label: string, survivalRate: number, policy: any) => ({
      id,
      label,
      withdrawalPolicy: policy,
      assumptions: id === 'fixed' ? [
        { key: 'annual_growth_rate', label: 'Annual withdrawal growth', value: 0.03, origin: 'user' },
        { key: 'annual_withdrawal_amount', label: 'Starting spending', value: 50_000, origin: 'user' },
        { key: 'pre_withdrawal_contributions', label: 'Annual contributions', value: 12_000, origin: 'user' },
        { key: 'retirement_age', label: 'Retirement age', value: 65, origin: 'user' },
      ] : [],
      reusedBaseline: false,
      analysis: {
        metrics: {
          withdrawalRate: 0.04,
          yearsOfExpenses: 25,
          projectedPortfolioAtWithdrawalStart: 1_000_000,
        },
        stressTest: {
          survivalRate,
          totalSequences: 100,
          depletionPercentiles: { p10: 12, p25: 18, p50: 24, p75: 28, p90: 30 },
        },
      },
    });
    data.scenarioExecutions = { retirement: {
      version: 1,
      calculator: 'retirement',
      status: 'completed',
      computedAt: '2026-08-17T00:00:00.000Z',
      durationMs: 10,
      baselineScenarioId: 'base',
      scenarios: [
        scenario('fixed', '3% annual withdrawal growth', 0.75, { type: 'fixed_growth', annualRate: 0.03 }),
        scenario('flat', 'Flat nominal withdrawals', 0.95, { type: 'flat_nominal' }),
      ],
    } };

    const pack = buildCanonicalFactPack(data, 'Compare the scenarios.', needs('retirement_analysis'));
    const survivalFacts = pack.facts.filter((fact) =>
      fact.id.endsWith('_survival_rate') && fact.provenance?.kind === 'scenario_calculation'
    );
    expect(survivalFacts).toEqual([
      expect.objectContaining({
        value: 75,
        unit: 'percent',
        provenance: expect.objectContaining({ kind: 'scenario_calculation', calculatorId: 'retirement', scenarioId: 'fixed' }),
        caveat: expect.stringContaining('floor'),
      }),
      expect.objectContaining({
        value: 95,
        unit: 'percent',
        provenance: expect.objectContaining({ kind: 'scenario_calculation', scenarioId: 'flat' }),
        caveat: expect.stringContaining('floor'),
      }),
    ]);
    expect(pack.facts.find((fact) => fact.id === 'retirement_scenario_fixed_withdrawal_rate')?.caveat)
      .toContain('overstated');
    expect(pack.facts.find((fact) => fact.id === 'retirement_scenario_fixed_years_of_expenses')?.caveat)
      .toContain('floor');
    // Scenario inputs and growth-rate assumptions are not distorted by the exclusion.
    expect(pack.facts.find((fact) => fact.id === 'retirement_scenario_fixed_assumption_annual_growth_rate')?.caveat)
      .toBeUndefined();
    expect(pack.facts).toContainEqual(expect.objectContaining({
      id: 'retirement_scenario_fixed_assumption_annual_growth_rate',
      value: 0.03,
      unit: 'ratio',
      provenance: expect.objectContaining({ kind: 'scenario_input', scenarioId: 'fixed' }),
    }));
    expect(pack.facts).toContainEqual(expect.objectContaining({
      label: '3% annual withdrawal growth rate assumption',
      value: 3,
      unit: 'percent',
      provenance: expect.objectContaining({
        kind: 'scenario_calculation',
        formula: 'input * 100',
        inputFactIds: ['retirement_scenario_fixed_assumption_annual_growth_rate'],
      }),
    }));
    expect(pack.facts).toContainEqual(expect.objectContaining({
      id: 'retirement_scenario_fixed_assumption_pre_withdrawal_contributions',
      value: 12_000,
      unit: 'usd',
      provenance: expect.objectContaining({ kind: 'scenario_input', scenarioId: 'fixed' }),
    }));
    expect(pack.facts).toContainEqual(expect.objectContaining({
      label: 'Absolute survival-rate gap between 3% annual withdrawal growth and Flat nominal withdrawals',
      value: 20,
      unit: 'percent',
      provenance: expect.objectContaining({
        kind: 'scenario_calculation',
        scenarioId: 'fixed_vs_flat',
        inputFactIds: [
          'retirement_scenario_fixed_survival_rate',
          'retirement_scenario_flat_survival_rate',
        ],
      }),
    }));
    expect(validateCanonicalFactPack(pack)).toEqual([]);

    const growth = pack.facts.find((fact) => fact.id === 'retirement_scenario_fixed_annual_withdrawal_growth')!;
    growth.value = 4;
    expect(validateCanonicalFactPack(pack)).toContain(
      'retirement_scenario_fixed_annual_withdrawal_growth does not match its deterministic formula.'
    );
    growth.value = 3;

    const gap = pack.facts.find((fact) => fact.id.endsWith('_survival_rate_gap'))!;
    gap.value = 21;
    expect(validateCanonicalFactPack(pack)).toContain(
      `${gap.id} does not match its deterministic formula.`
    );
  });

  it('reports one allocation fact per asset class when a snapshot has split buckets', () => {
    // A snapshot persisted before asset types were normalized: Plaid's "etf" and
    // SnapTrade's "ETF" as separate rows. The fact id is case-folded, so without a
    // merge the second row would silently overwrite the first and the model would
    // be told ETF = 2.6% instead of 44.8%.
    const data = snapshot();
    data.financialSummary.investmentPortfolio = {
      totalValue: 1_000_000,
      holdingCount: 12,
      assetAllocation: [
        { type: 'ETF', value: 400_000, percentage: 40 },
        { type: 'etf', value: 48_000, percentage: 4.8 },
        { type: 'mutual fund', value: 200_000, percentage: 20 },
        { type: 'Mutual Fund', value: 50_000, percentage: 5 },
      ],
    };
    const question = 'What is my asset allocation?';
    const pack = buildCanonicalFactPack(data, question, needs('investment_details'));
    const allocationFacts = pack.facts.filter((fact) => fact.id.startsWith('allocation'));

    expect(allocationFacts.map((fact) => fact.id).sort()).toEqual([
      'allocation_etf',
      'allocation_mutual_fund',
      'allocation_value_etf',
      'allocation_value_mutual_fund',
    ]);
    expect(allocationFacts.find((fact) => fact.id === 'allocation_value_etf')?.value).toBe(448_000);
    expect(allocationFacts.find((fact) => fact.id === 'allocation_etf')?.value).toBeCloseTo(44.8);
    expect(allocationFacts.find((fact) => fact.id === 'allocation_value_mutual_fund')?.value).toBe(250_000);
    expect(allocationFacts.find((fact) => fact.id === 'allocation_mutual_fund')?.value).toBe(25);
  });

  it('sums spending categories that differ only in spelling into one fact', () => {
    // Plaid's legacy taxonomy and personal_finance_category describe the same
    // category with different casing. The fact id is case-folded, so without a
    // merge one of these totals would silently replace the other.
    const data = snapshot();
    data.transactionSummary = {
      byCategory: {
        'Food and Drink': 1_200,
        'Food And Drink': 800,
        Travel: 500,
        travel: 300,
        Rent: 2_000,
      },
    };
    const question = 'How much am I spending by category?';
    const pack = buildCanonicalFactPack(data, question, needs('transaction_details'));
    const categoryFacts = pack.facts.filter((fact) => fact.id.startsWith('category_spending'));

    expect(categoryFacts.map((fact) => fact.id).sort()).toEqual([
      'category_spending_food_and_drink',
      'category_spending_rent',
      'category_spending_travel',
    ]);
    expect(categoryFacts.find((fact) => fact.id === 'category_spending_food_and_drink')?.value).toBe(2_000);
    expect(categoryFacts.find((fact) => fact.id === 'category_spending_travel')?.value).toBe(800);
    expect(categoryFacts.find((fact) => fact.id === 'category_spending_rent')?.value).toBe(2_000);
  });

  it('labels holding facts with a ticker or name, never a bare provider id', () => {
    // provenanceLabel is shown as "Source:" on key-metric tiles. Falling back to
    // security_id here would put hex under a dollar figure — the same class of
    // bug this PR fixes for fact ids and missingData prose.
    const data = snapshot();
    data.investments = {
      totalValue: 1_000,
      holdingCount: 2,
      summaryLines: [],
      securities: [],
      holdings: [
        {
          id: 'h1',
          account_id: 'a1',
          security_id: '7dD8KV8owvUX4bDwnDNPcLPy8Kyr9dFzwg9RN',
          ticker_symbol: 'VTI',
          security_name: 'Vanguard Total Stock Market',
          institution_value: 600,
        },
        {
          id: 'h2',
          account_id: 'a1',
          security_id: 'SPUSA061004C00000000',
          institution_value: 400,
        },
        {
          id: 'h3',
          account_id: 'a1',
          security_id: 'M654JE4yQdCRMKroO17KuZJ3Lo34kKHkV08Je',
          // Some feeds echo the id into security_name when they have nothing else.
          security_name: 'M654JE4yQdCRMKroO17KuZJ3Lo34kKHkV08Je',
          institution_value: 50,
        },
      ],
    };

    const pack = buildCanonicalFactPack(data, 'What are my holdings worth?', needs('investment_details'));
    const holdingFacts = pack.facts.filter((fact) => fact.id.startsWith('holding_value_'));

    expect(holdingFacts.find((fact) => fact.id.includes('h1'))?.label).toBe('VTI holding value');
    expect(holdingFacts.find((fact) => fact.id.includes('h2'))?.label).toBe('Unidentified holding value');
    expect(holdingFacts.find((fact) => fact.id.includes('h3'))?.label).toBe('Unidentified holding value');
    expect(holdingFacts.every((fact) => !/SPUSA061004C00000000|7dD8KV8owv|M654JE4yQd/.test(fact.label))).toBe(true);
  });
});
