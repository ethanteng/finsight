/**
 * src/plaid.ts is the largest file in the backend (2,003 lines) and had no unit
 * coverage at all. These cover the exported pure helpers — the ones that decide
 * whether a transaction reads as income or spending, how a portfolio is bucketed,
 * and what a Plaid failure is reported as. A regression in any of them is silent:
 * nothing throws, the numbers are just wrong.
 *
 * The module is loaded with requireActual because src/__tests__/unit/setup.ts
 * mocks '../../plaid' for every unit test, and that mock factory exports only
 * getPlaidClient. That is why this file measured 0% — a plain import here yields
 * undefined for each helper, so it was not reachable from the unit suite at all.
 * Loading it explicitly leaves the shared mock intact for the tests that rely on
 * it while still exercising and instrumenting the real code.
 *
 * Route-level coverage of setupPlaidRoutes (21 routes) is not attempted here.
 */
const {
  processTransactionData,
  processInvestmentHolding,
  processInvestmentTransaction,
  processSecurity,
  analyzePortfolio,
  analyzeInvestmentActivity,
  handlePlaidError
} = jest.requireActual('../../plaid');

describe('processTransactionData', () => {
  const base = {
    transaction_id: 'txn-1',
    account_id: 'acct-1',
    date: '2026-01-15',
    name: 'Some Transaction',
    amount: 25
  };

  describe('sign correction', () => {
    it('makes a purchase negative when a merchant is present', () => {
      const result = processTransactionData({ ...base, name: 'Blue Bottle', merchant_name: 'Blue Bottle Coffee', amount: 6.5 });
      expect(result.amount).toBe(-6.5);
    });

    it('makes a purchase negative when only a category is present', () => {
      const result = processTransactionData({ ...base, name: 'Corner Store', category: ['Shops'], amount: 12 });
      expect(result.amount).toBe(-12);
    });

    it('makes a purchase negative when only a payment channel marks it', () => {
      const inStore = processTransactionData({ ...base, name: 'Kiosk', payment_channel: 'in store', amount: 4 });
      const online = processTransactionData({ ...base, name: 'Web Order', payment_channel: 'online', amount: 9 });
      expect(inStore.amount).toBe(-4);
      expect(online.amount).toBe(-9);
    });

    it('leaves an already-negative purchase alone rather than flipping it back', () => {
      const result = processTransactionData({ ...base, name: 'Grocer', merchant_name: 'Grocer', amount: -30 });
      expect(result.amount).toBe(-30);
    });

    it('leaves a bare transaction untouched when nothing marks it as purchase or credit', () => {
      const result = processTransactionData({ ...base, name: 'Opaque', amount: 40 });
      expect(result.amount).toBe(40);
    });
  });

  describe('credit detection', () => {
    // The keyword list is the product's definition of "money coming in". Pinning
    // each term individually so removing one is a visible test failure rather
    // than a quiet sign flip on real transactions.
    it.each([
      'CREDIT card cashback',
      'Refund from store',
      'Return processed',
      'Payroll deposit',
      'Loan payment',
      'Expense reimbursement',
      'Insurance claim',
      'Insurance premium adjustment',
      'Zelle from Sam'
    ])('treats %s as a credit and keeps it positive', (name) => {
      const result = processTransactionData({ ...base, name, amount: 100 });
      expect(result.amount).toBe(100);
    });

    it('flips a negative credit to positive', () => {
      const result = processTransactionData({ ...base, name: 'Refund from store', amount: -75 });
      expect(result.amount).toBe(75);
    });

    it('detects a credit from merchant_name as well as name', () => {
      const result = processTransactionData({ ...base, name: 'Opaque descriptor', merchant_name: 'ACME Refunds', amount: -20 });
      expect(result.amount).toBe(20);
    });

    it.each(['Income', 'Transfer', 'Insurance'])(
      'treats a %s category as a credit even with a merchant present',
      (category) => {
        // Category-based credit detection has to beat merchant-based purchase
        // detection, or every payroll deposit with a merchant would flip negative.
        const result = processTransactionData({
          ...base,
          name: 'Opaque descriptor',
          merchant_name: 'Some Merchant',
          category: [category],
          amount: 500
        });
        expect(result.amount).toBe(500);
      }
    );

    it('keeps a card payment positive — the keyword list counts "payment" as a credit', () => {
      // Worth pinning explicitly: this is a deliberate classification, not an
      // accident of the keyword list, and it changes how card payments read.
      const result = processTransactionData({ ...base, name: 'AUTOPAY PAYMENT THANK YOU', merchant_name: 'Chase', amount: 250 });
      expect(result.amount).toBe(250);
    });
  });

  describe('category fallback', () => {
    it('derives category from personal_finance_category when the legacy field is empty', () => {
      const result = processTransactionData({
        ...base,
        category: [],
        personal_finance_category: { primary: 'FOOD_AND_DRINK', detailed: 'FOOD_AND_DRINK_COFFEE' }
      });
      expect(result.category).toEqual(['FOOD_AND_DRINK', 'FOOD_AND_DRINK_COFFEE']);
      expect(result.category_id).toBe('FOOD_AND_DRINK');
    });

    it('derives category when the legacy field holds a null placeholder', () => {
      const result = processTransactionData({
        ...base,
        category: [null],
        personal_finance_category: { primary: 'TRAVEL', detailed: 'TRAVEL_FLIGHTS' }
      });
      expect(result.category).toEqual(['TRAVEL', 'TRAVEL_FLIGHTS']);
    });

    it('prefers the legacy category when it is populated', () => {
      const result = processTransactionData({
        ...base,
        category: ['Shops', 'Clothing'],
        category_id: 'legacy-id',
        personal_finance_category: { primary: 'GENERAL_MERCHANDISE', detailed: 'GENERAL_MERCHANDISE_CLOTHING' }
      });
      expect(result.category).toEqual(['Shops', 'Clothing']);
      expect(result.category_id).toBe('legacy-id');
    });

    it('drops empty members of personal_finance_category rather than emitting holes', () => {
      const result = processTransactionData({
        ...base,
        category: [],
        personal_finance_category: { primary: 'TRANSFER_IN', detailed: undefined }
      });
      expect(result.category).toEqual(['TRANSFER_IN']);
    });
  });

  describe('field mapping', () => {
    it('preserves the pre-correction amount in source_amount', () => {
      // The corrected amount is for display; source_amount has to stay as Plaid
      // reported it or reconciliation against Plaid becomes impossible.
      const result = processTransactionData({ ...base, name: 'Store', merchant_name: 'Store', amount: 18 });
      expect(result.amount).toBe(-18);
      expect(result.source_amount).toBe(18);
    });

    it('keeps an explicit source_amount when Plaid supplies one', () => {
      const result = processTransactionData({ ...base, source_amount: 99, amount: 18 });
      expect(result.source_amount).toBe(99);
    });

    it('defaults the currency to USD when absent', () => {
      expect(processTransactionData({ ...base }).iso_currency_code).toBe('USD');
      expect(processTransactionData({ ...base, iso_currency_code: 'EUR' }).iso_currency_code).toBe('EUR');
    });

    it('does not carry through Plaid transaction_type, which means payment method here', () => {
      // Plaid's transaction_type is a payment method (place/digital/atm); the
      // app's own transaction_type is a category. Leaking Plaid's would collide.
      const result = processTransactionData({ ...base, transaction_type: 'place' });
      expect(result).not.toHaveProperty('transaction_type');
    });

    it('leaves enriched_data null for the enrichment step to populate', () => {
      const result = processTransactionData({ ...base, enriched_data: { merchant: 'preset' } });
      expect(result.enriched_data).toBeNull();
    });

    it('maps identifiers and passthrough fields', () => {
      const result = processTransactionData({
        ...base,
        pending: true,
        merchant_name: 'Merchant',
        payment_channel: 'online'
      });
      expect(result.id).toBe('txn-1');
      expect(result.account_id).toBe('acct-1');
      expect(result.date).toBe('2026-01-15');
      expect(result.pending).toBe(true);
      expect(result.payment_channel).toBe('online');
    });
  });
});

