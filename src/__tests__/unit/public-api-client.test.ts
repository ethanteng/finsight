import {
  PublicApiError,
  getPortfolio,
  listAccounts,
  mintAccessToken,
} from '../../services/public-api/client';

const fetchMock = jest.fn();
(global as any).fetch = fetchMock;

function ok(body: unknown) {
  return { ok: true, status: 200, json: async () => body } as any;
}
function fail(status: number) {
  return { ok: false, status, json: async () => ({}) } as any;
}

describe('Public API client', () => {
  beforeEach(() => jest.clearAllMocks());

  it('mints a short-lived token and never puts the secret in the URL', async () => {
    fetchMock.mockResolvedValue(ok({ accessToken: 'tok-1' }));

    await expect(mintAccessToken('SECRET-VALUE')).resolves.toBe('tok-1');

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.public.com/userapiauthservice/personal/access-tokens');
    expect(url).not.toContain('SECRET-VALUE');
    expect(JSON.parse(init.body)).toEqual({ validityInMinutes: 5, secret: 'SECRET-VALUE' });
  });

  // A rejected secret cannot be fixed by retrying, and the user has to supply a
  // new one -- distinct from Public being briefly unwell.
  it.each([401, 403])('flags a %s as the credential being rejected', async status => {
    fetchMock.mockResolvedValue(fail(status));

    await expect(mintAccessToken('bad')).rejects.toMatchObject({
      credentialRejected: true,
    });
  });

  it('does not treat a server error as a rejected credential', async () => {
    fetchMock.mockResolvedValue(fail(500));

    await expect(mintAccessToken('good')).rejects.toMatchObject({ credentialRejected: false });
  });

  // The token request body carries the secret, so a relayed provider message or
  // stack could put it in a log line or an API response.
  it('never relays the provider message or the secret on failure', async () => {
    fetchMock.mockRejectedValue(new Error('POST https://api.public.com/... failed for SECRET-VALUE'));

    const error = await mintAccessToken('SECRET-VALUE').catch(caught => caught);

    expect(error).toBeInstanceOf(PublicApiError);
    expect(error.message).not.toContain('SECRET-VALUE');
    expect(error.message).not.toContain('api.public.com');
  });

  it('sends the token as a bearer header on reads', async () => {
    fetchMock.mockResolvedValue(ok({ accounts: [{ accountId: 'a1', accountType: 'TREASURY' }] }));

    await listAccounts('tok-1');

    expect(fetchMock.mock.calls[0][1].headers).toEqual({ Authorization: 'Bearer tok-1' });
  });

  it('reads the account list and drops rows with no id', async () => {
    fetchMock.mockResolvedValue(ok({
      accounts: [
        { accountId: 'a1', accountType: 'BROKERAGE' },
        { accountType: 'TREASURY' },
      ],
    }));

    await expect(listAccounts('tok')).resolves.toEqual([
      { accountId: 'a1', accountType: 'BROKERAGE' },
    ]);
  });

  it('parses a portfolio, coercing stringified decimals', async () => {
    fetchMock.mockResolvedValue(ok({
      accountId: 'a1',
      accountType: 'TREASURY',
      totalAccountValue: '227261.16',
      cash: '0',
      positions: [{
        instrument: { symbol: 'T-BILL', name: 'Treasury Bill', type: 'BOND' },
        quantity: '10',
        currentValue: '227261.16',
        lastPrice: { lastPrice: '99.83' },
      }],
    }));

    const portfolio = await getPortfolio('tok', 'a1');

    expect(portfolio.totalAccountValue).toBe(227261.16);
    expect(portfolio.cash).toBe(0);
    expect(portfolio.positions[0]).toEqual({
      symbol: 'T-BILL',
      name: 'Treasury Bill',
      instrumentType: 'BOND',
      quantity: 10,
      currentValue: 227261.16,
      lastPrice: 99.83,
    });
  });

  // A missing value must stay null. Coercing it to 0 would publish a confident
  // zero balance for an account we simply could not read -- the same class of
  // error as the SnapTrade path this integration works around.
  it('keeps an absent value null rather than zero', async () => {
    fetchMock.mockResolvedValue(ok({ accountId: 'a1', accountType: 'HIGH_YIELD', positions: [] }));

    const portfolio = await getPortfolio('tok', 'a1');

    expect(portfolio.totalAccountValue).toBeNull();
    expect(portfolio.cash).toBeNull();
  });

  it('escapes the account id in the portfolio path', async () => {
    fetchMock.mockResolvedValue(ok({ accountId: 'a/1', positions: [] }));

    await getPortfolio('tok', 'a/1');

    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://api.public.com/userapigateway/trading/a%2F1/portfolio/v2',
    );
  });
});
