import {
  getAccountBalance,
  type Account,
} from '@/components/finances/AccountGroupCard';

describe('account balance summaries', () => {
  it('uses current balance before available balance to match canonical totals', () => {
    const account: Account = {
      id: 'checking',
      account_id: 'checking',
      name: 'Checking',
      type: 'depository',
      subtype: 'checking',
      balance: { current: 100, available: 75, iso_currency_code: 'USD' },
    };

    expect(getAccountBalance(account)).toBe(100);
  });

  it('reports a missing account balance instead of displaying zero', () => {
    const account: Account = {
      id: 'unknown',
      account_id: 'unknown',
      name: 'Unknown checking',
      type: 'depository',
      subtype: 'checking',
      balance: { current: null, iso_currency_code: 'USD' },
    };

    expect(getAccountBalance(account)).toBeNull();
  });
});
