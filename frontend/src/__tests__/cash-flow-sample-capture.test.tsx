import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import CashFlowSampleCapture from '@/components/marketing/CashFlowSampleCapture';

const pushCashFlowSampleRequested = jest.fn();
jest.mock('@/lib/dataLayer', () => ({
  pushCashFlowSampleRequested: () => pushCashFlowSampleRequested(),
}));

function respond(status: number, body: unknown) {
  global.fetch = jest.fn().mockResolvedValue({ ok: status < 400, status, json: async () => body });
}

function submit(email: string) {
  fireEvent.change(screen.getByLabelText('Email address'), { target: { value: email } });
  fireEvent.click(screen.getByRole('button', { name: 'Email me a sample forecast' }));
}

describe('cash-flow sample capture', () => {
  beforeEach(() => pushCashFlowSampleRequested.mockClear());

  it('asks for the sample by address alone and confirms where it is going', async () => {
    respond(200, { message: 'ok' });
    render(<CashFlowSampleCapture />);

    submit(' visitor@example.com ');

    expect(await screen.findByText('Your sample forecast is on its way')).toBeInTheDocument();
    expect(screen.getByText('visitor@example.com')).toBeInTheDocument();
    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toMatch(/\/api\/cash-flow-forecast\/sample-request$/);
    // Nothing but the address leaves the page.
    expect(JSON.parse(init.body)).toEqual({ email: 'visitor@example.com' });
    expect(pushCashFlowSampleRequested).toHaveBeenCalledTimes(1);
  });

  it('sends an existing account to sign in, back to its own forecast', async () => {
    respond(200, { existingAccount: true });
    render(<CashFlowSampleCapture />);

    submit('member@example.com');

    const link = await screen.findByRole('link', { name: 'Sign in to see your own forecast' });
    expect(link).toHaveAttribute('href', `/login?returnTo=${encodeURIComponent('/cash-flow')}`);
    // Not a lead: the sequence is for people without an account.
    expect(pushCashFlowSampleRequested).not.toHaveBeenCalled();
  });

  it('shows the server error and lets the visitor try again', async () => {
    respond(503, { error: 'We could not send that just now. Please try again in a moment.' });
    render(<CashFlowSampleCapture />);

    submit('visitor@example.com');

    expect(await screen.findByRole('alert')).toHaveTextContent('We could not send that just now.');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Email me a sample forecast' })).toBeEnabled());
    expect(pushCashFlowSampleRequested).not.toHaveBeenCalled();
  });

  it('explains a network failure rather than failing silently', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('offline'));
    render(<CashFlowSampleCapture />);

    submit('visitor@example.com');

    expect(await screen.findByRole('alert')).toHaveTextContent('We could not reach Ask Linc.');
  });
});
