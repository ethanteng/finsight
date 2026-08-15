import {
  getAccountBalance,
  type Account,
} from '@/components/finances/AccountGroupCard';
import { resolveAccountBalance } from '@/lib/account-balance';

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

describe('resolveAccountBalance', () => {
  it('prefers current over available for savings accounts held funds', () => {
    // Regression: the profile page used to render `available` for depository
    // accounts, so a HYSA with a pending deposit showed half of the balance the
    // Finances page reported for the same account.
    expect(
      resolveAccountBalance({
        balance: { current: 20000, available: 10000 },
      })
    ).toBe(20000);
  });

  it('falls back to available only when current is missing', () => {
    expect(resolveAccountBalance({ balance: { current: null, available: 75 } })).toBe(75);
  });

  it('returns null when neither balance is reported', () => {
    expect(resolveAccountBalance({ balance: { current: null, available: null } })).toBeNull();
    expect(resolveAccountBalance({ balance: null })).toBeNull();
    expect(resolveAccountBalance({})).toBeNull();
  });

  it('honours a precomputed display balance', () => {
    expect(resolveAccountBalance({ displayBalance: 42, balance: { current: 1 } })).toBe(42);
    expect(resolveAccountBalance({ displayBalance: null, balance: { current: 1 } })).toBeNull();
  });

  it('accepts a plain numeric balance', () => {
    expect(resolveAccountBalance({ balance: 1234 })).toBe(1234);
  });

  it('rejects non-finite values instead of rendering NaN', () => {
    expect(resolveAccountBalance({ balance: { current: Number.NaN, available: 10 } })).toBe(10);
  });
});
