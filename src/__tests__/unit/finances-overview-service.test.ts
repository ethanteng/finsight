import {
  buildAccountDisplayBalances,
  buildFinancesAccountDetails,
  buildFinancesOverview,
  hasAccountDisplayBalances,
  withAccountDisplayBalances,
} from '../../services/finances-overview-service';

const snapshot = {
  computedAt: '2026-08-14T12:00:00.000Z',
  asOf: '2026-08-14T10:00:00.000Z',
  status: 'current',
  reportingCurrency: 'USD',
  financialOverview: {
    netWorth: 477000,
    totalCash: 5000,
    totalInvestments: 100000,
    totalDebt: 28000,
    homeValue: 400000,
  },
  investmentPortfolio: { totalValue: 100000, holdingCount: 1, securityCount: 1 },
  accounts: [
    { account_id: 'cash', name: 'Checking', type: 'depository', subtype: 'checking', source: 'plaid', balance: { current: 5000, available: 4500, iso_currency_code: 'USD' } },
    { account_id: 'overdraft', name: 'Overdrawn', type: 'depository', subtype: 'checking', source: 'plaid', balance: { current: -200, iso_currency_code: 'USD' } },
    { account_id: 'card', name: 'Card', type: 'credit', subtype: 'credit card', source: 'plaid', balance: { current: 800, iso_currency_code: 'USD' } },
    { account_id: 'brokerage', name: 'Brokerage', type: 'investment', subtype: 'brokerage', source: 'plaid', balance: { current: 100000, iso_currency_code: 'USD' } },
    { account_id: 'manual-manual-cash', name: 'Wallet', type: 'depository', subtype: 'checking', source: 'manual', balance: { current: 100, iso_currency_code: 'USD' } },
  ],
  holdings: [
    { id: 'holding', account_id: 'brokerage', security_id: 'security', institution_value: 100000, iso_currency_code: 'USD' },
  ],
  securities: [{ security_id: 'security', type: 'equity' }],
  transactions: [
    { transaction_id: 'cash-tx', account_id: 'cash', date: '2026-08-01', amount: -20 },
    { transaction_id: 'card-tx', account_id: 'card', date: '2026-08-02', amount: 30 },
  ],
  activities: [
    { id: 'trade', account_id: 'brokerage', date: '2026-08-03', amount: 100 },
  ],
  transactionsSummary: {
    reportingCurrency: 'USD',
    incomeTotal: 6000,
    expenseTotal: 2400,
    operatingCashFlow: 3600,
    byCategory: { Food: 2400 },
    byMonth: {
      '2026-07': { income: 2000, expense: 1000, operatingCashFlow: 1000 },
      '2026-08': { income: 4000, expense: 1400, operatingCashFlow: 2600 },
    },
    includedTransactionIds: ['cash-tx'],
    excludedTransactionIds: [],
    unclassifiedTransactionIds: [],
    currencyMismatchTransactionIds: [],
  },
  meta: {
    home: {
      address: '1 Main St',
      valueMid: 400000,
      valueLow: 380000,
      valueHigh: 420000,
      lastUpdated: '2026-08-13T00:00:00.000Z',
      isManualOverride: true,
    },
  },
};

