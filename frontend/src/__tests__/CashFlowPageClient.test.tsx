import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import CashFlowPageClient from '@/app/cash-flow/CashFlowPageClient';
import type { CashFlowReport } from '@/types/cash-flow';

const mockRouter = { push: jest.fn() };
jest.mock('next/navigation', () => ({ useRouter: () => mockRouter }));
// Recharts needs ResizeObserver and real layout; the figures are covered by the table.
jest.mock('@/components/cash-flow/CashFlowChart', () => ({
  __esModule: true,
  default: () => <div data-testid="cash-flow-chart" />,
  CashFlowChartLegend: () => null,
}));
jest.mock('@/components/cash-flow/CashPositionChart', () => ({
  __esModule: true,
  default: () => <div data-testid="cash-position-chart" />,
  CashPositionLegend: () => null,
}));

const totals = (income: number, spending: number) => ({ income, spending, net: income - spending });
const components = {
  recurringIncome: 5000, typicalIncome: 0, plannedIncome: 0,
  recurringSpending: 2015.49, typicalSpending: 1800, plannedSpending: 0, cardInterest: 0,
};

const pace = (
  paidOffBy: string | null,
  interest: number | null,
  carrying = true,
  payments: { nextPayment: { date: string; amount: number } | null; paymentsTwelveMonths: number } = { nextPayment: null, paymentsTwelveMonths: 0 },
) => ({
  paidOffBy, carryingBalanceNow: carrying, interestTwelveMonths: interest, interestTotal: interest, balanceInTwelveMonths: 0, months: [],
  ...payments,
});
const usualPayments = { nextPayment: { date: '2026-10-20', amount: 1520.83 }, paymentsTwelveMonths: 7349.62 };

function report(overrides: Partial<CashFlowReport> = {}): CashFlowReport {
  return {
    version: 1,
    currency: 'USD',
    today: '2026-10-15',
    dataThrough: '2026-10-14',
    forecastStart: '2026-10-15',
    granularity: 'month',
    range: { from: '2026-09-01', toExclusive: '2026-12-01' },
    coverageStart: '2026-06-03',
    forecast: { available: true },
    periods: [
      { key: '2026-09', start: '2026-09-01', endExclusive: '2026-10-01', clipped: false, phase: 'past', coverage: 'full', actual: totals(5000, 4100), forecast: null, total: totals(5000, 4100) },
      { key: '2026-10', start: '2026-10-01', endExclusive: '2026-11-01', clipped: false, phase: 'current', coverage: 'full', actual: totals(2500, 2400), forecast: { ...totals(2500, 1000), components }, total: totals(5000, 3400) },
      { key: '2026-11', start: '2026-11-01', endExclusive: '2026-12-01', clipped: false, phase: 'future', coverage: 'none', actual: null, forecast: { ...totals(5000, 3815.49), components }, total: totals(5000, 3815.49) },
    ],
    totals: { coverage: 'full', actual: totals(7500, 6500), forecast: totals(7500, 4815.49), total: totals(15000, 11315.49) },
    highlights: [
      { key: 'this_month', start: '2026-10-01', endExclusive: '2026-11-01', actualToDate: totals(2500, 2400), actualCoverage: 'full', remaining: { ...totals(2500, 1000), components }, projected: totals(5000, 3400), planned: totals(0, 0), projectedWithoutPlanned: totals(5000, 3400) },
      { key: 'this_quarter', start: '2026-10-01', endExclusive: '2027-01-01', actualToDate: totals(2500, 2400), actualCoverage: 'full', remaining: { ...totals(22500, 9000), components }, projected: totals(25000, 11400), planned: totals(10000, 0), projectedWithoutPlanned: totals(15000, 11400) },
      { key: 'next_12_months', start: '2026-10-15', endExclusive: '2027-10-15', actualToDate: null, actualCoverage: null, remaining: { ...totals(65000, 46000), components }, projected: totals(65000, 46000), planned: totals(10000, 0), projectedWithoutPlanned: totals(55000, 46000) },
    ],
    baseline: {
      typicalBasisStart: '2026-07-17', typicalBasisDays: 90, typicalMonthlyIncome: 0, typicalMonthlySpending: 1825,
      incomeSource: 'transactions', spendingSource: 'transactions', monthlyIncomeOverride: null, monthlyExpenseOverride: null,
    },
    recurring: [
      { id: 'income:gusto', payeeKey: 'gusto payroll', label: 'Gusto Payroll', flow: 'income', cadence: 'biweekly', amount: 2500, monthlyAmount: 5416.67, occurrences: 9, lastDate: '2026-10-09', nextDate: '2026-10-23', status: 'active', category: 'Wages', replacedByOverride: false, continuedByUser: false },
      { id: 'spending:rent', payeeKey: 'oak street apartments', label: 'Oak Street Apartments', flow: 'spending', cadence: 'monthly', amount: 2000, monthlyAmount: 2000, occurrences: 5, lastDate: '2026-10-01', nextDate: '2026-11-01', status: 'active', category: 'Rent', replacedByOverride: false, continuedByUser: false },
      { id: 'spending:gym', payeeKey: 'old gym', label: 'Old Gym', flow: 'spending', cadence: 'monthly', amount: 40, monthlyAmount: 40, occurrences: 3, lastDate: '2026-07-05', nextDate: null, status: 'lapsed', category: 'Gym', replacedByOverride: false, continuedByUser: false },
    ],
    oneOffThresholds: { income: 1000, spending: 1000 },
    typicalPayees: [
      { flow: 'spending', payeeKey: 'safeway', label: 'Safeway', monthlyAmount: 610.2, countedOneOffIds: [] },
      { flow: 'spending', payeeKey: 'trader joes', label: 'Trader Joes', monthlyAmount: 480, countedOneOffIds: [] },
    ],
    adjustments: [],
    oneOffs: [{ id: 'flight', date: '2026-09-10', label: 'United Airlines', flow: 'spending', amount: 2400 }],
    plannedEvents: [
      { id: 'bonus', label: 'Year-end bonus', kind: 'income', amount: 10000, startDate: '2026-12-15', recurrence: 'once', endDate: null, accountId: null, paymentMode: null, nextDate: '2026-12-15', occurrencesInRange: 0 },
    ],
    accounts: [
      { id: 'checking', name: 'Everyday Checking', institution: 'First Bank', kind: 'cash', subtype: 'checking', mask: '1234', balance: 5200 },
      { id: 'card', name: 'Rewards Card', institution: 'Card Co', kind: 'credit', subtype: 'credit card', mask: null, balance: 4000 },
    ],
    excluded: { unclassified: 2, currencyMismatch: 0 },
    cards: [{
      accountId: 'card', name: 'Rewards Card', mask: '9876', institution: 'Card Co', balance: 4000, apr: 24, minimumPayment: 80,
      paymentDay: 20, behavior: 'average_payment', usualMonthlyPayment: 1520.83, paymentSource: 'connected',
      currentPace: pace('2027-03', 112.4, true, usualPayments), withPlans: null, interestSaved: null,
      plansMatchCurrentPace: null, planIds: [],
    }],
    position: {
      available: true, startingCash: 5200, startingCardDebt: 4000,
      accounts: [
        { id: 'checking', name: 'Everyday Checking', institution: 'First Bank', subtype: 'checking', mask: '1234', balance: 5200, primary: true },
      ],
      accountIds: ['checking'],
      cardIds: ['card'],
      periods: [
        { key: '2026-09', cash: null, cardDebt: null, cardPayments: null, moneyIn: null, moneyOut: null },
        { key: '2026-10', cash: 3666.2, cardDebt: 3266.68, cardPayments: 1520.83, moneyIn: 4166.67, moneyOut: 4179.64 },
        { key: '2026-11', cash: 4410.15, cardDebt: 2495.4, cardPayments: 1520.83, moneyIn: 5416.67, moneyOut: 3151.89 },
      ],
      upcoming: [],
      lowPoint: { date: '2026-10-22', cash: 1890.4 },
      milestones: [], lowNext12Months: { date: '2026-10-22', cash: 1890.4 },
      transfers: { typicalMonthlyNet: 0, recurring: [] },
      cardsLeftOut: [],
    },
    snapshot: { computedAt: '2026-10-14T20:00:00.000Z', asOf: '2026-10-14T19:00:00.000Z', status: 'current' },
    ...overrides,
  };
}

type Handler = (url: string, init?: RequestInit) => { status: number; body?: unknown } | undefined;

function mockFetch(handler: Handler) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  global.fetch = jest.fn().mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    const result = handler(url, init) ?? { status: 404, body: {} };
    return Promise.resolve({
      ok: result.status >= 200 && result.status < 300,
      status: result.status,
      json: async () => result.body,
    });
  }) as jest.Mock;
  return calls;
}

/** A highlight card's breakdown, row by row: label, its detail line if any, and amount. */
function breakdown(card: HTMLElement): Array<[string, string | null, string]> {
  return Array.from(card.querySelectorAll('dl > div')).map(row => {
    const term = row.querySelector('dt')!;
    const label = Array.from(term.childNodes)
      .filter(node => node.nodeType === Node.TEXT_NODE)
      .map(node => node.textContent)
      .join('');
    return [label, term.querySelector('span')?.textContent ?? null, row.querySelector('dd')!.textContent!];
  });
}

