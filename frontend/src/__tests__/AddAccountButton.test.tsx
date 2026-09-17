/**
 * The accounts page's one "Add an account" button.
 *
 * What matters here is the routing: a bank row has to open Plaid Link and a
 * brokerage row has to open the SnapTrade portal on that brokerage's slug,
 * without the user ever being asked which of the two integrations their
 * institution belongs to.
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import AddAccountButton, { InstitutionOption } from '../components/AddAccountButton';

const chase: InstitutionOption = {
  id: 'plaid:ins_3',
  provider: 'plaid',
  name: 'Chase',
  providerInstitutionId: 'ins_3',
  logoUrl: null,
  covers: 'Checking, savings, credit cards & loans',
};

const fidelityBrokerage: InstitutionOption = {
  id: 'snaptrade:FIDELITY',
  provider: 'snaptrade',
  name: 'Fidelity',
  providerInstitutionId: 'FIDELITY',
  logoUrl: null,
  covers: 'Brokerage, retirement & investment holdings',
};

function mockSearch(body: Record<string, unknown>, { ok = true } = {}) {
  (global.fetch as jest.Mock).mockResolvedValue({
    ok,
    status: ok ? 200 : 500,
    json: async () => body,
  });
}

function renderPicker(overrides: Partial<React.ComponentProps<typeof AddAccountButton>> = {}) {
  const onSelectPlaid = jest.fn();
  const onSelectSnapTrade = jest.fn();
  render(
    <AddAccountButton
      onSelectPlaid={onSelectPlaid}
      onSelectSnapTrade={onSelectSnapTrade}
      {...overrides}
    />,
  );
  return { onSelectPlaid, onSelectSnapTrade };
}

async function openAndSearch(user: ReturnType<typeof userEvent.setup>, query: string) {
  await user.click(screen.getByRole('button', { name: 'Add an account' }));
  await user.type(screen.getByLabelText('Search institutions'), query);
}

describe('AddAccountButton', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn();
    Storage.prototype.getItem = jest.fn(() => 'test-token');
  });

  it('offers one button, not one per provider', () => {
    renderPicker();

    expect(screen.getByRole('button', { name: 'Add an account' })).toBeInTheDocument();
    expect(screen.queryByText(/plaid/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/snaptrade/i)).not.toBeInTheDocument();
  });

  it('opens Plaid Link when the picked institution is a bank', async () => {
    const user = userEvent.setup();
    mockSearch({ institutions: [chase], degradedProviders: [] });
    const { onSelectPlaid, onSelectSnapTrade } = renderPicker();

    await openAndSearch(user, 'chase');
    await user.click(await screen.findByRole('button', { name: /Chase/ }));

    expect(onSelectPlaid).toHaveBeenCalledWith(chase);
    expect(onSelectSnapTrade).not.toHaveBeenCalled();
  });

  it('opens the SnapTrade portal on that brokerage when the pick is an investment account', async () => {
    const user = userEvent.setup();
    mockSearch({ institutions: [fidelityBrokerage], degradedProviders: [] });
    const { onSelectPlaid, onSelectSnapTrade } = renderPicker();

    await openAndSearch(user, 'fidelity');
    await user.click(await screen.findByRole('button', { name: /Fidelity/ }));

    expect(onSelectSnapTrade).toHaveBeenCalledWith(
      expect.objectContaining({ providerInstitutionId: 'FIDELITY' }),
    );
    expect(onSelectPlaid).not.toHaveBeenCalled();
  });

  it('shows both sides of a brand in both directories, each saying what it brings in', async () => {
    const user = userEvent.setup();
    mockSearch({
      institutions: [{ ...chase, name: 'Fidelity', id: 'plaid:ins_fid' }, fidelityBrokerage],
      degradedProviders: [],
    });
    renderPicker();

    await openAndSearch(user, 'fidelity');

    expect(await screen.findByText('Checking, savings, credit cards & loans')).toBeInTheDocument();
    expect(screen.getByText('Brokerage, retirement & investment holdings')).toBeInTheDocument();
  });

  it('does not search a query too short to discriminate', async () => {
    const user = userEvent.setup();
    renderPicker();

    await openAndSearch(user, 'f');

    await waitFor(() => {
      expect(screen.getByText(/Start typing/)).toBeInTheDocument();
    });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('falls back to browsing all banks when nothing matched', async () => {
    const user = userEvent.setup();
    mockSearch({ institutions: [], degradedProviders: [] });
    const { onSelectPlaid } = renderPicker();

    await openAndSearch(user, 'nowhere bank');
    await user.click(await screen.findByRole('button', { name: /Browse all banks instead/ }));

    // null is the deliberate "no institution chosen" signal: Plaid's own
    // directory is larger than a name search surfaces.
    expect(onSelectPlaid).toHaveBeenCalledWith(null);
  });

  it('says the list is short when one provider could not be reached', async () => {
    const user = userEvent.setup();
    mockSearch({ institutions: [chase], degradedProviders: ['snaptrade'] });
    renderPicker();

    await openAndSearch(user, 'chase');

    expect(await screen.findByText(/Investment institutions could not be loaded/)).toBeInTheDocument();
  });

  it('reports a failed search instead of showing it as "no results"', async () => {
    const user = userEvent.setup();
    mockSearch({}, { ok: false });
    renderPicker();

    await openAndSearch(user, 'chase');

    expect(await screen.findByText(/could not search institutions/i)).toBeInTheDocument();
  });

  it('closes on Escape without connecting anything', async () => {
    const user = userEvent.setup();
    const { onSelectPlaid, onSelectSnapTrade } = renderPicker();

    await user.click(screen.getByRole('button', { name: 'Add an account' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    await user.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(onSelectPlaid).not.toHaveBeenCalled();
    expect(onSelectSnapTrade).not.toHaveBeenCalled();
  });
});

describe('AddAccountButton search races', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn();
    Storage.prototype.getItem = jest.fn(() => 'test-token');
  });

  it('aborts an in-flight search when the query changes', async () => {
    const user = userEvent.setup();
    const signals: AbortSignal[] = [];

    (global.fetch as jest.Mock).mockImplementation((_url, options) => {
      signals.push(options.signal);
      // Never settles: the only thing that ends this request is the abort.
      return new Promise(() => {});
    });

    renderPicker();
    await openAndSearch(user, 'chas');
    await waitFor(() => expect(signals).toHaveLength(1));

    // Typing again must not leave the first request free to land later and
    // repaint the list with results for a query that is no longer typed.
    await user.type(screen.getByLabelText('Search institutions'), 'e');
    await waitFor(() => expect(signals[0].aborted).toBe(true));
  });

  it('keeps investment rows clickable while SnapTrade is still setting up', async () => {
    const user = userEvent.setup();
    mockSearch({ institutions: [fidelityBrokerage], degradedProviders: [] });
    const { onSelectSnapTrade } = renderPicker({ snapTradeReady: false });

    await openAndSearch(user, 'fidelity');
    const row = await screen.findByRole('button', { name: /Fidelity/ });

    // Disabling these meant one failed registration call left every brokerage
    // unreachable, with no control left on the page to retry. The request is
    // queued instead, so the row stays live and says what is happening.
    expect(row).not.toBeDisabled();
    expect(row).toHaveTextContent(/still setting up/);

    await user.click(row);
    expect(onSelectSnapTrade).toHaveBeenCalledWith(
      expect.objectContaining({ providerInstitutionId: 'FIDELITY' }),
    );
  });
});
