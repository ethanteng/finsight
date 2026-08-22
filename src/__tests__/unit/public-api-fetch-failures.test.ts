import { PublicApiError } from '../../services/public-api/client';

const readSecret = jest.fn();
const recordFailure = jest.fn();
const recordSuccess = jest.fn();
const mintAccessToken = jest.fn();
const listAccounts = jest.fn();
const getPortfolio = jest.fn();

jest.mock('../../services/public-api/credential-store', () => ({
  readSecret: (...args: any[]) => readSecret(...args),
  recordFailure: (...args: any[]) => recordFailure(...args),
  recordSuccess: (...args: any[]) => recordSuccess(...args),
}));
jest.mock('../../services/public-api/client', () => {
  const actual = jest.requireActual('../../services/public-api/client');
  return {
    ...actual,
    mintAccessToken: (...args: any[]) => mintAccessToken(...args),
    listAccounts: (...args: any[]) => listAccounts(...args),
    getPortfolio: (...args: any[]) => getPortfolio(...args),
  };
});

import { fetchPublicData } from '../../services/public-api/fetch-public-data';

/**
 * `lastError` is what makes the profile panel offer to replace the key, so it
 * must mean "the credential is bad" and nothing else. A brief Public outage says
 * nothing about the stored secret, and inviting a rotation after one would have
 * a user revoke a working key to fix a problem it did not cause.
 */
describe('Public fetch failure handling', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    readSecret.mockResolvedValue('SECRET');
  });

  it('flags the credential when Public rejects it', async () => {
    mintAccessToken.mockRejectedValue(new PublicApiError('rejected', 401, true));

    const result = await fetchPublicData('user-1');

    expect(result).toMatchObject({ credentialRejected: true, observed: false });
    expect(recordFailure).toHaveBeenCalled();
  });

  it.each([
    ['authenticating', () => mintAccessToken.mockRejectedValue(new PublicApiError('unwell', 500, false))],
    ['listing accounts', () => {
      mintAccessToken.mockResolvedValue('tok');
      listAccounts.mockRejectedValue(new PublicApiError('unwell', 503, false));
    }],
  ])('does not flag the credential for a transient failure while %s', async (_context, arrange) => {
    arrange();

    const result = await fetchPublicData('user-1');

    expect(result).toMatchObject({ credentialRejected: false, observed: false });
    expect(recordFailure).not.toHaveBeenCalled();
  });

  // Same wipe the auth-failure gate exists to prevent, one step later.
  it('does not claim observation when every portfolio read failed', async () => {
    mintAccessToken.mockResolvedValue('tok');
    listAccounts.mockResolvedValue([
      { accountId: 'a1', accountType: 'BROKERAGE' },
      { accountId: 'a2', accountType: 'TREASURY' },
    ]);
    getPortfolio.mockRejectedValue(new PublicApiError('unwell', 500, false));

    const result = await fetchPublicData('user-1');

    expect(result).toMatchObject({ observed: false, accounts: [], errors: [] });
    expect(recordSuccess).not.toHaveBeenCalled();
  });

  it('observes a partial pass and keeps the failed account as an unavailable stub', async () => {
    mintAccessToken.mockResolvedValue('tok');
    listAccounts.mockResolvedValue([
      { accountId: 'a1', accountType: 'BROKERAGE' },
      { accountId: 'a2', accountType: 'TREASURY' },
    ]);
    getPortfolio
      .mockResolvedValueOnce({ accountId: 'a1', accountType: 'BROKERAGE', totalAccountValue: 100, cash: 0, positions: [] })
      .mockRejectedValueOnce(new PublicApiError('unwell', 500, false));

    const result = await fetchPublicData('user-1');

    expect(result!.observed).toBe(true);
    expect(result!.accounts).toHaveLength(2);
    expect(result!.accounts.find(a => a.account_id === 'public-a2')!.balance.current).toBeNull();
    expect(recordSuccess).toHaveBeenCalled();
  });

  // High Yield is valued from its balance and counted in totalCash; mapping its
  // positions as holdings would add the same dollars to investments.
  it('omits holdings for cash-typed accounts', async () => {
    mintAccessToken.mockResolvedValue('tok');
    listAccounts.mockResolvedValue([{ accountId: 'a1', accountType: 'HIGH_YIELD' }]);
    getPortfolio.mockResolvedValue({
      accountId: 'a1',
      accountType: 'HIGH_YIELD',
      totalAccountValue: 40523,
      cash: 40523,
      positions: [{ symbol: 'MMF', name: 'Money Market', instrumentType: 'FUND', quantity: 1, currentValue: 40523, lastPrice: 1 }],
    });

    const result = await fetchPublicData('user-1');

    expect(result!.accounts[0].balance.current).toBe(40523);
    expect(result!.holdings).toEqual([]);
  });

  it('returns null when the user has no secret', async () => {
    readSecret.mockResolvedValue(null);

    await expect(fetchPublicData('user-1')).resolves.toBeNull();
  });
});
