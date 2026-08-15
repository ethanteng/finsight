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
        rebuildPending: false,
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
        rebuildPending: false,
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

  it('keeps polling past an intermediate revision while the server still has a rebuild queued', async () => {
    // Two edits in quick succession: the first rebuild publishes a revision that does not
    // yet include the second edit, and the service reports the queued follow-up.
    const overviewAt = (computedAt: string, netWorth: number, rebuildPending: boolean) => ({
      userTimeZone: 'America/Los_Angeles',
      revision: { id: computedAt, computedAt, asOf: null, status: 'current', reportingCurrency: 'USD', rebuildPending },
      warnings: [],
      financialOverview: { netWorth, totalCash: netWorth, totalInvestments: 0, totalDebt: 0, homeValue: null },
      investmentPortfolio: { holdingCount: 0, securityCount: 0, assetAllocation: [] },
      accountGroups: {
        cash: { accounts: [], totalBalance: netWorth, unavailableBalanceCount: 0 },
        investments: { accounts: [], totalBalance: 0, unavailableBalanceCount: 0 },
        debt: { accounts: [], totalBalance: 0, unavailableBalanceCount: 0 },
        other: { accounts: [], totalBalance: 0, unavailableBalanceCount: 0 },
      },
      cashFlow: {},
      home: null,
      manualAccounts: [{
        id: 'manual-1', name: 'Wallet', amount: 100, type: 'cash',
        createdAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-08-01T00:00:00.000Z',
      }],
    });

    const responses = [
      overviewAt('2026-08-14T12:00:00.000Z', 10_000, false), // initial page load
      overviewAt('2026-08-14T12:00:00.000Z', 10_000, true),  // reload right after the edit
      overviewAt('2026-08-14T12:00:10.000Z', 9_950, true),   // first rebuild, follow-up queued
      overviewAt('2026-08-14T12:00:30.000Z', 9_900, false),  // queued rebuild published
    ];
    let overviewRequests = 0;

    global.fetch = jest.fn().mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/api/manual-accounts/manual-1') && init?.method === 'DELETE') {
        return Promise.resolve({ ok: true, status: 200, json: async () => ({ success: true }) });
      }
      if (url.includes('/api/finances/overview')) {
        const body = responses[Math.min(overviewRequests, responses.length - 1)];
        overviewRequests += 1;
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
      fireEvent.click(await screen.findByRole('button', { name: 'Delete' }));

      await waitFor(() => expect(screen.getByText('Updating totals with your change…')).toBeInTheDocument());

      // The intermediate revision advanced, but the queued rebuild means it is not final.
      await act(async () => { await jest.advanceTimersByTimeAsync(2000); });
      expect(screen.getByText('Updating totals with your change…')).toBeInTheDocument();
      expect(screen.getAllByText('$9,950').length).toBeGreaterThan(0);

      await act(async () => { await jest.advanceTimersByTimeAsync(2000); });
      await waitFor(() => expect(screen.getAllByText('$9,900').length).toBeGreaterThan(0));
      expect(screen.queryByText('Updating totals with your change…')).not.toBeInTheDocument();
    } finally {
      jest.useRealTimers();
    }
  });

  it('keeps polling through a transient overview failure', async () => {
    const overviewAt = (computedAt: string, netWorth: number) => ({
      userTimeZone: 'America/Los_Angeles',
      revision: { id: computedAt, computedAt, asOf: null, status: 'current', reportingCurrency: 'USD', rebuildPending: false },
      warnings: [],
      financialOverview: { netWorth, totalCash: netWorth, totalInvestments: 0, totalDebt: 0, homeValue: null },
      investmentPortfolio: { holdingCount: 0, securityCount: 0, assetAllocation: [] },
      accountGroups: {
        cash: { accounts: [], totalBalance: netWorth, unavailableBalanceCount: 0 },
        investments: { accounts: [], totalBalance: 0, unavailableBalanceCount: 0 },
        debt: { accounts: [], totalBalance: 0, unavailableBalanceCount: 0 },
        other: { accounts: [], totalBalance: 0, unavailableBalanceCount: 0 },
      },
      cashFlow: {},
      home: null,
      manualAccounts: [{
        id: 'manual-1', name: 'Wallet', amount: 100, type: 'cash',
        createdAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-08-01T00:00:00.000Z',
      }],
    });

    let overviewRequests = 0;

    global.fetch = jest.fn().mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/api/manual-accounts/manual-1') && init?.method === 'DELETE') {
        return Promise.resolve({ ok: true, status: 200, json: async () => ({ success: true }) });
      }
      if (url.includes('/api/finances/overview')) {
        overviewRequests += 1;
        // 1: initial load, 2: reload after the delete, 3: transient failure, 4: rebuilt.
        if (overviewRequests === 3) return Promise.reject(new Error('network blip'));
        const body = overviewRequests >= 4
          ? overviewAt('2026-08-14T12:00:30.000Z', 9_900)
          : overviewAt('2026-08-14T12:00:00.000Z', 10_000);
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
      fireEvent.click(await screen.findByRole('button', { name: 'Delete' }));

      await waitFor(() => expect(screen.getByText('Updating totals with your change…')).toBeInTheDocument());

      // The failed attempt must not be mistaken for the rebuild having landed.
      await act(async () => { await jest.advanceTimersByTimeAsync(2000); });
      expect(screen.getByText('Updating totals with your change…')).toBeInTheDocument();

      await act(async () => { await jest.advanceTimersByTimeAsync(2000); });
      await waitFor(() => expect(screen.getAllByText('$9,900').length).toBeGreaterThan(0));
      expect(screen.queryByText('Updating totals with your change…')).not.toBeInTheDocument();
    } finally {
      jest.useRealTimers();
    }
  });

  it('keeps waiting past the default window while the server reports a rebuild in flight', async () => {
    const overviewAt = (computedAt: string, netWorth: number, rebuildPending: boolean) => ({
      userTimeZone: 'America/Los_Angeles',
      revision: { id: computedAt, computedAt, asOf: null, status: 'current', reportingCurrency: 'USD', rebuildPending },
      warnings: [],
      financialOverview: { netWorth, totalCash: netWorth, totalInvestments: 0, totalDebt: 0, homeValue: null },
      investmentPortfolio: { holdingCount: 0, securityCount: 0, assetAllocation: [] },
      accountGroups: {
        cash: { accounts: [], totalBalance: netWorth, unavailableBalanceCount: 0 },
        investments: { accounts: [], totalBalance: 0, unavailableBalanceCount: 0 },
        debt: { accounts: [], totalBalance: 0, unavailableBalanceCount: 0 },
        other: { accounts: [], totalBalance: 0, unavailableBalanceCount: 0 },
      },
      cashFlow: {},
      home: null,
      manualAccounts: [{
        id: 'manual-1', name: 'Wallet', amount: 100, type: 'cash',
        createdAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-08-01T00:00:00.000Z',
      }],
    });

    let deleted = false;
    let slowRebuildDone = false;

    global.fetch = jest.fn().mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/api/manual-accounts/manual-1') && init?.method === 'DELETE') {
        deleted = true;
        return Promise.resolve({ ok: true, status: 200, json: async () => ({ success: true }) });
      }
      if (url.includes('/api/finances/overview')) {
        // A slow provider re-read: still running well past the default 60s window.
        const body = slowRebuildDone
          ? overviewAt('2026-08-14T12:02:00.000Z', 9_900, false)
          : overviewAt('2026-08-14T12:00:00.000Z', 10_000, deleted);
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
      fireEvent.click(await screen.findByRole('button', { name: 'Delete' }));
      await waitFor(() => expect(screen.getByText('Updating totals with your change…')).toBeInTheDocument());

      // Well past REVISION_POLL_ATTEMPTS × 2s, and still waiting rather than giving up.
      await act(async () => { await jest.advanceTimersByTimeAsync(90_000); });
      expect(screen.getByText('Updating totals with your change…')).toBeInTheDocument();
      expect(screen.queryByText(/totals have not caught up yet/)).not.toBeInTheDocument();

      slowRebuildDone = true;
      await act(async () => { await jest.advanceTimersByTimeAsync(2000); });

      await waitFor(() => expect(screen.getAllByText('$9,900').length).toBeGreaterThan(0));
      expect(screen.queryByText('Updating totals with your change…')).not.toBeInTheDocument();
    } finally {
      jest.useRealTimers();
    }
  });

  it('starts polling even when the reload right after the edit fails', async () => {
    const overviewAt = (computedAt: string, netWorth: number) => ({
      userTimeZone: 'America/Los_Angeles',
      revision: { id: computedAt, computedAt, asOf: null, status: 'current', reportingCurrency: 'USD', rebuildPending: false },
      warnings: [],
      financialOverview: { netWorth, totalCash: netWorth, totalInvestments: 0, totalDebt: 0, homeValue: null },
      investmentPortfolio: { holdingCount: 0, securityCount: 0, assetAllocation: [] },
      accountGroups: {
        cash: { accounts: [], totalBalance: netWorth, unavailableBalanceCount: 0 },
        investments: { accounts: [], totalBalance: 0, unavailableBalanceCount: 0 },
        debt: { accounts: [], totalBalance: 0, unavailableBalanceCount: 0 },
        other: { accounts: [], totalBalance: 0, unavailableBalanceCount: 0 },
      },
      cashFlow: {},
      home: null,
      manualAccounts: [{
        id: 'manual-1', name: 'Wallet', amount: 100, type: 'cash',
        createdAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-08-01T00:00:00.000Z',
      }],
    });

    let overviewRequests = 0;

    global.fetch = jest.fn().mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/api/manual-accounts/manual-1') && init?.method === 'DELETE') {
        return Promise.resolve({ ok: true, status: 200, json: async () => ({ success: true }) });
      }
      if (url.includes('/api/finances/overview')) {
        overviewRequests += 1;
        // 1: initial load, 2: the reload right after the delete fails, 3: rebuilt.
        if (overviewRequests === 2) return Promise.reject(new Error('network blip'));
        const body = overviewRequests >= 3
          ? overviewAt('2026-08-14T12:00:30.000Z', 9_900)
          : overviewAt('2026-08-14T12:00:00.000Z', 10_000);
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
      fireEvent.click(await screen.findByRole('button', { name: 'Delete' }));

      // The failed reload must not leave the edit unreconciled and unexplained.
      await waitFor(() => expect(screen.getByText('Updating totals with your change…')).toBeInTheDocument());

      await act(async () => { await jest.advanceTimersByTimeAsync(2000); });
      await waitFor(() => expect(screen.getAllByText('$9,900').length).toBeGreaterThan(0));
      expect(screen.queryByText('Updating totals with your change…')).not.toBeInTheDocument();
    } finally {
      jest.useRealTimers();
    }
  });

  it('holds a saved home value over reloads until the rebuilt snapshot carries it', async () => {
    const home = {
      address: '1 Main St',
      value: 400_000,
      valueLow: null,
      valueHigh: null,
      lastUpdated: '2026-08-13T12:00:00.000Z',
      isManualOverride: true,
      isSnapshotAligned: true,
    };
    const baseOverview = {
      userTimeZone: 'America/Los_Angeles',
      revision: {
        id: 'revision-1',
        computedAt: '2026-08-14T12:00:00.000Z',
        asOf: '2026-08-14T11:59:00.000Z',
        status: 'current',
        reportingCurrency: 'USD',
        rebuildPending: false,
      },
      warnings: [],
      financialOverview: {
        netWorth: 400_000,
        totalCash: 0,
        totalInvestments: 0,
        totalDebt: 0,
        homeValue: 400_000,
      },
      investmentPortfolio: { holdingCount: 0, securityCount: 0, assetAllocation: [] },
      accountGroups: {
        cash: { accounts: [], totalBalance: 0, unavailableBalanceCount: 0 },
        investments: { accounts: [], totalBalance: 0, unavailableBalanceCount: 0 },
        debt: { accounts: [], totalBalance: 0, unavailableBalanceCount: 0 },
        other: { accounts: [], totalBalance: 0, unavailableBalanceCount: 0 },
      },
      cashFlow: {},
      home,
      manualAccounts: [],
    };

    const rebuiltOverview = {
      ...baseOverview,
      revision: { ...baseOverview.revision, id: 'revision-2', computedAt: '2026-08-14T12:00:20.000Z' },
      financialOverview: { ...baseOverview.financialOverview, netWorth: 450_000, homeValue: 450_000 },
      home: { ...home, value: 450_000, lastUpdated: '2026-08-14T12:00:00.000Z' },
    };

    let saved = false;
    let overviewRequests = 0;

    global.fetch = jest.fn().mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/profile/home/value') && init?.method === 'PUT') {
        saved = true;
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            homeData: {
              address: '1 Main St',
              value: 450_000,
              valueLow: null,
              valueHigh: null,
              lastUpdated: '2026-08-14T12:00:00.000Z',
              isManualOverride: true,
            },
          }),
        });
      }
      if (url.includes('/api/finances/overview')) {
        overviewRequests += 1;
        // The snapshot still holds the pre-save home until the background rebuild lands.
        const body = saved && overviewRequests > 2 ? rebuiltOverview : baseOverview;
        return Promise.resolve({ ok: true, status: 200, json: async () => body });
      }
      if (url.includes('/api/financial-history')) {
        return Promise.resolve({ ok: true, status: 200, json: async () => [] });
      }
      return Promise.resolve({ ok: true, status: 200, json: async () => ({ success: true, data: [] }) });
    }) as jest.Mock;

    jest.useFakeTimers({ doNotFake: ['queueMicrotask'] });

    try {
      render(<FinancesPageClient />);

      const homeHeading = await screen.findByRole('heading', { name: 'Home Value' });
      fireEvent.click(homeHeading);
      fireEvent.click(await screen.findByRole('button', { name: /edit value/i }));

      const input = await screen.findByPlaceholderText('Enter value');
      fireEvent.change(input, { target: { value: '450000' } });
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));

      // The reload right after the save returns the stale snapshot; the saved value must
      // not be clobbered by it.
      await waitFor(() => expect(screen.getAllByText('$450,000').length).toBeGreaterThan(0));
      expect(screen.getByText('Updating totals with your change…')).toBeInTheDocument();

      await act(async () => {
        await jest.advanceTimersByTimeAsync(2000);
      });

      await waitFor(() =>
        expect(screen.queryByText('Updating totals with your change…')).not.toBeInTheDocument()
      );
      expect(screen.getAllByText('$450,000').length).toBeGreaterThan(0);
    } finally {
      jest.useRealTimers();
    }
  });
});
