import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import SnapTradeConnections from '@/components/SnapTradeConnections';

const connections = [
  {
    id: 'auth-public',
    institution: 'Public',
    disabled: false,
    lastHoldingsSync: '2025-11-23T23:58:28.789Z',
    accounts: [
      { id: 'snaptrade-1', name: 'Public Treasury Account', lastHoldingsSync: '2025-11-23T23:58:28.789Z' },
      { id: 'snaptrade-2', name: 'Public Brokerage Account', lastHoldingsSync: '2025-11-23T23:58:28.789Z' },
    ],
  },
  {
    id: 'auth-fidelity',
    institution: 'Fidelity',
    disabled: true,
    lastHoldingsSync: '2026-08-20T10:00:00.000Z',
    accounts: [{ id: 'snaptrade-3', name: 'Fidelity Roth', lastHoldingsSync: '2026-08-20T10:00:00.000Z' }],
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
        json: async () => overrides.deleteBody ?? { success: true, data: { institution: 'Public' } },
      } as Response;
    }
    return { ok: true, json: async () => ({ success: true, data: { connections } }) } as Response;
  }) as unknown as typeof fetch;
}

describe('SnapTradeConnections', () => {
  beforeEach(() => {
    localStorage.setItem('auth_token', 'token');
    global.fetch = mockFetch();
  });

  afterEach(() => jest.resetAllMocks());

  it('lists one row per institution with its account count', async () => {
    render(<SnapTradeConnections />);

    expect(await screen.findByText('Public')).toBeInTheDocument();
    expect(screen.getByText('Fidelity')).toBeInTheDocument();
    expect(screen.getByText(/2 accounts/)).toBeInTheDocument();
    expect(screen.getByText(/1 account ·/)).toBeInTheDocument();
  });

  it('flags a connection that needs reconnecting', async () => {
    render(<SnapTradeConnections />);

    expect(await screen.findByText('Needs reconnect')).toBeInTheDocument();
  });

  // The whole point of the feature: removing one institution must target only
  // that institution's authorization.
  it('disconnects only the institution whose button was clicked', async () => {
    render(<SnapTradeConnections />);
    await screen.findByText('Public');

    fireEvent.click(screen.getAllByRole('button', { name: 'Disconnect' })[0]);
    await confirmInDialog('Disconnect');

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/snaptrade/connections/auth-public'),
        expect.objectContaining({ method: 'DELETE' })
      );
    });
    const deleted = (global.fetch as jest.Mock).mock.calls
      .filter(call => call[1]?.method === 'DELETE')
      .map(call => String(call[0]));
    expect(deleted).toHaveLength(1);
    expect(deleted[0]).not.toContain('auth-fidelity');
  });

  // This is destructive and not undone by reconnecting, so it must never fire
  // straight off a single click.
  it('does not disconnect when the confirmation is dismissed', async () => {
    render(<SnapTradeConnections />);
    await screen.findByText('Public');

    fireEvent.click(screen.getAllByRole('button', { name: 'Disconnect' })[0]);
    await confirmInDialog('Cancel');

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull();
    });
    const deleteCalls = (global.fetch as jest.Mock).mock.calls.filter(call => call[1]?.method === 'DELETE');
    expect(deleteCalls).toHaveLength(0);
  });

  it('names the institution and what is lost before confirming', async () => {
    render(<SnapTradeConnections />);
    await screen.findByText('Public');

    fireEvent.click(screen.getAllByRole('button', { name: 'Disconnect' })[0]);

    expect(await screen.findByText('Disconnect Public?')).toBeInTheDocument();
    expect(screen.getByText(/transaction history/i)).toBeInTheDocument();
    expect(screen.getByText(/other connected institutions are not affected/i)).toBeInTheDocument();
  });

  it('tells the user when the disconnect failed', async () => {
    global.fetch = mockFetch({ deleteStatus: 502, deleteBody: { error: 'Could not disconnect this institution.' } });
    render(<SnapTradeConnections />);
    await screen.findByText('Public');

    fireEvent.click(screen.getAllByRole('button', { name: 'Disconnect' })[0]);
    await confirmInDialog('Disconnect');

    expect(await screen.findByText('Could not disconnect this institution.')).toBeInTheDocument();
  });

  // A user with no brokerages should see the connect button above, not an empty
  // panel header with nothing under it.
  it('renders nothing when there are no connections', async () => {
    global.fetch = jest.fn(async () => ({
      ok: true,
      json: async () => ({ success: true, data: { connections: [] } }),
    })) as unknown as typeof fetch;

    const { container } = render(<SnapTradeConnections />);

    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });
});
