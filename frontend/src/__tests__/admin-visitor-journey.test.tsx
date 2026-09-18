import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { VisitorJourney } from '@/components/admin/VisitorJourney';
import MarketingDashboardPage from '@/app/admin/marketing/page';
import RetirementCalculatorAdminPage from '@/app/admin/retirement-calculator/page';
import { journeyFixture, marketingFixture, retirementFixture } from '@/test-fixtures/admin-journey';

jest.mock('@/components/PageMeta', () => function MockPageMeta() { return null; });
jest.mock('@/components/authenticated/AuthenticatedPageHeader', () => function MockHeader() { return <div>Header</div>; });
jest.mock('@/lib/internal-analytics', () => ({ markInternalAnalyticsBrowser: jest.fn() }));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
const healthResponse = (windowDays: number, runs: number) => ({ ok: true, json: async () => ({
  ...retirementFixture, windowDays, totals: { ...retirementFixture.totals, runs,
    answeredWithVerdict: runs * .8, answeredWithRates: runs * .1, rejected: runs * .1,
  },
}) });

describe('simplified admin journeys', () => {
  const originalFetch = global.fetch;
  afterEach(() => { global.fetch = originalFetch; jest.clearAllMocks(); });

  it('shows losses between ordered steps and identifies the largest loss by count', () => {
    render(<VisitorJourney data={journeyFixture} />);
    const path = screen.getByRole('list', { name: 'Ordered session journey' });
    expect(within(path).getAllByRole('listitem')).toHaveLength(6);
    expect(within(path).getByText('50 did not reach this step (50.0%)')).toBeInTheDocument();
    expect(screen.getByText(/The largest loss of sessions/)).toHaveTextContent('landed on the calculator and got a result');
    const mobileRow = within(screen.getByRole('table', { name: /Mobile vs desktop/ })).getByRole('row', { name: 'Mobile 60 6 10.0%' });
    expect(within(mobileRow).getAllByRole('cell').map(cell => cell.textContent)).toEqual(['60', '6', '10.0%']);
  });

  it('switches devices and shows email returns as their own signup path', () => {
    render(<VisitorJourney data={journeyFixture} />);
    fireEvent.click(screen.getByRole('button', { name: 'Mobile' }));
    expect(screen.getByRole('button', { name: 'Mobile' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(screen.getByRole('list')).getByText('30 did not reach this step (50.0%)')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Path'), { target: { value: 'signup_retirement_results_email' } });
    expect(within(screen.getByRole('list')).getAllByRole('listitem')).toHaveLength(5);
    expect(within(screen.getByRole('list')).queryByText('Got a result')).not.toBeInTheDocument();
    expect(screen.getByText(/Starts at \/getstarted/)).toBeInTheDocument();
  });

  it('keeps the overview compact but ranks the actual form step, not its combined span', () => {
    const calculator = journeyFixture.rows.find(row => row.id === 'retirement' && row.device === 'all')!;
    const counts = [100, 100, 100, 100, 10, 10];
    const formCounts = [100, 90, 12, 10];
    const steps = calculator.steps.map((step, index) => ({ ...step, sessions: counts[index],
      continuedRate: index ? counts[index] / counts[index - 1] : null,
      droppedSessions: index ? counts[index - 1] - counts[index] : null,
      dropoffRate: index ? 1 - counts[index] / counts[index - 1] : null,
    }));
    steps[4].breakdown = steps[4].breakdown!.map((step, index) => ({ ...step, sessions: formCounts[index],
      continuedRate: index ? formCounts[index] / formCounts[index - 1] : null,
      droppedSessions: index ? formCounts[index - 1] - formCounts[index] : null,
      dropoffRate: index ? 1 - formCounts[index] / formCounts[index - 1] : null,
    }));
    const data = { ...journeyFixture, rows: [{ ...calculator, steps }] };
    const { rerender } = render(<VisitorJourney data={data} />);
    expect(within(screen.getByRole('list')).getAllByRole('listitem')).toHaveLength(6);
    expect(screen.getByText('90 did not finish signup (90.0%)')).toBeInTheDocument();
    expect(screen.getByText(/The largest loss of sessions/)).toHaveTextContent('started the form and submitted the form');
    const details = screen.getByText('Signup form breakdown').closest('details')!;
    expect(details).not.toHaveAttribute('open');
    fireEvent.click(screen.getByText('Signup form breakdown'));
    expect(details).toHaveAttribute('open');
    expect(within(details).getByText('13.3% continued · 78 did not reach this step (86.7%)')).toBeVisible();
    expect(within(details).getByText('83.3% continued · 2 did not reach this step (16.7%)')).toBeVisible();
    // Frontend-first deployment: an older API can only describe the full span.
    rerender(<VisitorJourney data={{ ...data, rows: [{ ...calculator, steps: steps.map(step => ({ ...step, breakdown: undefined })) }] }} />);
    expect(screen.getByText(/The largest loss spans the signup form/)).toBeInTheDocument();
    expect(screen.queryByText('Signup form breakdown')).not.toBeInTheDocument();
  });

  it('shows collecting and unavailable states without fabricated dropoffs', () => {
    const collecting = { ...journeyFixture, ratesAvailable: false, rows: journeyFixture.rows.map(row => ({ ...row,
      steps: row.steps.map(step => ({ ...step, continuedRate: null, droppedSessions: null, dropoffRate: null })),
    })) };
    const { rerender } = render(<VisitorJourney data={collecting} />);
    expect(screen.getByRole('status')).toHaveTextContent('drop-off rates are not ready');
    expect(screen.queryByText(/did not reach this step/)).not.toBeInTheDocument();
    expect(screen.queryByText(/The largest loss of sessions/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Signup form breakdown'));
    expect(screen.queryByText(/did not reach this step/)).not.toBeInTheDocument();
    rerender(<VisitorJourney />);
    expect(screen.getByRole('status')).toHaveTextContent('missing data is not zero traffic');
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it('starts marketing with the journey and collapses detailed reports', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => marketingFixture });
    render(<MarketingDashboardPage />);
    expect(await screen.findByRole('list', { name: 'Ordered session journey' })).toBeInTheDocument();
    for (const name of ['Campaign comparison and saved-results detail', 'Repeat runs and the free-run limit', 'Signup route and verification detail', 'What happens after signup']) {
      expect(screen.getByText(name).closest('details')).not.toHaveAttribute('open');
    }
    fireEvent.click(screen.getByText('Repeat runs and the free-run limit'));
    expect(screen.getByText('Repeat runs and the free-run limit').closest('details')).toHaveAttribute('open');
  });

  it('keeps the last marketing report visible when a refresh fails', async () => {
    global.fetch = jest.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => marketingFixture })
      .mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({ error: 'fail' }) });
    render(<MarketingDashboardPage />);
    expect(await screen.findByRole('list', { name: 'Ordered session journey' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    expect(await screen.findByText(/Marketing data could not be loaded/)).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Ordered session journey' })).toBeInTheDocument();
    expect(screen.getByText('50 did not reach this step (50.0%)')).toBeInTheDocument();
  });

  it('keeps calculator health usable when GA4 fails and refreshes both sources', async () => {
    global.fetch = jest.fn(async input => ({ ok: !String(input).includes('/admin/marketing'), status: String(input).includes('/admin/marketing') ? 500 : 200, json: async () => retirementFixture })) as jest.Mock;
    render(<RetirementCalculatorAdminPage />);
    const health = await screen.findByRole('region', { name: 'Calculator health' });
    expect(health).toHaveTextContent('90');
    expect(health).toHaveTextContent('10');
    expect(await screen.findByText(/Session journeys are unavailable/)).toBeInTheDocument();
    expect(screen.getByText('Saved results and account matches').closest('details')).not.toHaveAttribute('open');
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(4));
    await screen.findByRole('region', { name: 'Calculator health' });
  });

  it('loads the retirement journey with mobile/desktop and excludes Coast FIRE paths', async () => {
    global.fetch = jest.fn(async input => ({ ok: true, json: async () => String(input).includes('/admin/marketing') ? marketingFixture : retirementFixture })) as jest.Mock;
    render(<RetirementCalculatorAdminPage />);
    expect(await screen.findByRole('list', { name: 'Ordered session journey' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Coast FIRE calculator' })).not.toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Retirement · Email return' })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Path'), { target: { value: 'signup_retirement_results_email' } });
    fireEvent.click(screen.getByRole('button', { name: 'Mobile' }));
    fireEvent.click(screen.getByRole('button', { name: '7d' }));
    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('/admin/marketing?days=7&compare=false'), expect.any(Object)));
    await screen.findByRole('list', { name: 'Ordered session journey' });
    expect(screen.getByLabelText('Path')).toHaveValue('signup_retirement_results_email');
    expect(screen.getByRole('button', { name: 'Mobile' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('retains health while a new window loads and preserves it on a failed refresh', async () => {
    const pending = deferred<ReturnType<typeof healthResponse>>();
    let healthCalls = 0;
    global.fetch = jest.fn(input => {
      if (String(input).includes('/admin/marketing')) return Promise.resolve({ ok: true, json: async () => marketingFixture });
      healthCalls += 1;
      return healthCalls === 1 ? Promise.resolve(healthResponse(28, 100)) : healthCalls === 2 ? pending.promise : Promise.resolve({ ok: false, status: 500 });
    }) as jest.Mock;
    render(<RetirementCalculatorAdminPage />);
    const health = await screen.findByRole('region', { name: 'Calculator health' });
    fireEvent.click(screen.getByRole('button', { name: '7d' }));
    expect(health).toBeInTheDocument();
    expect(health).toHaveAttribute('aria-busy', 'true');
    expect(health).toHaveTextContent('Updating · last 28 days');
    expect(within(health).getByText('100')).toBeInTheDocument();
    expect(screen.getByText(/Updating calculator health/)).toHaveTextContent('previous 28-day report');
    await act(async () => { pending.resolve(healthResponse(7, 40)); });
    await waitFor(() => expect(health).toHaveAttribute('aria-busy', 'false'));
    expect(health).toHaveTextContent('Live · last 7 days');
    expect(within(health).getByText('40')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Showing the last successful 7-day');
    expect(health).toHaveTextContent('Last successful load · last 7 days');
    expect(within(health).getByText('40')).toBeInTheDocument();
  });

  it('ignores an older health response that arrives after a newer date window', async () => {
    const oldWindow = deferred<ReturnType<typeof healthResponse>>();
    const newWindow = deferred<ReturnType<typeof healthResponse>>();
    global.fetch = jest.fn(input => {
      const url = String(input);
      if (url.includes('/admin/marketing')) return Promise.resolve({ ok: true, json: async () => marketingFixture });
      return url.includes('days=7') ? oldWindow.promise : url.includes('days=90') ? newWindow.promise : Promise.resolve(healthResponse(28, 100));
    }) as jest.Mock;
    render(<RetirementCalculatorAdminPage />);
    const health = await screen.findByRole('region', { name: 'Calculator health' });
    fireEvent.click(screen.getByRole('button', { name: '7d' }));
    fireEvent.click(screen.getByRole('button', { name: '90d' }));
    await act(async () => { newWindow.resolve(healthResponse(90, 900)); });
    expect(health).toHaveTextContent('Live · last 90 days');
    await act(async () => { oldWindow.resolve(healthResponse(7, 70)); });
    expect(health).toHaveTextContent('Live · last 90 days');
    expect(within(health).getByText('900')).toBeInTheDocument();
  });

  it.each([401, 403])('clears previously loaded health when authorization fails (%s)', async status => {
    let healthCalls = 0;
    global.fetch = jest.fn(input => {
      if (String(input).includes('/admin/marketing')) return Promise.resolve({ ok: false, status });
      return Promise.resolve(++healthCalls === 1 ? healthResponse(28, 100) : { ok: false, status });
    }) as jest.Mock;
    render(<RetirementCalculatorAdminPage />);
    await screen.findByRole('region', { name: 'Calculator health' });
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Sign in with an admin account');
    expect(screen.queryByRole('region', { name: 'Calculator health' })).not.toBeInTheDocument();
    expect(screen.queryByText(/Showing the last successful/)).not.toBeInTheDocument();
  });
});
