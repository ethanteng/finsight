import { SnapTradeService } from '../../snaptrade';

function client(refresh: jest.Mock) {
  return {
    apiStatus: { check: jest.fn() },
    authentication: {},
    connections: {
      listBrokerageAuthorizations: jest.fn().mockResolvedValue({ data: [] }),
      refreshBrokerageAuthorization: refresh,
    },
    accountInformation: {
      listUserAccounts: jest.fn().mockResolvedValue({ data: [] }),
      getUserHoldings: jest.fn(),
      getAccountActivities: jest.fn(),
    },
  } as any;
}

function providerError(status: number) {
  return Object.assign(new Error(`request failed with status ${status}`), { status });
}

describe('SnapTrade manual connection refresh', () => {
  it('asks the provider to re-sync the named authorization', async () => {
    const refresh = jest.fn().mockResolvedValue({ data: { detail: 'Refresh scheduled' } });
    const service = new SnapTradeService(client(refresh));

    await expect(service.refreshConnection('user-1', 'secret', 'auth-1')).resolves.toEqual({
      success: true,
      data: { detail: 'Refresh scheduled' },
    });
    expect(refresh).toHaveBeenCalledWith({
      authorizationId: 'auth-1',
      userId: 'user-1',
      userSecret: 'secret',
    });
  });

  // The retry policy is documented for idempotent reads. Retrying a metered
  // mutation on a 429 spends the user's refresh allowance to answer a rate limit,
  // so this call must reach the provider exactly once.
  it.each([425, 429])('does not retry a rate-limited refresh (status %i)', async status => {
    const refresh = jest.fn().mockRejectedValue(providerError(status));
    const service = new SnapTradeService(client(refresh));

    const result = await service.refreshConnection('user-1', 'secret', 'auth-1');

    expect(result.success).toBe(false);
    expect(result.status).toBe(status);
    expect(result.error).toContain('refreshed recently');
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('reports expired credentials as a reconnect, not a failed refresh', async () => {
    const refresh = jest.fn().mockRejectedValue(providerError(401));
    const service = new SnapTradeService(client(refresh));

    const result = await service.refreshConnection('user-1', 'secret', 'auth-1');

    expect(result.success).toBe(false);
    expect(result.status).toBe(401);
    expect(result.error).toContain('reconnect');
  });

  // The provider's message reaches the user verbatim from here, and it can name
  // internal endpoints and ids, so an unexpected failure gets our own wording.
  it('surfaces an unexpected provider failure without repeating the provider message', async () => {
    const refresh = jest.fn().mockRejectedValue(
      Object.assign(new Error('POST https://api.snaptrade.com/internal/auth-1 failed'), { status: 500 })
    );
    const service = new SnapTradeService(client(refresh));

    const result = await service.refreshConnection('user-1', 'secret', 'auth-1');

    expect(result.success).toBe(false);
    expect(result.status).toBe(500);
    expect(result.error).not.toContain('snaptrade.com');
    expect(result.error).toContain('Could not request a refresh');
  });
});
