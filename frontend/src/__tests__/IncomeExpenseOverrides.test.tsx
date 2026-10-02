import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import IncomeExpenseOverrides, { type MonthlyHistory } from '@/components/finances/IncomeExpenseOverrides';
import type { ExpectedMonthlySummary } from '@/types/cash-flow';

const history: MonthlyHistory = {
  income: 11778,
  expense: 12712,
  monthCount: 2,
  firstMonth: '2026-08',
  lastMonth: '2026-09',
};

const forecast: ExpectedMonthlySummary = {
  income: 11662,
  spending: 5951,
  incomeSource: 'transactions',
  spendingSource: 'transactions',
  forecast: { available: true },
  learned: null,
};

function respond(expected: ExpectedMonthlySummary | null, overrides: Record<string, number | null> = {}) {
  const fetchMock = jest.fn(async (url: string, init?: RequestInit) => {
    if (url.endsWith('/api/cash-flow/expected-monthly')) {
      return expected
        ? { ok: true, status: 200, json: async () => expected }
        : { ok: true, status: 204, json: async () => ({}) };
    }
    const body = JSON.parse(String(init?.body ?? '{}'));
    return { ok: true, status: 200, json: async () => ({ success: true, monthlyIncome: null, monthlyExpense: null, ...overrides, ...body }) };
  });
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

describe('IncomeExpenseOverrides', () => {
  it('shows what the Cash Flow forecast expects, beside what actually happened', async () => {
    respond(forecast);
    render(<IncomeExpenseOverrides history={history} initialMonthlyIncome={null} initialMonthlyExpense={null} />);

    expect(await screen.findByText('$5,951')).toBeInTheDocument();
    expect(screen.getByText('$11,662')).toBeInTheDocument();
    expect(screen.getAllByText('Expected in a typical month, from your Cash Flow forecast')).toHaveLength(2);
    expect(screen.getByText('You averaged $12,712 a month over Aug–Sep 2026')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'See what it counts' })).toHaveAttribute('href', '/cash-flow');
  });

  it('shows an override as the figure, with what the forecast would expect without it', async () => {
    respond({ ...forecast, spending: 9035, spendingSource: 'override', learned: { income: 11662, spending: 5951 } });
    render(<IncomeExpenseOverrides history={history} initialMonthlyIncome={null} initialMonthlyExpense={9035} />);

    expect(await screen.findByText('From your transactions, the forecast would expect $5,951')).toBeInTheDocument();
    expect(screen.getByText('$9,035')).toBeInTheDocument();
    expect(screen.getByText('Your override. Your Cash Flow forecast and Ask Linc use it.')).toBeInTheDocument();
    expect(screen.getByText('You averaged $12,712 a month over Aug–Sep 2026')).toBeInTheDocument();
  });

  it('asks the forecast again once an override is cleared', async () => {
    const fetchMock = respond({ ...forecast, spending: 9035, spendingSource: 'override', learned: { income: 11662, spending: 5951 } });
    render(<IncomeExpenseOverrides history={history} initialMonthlyIncome={null} initialMonthlyExpense={9035} />);
    await screen.findByText('$9,035');

    fireEvent.click(screen.getByRole('button', { name: 'Clear Override' }));

    // Until the forecast answers again, the side shows what it learned without the override.
    expect(await screen.findByText('$5,951')).toBeInTheDocument();
    await waitFor(() => expect(
      fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/api/cash-flow/expected-monthly'))
    ).toHaveLength(2));
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/api/finances/overrides'), expect.objectContaining({
      method: 'PUT',
      body: JSON.stringify({ monthlyExpense: null }),
    }));
  });

  it('falls back to the history, said as such, while there is no forecast', async () => {
    respond({ ...forecast, income: null, spending: null, forecast: { available: false, reason: 'insufficient_history' } });
    render(<IncomeExpenseOverrides history={history} initialMonthlyIncome={null} initialMonthlyExpense={null} />);

    expect(await screen.findByText('$12,712')).toBeInTheDocument();
    expect(screen.getAllByText('Your average over Aug–Sep 2026. Your Cash Flow forecast isn’t available yet.')).toHaveLength(2);
  });

  it('shows N/A when there is neither a forecast nor a month of history', async () => {
    respond(null);
    render(
      <IncomeExpenseOverrides
        history={{ income: null, expense: null, monthCount: 0, firstMonth: null, lastMonth: null }}
        initialMonthlyIncome={null}
        initialMonthlyExpense={null}
      />
    );

    expect(await screen.findAllByText('N/A')).toHaveLength(2);
    expect(screen.queryByText(/Cash Flow forecast$/)).not.toBeInTheDocument();
  });
});
