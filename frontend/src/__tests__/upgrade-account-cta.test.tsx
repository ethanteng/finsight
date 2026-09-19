/**
 * The signed-in "Upgrade your account" CTA.
 *
 * Who sees it is a billing decision, and it is made once on the server
 * (`canUpgrade` in `getUserSubscriptionStatus`). What these tests hold is that
 * neither header re-derives it: both show the button on the server's word and
 * on nothing else, and both fail closed — an account that is paying, or a
 * request that did not answer, gets no CTA.
 */
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import AppPageClient from '@/app/app/AppPageClient';
import AuthenticatedPageHeader from '@/components/authenticated/AuthenticatedPageHeader';

const mockRouter = { push: jest.fn() };
jest.mock('next/navigation', () => ({ useRouter: () => mockRouter }));
jest.mock('@/components/FinanceQA', () => ({ __esModule: true, default: () => null }));
jest.mock('@/components/FinancialOverview', () => ({ __esModule: true, default: () => null }));
jest.mock('@/components/MarketNewsModal', () => ({ __esModule: true, default: () => null }));
jest.mock('@/components/PlaidLinkButton', () => ({ resetPlaidLinkInitialization: jest.fn() }));
jest.mock('@/lib/browser-time-zone', () => ({ syncStoredUserTimeZoneFromAuthUser: jest.fn() }));

/** The shape `/api/stripe/subscription-status` returns, narrowed to what matters here. */
type StatusPayload = { status: string; tier: string; accessLevel: string; canUpgrade?: boolean };

function mockApi(subscriptionStatus: StatusPayload | 'fails') {
  global.fetch = jest.fn().mockImplementation((input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/auth/verify')) {
      return Promise.resolve({ ok: true, json: async () => ({ user: { email: 'user@example.com' } }) });
    }
    if (url.includes('/api/stripe/subscription-status')) {
      return subscriptionStatus === 'fails'
        ? Promise.reject(new Error('network down'))
        : Promise.resolve({ ok: true, json: async () => subscriptionStatus });
    }
    if (url.includes('/conversations')) {
      return Promise.resolve({ ok: true, status: 200, json: async () => ({ conversations: [] }) });
    }
    return Promise.resolve({ ok: false, status: 404, json: async () => ({}) });
  });
}

const noCardSignup: StatusPayload = { status: 'inactive', tier: 'premium', accessLevel: 'full', canUpgrade: true };
const paying: StatusPayload = { status: 'active', tier: 'premium', accessLevel: 'full', canUpgrade: false };

const upgradeLink = () => screen.queryAllByRole('link', { name: /upgrade/i });

beforeEach(() => {
  localStorage.setItem('auth_token', 'token');
  jest.clearAllMocks();
});

afterEach(() => {
  jest.restoreAllMocks();
  localStorage.clear();
});

describe('UpgradeAccountButton in the shared page header', () => {
  it('offers checkout to an account the server says can upgrade', async () => {
    mockApi(noCardSignup);

    render(<AuthenticatedPageHeader activePage="finances" eyebrow="Financial overview" title="Your finances" />);

    await waitFor(() => expect(upgradeLink()).toHaveLength(1));
    const link = upgradeLink()[0];
    // Stripe Checkout has no durable URL, so the CTA points at the page that
    // mints one with this account's token — which is what fills in their email.
    expect(link).toHaveAttribute('href', '/subscribe?channel=app&src=header');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener');
  });

  it('shows nothing to a paying subscriber', async () => {
    mockApi(paying);

    render(<AuthenticatedPageHeader activePage="finances" eyebrow="Financial overview" title="Your finances" />);

    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(upgradeLink()).toHaveLength(0);
  });

  it('fails closed when the status request does not answer', async () => {
    mockApi('fails');

    render(<AuthenticatedPageHeader activePage="finances" eyebrow="Financial overview" title="Your finances" />);

    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(upgradeLink()).toHaveLength(0);
  });

  it('does not ask about billing on an admin page', async () => {
    mockApi(noCardSignup);

    render(<AuthenticatedPageHeader activePage="admin" eyebrow="Internal operations" title="Platform administration" />);

    await waitFor(() => expect(screen.getByText('Platform administration')).toBeInTheDocument());
    expect(global.fetch).not.toHaveBeenCalled();
    expect(upgradeLink()).toHaveLength(0);
  });

  it('asks for nothing when the page already knows the answer', async () => {
    // /profile loads billing state for its own subscription panel. Passing it
    // down spares the heaviest page in the app a second identical request.
    mockApi(noCardSignup);

    render(
      <AuthenticatedPageHeader
        activePage="profile"
        eyebrow="Accounts"
        title="Accounts & context"
        canUpgrade
      />,
    );

    await waitFor(() => expect(upgradeLink()).toHaveLength(1));
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('honours a page that says this account cannot upgrade', async () => {
    // Explicitly false is an answer, not an absent one: the header must not
    // fall back to asking, or the saved request comes straight back.
    mockApi(noCardSignup);

    render(
      <AuthenticatedPageHeader
        activePage="profile"
        eyebrow="Accounts"
        title="Accounts & context"
        canUpgrade={false}
      />,
    );

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Accounts & context' })).toBeInTheDocument());
    expect(global.fetch).not.toHaveBeenCalled();
    expect(upgradeLink()).toHaveLength(0);
  });

  it('asks for nothing when there is no session to ask about', async () => {
    localStorage.clear();
    mockApi(noCardSignup);

    render(<AuthenticatedPageHeader activePage="profile" eyebrow="Accounts" title="Accounts & context" />);

    // By heading, not by text: "Accounts & context" is also a nav link here.
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Accounts & context' })).toBeInTheDocument());
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

describe('UpgradeAccountButton in the decision workspace', () => {
  it('appears in the workspace chrome for a no-card account', async () => {
    mockApi(noCardSignup);

    render(<AppPageClient />);

    // Once in the phone header, once in the desktop sidebar: the workspace has
    // no single header element that both breakpoints share.
    await waitFor(() => expect(upgradeLink()).toHaveLength(2));
    expect(upgradeLink()[0]).toHaveAttribute('href', '/subscribe?channel=app&src=header');
  });

  it('stays out of the way for a paying subscriber', async () => {
    mockApi(paying);

    render(<AppPageClient />);

    await waitFor(() => expect(screen.getByText('Decisions')).toBeInTheDocument());
    expect(upgradeLink()).toHaveLength(0);
  });

  it('reuses the status call the workspace already makes', async () => {
    mockApi(noCardSignup);

    render(<AppPageClient />);

    await waitFor(() => expect(upgradeLink()).toHaveLength(2));
    const statusCalls = (global.fetch as jest.Mock).mock.calls.filter(([input]: [RequestInfo | URL]) =>
      String(input).includes('/api/stripe/subscription-status'),
    );
    expect(statusCalls).toHaveLength(1);
  });
});
