import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import VisitorCohortPanel from '@/components/admin/VisitorCohortPanel';
import { COUNTED_OPERATOR_BROWSER_KEY, INTERNAL_ANALYTICS_BROWSER_KEY } from '@/lib/internal-analytics';

const none = { coast_fire_run: 0, retirement_run: 0, cash_flow_check: 0, coffee_widget: 0 };
const cells = (rates: Array<[number, number]>) => rates.map(([count, eligible]) => ({
  rate: eligible > 0 ? count / eligible : null, count, eligible,
}));
const totals = (overrides: Partial<{ coast: number; retirement: number; cash: number; coffee: number; any: number; returned: number; signedUp: number; signedIn: number }> = {}) => ({
  actions: {
    coast_fire_run: { visitors: overrides.coast ?? 0, count: (overrides.coast ?? 0) * 2 },
    retirement_run: { visitors: overrides.retirement ?? 0, count: overrides.retirement ?? 0 },
    cash_flow_check: { visitors: overrides.cash ?? 0, count: overrides.cash ?? 0 },
    coffee_widget: { visitors: overrides.coffee ?? 0, count: overrides.coffee ?? 0 },
  },
  anyAction: overrides.any ?? 0,
  returned: overrides.returned ?? 0,
  signedUp: overrides.signedUp ?? 0,
  signedIn: overrides.signedIn ?? 0,
});
const metricCells = (anyAction: Array<[number, number]>, visited: Array<[number, number]>) => ({
  any_action: cells(anyAction),
  coast_fire_run: cells(anyAction),
  retirement_run: cells([[0, 4], [0, 0]]),
  cash_flow_check: cells([[0, 4], [0, 0]]),
  coffee_widget: cells([[0, 4], [0, 0]]),
  visited: cells(visited),
  signed_up: cells([[1, 4], [0, 0]]),
});

const alice = {
  visitorId: '111.222',
  firstSeenAt: '2026-09-28T10:00:00.000Z',
  landingPage: '/coast-fire-calculator',
  landing: 'coast_fire_calculator',
  channel: 'Paid',
  source: 'google',
  medium: 'cpc',
  campaign: 'coast_fire',
  device: 'mobile',
  country: 'United States',
  sessionCount: 2,
  actions: { ...none, coast_fire_run: 3 },
  outcome: 'signed_up',
  outcomeAt: '2026-10-06T12:00:00.000Z',
  sessions: [
    { sessionId: 's1', startedAt: '2026-09-28T10:00:00.000Z', landingPage: '/coast-fire-calculator', channel: 'Paid', campaign: 'coast_fire', device: 'mobile', pageViews: 3, engagementSeconds: 95, actions: { ...none, coast_fire_run: 2 } },
    { sessionId: 's2', startedAt: '2026-10-06T09:00:00.000Z', landingPage: '/', channel: 'Direct', campaign: '(not set)', device: 'mobile', pageViews: 1, engagementSeconds: 12, actions: { ...none, coast_fire_run: 1 } },
  ],
};

const liveReport = {
  kind: 'visitors',
  state: 'live',
  detail: 'GA4 daily export through 2026-10-12.',
  reportEnd: '2026-10-12',
  dataThrough: '2026-10-13T00:00:00.000Z',
  landing: 'all', channel: 'all', device: 'all',
  cohortGrain: 'week', periodGrain: 'week', cohortCount: 2, periodCount: 2,
  generatedAt: '2026-10-13T08:00:00.000Z',
  timeZone: 'UTC',
  memberLimit: 500,
  cohorts: [
    {
      key: '2026-09-28', label: 'Week of Sep 28, 2026', startsAt: '2026-09-28T00:00:00.000Z', endsAt: '2026-10-05T00:00:00.000Z',
      size: 4,
      totals: totals({ coast: 2, any: 2, returned: 1, signedUp: 1 }),
      cells: metricCells([[2, 4], [1, 4]], [[4, 4], [1, 4]]),
      members: [alice],
    },
    {
      key: '2026-10-05', label: 'Week of Oct 5, 2026', startsAt: '2026-10-05T00:00:00.000Z', endsAt: '2026-10-12T00:00:00.000Z',
      size: 0,
      totals: totals(),
      cells: metricCells([[0, 0], [0, 0]], [[0, 0], [0, 0]]),
      members: [],
    },
  ],
  overall: { size: 4, totals: totals({ coast: 2, any: 2, returned: 1, signedUp: 1, signedIn: 1 }), cells: metricCells([[2, 4], [1, 4]], [[4, 4], [1, 4]]) },
  excluded: { operatorBrowsers: 1, automatedSessions: 3, seenBeforeWindow: 2 },
  notes: ['A visitor is one browser’s GA4 cookie, not a person.'],
};

