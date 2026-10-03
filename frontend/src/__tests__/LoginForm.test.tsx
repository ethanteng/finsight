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
import { storeCoastFireSignupContext } from '@/lib/coast-fire-signup-context';
import { resetSignInHandoverCache } from '@/lib/calculator-handover';

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
    resetSignInHandoverCache();
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

  it('returns a deep link to where it was headed after signing in', async () => {
    searchParams = new URLSearchParams(`returnTo=${encodeURIComponent('/profile?connect=plaid')}`);
    global.fetch = jest.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ token: 'secure-token' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ status: 'active', accessLevel: 'full' }) });

    render(<LoginForm />);
    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'member@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'correct-password' } });
    fireEvent.click(screen.getByRole('button', { name: /Sign in to your workspace/i }));

    await waitFor(() => expect(push).toHaveBeenCalledWith('/profile?connect=plaid'));
  });

  it('ignores an off-site return destination rather than following it', async () => {
    searchParams = new URLSearchParams(`returnTo=${encodeURIComponent('https://evil.example/steal')}`);
    global.fetch = jest.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ token: 'secure-token' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ status: 'active', accessLevel: 'full' }) });

    render(<LoginForm />);
    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'member@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'correct-password' } });
    fireEvent.click(screen.getByRole('button', { name: /Sign in to your workspace/i }));

    await waitFor(() => expect(push).toHaveBeenCalledWith('/app'));
    expect(push).not.toHaveBeenCalledWith('https://evil.example/steal');
  });

  it('carries the return destination through an abandoned checkout', async () => {
    searchParams = new URLSearchParams(`returnTo=${encodeURIComponent('/profile?connect=plaid')}`);
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ url: 'https://checkout.stripe.com/new' }),
    });

    render(<LoginForm />);
    fireEvent.click(screen.getAllByRole('button', { name: /Get started/i })[0]);

    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    const [, checkoutInit] = (global.fetch as jest.Mock).mock.calls[0];
    expect(JSON.parse(checkoutInit.body).cancelUrl).toContain(
      `/login?returnTo=${encodeURIComponent('/profile?connect=plaid')}`
    );
  });

  /*
   * A calculator sends an address that already has an account here, with the
   * run in the stored signup context. Signing in attaches it to the account,
   * and the workspace opens on it — the answer is seen in Ask Linc, never on
   * the calculator page.
   */
  describe('arriving from a calculator with a run', () => {
    const TOKEN = 'e'.repeat(48);
    const INPUTS = {
      currentAge: 40, retirementAge: 65, currentSavings: 400_000,
      annualRetirementSpending: 80_000, annualRetirementIncome: 30_000,
      realReturnRate: 5, withdrawalRate: 4,
    };

    function signIn() {
      fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'correct-password' } });
      fireEvent.click(screen.getByRole('button', { name: /Sign in to your workspace/i }));
    }

    function mockLogin(attached: boolean) {
      global.fetch = jest.fn(async (url: RequestInfo | URL) => {
        if (String(url).includes('/auth/login')) {
          return { ok: true, json: async () => ({ token: 'secure-token', user: {} }) };
        }
        if (String(url).includes('/auth/calculator-lead')) {
          return { ok: true, json: async () => ({ attached }) };
        }
        return { ok: true, json: async () => ({ status: 'active', accessLevel: 'full' }) };
      }) as unknown as typeof fetch;
    }

    beforeEach(() => {
      searchParams = new URLSearchParams('source=coast-fire-calculator');
      storeCoastFireSignupContext(INPUTS, { email: 'member@example.com', sourceToken: TOKEN });
    });

    it('says the result is waiting and fills in the address', () => {
      render(<LoginForm />);

      expect(screen.getByText('Your Coast FIRE result is ready.')).toBeInTheDocument();
      expect(screen.getByLabelText('Email address')).toHaveValue('member@example.com');
    });

    it('attaches the run with the new session, then opens the workspace', async () => {
      mockLogin(true);
      render(<LoginForm />);
      signIn();

      await waitFor(() => expect(push).toHaveBeenCalledWith('/app'));
      const attach = jest.mocked(global.fetch).mock.calls
        .find(([url]) => String(url).includes('/auth/calculator-lead'))!;
      const init = attach[1] as RequestInit;
      expect((init.headers as Record<string, string>).Authorization).toBe('Bearer secure-token');
      expect(JSON.parse(String(init.body))).toEqual({ calculatorRef: TOKEN });
    });

    /*
     * Attaching wins over a return destination: the run is why they came.
     */
    it('opens the workspace on the run rather than a deep link', async () => {
      searchParams = new URLSearchParams('source=coast-fire-calculator&returnTo=%2Fapp%2Ffinances');
      mockLogin(true);
      render(<LoginForm />);
      signIn();

      await waitFor(() => expect(push).toHaveBeenCalledWith('/app'));
      expect(push).not.toHaveBeenCalledWith('/app/finances');
    });

    it('signs in as usual when the run does not attach', async () => {
      mockLogin(false);
      render(<LoginForm />);
      signIn();

      await waitFor(() => expect(push).toHaveBeenCalledWith('/app'));
      expect(localStorage.getItem('auth_token')).toBe('secure-token');
    });

    it('asks for nothing when no calculator sent the visitor', () => {
      searchParams = new URLSearchParams();
      render(<LoginForm />);

      expect(screen.queryByText(/result is ready/i)).not.toBeInTheDocument();
    });
  });

  /*
   * An existing account's email links through `/<calculator>/continue?to=sign-in`,
   * which leaves the token in a cookie scoped to sign-in. No stored context
   * exists on this device, so the cookie is the only copy of the run.
   */
  describe('arriving from the emailed link', () => {
    const TOKEN = 'f'.repeat(48);

    beforeEach(() => {
      window.history.pushState({}, '', '/login?source=retirement-calculator');
      searchParams = new URLSearchParams('source=retirement-calculator');
      document.cookie = `asklinc_rt_ref=${TOKEN}; Path=/login`;
    });

    afterEach(() => {
      document.cookie = 'asklinc_rt_ref=; Path=/login; Max-Age=0';
      window.history.pushState({}, '', '/');
    });

    it('takes the run from the cookie, spends it, and attaches it after sign-in', async () => {
      global.fetch = jest.fn(async (url: RequestInfo | URL) => {
        const target = String(url);
        if (target.includes('/signup-context/')) {
          return {
            ok: true,
            json: async () => ({
              inputs: {
                currentAge: 45, retirementAge: 65, investableAssets: 500_000,
                annualSpending: 80_000, annualContributions: 20_000,
                socialSecurityAnnual: 24_000, socialSecurityStartAge: 67,
                lifeExpectancy: 92, allocation: 'balanced',
              },
              email: 'member@example.com',
            }),
          };
        }
        if (target.includes('/auth/login')) {
          return { ok: true, json: async () => ({ token: 'secure-token', user: {} }) };
        }
        if (target.includes('/auth/calculator-lead')) {
          return { ok: true, json: async () => ({ attached: true }) };
        }
        return { ok: true, json: async () => ({ status: 'active', accessLevel: 'full' }) };
      }) as unknown as typeof fetch;

      render(<LoginForm />);

      expect(screen.getByText('Your retirement result is ready.')).toBeInTheDocument();
      // Spent on arrival: a second visit is an ordinary sign-in.
      expect(document.cookie).not.toContain(TOKEN);
      // The lookup fills in the address the run was sent to.
      await waitFor(() => expect(screen.getByLabelText('Email address')).toHaveValue('member@example.com'));

      fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'correct-password' } });
      fireEvent.click(screen.getByRole('button', { name: /Sign in to your workspace/i }));

      await waitFor(() => expect(push).toHaveBeenCalledWith('/app'));
      const attach = jest.mocked(global.fetch).mock.calls
        .find(([url]) => String(url).includes('/auth/calculator-lead'))!;
      expect(JSON.parse(String((attach[1] as RequestInit).body))).toEqual({ calculatorRef: TOKEN });
    });

    /*
     * React Strict Mode remounts in development. Spending the cookie into a
     * page-load stash keeps the run across that remount.
     */
    it('keeps the emailed run across a remount after the cookie is spent', async () => {
      global.fetch = jest.fn(async (url: RequestInfo | URL) => {
        const target = String(url);
        if (target.includes('/signup-context/')) {
          return {
            ok: true,
            json: async () => ({
              inputs: {
                currentAge: 45, retirementAge: 65, investableAssets: 500_000,
                annualSpending: 80_000, annualContributions: 20_000,
                socialSecurityAnnual: 24_000, socialSecurityStartAge: 67,
                lifeExpectancy: 92, allocation: 'balanced',
              },
              email: 'member@example.com',
            }),
          };
        }
        if (target.includes('/auth/login')) {
          return { ok: true, json: async () => ({ token: 'secure-token', user: {} }) };
        }
        if (target.includes('/auth/calculator-lead')) {
          return { ok: true, json: async () => ({ attached: true }) };
        }
        return { ok: true, json: async () => ({ status: 'active', accessLevel: 'full' }) };
      }) as unknown as typeof fetch;

      const { unmount } = render(<LoginForm />);
      expect(screen.getByText('Your retirement result is ready.')).toBeInTheDocument();
      expect(document.cookie).not.toContain(TOKEN);
      unmount();

      render(<LoginForm />);
      expect(screen.getByText('Your retirement result is ready.')).toBeInTheDocument();
      await waitFor(() => expect(screen.getByLabelText('Email address')).toHaveValue('member@example.com'));

      fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'correct-password' } });
      fireEvent.click(screen.getByRole('button', { name: /Sign in to your workspace/i }));

      await waitFor(() => expect(push).toHaveBeenCalledWith('/app'));
      const attach = jest.mocked(global.fetch).mock.calls
        .find(([url]) => String(url).includes('/auth/calculator-lead'))!;
      expect(JSON.parse(String((attach[1] as RequestInit).body))).toEqual({ calculatorRef: TOKEN });
    });
  });
});
