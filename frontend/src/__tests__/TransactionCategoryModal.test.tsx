import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import TransactionCategoryModal, {
  type TransactionCategorySubject,
} from '@/components/transactions/TransactionCategoryModal';

const options = [
  { primary: 'TRANSFER_OUT', label: 'Transfer out', detailed: [] },
  {
    primary: 'RENT_AND_UTILITIES',
    label: 'Rent and utilities',
    detailed: [{ value: 'RENT_AND_UTILITIES_RENT', label: 'Rent' }],
  },
];

const venmo: TransactionCategorySubject = {
  id: 'txn-1',
  name: 'Venmo',
  date: '2026-10-01',
  amount: -1200,
  category: ['TRANSFER_OUT'],
  isUserCategory: false,
};

function mockFetch(matchCount: number, direction: 'in' | 'out' = 'out', matches: Record<string, unknown> = {}) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  global.fetch = jest.fn().mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    let body: unknown = {};
    if (url.endsWith('/options')) body = { success: true, data: options };
    else if (url.endsWith('/matches')) body = { success: true, data: { count: matchCount, direction, ...matches } };
    else if (init?.method === 'DELETE') body = { success: true };
    else if (init?.method === 'PUT') {
      const sent = JSON.parse(String(init.body));
      body = {
        success: true,
        data: {
          transactionId: 'txn-1',
          category: ['RENT_AND_UTILITIES', 'RENT_AND_UTILITIES_RENT'],
          canonicalTransactionType: 'expense',
          ...(sent.applyToMatching ? { appliedTo: ['txn-1', 'txn-2', 'txn-3'] } : {}),
        },
      };
    }
    return Promise.resolve({ ok: true, status: 200, json: async () => body });
  }) as jest.Mock;
  return calls;
}

async function chooseRent() {
  fireEvent.change(await screen.findByLabelText('Category'), { target: { value: 'RENT_AND_UTILITIES' } });
  fireEvent.change(screen.getByLabelText('Subcategory'), { target: { value: 'RENT_AND_UTILITIES_RENT' } });
}

