import { buildCanonicalCashFlowAnalyses } from '../../openai/cash-flow-context';
import { buildTransactionSummary } from '../../services/transaction-summary-service';
import {
  createTestExpenseTransaction,
  createTestIncomeTransaction,
} from './factories/transaction.factory';

describe('buildCanonicalCashFlowAnalyses', () => {
  const summary = {
    reportingCurrency: 'USD',
    incomeTotal: 12_000,
    expenseTotal: 7_500,
    operatingCashFlow: 4_500,
    byCategory: { GROCERIES: 2_000, RENT: 5_000 },
    byMonth: {
      '2026-01': { income: 5_000, expense: 3_000, operatingCashFlow: 2_000 },
      '2026-02': { income: 7_000, expense: 4_500, operatingCashFlow: 2_500 },
    },
    includedTransactionIds: ['one', 'two'],
    excludedTransactionIds: ['transfer'],
    unclassifiedTransactionIds: ['unknown'],
    currencyMismatchTransactionIds: ['eur'],
  };

  // Computed as March began, so January and February are both whole months.
  const computedAt = '2026-03-01T00:00:00.000Z';

  it('uses persisted canonical monthly totals instead of recalculating raw transactions', () => {
    const result = buildCanonicalCashFlowAnalyses(summary, computedAt);

    expect(result.averages).toMatchObject({ averageIncome: 6_000, averageExpenses: 3_750, monthCount: 2 });
    expect(result.incomeAnalysis).toContain('Average Monthly Income over 2 complete months (2026-01 to 2026-02): $6000.00');
    expect(result.expenseAnalysis).toContain('Excluded Transactions: 2');
    expect(result.expenseAnalysis).toContain('Rent: $5000.00, Groceries: $2000.00');
  });

  it('lists what the forecast expects beside what happened, without replacing it', () => {
    const result = buildCanonicalCashFlowAnalyses(summary, computedAt, {
      income: 8_000,
      spending: 4_250.5,
      incomeSource: 'override',
      spendingSource: 'transactions',
      typicalBasisDays: 90,
      dataThrough: '2026-02-28',
    });

    expect(result.averages).toMatchObject({ averageIncome: 6_000, averageExpenses: 3_750 });
    expect(result.incomeAnalysis).toContain('Expected Monthly Income (the user’s own monthly figure, which the cash-flow forecast uses): $8000.00');
    expect(result.incomeAnalysis).toContain('Canonical Income Total: $12000.00');
    expect(result.expenseAnalysis).toContain('Expected Monthly Expenses (cash-flow forecast, before planned events): $4250.50');
  });

  it('reports what the forecast expects even with no complete month of history', () => {
    const result = buildCanonicalCashFlowAnalyses(summary, '2026-01-20T00:00:00.000Z', {
      income: 5_000,
      spending: null,
      incomeSource: 'transactions',
      spendingSource: 'transactions',
      typicalBasisDays: 0,
      dataThrough: null,
    });

    expect(result.averages).toBeNull();
    expect(result.incomeAnalysis).toContain('Expected Monthly Income (cash-flow forecast, before planned events): $5000.00');
    expect(result.incomeAnalysis).not.toContain('Average Monthly Income');
    expect(result.expenseAnalysis).toBeUndefined();
  });

  it('includes persisted monthly aggregates only when requested', () => {
    expect(buildCanonicalCashFlowAnalyses(summary, computedAt).monthlyAnalysis).toBeUndefined();

    const result = buildCanonicalCashFlowAnalyses(summary, computedAt, null, true);
    expect(result.monthlyAnalysis).toContain(
      '2026-01: income $5000.00, expenses $3000.00, operating cash flow $2000.00'
    );
    expect(result.monthlyAnalysis).toContain(
      '2026-02: income $7000.00, expenses $4500.00, operating cash flow $2500.00'
    );
  });

  it('merges split category spellings before ranking top categories', () => {
    const splitSummary = {
      ...summary,
      byCategory: {
        'Food and Drink': 1_200,
        'Food And Drink': 800,
        Rent: 500,
      },
    };

    const result = buildCanonicalCashFlowAnalyses(splitSummary, computedAt);

    expect(result.expenseAnalysis).toContain('Food And Drink: $2000.00');
    expect(result.expenseAnalysis).toContain('Rent: $500.00');
    expect(result.expenseAnalysis).not.toContain('Food and Drink: $1200.00');
  });

  it('builds broad-question cash-flow context from deterministic transaction factories', () => {
    const transactions = [
      createTestIncomeTransaction({
        id: 'income-jan',
        transaction_id: 'income-jan',
        date: '2026-01-15',
        amount: -5_000,
        cashFlowAmount: 5_000,
      }),
      createTestExpenseTransaction({
        id: 'expense-jan',
        transaction_id: 'expense-jan',
        date: '2026-01-20',
        amount: 2_000,
        cashFlowAmount: -2_000,
      }),
      createTestIncomeTransaction({
        id: 'income-feb',
        transaction_id: 'income-feb',
        date: '2026-02-15',
        amount: -7_000,
        cashFlowAmount: 7_000,
      }),
      createTestExpenseTransaction({
        id: 'expense-feb',
        transaction_id: 'expense-feb',
        date: '2026-02-20',
        amount: 3_000,
        cashFlowAmount: -3_000,
      }),
    ];
    const { transactionsSummary } = buildTransactionSummary(
      transactions,
      new Date('2026-01-01T00:00:00.000Z'),
      new Date('2026-03-01T00:00:00.000Z'),
    );

    const result = buildCanonicalCashFlowAnalyses(transactionsSummary, '2026-03-01T00:00:00.000Z');

    // The history starts on January 15, so February is the one whole month.
    expect(result.averages).toMatchObject({ averageIncome: 7_000, averageExpenses: 3_000, monthCount: 1 });
    expect(result.monthlyAnalysis).toBeUndefined();
  });
});
