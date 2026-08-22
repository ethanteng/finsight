import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import PublicDirectConnection from '@/components/PublicDirectConnection';

function mockFetch(status: Record<string, unknown>, overrides: { putStatus?: number; putBody?: unknown } = {}) {
  return jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    if (init?.method === 'PUT') {
      const code = overrides.putStatus ?? 200;
      return { ok: code < 400, status: code, json: async () => overrides.putBody ?? { success: true } } as Response;
    }
    if (init?.method === 'DELETE') {
      return { ok: true, status: 200, json: async () => ({ success: true }) } as Response;
    }
    return { ok: true, status: 200, json: async () => ({ success: true, data: status }) } as Response;
  }) as unknown as typeof fetch;
}

describe('PublicDirectConnection', () => {
  beforeEach(() => localStorage.setItem('auth_token', 'token'));
  afterEach(() => jest.resetAllMocks());

  // The gate: this is a workaround for one broken vendor path, not an invitation
  // to hand over a brokerage credential.
  it('renders nothing for a user with no Public connection', async () => {
    global.fetch = mockFetch({ eligible: false, configured: false });

    const { container } = render(<PublicDirectConnection />);

    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it('offers the connection to an eligible user', async () => {
    global.fetch = mockFetch({ eligible: true, configured: false });

    render(<PublicDirectConnection />);

    expect(await screen.findByText('Public — direct connection')).toBeInTheDocument();
  });

  // Public offers no read-only key. A user should decide with that in front of
  // them, not buried in a tooltip.
  it('states plainly that the key can trade', async () => {
    global.fetch = mockFetch({ eligible: true, configured: false });

    render(<PublicDirectConnection />);

    expect(await screen.findByText(/can place and cancel trades/i)).toBeInTheDocument();
    expect(screen.getByText(/doesn’t offer a\s+read-only version/i)).toBeInTheDocument();
    expect(screen.getByText(/revoke\s+it in Public at any time/i)).toBeInTheDocument();
  });

  it('masks the secret field', async () => {
    global.fetch = mockFetch({ eligible: true, configured: false });

    render(<PublicDirectConnection />);

    const input = await screen.findByLabelText(/secret key/i);
    expect(input).toHaveAttribute('type', 'password');
    expect(input).toHaveAttribute('autocomplete', 'off');
  });

  it('sends the secret and clears the field on success', async () => {
    global.fetch = mockFetch({ eligible: true, configured: false });
    render(<PublicDirectConnection />);

    const input = await screen.findByLabelText(/secret key/i);
    fireEvent.change(input, { target: { value: 'SECRET-VALUE' } });
    fireEvent.click(screen.getByRole('button', { name: /connect public/i }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/public-api/secret'),
        expect.objectContaining({ method: 'PUT', body: JSON.stringify({ secret: 'SECRET-VALUE' }) }),
      );
    });
    await waitFor(() => expect((screen.queryByLabelText(/secret key/i) as HTMLInputElement | null)?.value ?? '').toBe(''));
  });

  it('surfaces a rejected secret', async () => {
    global.fetch = mockFetch(
      { eligible: true, configured: false },
      { putStatus: 400, putBody: { error: 'Public did not accept that secret.' } },
    );
    render(<PublicDirectConnection />);

    fireEvent.change(await screen.findByLabelText(/secret key/i), { target: { value: 'bad' } });
    fireEvent.click(screen.getByRole('button', { name: /connect public/i }));

    expect(await screen.findByText('Public did not accept that secret.')).toBeInTheDocument();
  });

  it('does not call the API for an empty secret', async () => {
    global.fetch = mockFetch({ eligible: true, configured: false });
    render(<PublicDirectConnection />);

    await screen.findByLabelText(/secret key/i);
    fireEvent.click(screen.getByRole('button', { name: /connect public/i }));

    await screen.findByText(/enter the secret key/i);
    const puts = (global.fetch as jest.Mock).mock.calls.filter(call => call[1]?.method === 'PUT');
    expect(puts).toHaveLength(0);
  });

  it('shows a connected state without ever displaying the key', async () => {
    global.fetch = mockFetch({
      eligible: true,
      configured: true,
      lastVerifiedAt: '2026-08-22T18:00:00.000Z',
      lastError: null,
    });

    render(<PublicDirectConnection />);

    expect(await screen.findByText('Connected')).toBeInTheDocument();
    expect(screen.queryByLabelText(/secret key/i)).toBeNull();
  });

  // Removing the key puts those balances back into the missing state, so the
  // confirmation has to say so rather than implying it is reversible cleanup.
  it('warns that removing the key loses those balances again', async () => {
    global.fetch = mockFetch({ eligible: true, configured: true });
    render(<PublicDirectConnection />);

    fireEvent.click(await screen.findByRole('button', { name: /remove key/i }));

    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText(/will go missing again/i)).toBeInTheDocument();
  });

  // Requiring remove-then-reconnect would mean deleting the only stored
  // configuration in order to fix it.
  it('lets a rejected key be replaced in place', async () => {
    global.fetch = mockFetch({
      eligible: true,
      configured: true,
      lastError: 'Public rejected the stored API secret.',
    });
    render(<PublicDirectConnection />);

    const input = await screen.findByLabelText(/replace with a new secret key/i);
    fireEvent.change(input, { target: { value: 'NEW-SECRET' } });
    fireEvent.click(screen.getByRole('button', { name: /replace key/i }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/public-api/secret'),
        expect.objectContaining({ method: 'PUT', body: JSON.stringify({ secret: 'NEW-SECRET' }) }),
      );
    });
    const deletes = (global.fetch as jest.Mock).mock.calls.filter(call => call[1]?.method === 'DELETE');
    expect(deletes).toHaveLength(0);
  });

  // A working key must not invite replacement -- the field only appears once
  // Public has actually rejected the stored one.
  it('offers no replacement field while the key is working', async () => {
    global.fetch = mockFetch({ eligible: true, configured: true, lastError: null });
    render(<PublicDirectConnection />);

    await screen.findByText('Connected');
    expect(screen.queryByLabelText(/replace with a new secret key/i)).toBeNull();
  });

  it('surfaces a stored credential error', async () => {
    global.fetch = mockFetch({
      eligible: true,
      configured: true,
      lastError: 'Public rejected the stored API secret.',
    });

    render(<PublicDirectConnection />);

    expect(await screen.findByText('Public rejected the stored API secret.')).toBeInTheDocument();
  });
});
