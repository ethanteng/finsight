/**
 * The billing-portal forwarding page.
 *
 * Reached from the signed-in upgrade CTA when the account is on a trial that
 * collects no card. Its job is to mint a Billing Portal session for the signed-in
 * account and forward to it, and to fail closed on anything that is not Stripe.
 *
 * @jest-environment-options {"url": "https://asklinc.com/billing"}
 */
import { StrictMode } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import BillingPortalRedirect from '@/components/BillingPortalRedirect';
import { isStripeBillingPortalUrl, replaceLocation } from '@/lib/external-navigation';

jest.mock('@/lib/external-navigation', () => {
  const actual = jest.requireActual('@/lib/external-navigation') as typeof import('@/lib/external-navigation');
  return { ...actual, replaceLocation: jest.fn() };
});

const replace = jest.mocked(replaceLocation);
const PORTAL_URL = 'https://billing.stripe.com/p/session/test_123';

beforeAll(() => {
  process.env.NEXT_PUBLIC_API_URL = 'http://localhost:3000';
});

beforeEach(() => {
  jest.clearAllMocks();
  localStorage.clear();
  localStorage.setItem('auth_token', 'member-token');
});

describe('BillingPortalRedirect', () => {
  it('mints a portal session for the signed-in account and forwards to it', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ url: PORTAL_URL }) });

    render(<BillingPortalRedirect />);

    await waitFor(() => expect(replace).toHaveBeenCalledWith(PORTAL_URL));

    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe('http://localhost:3000/api/stripe/create-portal-session');
    expect(init.method).toBe('POST');
    // The customer is resolved from this token server-side; without it the
    // route cannot tell whose billing to open.
    expect(init.headers.Authorization).toBe('Bearer member-token');
    expect(JSON.parse(init.body).returnUrl).toBe('https://asklinc.com/app');
  });

  it('tells a visitor what the next page is for while it waits', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ url: PORTAL_URL }) });

    render(<BillingPortalRedirect />);

    // They clicked "Upgrade your account" and are about to land on a billing
    // portal, so the page says why.
    expect(screen.getByText('Taking you to billing')).toBeInTheDocument();
    expect(screen.getByText(/Add a payment method there/)).toBeInTheDocument();
  });

  it('asks a signed-out visitor to sign in rather than reporting a failure', async () => {
    localStorage.clear();
    global.fetch = jest.fn();

    render(<BillingPortalRedirect />);

    await screen.findByText('Please sign in first');
    expect(global.fetch).not.toHaveBeenCalled();
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login');
  });

  it('treats a rejected token as signed out', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({}) });

    render(<BillingPortalRedirect />);

    await screen.findByText('Please sign in first');
    expect(replace).not.toHaveBeenCalled();
  });

  it('reports a failure without forwarding', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({ error: 'boom' }) });

    render(<BillingPortalRedirect />);

    await screen.findByText('We could not open your billing details');
    expect(replace).not.toHaveBeenCalled();
  });

  it('refuses to forward to a target that is not Stripe', async () => {
    // Nobody clicked to confirm this navigation, so it fails closed.
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ url: 'https://evil.example/p/session/test_123' }),
    });

    render(<BillingPortalRedirect />);

    await screen.findByText('We could not open your billing details');
    expect(replace).not.toHaveBeenCalled();
  });

  it('mints only one session per page view, including under StrictMode', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ url: PORTAL_URL }) });

    render(
      <StrictMode>
        <BillingPortalRedirect />
      </StrictMode>,
    );

    await waitFor(() => expect(replace).toHaveBeenCalledWith(PORTAL_URL));
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});

describe('isStripeBillingPortalUrl', () => {
  it('accepts a Stripe-hosted portal session URL', () => {
    expect(isStripeBillingPortalUrl(PORTAL_URL)).toBe(true);
  });

  it.each([
    'http://billing.stripe.com/p/session/test_123',
    'https://evil.example/p/session/test_123',
    // Checkout is a different host and a different thing; this page must not
    // forward to one.
    'https://checkout.stripe.com/c/pay/cs_test_123',
    'javascript:alert(1)',
    '',
  ])('rejects %p', (url) => {
    expect(isStripeBillingPortalUrl(url)).toBe(false);
  });
});
