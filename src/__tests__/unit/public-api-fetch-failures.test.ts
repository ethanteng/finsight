import { PublicApiError } from '../../services/public-api/client';

const readSecret = jest.fn();
const recordFailure = jest.fn();
const recordSuccess = jest.fn();
const mintAccessToken = jest.fn();
const listAccounts = jest.fn();
const getPortfolio = jest.fn();
const getTaxLotHoldings = jest.fn();

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
    getTaxLotHoldings: (...args: any[]) => getTaxLotHoldings(...args),
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

  // portfolio/v2 404s for Public's managed-yield accounts while tax lots serve
  // them normally. Verified live against TREASURY and BOND_ACCOUNT.
  it('falls back to tax lots when the portfolio endpoint 404s', async () => {
    mintAccessToken.mockResolvedValue('tok');
    listAccounts.mockResolvedValue([{ accountId: '3CR23334', accountType: 'TREASURY' }]);
    getPortfolio.mockRejectedValue(new PublicApiError('gone', 404, false));
    getTaxLotHoldings.mockResolvedValue({
      accountId: '3CR23334', asOf: '2026-08-21', totalValue: 227261.16,
      positions: [{ symbol: 'TBILL', name: 'T-Bill', instrumentType: null, quantity: 10, currentValue: 227261.16, lastPrice: 99.83 }],
    });

    const result = await fetchPublicData('user-1');

    expect(getTaxLotHoldings).toHaveBeenCalledWith('tok', '3CR23334');
    expect(result!.accounts[0].balance.current).toBe(227261.16);
    expect(result!.accounts[0].valuedFromTaxLots).toBe(true);
    expect(result!.errors).toEqual([]);
    expect(result!.observed).toBe(true);
  });

  // A 500 means Public is briefly unwell. Switching to a derived figure and
  // serving it as though nothing were wrong would hide a real outage.
  it('does not fall back to tax lots on a non-404 failure', async () => {
    mintAccessToken.mockResolvedValue('tok');
    listAccounts.mockResolvedValue([{ accountId: '3CR23334', accountType: 'TREASURY' }]);
    getPortfolio.mockRejectedValue(new PublicApiError('unwell', 500, false));

    const result = await fetchPublicData('user-1');

    expect(getTaxLotHoldings).not.toHaveBeenCalled();
    expect(result!.observed).toBe(false);
  });

  // HIGH_YIELD is a pure cash product: tax lots return, but empty. Its value is
  // unknown, and the account must read as unavailable rather than zero. An empty
  // fallback must also count as a failed read so a HIGH_YIELD-only pass does not
  // claim observation and wipe SnapTrade.
  it('leaves a cash account unvalued when its tax lots are empty', async () => {
    mintAccessToken.mockResolvedValue('tok');
    listAccounts.mockResolvedValue([
      { accountId: '5OQ83585', accountType: 'BROKERAGE' },
      { accountId: '2OE66869', accountType: 'HIGH_YIELD' },
    ]);
    getPortfolio
      .mockResolvedValueOnce({ accountId: '5OQ83585', accountType: 'BROKERAGE', totalAccountValue: 426952.15, cash: 0, positions: [] })
      .mockRejectedValueOnce(new PublicApiError('gone', 404, false));
    getTaxLotHoldings.mockResolvedValue({ accountId: '2OE66869', asOf: '2026-08-21', totalValue: null, positions: [] });

    const result = await fetchPublicData('user-1');

    const highYield = result!.accounts.find(a => a.account_id === 'public-2OE66869')!;
    expect(highYield.balance.current).toBeNull();
    expect(result!.errors).toEqual([
      expect.objectContaining({ accountId: '2OE66869' }),
    ]);
    // Valued from a balance, not positions -- no holdings may be emitted for it.
    expect(result!.holdings).toEqual([]);
    expect(result!.observed).toBe(true);
  });

  // Same wipe the all-portfolio-failed gate exists to prevent: empty tax-lot
  // fallbacks must not masquerade as successful observations.
  it('does not claim observation when every 404 fallback has empty tax lots', async () => {
    mintAccessToken.mockResolvedValue('tok');
    listAccounts.mockResolvedValue([
      { accountId: '2OE66869', accountType: 'HIGH_YIELD' },
      { accountId: '3CR23334', accountType: 'TREASURY' },
    ]);
    getPortfolio.mockRejectedValue(new PublicApiError('gone', 404, false));
    getTaxLotHoldings.mockResolvedValue({ accountId: 'x', asOf: '2026-08-21', totalValue: null, positions: [] });

    const result = await fetchPublicData('user-1');

    expect(result).toMatchObject({ observed: false, accounts: [], errors: [] });
    expect(recordSuccess).not.toHaveBeenCalled();
  });

  it('returns null when the user has no secret', async () => {
    readSecret.mockResolvedValue(null);

    await expect(fetchPublicData('user-1')).resolves.toBeNull();
  });
});
