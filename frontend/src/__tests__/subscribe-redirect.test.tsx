/**
 * The component builds absolute success/cancel URLs from `window.location.origin`,
 * so the test runs on a realistic origin rather than jsdom's default.
 *
 * @jest-environment-options {"url": "https://asklinc.com/subscribe"}
 */
import { StrictMode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import SubscribeRedirect, { campaignLocation } from '@/components/SubscribeRedirect';
import { pushBeginCheckout } from '@/lib/dataLayer';
import { isStripeCheckoutUrl, replaceLocation } from '@/lib/external-navigation';

let searchParams = new URLSearchParams();

jest.mock('next/navigation', () => ({
  useSearchParams: () => searchParams,
}));
jest.mock('@/lib/dataLayer', () => ({
  pushBeginCheckout: jest.fn(),
}));
jest.mock('@/lib/external-navigation', () => {
  const actual = jest.requireActual('@/lib/external-navigation') as typeof import('@/lib/external-navigation');
  return {
    ...actual,
    replaceLocation: jest.fn(),
  };
});

const mockPushBeginCheckout = jest.mocked(pushBeginCheckout);
const replace = jest.mocked(replaceLocation);

beforeAll(() => {
  process.env.NEXT_PUBLIC_API_URL = 'http://localhost:3000';
});

describe('SubscribeRedirect', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    searchParams = new URLSearchParams();
  });

  it('mints a checkout session on mount and forwards to Stripe', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ url: 'https://checkout.stripe.com/c/pay/cs_test_123' }),
    });

    render(<SubscribeRedirect />);

    await waitFor(() => expect(replace).toHaveBeenCalledWith('https://checkout.stripe.com/c/pay/cs_test_123'));

    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe('http://localhost:3000/api/stripe/create-checkout-session');
    const body = JSON.parse(init.body);
    expect(body.tier).toBe('premium');
    expect(body.successUrl).toBe(
      'https://asklinc.com/payment-success?session_id={CHECKOUT_SESSION_ID}&tier=premium',
    );
    // Backing out of checkout should land on the page that argues the case.
    expect(body.cancelUrl).toBe('https://asklinc.com/pricing');
  });

  it('sends the stored token so a signed-in recipient keeps their Stripe customer', async () => {
    localStorage.setItem('auth_token', 'member-token');
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ url: 'https://checkout.stripe.com/c/pay/cs_test_456' }),
    });

    render(<SubscribeRedirect />);

    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    const [, init] = (global.fetch as jest.Mock).mock.calls[0];
    // Without this the backend reuses no customer and hands a returning
    // subscriber another free trial.
    expect(init.headers.Authorization).toBe('Bearer member-token');
  });

  it('omits the authorization header for a recipient who is not signed in', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ url: 'https://checkout.stripe.com/c/pay/cs_test_789' }),
    });

    render(<SubscribeRedirect />);

    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    const [, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(init.headers.Authorization).toBeUndefined();
  });

  it('mints only one session per page view', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ url: 'https://checkout.stripe.com/c/pay/cs_test_abc' }),
    });

    const { rerender } = render(<SubscribeRedirect />);
    rerender(<SubscribeRedirect />);

    await waitFor(() => expect(replace).toHaveBeenCalled());
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('still forwards across the extra unmount StrictMode performs', async () => {
    let resolveCheckout: (value: unknown) => void = () => {};
    global.fetch = jest.fn().mockReturnValue(
      new Promise((resolve) => {
        resolveCheckout = resolve;
      }),
    );

    render(
      <StrictMode>
        <SubscribeRedirect />
      </StrictMode>,
    );
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(global.fetch).toHaveBeenCalledTimes(1);

    resolveCheckout({
      ok: true,
      json: async () => ({ url: 'https://checkout.stripe.com/c/pay/cs_test_strict' }),
    });

    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith('https://checkout.stripe.com/c/pay/cs_test_strict'),
    );
  });

  it('does not forward after an unmount that follows StrictMode\'s remount', async () => {
    let resolveCheckout: (value: unknown) => void = () => {};
    global.fetch = jest.fn().mockReturnValue(
      new Promise((resolve) => {
        resolveCheckout = resolve;
      }),
    );

    const { unmount } = render(
      <StrictMode>
        <SubscribeRedirect />
      </StrictMode>,
    );
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());

    // StrictMode has already unmounted and remounted by now. If that remount
    // registered no cleanup, this unmount leaves the page marked mounted and
    // the late response still forwards.
    unmount();
    resolveCheckout({
      ok: true,
      json: async () => ({ url: 'https://checkout.stripe.com/c/pay/cs_test_strict_gone' }),
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(replace).not.toHaveBeenCalled();
  });

  it('offers a retry instead of a dead end when the session cannot be created', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'Failed to create checkout session' }),
    });

    render(<SubscribeRedirect />);

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(screen.getByRole('link', { name: 'Go to pricing' })).toHaveAttribute('href', '/pricing');
    expect(replace).not.toHaveBeenCalled();

    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ url: 'https://checkout.stripe.com/c/pay/cs_test_retry' }),
    });
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

    await waitFor(() => expect(replace).toHaveBeenCalledWith('https://checkout.stripe.com/c/pay/cs_test_retry'));
  });

  it('does not forward to a response that carries no checkout url', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({}) });

    render(<SubscribeRedirect />);

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(replace).not.toHaveBeenCalled();
  });

  it('does not forward to a non-Stripe checkout url', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ url: 'https://evil.example/phish' }),
    });

    render(<SubscribeRedirect />);

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(replace).not.toHaveBeenCalled();
  });

  it('does not forward after the visitor has already left the page', async () => {
    let resolveFetch: (value: unknown) => void = () => undefined;
    global.fetch = jest.fn().mockReturnValue(
      new Promise((resolve) => {
        resolveFetch = resolve;
      }),
    );

    const { unmount } = render(<SubscribeRedirect />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
    unmount();

    resolveFetch({
      ok: true,
      json: async () => ({ url: 'https://checkout.stripe.com/c/pay/cs_test_gone' }),
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(replace).not.toHaveBeenCalled();
  });

  it('still reaches checkout when the browser refuses storage', async () => {
    const getItem = jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('The operation is insecure.', 'SecurityError');
    });
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ url: 'https://checkout.stripe.com/c/pay/cs_test_private' }),
    });

    render(<SubscribeRedirect />);

    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith('https://checkout.stripe.com/c/pay/cs_test_private'),
    );
    const [, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(init.headers.Authorization).toBeUndefined();
    getItem.mockRestore();
  });

  it('reports the campaign that sent the visitor', async () => {
    searchParams = new URLSearchParams('src=trial-ending');
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ url: 'https://checkout.stripe.com/c/pay/cs_test_def' }),
    });

    render(<SubscribeRedirect />);

    await waitFor(() => expect(mockPushBeginCheckout).toHaveBeenCalledWith('email_trial-ending'));
  });

  it('reports the header CTA separately from an email click', async () => {
    searchParams = new URLSearchParams('channel=app&src=header');
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ url: 'https://checkout.stripe.com/c/pay/cs_test_header' }),
    });

    render(<SubscribeRedirect />);

    await waitFor(() => expect(mockPushBeginCheckout).toHaveBeenCalledWith('app_header'));
  });
});

