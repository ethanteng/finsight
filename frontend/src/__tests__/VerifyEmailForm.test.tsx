import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import VerifyEmailForm from '@/components/VerifyEmailForm';
import {
  pushTrialVerifyError,
  pushTrialVerifySubmit,
  pushTrialVerifySuccess,
  pushTrialVerifyViewed,
} from '@/lib/dataLayer';
import { beginFreeTrialSignupFlow } from '@/lib/trial-signup-flow';

const push = jest.fn();
let searchParams = new URLSearchParams();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  useSearchParams: () => searchParams,
}));
jest.mock('@/lib/dataLayer', () => ({
  pushTrialVerifyError: jest.fn(),
  pushTrialVerifySubmit: jest.fn(),
  pushTrialVerifySuccess: jest.fn(),
  pushTrialVerifyViewed: jest.fn(),
}));

const mockPushTrialVerifyError = jest.mocked(pushTrialVerifyError);
const mockPushTrialVerifySubmit = jest.mocked(pushTrialVerifySubmit);
const mockPushTrialVerifySuccess = jest.mocked(pushTrialVerifySuccess);
const mockPushTrialVerifyViewed = jest.mocked(pushTrialVerifyViewed);

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
    expect(screen.getByRole('link', { name: 'Skip for now' })).toHaveAttribute('href', '/login');
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
    expect(screen.getByRole('link', { name: 'Skip for now' })).toHaveAttribute(
      'href',
      '/login?signup_flow=free_trial',
    );

    enterCode();

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Invalid verification code'));
    expect(mockPushTrialVerifySubmit).toHaveBeenCalledTimes(1);
    expect(mockPushTrialVerifySubmit).toHaveBeenCalledWith();
    expect(mockPushTrialVerifyError).toHaveBeenCalledWith('server_rejected');
    expect(mockPushTrialVerifyError).not.toHaveBeenCalledWith(expect.stringContaining('123456'));
    expect(mockPushTrialVerifySuccess).not.toHaveBeenCalled();
  });

  it('tracks backend-confirmed verification and preserves the flow into login', async () => {
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
    expect(localStorage.getItem('auth_token')).toBeNull();

    act(() => {
      jest.advanceTimersByTime(2000);
    });
    expect(push).toHaveBeenCalledWith('/login?signup_flow=free_trial');
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
