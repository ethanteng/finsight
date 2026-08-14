import {
  financialAccountIdentityKey,
  isNewerAccountSnapshot,
} from '../../services/account-identity';

describe('financial account identity', () => {
  it('scopes provider account IDs to their source connection', () => {
    const base = { source: 'plaid', account_id: 'account-1' };
    expect(financialAccountIdentityKey({ ...base, sourceConnectionId: 'item-a' })).not.toBe(
      financialAccountIdentityKey({ ...base, sourceConnectionId: 'item-b' })
    );
  });

  it('uses a true persistent provider ID across relinks', () => {
    expect(financialAccountIdentityKey({
      source: 'plaid',
      sourceConnectionId: 'item-a',
      account_id: 'old-id',
      persistentAccountId: 'stable-id',
    })).toBe(financialAccountIdentityKey({
      source: 'plaid',
      sourceConnectionId: 'item-b',
      account_id: 'new-id',
      persistentAccountId: 'stable-id',
    }));
  });

  it('never treats a larger balance as evidence of freshness', () => {
    expect(isNewerAccountSnapshot(
      { balance: { current: 10 } },
      { balance: { current: 1000 } }
    )).toBe(false);
  });
});