describe('campaignLocation', () => {
  it('labels a plain click with no campaign', () => {
    expect(campaignLocation(null)).toBe('email');
  });

  it('accepts a short slug', () => {
    expect(campaignLocation('winback_q3')).toBe('email_winback_q3');
  });

  it.each([
    'has spaces',
    '<script>',
    'a'.repeat(33),
    '',
  ])('refuses %p rather than writing it into analytics', (src) => {
    expect(campaignLocation(src)).toBe('email');
  });

  it('labels the signed-in header CTA as an in-app click', () => {
    expect(campaignLocation('header', 'app')).toBe('app_header');
  });

  it('falls back to email for an unknown channel', () => {
    expect(campaignLocation('header', 'carrier-pigeon')).toBe('email_header');
  });

  it('keeps existing email links unlabelled by channel', () => {
    expect(campaignLocation('winback_q3', null)).toBe('email_winback_q3');
  });
});

describe('isStripeCheckoutUrl', () => {
  it('accepts a Stripe-hosted Checkout Session URL', () => {
    expect(isStripeCheckoutUrl('https://checkout.stripe.com/c/pay/cs_test_123')).toBe(true);
  });

  it.each([
    'http://checkout.stripe.com/c/pay/cs_test_123',
    'https://evil.example/c/pay/cs_test_123',
    'javascript:alert(1)',
    '',
  ])('rejects %p', (url) => {
    expect(isStripeCheckoutUrl(url)).toBe(false);
  });
});
