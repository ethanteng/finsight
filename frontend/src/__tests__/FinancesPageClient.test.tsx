import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
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

  it('keeps polling after a manual account is deleted until the rebuilt snapshot lands', async () => {
    // The delete endpoint returns as soon as the row is gone and rebuilds the snapshot in
    // the background, so the first reload still carries the pre-delete revision.
    const baseOverview = {
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
        cash: { accounts: [], totalBalance: 10_000, unavailableBalanceCount: 0 },
        investments: { accounts: [], totalBalance: 0, unavailableBalanceCount: 0 },
        debt: { accounts: [], totalBalance: 0, unavailableBalanceCount: 0 },
        other: { accounts: [], totalBalance: 0, unavailableBalanceCount: 0 },
      },
      cashFlow: {},
      home: null,
      manualAccounts: [{
        id: 'manual-1',
        name: 'Wallet',
        amount: 100,
        type: 'cash',
        createdAt: '2026-08-01T00:00:00.000Z',
        updatedAt: '2026-08-01T00:00:00.000Z',
      }],
    };

    // Deleted from the database, but the snapshot totals are still the old revision.
    const staleRevisionOverview = { ...baseOverview, manualAccounts: [] };

    const rebuiltOverview = {
      ...staleRevisionOverview,
      revision: { ...baseOverview.revision, id: 'revision-2', computedAt: '2026-08-14T12:00:20.000Z' },
      financialOverview: { ...baseOverview.financialOverview, netWorth: 9_900, totalCash: 9_900 },
      accountGroups: {
        ...baseOverview.accountGroups,
        cash: { accounts: [], totalBalance: 9_900, unavailableBalanceCount: 0 },
      },
    };

    let deleted = false;
    let overviewRequests = 0;

    global.fetch = jest.fn().mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/api/manual-accounts/manual-1') && init?.method === 'DELETE') {
        deleted = true;
        return Promise.resolve({ ok: true, status: 200, json: async () => ({ success: true }) });
      }
      if (url.includes('/api/finances/overview')) {
        overviewRequests += 1;
        if (!deleted) return Promise.resolve({ ok: true, status: 200, json: async () => baseOverview });
        // First reload after the delete still sees the pre-delete revision.
        const body = overviewRequests <= 2 ? staleRevisionOverview : rebuiltOverview;
        return Promise.resolve({ ok: true, status: 200, json: async () => body });
      }
      if (url.includes('/api/financial-history')) {
        return Promise.resolve({ ok: true, status: 200, json: async () => [] });
      }
      return Promise.resolve({ ok: true, status: 200, json: async () => ({ success: true, data: [] }) });
    }) as jest.Mock;

    jest.spyOn(window, 'confirm').mockReturnValue(true);
    jest.useFakeTimers({ doNotFake: ['queueMicrotask'] });

    try {
      render(<FinancesPageClient />);

      const deleteButton = await screen.findByRole('button', { name: 'Delete' });
      expect(screen.getAllByText('$10,000').length).toBeGreaterThan(0);

      fireEvent.click(deleteButton);

      // The row disappears immediately; the totals still show the old revision.
      await waitFor(() => expect(screen.queryByText('Wallet')).not.toBeInTheDocument());
      expect(screen.getAllByText('$10,000').length).toBeGreaterThan(0);
      expect(screen.getByText('Updating totals with your change…')).toBeInTheDocument();

      await act(async () => {
        await jest.advanceTimersByTimeAsync(2000);
      });

      await waitFor(() => expect(screen.getAllByText('$9,900').length).toBeGreaterThan(0));
      expect(screen.queryByText('Updating totals with your change…')).not.toBeInTheDocument();
    } finally {
      jest.useRealTimers();
    }
  });
});
