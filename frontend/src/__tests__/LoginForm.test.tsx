import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import LoginForm from '@/components/LoginForm';
import { USER_TIME_ZONE_KEY } from '@/lib/browser-time-zone';
import {
  pushTrialLoginError,
  pushTrialLoginSubmit,
  pushTrialLoginSuccess,
  pushTrialLoginViewed,
} from '@/lib/dataLayer';
import {
  beginFreeTrialSignupFlow,
  isFreeTrialSignupContinuation,
} from '@/lib/trial-signup-flow';

const push = jest.fn();
let searchParams = new URLSearchParams();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  useSearchParams: () => searchParams,
}));
jest.mock('@/lib/dataLayer', () => ({
  pushBeginCheckout: jest.fn(),
  pushTrialLoginError: jest.fn(),
  pushTrialLoginSubmit: jest.fn(),
  pushTrialLoginSuccess: jest.fn(),
  pushTrialLoginViewed: jest.fn(),
}));

const mockPushTrialLoginError = jest.mocked(pushTrialLoginError);
const mockPushTrialLoginSubmit = jest.mocked(pushTrialLoginSubmit);
const mockPushTrialLoginSuccess = jest.mocked(pushTrialLoginSuccess);
const mockPushTrialLoginViewed = jest.mocked(pushTrialLoginViewed);

describe('LoginForm', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
    searchParams = new URLSearchParams();
  });

  it('renders the redesigned secure entry experience and footer', () => {
    render(<LoginForm />);
    expect(screen.getByRole('heading', { name: 'Welcome back.' })).toBeInTheDocument();
    expect(screen.getByLabelText('Email address')).toHaveAttribute('autocomplete', 'email');
    expect(screen.getByLabelText('Password')).toHaveAttribute('autocomplete', 'current-password');
    expect(screen.getByText('Encrypted access. Your financial data stays protected.')).toBeInTheDocument();
    expect(screen.getByRole('contentinfo')).toBeInTheDocument();
    expect(mockPushTrialLoginViewed).not.toHaveBeenCalled();
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
    expect(mockPushTrialLoginSubmit).not.toHaveBeenCalled();
    expect(mockPushTrialLoginSuccess).not.toHaveBeenCalled();
  });

  it('tracks a free-trial continuation through authenticated login, then clears attribution', async () => {
    searchParams = new URLSearchParams('signup_flow=free_trial');
    expect(beginFreeTrialSignupFlow()).toBe(true);
    global.fetch = jest.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          token: 'secure-token',
          user: { timeZone: 'America/New_York' },
        }),
      })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ status: 'inactive', accessLevel: 'full' }) });

    const { rerender } = render(<LoginForm />);
    await waitFor(() => expect(mockPushTrialLoginViewed).toHaveBeenCalledTimes(1));
    rerender(<LoginForm />);
    expect(mockPushTrialLoginViewed).toHaveBeenCalledTimes(1);

    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'member@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'correct-password' } });
    fireEvent.click(screen.getByRole('button', { name: /Sign in to your workspace/i }));

    await waitFor(() => expect(push).toHaveBeenCalledWith('/app'));
    expect(mockPushTrialLoginSubmit).toHaveBeenCalledTimes(1);
    expect(mockPushTrialLoginSuccess).toHaveBeenCalledTimes(1);
    expect(mockPushTrialLoginError).not.toHaveBeenCalled();
    expect(isFreeTrialSignupContinuation(searchParams)).toBe(false);
  });

  it('reports a safe server-rejected category for a failed trial login', async () => {
    searchParams = new URLSearchParams('signup_flow=free_trial');
    beginFreeTrialSignupFlow();
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'Invalid email or password' }),
    });

    render(<LoginForm />);
    await waitFor(() => expect(mockPushTrialLoginViewed).toHaveBeenCalledTimes(1));
    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'member@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'wrong-password' } });
    fireEvent.click(screen.getByRole('button', { name: /Sign in to your workspace/i }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Invalid email or password'));
    expect(mockPushTrialLoginSubmit).toHaveBeenCalledTimes(1);
    expect(mockPushTrialLoginError).toHaveBeenCalledWith('server_rejected');
    expect(mockPushTrialLoginError).not.toHaveBeenCalledWith('Invalid email or password');
    expect(mockPushTrialLoginSuccess).not.toHaveBeenCalled();
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
