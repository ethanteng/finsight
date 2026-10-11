import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import TransactionList from '@/components/cash-flow/TransactionList';
import type { CashFlowItemTransaction } from '@/types/cash-flow';

const mockRouter = { push: jest.fn() };
jest.mock('next/navigation', () => ({ useRouter: () => mockRouter }));

const transaction = (overrides: Partial<CashFlowItemTransaction> & Pick<CashFlowItemTransaction, 'id' | 'date' | 'amount'>): CashFlowItemTransaction => ({
  label: 'Safeway',
  category: 'Groceries',
  categoryCodes: ['FOOD_AND_DRINK', 'FOOD_AND_DRINK_GROCERIES'],
  userCategory: false,
  payeeKey: 'safeway',
  countedBy: null,
  spreadBy: null,
  ...overrides,
});

const latest = [
  transaction({ id: 'g1', date: '2026-10-14', amount: 40 }),
  transaction({ id: 'g2', date: '2026-10-07', amount: 35 }),
];

describe('TransactionList', () => {
  beforeEach(() => {
    localStorage.setItem('auth_token', 'token');
    mockRouter.push.mockReset();
  });

  it('keeps the newer Show-all response when an older refetch finishes last', async () => {
    type Pending = { resolve: (value: { status: number; body: unknown }) => void };
    const pending: Pending[] = [];
    global.fetch = jest.fn().mockImplementation(() => new Promise(resolve => {
      pending.push({
        resolve: result => resolve({
          ok: result.status >= 200 && result.status < 300,
          status: result.status,
          json: async () => result.body,
        }),
      });
    })) as jest.Mock;

    const onChanged = jest.fn();
    const { rerender } = render(
      <TransactionList
        transactions={latest}
        count={3}
        transactionsRef="category:spending:groceries"
        flow="spending"
        apiUrl="http://api.test"
        withLabels
        onChanged={onChanged}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Show all 3' }));
    await waitFor(() => expect(pending).toHaveLength(1));
    await act(async () => {
      pending[0].resolve({
        status: 200,
        body: { transactions: [...latest, transaction({ id: 'g3', date: '2026-09-30', amount: 30, category: 'Groceries' })] },
      });
    });
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(3));

    // A category save reloads the report; an open list refetches. Overlap two of those.
    rerender(
      <TransactionList
        transactions={[transaction({ id: 'g1', date: '2026-10-14', amount: 40, category: 'Travel', categoryCodes: ['TRAVEL'] }), latest[1]]}
        count={3}
        transactionsRef="category:spending:groceries"
        flow="spending"
        apiUrl="http://api.test"
        withLabels
        onChanged={onChanged}
      />,
    );
    await waitFor(() => expect(pending).toHaveLength(2));

    rerender(
      <TransactionList
        transactions={[transaction({ id: 'g1', date: '2026-10-14', amount: 40, category: 'Shopping', categoryCodes: ['GENERAL_MERCHANDISE'] }), latest[1]]}
        count={3}
        transactionsRef="category:spending:groceries"
        flow="spending"
        apiUrl="http://api.test"
        withLabels
        onChanged={onChanged}
      />,
    );
    await waitFor(() => expect(pending).toHaveLength(3));

    const stale = [...latest, transaction({ id: 'g3', date: '2026-09-30', amount: 30, category: 'Travel', categoryCodes: ['TRAVEL'] })];
    const fresh = [...latest, transaction({ id: 'g3', date: '2026-09-30', amount: 30, category: 'Shopping', categoryCodes: ['GENERAL_MERCHANDISE'] })];
    // Newer response first, then the older one — without sequencing the stale category would win.
    await act(async () => {
      pending[2].resolve({ status: 200, body: { transactions: fresh } });
    });
    await waitFor(() => {
      expect(within(screen.getByRole('list')).getByRole('button', { name: /Change category: Safeway on Sep 30/ })).toHaveTextContent('Shopping');
    });
    await act(async () => {
      pending[1].resolve({ status: 200, body: { transactions: stale } });
    });
    expect(within(screen.getByRole('list')).getByRole('button', { name: /Change category: Safeway on Sep 30/ })).toHaveTextContent('Shopping');
    expect(within(screen.getByRole('list')).queryByRole('button', { name: /Change category: Safeway on Sep 30/ })!.textContent).not.toContain('Travel');
  });
});