describe('processInvestmentHolding', () => {
  const holding = {
    account_id: 'acct-1',
    security_id: 'sec-1',
    quantity: 10,
    institution_value: 1500,
    institution_price: 150,
    institution_price_as_of: '2026-01-15',
    cost_basis: 1200,
    iso_currency_code: 'USD',
    unofficial_currency_code: null
  };

  it('builds a composite id from account, security, quantity and value', () => {
    // Plaid gives holdings no stable id, so this composite is the dedupe key.
    expect(processInvestmentHolding(holding).id).toBe('acct-1_sec-1_10_1500');
  });

  it('gives two holdings of the same security in different accounts distinct ids', () => {
    const a = processInvestmentHolding(holding);
    const b = processInvestmentHolding({ ...holding, account_id: 'acct-2' });
    expect(a.id).not.toBe(b.id);
  });

  it('changes the id when the position changes, so a re-sync replaces rather than duplicates', () => {
    const before = processInvestmentHolding(holding);
    const after = processInvestmentHolding({ ...holding, quantity: 12, institution_value: 1800 });
    expect(before.id).not.toBe(after.id);
  });

  it('maps valuation fields through unchanged', () => {
    const result = processInvestmentHolding(holding);
    expect(result).toMatchObject({
      account_id: 'acct-1',
      security_id: 'sec-1',
      institution_value: 1500,
      institution_price: 150,
      cost_basis: 1200,
      quantity: 10,
      iso_currency_code: 'USD'
    });
  });
});

