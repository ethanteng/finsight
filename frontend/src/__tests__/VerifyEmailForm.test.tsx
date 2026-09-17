import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import VerifyEmailForm from '@/components/VerifyEmailForm';
import {
  pushTrialVerifyError,
  pushTrialVerifySkipped,
  pushTrialVerifySubmit,
  pushTrialVerifySuccess,
  pushTrialVerifyViewed,
} from '@/lib/dataLayer';
import {
  beginFreeTrialSignupFlow,
  TRIAL_SIGNUP_FLOW_STORAGE_KEY,
} from '@/lib/trial-signup-flow';

const push = jest.fn();
let searchParams = new URLSearchParams();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  useSearchParams: () => searchParams,
}));
jest.mock('@/lib/dataLayer', () => ({
  pushTrialVerifyError: jest.fn(),
  pushTrialVerifySkipped: jest.fn(),
  pushTrialVerifySubmit: jest.fn(),
  pushTrialVerifySuccess: jest.fn(),
  pushTrialVerifyViewed: jest.fn(),
}));

const mockPushTrialVerifyError = jest.mocked(pushTrialVerifyError);
const mockPushTrialVerifySubmit = jest.mocked(pushTrialVerifySubmit);
const mockPushTrialVerifySuccess = jest.mocked(pushTrialVerifySuccess);
const mockPushTrialVerifyViewed = jest.mocked(pushTrialVerifyViewed);
const mockPushTrialVerifySkipped = jest.mocked(pushTrialVerifySkipped);

function enterCode(code = '123456') {
  fireEvent.change(screen.getByLabelText('Verification Code'), { target: { value: code } });
  fireEvent.click(screen.getByRole('button', { name: /Verify email/i }));
}

