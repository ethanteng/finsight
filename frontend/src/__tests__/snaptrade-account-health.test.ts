/**
 * Brokerage connection health, now that two places render these accounts.
 *
 * Each rule below exists because of a specific way the naive version lied to
 * users, so they are pinned here rather than left to be re-derived.
 */

import {
  snapTradeAccountHealth,
  type SnapTradeConnectionStatus,
} from '../lib/snaptrade-account-health';

const healthy: SnapTradeConnectionStatus = { connected: true, status: 'ACTIVE' };

describe('snapTradeAccountHealth', () => {
  it('reports a working account as healthy', () => {
    const result = snapTradeAccountHealth({ institution: 'Fidelity' }, healthy);

    expect(result).toEqual({ isHealthy: true, issue: null, isDirect: false });
  });

  it('marks only the account whose own authorization is disabled', () => {
    const status: SnapTradeConnectionStatus = {
      connected: true,
      status: 'LOGIN_REQUIRED',
      disabledConnections: [{ authorizationId: 'auth-public', institutionName: 'Public' }],
    };

    const broken = snapTradeAccountHealth(
      { institution: 'Public', brokerageAuthorizationId: 'auth-public' },
      status,
    );
    const fine = snapTradeAccountHealth(
      { institution: 'Fidelity', brokerageAuthorizationId: 'auth-fidelity' },
      status,
    );

    // LOGIN_REQUIRED means *some* authorization is disabled. Reading it off the
    // user status marked every account broken the moment one was.
    expect(broken.isHealthy).toBe(false);
    expect(broken.issue).toContain('Public');
    expect(fine.isHealthy).toBe(true);
    expect(fine.issue).toBeNull();
  });

  it('names the account\'s own brokerage in the issue, not whichever is disabled', () => {
    const result = snapTradeAccountHealth(
      { institution: 'Schwab', connectionDisabled: true },
      { connected: true, status: 'LOGIN_REQUIRED', disabledConnections: [] },
    );

    expect(result.issue).toBe(
      'SnapTrade connection disabled for Schwab. Reconnect to resume updates.',
    );
  });

  it('treats unconfirmed health as unknown rather than broken', () => {
    // `undefined` means SnapTrade could not confirm this authorization, which is
    // not the same as knowing it is disabled.
    const result = snapTradeAccountHealth(
      { institution: 'Fidelity', connectionDisabled: undefined },
      healthy,
    );

    expect(result.isHealthy).toBe(true);
  });

  it('applies a whole-user failure across the board', () => {
    const result = snapTradeAccountHealth(
      { institution: 'Fidelity' },
      { connected: true, status: 'ERROR', error: 'Credentials revoked' },
    );

    expect(result.isHealthy).toBe(false);
    expect(result.issue).toBe('Credentials revoked');
  });

  it('exempts the direct Public feed from SnapTrade\'s health entirely', () => {
    // The direct feed is precisely what still works when the SnapTrade link is
    // down, so applying SnapTrade's health would report it broken exactly when
    // it is the only thing working.
    const result = snapTradeAccountHealth(
      { institution: 'Public', source: 'public', connectionDisabled: true },
      { connected: false, status: 'ERROR', error: 'SnapTrade unreachable' },
    );

    expect(result).toEqual({ isHealthy: true, issue: null, isDirect: true });
  });
});
