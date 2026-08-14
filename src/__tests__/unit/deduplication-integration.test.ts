import { FinancialDataService } from '../../services/financial-data-service';
import { FinancialSummaryService } from '../../services/financial-summary-service';

describe('Deduplication Integration', () => {
  let financialDataService: FinancialDataService;
  let financialSummaryService: FinancialSummaryService;

  beforeEach(() => {
    financialDataService = new FinancialDataService();
    financialSummaryService = new FinancialSummaryService();
  });

  it('should deduplicate accounts consistently across all services', () => {
    // Simulate accounts from multiple syncs with different balances
    const plaidAccounts = [
      {
        account_id: 'plaid-123',
        id: 'plaid-123',
        name: 'Checking',
        type: 'depository',
        subtype: 'checking',
        balance: { current: 1000, iso_currency_code: 'USD' },
        source: 'plaid',
        plaidAccountId: 'plaid-123',
        persistentAccountId: 'plaid-123',
        snapshotTimestamp: '2025-01-01T00:00:00Z'
      },
      {
        account_id: 'plaid-123', // Duplicate
        id: 'plaid-123',
        name: 'Checking',
        type: 'depository',
        subtype: 'checking',
        balance: { current: 1500, iso_currency_code: 'USD' },
        source: 'plaid',
        plaidAccountId: 'plaid-123',
        persistentAccountId: 'plaid-123',
        snapshotTimestamp: '2025-01-02T00:00:00Z' // More recent
      },
      {
        account_id: 'plaid-456',
        id: 'plaid-456',
        name: 'Savings',
        type: 'depository',
        subtype: 'savings',
        balance: { current: 5000, iso_currency_code: 'USD' },
        source: 'plaid',
        plaidAccountId: 'plaid-456',
        persistentAccountId: 'plaid-456',
        snapshotTimestamp: '2025-01-01T00:00:00Z'
      }
    ];

    const snapTradeAccounts = [
      {
        account_id: 'snaptrade-789',
        id: 'snaptrade-789',
        name: 'Brokerage',
        type: 'investment',
        subtype: 'brokerage',
        balance: { current: 10000, iso_currency_code: 'USD' },
        source: 'snaptrade',
        persistentAccountId: 'snaptrade-789',
        snapshotTimestamp: '2025-01-01T00:00:00Z'
      }
    ];

    // Test mergeFinancialData deduplication
    const plaidData = { accounts: plaidAccounts, balances: {}, holdings: [], securities: [], transactions: [] };
    const snapTradeData = { accounts: snapTradeAccounts, balances: {}, holdings: [], securities: [], transactions: [] };

    const merged = (financialDataService as any).mergeFinancialData(plaidData, snapTradeData, null);

    // Should have 3 unique accounts (plaid-123 deduplicated, plaid-456, snaptrade-789)
    expect(merged.accounts).toHaveLength(3);
    
    // plaid-123 should be the more recent one (1500 balance)
    const checkingAccount = merged.accounts.find((a: any) => a.account_id === 'plaid-123');
    expect(checkingAccount).toBeDefined();
    expect(checkingAccount.balance.current).toBe(1500);
    expect(checkingAccount.snapshotTimestamp).toBe('2025-01-02T00:00:00Z');

    // All accounts should have account_id set
    merged.accounts.forEach((account: any) => {
      expect(account.account_id).toBeDefined();
      if (account.source === 'plaid') {
        expect(account.plaidAccountId).toBe(account.account_id);
      } else if (account.source === 'snaptrade') {
        expect(account.plaidAccountId).toBeUndefined();
      }
    });
  });

  it('should not infer identity for same-name, same-balance accounts', () => {
    const plaidAccounts = [
      {
        account_id: 'JmKkKyzmdDf3zYaBrJqRtKX9ZpXQk7cXJggBD',
        id: 'JmKkKyzmdDf3zYaBrJqRtKX9ZpXQk7cXJggBD',
        name: 'Retirement - Traditional IRA',
        type: 'investment',
        subtype: 'ira',
        balance: { current: 577940.96, iso_currency_code: 'USD' },
        source: 'plaid',
        plaidAccountId: 'JmKkKyzmdDf3zYaBrJqRtKX9ZpXQk7cXJggBD',
        institution: 'Betterment',
        plaidOriginalName: 'Retirement - Traditional IRA',
        snapshotTimestamp: '2026-03-14T01:11:00Z'
      },
      {
        account_id: '5aK74vOALwu6Evv4zAOVuEg8XBOMRQsNRraZM',
        id: '5aK74vOALwu6Evv4zAOVuEg8XBOMRQsNRraZM',
        name: 'Retirement - Traditional IRA',
        type: 'investment',
        subtype: 'ira',
        balance: { current: 577940.96, iso_currency_code: 'USD' },
        source: 'plaid',
        plaidAccountId: '5aK74vOALwu6Evv4zAOVuEg8XBOMRQsNRraZM',
        institution: 'Betterment',
        plaidOriginalName: 'Retirement - Traditional IRA',
        snapshotTimestamp: '2026-03-14T19:49:19Z'
      }
    ];

    const plaidData = { accounts: plaidAccounts, balances: {}, holdings: [], securities: [], transactions: [] };
    const merged = (financialDataService as any).mergeFinancialData(plaidData, null, null);

    expect(merged.accounts).toHaveLength(2);
  });

  it('should NOT deduplicate different accounts with same institution+type+subtype (e.g. two CDs)', () => {
    // Regression: "Popular Direct CD 8/7/2026" and "Popular Direct CD 8/8/2027" were incorrectly
    // collapsed when Plaid/institution returned same or similar names for both
    const plaidAccounts = [
      {
        account_id: 'pwnJObQNp5uvKN6kaqjBT7480a5ozOIL1prKAd',
        id: 'pwnJObQNp5uvKN6kaqjBT7480a5ozOIL1prKAd',
        name: 'Popular Direct CD 8/7/2026',
        type: 'depository',
        subtype: 'cd',
        balance: { current: 78914.49, iso_currency_code: 'USD' },
        source: 'plaid',
        plaidAccountId: 'pwnJObQNp5uvKN6kaqjBT7480a5ozOIL1prKAd',
        institution: 'Popular Direct - Personal',
        plaidOriginalName: 'Popular Direct CD',
        snapshotTimestamp: '2026-03-15T11:12:00Z'
      },
      {
        account_id: 'XY4AbpKqadteBwk9PRXQt1MP4wvzDqHjwYQJzp',
        id: 'XY4AbpKqadteBwk9PRXQt1MP4wvzDqHjwYQJzp',
        name: 'Popular Direct CD 8/8/2027',
        type: 'depository',
        subtype: 'cd',
        balance: { current: 107115.7, iso_currency_code: 'USD' },
        source: 'plaid',
        plaidAccountId: 'XY4AbpKqadteBwk9PRXQt1MP4wvzDqHjwYQJzp',
        institution: 'Popular Direct - Personal',
        plaidOriginalName: 'Popular Direct CD',
        snapshotTimestamp: '2026-03-15T11:12:00Z'
      }
    ];

    const plaidData = { accounts: plaidAccounts, balances: {}, holdings: [], securities: [], transactions: [] };
    const merged = (financialDataService as any).mergeFinancialData(plaidData, null, null);

    expect(merged.accounts).toHaveLength(2);
    const cd2026 = merged.accounts.find((a: any) => a.account_id === 'pwnJObQNp5uvKN6kaqjBT7480a5ozOIL1prKAd');
    const cd2027 = merged.accounts.find((a: any) => a.account_id === 'XY4AbpKqadteBwk9PRXQt1MP4wvzDqHjwYQJzp');
    expect(cd2026).toBeDefined();
    expect(cd2027).toBeDefined();
    expect(cd2026.balance.current).toBe(78914.49);
    expect(cd2027.balance.current).toBe(107115.7);
  });

  it('should handle accounts without timestamps correctly', () => {
    const accounts = [
      {
        account_id: 'plaid-123',
        id: 'plaid-123',
        name: 'Checking',
        type: 'depository',
        subtype: 'checking',
        balance: { current: 1000, iso_currency_code: 'USD' },
        source: 'plaid',
        plaidAccountId: 'plaid-123',
        persistentAccountId: 'plaid-123'
        // No timestamp
      },
      {
        account_id: 'plaid-123',
        id: 'plaid-123',
        name: 'Checking',
        type: 'depository',
        subtype: 'checking',
        balance: { current: 2000, iso_currency_code: 'USD' },
        source: 'plaid',
        plaidAccountId: 'plaid-123',
        persistentAccountId: 'plaid-123'
        // No timestamp
      }
    ];

    const plaidData = { accounts, balances: {}, holdings: [], securities: [], transactions: [] };
    const merged = (financialDataService as any).mergeFinancialData(plaidData, null, null);

    expect(merged.accounts).toHaveLength(1);
    // Balance magnitude is not a freshness signal; preserve deterministic source order.
    expect(merged.accounts[0].balance.current).toBe(1000);
  });

  it('replaces a holding when its quantity changes instead of duplicating the position', () => {
    const account = {
      account_id: 'brokerage-1',
      id: 'brokerage-1',
      name: 'Brokerage',
      type: 'investment',
      subtype: 'brokerage',
      balance: { current: 1200, iso_currency_code: 'USD' },
      source: 'plaid',
      sourceConnectionId: 'connection-1',
    };
    const plaidData = {
      accounts: [account],
      balances: {},
      holdings: [
        { account_id: 'brokerage-1', security_id: 'security-1', quantity: 10, institution_value: 1000, institution_price_as_of: '2026-08-12' },
        { account_id: 'brokerage-1', security_id: 'security-1', quantity: 12, institution_value: 1200, institution_price_as_of: '2026-08-13' },
      ],
      securities: [{ security_id: 'security-1', type: 'equity' }],
      transactions: [],
    };

    const merged = (financialDataService as any).mergeFinancialData(plaidData, null, null);

    expect(merged.investments.holdings).toHaveLength(1);
    expect(merged.investments.holdings[0].quantity).toBe(12);
  });
});
