import {
  fetchAllPlaidInvestmentTransactions,
  fetchAllPlaidTransactions,
  normalizePlaidLiabilities,
} from '../../services/plaid-liabilities';

describe('Plaid investment pagination and liabilities', () => {
  it('fetches every investment transaction page', async () => {
    const pages = [
      { investment_transactions: [{ investment_transaction_id: 'one' }], total_investment_transactions: 3 },
      { investment_transactions: [{ investment_transaction_id: 'two' }], total_investment_transactions: 3 },
      { investment_transactions: [{ investment_transaction_id: 'three' }], total_investment_transactions: 3 },
    ];
    const client = { investmentsTransactionsGet: jest.fn() };
    pages.forEach(page => client.investmentsTransactionsGet.mockResolvedValueOnce({ data: page }));

    const result = await fetchAllPlaidInvestmentTransactions(client as any, {
      access_token: 'token',
      start_date: '2024-01-01',
      end_date: '2026-01-01',
    });

    expect(result.map(transaction => transaction.investment_transaction_id)).toEqual(['one', 'two', 'three']);
    expect(client.investmentsTransactionsGet.mock.calls.map(([request]) => request.options)).toEqual([
      { count: 500, offset: 0 },
      { count: 500, offset: 1 },
      { count: 500, offset: 2 },
    ]);
  });

  it('fails rather than silently truncating a stalled Plaid page', async () => {
    const client = {
      investmentsTransactionsGet: jest.fn().mockResolvedValue({
        data: { investment_transactions: [], total_investment_transactions: 10 },
      }),
    };

    await expect(fetchAllPlaidInvestmentTransactions(client as any, {
      access_token: 'token',
      start_date: '2024-01-01',
      end_date: '2026-01-01',
    })).rejects.toThrow('pagination stalled at 0 of 10');
  });

  it('fetches and deduplicates every banking transaction page', async () => {
    const client = {
      transactionsGet: jest.fn()
        .mockResolvedValueOnce({
          data: {
            transactions: [{ transaction_id: 'one' }, { transaction_id: 'two' }],
            total_transactions: 3,
          },
        })
        .mockResolvedValueOnce({
          data: {
            transactions: [{ transaction_id: 'two' }, { transaction_id: 'three' }],
            total_transactions: 3,
          },
        }),
    };

    const result = await fetchAllPlaidTransactions(client as any, {
      access_token: 'token',
      start_date: '2026-01-01',
      end_date: '2026-08-18',
      options: { include_personal_finance_category: true },
    });

    expect(result.map(transaction => transaction.transaction_id)).toEqual(['one', 'two', 'three']);
    expect(client.transactionsGet.mock.calls.map(([request]) => request.options)).toEqual([
      { include_personal_finance_category: true, count: 500, offset: 0 },
      { include_personal_finance_category: true, count: 500, offset: 2 },
    ]);
  });

  it('fails rather than looping on a stalled banking transaction page', async () => {
    const client = {
      transactionsGet: jest.fn().mockResolvedValue({
        data: { transactions: [], total_transactions: 2 },
      }),
    };

    await expect(fetchAllPlaidTransactions(client as any, {
      access_token: 'token',
      start_date: '2026-01-01',
      end_date: '2026-08-18',
    })).rejects.toThrow('pagination stalled at 0 of 2');
  });

  it('normalizes credit, mortgage, and student-loan details by account', () => {
    const retrievedAt = '2026-08-18T12:00:00Z';
    const result = normalizePlaidLiabilities({
      credit: [{
        account_id: 'credit-1',
        aprs: [{ apr_type: 'purchase_apr', apr_percentage: 19.99, balance_subject_to_apr: 1000, interest_charge_amount: 12 }],
        minimum_payment_amount: 50,
        next_payment_due_date: '2026-09-01',
        last_payment_amount: 100,
        last_payment_date: '2026-08-01',
        last_statement_balance: 1200,
        last_statement_issue_date: '2026-08-05',
        is_overdue: false,
      }],
      mortgage: [{
        account_id: 'mortgage-1',
        interest_rate: { percentage: 3.25, type: 'fixed' },
        next_monthly_payment: 2400,
        next_payment_due_date: '2026-09-01',
        origination_principal_amount: 500000,
        ytd_interest_paid: 12000,
        ytd_principal_paid: 8000,
        property_address: { street: '1 Main St', city: 'Austin', region: 'TX', postal_code: '78701', country: 'US' },
      }],
      student: [{
        account_id: 'student-1',
        interest_rate_percentage: 5.5,
        minimum_payment_amount: 250,
        outstanding_interest_amount: 80,
        loan_name: 'Jane Doe Federal Direct Loan',
        loan_status: { type: 'repayment', end_date: null },
        repayment_plan: { type: 'income-based repayment', description: 'Income based' },
        ytd_interest_paid: 350,
        ytd_principal_paid: 900,
      }],
    } as any, retrievedAt);

    expect(result.get('credit-1')).toEqual([expect.objectContaining({
      kind: 'credit',
      retrievedAt,
      minimumPaymentAmount: 50,
      aprs: [expect.objectContaining({ type: 'purchase_apr', percentage: 19.99 })],
    })]);
    expect(result.get('mortgage-1')).toEqual([expect.objectContaining({
      kind: 'mortgage',
      interestRatePercentage: 3.25,
      nextMonthlyPayment: 2400,
      ytdInterestPaid: 12000,
      ytdPrincipalPaid: 8000,
    })]);
    expect(result.get('mortgage-1')?.[0]).not.toHaveProperty('propertyAddress');
    expect(result.get('student-1')).toEqual([expect.objectContaining({
      kind: 'student',
      interestRatePercentage: 5.5,
      outstandingInterestAmount: 80,
      loanStatus: 'repayment',
      repaymentPlanType: 'income-based repayment',
      repaymentPlanDescription: 'Income based',
    })]);
    expect(result.get('student-1')?.[0]).not.toHaveProperty('loanName');
  });
});
