import { SnapTradeService } from '../../snaptrade';

function client(overrides: Record<string, unknown> = {}) {
  return {
    apiStatus: { check: jest.fn() },
    authentication: {},
    connections: {
      listBrokerageAuthorizations: jest.fn().mockResolvedValue({ data: [] }),
    },
    accountInformation: {
      listUserAccounts: jest.fn().mockResolvedValue({ data: [] }),
      getUserHoldings: jest.fn(),
      getAccountActivities: jest.fn(),
    },
    ...overrides,
  } as any;
}

describe('SnapTrade provider retrieval', () => {
  it('uses account listing and retains connection/sync freshness', async () => {
    const fake = client();
    fake.accountInformation.listUserAccounts.mockResolvedValue({
      data: [{
        id: 'account-1',
        brokerage_authorization: 'connection-1',
        name: 'Roth IRA',
        raw_type: 'ROTH IRA',
        number: '1234',
        institution_name: 'Broker',
        balance: { total: { amount: 12500, currency: 'USD' } },
        sync_status: {
          holdings: { initial_sync_completed: true, last_successful_sync: '2026-08-17T20:00:00Z' },
          transactions: { initial_sync_completed: true, last_successful_sync: '2026-08-17' },
        },
      }],
    });
    fake.connections.listBrokerageAuthorizations.mockResolvedValue({
      data: [{ id: 'connection-1', disabled: true, disabled_date: '2026-08-18T00:00:00Z', data_freshness_mode: 'delayed' }],
    });

    const result = await new SnapTradeService(fake).getUserAccounts('user', 'secret');

    expect(result.success).toBe(true);
    expect(result.data.accounts).toEqual([expect.objectContaining({
      id: 'account-1',
      balance: 12500,
      type: 'investment',
      subtype: 'ira',
      lastSuccessfulHoldingsSync: '2026-08-17T20:00:00Z',
      lastSuccessfulTransactionsSync: '2026-08-17',
      connectionDisabled: true,
      dataFreshnessMode: 'delayed',
    })]);
    expect(fake.accountInformation.getAllUserHoldings).toBeUndefined();
  });

  it('fetches account-specific holdings using prefetched accounts', async () => {
    const fake = client();
    fake.accountInformation.getUserHoldings
      .mockResolvedValueOnce({ data: { positions: [{ units: 1 }], balances: [] } })
      .mockResolvedValueOnce({ data: { positions: [{ units: 2 }], balances: [] } });
    const accountsResult = {
      success: true,
      data: { accounts: [
        { id: 'one', name: 'One', accountNumber: '1', syncStatus: { holdings: { last_successful_sync: '2026-08-17' } } },
        { id: 'two', name: 'Two', accountNumber: '2', syncStatus: { holdings: { last_successful_sync: '2026-08-18' } } },
      ] },
    };

    const result = await new SnapTradeService(fake).getUserHoldings('user', 'secret', accountsResult);

    expect(result.success).toBe(true);
    expect(result.data).toHaveLength(2);
    expect(fake.accountInformation.listUserAccounts).not.toHaveBeenCalled();
    expect(fake.accountInformation.getUserHoldings.mock.calls.map(([request]: any[]) => request.accountId))
      .toEqual(['one', 'two']);
    expect(result.data[0].account.sync_status.holdings.last_successful_sync).toBe('2026-08-17');
  });

  it('paginates all activity types without an exclusionary type filter', async () => {
    const fake = client();
    fake.accountInformation.getAccountActivities
      .mockResolvedValueOnce({
        data: {
          data: [{ id: 'a', type: 'TRANSFER' }, { id: 'b', type: 'SPLIT' }],
          pagination: { offset: 0, limit: 1000, total: 3 },
        },
      })
      .mockResolvedValueOnce({
        data: {
          data: [{ id: 'c', type: 'STOCK_DIVIDEND' }],
          pagination: { offset: 2, limit: 1000, total: 3 },
        },
      });
    const accountsResult = {
      success: true,
      data: { accounts: [{ id: 'account-1', name: 'Brokerage', accountNumber: '123', institution: 'Broker' }] },
    };

    const result = await new SnapTradeService(fake).getUserActivities('user', 'secret', accountsResult);

    expect(result.success).toBe(true);
    expect(result.data.activities.map((activity: any) => activity.type)).toEqual(['TRANSFER', 'SPLIT', 'STOCK_DIVIDEND']);
    expect(fake.accountInformation.getAccountActivities.mock.calls.map(([request]: any[]) => request.offset))
      .toEqual([0, 2]);
    expect(fake.accountInformation.getAccountActivities.mock.calls.every(([request]: any[]) => request.type === undefined))
      .toBe(true);
  });
});
