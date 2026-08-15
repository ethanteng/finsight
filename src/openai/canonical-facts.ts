import type { FinancialContextSnapshot, QuestionNeeds } from './types';

export type CanonicalFactUnit = 'usd' | 'percent' | 'months' | 'years' | 'age' | 'count' | 'ratio';

export interface CanonicalFactProvenance {
  kind: 'snapshot' | 'calculation' | 'user_input' | 'external_context';
  source: string;
  asOf?: string;
  formula?: string;
  inputFactIds?: string[];
}

export interface CanonicalFact {
  id: string;
  label: string;
  value: number;
  unit: CanonicalFactUnit;
  /** False for calculation inputs that remain traceable but must not be displayed directly. */
  displayable?: boolean;
  provenance: CanonicalFactProvenance;
}

export interface CanonicalFactPack {
  version: 1;
  snapshotComputedAt?: string;
  snapshotAsOf?: string;
  facts: CanonicalFact[];
}

function isoString(value: Date | string | null | undefined): string | undefined {
  if (!value) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function cashFlowQuestion(question: string): boolean {
  return /\b(income|pay|spend|spending|expense|expenses|cash[ -]?flow|budget|saving|savings|runway|emergency fund)\b/i.test(question);
}

function financialDecisionQuestion(question: string): boolean {
  return /\b(afford|affordable|buy|purchase|down payment|pay down|pay off|should i|compare|versus|vs\.?|better option)\b/i.test(question);
}

function broadFinancialQuestion(question: string, needs: QuestionNeeds): boolean {
  if (/\b(overall|financial picture|how am i doing|finances|financial health)\b/i.test(question)) return true;
  const hasSpecificContext = needs.needsAccountDetails || needs.needsTransactionDetails ||
    needs.needsInvestments || needs.needsRetirement || needs.needsHomeValue ||
    needs.needsMarketContext || needs.needsSearchContext;
  const namesSpecificMetric = /\b(net worth|cash|liquidity|income|pay|spend|spending|expense|expenses|cash[ -]?flow|budget|saving|savings|debt|loan|mortgage|portfolio|investment)\b/i.test(question);
  return !hasSpecificContext && !namesSpecificMetric;
}

function includesAny(question: string, pattern: RegExp): boolean {
  return pattern.test(question);
}

function safeFactId(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 80);
}

interface TrustedNumericValue {
  value: number;
  unit: CanonicalFactUnit;
}

function parseMagnitude(value: string, magnitude?: string): number {
  const parsed = Number(value.replace(/,/g, ''));
  const normalized = magnitude?.toLowerCase();
  if (normalized === 'k' || normalized === 'thousand') return parsed * 1_000;
  if (normalized === 'm' || normalized === 'million') return parsed * 1_000_000;
  if (normalized === 'b' || normalized === 'billion') return parsed * 1_000_000_000;
  return parsed;
}

/** Skip 401k / 403b / 457b style account labels that share a magnitude suffix. */
function isAccountTypeAbbreviation(value: string, magnitude?: string): boolean {
  const digits = value.replace(/,/g, '').replace(/^-/, '');
  const mag = magnitude?.toLowerCase();
  if (!mag || mag.length !== 1) return false;
  if (mag === 'k' && /^(401|403|457)$/.test(digits)) return true;
  if (mag === 'b' && /^(403|457)$/.test(digits)) return true;
  return false;
}

/** Extract explicit, typed values without treating product names such as S&P 500 as facts. */
function extractTrustedNumericValues(text: string): TrustedNumericValue[] {
  const values: TrustedNumericValue[] = [];
  const seen = new Set<string>();
  const add = (value: number, unit: CanonicalFactUnit) => {
    if (!Number.isFinite(value)) return;
    const key = `${unit}:${value}`;
    if (seen.has(key)) return;
    seen.add(key);
    values.push({ value, unit });
  };

  for (const match of text.matchAll(/(-?)\$\s*(\d[\d,]*(?:\.\d+)?)\s*(thousand|million|billion|[kmb])?/gi)) {
    add((match[1] === '-' ? -1 : 1) * parseMagnitude(match[2], match[3]), 'usd');
  }
  for (const match of text.matchAll(/(-?\d[\d,]*(?:\.\d+)?)\s*(thousand|million|billion)?\s+dollars?\b/gi)) {
    add(parseMagnitude(match[1], match[2]), 'usd');
  }
  for (const match of text.matchAll(/\b(\d[\d,]*(?:\.\d+)?)\s*(thousand|million|billion|[kmb])\b/gi)) {
    if (isAccountTypeAbbreviation(match[1], match[2])) continue;
    add(parseMagnitude(match[1], match[2]), 'usd');
  }
  for (const match of text.matchAll(/(-?\d[\d,]*(?:\.\d+)?)\s*%/gi)) {
    add(Number(match[1].replace(/,/g, '')), 'percent');
  }
  for (const match of text.matchAll(/\bage\s+(\d{1,3})\b/gi)) add(Number(match[1]), 'age');
  for (const match of text.matchAll(/\b(\d{1,3})\s+years?\s+old\b/gi)) add(Number(match[1]), 'age');
  for (const match of text.matchAll(/\bretir(?:e|ement)\s+(?:at|by)\s+(?:age\s+)?(\d{1,3})\b/gi)) add(Number(match[1]), 'age');
  for (const match of text.matchAll(/\b(\d[\d,]*(?:\.\d+)?)\s*(?:-\s*)?(months?|years?)\b/gi)) {
    add(Number(match[1].replace(/,/g, '')), match[2].toLowerCase().startsWith('month') ? 'months' : 'years');
  }
  return values;
}