describe('processInvestmentTransaction', () => {
  const txn = {
    investment_transaction_id: 'itxn-1',
    account_id: 'acct-1',
    security_id: 'sec-1',
    date: '2026-01-15',
    amount: 500,
    name: 'BUY AAPL',
    quantity: 3,
    fees: 1.5,
    price: 166.5,
    type: 'buy',
    subtype: 'buy',
    iso_currency_code: 'USD'
  };

  it('builds a composite id from transaction, account, security and date', () => {
    expect(processInvestmentTransaction(txn).id).toBe('itxn-1_acct-1_sec-1_2026-01-15');
  });

  it('maps trade fields through unchanged', () => {
    expect(processInvestmentTransaction(txn)).toMatchObject({
      amount: 500,
      quantity: 3,
      fees: 1.5,
      price: 166.5,
      type: 'buy',
      subtype: 'buy'
    });
  });
});

describe('processSecurity', () => {
  it('exposes the security id as both id and security_id', () => {
    // Downstream code joins on security_id but lists key on id; both are needed.
    const result = processSecurity({
      security_id: 'sec-1',
      name: 'Apple Inc.',
      ticker_symbol: 'AAPL',
      type: 'equity',
      close_price: 170,
      close_price_as_of: '2026-01-15',
      iso_currency_code: 'USD'
    });
    expect(result.id).toBe('sec-1');
    expect(result.security_id).toBe('sec-1');
    expect(result).toMatchObject({ name: 'Apple Inc.', ticker_symbol: 'AAPL', type: 'equity', close_price: 170 });
  });
});

