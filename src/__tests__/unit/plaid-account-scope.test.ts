import { filterPlaidOnlyAccounts, isNonPlaidAccountId } from '../../services/plaid-account-scope';

describe('filterPlaidOnlyAccounts', () => {
  const account = (account_id: string, source?: string) => ({ account_id, source });

  it('keeps Plaid accounts', () => {
    const accounts = [account('abc123', 'plaid'), account('def456', 'plaid')];
    expect(filterPlaidOnlyAccounts(accounts)).toEqual(accounts);
  });

  it('drops SnapTrade accounts', () => {
    const plaid = account('abc123', 'plaid');
    expect(filterPlaidOnlyAccounts([plaid, account('snaptrade-9f2', 'snaptrade')])).toEqual([plaid]);
  });

  it('drops direct Public.com accounts', () => {
    // The bug this guards: an "is not SnapTrade" test passed these through, so
    // Public accounts appeared under "Your Connected Accounts (Plaid)" as well
    // as under SnapTrade.
    const plaid = account('abc123', 'plaid');
    expect(filterPlaidOnlyAccounts([plaid, account('public-5OQ83585', 'public')])).toEqual([plaid]);
  });

  it('drops manual accounts, which have their own section', () => {
    const plaid = account('abc123', 'plaid');
    expect(filterPlaidOnlyAccounts([plaid, account('manual-17', 'manual')])).toEqual([plaid]);
  });

  it('drops an account with no source rather than assuming it is Plaid', () => {
    expect(filterPlaidOnlyAccounts([account('abc123')])).toEqual([]);
  });
});

describe('isNonPlaidAccountId', () => {
  it('recognises every provider namespace that is not Plaid', () => {
    expect(isNonPlaidAccountId('snaptrade-9f2')).toBe(true);
    expect(isNonPlaidAccountId('manual-17')).toBe(true);
    // The one the persisted loader did not know about: these rows came back
    // stamped source: 'plaid' and showed under "Your Connected Accounts (Plaid)".
    expect(isNonPlaidAccountId('public-5OQ83585')).toBe(true);
  });

  it('leaves a genuine Plaid account id alone', () => {
    expect(isNonPlaidAccountId('BxBXxLj1m4HMXBm9WZZmCWVbPjX16EHwv99vp')).toBe(false);
  });

  it('matches on the namespace, not on the word appearing anywhere', () => {
    // A brokerage genuinely called "Public Storage" must not be mistaken for one.
    expect(isNonPlaidAccountId('acct-public-storage')).toBe(false);
    expect(isNonPlaidAccountId('publicly-traded-fund')).toBe(false);
  });
});