/** Build the only numeric facts the model may display for this question. */
export function buildCanonicalFactPack(
  snapshot: FinancialContextSnapshot,
  question: string,
  needs: QuestionNeeds
): CanonicalFactPack {
  const computedAt = isoString(snapshot.financialSummary?.computedAt);
  const asOf = isoString(snapshot.financialSummary?.asOf) ?? isoString(snapshot.metadata.persistedAsOf);
  const facts = new Map<string, CanonicalFact>();
  const addSnapshotFact = (
    id: string,
    label: string,
    value: unknown,
    unit: CanonicalFactUnit,
    source: string,
    displayable = true
  ) => {
    if (!finite(value)) return;
    facts.set(id, {
      id,
      label,
      value,
      unit,
      ...(!displayable && { displayable: false }),
      provenance: { kind: 'snapshot', source, ...(asOf && { asOf }) },
    });
  };
  const addCalculatedFact = (
    id: string,
    label: string,
    value: number,
    unit: CanonicalFactUnit,
    formula: string,
    inputFactIds: string[]
  ) => {
    if (!finite(value) || !inputFactIds.every((inputId) => facts.has(inputId))) return;
    facts.set(id, {
      id,
      label,
      value,
      unit,
      provenance: {
        kind: 'calculation',
        source: `calculation.${id}`,
        formula,
        inputFactIds,
        ...(asOf && { asOf }),
      },
    });
  };
  const addTrustedTextFacts = (
    text: string | undefined,
    idPrefix: string,
    labelPrefix: string,
    kind: 'user_input' | 'external_context',
    source: string,
    sourceAsOf?: string,
    limit = 20
  ) => {
    if (!text) return;
    extractTrustedNumericValues(text).slice(0, limit).forEach((item, index) => {
      const id = `${idPrefix}_${item.unit}_${index + 1}`;
      facts.set(id, {
        id,
        label: `${labelPrefix} ${item.unit.replace('_', ' ')} value`,
        value: item.value,
        unit: item.unit,
        provenance: {
          kind,
          source,
          ...(sourceAsOf && { asOf: sourceAsOf }),
        },
      });
    });
  };

  const overview = snapshot.financialSummary?.financialOverview;
  if (overview) {
    const broad = broadFinancialQuestion(question, needs);
    const decision = financialDecisionQuestion(question);
    if (broad || decision || includesAny(question, /\b(net worth|assets?|liabilities|financial position)\b/i)) {
      addSnapshotFact('net_worth', 'Net worth', overview.netWorth, 'usd', 'financialSummary.financialOverview.netWorth');
    }
    if (broad || decision || includesAny(question, /\b(cash|liquid|liquidity|emergency fund)\b/i)) {
      addSnapshotFact('total_cash', 'Total cash', overview.totalCash, 'usd', 'financialSummary.financialOverview.totalCash');
    }
    if (broad || needs.needsInvestments || needs.needsRetirement) {
      addSnapshotFact('total_investments', 'Total investments', overview.totalInvestments, 'usd', 'financialSummary.financialOverview.totalInvestments');
    }
    if (broad || decision || includesAny(question, /\b(debt|debts|loan|loans|mortgage|credit card|liabilities)\b/i)) {
      addSnapshotFact('total_debt', 'Total debt', overview.totalDebt, 'usd', 'financialSummary.financialOverview.totalDebt');
    }
    if (overview.homeValue !== null && (needs.needsHomeValue || broadFinancialQuestion(question, needs))) {
      addSnapshotFact('home_value', 'Home value', overview.homeValue, 'usd', 'financialSummary.financialOverview.homeValue');
    }
  }

  const includeCashFlow = cashFlowQuestion(question) || financialDecisionQuestion(question) || broadFinancialQuestion(question, needs);
  if (includeCashFlow) {
    addSnapshotFact('average_monthly_income', 'Average monthly income', snapshot.averageMonthlyIncome, 'usd', 'contextSnapshot.averageMonthlyIncome');
    addSnapshotFact('average_monthly_expenses', 'Average monthly expenses', snapshot.averageMonthlyExpense, 'usd', 'contextSnapshot.averageMonthlyExpense');
    const income = facts.get('average_monthly_income')?.value;
    const expenses = facts.get('average_monthly_expenses')?.value;
    if (income !== undefined && expenses !== undefined) {
      const operatingCashFlow = income - expenses;
      addCalculatedFact(
        'average_monthly_operating_cash_flow',
        'Average monthly operating cash flow',
        operatingCashFlow,
        'usd',
        'average_monthly_income - average_monthly_expenses',
        ['average_monthly_income', 'average_monthly_expenses']
      );
      if (income > 0) {
        addCalculatedFact(
          'savings_rate',
          'Savings rate',
          (operatingCashFlow / income) * 100,
          'percent',
          '(average_monthly_operating_cash_flow / average_monthly_income) * 100',
          ['average_monthly_operating_cash_flow', 'average_monthly_income']
        );
      }
    }
  }

  if (needs.needsMonthlyCashFlow) {
    for (const [month, values] of Object.entries(snapshot.transactionSummary?.byMonth || {})) {
      const safeMonth = month.replace(/[^0-9-]/g, '');
      addSnapshotFact(`income_${safeMonth}`, `Income for ${month}`, values.income, 'usd', `transactionSummary.byMonth.${month}.income`);
      addSnapshotFact(`expenses_${safeMonth}`, `Expenses for ${month}`, values.expense, 'usd', `transactionSummary.byMonth.${month}.expense`);
      addSnapshotFact(`operating_cash_flow_${safeMonth}`, `Operating cash flow for ${month}`, values.operatingCashFlow, 'usd', `transactionSummary.byMonth.${month}.operatingCashFlow`);
    }
  }

  if (needs.needsTransactionDetails) {
    const merchantTotals = new Map<string, { label: string; total: number; inputFactIds: string[] }>();
    for (const transaction of snapshot.bankingTransactions) {
      if (transaction.typeLabel !== '(EXPENSE)' && transaction.typeLabel !== '(FEE)') continue;
      const rawTransactionFactId = `transaction_amount_${safeFactId(transaction.id)}`;
      const transactionFactId = `expense_transaction_${safeFactId(transaction.id)}`;
      addSnapshotFact(
        rawTransactionFactId,
        `${transaction.merchantName || transaction.name} source transaction amount on ${transaction.date}`,
        transaction.amount,
        'usd',
        `bankingTransactions.${transaction.id}.amount`,
        false
      );
      addCalculatedFact(
        transactionFactId,
        `${transaction.merchantName || transaction.name} expense on ${transaction.date}`,
        Math.abs(transaction.amount),
        'usd',
        'abs(input)',
        [rawTransactionFactId]
      );
      const merchantLabel = transaction.merchantName || transaction.name;
      const merchantId = safeFactId(merchantLabel) || 'unknown';
      const current = merchantTotals.get(merchantId) || { label: merchantLabel, total: 0, inputFactIds: [] };
      current.total += Math.abs(transaction.amount);
      current.inputFactIds.push(transactionFactId);
      merchantTotals.set(merchantId, current);
    }
    for (const [merchantId, aggregate] of Array.from(merchantTotals.entries())
      .sort((left, right) => right[1].total - left[1].total)
      .slice(0, 10)) {
      addCalculatedFact(
        `merchant_spending_${merchantId}`,
        `Recent spending at ${aggregate.label}`,
        aggregate.total,
        'usd',
        'sum(inputs)',
        aggregate.inputFactIds
      );
    }
    for (const [category, amount] of Object.entries(snapshot.transactionSummary?.byCategory || {})) {
      addSnapshotFact(
        `category_spending_${safeFactId(category)}`,
        `${category} spending`,
        amount,
        'usd',
        `transactionSummary.byCategory.${category}`
      );
    }
  }

  if (needs.needsAccountDetails) {
    const matchedAccounts = snapshot.accounts.filter((account) =>
      question.toLowerCase().includes(account.name.toLowerCase()) ||
      Boolean(account.institution && question.toLowerCase().includes(account.institution.toLowerCase()))
    );
    for (const account of matchedAccounts.length > 0 ? matchedAccounts : snapshot.accounts) {
      addSnapshotFact(
        `account_balance_${safeFactId(account.id)}`,
        `${account.name} balance`,
        account.balance,
        'usd',
        `accounts.${account.id}.balance`
      );
    }
  }

  if (needs.needsInvestments || needs.needsRetirement) {
    const portfolio = snapshot.financialSummary?.investmentPortfolio;
    const portfolioValue = portfolio?.totalValue ?? snapshot.investments?.totalValue;
    const portfolioValueSource = portfolio?.totalValue !== undefined
      ? 'financialSummary.investmentPortfolio.totalValue'
      : 'investments.totalValue';
    const holdingCount = portfolio?.holdingCount ?? portfolio?.holdingsCount ?? snapshot.investments?.holdingCount;
    const holdingCountSource = portfolio?.holdingCount !== undefined || portfolio?.holdingsCount !== undefined
      ? 'financialSummary.investmentPortfolio.holdingCount'
      : 'investments.holdingCount';
    addSnapshotFact('portfolio_value', 'Portfolio value', portfolioValue, 'usd', portfolioValueSource);
    addSnapshotFact('portfolio_holding_count', 'Portfolio holding count', holdingCount, 'count', holdingCountSource);
    for (const allocation of portfolio?.assetAllocation || []) {
      const id = allocation.type.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
      addSnapshotFact(`allocation_value_${id}`, `${allocation.type} allocation value`, allocation.value, 'usd', `financialSummary.investmentPortfolio.assetAllocation.${id}.value`);
      addSnapshotFact(`allocation_${id}`, `${allocation.type} allocation`, allocation.percentage, 'percent', `financialSummary.investmentPortfolio.assetAllocation.${id}.percentage`);
    }
    const holdings = snapshot.investments?.holdings || [];
    const matchedHoldings = holdings.filter((holding) => {
      const ticker = holding.ticker_symbol?.trim();
      const name = holding.security_name?.trim();
      return Boolean(
        (ticker && new RegExp(`\\b${ticker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(question)) ||
        (name && question.toLowerCase().includes(name.toLowerCase()))
      );
    });
    for (const holding of matchedHoldings.length > 0 ? matchedHoldings : holdings) {
      const holdingId = safeFactId(holding.id || `${holding.account_id}_${holding.security_id}`);
      addSnapshotFact(
        `holding_value_${holdingId}`,
        `${holding.ticker_symbol || holding.security_name || holding.security_id} holding value`,
        holding.institution_value,
        'usd',
        `investments.holdings.${holding.id}.institution_value`
      );
    }
  }

  const retirement = snapshot.retirementAnalysis;
  if (needs.needsRetirement && retirement) {
    addSnapshotFact('withdrawal_rate_ratio', 'Withdrawal rate source ratio', retirement.metrics.withdrawalRate, 'ratio', 'retirementAnalysis.metrics.withdrawalRate', false);
    addCalculatedFact('withdrawal_rate', 'Withdrawal rate', retirement.metrics.withdrawalRate * 100, 'percent', 'input * 100', ['withdrawal_rate_ratio']);
    addSnapshotFact('equity_allocation', 'Equity allocation', retirement.metrics.equityAllocation, 'percent', 'retirementAnalysis.metrics.equityAllocation');
    addSnapshotFact('years_of_expenses', 'Years of expenses', retirement.metrics.yearsOfExpenses, 'years', 'retirementAnalysis.metrics.yearsOfExpenses');
    addSnapshotFact(
      'projected_portfolio_at_withdrawal_start',
      'Median historically projected portfolio at withdrawal start in today dollars',
      retirement.metrics.projectedPortfolioAtWithdrawalStart,
      'usd',
      'retirementAnalysis.metrics.projectedPortfolioAtWithdrawalStart'
    );
    addSnapshotFact(
      'years_to_withdrawal_start',
      'Years until withdrawals begin',
      retirement.metrics.yearsToWithdrawalStart,
      'years',
      'retirementAnalysis.metrics.yearsToWithdrawalStart'
    );
    addSnapshotFact('survival_rate_ratio', 'Historical survival rate source ratio', retirement.stressTest.survivalRate, 'ratio', 'retirementAnalysis.stressTest.survivalRate', false);
    addCalculatedFact('survival_rate', 'Historical survival rate', retirement.stressTest.survivalRate * 100, 'percent', 'input * 100', ['survival_rate_ratio']);
    addSnapshotFact('historical_sequence_count', 'Historical sequence count', retirement.stressTest.totalSequences, 'count', 'retirementAnalysis.stressTest.totalSequences');
    for (const percentile of ['p10', 'p25', 'p50', 'p75', 'p90'] as const) {
      const withdrawalRate = retirement.metrics.historicalWithdrawalRates[percentile];
      const ratioId = `historical_withdrawal_rate_${percentile}_ratio`;
      addSnapshotFact(ratioId, `${percentile} historical withdrawal rate source ratio`, withdrawalRate, 'ratio', `retirementAnalysis.metrics.historicalWithdrawalRates.${percentile}`, false);
      addCalculatedFact(`historical_withdrawal_rate_${percentile}`, `${percentile} historical withdrawal rate`, withdrawalRate * 100, 'percent', 'input * 100', [ratioId]);
      addSnapshotFact(
        `depletion_years_${percentile}`,
        `${percentile} years until depletion`,
        retirement.stressTest.depletionPercentiles[percentile],
        'years',
        `retirementAnalysis.stressTest.depletionPercentiles.${percentile}`
      );
    }
    addSnapshotFact('retirement_current_age', 'Current age', retirement._storedInputParams?.currentAge, 'age', 'retirementAnalysis.inputs.currentAge');
    addSnapshotFact('retirement_age', 'Retirement age', retirement._storedInputParams?.retirementAge, 'age', 'retirementAnalysis.inputs.retirementAge');
    addSnapshotFact('annual_withdrawal_amount', 'Annual withdrawal amount', retirement._storedInputParams?.annualWithdrawalAmount, 'usd', 'retirementAnalysis.inputs.annualWithdrawalAmount');
    addSnapshotFact('withdrawal_start_age', 'Withdrawal start age', retirement._storedInputParams?.withdrawalStartAge, 'age', 'retirementAnalysis.inputs.withdrawalStartAge');
  }

  // Scenario premises and explicitly requested external context are canonical inputs too.
  // This lets the model repeat a user-provided purchase price or a fetched market rate
  // without weakening validation for numbers it invents itself.
  addTrustedTextFacts(question, 'user_input', 'User-provided', 'user_input', 'userQuestion', undefined, 12);
  if (needs.needsMarketContext) {
    addTrustedTextFacts(
      snapshot.marketContext,
      'market_context',
      'Market-context',
      'external_context',
      'marketContext',
      isoString(snapshot.metadata.lastUpdated)
    );
  }
  if (needs.needsSearchContext) {
    addTrustedTextFacts(
      snapshot.searchContext,
      'search_context',
      'Retrieved-context',
      'external_context',
      'searchContext',
      isoString(snapshot.metadata.lastUpdated)
    );
  }

  return {
    version: 1,
    ...(computedAt && { snapshotComputedAt: computedAt }),
    ...(asOf && { snapshotAsOf: asOf }),
    facts: Array.from(facts.values()),
  };
}

export function validateCanonicalFactPack(pack: CanonicalFactPack): string[] {
  const issues: string[] = [];
  const facts = new Map(pack.facts.map((fact) => [fact.id, fact]));
  for (const fact of pack.facts) {
    if (!Number.isFinite(fact.value)) issues.push(`${fact.id} is not finite.`);
    if (fact.provenance.kind !== 'calculation') continue;
    const inputs = fact.provenance.inputFactIds?.map((id) => facts.get(id));
    if (!inputs || inputs.some((input) => !input)) {
      issues.push(`${fact.id} references a missing calculation input.`);
      continue;
    }
    let expected: number | undefined;
    if (fact.id === 'average_monthly_operating_cash_flow') {
      expected = inputs[0]!.value - inputs[1]!.value;
    } else if (fact.id === 'savings_rate' && inputs[1]!.value !== 0) {
      expected = (inputs[0]!.value / inputs[1]!.value) * 100;
    } else if (fact.provenance.formula === 'abs(input)') {
      expected = Math.abs(inputs[0]!.value);
    } else if (fact.provenance.formula === 'sum(inputs)') {
      expected = inputs.reduce((total, input) => total + input!.value, 0);
    } else if (fact.provenance.formula === 'input * 100') {
      expected = inputs[0]!.value * 100;
    }
    if (expected !== undefined && Math.abs(expected - fact.value) > 0.000001) {
      issues.push(`${fact.id} does not match its deterministic formula.`);
    }
  }
  return issues;
}

export function canonicalFactMap(pack: CanonicalFactPack): Map<string, CanonicalFact> {
  return new Map(pack.facts.map((fact) => [fact.id, fact]));
}