describe('TransactionCategoryModal', () => {
  it('can apply the category to every matching transaction', async () => {
    const calls = mockFetch(2);
    const onSaved = jest.fn();
    render(<TransactionCategoryModal transaction={venmo} onClose={jest.fn()} onSaved={onSaved} />);
    await chooseRent();

    const option = await screen.findByRole('checkbox', { name: /Also apply to 2 other transactions with Venmo/ });
    expect(option).not.toBeChecked();
    expect(screen.getByText(/Only money going out\. Refunds and other money coming in/)).toBeInTheDocument();
    fireEvent.click(option);
    fireEvent.click(screen.getByRole('button', { name: 'Save for 3 transactions' }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(3));
    const put = calls.find(call => call.init?.method === 'PUT')!;
    expect(put.url).toContain('/api/transaction-categories/txn-1');
    expect(JSON.parse(String(put.init!.body))).toEqual({
      primary: 'RENT_AND_UTILITIES', detailed: 'RENT_AND_UTILITIES_RENT', applyToMatching: true,
    });
    expect(onSaved.mock.calls.map(call => call[0])).toEqual(['txn-1', 'txn-2', 'txn-3']);
    expect(onSaved).toHaveBeenCalledWith('txn-2', ['RENT_AND_UTILITIES', 'RENT_AND_UTILITIES_RENT'], true, 'expense');
  });

  it('saves only the one transaction unless asked to', async () => {
    const calls = mockFetch(2);
    const onSaved = jest.fn();
    render(<TransactionCategoryModal transaction={venmo} onClose={jest.fn()} onSaved={onSaved} />);
    await chooseRent();
    await screen.findByRole('checkbox');
    fireEvent.click(screen.getByRole('button', { name: 'Save category' }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    const put = calls.find(call => call.init?.method === 'PUT')!;
    expect(JSON.parse(String(put.init!.body)).applyToMatching).toBe(false);
  });

  it('offers nothing when no other transaction matches', async () => {
    const calls = mockFetch(0);
    render(<TransactionCategoryModal transaction={venmo} onClose={jest.fn()} onSaved={jest.fn()} />);
    await chooseRent();
    await waitFor(() => expect(calls.some(call => call.url.endsWith('/matches'))).toBe(true));
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });

  it('offers new transactions alone when the payee has no others yet', async () => {
    const calls = mockFetch(0, 'out', { canApplyToMatching: true, rule: null });
    render(<TransactionCategoryModal transaction={venmo} onClose={jest.fn()} onSaved={jest.fn()} />);
    await chooseRent();
    fireEvent.click(await screen.findByRole('checkbox', { name: /^Also apply to new transactions with Venmo/ }));
    expect(screen.getByText(/New ones get it when they arrive\./)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Save category' }));
    await waitFor(() => expect(calls.some(call => call.init?.method === 'PUT')).toBe(true));
    expect(JSON.parse(String(calls.find(call => call.init?.method === 'PUT')!.init!.body)).applyToMatching).toBe(true);
  });

  it('says when the payee’s new transactions get a category, and stops that', async () => {
    const calls = mockFetch(2, 'out', {
      canApplyToMatching: true,
      rule: { id: 'rule-1', category: ['RENT_AND_UTILITIES', 'RENT_AND_UTILITIES_RENT'] },
    });
    render(<TransactionCategoryModal transaction={{ ...venmo, isUserCategory: true }} onClose={jest.fn()} onSaved={jest.fn()} />);
    expect(await screen.findByText(/New transactions with Venmo get Rent when they arrive\./))
      .toHaveTextContent('Restoring this one’s original category stops that too.');
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
    await waitFor(() => expect(screen.queryByText(/New transactions with Venmo get/)).not.toBeInTheDocument());
    expect(calls.find(call => call.init?.method === 'DELETE')!.url).toMatch(/\/api\/transaction-categories\/rules\/rule-1$/);
  });

  it('keeps a rule it could not stop, unless the server says it is already gone', async () => {
    const rule = { canApplyToMatching: true, rule: { id: 'rule-1', category: ['RENT_AND_UTILITIES', 'RENT_AND_UTILITIES_RENT'] } };
    let gone: unknown = {};
    mockFetch(2, 'out', rule);
    const fetchWithRule = global.fetch as jest.Mock;
    global.fetch = jest.fn((input: RequestInfo | URL, init?: RequestInit) => (init?.method === 'DELETE'
      ? Promise.resolve({ ok: false, status: 404, json: async () => gone })
      : fetchWithRule(input, init))) as jest.Mock;
    render(<TransactionCategoryModal transaction={venmo} onClose={jest.fn()} onSaved={jest.fn()} />);
    await screen.findByText(/New transactions with Venmo get/);

    // A server without the route says 404 too, and the rule is still there.
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('We couldn’t stop it.');
    expect(screen.getByText(/New transactions with Venmo get/)).toBeInTheDocument();

    gone = { success: false, error: 'No such rule', code: 'RULE_NOT_FOUND' };
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
    await waitFor(() => expect(screen.queryByText(/New transactions with Venmo get/)).not.toBeInTheDocument());
  });

  it('shows a calendar date as that day, wherever the user is', async () => {
    // West of UTC, midnight UTC on Oct 1 is still Sep 30.
    const zone = process.env.TZ;
    process.env.TZ = 'America/Los_Angeles';
    try {
      mockFetch(0);
      render(<TransactionCategoryModal transaction={venmo} onClose={jest.fn()} onSaved={jest.fn()} />);
      expect(await screen.findByText(/Oct 1, 2026/)).toBeInTheDocument();
    } finally {
      process.env.TZ = zone;
    }
  });

  it('says which way the money goes as the server reports it, not by the sign', async () => {
    // A card refund is stored positive, like a card purchase; only the server can tell them apart.
    mockFetch(4, 'in');
    render(
      <TransactionCategoryModal
        transaction={{ ...venmo, amount: 60, category: ['TRANSFER_IN'] }}
        onClose={jest.fn()}
        onSaved={jest.fn()}
      />
    );
    expect(await screen.findByRole('checkbox', { name: /Also apply to 4 other transactions with Venmo/ })).toBeInTheDocument();
    expect(screen.getByText(/Only money coming in\. Payments to them keep/)).toBeInTheDocument();
  });

  it('says money going out for a card purchase stored as a positive amount', async () => {
    mockFetch(3, 'out');
    render(
      <TransactionCategoryModal transaction={{ ...venmo, amount: 45 }} onClose={jest.fn()} onSaved={jest.fn()} />
    );
    await screen.findByRole('checkbox');
    expect(screen.getByText(/Only money going out\./)).toBeInTheDocument();
  });
});
