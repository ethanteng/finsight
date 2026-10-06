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

function mockFetch(matchCount: number) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  global.fetch = jest.fn().mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    let body: unknown = {};
    if (url.endsWith('/options')) body = { success: true, data: options };
    else if (url.endsWith('/matches')) body = { success: true, data: { count: matchCount } };
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

  it('says which way the money goes for money coming in', async () => {
    mockFetch(4);
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
});
