import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import SnapTradeButton from '@/components/SnapTradeButton';

jest.mock('snaptrade-react', () => ({
  SnapTradeReact: () => null,
}));
jest.mock('snaptrade-react/hooks/useWindowMessage', () => ({
  useWindowMessage: () => undefined,
}));
jest.mock('@/services/FinancialServiceCoordinator', () => ({
  financialServiceCoordinator: { executeService: jest.fn(async () => undefined) },
  SERVICE_NAMES: {},
}));

/**
 * The Public rows in this list come from the direct Public.com feed, substituted
 * server-side for SnapTrade's copies of the same accounts. They have no brokerage
 * authorization, so SnapTrade's connection health must not be applied to them —
 * the direct feed is precisely what still works when a SnapTrade link is broken.
 */
const accounts = [
  { id: 'snaptrade-f1', name: 'First Citizens 401K', type: 'investment', subtype: '401k', institution: 'Fidelity', balance: 188147.02 },
  {
    id: 'public-3CR13857',
    name: 'Treasury Account',
    type: 'investment',
    subtype: 'treasury',
    institution: 'Public',
    balance: 57046.98,
    source: 'public',
    balanceDerivedFromPositions: true,
  },
  {
    id: 'public-2OE66869',
    name: 'High Yield Cash Account',
    type: 'depository',
    subtype: 'cash management',
    institution: 'Public',
    source: 'public',
  },
];

function mockFetch() {
  return jest.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/snaptrade/accounts')) {
      return { ok: true, json: async () => ({ success: true, data: { accounts } }) } as Response;
    }
    if (url.includes('/snaptrade/status/user')) {
      // The component reads `status` off the response body itself, and only
      // fetches accounts once it reads 'registered'.
      return { ok: true, json: async () => ({ status: 'registered' }) } as Response;
    }
    return { ok: true, json: async () => ({ success: true, data: {} }) } as Response;
  });
}

const cardFor = (name: string) => screen.getByText(name).closest('div.bg-gray-700') as HTMLElement;

beforeEach(() => {
  localStorage.setItem('auth_token', 'test-token');
  global.fetch = mockFetch() as unknown as typeof fetch;
});

afterEach(() => {
  localStorage.clear();
  jest.restoreAllMocks();
});

describe('SnapTradeButton account list', () => {
  it('shows the direct Public balance', async () => {
    render(<SnapTradeButton snapTradeStatus={{ connected: true, status: 'ACTIVE' }} />);

    await waitFor(() => expect(screen.getByText('Treasury Account')).toBeInTheDocument());
    expect(within(cardFor('Treasury Account')).getByText('$57,046.98')).toBeInTheDocument();
  });

  it('marks a position-derived balance as such, rather than passing it off as a reported total', async () => {
    render(<SnapTradeButton snapTradeStatus={{ connected: true, status: 'ACTIVE' }} />);

    await waitFor(() => expect(screen.getByText('Treasury Account')).toBeInTheDocument());
    expect(within(cardFor('Treasury Account')).getByText('from positions')).toBeInTheDocument();
    // The Fidelity balance is reported by the institution, so it carries no caveat.
    expect(within(cardFor('First Citizens 401K')).queryByText('from positions')).toBeNull();
  });

  it('says "Not reported" instead of leaving the balance blank', async () => {
    // Public exposes no endpoint that reports a High Yield Cash value. A blank
    // cell read as a rendering bug, which is how it was reported.
    render(<SnapTradeButton snapTradeStatus={{ connected: true, status: 'ACTIVE' }} />);

    await waitFor(() => expect(screen.getByText('High Yield Cash Account')).toBeInTheDocument());
    expect(within(cardFor('High Yield Cash Account')).getByText('Not reported')).toBeInTheDocument();
  });

  it('does not report direct Public accounts as broken when SnapTrade is broken', async () => {
    render(
      <SnapTradeButton
        snapTradeStatus={{ connected: false, status: 'error', error: 'SnapTrade unreachable' }}
      />
    );

    await waitFor(() => expect(screen.getByText('Treasury Account')).toBeInTheDocument());

    const publicCard = cardFor('Treasury Account');
    expect(within(publicCard).getByTitle('Read directly from Public')).toBeInTheDocument();
    expect(within(publicCard).queryByText('SnapTrade unreachable')).toBeNull();

    // The genuinely SnapTrade-sourced account still reports the failure.
    expect(within(cardFor('First Citizens 401K')).getByText('SnapTrade unreachable')).toBeInTheDocument();
  });

  it('does not apply a disabled Public authorization to the direct rows', async () => {
    render(
      <SnapTradeButton
        snapTradeStatus={{
          connected: true,
          status: 'LOGIN_REQUIRED',
          disabledConnections: [{ authorizationId: 'auth-public', institutionName: 'Public' }],
        }}
      />
    );

    await waitFor(() => expect(screen.getByText('Treasury Account')).toBeInTheDocument());
    expect(within(cardFor('Treasury Account')).getByTitle('Read directly from Public')).toBeInTheDocument();
  });
});
