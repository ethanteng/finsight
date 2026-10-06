import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import CohortReportPanel from '@/components/admin/CohortReportPanel';

const member = {
  startedAt: '2026-09-21T09:00:00.000Z',
  signedUpAt: '2026-08-02T09:00:00.000Z',
  trialStartedAt: '2026-09-21T09:00:00.000Z',
  firstChargeAt: null,
  subscriptionStatus: 'inactive',
  tier: 'premium',
  lastLoginAt: null,
};

const engagementReport = {
  kind: 'engagement',
  segment: 'trial',
  cohortGrain: 'week',
  periodGrain: 'week',
  cohortCount: 2,
  periodCount: 2,
  generatedAt: '2026-10-07T00:00:00.000Z',
  timeZone: 'UTC',
  rule: { questions: 2, per: 'week', requiredPerPeriod: { min: 2, max: 2 } },
  overall: [{ rate: 0.5, count: 1, eligible: 2 }, { rate: 0, count: 0, eligible: 1 }],
  excluded: { operatorAccounts: 1 },
  notes: ['A question is one typed into Ask Linc.'],
  cohorts: [
    {
      key: '2026-09-21',
      label: 'Week of Sep 21, 2026',
      startsAt: '2026-09-21T00:00:00.000Z',
      endsAt: '2026-09-28T00:00:00.000Z',
      size: 2,
      cells: [{ rate: 0.5, count: 1, eligible: 2 }, { rate: 0, count: 0, eligible: 1 }],
      members: [
        { ...member, userId: 'a', email: 'alice@example.com', totalQuestions: 3, periods: [{ questions: 2, required: 2, engaged: true }, { questions: 1, required: 2, engaged: false }] },
        { ...member, userId: 'b', email: 'bob@example.com', totalQuestions: 0, periods: [{ questions: 0, required: 2, engaged: false }, null] },
      ],
    },
    {
      key: '2026-09-28',
      label: 'Week of Sep 28, 2026',
      startsAt: '2026-09-28T00:00:00.000Z',
      endsAt: '2026-10-05T00:00:00.000Z',
      size: 0,
      cells: [{ rate: null, count: 0, eligible: 0 }, { rate: null, count: 0, eligible: 0 }],
      members: [],
    },
  ],
};

const activationReport = {
  ...engagementReport,
  kind: 'activation',
  rule: undefined,
  excluded: { operatorAccounts: 0, payingWithoutRecordedCharge: 2 },
  notes: ['Linking means a Plaid bank, a SnapTrade brokerage, or a Public key that has verified.'],
  cohorts: [
    {
      ...engagementReport.cohorts[0],
      activatedToDate: 1,
      medianDaysToFirstLink: 0,
      members: [
        { ...member, userId: 'a', email: 'alice@example.com', firstLinkedAt: '2026-09-20T00:00:00.000Z', linkSources: ['plaid', 'snaptrade'], activatedInPeriod: 0, daysToFirstLink: 0 },
        { ...member, userId: 'b', email: 'bob@example.com', firstLinkedAt: null, linkSources: [], activatedInPeriod: null, daysToFirstLink: null },
      ],
    },
    { ...engagementReport.cohorts[1], activatedToDate: 0, medianDaysToFirstLink: null },
  ],
};

function mockFetch(body: unknown, ok = true) {
  global.fetch = jest.fn().mockResolvedValue({ ok, json: async () => body }) as jest.Mock;
}

function requestedUrls(): URL[] {
  return (global.fetch as jest.Mock).mock.calls.map(([url]) => new URL(String(url)));
}

const headers = () => ({ Authorization: 'Bearer token' });

