import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import RegisterForm from '@/components/RegisterForm';
import { USER_TIME_ZONE_KEY } from '@/lib/browser-time-zone';

const push = jest.fn();
let searchParams = new URLSearchParams();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  useSearchParams: () => searchParams,
}));
jest.mock('@/lib/dataLayer', () => ({ pushBeginCheckout: jest.fn() }));

function fillForm(password = 'Password1', confirm = password) {
  fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'new@example.com' } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: password } });
  fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: confirm } });
}

describe('RegisterForm', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    searchParams = new URLSearchParams();
  });

  describe('trial variant (/getstarted)', () => {
    it('frames the page around starting a free trial rather than signing back in', () => {
      render(<RegisterForm variant="trial" />);

      expect(screen.getByRole('heading', { name: 'Try Ask Linc free for 30 days.' })).toBeInTheDocument();
      expect(screen.getByText('No credit card required')).toBeInTheDocument();
      expect(screen.queryByText('Welcome back.')).not.toBeInTheDocument();
      // Both the header and the form footer offer the existing-account escape hatch.
      const signIn = screen.getAllByRole('link', { name: 'Sign in' });
      expect(signIn).toHaveLength(2);
      signIn.forEach((link) => expect(link).toHaveAttribute('href', '/login'));
    });

    it('offers no route to Stripe checkout', () => {
      render(<RegisterForm variant="trial" />);

      expect(screen.queryByRole('button', { name: 'Get started' })).not.toBeInTheDocument();
    });

    it('creates the account with no Stripe session so no payment details are collected', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          token: 'trial-token',
          user: { email: 'new@example.com', timeZone: 'America/New_York' },
        }),
      });

      render(<RegisterForm variant="trial" />);
      fillForm();
      fireEvent.click(screen.getByRole('button', { name: /Start free trial/i }));

      await waitFor(() => expect(push).toHaveBeenCalledWith('/verify-email'));

      const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
      expect(url).toContain('/auth/register');
      const body = JSON.parse(init.body as string);
      expect(body.email).toBe('new@example.com');
      // A tier or checkout session would put the account on the paid path.
      expect(body).not.toHaveProperty('tier');
      expect(body).not.toHaveProperty('stripeSessionId');
      // Nothing on this page may reach Stripe.
      expect((global.fetch as jest.Mock).mock.calls).toHaveLength(1);

      expect(localStorage.getItem('auth_token')).toBe('trial-token');
      expect(localStorage.getItem(USER_TIME_ZONE_KEY)).toBe('America/New_York');
    });

    it('ignores checkout context on the URL rather than quietly charging a trial signup', async () => {
      searchParams = new URLSearchParams('subscription=active&tier=premium&session_id=cs_test_123');
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ token: 'trial-token', user: { email: 'new@example.com' } }),
      });

      render(<RegisterForm variant="trial" />);
      expect(screen.queryByText('Payment received.')).not.toBeInTheDocument();

      fillForm();
      fireEvent.click(screen.getByRole('button', { name: /Start free trial/i }));

      await waitFor(() => expect(push).toHaveBeenCalledWith('/verify-email'));
      const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body as string);
      expect(body).not.toHaveProperty('stripeSessionId');
    });

    it('does not submit mismatched passwords', async () => {
      global.fetch = jest.fn();

      render(<RegisterForm variant="trial" />);
      fillForm('Password1', 'Password2');
      fireEvent.click(screen.getByRole('button', { name: /Start free trial/i }));

      await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Passwords do not match'));
      expect(global.fetch).not.toHaveBeenCalled();
      expect(push).not.toHaveBeenCalled();
    });

    it('surfaces a rejected registration instead of routing onward', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        json: async () => ({ error: 'User with this email already exists' }),
      });

      render(<RegisterForm variant="trial" />);
      fillForm();
      fireEvent.click(screen.getByRole('button', { name: /Start free trial/i }));

      await waitFor(() =>
        expect(screen.getByRole('alert')).toHaveTextContent('User with this email already exists'),
      );
      expect(push).not.toHaveBeenCalled();
      expect(localStorage.getItem('auth_token')).toBeNull();
    });
  });

  describe('checkout variant (/register)', () => {
    it('keeps the plain account-creation framing by default', () => {
      render(<RegisterForm />);

      expect(screen.getByRole('heading', { name: 'Create your account.' })).toBeInTheDocument();
      expect(screen.queryByText('No credit card required')).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Get started' })).toBeInTheDocument();
    });

    it('links a completed checkout session to the new account', async () => {
      searchParams = new URLSearchParams('subscription=active&tier=premium&session_id=cs_test_123');
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ token: 'paid-token', user: { email: 'new@example.com' } }),
      });

      render(<RegisterForm />);
      expect(screen.getByText('Payment received.')).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'Your subscription is ready.' })).toBeInTheDocument();

      fillForm();
      fireEvent.click(screen.getByRole('button', { name: /Create account and continue/i }));

      await waitFor(() => expect(global.fetch).toHaveBeenCalled());
      const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body as string);
      expect(body.tier).toBe('premium');
      expect(body.stripeSessionId).toBe('cs_test_123');

      await waitFor(() =>
        expect(push).toHaveBeenCalledWith(expect.stringContaining('/verify-email?subscription=active')),
      );
    });
  });
});
