import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import PlaidConnections from '@/components/PlaidConnections';

const connections = [
  {
    id: 'token-boa',
    itemId: 'item-boa',
    institution: 'Bank of America',
    isActive: true,
    lastError: null,
    lastRefreshed: '2026-08-20T23:31:04.694Z',
    accounts: [
      { id: 'acct-1', name: 'Checking', mask: '4321' },
      { id: 'acct-2', name: 'Credit Card', mask: '9876' },
    ],
  },
  {
    id: 'token-ufb',
    itemId: 'item-ufb',
    institution: 'UFB Direct',
    isActive: false,
    lastError: 'ITEM_LOGIN_REQUIRED',
    lastRefreshed: '2026-08-19T10:00:00.000Z',
    accounts: [{ id: 'acct-3', name: 'High APY Savings', mask: null }],
  },
];

// The row buttons and the confirmation share the label "Disconnect", so the
// confirm has to be taken from inside the dialog rather than by label alone.
async function confirmInDialog(name: string) {
  const dialog = await screen.findByRole('alertdialog');
  fireEvent.click(within(dialog).getByRole('button', { name }));
}

function mockFetch(overrides: { deleteStatus?: number; deleteBody?: unknown } = {}) {
  return jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    if (init?.method === 'DELETE') {
      const ok = (overrides.deleteStatus ?? 200) < 400;
      return {
        ok,
        json: async () => overrides.deleteBody ?? { success: true, data: { institution: 'Bank of America' } },
      } as Response;
    }
    return { ok: true, json: async () => ({ success: true, data: { connections } }) } as Response;
  }) as unknown as typeof fetch;
}

describe('PlaidConnections', () => {
  beforeEach(() => {
    localStorage.setItem('auth_token', 'token');
    global.fetch = mockFetch();
  });

  afterEach(() => jest.resetAllMocks());

  it('lists one row per institution with its account count', async () => {
    render(<PlaidConnections />);

    expect(await screen.findByText('Bank of America')).toBeInTheDocument();
    expect(screen.getByText('UFB Direct')).toBeInTheDocument();
    expect(screen.getByText(/2 accounts/)).toBeInTheDocument();
    expect(screen.getByText(/1 account ·/)).toBeInTheDocument();
  });

  it('flags a connection that has gone bad', async () => {
    render(<PlaidConnections />);

    expect(await screen.findByText('Needs attention')).toBeInTheDocument();
  });

  // The whole point of the feature: removing one bank must target only that
  // connection's Item.
  it('disconnects only the institution whose button was clicked', async () => {
    render(<PlaidConnections />);
    await screen.findByText('Bank of America');

    fireEvent.click(screen.getAllByRole('button', { name: 'Disconnect' })[0]);
    await confirmInDialog('Disconnect');

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/plaid/connections/token-boa'),
        expect.objectContaining({ method: 'DELETE' })
      );
    });
    const deleted = (global.fetch as jest.Mock).mock.calls
      .filter(call => call[1]?.method === 'DELETE')
      .map(call => String(call[0]));
    expect(deleted).toHaveLength(1);
    expect(deleted[0]).not.toContain('token-ufb');
  });

  // Destructive and not undone by reconnecting, so it must never fire straight
  // off a single click.
  it('does not disconnect when the confirmation is dismissed', async () => {
    render(<PlaidConnections />);
    await screen.findByText('Bank of America');

    fireEvent.click(screen.getAllByRole('button', { name: 'Disconnect' })[0]);
    await confirmInDialog('Cancel');

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull();
    });
    const deleteCalls = (global.fetch as jest.Mock).mock.calls.filter(call => call[1]?.method === 'DELETE');
    expect(deleteCalls).toHaveLength(0);
  });

  // Revoking at Plaid is the half this product used to quietly not do, so the
  // dialog has to say it rather than only promising local deletion.
  it('says the connection is revoked at Plaid, not just deleted here', async () => {
    render(<PlaidConnections />);
    await screen.findByText('Bank of America');

    fireEvent.click(screen.getAllByRole('button', { name: 'Disconnect' })[0]);

    expect(await screen.findByText('Disconnect Bank of America?')).toBeInTheDocument();
    expect(screen.getByText(/revokes the connection at Plaid/i)).toBeInTheDocument();
    expect(screen.getByText(/other connected institutions are not affected/i)).toBeInTheDocument();
    expect(screen.getByText(/renames or category overrides will be lost/i)).toBeInTheDocument();
  });

  it('tells the user when the disconnect failed', async () => {
    global.fetch = mockFetch({ deleteStatus: 502, deleteBody: { error: 'Could not disconnect this institution.' } });
    render(<PlaidConnections />);
    await screen.findByText('Bank of America');

    fireEvent.click(screen.getAllByRole('button', { name: 'Disconnect' })[0]);
    await confirmInDialog('Disconnect');

    expect(await screen.findByText('Could not disconnect this institution.')).toBeInTheDocument();
  });

  it('renders nothing when there are no connections', async () => {
    global.fetch = jest.fn(async () => ({
      ok: true,
      json: async () => ({ success: true, data: { connections: [] } }),
    })) as unknown as typeof fetch;

    const { container } = render(<PlaidConnections />);

    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });
});
