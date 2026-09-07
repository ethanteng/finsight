import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import GetStartedForm from '@/components/GetStartedForm';
import { USER_TIME_ZONE_KEY } from '@/lib/browser-time-zone';

const push = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  useSearchParams: () => new URLSearchParams(),
}));

describe('GetStartedForm', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
  });

  it('frames the page around starting a free trial rather than signing back in', () => {
    render(<GetStartedForm />);

    expect(screen.getByRole('heading', { name: 'Try Ask Linc free for 30 days.' })).toBeInTheDocument();
    expect(screen.getByText('No credit card required')).toBeInTheDocument();
    expect(screen.queryByText('Welcome back.')).not.toBeInTheDocument();
    // Both the header and the form footer offer the existing-account escape hatch.
    const signIn = screen.getAllByRole('link', { name: 'Sign in' });
    expect(signIn).toHaveLength(2);
    signIn.forEach((link) => expect(link).toHaveAttribute('href', '/login'));
  });

  it('creates the account with no Stripe session so no payment details are collected', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        token: 'trial-token',
        user: { email: 'new@example.com', timeZone: 'America/New_York' },
      }),
    });

    render(<GetStartedForm />);
    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'new@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'Password1' } });
    fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: 'Password1' } });
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

  it('does not submit mismatched passwords', async () => {
    global.fetch = jest.fn();

    render(<GetStartedForm />);
    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'new@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'Password1' } });
    fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: 'Password2' } });
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

    render(<GetStartedForm />);
    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'taken@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'Password1' } });
    fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: 'Password1' } });
    fireEvent.click(screen.getByRole('button', { name: /Start free trial/i }));

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('User with this email already exists'),
    );
    expect(push).not.toHaveBeenCalled();
    expect(localStorage.getItem('auth_token')).toBeNull();
  });
});
