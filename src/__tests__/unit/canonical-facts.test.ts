import { buildCanonicalFactPack, validateCanonicalFactPack } from '../../openai/canonical-facts';
import { analyzeQuestionNeeds } from '../../openai/question-analysis';

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
  it('selects overview facts according to question intent', () => {
    const pack = buildCanonicalFactPack(snapshot(), 'What is my net worth?', analyzeQuestionNeeds('What is my net worth?'));
    expect(pack.facts.map((fact) => fact.id)).toEqual(['net_worth']);
  });

  it('supplies and validates deterministic cash-flow calculations', () => {
    const pack = buildCanonicalFactPack(snapshot(), 'What is my savings rate?', analyzeQuestionNeeds('What is my savings rate?'));
    expect(pack.facts.find((fact) => fact.id === 'average_monthly_operating_cash_flow')?.value).toBe(2500);
    expect(pack.facts.find((fact) => fact.id === 'savings_rate')?.value).toBe(25);
    expect(validateCanonicalFactPack(pack)).toEqual([]);

    pack.facts.find((fact) => fact.id === 'savings_rate')!.value = 30;
    expect(validateCanonicalFactPack(pack)).toContain('savings_rate does not match its deterministic formula.');
  });

  it('includes the compact balance-sheet and cash-flow facts needed for an affordability decision', () => {
    const question = 'Can I afford to buy a $500k house?';
    const pack = buildCanonicalFactPack(snapshot(), question, analyzeQuestionNeeds(question));
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
    const question = 'How do current mortgage rates affect me?';
    const needs = { ...analyzeQuestionNeeds(question), needsMarketContext: true };
    const pack = buildCanonicalFactPack(data, question, needs);
    expect(pack.facts).toContainEqual(expect.objectContaining({
      id: 'market_context_percent_1',
      value: 6.5,
      unit: 'percent',
      provenance: expect.objectContaining({ kind: 'external_context', source: 'marketContext' }),
    }));
  });

  it('recognizes common user-entered retirement premises', () => {
    const question = 'Can I retire at 55 with 2 million?';
    const pack = buildCanonicalFactPack(snapshot(), question, analyzeQuestionNeeds(question));
    expect(pack.facts).toEqual(expect.arrayContaining([
      expect.objectContaining({ value: 55, unit: 'age', provenance: expect.objectContaining({ kind: 'user_input' }) }),
      expect.objectContaining({ value: 2_000_000, unit: 'usd', provenance: expect.objectContaining({ kind: 'user_input' }) }),
    ]));
  });

  it('does not treat retirement account abbreviations as magnitudes', () => {
    const question = 'What is my 401k balance compared to my 403b and 457b?';
    const pack = buildCanonicalFactPack(snapshot(), question, analyzeQuestionNeeds(question));
    expect(pack.facts.some((fact) => fact.value === 401_000 || fact.value === 403_000_000_000 || fact.value === 457_000_000_000)).toBe(false);
  });

  it('aggregates only expense and fee transactions with traceable inputs', () => {
    const question = 'Which merchant has my largest purchases?';
    const pack = buildCanonicalFactPack(snapshot(), question, analyzeQuestionNeeds(question));
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
    const pack = buildCanonicalFactPack(data, question, analyzeQuestionNeeds(question));
    expect(pack.facts.find((fact) => fact.id === 'withdrawal_rate_ratio')).toMatchObject({ value: 0.04, displayable: false });
    expect(pack.facts.find((fact) => fact.id === 'withdrawal_rate')).toMatchObject({
      value: 4,
      unit: 'percent',
      provenance: { kind: 'calculation', formula: 'input * 100', inputFactIds: ['withdrawal_rate_ratio'] },
    });
    expect(validateCanonicalFactPack(pack)).toEqual([]);
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
    const pack = buildCanonicalFactPack(data, question, analyzeQuestionNeeds(question));
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
});