function mockFetch(body: unknown, ok = true) {
  global.fetch = jest.fn().mockResolvedValue({ ok, json: async () => body }) as jest.Mock;
}

function requestedUrls(): URL[] {
  return (global.fetch as jest.Mock).mock.calls.map(([url]) => new URL(String(url)));
}

function renderPanel() {
  return render(<VisitorCohortPanel apiUrl="https://api.example.test" getAuthHeaders={() => ({ Authorization: 'Bearer t' })} />);
}

describe('VisitorCohortPanel', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('shows what each cohort did, with the share and the count', async () => {
    mockFetch(liveReport);
    renderPanel();

    const did = await screen.findByRole('region', { name: 'What they did' });
    const row = within(did).getByRole('button', { name: 'Week of Sep 28, 2026' }).closest('tr') as HTMLElement;
    const values = within(row).getAllByRole('cell').map(cell => cell.textContent);
    // Visitors, Coast FIRE, Retirement, Cash flow, Coffee, Any, Came back, Signed up.
    expect(values).toEqual(['4', '50%2', '0%0', '0%0', '0%0', '50%2', '25%1', '25%1']);
    expect(within(row).getAllByRole('cell')[1]).toHaveAttribute('title', '2 of 4 ran the Coast FIRE calculator, 4 times in all');
    expect(screen.getByText('1 more signed in to an existing account rather than signing up.')).toBeInTheDocument();
    expect(screen.getByText(/GA4 daily export · not live · through Oct 12, 2026/)).toBeInTheDocument();
  });

  it('says how fresh streamed numbers are, and that the days after the daily export are provisional', async () => {
    mockFetch({ ...liveReport, streamedThrough: '2026-10-14T17:42:00.000Z' });
    renderPanel();

    const label = await screen.findByText(/GA4 streaming export · as of/);
    expect(label).toHaveTextContent('Oct 14');
    expect(label).toHaveTextContent('daily export through Oct 12, 2026, later days provisional');
  });

  it('switches the period grid between what it counts', async () => {
    mockFetch(liveReport);
    renderPanel();

    const grid = await screen.findByRole('region', { name: 'When they came back' });
    const firstRow = () => within(grid).getByRole('button', { name: 'Week of Sep 28, 2026' }).closest('tr') as HTMLElement;
    expect(within(firstRow()).getAllByRole('cell').map(cell => cell.textContent)).toEqual(['4', '50%', '25%']);

    fireEvent.click(within(grid).getByRole('button', { name: 'Visited' }));
    expect(within(grid).getByRole('button', { name: 'Visited' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(firstRow()).getAllByRole('cell').map(cell => cell.textContent)).toEqual(['4', '100%', '25%']);
    expect(screen.getByText(/Week 1 is always everyone/)).toBeInTheDocument();

    fireEvent.click(within(grid).getByRole('button', { name: 'Signed up' }));
    expect(screen.getByText(/had signed up by the end of each week after their first visit/)).toBeInTheDocument();
  });

  it('lists a cohort’s visitors and each visitor’s sessions', async () => {
    mockFetch(liveReport);
    renderPanel();

    fireEvent.click(within(await screen.findByRole('region', { name: 'What they did' }))
      .getByRole('button', { name: 'Week of Sep 28, 2026' }));
    const drill = screen.getByRole('generic', { name: 'Week of Sep 28, 2026 visitors' });
    expect(within(drill).getByText('Week of Sep 28, 2026: 4 visitors')).toBeInTheDocument();
    // The list comes on its own request, for this cohort alone.
    expect(await within(drill).findByText('Paid · coast_fire')).toBeInTheDocument();
    const listRequest = requestedUrls().at(-1) as URL;
    expect(listRequest.searchParams.get('members')).toBe('2026-09-28');
    expect(listRequest.searchParams.get('landing')).toBe('all');
    expect(within(drill).getByText('Signed up Oct 6, 2026')).toBeInTheDocument();
    expect(within(drill).getByText(/Showing the 1 most active of 4 visitors/)).toBeInTheDocument();

    fireEvent.click(within(drill).getByRole('button', { name: 'Show sessions for visitor 111.222' }));
    expect(within(drill).getAllByText('Session')).toHaveLength(2);
    expect(within(drill).getByText('3 pages · 1m 35s')).toBeInTheDocument();
    expect(within(drill).getByText('1 page · 12s')).toBeInTheDocument();
  });

  it('sends the filters, and asks for a fresh read only on Refresh', async () => {
    mockFetch(liveReport);
    renderPanel();
    await screen.findByRole('region', { name: 'What they did' });

    fireEvent.change(screen.getByLabelText('Landed on'), { target: { value: 'coast_fire_calculator' } });
    fireEvent.change(screen.getByLabelText('Channel'), { target: { value: 'paid' } });
    fireEvent.change(screen.getByLabelText('Device'), { target: { value: 'mobile' } });
    fireEvent.change(screen.getByLabelText('Campaign (utm_campaign)'), { target: { value: ' coast_fire ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    await waitFor(() => {
      const last = requestedUrls().at(-1) as URL;
      expect(Object.fromEntries(last.searchParams)).toEqual({
        landing: 'coast_fire_calculator', channel: 'paid', campaign: 'coast_fire', device: 'mobile',
        cohort: 'week', period: 'week', cohorts: '12', periods: '12',
      });
    });
    expect(requestedUrls().every(url => url.pathname === '/admin/cohorts/visitors')).toBe(true);

    await waitFor(() => expect(screen.getByRole('button', { name: 'Refresh' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    await waitFor(() => expect((requestedUrls().at(-1) as URL).searchParams.get('refresh')).toBe('1'));
  });

  it('says why there is nothing to show instead of an empty grid', async () => {
    mockFetch({ ...liveReport, state: 'needs_configuration', detail: 'Add a read-only BigQuery service account to the backend environment.', cohorts: [] });
    renderPanel();

    expect(await screen.findByRole('status')).toHaveTextContent('GA4 is not connected. Add a read-only BigQuery service account');
    expect(screen.queryByRole('region', { name: 'What they did' })).not.toBeInTheDocument();
  });

  it('says when a cohort’s visitors could not be loaded', async () => {
    global.fetch = jest.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => liveReport })
      .mockResolvedValueOnce({ ok: false, json: async () => ({ error: 'Unable to build the visitor cohort report' }) }) as jest.Mock;
    renderPanel();

    fireEvent.click(within(await screen.findByRole('region', { name: 'What they did' }))
      .getByRole('button', { name: 'Week of Sep 28, 2026' }));
    expect(await screen.findByText('Unable to build the visitor cohort report')).toBeInTheDocument();
  });

  it('takes the old grid down when the report for new filters fails', async () => {
    global.fetch = jest.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => liveReport })
      .mockResolvedValueOnce({ ok: false, json: async () => ({ error: 'Unable to build the visitor cohort report' }) }) as jest.Mock;
    renderPanel();
    await screen.findByRole('region', { name: 'What they did' });

    fireEvent.change(screen.getByLabelText('Device'), { target: { value: 'mobile' } });

    expect(await screen.findByText('Unable to build the visitor cohort report')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'What they did' })).not.toBeInTheDocument();
  });

  it('shows a failed request', async () => {
    mockFetch({ error: 'Unable to build the visitor cohort report' }, false);
    renderPanel();

    expect(await screen.findByText('Unable to build the visitor cohort report')).toBeInTheDocument();
  });

  it('counts the operator’s browser again, and leaves it out again, on request', async () => {
    window.localStorage.setItem(INTERNAL_ANALYTICS_BROWSER_KEY, '1');
    mockFetch(liveReport);
    renderPanel();

    expect(await screen.findByText(/This browser is marked as yours/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Count this browser again' }));
    expect(screen.getByText(/Analytics runs in this browser again from the next page load/)).toBeInTheDocument();
    expect(window.localStorage.getItem(INTERNAL_ANALYTICS_BROWSER_KEY)).toBeNull();
    expect(window.localStorage.getItem(COUNTED_OPERATOR_BROWSER_KEY)).toBe('1');

    fireEvent.click(screen.getByRole('button', { name: 'Leave this browser out' }));
    expect(window.localStorage.getItem(INTERNAL_ANALYTICS_BROWSER_KEY)).toBe('1');
    expect(window.localStorage.getItem(COUNTED_OPERATOR_BROWSER_KEY)).toBeNull();
  });

  it('notes what was left out', async () => {
    mockFetch(liveReport);
    renderPanel();

    expect(await screen.findByText(/1 operator browser is left/)).toBeInTheDocument();
    expect(screen.getByText(/2 browsers first visited before/)).toBeInTheDocument();
    expect(screen.getByText('3 automated, test or off-site sessions are left out.')).toBeInTheDocument();
  });
});
