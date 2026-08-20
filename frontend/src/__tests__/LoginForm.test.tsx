import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import LoginForm from '@/components/LoginForm';
import { USER_TIME_ZONE_KEY } from '@/lib/browser-time-zone';

const push = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  useSearchParams: () => new URLSearchParams(),
}));
jest.mock('@/lib/dataLayer', () => ({ pushBeginCheckout: jest.fn() }));
jest.mock('@/lib/heycatch', () => ({ identifyUser: jest.fn() }));

describe('LoginForm', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
  });

  it('renders the redesigned secure entry experience and footer', () => {
    render(<LoginForm />);
    expect(screen.getByRole('heading', { name: 'Welcome back.' })).toBeInTheDocument();
    expect(screen.getByLabelText('Email address')).toHaveAttribute('autocomplete', 'email');
    expect(screen.getByLabelText('Password')).toHaveAttribute('autocomplete', 'current-password');
    expect(screen.getByText('Encrypted access. Your financial data stays protected.')).toBeInTheDocument();
    expect(screen.getByRole('contentinfo')).toBeInTheDocument();
  });

  it('preserves authentication and subscription verification before entering the app', async () => {
    global.fetch = jest.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          token: 'secure-token',
          user: { email: 'member@example.com', timeZone: 'America/New_York' },
        }),
      })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ status: 'active', accessLevel: 'full' }) });

    render(<LoginForm />);
    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'member@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'correct-password' } });
    fireEvent.click(screen.getByRole('button', { name: /Sign in to your workspace/i }));

    await waitFor(() => expect(push).toHaveBeenCalledWith('/app'));
    expect(localStorage.getItem('auth_token')).toBe('secure-token');
    expect(localStorage.getItem(USER_TIME_ZONE_KEY)).toBe('America/New_York');
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('offers a lapsed subscriber a renew checkout that identifies their account', async () => {
    global.fetch = jest.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ token: 'lapsed-token', user: { email: 'lapsed@example.com' } }),
      })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ status: 'canceled', accessLevel: 'none' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ url: 'https://checkout.stripe.com/renew' }) });

    render(<LoginForm />);
    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'lapsed@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'correct-password' } });
    fireEvent.click(screen.getByRole('button', { name: /Sign in to your workspace/i }));

    await waitFor(() => expect(screen.getByText('Subscription expired')).toBeInTheDocument());
    // A lapsed subscriber is not signed in to the workspace
    expect(localStorage.getItem('auth_token')).toBeNull();
    expect(push).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /Start a new subscription/i }));

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(3));
    const [checkoutUrl, checkoutInit] = (global.fetch as jest.Mock).mock.calls[2];
    expect(checkoutUrl).toContain('/api/stripe/create-checkout-session');
    // Without this the backend cannot reuse their existing Stripe customer
    expect(checkoutInit.headers.Authorization).toBe('Bearer lapsed-token');
  });
});
