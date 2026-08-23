const findManyAccount = jest.fn();
const findManyAccessToken = jest.fn();

jest.mock('../../prisma-client', () => ({
  getPrismaClient: () => ({
    account: { findMany: findManyAccount },
    accessToken: { findMany: findManyAccessToken },
    financialSummarySnapshot: { findUnique: jest.fn().mockResolvedValue(null) },
  }),
}));

import { loadPersistedPlaidData } from '../../services/financial-source-persistence';

/**
 * Everything this loader returns is stamped `source: 'plaid'`, and the Account
 * table has no source column to contradict it. So a row from another provider
 * does not merely duplicate that provider's own fetch — it is *relabelled* as a
 * Plaid account.
 *
 * That is how direct Public.com accounts reached "Your Connected Accounts
 * (Plaid)" even after the route learned to filter on the source tag: by the time
 * the filter saw them, the tag already said 'plaid'.
 */
describe('loadPersistedPlaidData provider scope', () => {
  const row = (plaidAccountId: string, name: string) => ({
    id: `db-${plaidAccountId}`,
    plaidAccountId,
    name,
    type: 'investment',
    subtype: 'brokerage',
    currentBalance: 100,
    availableBalance: null,
    limit: null,
    currency: 'USD',
    institution: 'Somewhere',
    accessTokenId: null,
    persistentAccountId: null,
    lastSynced: new Date('2026-08-23T00:45:00Z'),
    balanceLastFetched: null,
    updatedAt: new Date('2026-08-23T00:45:00Z'),
    transactions: [],
  });

  beforeEach(() => {
    jest.clearAllMocks();
    findManyAccessToken.mockResolvedValue([]);
  });

  const load = () =>
    loadPersistedPlaidData('user-1', { includeTransactions: false, includeInvestments: false });

  it('does not return direct Public.com accounts as Plaid accounts', async () => {
    findManyAccount.mockResolvedValue([
      row('plaid-native-id-abc', 'Real Checking'),
      row('public-5OQ83585', 'Brokerage Account'),
      row('public-3CR23334', 'Treasury Account'),
    ]);

    const result = await load();
    const ids = result!.data.accounts.map((a: any) => a.account_id);

    expect(ids).toEqual(['plaid-native-id-abc']);
    expect(result!.data.accounts.every((a: any) => a.source === 'plaid')).toBe(true);
  });

  it('still excludes SnapTrade and manual rows', async () => {
    findManyAccount.mockResolvedValue([
      row('plaid-native-id-abc', 'Real Checking'),
      row('snaptrade-9f2', 'Brokerage'),
      row('manual-17', 'Cash under the mattress'),
    ]);

    const ids = (await load())!.data.accounts.map((a: any) => a.account_id);
    expect(ids).toEqual(['plaid-native-id-abc']);
  });

  it('returns null rather than an empty Plaid payload when every row is non-Plaid', async () => {
    // A user whose only connections are Public and SnapTrade has no persisted
    // Plaid data at all; saying so lets the caller fall through to a live fetch
    // instead of treating an empty list as a successful read.
    findManyAccount.mockResolvedValue([row('public-5OQ83585', 'Brokerage Account')]);

    expect(await load()).toBeNull();
  });

  it('keeps genuine Plaid accounts whose ids merely contain a namespace word', async () => {
    findManyAccount.mockResolvedValue([row('acct-public-storage-reit', 'Public Storage REIT')]);

    const ids = (await load())!.data.accounts.map((a: any) => a.account_id);
    expect(ids).toEqual(['acct-public-storage-reit']);
  });
});