describe('CohortReportPanel', () => {
  it('loads weekly signup cohorts and shades each period', async () => {
    mockFetch(engagementReport);
    render(<CohortReportPanel kind="engagement" apiUrl="https://api.example.test" getAuthHeaders={headers} />);

    expect(await screen.findByRole('button', { name: 'Week of Sep 21, 2026' })).toBeInTheDocument();
    const [url] = requestedUrls();
    expect(url.pathname).toBe('/admin/cohorts/engagement');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      segment: 'signup', cohort: 'week', period: 'week', cohorts: '12', periods: '12', source: 'all', channel: 'all', campaign: '', questions: '1', per: 'week',
    });
    expect((global.fetch as jest.Mock).mock.calls[0][1]).toMatchObject({ headers: { Authorization: 'Bearer token' } });

    const row = screen.getByRole('button', { name: 'Week of Sep 21, 2026' }).closest('tr')!;
    // Text color is paired with each shade so the value stays readable.
    expect(within(row).getByText('50%')).toHaveStyle({ backgroundColor: '#3f7a55', color: '#ffffff' });
    expect(within(row).getByText('0%*')).toHaveStyle({ backgroundColor: '#94bf9d', color: '#102319' });
    // Week 2 has only one of two members finished, so it is marked partial.
    expect(within(row).getByText('0%*')).toHaveAttribute('title', '0 of 1 engaged (1 still in this period)');
    expect(screen.getByText(/Counts as engaged in a week column with 2 or more questions/)).toBeInTheDocument();
    expect(screen.getByText('1 operator account is left out of this window.')).toBeInTheDocument();
  });

  it('opens a cohort to list its users and their questions per period', async () => {
    mockFetch(engagementReport);
    render(<CohortReportPanel kind="engagement" apiUrl="https://api.example.test" getAuthHeaders={headers} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Week of Sep 21, 2026' }));

    const detail = screen.getByLabelText('Week of Sep 21, 2026 users');
    expect(within(detail).getByText('Week of Sep 21, 2026: 2 users')).toBeInTheDocument();
    // Dates read in the order an account reaches them, whatever the view.
    expect(within(detail).getAllByRole('columnheader').slice(0, 5).map(cell => cell.textContent))
      .toEqual(['User', 'Signed up', 'Trial started', 'First charge', 'Plan now']);
    const alice = within(detail).getByText('alice@example.com').closest('tr')!;
    expect(within(alice).getByText('Sep 21, 2026')).toBeInTheDocument();
    expect(within(alice).getByText('Aug 2, 2026')).toBeInTheDocument();
    expect(within(alice).getByText('3')).toBeInTheDocument();
    // Colors are inline because the signed-in theme re-inks `.text-white` dark.
    expect(within(alice).getByTitle('2 asked, 2 needed')).toHaveStyle({ backgroundColor: '#397052', color: '#ffffff' });
    expect(within(alice).getByTitle('2 asked, 2 needed')).not.toHaveClass('text-white');
    const bob = within(detail).getByText('bob@example.com').closest('tr')!;
    expect(within(bob).getByTitle('Still in this period')).toHaveTextContent('·');
    expect(within(bob).getByText('No subscription')).toBeInTheDocument();

    fireEvent.click(within(detail).getByRole('button', { name: 'Close' }));
    expect(screen.queryByLabelText('Week of Sep 21, 2026 users')).not.toBeInTheDocument();
  });

  it('reloads when a control changes, and lets "per" follow the columns until it is chosen', async () => {
    mockFetch(engagementReport);
    render(<CohortReportPanel kind="engagement" apiUrl="https://api.example.test" getAuthHeaders={headers} />);
    await screen.findByRole('button', { name: 'Week of Sep 21, 2026' });

    expect(screen.getByRole('button', { name: 'Signups' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Trials' }));
    await waitFor(() => expect(requestedUrls().at(-1)!.searchParams.get('segment')).toBe('trial'));
    fireEvent.click(screen.getByRole('button', { name: 'Paid' }));
    await waitFor(() => expect(requestedUrls().at(-1)!.searchParams.get('segment')).toBe('paid'));

    fireEvent.change(screen.getByLabelText('Columns'), { target: { value: 'month' } });
    await waitFor(() => expect(requestedUrls().at(-1)!.searchParams.get('period')).toBe('month'));
    expect(requestedUrls().at(-1)!.searchParams.get('per')).toBe('month');

    fireEvent.change(screen.getByLabelText('questions per'), { target: { value: 'week' } });
    fireEvent.change(screen.getByLabelText('Engaged at'), { target: { value: '3' } });
    await waitFor(() => expect(requestedUrls().at(-1)!.searchParams.get('questions')).toBe('3'));
    expect(requestedUrls().at(-1)!.searchParams.get('per')).toBe('week');

    fireEvent.change(screen.getByLabelText('Columns'), { target: { value: 'day' } });
    await waitFor(() => expect(requestedUrls().at(-1)!.searchParams.get('period')).toBe('day'));
    expect(requestedUrls().at(-1)!.searchParams.get('per')).toBe('week');
  });

  it('does not request an out-of-range count', async () => {
    mockFetch(engagementReport);
    render(<CohortReportPanel kind="engagement" apiUrl="https://api.example.test" getAuthHeaders={headers} />);
    await screen.findByRole('button', { name: 'Week of Sep 21, 2026' });
    const calls = (global.fetch as jest.Mock).mock.calls.length;

    fireEvent.change(screen.getByLabelText('Cohorts shown'), { target: { value: '0' } });
    fireEvent.change(screen.getByLabelText('Cohorts shown'), { target: { value: '500' } });

    expect((global.fetch as jest.Mock).mock.calls.length).toBe(calls);
  });

  it('shows activation to date and who linked when', async () => {
    mockFetch(activationReport);
    render(<CohortReportPanel kind="activation" apiUrl="https://api.example.test" getAuthHeaders={headers} />);

    const button = await screen.findByRole('button', { name: 'Week of Sep 21, 2026' });
    expect(requestedUrls()[0].pathname).toBe('/admin/cohorts/activation');
    expect(requestedUrls()[0].searchParams.has('questions')).toBe(false);
    expect(within(button.closest('tr')!).getByText('1 (50%)')).toBeInTheDocument();
    expect(screen.getByText(/2 paying accounts have no logged charge/)).toBeInTheDocument();

    fireEvent.click(button);
    const detail = screen.getByLabelText('Week of Sep 21, 2026 users');
    const alice = within(detail).getByText('alice@example.com').closest('tr')!;
    expect(within(alice).getByText('Plaid, SnapTrade')).toBeInTheDocument();
    expect(within(alice).getByText('Before start')).toBeInTheDocument();
    expect(within(within(detail).getByText('bob@example.com').closest('tr')!).getByText('Not linked')).toBeInTheDocument();
  });

  it('shows the server error', async () => {
    mockFetch({ error: 'periods must be a whole number from 1 to 90' }, false);
    render(<CohortReportPanel kind="activation" apiUrl="https://api.example.test" getAuthHeaders={headers} />);

    expect(await screen.findByText('periods must be a whole number from 1 to 90')).toBeInTheDocument();
  });

  it('ignores a slower response from a superseded query', async () => {
    let finishFirst!: (body: unknown) => void;
    const firstBody = new Promise((resolve) => { finishFirst = resolve; });
    const trialReport = { ...engagementReport, notes: ['trial-report-marker'] };
    const paidReport = {
      ...engagementReport,
      segment: 'paid' as const,
      notes: ['paid-report-marker'],
      excluded: { operatorAccounts: 0 },
    };
    global.fetch = jest.fn()
      .mockImplementationOnce(() => Promise.resolve({
        ok: true,
        json: () => firstBody,
      }))
      .mockImplementationOnce(() => Promise.resolve({
        ok: true,
        json: async () => paidReport,
      })) as jest.Mock;

    render(<CohortReportPanel kind="engagement" apiUrl="https://api.example.test" getAuthHeaders={headers} />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole('button', { name: 'Paid' }));
    expect(await screen.findByText('paid-report-marker')).toBeInTheDocument();

    finishFirst(trialReport);
    // Give the superseded response a turn to apply if the race guard is missing.
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2));
    expect(screen.getByText('paid-report-marker')).toBeInTheDocument();
    expect(screen.queryByText('trial-report-marker')).not.toBeInTheDocument();
  });
});


it('joins source and campaign filters and distinguishes immature retention from zero', async () => {
  mockFetch({ ...engagementReport, quality: {
    measuredSignups: 3, unmeasuredSignups: 7, resultViewed: 2, meaningfulAnswer: 1,
    accountLinked: 0, returnedEngaged: 0, returnEligible: 0, returnMaturedCount: 0,
  } });
  render(<CohortReportPanel kind="engagement" apiUrl="https://api.example.test" getAuthHeaders={headers} />);
  expect(await screen.findByText(/Not yet measurable/)).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Signup source'), { target: { value: 'coast_fire_calculator' } });
  fireEvent.change(screen.getByLabelText('Acquisition channel'), { target: { value: 'google_ads' } });
  fireEvent.change(screen.getByLabelText('Campaign (utm_campaign)'), { target: { value: 'coast_fire' } });
  fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
  await waitFor(() => {
    const latest = requestedUrls().at(-1)!;
    expect(latest.searchParams.get('source')).toBe('coast_fire_calculator');
    expect(latest.searchParams.get('channel')).toBe('google_ads');
    expect(latest.searchParams.get('campaign')).toBe('coast_fire');
  });
});