describe('VerifyEmailForm', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
    searchParams = new URLSearchParams();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('does not label an ordinary verification visit as a free-trial continuation', () => {
    render(<VerifyEmailForm />);

    expect(mockPushTrialVerifyViewed).not.toHaveBeenCalled();
    expect(screen.getByRole('link', { name: 'Skip for now' })).toHaveAttribute('href', '/app');
    expect(screen.getByRole('button', { name: /Verify email/i })).toHaveAttribute(
      'data-cs-override-id',
      'form-submit-verify-email',
    );
  });

  it('tracks a trial verification rejection once with no code or server message', async () => {
    searchParams = new URLSearchParams('signup_flow=free_trial');
    expect(beginFreeTrialSignupFlow()).toBe(true);
    localStorage.setItem('auth_token', 'registration-token');
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'Invalid verification code 123456' }),
    });

    const { rerender } = render(<VerifyEmailForm />);
    await waitFor(() => expect(mockPushTrialVerifyViewed).toHaveBeenCalledTimes(1));
    rerender(<VerifyEmailForm />);
    expect(mockPushTrialVerifyViewed).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('link', { name: 'Skip for now' })).toHaveAttribute('href', '/app');

    enterCode();

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Invalid verification code'));
    expect(mockPushTrialVerifySubmit).toHaveBeenCalledTimes(1);
    expect(mockPushTrialVerifySubmit).toHaveBeenCalledWith();
    expect(mockPushTrialVerifyError).toHaveBeenCalledWith('server_rejected');
    expect(mockPushTrialVerifyError).not.toHaveBeenCalledWith(expect.stringContaining('123456'));
    expect(mockPushTrialVerifySuccess).not.toHaveBeenCalled();
  });

  it('tracks backend-confirmed verification and opens the workspace on the same session', async () => {
    searchParams = new URLSearchParams('signup_flow=free_trial');
    beginFreeTrialSignupFlow();
    localStorage.setItem('auth_token', 'registration-token');
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true }) });

    render(<VerifyEmailForm />);
    await waitFor(() => expect(mockPushTrialVerifyViewed).toHaveBeenCalledTimes(1));
    jest.useFakeTimers();

    await act(async () => {
      enterCode('654321');
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockPushTrialVerifySubmit).toHaveBeenCalledTimes(1);
    expect(mockPushTrialVerifySuccess).toHaveBeenCalledTimes(1);
    expect(mockPushTrialVerifyError).not.toHaveBeenCalled();
    // The registration session is what carries the visitor into the app, so it
    // must survive verification rather than being traded for a fresh sign-in.
    expect(localStorage.getItem('auth_token')).toBe('registration-token');

    act(() => {
      jest.advanceTimersByTime(2000);
    });
    expect(push).toHaveBeenCalledWith('/app');
    expect(push).not.toHaveBeenCalledWith(expect.stringContaining('/login'));
    // The no-card funnel ends here now, so its attribution record must not be
    // left behind to claim a later auth page in this tab.
    expect(sessionStorage.getItem(TRIAL_SIGNUP_FLOW_STORAGE_KEY)).toBeNull();
  });

  /*
   * Skipping reaches the workspace just as verifying does. It used to land on
   * /login, where trial_login_success reported the completion; without an event
   * of its own the funnel would now lose everyone who took this door.
   */
  it('reports a skipped verification as a trial completion', async () => {
    searchParams = new URLSearchParams('signup_flow=free_trial');
    beginFreeTrialSignupFlow();
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({}) });

    render(<VerifyEmailForm />);
    await waitFor(() => expect(mockPushTrialVerifyViewed).toHaveBeenCalledTimes(1));

    const skip = screen.getByRole('link', { name: 'Skip for now' });
    expect(skip).toHaveAttribute('href', '/app');
    fireEvent.click(skip);

    expect(mockPushTrialVerifySkipped).toHaveBeenCalledTimes(1);
    expect(mockPushTrialVerifySuccess).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(TRIAL_SIGNUP_FLOW_STORAGE_KEY)).toBeNull();
  });

  it('does not report a skip outside the free-trial funnel', () => {
    render(<VerifyEmailForm />);

    fireEvent.click(screen.getByRole('link', { name: 'Skip for now' }));

    expect(mockPushTrialVerifySkipped).not.toHaveBeenCalled();
  });

  /*
   * The paid funnel used to hand Stripe context forward through the login URL
   * so the sign-in page could show a "subscription is ready" banner. There is
   * no sign-in page in this path any more, and the checkout was already linked
   * to the account at registration, so none of it should follow the visitor.
   */
  it('opens the workspace after a paid-checkout verification without a sign-in detour', async () => {
    searchParams = new URLSearchParams(
      'subscription=active&tier=premium&email=buyer%40example.com&session_id=cs_test_123',
    );
    localStorage.setItem('auth_token', 'registration-token');
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true }) });

    render(<VerifyEmailForm />);
    jest.useFakeTimers();

    await act(async () => {
      enterCode('654321');
      await Promise.resolve();
      await Promise.resolve();
    });

    act(() => {
      jest.advanceTimersByTime(2000);
    });

    expect(push).toHaveBeenCalledWith('/app');
    expect(push).not.toHaveBeenCalledWith(expect.stringContaining('/login'));
    expect(push).not.toHaveBeenCalledWith(expect.stringContaining('cs_test_123'));
    expect(localStorage.getItem('auth_token')).toBe('registration-token');
  });

  /*
   * Link-proved calculator signups never receive a code. If a stale client (or a
   * bookmark) still lands here, bounce into the app instead of waiting forever.
   */
  it('sends an already-verified registration straight into the workspace', async () => {
    searchParams = new URLSearchParams('signup_flow=free_trial');
    beginFreeTrialSignupFlow();
    localStorage.setItem('auth_token', 'registration-token');
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ user: { emailVerified: true } }),
    });

    render(<VerifyEmailForm />);

    await waitFor(() => expect(push).toHaveBeenCalledWith('/app'));
    expect(localStorage.getItem('auth_token')).toBe('registration-token');
    expect(mockPushTrialVerifySubmit).not.toHaveBeenCalled();
  });

  it('uses the network category when the verification request cannot be sent', async () => {
    searchParams = new URLSearchParams('signup_flow=free_trial');
    beginFreeTrialSignupFlow();
    global.fetch = jest.fn().mockRejectedValue(new Error('code=123456'));

    render(<VerifyEmailForm />);
    await waitFor(() => expect(mockPushTrialVerifyViewed).toHaveBeenCalledTimes(1));
    enterCode();

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Network error'));
    expect(mockPushTrialVerifyError).toHaveBeenCalledWith('network_error');
    expect(mockPushTrialVerifyError).not.toHaveBeenCalledWith(expect.stringContaining('123456'));
  });
});
