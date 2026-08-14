import {
  getAccountBalance,
  summarizeAccountBalances,
  type Account,
} from '@/components/finances/AccountGroupCard';

describe('account balance summaries', () => {
  it('reports missing balances instead of silently treating them as zero', () => {
    const accounts: Account[] = [
      {
        id: 'known',
        account_id: 'known',
        name: 'Known checking',
        type: 'depository',
        subtype: 'checking',
        balance: { current: 100, iso_currency_code: 'USD' },
      },
      {
        id: 'unknown',
        account_id: 'unknown',
        name: 'Unknown checking',
        type: 'depository',
        subtype: 'checking',
        balance: { current: null, iso_currency_code: 'USD' },
      },
    ];

    expect(getAccountBalance(accounts[1])).toBeNull();
    expect(summarizeAccountBalances(accounts)).toEqual({
      totalBalance: 100,
      unavailableBalanceCount: 1,
    });
  });

  it('uses absolute values for debt subtotals', () => {
    const accounts: Account[] = [{
      id: 'credit',
      account_id: 'credit',
      name: 'Credit card',
      type: 'credit',
      subtype: 'credit card',
      balance: { current: -250, iso_currency_code: 'USD' },
    }];

    expect(summarizeAccountBalances(accounts, true).totalBalance).toBe(250);
  });

  it('marks the subtotal unavailable when no account has a known balance', () => {
    const accounts: Account[] = [{
      id: 'unknown',
      account_id: 'unknown',
      name: 'Unknown checking',
      type: 'depository',
      subtype: 'checking',
      balance: { current: null, iso_currency_code: 'USD' },
    }];

    expect(summarizeAccountBalances(accounts)).toEqual({
      totalBalance: null,
      unavailableBalanceCount: 1,
    });
  });
});
