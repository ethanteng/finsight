/**
 * The accounts page lists every account in one place.
 *
 * What matters is that the list is genuinely combined -- bank and brokerage
 * accounts interleaved by institution, under one heading -- while connection
 * health stays strictly per provider. The two integrations do not share health,
 * and a combined list is exactly where that could quietly go wrong.
 */

import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import ProfilePage from '../app/profile/page';

jest.mock('snaptrade-react', () => ({ SnapTradeReact: () => null }));
jest.mock('snaptrade-react/hooks/useWindowMessage', () => ({ useWindowMessage: jest.fn() }));

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: jest.fn(), replace: jest.fn(), prefetch: jest.fn(),
    back: jest.fn(), forward: jest.fn(), refresh: jest.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/profile',
}));

const plaidAccounts = [
  {
    id: 'plaid-1',
    name: 'Fidelity Cash Management',
    type: 'depository',
    subtype: 'checking',
    institution: 'Fidelity',
    currentBalance: 1500,
  },
  {
    id: 'plaid-2',
    name: 'Amex Platinum',
    type: 'credit',
    subtype: 'credit card',
    institution: 'American Express',
    currentBalance: -250,
  },
];

const snapTradeAccounts = [
  {
    id: 'st-1',
    name: 'Fidelity Roth IRA',
    type: 'investment',
    subtype: 'ira',
    institution: 'Fidelity',
    balance: 42000,
    brokerageAuthorizationId: 'auth-fidelity',
  },
];

function mockApi({
  tokenStatuses = [{ id: 'tok-1', institutionName: 'Fidelity', isActive: true, lastError: null }],
  snapTradeProfileStatus = { connected: true, status: 'ACTIVE' },
}: {
  tokenStatuses?: unknown[];
  snapTradeProfileStatus?: Record<string, unknown>;
} = {}) {
  (global.fetch as jest.Mock).mockImplementation((url: string) => {
    const json = (body: unknown) => Promise.resolve({ ok: true, status: 200, json: async () => body });

    if (url.includes('/plaid/all-accounts')) return json({ accounts: plaidAccounts });
    if (url.includes('/snaptrade/accounts')) return json({ data: { accounts: snapTradeAccounts } });
    if (url.includes('/snaptrade/status/user')) return json({ status: 'registered' });
    if (url.includes('/profile/snaptrade-status')) return json(snapTradeProfileStatus);
    if (url.includes('/profile/tokens')) return json({ tokens: tokenStatuses });
    if (url.includes('/auth/verify')) return json({ user: { email: 'user@example.com' } });
    return json({});
  });
}

describe('Combined accounts list', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn();
    Storage.prototype.getItem = jest.fn(() => 'mock-auth-token');
    Storage.prototype.removeItem = jest.fn();
    Storage.prototype.setItem = jest.fn();
    window.history.replaceState({}, '', '/profile');
  });

  it('puts bank and brokerage accounts under one heading, not two provider sections', async () => {
    mockApi();
    render(<ProfilePage />);

    expect(await screen.findByText('Your connected accounts')).toBeInTheDocument();

    // The provider-named sections this replaced.
    expect(screen.queryByText(/Your Connected Accounts \(Plaid\)/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Your Connected Accounts \(SnapTrade\)/)).not.toBeInTheDocument();
    expect(screen.queryByText('Bank, cash & credit accounts')).not.toBeInTheDocument();
    expect(screen.queryByText('Investment & retirement accounts')).not.toBeInTheDocument();
  });

  it('shows accounts from both providers in the same list', async () => {
    mockApi();
    render(<ProfilePage />);

    expect(await screen.findByText('Fidelity Cash Management')).toBeInTheDocument();
    expect(await screen.findByText('Fidelity Roth IRA')).toBeInTheDocument();
    expect(screen.getByText('Amex Platinum')).toBeInTheDocument();
  });

  it('groups one firm\'s bank and brokerage accounts together by institution', async () => {
    mockApi();
    render(<ProfilePage />);

    await screen.findByText('Fidelity Roth IRA');

    const names = screen
      .getAllByText(/Fidelity Cash Management|Fidelity Roth IRA|Amex Platinum/)
      .map(node => node.textContent);

    // American Express sorts before Fidelity, and the two Fidelity accounts --
    // one from each provider -- land next to each other.
    expect(names).toEqual(['Amex Platinum', 'Fidelity Cash Management', 'Fidelity Roth IRA']);
  });

  it('renders each brokerage account once', async () => {
    mockApi();
    render(<ProfilePage />);

    await screen.findByText('Fidelity Roth IRA');
    expect(screen.getAllByText('Fidelity Roth IRA')).toHaveLength(1);
  });

  it('drops the stale hardcoded institution list', async () => {
    mockApi();
    render(<ProfilePage />);

    await screen.findByText('Your connected accounts');
    expect(screen.queryByText('Supported Financial Institutions')).not.toBeInTheDocument();
    expect(screen.queryByText(/TD Ameritrade/)).not.toBeInTheDocument();
  });

  it('keeps a broken bank connection off the brokerage account at the same firm', async () => {
    // A combined list is exactly where one provider's trouble could bleed onto
    // the other's account at the same institution. It must not.
    mockApi({
      tokenStatuses: [
        { id: 'tok-1', institutionName: 'Fidelity', isActive: false, lastError: 'ITEM_LOGIN_REQUIRED' },
      ],
    });
    render(<ProfilePage />);

    const brokerageName = await screen.findByText('Fidelity Roth IRA');
    const brokerageCard = brokerageName.closest('div.rounded-lg') as HTMLElement;

    // The Plaid Item's failure appears on the Plaid account only.
    expect(screen.getByText('Re-authentication required')).toBeInTheDocument();
    expect(within(brokerageCard).queryByText(/Re-authentication required/)).not.toBeInTheDocument();
    expect(within(brokerageCard).getByTitle('Connection active')).toBeInTheDocument();
  });

  it('offers one place to manage connections', async () => {
    mockApi();
    render(<ProfilePage />);

    await waitFor(() => expect(screen.getByText('Manage connections')).toBeInTheDocument());
  });
});
