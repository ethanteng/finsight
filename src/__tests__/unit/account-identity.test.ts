import { mergeFinancialSources } from '../../services/financial-calculations';

const mergeForTest = (plaidData: any, snapTradeData: any, manualAccountsData: any) =>
  mergeFinancialSources(plaidData, snapTradeData, manualAccountsData, null);

describe('Account Identity Standardization', () => {
  describe('mergeFinancialData - Account Deduplication', () => {
    it('should deduplicate Plaid accounts by account_id (plaidAccountId)', () => {
      const plaidData = {
        accounts: [
          {
            account_id: 'plaid-123',
            id: 'plaid-123',
            name: 'Checking Account',
            type: 'depository',
            subtype: 'checking',
            balance: { current: 1000, available: 1000, iso_currency_code: 'USD' },
            source: 'plaid',
            plaidAccountId: 'plaid-123',
            persistentAccountId: 'plaid-123',
            snapshotTimestamp: '2025-01-01T00:00:00Z',
            lastSyncedAt: '2025-01-01T00:00:00Z'
          },
          {
            account_id: 'plaid-123', // Same account, different balance
            id: 'plaid-123',
            name: 'Checking Account',
            type: 'depository',
            subtype: 'checking',
            balance: { current: 1500, available: 1500, iso_currency_code: 'USD' },
            source: 'plaid',
            plaidAccountId: 'plaid-123',
            persistentAccountId: 'plaid-123',
            snapshotTimestamp: '2025-01-02T00:00:00Z', // More recent
            lastSyncedAt: '2025-01-02T00:00:00Z'
          }
        ],
        balances: {},
        holdings: [],
        securities: [],
        transactions: []
      };

      const result = mergeForTest(plaidData, null, null);

      expect(result.accounts).toHaveLength(1);
      expect(result.accounts[0].account_id).toBe('plaid-123');
      expect(result.accounts[0].balance.current).toBe(1500); // Should keep more recent
    });

    it('should deduplicate SnapTrade accounts by account_id', () => {
      const snapTradeData = {
        accounts: [
          {
            account_id: 'snaptrade-456',
            id: 'snaptrade-456',
            name: 'Brokerage Account',
            type: 'investment',
            subtype: 'brokerage',
            balance: { current: 5000, available: 5000, iso_currency_code: 'USD' },
            source: 'snaptrade',
            persistentAccountId: 'snaptrade-456',
            snapshotTimestamp: '2025-01-01T00:00:00Z',
            lastSyncedAt: '2025-01-01T00:00:00Z'
          },
          {
            account_id: 'snaptrade-456', // Same account, different balance
            id: 'snaptrade-456',
            name: 'Brokerage Account',
            type: 'investment',
            subtype: 'brokerage',
            balance: { current: 6000, available: 6000, iso_currency_code: 'USD' },
            source: 'snaptrade',
            persistentAccountId: 'snaptrade-456',
            snapshotTimestamp: '2025-01-02T00:00:00Z', // More recent
            lastSyncedAt: '2025-01-02T00:00:00Z'
          }
        ],
        balances: {},
        holdings: [],
        securities: [],
        transactions: []
      };

      const result = mergeForTest(null, snapTradeData, null);

      expect(result.accounts).toHaveLength(1);
      expect(result.accounts[0].account_id).toBe('snaptrade-456');
      expect(result.accounts[0].balance.current).toBe(6000); // Should keep more recent
      expect((result.accounts[0] as any).plaidAccountId).toBeUndefined(); // SnapTrade shouldn't have plaidAccountId
    });

    it('should deduplicate mixed Plaid and SnapTrade accounts correctly', () => {
      const plaidData = {
        accounts: [
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
          }
        ],
        balances: {},
        holdings: [],
        securities: [],
        transactions: []
      };

      const snapTradeData = {
        accounts: [
          {
            account_id: 'snaptrade-456',
            id: 'snaptrade-456',
            name: 'Brokerage',
            type: 'investment',
            subtype: 'brokerage',
            balance: { current: 5000, iso_currency_code: 'USD' },
            source: 'snaptrade',
            persistentAccountId: 'snaptrade-456',
            snapshotTimestamp: '2025-01-01T00:00:00Z'
          }
        ],
        balances: {},
        holdings: [],
        securities: [],
        transactions: []
      };

      const result = mergeForTest(plaidData, snapTradeData, null);

      expect(result.accounts).toHaveLength(2);
      expect(result.accounts.find((a: any) => a.account_id === 'plaid-123')).toBeDefined();
      expect(result.accounts.find((a: any) => a.account_id === 'snaptrade-456')).toBeDefined();
    });

    it('should keep most recent account when timestamps differ', () => {
      const plaidData = {
        accounts: [
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
            snapshotTimestamp: '2025-01-01T00:00:00Z', // Older
            lastSyncedAt: '2025-01-01T00:00:00Z'
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
            persistentAccountId: 'plaid-123',
            snapshotTimestamp: '2025-01-03T00:00:00Z', // Newer
            lastSyncedAt: '2025-01-03T00:00:00Z'
          }
        ],
        balances: {},
        holdings: [],
        securities: [],
        transactions: []
      };

      const result = mergeForTest(plaidData, null, null);

      expect(result.accounts).toHaveLength(1);
      expect(result.accounts[0].balance.current).toBe(2000);
      expect(result.accounts[0].snapshotTimestamp).toBe('2025-01-03T00:00:00Z');
    });

    it('should prefer account with timestamp over one without', () => {
      const plaidData = {
        accounts: [
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
            persistentAccountId: 'plaid-123',
            snapshotTimestamp: '2025-01-01T00:00:00Z' // Has timestamp
          }
        ],
        balances: {},
        holdings: [],
        securities: [],
        transactions: []
      };

      const result = mergeForTest(plaidData, null, null);

      expect(result.accounts).toHaveLength(1);
      expect(result.accounts[0].balance.current).toBe(2000);
      expect(result.accounts[0].snapshotTimestamp).toBe('2025-01-01T00:00:00Z');
    });

    it('should keep deterministic source order when both accounts lack timestamps', () => {
      const plaidData = {
        accounts: [
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
        ],
        balances: {},
        holdings: [],
        securities: [],
        transactions: []
      };

      const result = mergeForTest(plaidData, null, null);

      expect(result.accounts).toHaveLength(1);
      expect(result.accounts[0].balance.current).toBe(1000);
    });

    it('should skip accounts without account_id', () => {
      const plaidData = {
        accounts: [
          {
            id: 'some-id',
            name: 'Account Without ID',
            type: 'depository',
            subtype: 'checking',
            balance: { current: 1000, iso_currency_code: 'USD' },
            source: 'plaid'
            // Missing account_id
          },
          {
            account_id: 'plaid-123',
            id: 'plaid-123',
            name: 'Valid Account',
            type: 'depository',
            subtype: 'checking',
            balance: { current: 2000, iso_currency_code: 'USD' },
            source: 'plaid',
            plaidAccountId: 'plaid-123',
            persistentAccountId: 'plaid-123'
          }
        ],
        balances: {},
        holdings: [],
        securities: [],
        transactions: []
      };

      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      const result = mergeForTest(plaidData, null, null);

      expect(result.accounts).toHaveLength(1);
      expect(result.accounts[0].account_id).toBe('plaid-123');
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Account without provider identity skipped')
      );
      consoleSpy.mockRestore();
    });
  });
});
