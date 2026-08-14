import { buildTransactionSummary } from '../../services/transaction-summary-service';

describe('buildTransactionSummary', () => {
  const start = new Date('2026-05-01T00:00:00.000Z');
  const end = new Date('2026-06-01T00:00:00.000Z');

  it('aggregates typed cash flow and excludes transfers and investment trades', () => {
    const { transactionsSummary } = buildTransactionSummary(
      [
        { transaction_id: 'salary', account_id: 'checking', date: '2026-05-02', amount: 3000, source_amount: -3000, transaction_type: 'income', iso_currency_code: 'USD' },
        { transaction_id: 'groceries', account_id: 'checking', date: '2026-05-03', amount: -125, source_amount: 125, transaction_type: 'expense', category: ['Groceries'], iso_currency_code: 'USD' },
        { transaction_id: 'refund', account_id: 'checking', date: '2026-05-04', amount: 25, source_amount: -25, transaction_type: 'refund', category: ['Groceries'], iso_currency_code: 'USD' },
        { transaction_id: 'transfer', account_id: 'checking', date: '2026-05-05', amount: -500, transaction_type: 'transfer_out', iso_currency_code: 'USD' },
        { investment_transaction_id: 'sale', account_id: 'brokerage', date: '2026-05-06', amount: 1000, type: 'sell', isInvestmentTransaction: true, iso_currency_code: 'USD' },
        { transaction_id: 'pending', account_id: 'checking', date: '2026-05-07', amount: -40, transaction_type: 'expense', pending: true, iso_currency_code: 'USD' },
      ],
      start,
      end
    );

    expect(transactionsSummary.incomeTotal).toBe(3000);
    expect(transactionsSummary.expenseTotal).toBe(100);
    expect(transactionsSummary.operatingCashFlow).toBe(2900);
    expect(transactionsSummary.byCategory).toEqual({ Groceries: 100 });
    expect(transactionsSummary.includedTransactionIds).toEqual(['salary', 'groceries', 'refund']);
    expect(transactionsSummary.excludedTransactionIds).toEqual(['transfer', 'sale', 'pending']);
  });

  it('uses deterministic Plaid categories when on-demand snapshots skip LLM categorization', () => {
    const { transactionsSummary } = buildTransactionSummary(
      [
        {
          transaction_id: 'payroll',
          account_id: 'checking',
          date: '2026-05-10',
          amount: 2500,
          personal_finance_category: { primary: 'INCOME', detailed: 'INCOME_WAGES' },
          iso_currency_code: 'USD',
        },
        {
          transaction_id: 'restaurant',
          account_id: 'checking',
          date: '2026-05-11',
          amount: -80,
          personal_finance_category: { primary: 'FOOD_AND_DRINK', detailed: 'FOOD_AND_DRINK_RESTAURANT' },
          iso_currency_code: 'USD',
        },
      ],
      start,
      end
    );

    expect(transactionsSummary.incomeTotal).toBe(2500);
    expect(transactionsSummary.expenseTotal).toBe(80);
    expect(transactionsSummary.byCategory).toEqual({ Restaurant: 80 });
  });

  it('normalizes a stale persisted cash-flow sign after a manual type correction', () => {
    const { transactionsSummary } = buildTransactionSummary(
      [
        {
          transaction_id: 'corrected-income',
          account_id: 'checking',
          date: '2026-05-10',
          amount: -100,
          source_amount: -100,
          cash_flow_amount: -100,
          aiCategory: 'income',
          iso_currency_code: 'USD',
        },
      ],
      start,
      end
    );

    expect(transactionsSummary.incomeTotal).toBe(100);
    expect(transactionsSummary.includedTransactionIds).toEqual(['corrected-income']);
  });

  it('maps provider investment activity without relying on LLM categorization', () => {
    const { transactionsSummary } = buildTransactionSummary(
      [
        {
          investment_transaction_id: 'plaid-dividend',
          account_id: 'brokerage',
          date: '2026-05-10',
          amount: -40,
          type: 'cash',
          subtype: 'dividend',
          iso_currency_code: 'USD',
        },
        {
          id: 'snaptrade-dividend',
          account_id: 'snaptrade-brokerage',
          date: '2026-05-11',
          amount: 30,
          type: 'DIVIDEND',
          iso_currency_code: 'USD',
        },
        {
          id: 'snaptrade-fee',
          account_id: 'snaptrade-brokerage',
          date: '2026-05-12',
          amount: -5,
          type: 'FEE',
          iso_currency_code: 'USD',
        },
        {
          investment_transaction_id: 'reinvested-dividend',
          account_id: 'brokerage',
          date: '2026-05-13',
          amount: 25,
          type: 'buy',
          subtype: 'dividend',
          isInvestmentTransaction: true,
          iso_currency_code: 'USD',
        },
      ],
      start,
      end
    );

    expect(transactionsSummary.incomeTotal).toBe(70);
    expect(transactionsSummary.expenseTotal).toBe(5);
    expect(transactionsSummary.includedTransactionIds).toEqual([
      'plaid-dividend',
      'snaptrade-dividend',
      'snaptrade-fee',
    ]);
    expect(transactionsSummary.excludedTransactionIds).toEqual(['reinvested-dividend']);
    expect(transactionsSummary.unclassifiedTransactionIds).toEqual([]);
  });

  it('reports rather than guesses unclassified and unconverted transactions', () => {
    const { transactionsSummary } = buildTransactionSummary(
      [
        { transaction_id: 'unknown', account_id: 'checking', date: '2026-05-10', amount: -20, iso_currency_code: 'USD' },
        { transaction_id: 'cad-expense', account_id: 'checking', date: '2026-05-11', amount: -30, transaction_type: 'expense', iso_currency_code: 'CAD' },
      ],
      start,
      end
    );

    expect(transactionsSummary.incomeTotal).toBe(0);
    expect(transactionsSummary.expenseTotal).toBe(0);
    expect(transactionsSummary.unclassifiedTransactionIds).toEqual(['unknown']);
    expect(transactionsSummary.currencyMismatchTransactionIds).toEqual(['cad-expense']);
  });

  it('excludes credit-card payments so purchases are not counted twice', () => {
    const { transactionsSummary } = buildTransactionSummary(
      [
        { transaction_id: 'purchase', account_id: 'card', date: '2026-05-10', amount: 100, transaction_type: 'expense', iso_currency_code: 'USD' },
        {
          transaction_id: 'card-payment',
          account_id: 'card',
          date: '2026-05-11',
          amount: -100,
          personal_finance_category: {
            primary: 'LOAN_PAYMENTS',
            detailed: 'LOAN_PAYMENTS_CREDIT_CARD_PAYMENT',
          },
          iso_currency_code: 'USD',
        },
      ],
      start,
      end
    );

    expect(transactionsSummary.expenseTotal).toBe(100);
    expect(transactionsSummary.excludedTransactionIds).toEqual(['card-payment']);
  });

  it('counts non-credit loan payments as household expenses', () => {
    const { transactionsSummary } = buildTransactionSummary(
      [
        {
          transaction_id: 'mortgage-payment',
          account_id: 'checking',
          date: '2026-05-12',
          amount: 1800,
          personal_finance_category: {
            primary: 'LOAN_PAYMENTS',
            detailed: 'LOAN_PAYMENTS_MORTGAGE_PAYMENT',
          },
          iso_currency_code: 'USD',
        },
      ],
      start,
      end
    );

    expect(transactionsSummary.expenseTotal).toBe(1800);
    expect(transactionsSummary.byCategory).toEqual({ 'Mortgage Payment': 1800 });
  });
});