describe('CashFlowPageClient', () => {
  beforeEach(() => {
    localStorage.setItem('auth_token', 'token');
    mockRouter.push.mockReset();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    localStorage.clear();
  });

  it('shows the backend’s figures: highlights, periods, planned events and the forecast basis', async () => {
    mockFetch(url => (url.includes('/api/cash-flow?') ? { status: 200, body: report() } : undefined));
    render(<CashFlowPageClient />);

    const thisMonth = await screen.findByRole('heading', { name: 'This month' });
    const card = thisMonth.closest('article')!;
    // One breakdown that adds up to the headline: +$100 so far, +$1,500 forecast.
    expect(breakdown(card)).toEqual([
      ['So far', 'Actual · Oct 1–14', '+$100'],
      ['Usual income and spending', 'Forecast · Oct 15–31', '+$1,500'],
      ['Expected to save', null, '+$1,600'],
    ]);

    const quarter = screen.getByRole('heading', { name: 'This quarter' }).closest('article')!;
    expect(breakdown(quarter)).toEqual([
      ['So far', 'Actual · Oct 1–14', '+$100'],
      ['Usual income and spending', 'Forecast · Oct 15 – Dec 31', '+$3,500'],
      ['Planned events', null, '+$10,000'],
      ['Expected to save', null, '+$13,600'],
    ]);

    // Nothing observed yet: the forecast covers the whole window, so it needs no dates.
    const year = screen.getByRole('heading', { name: 'Next 12 months' }).closest('article')!;
    expect(breakdown(year)).toEqual([
      ['Usual income and spending', null, '+$9,000'],
      ['Planned events', null, '+$10,000'],
      ['Expected to save', null, '+$19,000'],
    ]);

    expect(screen.getByRole('rowheader', { name: 'Oct 2026' })).toBeInTheDocument();
    expect(screen.getByText('Actual + forecast')).toBeInTheDocument();
    expect(screen.getByText('Year-end bonus')).toBeInTheDocument();
    expect(screen.getByText('Gusto Payroll')).toBeInTheDocument();
    expect(screen.getByText('United Airlines')).toBeInTheDocument();
    expect(screen.getByText('Old Gym')).toBeInTheDocument();
    expect(screen.getByText(/last Jul 5, 2026/)).toBeInTheDocument();
    expect(screen.getByText(/2 transactions couldn’t be classified/)).toBeInTheDocument();
    expect(screen.getAllByText('Beta').length).toBeGreaterThan(0);
  });

  it('breaks each highlight down into parts that add up to it exactly', async () => {
    mockFetch(url => (url.includes('/api/cash-flow?') ? {
      status: 200,
      body: report({
        highlights: [
          // $1,000.60 + $499.60 rounds to $1,001 + $500, a dollar over the $1,500 headline.
          { key: 'this_month', start: '2026-10-01', endExclusive: '2026-11-01', actualToDate: totals(1000.6, 0), actualCoverage: 'full', remaining: { ...totals(499.6, 0), components }, projected: totals(1500.2, 0), planned: totals(0, 0), projectedWithoutPlanned: totals(1500.2, 0) },
          // History starts inside the quarter: the headline is only what is still expected.
          { key: 'this_quarter', start: '2026-10-01', endExclusive: '2027-01-01', actualToDate: totals(500, 0), actualCoverage: 'partial', remaining: { ...totals(9000, 5000), components }, projected: null, planned: totals(0, 2000), projectedWithoutPlanned: null },
          { key: 'next_12_months', start: '2026-10-15', endExclusive: '2027-10-15', actualToDate: null, actualCoverage: null, remaining: { ...totals(65000, 46000), components }, projected: totals(65000, 46000), planned: totals(0, 0), projectedWithoutPlanned: totals(65000, 46000) },
        ],
      }),
    } : undefined));
    render(<CashFlowPageClient />);

    const month = (await screen.findByRole('heading', { name: 'This month' })).closest('article')!;
    expect(breakdown(month)).toEqual([
      ['So far', 'Actual · Oct 1–14', '+$1,001'],
      ['Usual income and spending', 'Forecast · Oct 15–31', '+$499'],
      ['Expected to save', null, '+$1,500'],
    ]);

    const quarter = screen.getByRole('heading', { name: 'This quarter' }).closest('article')!;
    expect(breakdown(quarter)).toEqual([
      ['Usual income and spending', 'Forecast · Oct 15 – Dec 31', '+$6,000'],
      ['Planned events', null, '−$2,000'],
      ['Expected for the rest of it', null, '+$4,000'],
    ]);
    expect(within(quarter).getByText(/full period can’t be added up yet\. Since then: \+\$500\./)).toBeInTheDocument();

    // A single part would only repeat the headline.
    const year = screen.getByRole('heading', { name: 'Next 12 months' }).closest('article')!;
    expect(within(year).getByText('+$19,000')).toBeInTheDocument();
    expect(breakdown(year)).toEqual([]);
  });

  it('asks for the chosen grouping and forecast length', async () => {
    const calls = mockFetch(url => (url.includes('/api/cash-flow?') ? { status: 200, body: report() } : undefined));
    const reportUrls = () => calls.map(call => call.url).filter(url => url.includes('/api/cash-flow?'));
    render(<CashFlowPageClient />);
    await screen.findByRole('heading', { name: 'This month' });

    expect(reportUrls()[0]).toContain('granularity=month&horizonMonths=6');
    fireEvent.click(screen.getByRole('button', { name: 'Quarterly' }));
    await waitFor(() => expect(reportUrls().at(-1)).toContain('granularity=quarter&horizonMonths=6'));
    fireEvent.change(screen.getByLabelText('Forecast length'), { target: { value: '12' } });
    await waitFor(() => expect(reportUrls().at(-1)).toContain('granularity=quarter&horizonMonths=12'));
  });

  it('requests a custom range once it is applied', async () => {
    const calls = mockFetch(url => (url.includes('/api/cash-flow?') ? { status: 200, body: report() } : undefined));
    render(<CashFlowPageClient />);
    await screen.findByRole('heading', { name: 'This month' });

    fireEvent.click(screen.getByRole('button', { name: 'Custom' }));
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-07-01' } });
    fireEvent.change(screen.getByLabelText('To'), { target: { value: '2026-12-31' } });
    fireEvent.click(screen.getByRole('button', { name: 'Show range' }));

    const reportUrls = () => calls.map(call => call.url).filter(url => url.includes('/api/cash-flow?'));
    await waitFor(() => expect(reportUrls().at(-1)).toContain('granularity=month&from=2026-07-01&to=2026-12-31'));
  });

  it('adds a planned event and reloads the forecast', async () => {
    const calls = mockFetch((url, init) => {
      if (url.endsWith('/api/cash-flow/events') && init?.method === 'POST') return { status: 201, body: { event: {} } };
      if (url.includes('/api/cash-flow?')) return { status: 200, body: report() };
      return undefined;
    });
    render(<CashFlowPageClient />);
    await screen.findByRole('heading', { name: 'This month' });

    fireEvent.click(screen.getByRole('button', { name: 'Add planned event' }));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'New laptop' } });
    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '2499.99' } });
    fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2026-11-20' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add to forecast' }));

    await waitFor(() => expect(calls.some(call => call.init?.method === 'POST')).toBe(true));
    const post = calls.find(call => call.init?.method === 'POST')!;
    expect(JSON.parse(String(post.init!.body))).toEqual({
      label: 'New laptop', kind: 'expense', amount: 2499.99, startDate: '2026-11-20', recurrence: 'once', endDate: null,
    });
    await waitFor(() => expect(calls.filter(call => call.url.includes('/api/cash-flow?'))).toHaveLength(2));
  });

  describe('changing what the forecast counts', () => {
    const adjusting = (body = report()) => mockFetch((url, init) => {
      if (url.endsWith('/api/cash-flow/adjustments') && init?.method === 'POST') return { status: 201, body: { adjustment: {} } };
      if (url.includes('/api/cash-flow/adjustments/') && init?.method === 'DELETE') return { status: 204 };
      if (url.includes('/api/cash-flow?')) return { status: 200, body };
      return undefined;
    });
    const posted = (calls: ReturnType<typeof mockFetch>) =>
      JSON.parse(String(calls.find(call => call.init?.method === 'POST')!.init!.body));
    const basis = async () => (await screen.findByRole('heading', { name: 'What the forecast counts' })).closest('section')!;

    it.each([
      ['Leave out: Oak Street Apartments', { kind: 'exclude_payee', flow: 'spending', key: 'oak street apartments' }],
      ['Leave out: Gusto Payroll', { kind: 'exclude_payee', flow: 'income', key: 'gusto payroll' }],
      ['Count it: United Airlines', { kind: 'include_one_off', flow: 'spending', key: 'flight' }],
      ['Keep counting: Old Gym', { kind: 'continue_stream', flow: 'spending', key: 'old gym' }],
    ])('%s saves the change and reloads the forecast', async (button, expected) => {
      const calls = adjusting();
      render(<CashFlowPageClient />);
      fireEvent.click(within(await basis()).getByRole('button', { name: button }));

      await waitFor(() => expect(calls.some(call => call.init?.method === 'POST')).toBe(true));
      expect(posted(calls)).toEqual(expected);
      await waitFor(() => expect(calls.filter(call => call.url.includes('/api/cash-flow?'))).toHaveLength(2));
    });

    it('says which account each regular item is expected in, once there is more than one', async () => {
      const joint = { id: 'joint', name: 'Joint Checking', institution: 'Second Bank', subtype: 'checking', mask: null, balance: 3000, primary: false };
      const [gusto, rent, gym] = report().recurring;
      const body = report({
        recurring: [
          { ...gusto, accountId: 'checking' },
          { ...gusto, id: 'income:gusto@joint', accountId: 'joint', amount: 1400 },
          { ...rent, accountId: 'joint' },
          { ...gym, accountId: 'card' },
        ],
        position: {
          ...report().position,
          accounts: [...report().position.accounts, joint],
          transfers: {
            typicalMonthlyNet: 0,
            recurring: [{ id: 'spending:vanguard', payeeKey: 'vanguard buy transfer', label: 'VANGUARD', accountId: 'checking', cadence: 'monthly', amount: 400, direction: 'out', nextDate: '2026-11-05' }],
          },
        },
      });
      mockFetch(url => (url.includes('/api/cash-flow?') ? { status: 200, body } : undefined));
      render(<CashFlowPageClient />);
      const section = await basis();
      expect(within(section).getByText('Every 2 weeks · next Oct 23, 2026 · Everyday Checking ••1234 · Wages')).toBeInTheDocument();
      expect(within(section).getByText('Every 2 weeks · next Oct 23, 2026 · Joint Checking · Wages')).toBeInTheDocument();
      expect(within(section).getByText('Every month · next Nov 1, 2026 · Joint Checking · Rent')).toBeInTheDocument();
      expect(within(section).getByText('Every month · last Jul 5, 2026 · Rewards Card ••9876 · Gym')).toBeInTheDocument();
      expect(within(section).getByText('Every month · next Nov 5, 2026 · Everyday Checking ••1234')).toBeInTheDocument();
    });

    it('names no account when there is only one', async () => {
      const [gusto] = report().recurring;
      const body = report({ cards: [], recurring: [{ ...gusto, accountId: 'checking' }] });
      mockFetch(url => (url.includes('/api/cash-flow?') ? { status: 200, body } : undefined));
      render(<CashFlowPageClient />);
      expect(within(await basis()).getByText('Every 2 weeks · next Oct 23, 2026 · Wages')).toBeInTheDocument();
    });

    it('lists what typical spending is made of, and leaves a payee out of it', async () => {
      const calls = adjusting();
      render(<CashFlowPageClient />);
      const section = await basis();
      expect(within(section).getByText('$610/mo')).toBeInTheDocument();
      fireEvent.click(within(section).getByRole('button', { name: 'Leave out: Safeway' }));
      await waitFor(() => expect(calls.some(call => call.init?.method === 'POST')).toBe(true));
      expect(posted(calls)).toEqual({ kind: 'exclude_payee', flow: 'spending', key: 'safeway' });
    });

    it('still offers typical income leave-out when spending is overridden', async () => {
      const body = report({
        baseline: {
          ...report().baseline,
          spendingSource: 'override',
          monthlyExpenseOverride: 4000,
          typicalMonthlySpending: 4000,
          typicalMonthlyIncome: 200,
        },
        typicalPayees: [{ flow: 'income', payeeKey: 'venmo', label: 'Venmo', monthlyAmount: 200 }],
      });
      const calls = adjusting(body);
      render(<CashFlowPageClient />);
      const section = await basis();
      expect(within(section).getByText('Other income')).toBeInTheDocument();
      fireEvent.click(within(section).getByRole('button', { name: 'Leave out: Venmo' }));
      await waitFor(() => expect(calls.some(call => call.init?.method === 'POST')).toBe(true));
      expect(posted(calls)).toEqual({ kind: 'exclude_payee', flow: 'income', key: 'venmo' });
    });

    it('shows the server’s reason when the item is no longer in the forecast', async () => {
      mockFetch((url, init) => {
        if (url.endsWith('/api/cash-flow/adjustments') && init?.method === 'POST') {
          return { status: 404, body: { error: 'That isn’t in your forecast anymore. Reload the page and try again.' } };
        }
        if (url.includes('/api/cash-flow?')) return { status: 200, body: report() };
        return undefined;
      });
      render(<CashFlowPageClient />);
      fireEvent.click(within(await basis()).getByRole('button', { name: 'Leave out: Oak Street Apartments' }));
      expect(await screen.findByRole('alert')).toHaveTextContent('That isn’t in your forecast anymore');
    });

    it('leaves a transfer out of the cash position', async () => {
      const body = report({
        position: {
          ...report().position,
          transfers: {
            typicalMonthlyNet: 0,
            recurring: [{ id: 'spending:vanguard', payeeKey: 'vanguard buy transfer', label: 'VANGUARD', cadence: 'monthly', amount: 400, direction: 'out', nextDate: '2026-11-05' }],
          },
        },
      });
      const calls = adjusting(body);
      render(<CashFlowPageClient />);
      fireEvent.click(within(await basis()).getByRole('button', { name: 'Leave out: VANGUARD' }));
      await waitFor(() => expect(calls.some(call => call.init?.method === 'POST')).toBe(true));
      expect(posted(calls)).toEqual({ kind: 'exclude_transfer', flow: 'spending', key: 'vanguard buy transfer' });
    });

    it('lists the first one-offs, shows the rest on request, and counts any of them', async () => {
      const oneOffs = Array.from({ length: 10 }, (_, index) => ({
        id: `one-off-${index}`, date: '2026-09-02', label: `Store ${index}`, flow: 'spending' as const, amount: 3000 - index * 100,
      }));
      const calls = adjusting(report({ oneOffs }));
      render(<CashFlowPageClient />);
      const section = await basis();
      expect(within(section).getByRole('button', { name: 'Count it: Store 7' })).toBeInTheDocument();
      expect(within(section).queryByRole('button', { name: 'Count it: Store 9' })).not.toBeInTheDocument();

      fireEvent.click(within(section).getByRole('button', { name: 'Show 2 more' }));
      fireEvent.click(within(section).getByRole('button', { name: 'Count it: Store 9' }));
      await waitFor(() => expect(calls.some(call => call.init?.method === 'POST')).toBe(true));
      expect(posted(calls)).toEqual({ kind: 'include_one_off', flow: 'spending', key: 'one-off-9' });
      expect(within(section).getByRole('button', { name: 'Show fewer' })).toBeInTheDocument();
    });

    it('always shows what is left out, and what would be, even when nothing is', async () => {
      adjusting(report({ oneOffs: [], recurring: report().recurring.filter(item => item.status === 'active') }));
      render(<CashFlowPageClient />);
      const section = await basis();
      expect(within(section).getByText(
        'A large amount that stands out from everything else from its payee in your last 90 days: $1,000 or more spent, or $1,000 or more received, and at least twice the rest from that payee. Amounts within ten days of each other, like a sum moved in pieces, count together. Counting one spreads it over those 90 days, as if amounts like it come that often.'
      )).toBeInTheDocument();
      expect(within(section).getByText('None in your last 90 days.')).toBeInTheDocument();
      expect(within(section).getByText('Nothing has stopped.')).toBeInTheDocument();
      expect(within(section).getByText('Nothing yet. Use Leave out on anything you don’t want projected.')).toBeInTheDocument();
    });

    it('shows the first eight of a long list, and the rest on request', async () => {
      const typicalPayees = Array.from({ length: 12 }, (_, index) => ({
        flow: 'spending' as const, payeeKey: `store ${index}`, label: `Store ${index}`, monthlyAmount: 500 - index * 10,
      }));
      adjusting(report({ typicalPayees }));
      render(<CashFlowPageClient />);
      const section = await basis();
      expect(within(section).getByText('Store 7')).toBeInTheDocument();
      expect(within(section).queryByText('Store 8')).not.toBeInTheDocument();
      fireEvent.click(within(section).getByRole('button', { name: 'Show 4 more' }));
      expect(within(section).getByText('Store 11')).toBeInTheDocument();
    });

    it('shows more eight at a time, all at once, fewer again, or none', async () => {
      const typicalPayees = Array.from({ length: 20 }, (_, index) => ({
        flow: 'spending' as const, payeeKey: `store ${index}`, label: `Store ${index}`, monthlyAmount: 500 - index * 10, countedOneOffIds: [],
      }));
      adjusting(report({ typicalPayees }));
      render(<CashFlowPageClient />);
      const section = await basis();
      const button = (name: string) => within(section).getByRole('button', { name });
      expect(within(section).queryByText('Store 8')).not.toBeInTheDocument();

      fireEvent.click(button('Show 8 more'));
      expect(within(section).getByText('Store 15')).toBeInTheDocument();
      expect(within(section).queryByText('Store 16')).not.toBeInTheDocument();

      fireEvent.click(button('Show all 20'));
      expect(within(section).getByText('Store 19')).toBeInTheDocument();

      fireEvent.click(button('Show fewer'));
      expect(within(section).getByText('Store 7')).toBeInTheDocument();
      expect(within(section).queryByText('Store 8')).not.toBeInTheDocument();

      fireEvent.click(button('Hide all'));
      expect(within(section).queryByText('Store 0')).not.toBeInTheDocument();
      expect(within(section).getByText('20 hidden')).toBeInTheDocument();
      fireEvent.click(button('Show 8 more'));
      expect(within(section).getByText('Store 0')).toBeInTheDocument();
    });

    it('shows each item’s category and its transactions’ dates and amounts', async () => {
      const [gusto, rent, gym] = report().recurring;
      const body = report({
        recurring: [gusto, {
          ...rent,
          transactions: [
            { id: 'rent-oct', date: '2026-10-01', amount: 2000, category: 'Rent' },
            { id: 'rent-sep', date: '2026-09-01', amount: 2000, category: 'Rent' },
          ],
          transactionCount: 5,
        }, gym],
        oneOffs: [{ ...report().oneOffs[0], category: 'Travel' }],
      });
      adjusting(body);
      render(<CashFlowPageClient />);
      const section = await basis();
      expect(within(section).getByText('Every month · next Nov 1, 2026 · Rent')).toBeInTheDocument();
      expect(within(section).getByText('Sep 10, 2026 · Travel')).toBeInTheDocument();

      const toggle = within(section).getByRole('button', { name: '5 transactions · latest Oct 1, 2026: $2,000.00' });
      expect(toggle).toHaveAttribute('aria-expanded', 'false');
      fireEvent.click(toggle);
      expect(toggle).toHaveAttribute('aria-expanded', 'true');
      expect(within(section).getByText('Sep 1, 2026 · Rent')).toBeInTheDocument();
      expect(within(section).getByText('Showing the latest 2 of 5.')).toBeInTheDocument();
    });

    it('marks a one-off the user counted where it now sits, and moves it back', async () => {
      const body = report({
        typicalPayees: [
          ...report().typicalPayees,
          { flow: 'spending', payeeKey: 'united airlines', label: 'United Airlines', monthlyAmount: 811.11, countedOneOffIds: ['flight'] },
        ],
        oneOffs: [],
        adjustments: [{ id: 'adj-flight', kind: 'include_one_off', flow: 'spending', key: 'flight', label: 'United Airlines', date: '2026-09-10', amount: 2400 }],
      });
      const calls = adjusting(body);
      render(<CashFlowPageClient />);
      const section = await basis();
      expect(within(section).getByText('counted by you')).toBeInTheDocument();
      fireEvent.click(within(section).getByRole('button', { name: 'Move back: United Airlines' }));
      await waitFor(() => expect(calls.some(call => call.init?.method === 'DELETE')).toBe(true));
      expect(calls.find(call => call.init?.method === 'DELETE')!.url).toMatch(/adjustments\/adj-flight$/);
    });

    it('does not credit a counted one-off that no longer puts anything in the typical rate', async () => {
      // The user once counted a United flight; now the payee's spending is typical on its own.
      const body = report({
        typicalPayees: [
          ...report().typicalPayees,
          { flow: 'spending', payeeKey: 'united airlines', label: 'United Airlines', monthlyAmount: 120, countedOneOffIds: [] },
        ],
        // Even a change that names the payee is not credited unless the payee says it counts.
        adjustments: [{ id: 'adj-old-flight', kind: 'include_one_off', flow: 'spending', key: 'old-flight', label: 'United Airlines', date: null, amount: null, payeeKey: 'united airlines' }],
      });
      adjusting(body);
      render(<CashFlowPageClient />);
      const section = await basis();
      expect(within(section).queryByText('counted by you')).not.toBeInTheDocument();
      expect(within(section).queryByRole('button', { name: 'Move back: United Airlines' })).not.toBeInTheDocument();
      expect(within(section).getByRole('button', { name: 'Leave out: United Airlines' })).toBeInTheDocument();
    });

    it('lists what the user left out, and puts it back', async () => {
      const body = report({
        adjustments: [{ id: 'adj-consu', kind: 'exclude_payee', flow: 'spending', key: 'ethan teng consu', label: 'Ethan Teng Consu', date: null, amount: null }],
      });
      const calls = adjusting(body);
      render(<CashFlowPageClient />);
      const section = await basis();
      // Under "Left out by you", and in the list of every change.
      expect(within(section).getAllByText('Ethan Teng Consu')).toHaveLength(2);
      fireEvent.click(within(section).getByRole('button', { name: 'Put back: Ethan Teng Consu' }));
      await waitFor(() => expect(calls.some(call => call.init?.method === 'DELETE')).toBe(true));
      expect(calls.find(call => call.init?.method === 'DELETE')!.url).toMatch(/adjustments\/adj-consu$/);
    });

    it('lists the user’s changes and undoes one', async () => {
      const body = report({
        adjustments: [
          { id: 'adj-1', kind: 'exclude_payee', flow: 'spending', key: 'oak street apartments', label: 'Oak Street Apartments', date: null, amount: null },
          { id: 'adj-2', kind: 'include_one_off', flow: 'spending', key: 'flight', label: 'United Airlines', date: '2026-09-10', amount: 2400 },
        ],
      });
      const calls = adjusting(body);
      render(<CashFlowPageClient />);
      const section = await basis();
      expect(within(section).getByText('Spending left out of the forecast')).toBeInTheDocument();
      expect(within(section).getByText('Counted in typical spending: $2,400.00 on Sep 10, 2026')).toBeInTheDocument();

      fireEvent.click(within(section).getByRole('button', { name: 'Undo: Oak Street Apartments' }));
      await waitFor(() => expect(calls.some(call => call.init?.method === 'DELETE')).toBe(true));
      expect(calls.find(call => call.init?.method === 'DELETE')!.url).toMatch(/\/api\/cash-flow\/adjustments\/adj-1$/);
      await waitFor(() => expect(calls.filter(call => call.url.includes('/api/cash-flow?'))).toHaveLength(2));
    });

    it('stops counting an item the user kept', async () => {
      const kept = { ...report().recurring[2], status: 'active' as const, continuedByUser: true, continuedBy: 'adj-gym', nextDate: '2026-11-05' };
      const body = report({
        recurring: [report().recurring[0], report().recurring[1], kept],
        // Saved under the payee's earlier key, which the report's continuedBy still names.
        adjustments: [{ id: 'adj-gym', kind: 'continue_stream', flow: 'spending', key: 'old gym nd', label: 'Old Gym', date: null, amount: null }],
      });
      const calls = adjusting(body);
      render(<CashFlowPageClient />);
      const section = await basis();
      expect(within(section).getByText(/kept by you/)).toBeInTheDocument();
      fireEvent.click(within(section).getByRole('button', { name: 'Stop counting: Old Gym' }));
      await waitFor(() => expect(calls.some(call => call.init?.method === 'DELETE')).toBe(true));
      expect(calls.find(call => call.init?.method === 'DELETE')!.url).toMatch(/adjustments\/adj-gym$/);
    });

    it('shows typical income and its payees when only spending is overridden', async () => {
      const body = report({
        baseline: { ...report().baseline, spendingSource: 'override', monthlyExpenseOverride: 6000, typicalMonthlyIncome: 3211 },
        typicalPayees: [{ flow: 'income', payeeKey: 'acme corp consulting', label: 'ACME CORP CONSULTING', monthlyAmount: 3210.65 }],
      });
      const calls = adjusting(body);
      render(<CashFlowPageClient />);
      const section = await basis();
      expect(within(section).getByText((_, element) =>
        element?.tagName === 'P' && /^Other income: about \$3,211 a month, spread evenly/.test(element.textContent ?? ''))).toBeInTheDocument();
      expect(within(section).getByText('Your monthly spending of $6,000 from the Finances page is used instead.')).toBeInTheDocument();
      fireEvent.click(within(section).getByRole('button', { name: 'Leave out: ACME CORP CONSULTING' }));
      await waitFor(() => expect(calls.some(call => call.init?.method === 'POST')).toBe(true));
      expect(posted(calls)).toEqual({ kind: 'exclude_payee', flow: 'income', key: 'acme corp consulting' });
    });

    it('offers no change a monthly override would cancel, and says which saved ones it does', async () => {
      const body = report({
        baseline: { ...report().baseline, incomeSource: 'override', monthlyIncomeOverride: 8000 },
        oneOffs: [...report().oneOffs, { id: 'bonus-deposit', date: '2026-09-01', label: 'Signing bonus', flow: 'income', amount: 5000 }],
        recurring: [
          ...report().recurring,
          { ...report().recurring[0], id: 'income:old-client', payeeKey: 'old client', label: 'Old Client', status: 'lapsed', nextDate: null },
        ],
        adjustments: [
          { id: 'adj-income', kind: 'include_one_off', flow: 'income', key: 'tax-refund', label: 'Tax refund', date: '2026-04-15', amount: 1850 },
          { id: 'adj-employer', kind: 'exclude_payee', flow: 'income', key: 'old employer', label: 'Old Employer', date: null, amount: null },
          { id: 'adj-rent', kind: 'exclude_payee', flow: 'spending', key: 'oak street apartments', label: 'Oak Street Apartments', date: null, amount: null },
        ],
      });
      adjusting(body);
      render(<CashFlowPageClient />);
      const section = await basis();
      // Income is overridden: counting income or keeping it would change nothing.
      expect(within(section).queryByRole('button', { name: 'Count it: Signing bonus' })).not.toBeInTheDocument();
      expect(within(section).queryByRole('button', { name: 'Keep counting: Old Client' })).not.toBeInTheDocument();
      // Spending is still learned from transactions.
      expect(within(section).getByRole('button', { name: 'Count it: United Airlines' })).toBeInTheDocument();
      expect(within(section).getByRole('button', { name: 'Keep counting: Old Gym' })).toBeInTheDocument();
      expect(within(section).getByText(/Counted in typical income: \$1,850\.00 on Apr 15, 2026 · no effect while your monthly income from Finances is set/)).toBeInTheDocument();
      // Nothing reads learned income under an income override, so leaving income out does nothing either.
      expect(within(section).getByText('Income left out of the forecast · no effect while your monthly income from Finances is set')).toBeInTheDocument();
      expect(within(section).getByText('Spending left out of the forecast')).toBeInTheDocument();
    });

    it('does not claim a spending leave-out is inert under a spending override', async () => {
      // Leaving a payee out still reshapes how an override is split across cards.
      const body = report({
        baseline: { ...report().baseline, spendingSource: 'override', monthlyExpenseOverride: 6000 },
        adjustments: [
          { id: 'adj-rent', kind: 'exclude_payee', flow: 'spending', key: 'oak street apartments', label: 'Oak Street Apartments', date: null, amount: null },
          { id: 'adj-flight', kind: 'include_one_off', flow: 'spending', key: 'flight', label: 'United Airlines', date: '2026-09-10', amount: 2400 },
        ],
      });
      adjusting(body);
      render(<CashFlowPageClient />);
      const section = await basis();
      expect(within(section).getByText('Spending left out of the forecast')).toBeInTheDocument();
      expect(within(section).queryByText(/Spending left out of the forecast · no effect/)).not.toBeInTheDocument();
      expect(within(section).getByText(/Counted in typical spending: \$2,400\.00 on Sep 10, 2026 · no effect while your monthly spending from Finances is set/)).toBeInTheDocument();
    });

    it('shows the server’s reason when a change is refused', async () => {
      mockFetch((url, init) => {
        if (url.endsWith('/api/cash-flow/adjustments') && init?.method === 'POST') {
          return { status: 409, body: { error: 'You can make up to 200 changes to the forecast' } };
        }
        if (url.includes('/api/cash-flow?')) return { status: 200, body: report() };
        return undefined;
      });
      render(<CashFlowPageClient />);
      fireEvent.click(within(await basis()).getByRole('button', { name: 'Leave out: Oak Street Apartments' }));
      expect(await screen.findByRole('alert')).toHaveTextContent('You can make up to 200 changes to the forecast');
    });

    it('sends what isn’t really income or spending to recategorizing, which fixes history too', async () => {
      adjusting();
      render(<CashFlowPageClient />);
      const section = await basis();
      const links = within(section).getAllByRole('link', { name: 'Accounts & context' });
      expect(links[0]).toHaveAttribute('href', '/profile');
    });
  });

  it('shows the server’s reason when an event is rejected', async () => {
    mockFetch((url, init) => {
      if (url.endsWith('/api/cash-flow/events') && init?.method === 'POST') return { status: 400, body: { error: 'Enter a valid date' } };
      if (url.includes('/api/cash-flow?')) return { status: 200, body: report() };
      return undefined;
    });
    render(<CashFlowPageClient />);
    await screen.findByRole('heading', { name: 'This month' });

    fireEvent.click(screen.getByRole('button', { name: 'Add planned event' }));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Trip' } });
    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '800' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add to forecast' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Enter a valid date');
  });

  it('removes a planned event after confirmation', async () => {
    const calls = mockFetch((url, init) => {
      if (url.endsWith('/api/cash-flow/events/bonus') && init?.method === 'DELETE') return { status: 204 };
      if (url.includes('/api/cash-flow?')) return { status: 200, body: report() };
      return undefined;
    });
    render(<CashFlowPageClient />);
    await screen.findByRole('heading', { name: 'This month' });

    fireEvent.click(screen.getByRole('button', { name: 'Remove Year-end bonus' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Remove' }));

    await waitFor(() => expect(calls.some(call => call.init?.method === 'DELETE')).toBe(true));
  });

  it('withholds range totals that history does not fully cover, and says why', async () => {
    mockFetch(url => (url.includes('/api/cash-flow?')
      ? { status: 200, body: report({ totals: { coverage: 'partial', actual: null, forecast: totals(7500, 4815.49), total: null } }) }
      : undefined));
    render(<CashFlowPageClient />);

    expect(await screen.findByText(/No totals for this range: your history starts Jun 3, 2026/)).toBeInTheDocument();
    expect(screen.queryByRole('rowheader', { name: 'Total' })).not.toBeInTheDocument();
  });

  it('switches the chart to the cash position and names its lowest point', async () => {
    mockFetch(url => (url.includes('/api/cash-flow?') ? { status: 200, body: report() } : undefined));
    render(<CashFlowPageClient />);
    await screen.findByRole('heading', { name: 'This month' });

    expect(screen.getByTestId('cash-flow-chart')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cash position' }));
    expect(screen.getByTestId('cash-position-chart')).toBeInTheDocument();
    expect(screen.getByText(/Lowest point: \$1,890 on Oct 22, 2026/)).toBeInTheDocument();
  });

  it('says why there is no cash position', async () => {
    mockFetch(url => (url.includes('/api/cash-flow?')
      ? { status: 200, body: report({ position: { ...report().position, available: false, reason: 'unknown_balance', lowPoint: null } }) }
      : undefined));
    render(<CashFlowPageClient />);
    await screen.findByRole('heading', { name: 'This month' });
    fireEvent.click(screen.getByRole('button', { name: 'Cash position' }));
    expect(screen.getByText(/didn’t report a balance/)).toBeInTheDocument();
    // With no cash position there are no figures to list by period.
    expect(screen.queryByText('See every period')).not.toBeInTheDocument();
  });

  describe('the cash position for chosen accounts', () => {
    const savings = {
      id: 'savings', name: 'High Yield Savings', institution: 'First Bank', subtype: 'savings', mask: '5678', balance: 10000, primary: false,
    };
    const both = (overrides: Partial<CashFlowReport['position']> = {}) => report({
      position: {
        ...report().position,
        accounts: [...report().position.accounts, savings],
        accountIds: ['checking', 'savings'],
        startingCash: 15200,
        ...overrides,
      },
    });
    const checkingOnly = (overrides: Partial<CashFlowReport['position']> = {}) => both({ accountIds: ['checking'], startingCash: 5200, ...overrides });
    const answer = (url: string) => {
      if (!url.includes('/api/cash-flow?')) return undefined;
      return { status: 200, body: url.includes('accounts=checking') ? checkingOnly() : both() };
    };

    it('shows one account on its own, and remembers the choice', async () => {
      const calls = mockFetch(answer);
      render(<CashFlowPageClient />);
      await screen.findByRole('heading', { name: 'This month' });
      fireEvent.click(screen.getByRole('button', { name: 'Cash position' }));
      expect(screen.getByRole('button', { name: 'All accounts' })).toHaveAttribute('aria-pressed', 'true');
      expect(screen.getByText(/Starts from \$15,200 across your checking and savings\./)).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Everyday Checking ••1234' }));
      await waitFor(() => expect(calls.some(call => call.url.includes('accounts=checking'))).toBe(true));
      expect(await screen.findByText(/Starts from \$5,200 in Everyday Checking ••1234\./)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Everyday Checking ••1234' })).toHaveAttribute('aria-pressed', 'true');
      expect(screen.getByRole('button', { name: 'All accounts' })).toHaveAttribute('aria-pressed', 'false');
      expect(JSON.parse(localStorage.getItem('cashFlow.positionAccounts')!)).toEqual(['checking']);

      fireEvent.click(screen.getByRole('button', { name: 'All accounts' }));
      expect(await screen.findByText(/Starts from \$15,200 across your checking and savings\./)).toBeInTheDocument();
      expect(calls[calls.length - 1].url).not.toContain('accounts=');
      expect(localStorage.getItem('cashFlow.positionAccounts')).toBeNull();
    });

    it('opens on the accounts chosen last time', async () => {
      localStorage.setItem('cashFlow.positionAccounts', JSON.stringify(['checking']));
      const calls = mockFetch(answer);
      render(<CashFlowPageClient />);
      await screen.findByRole('heading', { name: 'This month' });
      expect(calls.find(call => call.url.includes('/api/cash-flow?'))!.url).toContain('accounts=checking');
    });

    it('still offers the accounts when the chosen one can’t be added up', async () => {
      mockFetch(url => (url.includes('/api/cash-flow?')
        ? { status: 200, body: both({ available: false, reason: 'unknown_balance', accountIds: ['savings'] }) }
        : undefined));
      render(<CashFlowPageClient />);
      await screen.findByRole('heading', { name: 'This month' });
      fireEvent.click(screen.getByRole('button', { name: 'Cash position' }));
      expect(screen.getByText('One of the accounts you chose didn’t report a balance, so its cash position can’t be added up yet.')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'All accounts' })).toBeInTheDocument();
    });

    it('lists what is coming up, with the balance after each day', async () => {
      const upcoming = Array.from({ length: 10 }, (_, index) => ({
        date: `2026-10-${String(16 + index).padStart(2, '0')}`,
        label: index === 0 ? 'Gusto Payroll' : `Bill ${index}`,
        kind: index === 0 ? 'income' as const : 'bill' as const,
        amount: index === 0 ? 2500 : -100,
        balanceAfter: index === 0 ? 7700 : -100 * index,
      }));
      mockFetch(url => (url.includes('/api/cash-flow?') ? { status: 200, body: checkingOnly({ upcoming }) } : undefined));
      render(<CashFlowPageClient />);
      await screen.findByRole('heading', { name: 'This month' });
      fireEvent.click(screen.getByRole('button', { name: 'Cash position' }));

      const list = screen.getByRole('heading', { name: 'Coming up in the next month' }).closest('div')!;
      expect(within(list).getByText('Gusto Payroll')).toBeInTheDocument();
      expect(within(list).getByText('Oct 16, 2026 · Regular income')).toBeInTheDocument();
      expect(within(list).getByText('+$2,500')).toBeInTheDocument();
      expect(within(list).getByText('$7,700 after')).toBeInTheDocument();
      expect(within(list).queryByText('Bill 9')).not.toBeInTheDocument();
      fireEvent.click(within(list).getByRole('button', { name: 'Show all 10' }));
      expect(within(list).getByText('Bill 9')).toBeInTheDocument();
      expect(within(list).getByText('−$900 after')).toBeInTheDocument();
    });

    it.each([
      [{ in: 12.4, out: 85.2 }, 'Everything else isn’t listed: it’s spread evenly across the days, about $85 out and $12 in each day.'],
      [{ in: 43.86, out: 0 }, 'Everything else isn’t listed: it’s spread evenly across the days, about $44 in each day.'],
      [undefined, 'Everyday spending isn’t listed: it’s spread across the days.'],
    ])('says what moves the balance between the listed items (%o)', async (spreadPerDay, note) => {
      const upcoming = [{ date: '2026-10-16', label: 'Gusto Payroll', kind: 'income' as const, amount: 2500, balanceAfter: 7700 }];
      mockFetch(url => (url.includes('/api/cash-flow?') ? { status: 200, body: checkingOnly({ upcoming, spreadPerDay }) } : undefined));
      render(<CashFlowPageClient />);
      await screen.findByRole('heading', { name: 'This month' });
      fireEvent.click(screen.getByRole('button', { name: 'Cash position' }));
      const list = screen.getByRole('heading', { name: 'Coming up in the next month' }).closest('div')!;
      expect(within(list).getByText(`Paychecks, bills, transfers, card payments and planned events, with the balance at the end of each day. ${note}`))
        .toBeInTheDocument();
    });

    it('says nothing more when nothing is spread', async () => {
      const upcoming = [{ date: '2026-10-16', label: 'Gusto Payroll', kind: 'income' as const, amount: 2500, balanceAfter: 7700 }];
      mockFetch(url => (url.includes('/api/cash-flow?') ? { status: 200, body: checkingOnly({ upcoming, spreadPerDay: { in: 0, out: 0.2 } }) } : undefined));
      render(<CashFlowPageClient />);
      await screen.findByRole('heading', { name: 'This month' });
      fireEvent.click(screen.getByRole('button', { name: 'Cash position' }));
      const list = screen.getByRole('heading', { name: 'Coming up in the next month' }).closest('div')!;
      expect(within(list).getByText('Paychecks, bills, transfers, card payments and planned events, with the balance at the end of each day.'))
        .toBeInTheDocument();
    });

    it('lets planned income land in a chosen account', async () => {
      const calls = mockFetch((url, init) => {
        if (url.endsWith('/api/cash-flow/events') && init?.method === 'POST') return { status: 201, body: { event: {} } };
        return answer(url);
      });
      render(<CashFlowPageClient />);
      await screen.findByRole('heading', { name: 'Credit cards' });

      fireEvent.click(screen.getByRole('button', { name: 'Add planned event' }));
      fireEvent.click(screen.getByRole('button', { name: 'Money in' }));
      // A new event follows the primary account until another is picked.
      expect(screen.getByLabelText('Account')).toHaveValue('');
      expect(screen.getByRole('option', { name: 'Primary account (Everyday Checking ••1234)' })).toBeInTheDocument();
      fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Gift' } });
      fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '1000' } });
      fireEvent.change(screen.getByLabelText('Account'), { target: { value: 'savings' } });
      fireEvent.click(screen.getByRole('button', { name: 'Add to forecast' }));

      await waitFor(() => expect(calls.some(call => call.init?.method === 'POST')).toBe(true));
      expect(JSON.parse(String(calls.find(call => call.init?.method === 'POST')!.init!.body))).toMatchObject({
        label: 'Gift', kind: 'income', amount: 1000, accountId: 'savings',
      });
    });

    it('names the account each planned income or expense lands in', async () => {
      const gift = {
        id: 'gift', label: 'Gift', kind: 'income', amount: 1000, startDate: '2026-11-01', recurrence: 'once', endDate: null,
        accountId: 'savings', paymentMode: null, nextDate: '2026-11-01', occurrencesInRange: 1,
      } as const;
      mockFetch(url => (url.includes('/api/cash-flow?')
        ? { status: 200, body: { ...both(), plannedEvents: [...report().plannedEvents, gift] } }
        : undefined));
      render(<CashFlowPageClient />);
      const panel = (await screen.findByRole('heading', { name: 'Planned events' })).closest('section')!;
      expect(within(panel).getByText(/Once on Nov 1, 2026 · High Yield Savings ••5678/)).toBeInTheDocument();
      // The bonus was saved without an account, so it lands in the primary one.
      expect(within(panel).getByText(/Once on Dec 15, 2026 · Everyday Checking ••1234/)).toBeInTheDocument();
    });

    it('falls back to the primary account when editing an event on a disconnected one', async () => {
      // Saved without an account, it follows the primary one rather than being pinned to it.
      const orphan = {
        id: 'orphan', label: 'Old gift', kind: 'income', amount: 500, startDate: '2026-11-10', recurrence: 'once', endDate: null,
        accountId: 'gone', paymentMode: null, nextDate: '2026-11-10', occurrencesInRange: 1,
      } as const;
      const calls = mockFetch((url, init) => {
        if (url.includes('/api/cash-flow/events/') && init?.method === 'PUT') return { status: 200, body: { event: {} } };
        if (url.includes('/api/cash-flow?')) return { status: 200, body: { ...both(), plannedEvents: [orphan] } };
        return undefined;
      });
      render(<CashFlowPageClient />);
      const panel = (await screen.findByRole('heading', { name: 'Planned events' })).closest('section')!;
      expect(within(panel).getByText(/account no longer connected/)).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Edit Old gift' }));
      expect(screen.getByLabelText('Account')).toHaveValue('');
      fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

      await waitFor(() => expect(calls.some(call => call.init?.method === 'PUT')).toBe(true));
      expect(JSON.parse(String(calls.find(call => call.init?.method === 'PUT')!.init!.body))).toMatchObject({
        accountId: null,
      });
    });

    it('keeps an event without an account following the primary one unless an account is picked', async () => {
      const bonus = report().plannedEvents[0];
      const saved = (calls: Array<{ url: string; init?: RequestInit }>) =>
        JSON.parse(String(calls.filter(call => call.init?.method === 'PUT').pop()!.init!.body));
      const calls = mockFetch((url, init) => {
        if (url.includes('/api/cash-flow/events/') && init?.method === 'PUT') return { status: 200, body: { event: {} } };
        return answer(url);
      });
      render(<CashFlowPageClient />);
      await screen.findByRole('heading', { name: 'Planned events' });

      fireEvent.click(screen.getByRole('button', { name: `Edit ${bonus.label}` }));
      expect(screen.getByLabelText('Account')).toHaveValue('');
      fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
      await waitFor(() => expect(calls.some(call => call.init?.method === 'PUT')).toBe(true));
      expect(saved(calls)).toMatchObject({ accountId: null });

      fireEvent.click(await screen.findByRole('button', { name: `Edit ${bonus.label}` }));
      fireEvent.change(screen.getByLabelText('Account'), { target: { value: 'savings' } });
      fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
      await waitFor(() => expect(calls.filter(call => call.init?.method === 'PUT')).toHaveLength(2));
      expect(saved(calls)).toMatchObject({ accountId: 'savings' });

      // Picking the primary account by name pins it there.
      fireEvent.click(await screen.findByRole('button', { name: `Edit ${bonus.label}` }));
      fireEvent.change(screen.getByLabelText('Account'), { target: { value: 'checking' } });
      fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
      await waitFor(() => expect(calls.filter(call => call.init?.method === 'PUT')).toHaveLength(3));
      expect(saved(calls)).toMatchObject({ accountId: 'checking' });
    });
  });

  it('lists the cash position by period when the chart shows it', async () => {
    mockFetch(url => (url.includes('/api/cash-flow?') ? { status: 200, body: report() } : undefined));
    render(<CashFlowPageClient />);
    await screen.findByRole('heading', { name: 'This month' });
    const headers = () => screen.getAllByRole('columnheader').map(header => header.textContent);
    const cells = (period: string) =>
      within(screen.getByRole('rowheader', { name: period }).closest('tr')!).getAllByRole('cell').map(cell => cell.textContent);
    expect(headers()).toEqual(['Period', 'Cash in', 'Cash out', 'Net', 'Based on']);

    fireEvent.click(screen.getByRole('button', { name: 'Cash position' }));
    expect(headers()).toEqual(['Period', 'Money in', 'Money out', 'Paid to cards', 'Cash at end', 'Owed on cards at end']);
    expect(cells('Oct 2026')).toEqual(['$4,167', '$4,180', '$1,521', '$3,666', '$3,267']);
    expect(cells('Nov 2026')).toEqual(['$5,417', '$3,152', '$1,521', '$4,410', '$2,495']);
    // A month already over has nothing projected.
    expect(cells('Sep 2026')).toEqual(['—', '—', '—', '—', '—']);

    fireEvent.click(screen.getByRole('button', { name: 'Savings' }));
    expect(headers()).toEqual(['Period', 'Cash in', 'Cash out', 'Net', 'Based on']);
  });

  it('leaves the card columns out of the cash table when no card is projected', async () => {
    mockFetch(url => (url.includes('/api/cash-flow?')
      ? { status: 200, body: report({ cards: [], position: { ...report().position, cardIds: [], startingCardDebt: 0 } }) }
      : undefined));
    render(<CashFlowPageClient />);
    await screen.findByRole('heading', { name: 'This month' });
    fireEvent.click(screen.getByRole('button', { name: 'Cash position' }));
    expect(screen.getAllByRole('columnheader').map(header => header.textContent)).toEqual(['Period', 'Money in', 'Money out', 'Cash at end']);
    expect(within(screen.getByRole('rowheader', { name: 'Oct 2026' }).closest('tr')!).getAllByRole('cell').map(cell => cell.textContent))
      .toEqual(['$4,167', '$4,180', '$3,666']);
  });

  it('shows each card at its usual pace and with a plan, and what the plan saves', async () => {
    const card = {
      ...report().cards[0],
      withPlans: pace('2026-10', 21.3),
      interestSaved: { twelveMonths: 91.1, total: 91.1 },
      planIds: ['payoff'],
    };
    mockFetch(url => (url.includes('/api/cash-flow?') ? { status: 200, body: report({ cards: [card] }) } : undefined));
    render(<CashFlowPageClient />);

    const panel = (await screen.findByRole('heading', { name: 'Credit cards' })).closest('section')!;
    expect(within(panel).getByText('Rewards Card ••9876')).toBeInTheDocument();
    expect(within(panel).getByText('You’ve been paying about $1,521 a month')).toBeInTheDocument();
    expect(within(panel).getByText('Balance paid off by Mar 2027')).toBeInTheDocument();
    expect(within(panel).getByText('Balance paid off by Oct 2026')).toBeInTheDocument();
    expect(within(panel).getByText('Your plan saves $91 in interest over the next 12 months.')).toBeInTheDocument();
  });

  it('says what each pace pays a card next, and over the next 12 months', async () => {
    const card = {
      ...report().cards[0],
      withPlans: pace('2026-10', 21.3, true, { nextPayment: { date: '2026-10-20', amount: 2020.83 }, paymentsTwelveMonths: 9120.4 }),
      planIds: ['extra'],
    };
    const settled = {
      ...report().cards[0], accountId: 'spare', name: 'Spare Card', mask: '5555', balance: 0, behavior: 'pays_in_full' as const,
      usualMonthlyPayment: null, currentPace: pace(null, 0, false),
    };
    mockFetch(url => (url.includes('/api/cash-flow?') ? { status: 200, body: report({ cards: [card, settled] }) } : undefined));
    render(<CashFlowPageClient />);

    const panel = (await screen.findByRole('heading', { name: 'Credit cards' })).closest('section')!;
    expect(within(panel).getByText('Next payment $1,521 from your cash on Oct 20, 2026 · $7,350 over the next 12 months')).toBeInTheDocument();
    expect(within(panel).getByText('Next payment $2,021 from your cash on Oct 20, 2026 · $9,120 over the next 12 months')).toBeInTheDocument();
    // A card nothing is paid to says nothing about payments.
    const spare = within(panel).getByRole('heading', { name: 'Spare Card ••5555' }).closest('li')!;
    expect(within(spare).getByText('Not carrying a balance')).toBeInTheDocument();
    expect(within(spare).queryByText(/Next payment/)).not.toBeInTheDocument();
  });

  it('keeps a card paid from elsewhere out of what cash pays, and says so', async () => {
    const amex = {
      ...report().cards[0], accountId: 'amex', name: 'Marriott Amex', mask: '1005', balance: 1184, behavior: 'pays_in_full' as const,
      usualMonthlyPayment: null, paymentSource: 'other' as const,
      currentPace: pace('2026-10', 0, false, { nextPayment: { date: '2026-10-10', amount: 1184 }, paymentsTwelveMonths: 5017.8 }),
    };
    mockFetch(url => (url.includes('/api/cash-flow?')
      ? { status: 200, body: report({ cards: [...report().cards, amex], position: { ...report().position, cardIds: ['card', 'amex'] } }) }
      : undefined));
    render(<CashFlowPageClient />);

    const panel = (await screen.findByRole('heading', { name: 'Credit cards' })).closest('section')!;
    const card = within(panel).getByRole('heading', { name: 'Marriott Amex ••1005' }).closest('li')!;
    expect(within(card).getByText('Next payment $1,184 on Oct 10, 2026 · $5,018 over the next 12 months')).toBeInTheDocument();
    expect(within(card).getByText(/don’t seem to come from your connected accounts, so they aren’t taken out of your projected cash/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Cash position' }));
    expect(screen.getByText('Paid to cards leaves out Marriott Amex ••1005: its payments don’t seem to come from your connected accounts.')).toBeInTheDocument();
  });

  it('says in the savings view where planned card payments show', async () => {
    const note = 'Card payments aren’t cash out here: purchases already count when you make them. Your planned card payments show in Cash position.';
    const plan = {
      id: 'payoff', label: 'Pay off Rewards Card', kind: 'card_payment', amount: 0, startDate: '2026-10-25', recurrence: 'monthly',
      endDate: null, accountId: 'card', paymentMode: 'full', nextDate: '2026-10-25', occurrencesInRange: 2,
    } as const;
    const expired = { ...plan, id: 'expired', nextDate: null, occurrencesInRange: 0 };
    const orphan = {
      ...plan, id: 'orphan', accountId: 'mystery', label: 'Pay mystery card',
    };
    const mystery = {
      ...report().cards[0], accountId: 'mystery', name: 'Mystery Card', mask: '0000', behavior: 'unknown' as const,
      usualMonthlyPayment: null, currentPace: null, withPlans: null, planIds: ['orphan'],
    };
    mockFetch(url => (url.includes('/api/cash-flow?') ? { status: 200, body: report() } : undefined));
    const { unmount } = render(<CashFlowPageClient />);
    await screen.findByRole('heading', { name: 'This month' });
    expect(screen.queryByText(note)).not.toBeInTheDocument();
    unmount();

    // An expired plan, or a one-time plan on a card with no pace, never moves Cash position.
    mockFetch(url => (url.includes('/api/cash-flow?')
      ? { status: 200, body: report({ cards: [...report().cards, mystery], plannedEvents: [...report().plannedEvents, expired, orphan] }) }
      : undefined));
    const skipped = render(<CashFlowPageClient />);
    await screen.findByRole('heading', { name: 'This month' });
    expect(screen.queryByText(note)).not.toBeInTheDocument();
    skipped.unmount();

    mockFetch(url => (url.includes('/api/cash-flow?') ? { status: 200, body: report({ plannedEvents: [...report().plannedEvents, plan] }) } : undefined));
    render(<CashFlowPageClient />);
    await screen.findByRole('heading', { name: 'This month' });
    expect(screen.getByText(note)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cash position' }));
    expect(screen.queryByText(note)).not.toBeInTheDocument();
  });

  it('opens a card payment from the card and saves a full payoff', async () => {
    const calls = mockFetch((url, init) => {
      if (url.endsWith('/api/cash-flow/events') && init?.method === 'POST') return { status: 201, body: { event: {} } };
      if (url.includes('/api/cash-flow?')) return { status: 200, body: report() };
      return undefined;
    });
    render(<CashFlowPageClient />);
    await screen.findByRole('heading', { name: 'Credit cards' });

    fireEvent.click(screen.getByRole('button', { name: 'Plan a payment' }));
    expect(screen.getByLabelText('Name')).toHaveValue('Pay off Rewards Card');
    expect(screen.queryByLabelText('Amount')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2026-10-25' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add to forecast' }));

    await waitFor(() => expect(calls.some(call => call.init?.method === 'POST')).toBe(true));
    expect(JSON.parse(String(calls.find(call => call.init?.method === 'POST')!.init!.body))).toEqual({
      label: 'Pay off Rewards Card', kind: 'card_payment', amount: 0, startDate: '2026-10-25', recurrence: 'once', endDate: null,
      accountId: 'card', paymentMode: 'full',
    });
  });

  describe('a card already paid in full', () => {
    // Like the user's Chase card: paid in full every month, so the usual pace already pays each statement.
    const inFull = { nextPayment: { date: '2026-10-28', amount: 614 }, paymentsTwelveMonths: 2890.2 };
    const chase = (overrides: Record<string, unknown> = {}) => ({
      ...report().cards[0], accountId: 'chase', name: 'Chase Credit Card', mask: '4321', balance: 614,
      behavior: 'pays_in_full' as const, usualMonthlyPayment: null,
      currentPace: pace(null, 0, false, inFull), withPlans: null, interestSaved: null, plansMatchCurrentPace: null, planIds: [],
      ...overrides,
    });
    const sameNote = 'Same as your current pace: you already pay this card in full, so your plan doesn’t change your forecast.';

    it('says when a plan leaves the card where its usual pace does', async () => {
      mockFetch(url => (url.includes('/api/cash-flow?')
        ? { status: 200, body: report({ cards: [chase({ withPlans: pace(null, 0, false, inFull), interestSaved: { twelveMonths: 0, total: 0 }, plansMatchCurrentPace: 'exactly', planIds: ['chase'] })] }) }
        : undefined));
      render(<CashFlowPageClient />);
      expect(await screen.findByText(sameNote)).toBeInTheDocument();
    });

    it('says when a plan only moves the day the payment goes out', async () => {
      const earlier = { nextPayment: { date: '2026-11-02', amount: 731.91 }, paymentsTwelveMonths: 2890.2 };
      mockFetch(url => (url.includes('/api/cash-flow?')
        ? { status: 200, body: report({ cards: [chase({ withPlans: pace(null, 0, false, earlier), interestSaved: { twelveMonths: 0, total: 0 }, plansMatchCurrentPace: 'monthly', planIds: ['chase'] })] }) }
        : undefined));
      render(<CashFlowPageClient />);
      expect(await screen.findByText(
        'Same as your current pace: you already pay this card in full, so your plan only moves the day each payment leaves your cash. What you save and owe each month doesn’t change.'
      )).toBeInTheDocument();
      expect(screen.queryByText(sameNote)).not.toBeInTheDocument();
    });

    it('says nothing of the sort when the plan changes the card', async () => {
      mockFetch(url => (url.includes('/api/cash-flow?')
        ? { status: 200, body: report({ cards: [chase({ withPlans: pace(null, 0, false, inFull), plansMatchCurrentPace: null, planIds: ['chase'] })] }) }
        : undefined));
      render(<CashFlowPageClient />);
      await screen.findByRole('heading', { name: 'Credit cards' });
      expect(screen.queryByText(/^Same as your current pace/)).not.toBeInTheDocument();
    });

    it('warns in the form that paying it in full won’t change what you save', async () => {
      mockFetch(url => (url.includes('/api/cash-flow?') ? { status: 200, body: report({ cards: [chase()] }) } : undefined));
      render(<CashFlowPageClient />);
      await screen.findByRole('heading', { name: 'Credit cards' });

      fireEvent.click(screen.getByRole('button', { name: 'Plan a payment' }));
      expect(screen.getByText(
        'You already pay this card in full each month, so paying it off now only takes the money out of your cash sooner. It won’t change what you’re expected to save.'
      )).toBeInTheDocument();
      fireEvent.change(screen.getByLabelText('Repeats'), { target: { value: 'monthly' } });
      expect(screen.getByText(
        'You already pay this card in full each month, and your forecast already assumes you will, so this plan won’t change what you’re expected to save.'
      )).toBeInTheDocument();
      // A set amount can leave part of a statement unpaid, which does change it.
      fireEvent.click(screen.getByRole('button', { name: 'A set amount' }));
      expect(screen.queryByText(/You already pay this card in full each month/)).not.toBeInTheDocument();
    });

    it('makes no such promise beside a plan that sets a monthly amount', async () => {
      // Paying in full takes precedence over the set amount, so it can stop the interest that plan runs up.
      const setAmount = {
        id: 'set', label: 'Chase payment', kind: 'card_payment', amount: 100, startDate: '2026-10-20', recurrence: 'monthly',
        endDate: null, accountId: 'chase', paymentMode: 'fixed', nextDate: '2026-10-20', occurrencesInRange: 2,
      } as const;
      mockFetch(url => (url.includes('/api/cash-flow?')
        ? { status: 200, body: report({ cards: [chase({ planIds: ['set'] })], plannedEvents: [...report().plannedEvents, setAmount] }) }
        : undefined));
      render(<CashFlowPageClient />);
      await screen.findByRole('heading', { name: 'Credit cards' });

      fireEvent.click(screen.getByRole('button', { name: 'Plan a payment' }));
      expect(screen.getByLabelText('Name')).toHaveValue('Pay off Chase Credit Card');
      expect(screen.queryByText(/You already pay this card in full each month/)).not.toBeInTheDocument();
    });
  });

  it('starts a new plan on the first forecast day when today’s transactions are already in', async () => {
    const calls = mockFetch((url, init) => {
      if (url.endsWith('/api/cash-flow/events') && init?.method === 'POST') return { status: 201, body: { event: {} } };
      if (url.includes('/api/cash-flow?')) return { status: 200, body: report({ today: '2026-10-14', dataThrough: '2026-10-14', forecastStart: '2026-10-15' }) };
      return undefined;
    });
    render(<CashFlowPageClient />);
    await screen.findByRole('heading', { name: 'Credit cards' });

    fireEvent.click(screen.getByRole('button', { name: 'Plan a payment' }));
    expect(screen.getByLabelText('Date')).toHaveValue('2026-10-15');
    expect(screen.queryByText(/so this won’t change it/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Add to forecast' }));

    await waitFor(() => expect(calls.some(call => call.init?.method === 'POST')).toBe(true));
    expect(JSON.parse(String(calls.find(call => call.init?.method === 'POST')!.init!.body))).toMatchObject({ startDate: '2026-10-15' });
  });

  it('says when a planned date falls before the forecast starts', async () => {
    mockFetch(url => (url.includes('/api/cash-flow?') ? { status: 200, body: report() } : undefined));
    render(<CashFlowPageClient />);
    await screen.findByRole('heading', { name: 'Credit cards' });

    fireEvent.click(screen.getByRole('button', { name: 'Add planned event' }));
    fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2026-10-10' } });
    expect(screen.getByText('The forecast starts on Oct 15, 2026, so this won’t change it.')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2026-10-15' } });
    expect(screen.queryByText(/so this won’t change it/)).not.toBeInTheDocument();
  });

  it('shows a plan for a card with no usual pace, and what it counts', async () => {
    const card = {
      ...report().cards[0],
      behavior: 'unknown' as const, usualMonthlyPayment: null, minimumPayment: null,
      currentPace: null, withPlans: pace('2027-05', 210), planIds: ['monthly'],
    };
    mockFetch(url => (url.includes('/api/cash-flow?') ? { status: 200, body: report({ cards: [card] }) } : undefined));
    render(<CashFlowPageClient />);

    const panel = (await screen.findByRole('heading', { name: 'Credit cards' })).closest('section')!;
    expect(within(panel).queryByText('At your current pace')).not.toBeInTheDocument();
    expect(within(panel).getByText('With your plan')).toBeInTheDocument();
    expect(within(panel).getByText('Balance paid off by May 2027')).toBeInTheDocument();
    expect(within(panel).getByText('With no usual payment to go on, only the payments you plan are counted.')).toBeInTheDocument();

    // A one-time plan can't project such a card, so the shortcut starts on a monthly one.
    fireEvent.click(within(panel).getByRole('button', { name: 'Plan a payment' }));
    expect(screen.getByLabelText('Repeats')).toHaveValue('monthly');
  });

  it('warns that a one-time payment alone won’t project a card with no usual pace', async () => {
    const card = {
      ...report().cards[0],
      behavior: 'unknown' as const, usualMonthlyPayment: null, minimumPayment: null, currentPace: null, withPlans: null,
    };
    mockFetch(url => (url.includes('/api/cash-flow?') ? { status: 200, body: report({ cards: [card] }) } : undefined));
    render(<CashFlowPageClient />);
    const panel = (await screen.findByRole('heading', { name: 'Credit cards' })).closest('section')!;
    expect(within(panel).getByText('Plan a monthly payment to project this card’s balance and interest.')).toBeInTheDocument();

    fireEvent.click(within(panel).getByRole('button', { name: 'Plan a payment' }));
    const warning = /a one-time payment alone won’t project it/;
    expect(screen.queryByText(warning)).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Repeats'), { target: { value: 'once' } });
    expect(screen.getByText(warning)).toBeInTheDocument();
  });

  it('explains each card’s interest, including when a spending override already covers it', async () => {
    mockFetch(url => (url.includes('/api/cash-flow?') ? { status: 200, body: report() } : undefined));
    const { unmount } = render(<CashFlowPageClient />);
    const basis = (await screen.findByRole('heading', { name: 'How this forecast works' })).closest('section')!;
    expect(within(basis).getByText(/projected at 24% APR on any part of a statement left unpaid\./)).toBeInTheDocument();
    unmount();

    const overridden = report({
      baseline: { ...report().baseline, spendingSource: 'override', monthlyExpenseOverride: 6000 },
    });
    mockFetch(url => (url.includes('/api/cash-flow?') ? { status: 200, body: overridden } : undefined));
    render(<CashFlowPageClient />);
    const overriddenBasis = (await screen.findByRole('heading', { name: 'How this forecast works' })).closest('section')!;
    expect(within(overriddenBasis).getByText(/your monthly spending from the Finances page already includes its interest/)).toBeInTheDocument();
  });

  it('names the cards the cash position leaves out of card balances', async () => {
    const store = {
      ...report().cards[0], accountId: 'store', name: 'Store Card', mask: '1234', balance: null,
      currentPace: null, withPlans: null,
    };
    const body = report({
      cards: [...report().cards, store],
      position: { ...report().position, cardsLeftOut: [{ accountId: 'store', name: 'Store Card', reason: 'no_balance' }] },
    });
    mockFetch(url => (url.includes('/api/cash-flow?') ? { status: 200, body } : undefined));
    render(<CashFlowPageClient />);
    await screen.findByRole('heading', { name: 'This month' });

    fireEvent.click(screen.getByRole('button', { name: 'Cash position' }));
    expect(screen.getByText('Owed on credit cards leaves out Store Card ••1234 (its balance isn’t reported).')).toBeInTheDocument();
    const panel = screen.getByRole('heading', { name: 'Credit cards' }).closest('section')!;
    expect(within(panel).getByText('This card’s balance isn’t reported, so it can’t be projected.')).toBeInTheDocument();
  });

  it('plans a set monthly card payment from the form', async () => {
    const calls = mockFetch((url, init) => {
      if (url.endsWith('/api/cash-flow/events') && init?.method === 'POST') return { status: 201, body: { event: {} } };
      if (url.includes('/api/cash-flow?')) return { status: 200, body: report() };
      return undefined;
    });
    render(<CashFlowPageClient />);
    await screen.findByRole('heading', { name: 'Credit cards' });

    fireEvent.click(screen.getByRole('button', { name: 'Add planned event' }));
    fireEvent.click(screen.getByRole('button', { name: 'Pay a card' }));
    fireEvent.click(screen.getByRole('button', { name: 'A set amount' }));
    expect(screen.getByLabelText('Name')).toHaveValue('Rewards Card payment');
    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '750' } });
    fireEvent.change(screen.getByLabelText('Repeats'), { target: { value: 'monthly' } });
    fireEvent.change(screen.getByLabelText('First date'), { target: { value: '2026-11-01' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add to forecast' }));

    await waitFor(() => expect(calls.some(call => call.init?.method === 'POST')).toBe(true));
    expect(JSON.parse(String(calls.find(call => call.init?.method === 'POST')!.init!.body))).toMatchObject({
      kind: 'card_payment', amount: 750, recurrence: 'monthly', startDate: '2026-11-01', accountId: 'card', paymentMode: 'fixed',
    });
  });

  it('lists a card plan by what it does', async () => {
    const plan = {
      id: 'payoff', label: 'Pay off Rewards Card', kind: 'card_payment', amount: 0, startDate: '2026-10-25', recurrence: 'once',
      endDate: null, accountId: 'card', paymentMode: 'full', nextDate: '2026-10-25', occurrencesInRange: 1,
    } as const;
    mockFetch(url => (url.includes('/api/cash-flow?') ? { status: 200, body: report({ plannedEvents: [plan] }) } : undefined));
    render(<CashFlowPageClient />);

    expect(await screen.findByText(/Pay off in full on Oct 25, 2026 · Rewards Card ••9876/)).toBeInTheDocument();
    expect(screen.getByText('In full')).toBeInTheDocument();
  });

  it('offers to connect accounts when there is no snapshot yet', async () => {
    mockFetch(url => (url.includes('/api/cash-flow?') ? { status: 204 } : undefined));
    render(<CashFlowPageClient />);
    expect(await screen.findByRole('heading', { name: 'Connect an account to see your cash flow' })).toBeInTheDocument();
  });

  it('explains why there is no forecast and still shows the history', async () => {
    mockFetch(url => (url.includes('/api/cash-flow?')
      ? { status: 200, body: report({ forecast: { available: false, reason: 'insufficient_history' } }) }
      : undefined));
    render(<CashFlowPageClient />);

    expect(await screen.findByText(/A forecast needs about four weeks of transactions/)).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'This month' })).not.toBeInTheDocument();
    expect(screen.getByRole('rowheader', { name: 'Sep 2026' })).toBeInTheDocument();
  });

  it('sends a signed-out visitor to log in', async () => {
    localStorage.clear();
    mockFetch(() => undefined);
    render(<CashFlowPageClient />);
    await waitFor(() => expect(mockRouter.push).toHaveBeenCalledWith('/login'));
  });
});
