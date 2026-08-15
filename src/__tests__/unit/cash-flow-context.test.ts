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

  it('uses persisted canonical monthly totals instead of recalculating raw transactions', () => {
    const result = buildCanonicalCashFlowAnalyses(summary);

    expect(result.incomeResult?.averageMonthly).toBe(6_000);
    expect(result.expenseResult?.averageMonthly).toBe(3_750);
    expect(result.expenseResult?.text).toContain('Excluded Transactions: 2');
    expect(result.expenseResult?.text).toContain('RENT: $5000.00, GROCERIES: $2000.00');
  });

  it('honors manual overrides without replacing canonical totals', () => {
    const result = buildCanonicalCashFlowAnalyses(summary, 8_000, 4_000);

    expect(result.incomeResult?.averageMonthly).toBe(8_000);
    expect(result.incomeResult?.text).toContain('(Manual Override)');
    expect(result.incomeResult?.text).toContain('Canonical Income Total: $12000.00');
    expect(result.expenseResult?.averageMonthly).toBe(4_000);
  });

  it('includes persisted monthly aggregates only when requested', () => {
    expect(buildCanonicalCashFlowAnalyses(summary).monthlyAnalysis).toBeUndefined();

    const result = buildCanonicalCashFlowAnalyses(summary, null, null, true);
    expect(result.monthlyAnalysis).toContain(
      '2026-01: income $5000.00, expenses $3000.00, operating cash flow $2000.00'
    );
    expect(result.monthlyAnalysis).toContain(
      '2026-02: income $7000.00, expenses $4500.00, operating cash flow $2500.00'
    );
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

    const result = buildCanonicalCashFlowAnalyses(transactionsSummary);

    expect(result.incomeResult?.averageMonthly).toBe(6_000);
    expect(result.expenseResult?.averageMonthly).toBe(2_500);
    expect(result.monthlyAnalysis).toBeUndefined();
  });
});
