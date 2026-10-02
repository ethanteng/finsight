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

const pace = (paidOffBy: string | null, interest: number | null, carrying = true) => ({
  paidOffBy, carryingBalanceNow: carrying, interestTwelveMonths: interest, interestTotal: interest, balanceInTwelveMonths: 0, months: [],
});

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
    typicalPayees: [
      { flow: 'spending', payeeKey: 'safeway', label: 'Safeway', monthlyAmount: 610.2 },
      { flow: 'spending', payeeKey: 'trader joes', label: 'Trader Joes', monthlyAmount: 480 },
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
      currentPace: pace('2027-03', 112.4), withPlans: null, interestSaved: null, planIds: [],
    }],
    position: {
      available: true, startingCash: 5200, startingCardDebt: 4000,
      periods: [
        { key: '2026-09', cash: null, cardDebt: null },
        { key: '2026-10', cash: 3666.2, cardDebt: 3266.68 },
        { key: '2026-11', cash: 4410.15, cardDebt: 2495.4 },
      ],
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
    expect(within(card).getByText('+$1,600')).toBeInTheDocument();
    expect(within(card).getByText('So far')).toBeInTheDocument();
    expect(within(card).getByText('+$100')).toBeInTheDocument();
    expect(within(card).getByText('Still expected')).toBeInTheDocument();

    const quarter = screen.getByRole('heading', { name: 'This quarter' }).closest('article')!;
    expect(within(quarter).getByText('From planned events')).toBeInTheDocument();
    expect(within(quarter).getByText('+$10,000')).toBeInTheDocument();
    expect(within(quarter).getByText('Without planned events')).toBeInTheDocument();

    expect(screen.getByRole('rowheader', { name: 'Oct 2026' })).toBeInTheDocument();
    expect(screen.getByText('Actual + forecast')).toBeInTheDocument();
    expect(screen.getByText('Year-end bonus')).toBeInTheDocument();
    expect(screen.getByText('Gusto Payroll')).toBeInTheDocument();
    expect(screen.getByText('United Airlines')).toBeInTheDocument();
    expect(screen.getByText(/Old Gym · last Jul 5, 2026/)).toBeInTheDocument();
    expect(screen.getByText(/2 transactions couldn’t be classified/)).toBeInTheDocument();
    expect(screen.getAllByText('Beta').length).toBeGreaterThan(0);
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
    const basis = async () => (await screen.findByRole('heading', { name: 'How this forecast works' })).closest('section')!;

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

    it('lists what typical spending is made of, and leaves a payee out of it', async () => {
      const calls = adjusting();
      render(<CashFlowPageClient />);
      const section = await basis();
      fireEvent.click(within(section).getByText('What this is made of'));
      expect(within(section).getByText('$610/mo')).toBeInTheDocument();
      fireEvent.click(within(section).getByRole('button', { name: 'Leave out: Safeway' }));
      await waitFor(() => expect(calls.some(call => call.init?.method === 'POST')).toBe(true));
      expect(posted(calls)).toEqual({ kind: 'exclude_payee', flow: 'spending', key: 'safeway' });
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
      const kept = { ...report().recurring[2], status: 'active' as const, continuedByUser: true, nextDate: '2026-11-05' };
      const body = report({
        recurring: [report().recurring[0], report().recurring[1], kept],
        adjustments: [{ id: 'adj-gym', kind: 'continue_stream', flow: 'spending', key: 'old gym', label: 'Old Gym', date: null, amount: null }],
      });
      const calls = adjusting(body);
      render(<CashFlowPageClient />);
      const section = await basis();
      expect(within(section).getByText(/kept by you/)).toBeInTheDocument();
      fireEvent.click(within(section).getByRole('button', { name: 'Stop counting: Old Gym' }));
      await waitFor(() => expect(calls.some(call => call.init?.method === 'DELETE')).toBe(true));
      expect(calls.find(call => call.init?.method === 'DELETE')!.url).toMatch(/adjustments\/adj-gym$/);
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
