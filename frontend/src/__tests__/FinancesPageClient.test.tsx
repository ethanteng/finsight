import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import FinancesPageClient from '@/app/finances/FinancesPageClient';

const mockRouter = { push: jest.fn() };
jest.mock('next/navigation', () => ({ useRouter: () => mockRouter }));
jest.mock('@/components/finances/FinancialMetricsChart', () => ({
  __esModule: true,
  default: () => <div data-testid="financial-metrics-chart" />,
}));

describe('FinancesPageClient', () => {
  beforeEach(() => {
    localStorage.setItem('auth_token', 'new-user-token');
  });

  afterEach(() => {
    jest.restoreAllMocks();
    localStorage.clear();
  });

  it('shows account setup guidance when a new user has no financial summary', async () => {
    const parseEmptyOverview = jest.fn();
    const requestedUrls: string[] = [];

    global.fetch = jest.fn().mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      requestedUrls.push(url);

      if (url.includes('/api/finances/overview')) {
        return Promise.resolve({
          ok: true,
          status: 204,
          json: parseEmptyOverview,
        });
      }

      if (url.includes('/api/financial-history')) {
        return Promise.resolve({ ok: true, status: 200, json: async () => [] });
      }

      return Promise.resolve({ ok: false, status: 404, json: async () => ({}) });
    }) as jest.Mock;

    render(<FinancesPageClient />);

    expect(await screen.findByRole('heading', { name: 'See your whole financial picture in one place.' })).toBeInTheDocument();
    expect(screen.queryByText('Failed to load financial data')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Add your accounts/i })).toHaveAttribute('href', '/profile');
    expect(screen.getByText('What you’ll see after setup')).toBeInTheDocument();
    expect(screen.getByText('Secure, read-only connections')).toBeInTheDocument();
    expect(parseEmptyOverview).not.toHaveBeenCalled();
    expect(requestedUrls.some(url => url.includes('/plaid/all-accounts'))).toBe(false);
    expect(requestedUrls.some(url => url.includes('/snaptrade/accounts'))).toBe(false);
    expect(requestedUrls.some(url => url.includes('/api/manual-accounts'))).toBe(false);
    expect(requestedUrls.some(url => url.includes('/api/summaries'))).toBe(false);
    expect(requestedUrls.some(url => url.includes('/auth/verify'))).toBe(false);
  });

  it('shows an actionable message when live totals cannot be refreshed', async () => {
    const overview = {
      userTimeZone: 'America/Los_Angeles',
      revision: {
        id: 'revision-1',
        computedAt: '2026-08-14T12:00:00.000Z',
        asOf: '2026-08-14T11:59:00.000Z',
        status: 'current',
        reportingCurrency: 'USD',
      },
      warnings: [],
      financialOverview: {
        netWorth: 10_000,
        totalCash: 10_000,
        totalInvestments: 0,
        totalDebt: 0,
        homeValue: null,
      },
      investmentPortfolio: { holdingCount: 0, securityCount: 0, assetAllocation: [] },
      accountGroups: {
        cash: { accounts: [{ id: 'checking-1', name: 'Checking' }], totalBalance: 10_000, unavailableBalanceCount: 0 },
        investments: { accounts: [], totalBalance: 0, unavailableBalanceCount: 0 },
        debt: { accounts: [], totalBalance: 0, unavailableBalanceCount: 0 },
        other: { accounts: [], totalBalance: 0, unavailableBalanceCount: 0 },
      },
      cashFlow: {},
      home: null,
      manualAccounts: [],
    };

    global.fetch = jest.fn().mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/finances/overview')) {
        return Promise.resolve({ ok: true, status: 200, json: async () => overview });
      }
      if (url.includes('/api/financial-history')) {
        return Promise.resolve({ ok: true, status: 200, json: async () => [] });
      }
      if (url.includes('/api/refresh-summary')) {
        return Promise.resolve({ ok: false, status: 500, json: async () => ({ error: 'Connected provider unavailable' }) });
      }
      return Promise.resolve({ ok: true, status: 200, json: async () => ({ success: true, data: [] }) });
    }) as jest.Mock;

    render(<FinancesPageClient />);
    fireEvent.click(await screen.findByRole('button', { name: 'Refresh totals' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Connected provider unavailable');
  });
});
