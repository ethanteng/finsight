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
});