describe('analyzePortfolio', () => {
  const securities = [
    { security_id: 'sec-1', type: 'equity' },
    { security_id: 'sec-2', type: 'etf' },
    { security_id: 'sec-3', type: 'cash' }
  ];

  it('totals institution_value across holdings', () => {
    const holdings = [
      { security_id: 'sec-1', institution_value: 6000 },
      { security_id: 'sec-2', institution_value: 3000 },
      { security_id: 'sec-3', institution_value: 1000 }
    ];
    expect(analyzePortfolio(holdings, securities).totalValue).toBe(10000);
  });

  it('buckets value by normalized asset type and reports percentages', () => {
    const holdings = [
      { security_id: 'sec-1', institution_value: 6000 },
      { security_id: 'sec-2', institution_value: 3000 },
      { security_id: 'sec-3', institution_value: 1000 }
    ];
    const { assetAllocation } = analyzePortfolio(holdings, securities);
    expect(assetAllocation).toEqual(
      expect.arrayContaining([
        { type: 'Equity', value: 6000, percentage: 60 },
        { type: 'ETF', value: 3000, percentage: 30 },
        { type: 'Cash', value: 1000, percentage: 10 }
      ])
    );
  });

  it('merges holdings that share an asset type into one bucket', () => {
    const holdings = [
      { security_id: 'sec-1', institution_value: 4000 },
      { security_id: 'sec-1', institution_value: 2000 }
    ];
    const { assetAllocation } = analyzePortfolio(holdings, securities);
    expect(assetAllocation).toHaveLength(1);
    expect(assetAllocation[0]).toEqual({ type: 'Equity', value: 6000, percentage: 100 });
  });

  it('counts unique securities, not the length of the securities array', () => {
    // Regression guard for a fix noted in the source: securities can arrive with
    // duplicates or entries that no holding references, so counting that array
    // over-reports how many distinct positions the user holds.
    const holdings = [
      { security_id: 'sec-1', institution_value: 100 },
      { security_id: 'sec-1', institution_value: 200 },
      { security_id: 'sec-2', institution_value: 300 }
    ];
    const securitiesWithExtras = [...securities, { security_id: 'sec-1', type: 'equity' }, { security_id: 'sec-99', type: 'etf' }];
    const result = analyzePortfolio(holdings, securitiesWithExtras);
    expect(result.securityCount).toBe(2);
    expect(result.holdingCount).toBe(3);
  });

  it('falls back to the holding security_type when no security record matches', () => {
    const holdings = [{ security_id: 'missing', institution_value: 500, security_type: 'etf' }];
    const { assetAllocation } = analyzePortfolio(holdings, []);
    expect(assetAllocation[0].type).toBe('ETF');
  });

  it('labels a holding as unrecognized when neither source gives a type', () => {
    const holdings = [{ security_id: 'missing', institution_value: 500 }];
    expect(analyzePortfolio(holdings, []).assetAllocation[0].type).toBe('Unrecognized holdings');
  });

  it('buckets a target-date fund by its label rather than the provider type', () => {
    const holdings = [
      { security_id: 'td', institution_value: 10_000, security_name: 'State St Target Ret 2040 SL SF CL III' },
    ];
    const tdSecurities = [
      { security_id: 'td', type: 'mutual fund', name: 'State St Target Ret 2040 SL SF CL III' },
    ];
    expect(analyzePortfolio(holdings, tdSecurities).assetAllocation).toEqual([
      { type: 'Target Date Fund', value: 10_000, percentage: 100 },
    ]);
  });

  it('treats a missing institution_value as zero rather than producing NaN', () => {
    const holdings = [{ security_id: 'sec-1', institution_value: 1000 }, { security_id: 'sec-2' }];
    const result = analyzePortfolio(holdings, securities);
    expect(result.totalValue).toBe(1000);
    expect(result.assetAllocation.every((a: any) => Number.isFinite(a.percentage))).toBe(true);
  });

  it('reports zero percentages instead of dividing by zero on a valueless portfolio', () => {
    const holdings = [{ security_id: 'sec-1', institution_value: 0 }];
    const result = analyzePortfolio(holdings, securities);
    expect(result.totalValue).toBe(0);
    expect(result.assetAllocation[0].percentage).toBe(0);
  });

  it('returns an empty analysis for no holdings', () => {
    expect(analyzePortfolio([], securities)).toEqual({
      totalValue: 0,
      assetAllocation: [],
      holdingCount: 0,
      securityCount: 0
    });
  });
});

