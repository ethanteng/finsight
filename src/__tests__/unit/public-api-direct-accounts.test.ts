const findFirstSnapshot = jest.fn();
const getStatusMock = jest.fn();

jest.mock('../../prisma-client', () => ({
  getPrismaClient: () => ({
    financialSummarySnapshot: { findFirst: findFirstSnapshot },
  }),
}));
jest.mock('../../services/public-api/credential-store', () => ({
  getStatus: getStatusMock,
}));

import { substituteDirectPublicAccounts } from '../../services/public-api/direct-public-accounts';

describe('substituteDirectPublicAccounts', () => {
  const fidelity = { id: 'snaptrade-f1', name: 'First Citizens 401K', institution: 'Fidelity', balance: 188147.02 };
  const fidelity2 = { id: 'snaptrade-f2', name: 'UC 401K', institution: 'Fidelity', balance: 259.66 };
  // SnapTrade's copies: no balance at all, because its holdings sync for Public's
  // managed-yield products never completes.
  const publicTreasuryViaSnapTrade = { id: 'snaptrade-p1', name: 'Treasury Account', institution: 'Public', balance: null };
  const publicBrokerageViaSnapTrade = { id: 'snaptrade-p2', name: 'Brokerage Account', institution: 'Public', balance: 0 };

  const snapshotAccount = (id: string, name: string, balance: number | null, derived = false) => ({
    id,
    account_id: id,
    name,
    type: 'investment',
    subtype: 'treasury',
    institution: 'Public',
    source: 'public',
    balance: { current: balance, iso_currency_code: 'USD' },
    balanceDerivedFromPositions: derived,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    getStatusMock.mockResolvedValue({ configured: true, lastVerifiedAt: new Date(), lastError: null });
    findFirstSnapshot.mockResolvedValue({
      accounts: [
        { id: 'snaptrade-f1', source: 'snaptrade', institution: 'Fidelity' },
        snapshotAccount('public-3CR13857', 'Treasury Account', 57046.98, true),
      ],
    });
  });

  it('replaces SnapTrade Public rows with the direct ones', async () => {
    const result = await substituteDirectPublicAccounts('user-1', [
      fidelity,
      publicTreasuryViaSnapTrade,
      publicBrokerageViaSnapTrade,
      fidelity2,
    ]);

    expect(result.supersededAccountIds).toEqual(['snaptrade-p1', 'snaptrade-p2']);
    expect(result.accounts.map(a => a.id)).toEqual(['snaptrade-f1', 'public-3CR13857', 'snaptrade-f2']);

    const treasury = result.accounts.find(a => a.id === 'public-3CR13857')!;
    expect(treasury.balance).toBe(57046.98);
    expect(treasury.source).toBe('public');
    expect(treasury.balanceDerivedFromPositions).toBe(true);
  });

  it('keeps the non-Public accounts untouched and in order', async () => {
    const result = await substituteDirectPublicAccounts('user-1', [fidelity, publicTreasuryViaSnapTrade, fidelity2]);
    expect(result.accounts[0]).toBe(fidelity);
    expect(result.accounts[2]).toBe(fidelity2);
  });

  it('leaves SnapTrade alone when no direct credential is configured', async () => {
    getStatusMock.mockResolvedValue({ configured: false, lastVerifiedAt: null, lastError: null });
    const accounts = [fidelity, publicTreasuryViaSnapTrade];

    const result = await substituteDirectPublicAccounts('user-1', accounts);

    expect(result.accounts).toBe(accounts);
    expect(result.supersededAccountIds).toEqual([]);
  });

  it('leaves SnapTrade alone when the credential exists but has produced no accounts', async () => {
    // A new or rejected secret. Dropping SnapTrade's copies here would leave the
    // user with no Public accounts at all -- worse than the stale balance.
    findFirstSnapshot.mockResolvedValue({ accounts: [] });
    const accounts = [fidelity, publicTreasuryViaSnapTrade];

    const result = await substituteDirectPublicAccounts('user-1', accounts);

    expect(result.accounts).toBe(accounts);
    expect(result.supersededAccountIds).toEqual([]);
  });

  it('shows direct accounts even when the SnapTrade link is gone', async () => {
    const result = await substituteDirectPublicAccounts('user-1', [fidelity]);

    expect(result.supersededAccountIds).toEqual([]);
    expect(result.accounts.map(a => a.id)).toEqual(['snaptrade-f1', 'public-3CR13857']);
  });

  it('carries a null balance through as absent rather than as zero', async () => {
    // High Yield Cash: Public exposes no endpoint that reports its value.
    findFirstSnapshot.mockResolvedValue({
      accounts: [snapshotAccount('public-2OE66869', 'High Yield Cash Account', null)],
    });

    const result = await substituteDirectPublicAccounts('user-1', [publicTreasuryViaSnapTrade]);
    const cash = result.accounts.find(a => a.id === 'public-2OE66869')!;

    expect(cash.balance).toBeNull();
    expect(cash.balance).not.toBe(0);
  });

  it('does not mistake a brokerage merely named like Public for one', async () => {
    const storage = { id: 'snaptrade-s1', name: 'REIT', institution: 'Public Storage REIT', balance: 1000 };
    const result = await substituteDirectPublicAccounts('user-1', [storage]);

    expect(result.supersededAccountIds).toEqual([]);
    expect(result.accounts).toContain(storage);
  });

  it('still shows the direct accounts when SnapTrade has none left', async () => {
    // Every brokerage unlinked from SnapTrade, direct secret kept. The Public
    // accounts are then the only ones there are to show; an empty-list early
    // return would hide them.
    const result = await substituteDirectPublicAccounts('user-1', []);
    expect(result.accounts.map(a => a.id)).toEqual(['public-3CR13857']);
  });

  it('passes a non-array through untouched', async () => {
    const result = await substituteDirectPublicAccounts('user-1', undefined as never);
    expect(result.accounts).toBeUndefined();
    expect(getStatusMock).not.toHaveBeenCalled();
  });
});
