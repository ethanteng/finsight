import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { VisitorJourney } from '@/components/admin/VisitorJourney';
import MarketingDashboardPage from '@/app/admin/marketing/page';
import RetirementCalculatorAdminPage from '@/app/admin/retirement-calculator/page';
import { journeyFixture, marketingFixture, retirementFixture } from '@/test-fixtures/admin-journey';

jest.mock('@/components/PageMeta', () => function MockPageMeta() { return null; });
jest.mock('@/components/authenticated/AuthenticatedPageHeader', () => function MockHeader() { return <div>Header</div>; });
jest.mock('@/lib/internal-analytics', () => ({ markInternalAnalyticsBrowser: jest.fn() }));

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

  it('shows collecting and unavailable states without fabricated dropoffs', () => {
    const collecting = { ...journeyFixture, ratesAvailable: false, rows: journeyFixture.rows.map(row => ({ ...row,
      steps: row.steps.map(step => ({ ...step, continuedRate: null, droppedSessions: null, dropoffRate: null })),
    })) };
    const { rerender } = render(<VisitorJourney data={collecting} />);
    expect(screen.getByRole('status')).toHaveTextContent('drop-off rates are not ready');
    expect(screen.queryByText(/did not reach this step/)).not.toBeInTheDocument();
    expect(screen.queryByText(/The largest loss of sessions/)).not.toBeInTheDocument();
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
});