describe('analyzeInvestmentActivity', () => {
  it('groups Plaid lowercase and SnapTrade uppercase types into one bucket', () => {
    // Explicitly documented in the source: a merged feed must report one bucket
    // per type, not "buy" and "BUY" side by side.
    const result = analyzeInvestmentActivity([
      { type: 'buy', amount: 100 },
      { type: 'BUY', amount: 200 },
      { type: 'sell', amount: 50 }
    ]);
    expect(Object.keys(result.activityByType).sort()).toEqual(['Buy', 'Sell']);
    expect(result.activityByType.Buy).toEqual({ count: 2, totalAmount: 300 });
    expect(result.activityByType.Sell).toEqual({ count: 1, totalAmount: 50 });
  });

  it('sums volume on magnitude so buys and sells do not cancel out', () => {
    const result = analyzeInvestmentActivity([
      { type: 'buy', amount: 500 },
      { type: 'sell', amount: -500 }
    ]);
    expect(result.totalVolume).toBe(1000);
  });

  it('averages by transaction count', () => {
    const result = analyzeInvestmentActivity([
      { type: 'buy', amount: 100 },
      { type: 'buy', amount: 300 }
    ]);
    expect(result.totalTransactions).toBe(2);
    expect(result.averageTransactionSize).toBe(200);
  });

  it('treats a missing amount as zero', () => {
    const result = analyzeInvestmentActivity([{ type: 'buy' }, { type: 'buy', amount: 100 }]);
    expect(result.totalVolume).toBe(100);
    expect(result.activityByType.Buy.totalAmount).toBe(100);
  });

  it('buckets an untyped transaction as Unknown rather than dropping it', () => {
    const result = analyzeInvestmentActivity([{ amount: 100 }]);
    expect(result.activityByType.Unknown).toEqual({ count: 1, totalAmount: 100 });
  });

  it('returns zeroes for an empty feed without dividing by zero', () => {
    expect(analyzeInvestmentActivity([])).toEqual({
      totalTransactions: 0,
      totalVolume: 0,
      activityByType: {},
      averageTransactionSize: 0
    });
  });
});

describe('handlePlaidError', () => {
  const plaidError = (error_code: string, error_message?: string) => ({
    response: { data: { error_code, error_message } }
  });

  it('explains ADDITIONAL_CONSENT_REQUIRED as a sandbox limitation', () => {
    const result = handlePlaidError(plaidError('ADDITIONAL_CONSENT_REQUIRED'), 'getInvestments');
    expect(result).toEqual({
      error: 'Additional consent required',
      details: 'This is a sandbox limitation. In production, users would need to provide additional consent.',
      code: 'ADDITIONAL_CONSENT_REQUIRED'
    });
  });

  it('asks the user to reconnect on INVALID_ACCESS_TOKEN', () => {
    const result = handlePlaidError(plaidError('INVALID_ACCESS_TOKEN'), 'getAccounts');
    expect(result.error).toBe('Invalid access token');
    expect(result.details).toBe('Please reconnect your account.');
    expect(result.code).toBe('INVALID_ACCESS_TOKEN');
  });

  it('asks the user to re-authenticate on ITEM_LOGIN_REQUIRED', () => {
    const result = handlePlaidError(plaidError('ITEM_LOGIN_REQUIRED'), 'syncTransactions');
    expect(result.error).toBe('Re-authentication required');
    expect(result.code).toBe('ITEM_LOGIN_REQUIRED');
  });

  it('passes an unrecognised Plaid code through with its message', () => {
    const result = handlePlaidError(plaidError('RATE_LIMIT_EXCEEDED', 'too many requests'), 'getTransactions');
    expect(result).toEqual({
      error: 'Plaid error: RATE_LIMIT_EXCEEDED',
      details: 'too many requests',
      code: 'RATE_LIMIT_EXCEEDED'
    });
  });

  it('supplies a generic detail when Plaid sends a code with no message', () => {
    const result = handlePlaidError(plaidError('SOME_CODE'), 'getTransactions');
    expect(result.details).toBe('An error occurred with Plaid');
  });

  it('falls back to UNKNOWN_ERROR for a non-Plaid failure', () => {
    const result = handlePlaidError(new Error('socket hang up'), 'getAccounts');
    expect(result).toEqual({
      error: 'Failed to complete operation',
      details: 'socket hang up',
      code: 'UNKNOWN_ERROR'
    });
  });

  it('handles a thrown value with no message at all', () => {
    const result = handlePlaidError({}, 'getAccounts');
    expect(result.details).toBe('An unexpected error occurred');
    expect(result.code).toBe('UNKNOWN_ERROR');
  });

  it('never returns a raw Plaid error object to the caller', () => {
    // These results are shaped for API responses, so they must not carry the
    // upstream response payload or a stack.
    const result = handlePlaidError(plaidError('INVALID_ACCESS_TOKEN'), 'getAccounts');
    expect(result).not.toHaveProperty('response');
    expect(result).not.toHaveProperty('stack');
    expect(Object.keys(result).sort()).toEqual(['code', 'details', 'error']);
  });
});
