import { describe, expect, it, jest, beforeEach } from '@jest/globals';

const getUserAccounts = jest.fn<(...args: any[]) => Promise<any>>();
const findUnique = jest.fn<(...args: any[]) => Promise<any>>();

jest.mock('../../snaptrade', () => ({
  SnapTradeService: jest.fn().mockImplementation(() => ({ getUserAccounts })),
}));
jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn().mockImplementation(() => ({ snapTradeUser: { findUnique } })),
}));

import { TokenValidationService, TokenStatus } from '../../services/token-validation-service';

const account = (overrides: Record<string, unknown> = {}) => ({
  id: 'acct-1',
  institution: 'Public',
  brokerageAuthorizationId: 'auth-1',
  ...overrides,
});

describe('SnapTrade connection health', () => {
  let service: TokenValidationService;

  beforeEach(() => {
    jest.clearAllMocks();
    findUnique.mockResolvedValue({ userId: 'user-1', userSecret: 'secret' });
    service = new TokenValidationService();
  });

  it('reports a healthy connection as valid', async () => {
    getUserAccounts.mockResolvedValue({ success: true, data: { accounts: [account({ connectionDisabled: false })] } });

    await expect(service.validateSnapTradeToken('user-1')).resolves.toMatchObject({
      status: TokenStatus.VALID,
    });
  });

  // getUserAccounts succeeds for a disabled authorization -- it still lists the
  // accounts and their last cached balances. Reading only `success` reported
  // the connection healthy while its figures quietly aged, which is why a
  // frozen account showed no re-authentication prompt anywhere in the product.
  it('reports a disabled connection as needing re-authentication', async () => {
    getUserAccounts.mockResolvedValue({ success: true, data: { accounts: [account({ connectionDisabled: true })] } });

    const health = await service.validateSnapTradeToken('user-1');

    expect(health.status).toBe(TokenStatus.LOGIN_REQUIRED);
    expect(health.error).toContain('Reconnect to resume updates');
    expect(health.reconnectAuthorizationIds).toEqual(['auth-1']);
    expect(health.disabledConnections).toEqual([
      { authorizationId: 'auth-1', institutionName: 'Public' },
    ]);
    // The summary string must stay institution-agnostic: it describes the whole
    // SnapTrade user, and a UI showing it beside an account would otherwise name
    // the wrong brokerage.
    expect(health.error).not.toContain('Public');
  });

  // Unknown health is not actionable: there is nothing the user can do about a
  // failed authorization lookup, and this codebase only flags a connection once
  // it can offer a repair. Flagging it would be noise on every SnapTrade blip.
  it('does not prompt when connection health is merely unverifiable', async () => {
    getUserAccounts.mockResolvedValue({
      success: true,
      data: { accounts: [account({ connectionDisabled: undefined, connectionStatusUnavailable: true })] },
    });

    await expect(service.validateSnapTradeToken('user-1')).resolves.toMatchObject({
      status: TokenStatus.VALID,
    });
  });

  it('keeps the summary institution-agnostic and omits a reconnect id when none is known', async () => {
    getUserAccounts.mockResolvedValue({
      success: true,
      data: {
        accounts: [
          account({ connectionDisabled: true, institution: 'Public', brokerageAuthorizationId: undefined }),
          account({ id: 'acct-2', connectionDisabled: true, institution: 'Fidelity', brokerageAuthorizationId: undefined }),
        ],
      },
    });

    const health = await service.validateSnapTradeToken('user-1');

    expect(health.error).not.toContain('Public');
    expect(health.error).not.toContain('Fidelity');
    expect(health.reconnectAuthorizationIds).toBeUndefined();
  });

  // One trip through the portal repairs one authorization, so every disabled
  // id has to be reachable -- returning only the first left a user who named
  // two broken brokerages able to fix just one of them.
  it('returns every distinct disabled authorization', async () => {
    getUserAccounts.mockResolvedValue({
      success: true,
      data: {
        accounts: [
          account({ connectionDisabled: true, brokerageAuthorizationId: 'auth-1' }),
          account({ id: 'acct-2', connectionDisabled: true, brokerageAuthorizationId: 'auth-2' }),
          // Same authorization backing a second account must not be listed twice.
          account({ id: 'acct-3', connectionDisabled: true, brokerageAuthorizationId: 'auth-1' }),
        ],
      },
    });

    const health = await service.validateSnapTradeToken('user-1');

    expect(health.reconnectAuthorizationIds).toEqual(['auth-1', 'auth-2']);
    // Attribution is per brokerage, so a caller can mark only the accounts
    // behind a disabled connection rather than every account on the user.
    expect(health.disabledConnections).toEqual([
      { authorizationId: 'auth-1', institutionName: 'Public' },
      { authorizationId: 'auth-2', institutionName: 'Public' },
    ]);
  });

  it('still reports an outright failure as an error', async () => {
    getUserAccounts.mockResolvedValue({ success: false, error: 'SnapTrade unreachable' });

    await expect(service.validateSnapTradeToken('user-1')).resolves.toMatchObject({
      status: TokenStatus.ERROR,
    });
  });
});
