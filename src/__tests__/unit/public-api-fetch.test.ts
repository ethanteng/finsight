jest.mock('../../services/public-api/credential-store', () => ({
  readSecret: jest.fn(),
  recordFailure: jest.fn(),
  recordSuccess: jest.fn(),
}));

jest.mock('../../services/public-api/client', () => {
  class PublicApiError extends Error {
    constructor(message: string, public status?: number, public credentialRejected = false) {
      super(message);
    }
  }
  return {
    PublicApiError,
    mintAccessToken: jest.fn(),
    listAccounts: jest.fn(),
    getPortfolio: jest.fn(),
  };
});

import { fetchPublicData } from '../../services/public-api/fetch-public-data';
import { readSecret, recordFailure, recordSuccess } from '../../services/public-api/credential-store';
import {
  PublicApiError,
  getPortfolio,
  listAccounts,
  mintAccessToken,
} from '../../services/public-api/client';

const readSecretMock = readSecret as jest.MockedFunction<typeof readSecret>;
const recordFailureMock = recordFailure as jest.MockedFunction<typeof recordFailure>;
const recordSuccessMock = recordSuccess as jest.MockedFunction<typeof recordSuccess>;
const mintAccessTokenMock = mintAccessToken as jest.MockedFunction<typeof mintAccessToken>;
const listAccountsMock = listAccounts as jest.MockedFunction<typeof listAccounts>;
const getPortfolioMock = getPortfolio as jest.MockedFunction<typeof getPortfolio>;

describe('fetchPublicData observation gating', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    readSecretMock.mockResolvedValue('SECRET');
    mintAccessTokenMock.mockResolvedValue('tok');
    listAccountsMock.mockResolvedValue([]);
    getPortfolioMock.mockResolvedValue({
      accountId: 'a1',
      accountType: 'TREASURY',
      totalAccountValue: 100,
      cash: null,
      positions: [],
    });
  });

  it('returns null when no secret is configured', async () => {
    readSecretMock.mockResolvedValue(null);
    await expect(fetchPublicData('user-1')).resolves.toBeNull();
    expect(mintAccessTokenMock).not.toHaveBeenCalled();
  });

  // A rejected secret must not look like "Public reported no accounts", or the
  // merge layer would suppress SnapTrade's still-working Public brokerage.
  it('marks observed:false when Public rejects the secret', async () => {
    mintAccessTokenMock.mockRejectedValue(new PublicApiError('rejected', 401, true));

    const result = await fetchPublicData('user-1');

    expect(result).toMatchObject({
      accounts: [],
      holdings: [],
      observed: false,
      credentialRejected: true,
    });
    expect(recordFailureMock).toHaveBeenCalled();
    expect(recordSuccessMock).not.toHaveBeenCalled();
  });

  it('marks observed:false when listing accounts fails', async () => {
    listAccountsMock.mockRejectedValue(new PublicApiError('unwell', 500, false));

    const result = await fetchPublicData('user-1');

    expect(result).toMatchObject({ observed: false, credentialRejected: false, accounts: [] });
    expect(recordSuccessMock).not.toHaveBeenCalled();
  });

  it('marks observed:true for a legitimate empty account list', async () => {
    listAccountsMock.mockResolvedValue([]);

    const result = await fetchPublicData('user-1');

    expect(result).toMatchObject({ observed: true, accounts: [], holdings: [], errors: [] });
    expect(recordSuccessMock).toHaveBeenCalledWith('user-1');
  });

  // After SnapTrade Public rows are dropped, a failed portfolio must still leave
  // an account row with a null balance so the snapshot can mark it unavailable.
  it('stubs a null-balance account when a portfolio read fails', async () => {
    listAccountsMock.mockResolvedValue([
      { accountId: 'ok', accountType: 'BROKERAGE' },
      { accountId: 'bad', accountType: 'TREASURY' },
    ]);
    getPortfolioMock
      .mockResolvedValueOnce({
        accountId: 'ok',
        accountType: 'BROKERAGE',
        totalAccountValue: 10,
        cash: null,
        positions: [],
      })
      .mockRejectedValueOnce(new PublicApiError('portfolio failed', 500));

    const result = await fetchPublicData('user-1');

    expect(result?.observed).toBe(true);
    expect(result?.errors).toEqual([{ accountId: 'bad', error: 'portfolio failed' }]);
    expect(result?.accounts).toEqual(expect.arrayContaining([
      expect.objectContaining({ account_id: 'public-ok', balance: expect.objectContaining({ current: 10 }) }),
      expect.objectContaining({
        account_id: 'public-bad',
        balance: { current: null, iso_currency_code: 'USD' },
      }),
    ]));
  });

  // Same class of failure as auth/list: suppressing on a total portfolio outage
  // would wipe SnapTrade's working Public brokerage for a brief Public blip.
  it('marks observed:false when every portfolio read fails', async () => {
    listAccountsMock.mockResolvedValue([
      { accountId: 'a', accountType: 'BROKERAGE' },
      { accountId: 'b', accountType: 'TREASURY' },
    ]);
    getPortfolioMock.mockRejectedValue(new PublicApiError('portfolio failed', 500));

    const result = await fetchPublicData('user-1');

    expect(result).toMatchObject({
      observed: false,
      accounts: [],
      holdings: [],
      errors: [],
      credentialRejected: false,
    });
    expect(recordSuccessMock).not.toHaveBeenCalled();
    expect(recordFailureMock).not.toHaveBeenCalled();
  });

});