describe('finances overview contract', () => {
  it('persists canonical per-account display balances instead of provider cash fields', () => {
    expect(buildAccountDisplayBalances(
      [
        { account_id: 'investment', type: 'investment', source: 'plaid', balance: { current: 25 } },
        { account_id: 'debt', type: 'credit', balance: { current: -400 } },
      ],
      [{ account_id: 'investment', institution_value: 9000, iso_currency_code: 'USD' }],
      'USD'
    )).toEqual({ investment: 9000, debt: 400 });
  });

  it('backfills display balances from holdings for a legacy snapshot', () => {
    const legacySnapshot = {
      ...snapshot,
      accounts: snapshot.accounts.map(account => account.account_id === 'brokerage'
        ? { ...account, balance: { current: 75000, iso_currency_code: 'USD' } }
        : account),
      meta: { version: '2.0' },
    };

    expect(hasAccountDisplayBalances(legacySnapshot)).toBe(false);
    const upgraded = withAccountDisplayBalances(legacySnapshot);
    expect(hasAccountDisplayBalances(upgraded)).toBe(true);
    expect((upgraded.meta as any).accountDisplayBalances.brokerage).toBe(100000);
    expect(buildFinancesOverview({ snapshot: upgraded }).accountGroups.investments.accounts[0])
      .toMatchObject({ account_id: 'brokerage', displayBalance: 100000 });
  });

  it('uses canonical totals, groupings, and monthly aggregates without inventing a manual-home range', () => {
    const overview = buildFinancesOverview({
      snapshot,
      manualAccounts: [{
        id: 'manual-cash',
        name: 'Wallet',
        amount: 100,
        type: 'cash',
        createdAt: '2026-08-01T00:00:00.000Z',
        updatedAt: '2026-08-01T00:00:00.000Z',
      }],
      overrides: { monthlyIncome: null, monthlyExpense: 1500 },
    });

    expect(overview.revision.id).toBe('2026-08-14T12:00:00.000Z');
    expect(overview.accountGroups.cash.totalBalance).toBe(5000);
    expect(overview.accountGroups.cash.accounts.map(account => account.account_id)).toEqual([
      'cash',
      'manual-manual-cash',
    ]);
    expect(overview.accountGroups.debt.accounts.map(account => account.account_id)).toEqual([
      'overdraft',
      'card',
    ]);
    expect(overview.accountGroups.debt.totalBalance).toBe(28000);
    expect(overview.cashFlow).toMatchObject({
      monthCount: 2,
      calculatedMonthlyIncome: 3000,
      calculatedMonthlyExpense: 1200,
      effectiveMonthlyIncome: 3000,
      effectiveMonthlyExpense: 1500,
    });
    expect(overview.home).toMatchObject({
      value: 400000,
      valueLow: null,
      valueHigh: null,
      isManualOverride: true,
      isSnapshotAligned: true,
    });
    expect(overview.warnings).toEqual([]);
  });

  it('filters heavy account details and calculates the investment portfolio on demand', () => {
    const details = buildFinancesAccountDetails(snapshot, 'brokerage');

    expect(details).not.toBeNull();
    expect(details?.transactions).toEqual([]);
    expect(details?.investmentTransactions.map(transaction => transaction.id)).toEqual(['trade']);
    expect(details?.holdings.map(holding => holding.id)).toEqual(['holding']);
    expect(details?.portfolio).toMatchObject({
      totalValue: 100000,
      holdingCount: 1,
      securityCount: 1,
    });
    expect(buildFinancesAccountDetails(snapshot, 'not-owned')).toBeNull();
  });

  it('surfaces partial and excluded-transaction warnings from the snapshot revision', () => {
    const overview = buildFinancesOverview({
      snapshot: {
        ...snapshot,
        status: 'partial',
        transactionsSummary: {
          ...snapshot.transactionsSummary,
          unclassifiedTransactionIds: ['unknown'],
          currencyMismatchTransactionIds: ['cad'],
        },
      },
      manualAccounts: [{
        id: 'manual-cash', name: 'Wallet', amount: 100, type: 'cash',
        createdAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-08-01T00:00:00.000Z',
      }],
    });

    expect(overview.warnings.map(warning => warning.code)).toEqual([
      'partial',
      'unclassified-transactions',
      'currency-mismatch',
    ]);
  });

  it('shows the current account name without waiting for the snapshot to be rebuilt', () => {
    const overview = buildFinancesOverview({
      snapshot,
      accountNames: new Map([
        ['brokerage', 'University of California 401K'],
        ['manual-manual-cash', 'Travel Wallet'],
      ]),
      manualAccounts: [{
        id: 'manual-cash', name: 'Travel Wallet', amount: 100, type: 'cash',
        createdAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-08-01T00:00:00.000Z',
      }],
    });

    expect(overview.accountGroups.investments.accounts[0].name).toBe('University of California 401K');
    expect(overview.accountGroups.cash.accounts.map(account => account.name))
      .toContain('Travel Wallet');
    // Renaming moves no money.
    expect(overview.financialOverview.totalInvestments).toBe(100000);
  });

  it('keeps the snapshot name for accounts with no live name', () => {
    const overview = buildFinancesOverview({
      snapshot,
      accountNames: new Map([['brokerage', 'Renamed Brokerage']]),
    });

    expect(overview.accountGroups.investments.accounts[0].name).toBe('Renamed Brokerage');
    expect(overview.accountGroups.cash.accounts[0].name).toBe('Checking');
  });

  it('does not flag a rename as out of sync, because the name is served live', () => {
    // The route always supplies live names, so a rename is already reflected everywhere the
    // page shows it. Warning about it would ask the user to refresh totals that did not move.
    const overview = buildFinancesOverview({
      snapshot,
      accountNames: new Map([['manual-manual-cash', 'Travel Wallet']]),
      manualAccounts: [{
        id: 'manual-cash', name: 'Travel Wallet', amount: 100, type: 'cash',
        createdAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-08-01T00:00:00.000Z',
      }],
    });

    expect(overview.warnings.map(warning => warning.code)).not.toContain('manual-accounts-out-of-sync');
    expect(overview.manualAccounts[0].name).toBe('Travel Wallet');
    expect(overview.accountGroups.cash.accounts.map(account => account.name)).toContain('Travel Wallet');
  });

  it('still flags a renamed manual account when no live name is supplied', () => {
    // Defensive: without the overlay the snapshot name is genuinely what the user sees.
    const overview = buildFinancesOverview({
      snapshot,
      manualAccounts: [{
        id: 'manual-cash', name: 'Travel Wallet', amount: 100, type: 'cash',
        createdAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-08-01T00:00:00.000Z',
      }],
    });

    expect(overview.warnings.map(warning => warning.code)).toContain('manual-accounts-out-of-sync');
  });

  it('flags an edited manual account amount as out of sync until the snapshot is rebuilt', () => {
    // Amounts are never overlaid — only the snapshot knows the totals they feed.
    const overview = buildFinancesOverview({
      snapshot,
      accountNames: new Map([['manual-manual-cash', 'Wallet']]),
      manualAccounts: [{
        id: 'manual-cash', name: 'Wallet', amount: 250, type: 'cash',
        createdAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-08-01T00:00:00.000Z',
      }],
    });

    expect(overview.warnings.map(warning => warning.code)).toContain('manual-accounts-out-of-sync');
  });

  it('treats a debt manual account as aligned despite the snapshot storing a positive magnitude', () => {
    const overview = buildFinancesOverview({
      snapshot: {
        ...snapshot,
        accounts: [{
          account_id: 'manual-manual-debt', name: 'Personal Loan', type: 'loan', subtype: 'loan',
          source: 'manual', balance: { current: 5000, iso_currency_code: 'USD' },
        }],
      },
      manualAccounts: [{
        id: 'manual-debt', name: 'Personal Loan', amount: 5000, type: 'debt',
        createdAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-08-01T00:00:00.000Z',
      }],
    });

    expect(overview.warnings.map(warning => warning.code)).not.toContain('manual-accounts-out-of-sync');
  });
});
