import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import SnapTradeButton from '../components/SnapTradeButton';

jest.mock('snaptrade-react', () => ({ SnapTradeReact: () => null }));
jest.mock('snaptrade-react/hooks/useWindowMessage', () => ({ useWindowMessage: jest.fn() }));

const localStorageMock = {
  getItem: jest.fn(() => 'mock-auth-token'),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
  length: 0,
  key: jest.fn(),
};

beforeAll(() => {
  process.env.NEXT_PUBLIC_API_URL = 'http://localhost:3000';
  Object.defineProperty(window, 'localStorage', { value: localStorageMock, writable: true });
});

// Two brokerages, one disabled. This is the reported bug: a user who needed to
// reconnect only Public saw the same warning on their Fidelity accounts, each
// naming Public, because health came from the single SnapTrade user status.
function mockAccounts() {
  global.fetch = jest.fn((url: RequestInfo | URL) => {
    const href = typeof url === 'string' ? url : '';
    // The accounts fetch is gated on the component's own registration lookup,
    // which is a different endpoint from the health status passed in as a prop.
    if (href.endsWith('/snaptrade/status/user')) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ status: 'registered' }),
      });
    }
    if (href.endsWith('/snaptrade/accounts')) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            accounts: [
              {
                id: 'snaptrade-1',
                name: 'Treasury Account',
                type: 'investment',
                subtype: 'treasury',
                institution: 'Public',
                balance: 52439.45,
                connectionDisabled: true,
                brokerageAuthorizationId: 'auth-public',
              },
              {
                id: 'snaptrade-2',
                name: 'First Citizens 401K',
                type: 'investment',
                subtype: '401k',
                institution: 'Fidelity',
                balance: 188369.69,
                connectionDisabled: false,
                brokerageAuthorizationId: 'auth-fidelity',
              },
            ],
          },
        }),
      });
    }
    return Promise.resolve({ ok: true, status: 200, json: async () => ({}) });
  }) as unknown as typeof fetch;
}

const disabledStatus = {
  connected: true,
  status: 'LOGIN_REQUIRED',
  error: 'A SnapTrade brokerage connection is disabled. Reconnect to resume updates.',
};

describe('SnapTradeButton per-account connection health', () => {
  beforeEach(() => mockAccounts());

  it('warns on the disabled brokerage only, naming that brokerage', async () => {
    render(<SnapTradeButton snapTradeStatus={disabledStatus} />);

    const notices = await screen.findAllByText(/SnapTrade connection disabled for Public\./);
    expect(notices).toHaveLength(1);
    expect(screen.queryByText(/disabled for Fidelity/)).not.toBeInTheDocument();
  });

  it('leaves a working brokerage unmarked while another is disabled', async () => {
    render(<SnapTradeButton snapTradeStatus={disabledStatus} />);

    await screen.findByText('First Citizens 401K');
    // One ✗ (Public) and one ✓ (Fidelity) -- not two ✗.
    expect(screen.getAllByTitle(/Connection issue/)).toHaveLength(1);
    expect(screen.getAllByTitle('Connection active')).toHaveLength(1);
  });

  // TokenStatus.ERROR serializes as lowercase 'error'. A check written against
  // 'ERROR' alone silently never fires, which would report every account healthy
  // during a real outage -- the opposite of the bug above and just as wrong.
  it.each(['error', 'ERROR'])(
    'marks every account when the whole connection is unusable (%s)',
    async (status) => {
      render(
        <SnapTradeButton
          snapTradeStatus={{ connected: true, status, error: 'SnapTrade unreachable' }}
        />
      );

      await screen.findByText('Treasury Account');
      expect(screen.getAllByTitle(/Connection issue/)).toHaveLength(2);
    }
  );

  // The account payload is the primary signal, but a caller that only has the
  // user-level status must still be able to attribute the failure.
  it('falls back to disabledConnections when the account omits the flag', async () => {
    render(
      <SnapTradeButton
        snapTradeStatus={{
          ...disabledStatus,
          disabledConnections: [{ authorizationId: 'auth-fidelity', institutionName: 'Fidelity' }],
        }}
      />
    );

    await screen.findByText('First Citizens 401K');
    // Public is disabled via its own flag, Fidelity via the authorization list.
    expect(screen.getAllByTitle(/Connection issue/)).toHaveLength(2);
    expect(screen.getByText(/disabled for Fidelity\./)).toBeInTheDocument();
  });
});
