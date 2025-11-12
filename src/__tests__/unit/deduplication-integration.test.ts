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
    // Should prefer higher balance when timestamps are missing
    expect(merged.accounts[0].balance.current).toBe(2000);
  });
});

