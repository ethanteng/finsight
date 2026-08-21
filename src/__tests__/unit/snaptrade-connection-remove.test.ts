import { SnapTradeService } from '../../snaptrade';

function client(remove: jest.Mock) {
  return {
    apiStatus: { check: jest.fn() },
    authentication: {},
    connections: {
      listBrokerageAuthorizations: jest.fn().mockResolvedValue({ data: [] }),
      removeBrokerageAuthorization: remove,
    },
    accountInformation: {
      listUserAccounts: jest.fn().mockResolvedValue({ data: [] }),
      getUserHoldings: jest.fn(),
      getAccountActivities: jest.fn(),
    },
  } as any;
}

function providerError(status: number, message = 'request failed') {
  return Object.assign(new Error(`${message} (${status})`), { status });
}

describe('SnapTrade single-connection removal', () => {
  it('removes only the named authorization', async () => {
    const remove = jest.fn().mockResolvedValue({ data: undefined });
    const service = new SnapTradeService(client(remove));

    await expect(service.removeConnection('user-1', 'secret', 'auth-1')).resolves.toEqual({ success: true });
    expect(remove).toHaveBeenCalledWith({
      authorizationId: 'auth-1',
      userId: 'user-1',
      userSecret: 'secret',
    });
  });

  // The caller's goal is that the authorization no longer exists. One already
  // gone satisfies that, and reporting it as a failure would block the local
  // cleanup from ever running -- leaving rows for a connection that is not there.
  it('treats an already-removed authorization as success', async () => {
    const remove = jest.fn().mockRejectedValue(providerError(404, 'not found'));
    const service = new SnapTradeService(client(remove));

    await expect(service.removeConnection('user-1', 'secret', 'auth-1')).resolves.toEqual({
      success: true,
      alreadyRemoved: true,
    });
  });

  it('reports expired credentials as a reconnect', async () => {
    const remove = jest.fn().mockRejectedValue(providerError(401));
    const service = new SnapTradeService(client(remove));

    const result = await service.removeConnection('user-1', 'secret', 'auth-1');

    expect(result.success).toBe(false);
    expect(result.status).toBe(401);
    expect(result.error).toContain('reconnect');
  });

  // This destroys a connection, so it must reach the provider exactly once even
  // when the provider is briefly unwell.
  it('does not retry a failed removal', async () => {
    const remove = jest.fn().mockRejectedValue(providerError(503));
    const service = new SnapTradeService(client(remove));

    const result = await service.removeConnection('user-1', 'secret', 'auth-1');

    expect(result.success).toBe(false);
    expect(remove).toHaveBeenCalledTimes(1);
  });

  it('does not relay the provider message to the user', async () => {
    const remove = jest.fn().mockRejectedValue(
      providerError(500, 'DELETE https://api.snaptrade.com/internal/auth-1')
    );
    const service = new SnapTradeService(client(remove));

    const result = await service.removeConnection('user-1', 'secret', 'auth-1');

    expect(result.error).not.toContain('snaptrade.com');
    expect(result.error).toContain('Could not disconnect this institution');
  });
});
