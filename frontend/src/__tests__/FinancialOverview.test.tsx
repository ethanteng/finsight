import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import FinancialOverview from '@/components/FinancialOverview';

// Mock Next.js router
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: jest.fn(),
  }),
}));

// Mock fetch
global.fetch = jest.fn();

// Mock localStorage
const localStorageMock = {
  getItem: jest.fn(),
  removeItem: jest.fn(),
  setItem: jest.fn(),
  clear: jest.fn(),
  length: 0,
  key: jest.fn(),
};
global.localStorage = localStorageMock as Storage;

function mockFinancialOverviewFetch({
  accounts,
  financialOverview = {},
  investmentPortfolio = {
    totalValue: 0,
    holdingCount: 0,
    securityCount: 0,
    assetAllocation: [],
  },
  summaryOk = true,
  connectionHealth,
}: {
  accounts: unknown[];
  financialOverview?: Record<string, unknown>;
  investmentPortfolio?: Record<string, unknown>;
  summaryOk?: boolean;
  connectionHealth?: Record<string, unknown>;
}) {
  (global.fetch as jest.Mock).mockImplementation((url: string) => {
    if (url.includes('/api/finances/overview')) {
      if (!summaryOk) {
        return Promise.resolve({ ok: true, status: 204, json: async () => ({}) });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({
          revision: {
            id: 'revision-1',
            computedAt: new Date().toISOString(),
            asOf: new Date().toISOString(),
            status: 'current',
            reportingCurrency: 'USD',
          },
          warnings: [],
          connectionHealth,
          financialOverview,
          investmentPortfolio,
          accountGroups: {
            cash: { accounts, totalBalance: 0, unavailableBalanceCount: 0 },
            investments: { accounts: [], totalBalance: 0, unavailableBalanceCount: 0 },
            debt: { accounts: [], totalBalance: 0, unavailableBalanceCount: 0 },
            other: { accounts: [], totalBalance: 0, unavailableBalanceCount: 0 },
          },
          cashFlow: {},
          home: null,
          manualAccounts: [],
        }),
      });
    }
    return Promise.resolve({ ok: false, status: 404, json: async () => ({ error: 'Not found' }) });
  });
}

describe('FinancialOverview', () => {
  beforeEach(() => {
    (global.fetch as jest.Mock).mockClear();
    (global.fetch as jest.Mock).mockReset();
    localStorageMock.getItem.mockImplementation((key) =>
      key === 'auth_token' ? 'mock-auth-token' : null
    );
    localStorageMock.removeItem.mockClear();
  });

  beforeAll(() => {
    Object.defineProperty(window, 'localStorage', {
      value: localStorageMock,
      writable: true,
    });
  });

  it('dates the overview by the newest source observation, not the oldest', async () => {
    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (!url.includes('/api/finances/overview')) {
        return Promise.resolve({ ok: false, status: 404, json: async () => ({ error: 'Not found' }) });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({
          revision: {
            id: 'revision-1',
            computedAt: '2026-08-14T12:00:00.000Z',
            asOf: '2026-08-13T17:00:00.000Z',
            newestSourceAsOf: '2026-08-14T11:45:00.000Z',
            status: 'current',
            reportingCurrency: 'USD',
          },
          warnings: [],
          financialOverview: { netWorth: 10_000, totalCash: 10_000, totalInvestments: 0, totalDebt: 0, homeValue: null },
          investmentPortfolio: { totalValue: 0, holdingCount: 0, securityCount: 0, assetAllocation: [] },
          accountGroups: {
            cash: {
              accounts: [{ id: 'checking_1', name: 'Checking', type: 'depository', subtype: 'checking', balance: { current: 10_000, iso_currency_code: 'USD' } }],
              totalBalance: 10_000,
              unavailableBalanceCount: 0,
            },
            investments: { accounts: [], totalBalance: 0, unavailableBalanceCount: 0 },
            debt: { accounts: [], totalBalance: 0, unavailableBalanceCount: 0 },
            other: { accounts: [], totalBalance: 0, unavailableBalanceCount: 0 },
          },
          cashFlow: {},
          home: null,
          manualAccounts: [],
        }),
      });
    });

    render(<FinancialOverview />);

    const expected = new Date('2026-08-14T11:45:00.000Z').toLocaleString();
    expect(await screen.findByText(`Data as of ${expected}`)).toBeInTheDocument();
    expect(screen.queryByText(
      `Data as of ${new Date('2026-08-13T17:00:00.000Z').toLocaleString()}`
    )).not.toBeInTheDocument();
  });

  it('shows no badge for a stale revision but still flags a missing source', async () => {
    const overviewFor = (status: string) => ({
      revision: {
        id: 'revision-1',
        computedAt: '2026-08-14T12:00:00.000Z',
        asOf: '2026-08-13T17:00:00.000Z',
        newestSourceAsOf: '2026-08-14T11:45:00.000Z',
        status,
        reportingCurrency: 'USD',
      },
      warnings: [],
      financialOverview: { netWorth: 10_000, totalCash: 10_000, totalInvestments: 0, totalDebt: 0, homeValue: null },
      investmentPortfolio: { totalValue: 0, holdingCount: 0, securityCount: 0, assetAllocation: [] },
      accountGroups: {
        cash: {
          accounts: [{ id: 'checking_1', name: 'Checking', type: 'depository', subtype: 'checking', balance: { current: 10_000, iso_currency_code: 'USD' } }],
          totalBalance: 10_000,
          unavailableBalanceCount: 0,
        },
        investments: { accounts: [], totalBalance: 0, unavailableBalanceCount: 0 },
        debt: { accounts: [], totalBalance: 0, unavailableBalanceCount: 0 },
        other: { accounts: [], totalBalance: 0, unavailableBalanceCount: 0 },
      },
      cashFlow: {},
      home: null,
      manualAccounts: [],
    });
    const mockOverview = (status: string) => {
      (global.fetch as jest.Mock).mockImplementation((url: string) => {
        if (!url.includes('/api/finances/overview')) {
          return Promise.resolve({ ok: false, status: 404, json: async () => ({ error: 'Not found' }) });
        }
        return Promise.resolve({ ok: true, status: 200, json: async () => overviewFor(status) });
      });
    };

    mockOverview('stale');
    const stale = render(<FinancialOverview />);
    const expected = new Date('2026-08-14T11:45:00.000Z').toLocaleString();
    expect(await screen.findByText(`Data as of ${expected}`)).toBeInTheDocument();
    expect(screen.queryByText('Some data is stale')).not.toBeInTheDocument();
    expect(screen.queryByText('Some data unavailable')).not.toBeInTheDocument();
    expect(screen.queryByText('Source data unavailable')).not.toBeInTheDocument();
    stale.unmount();

    // A genuinely missing source is still worth flagging -- only staleness was dropped.
    mockOverview('partial');
    render(<FinancialOverview />);
    expect(await screen.findByText('Some data unavailable')).toBeInTheDocument();
  });

  it('renders without crashing', async () => {
    mockFinancialOverviewFetch({ accounts: [], summaryOk: false });
    render(<FinancialOverview />);
    expect(await screen.findByText('Your Financial Overview')).toBeInTheDocument();
  });

  it('shows add accounts message when no accounts exist', async () => {
    mockFinancialOverviewFetch({ accounts: [], summaryOk: false });
    render(<FinancialOverview />);
    expect(await screen.findByText('Your Financial Overview')).toBeInTheDocument();
    expect(screen.getByText('Add your accounts to start seeing your financial overview')).toBeInTheDocument();
    expect(screen.getByText('Add Your Accounts')).toBeInTheDocument();
  });

  it('shows financial overview when accounts exist', async () => {
    const mockAccounts = [
      {
        id: 'checking_1',
        name: 'Chase Checking',
        type: 'depository',
        subtype: 'checking',
        balance: {
          current: 5000,
          available: 5000,
          iso_currency_code: 'USD',
        },
      },
      {
        id: 'credit_1',
        name: 'Chase Credit Card',
        type: 'credit',
        subtype: 'credit card',
        balance: {
          current: -2000,
          available: 8000,
          limit: 10000,
          iso_currency_code: 'USD',
        },
      },
      {
        id: 'investment_1',
        name: 'Fidelity 401k',
        type: 'investment',
        subtype: '401k',
        balance: {
          current: 100000,
          available: 100000,
          iso_currency_code: 'USD',
        },
      },
    ];

    mockFinancialOverviewFetch({
      accounts: mockAccounts,
      financialOverview: {
        netWorth: 103000,
        totalCash: 5000,
        totalInvestments: 100000,
        totalDebt: 2000,
        homeValue: null,
      },
      investmentPortfolio: {
        totalValue: 100000,
        assetAllocation: [],
        holdingCount: 25,
        securityCount: 15,
      },
    });

    render(<FinancialOverview />);

    // Wait for the component to finish loading and show the overview
    await waitFor(() => {
      expect(screen.getByText('$5,000')).toBeInTheDocument(); // Total Cash
    }, { timeout: 3000 });

    // Now check all the other values
    expect(screen.getByText('$2,000')).toBeInTheDocument(); // Total Debt
    expect(screen.getByText('$100,000')).toBeInTheDocument(); // Total Investments
    expect(screen.getByText('$103,000')).toBeInTheDocument(); // Net Worth
    expect(screen.getByText('3')).toBeInTheDocument(); // Account count
    expect(screen.getByText('25')).toBeInTheDocument(); // Holdings count
    expect(screen.getByText('15')).toBeInTheDocument(); // Securities count
  });

  it('uses canonical snapshot values', async () => {
    const mockAccounts = [
      {
        id: 'checking_1',
        name: 'Checking',
        type: 'depository',
        subtype: 'checking',
        balance: {
          current: 10000,
          available: 10000,
          iso_currency_code: 'USD',
        },
      },
    ];

    mockFinancialOverviewFetch({
      accounts: mockAccounts,
      financialOverview: {
        netWorth: 60000,
        totalCash: 10000,
        totalDebt: 0,
        totalInvestments: 50000,
        homeValue: null,
      },
      investmentPortfolio: {
        totalValue: 50000,
        assetAllocation: [],
        holdingCount: 10,
        securityCount: 8,
      },
    });

    render(<FinancialOverview />);

    // Wait for the component to finish loading and show the overview
    await waitFor(() => {
      expect(screen.getByText('$10,000')).toBeInTheDocument(); // Total Cash
    }, { timeout: 3000 });

    // Now check all the other values
    expect(screen.getByText('$0')).toBeInTheDocument(); // Total Debt
    expect(screen.getByText('Unavailable')).toBeInTheDocument(); // Home Value
    expect(screen.getByText('$50,000')).toBeInTheDocument(); // Total Investments
    expect(screen.getByText('$60,000')).toBeInTheDocument(); // Net Worth
  });

  it('calculates totals correctly for different account types', async () => {
    const mockAccounts = [
      // Cash accounts
      {
        id: 'checking_1',
        name: 'Checking',
        type: 'depository',
        subtype: 'checking',
        balance: { current: 5000, available: 5000, iso_currency_code: 'USD' },
      },
      {
        id: 'savings_1',
        name: 'Savings',
        type: 'depository',
        subtype: 'savings',
        balance: { current: 10000, available: 10000, iso_currency_code: 'USD' },
      },
      // Debt accounts
      {
        id: 'credit_1',
        name: 'Credit Card',
        type: 'credit',
        subtype: 'credit card',
        balance: { current: -3000, available: 7000, limit: 10000, iso_currency_code: 'USD' },
      },
      {
        id: 'loan_1',
        name: 'Mortgage',
        type: 'loan',
        subtype: 'mortgage',
        balance: { current: 200000, available: 0, iso_currency_code: 'USD' },
      },
      // Investment accounts
      {
        id: 'investment_1',
        name: '401k',
        type: 'investment',
        subtype: '401k',
        balance: { current: 75000, available: 75000, iso_currency_code: 'USD' },
      },
    ];

    mockFinancialOverviewFetch({
      accounts: mockAccounts,
      financialOverview: {
        netWorth: -113000,
        totalCash: 15000,
        totalDebt: 203000,
        totalInvestments: 75000,
        homeValue: null,
      },
      investmentPortfolio: {
        totalValue: 75000,
        assetAllocation: [],
        holdingCount: 0,
        securityCount: 0,
      },
    });

    render(<FinancialOverview />);

    // Wait for the component to finish loading and show the overview
    await waitFor(() => {
      expect(screen.getByText('$15,000')).toBeInTheDocument(); // Total Cash (5000 + 10000)
    }, { timeout: 3000 });

    // Now check all the other values
    expect(screen.getByText('$203,000')).toBeInTheDocument(); // Total Debt (3000 + 200000)
    expect(screen.getByText('$75,000')).toBeInTheDocument(); // Total Investments
    expect(screen.getByText('-$113,000')).toBeInTheDocument(); // Net Worth (15000 + 75000 - 203000)
  });

  it('uses investment portfolio value when available', async () => {
    const mockAccounts = [
      {
        id: 'investment_1',
        name: '401k',
        type: 'investment',
        subtype: '401k',
        balance: { current: 50000, available: 50000, iso_currency_code: 'USD' },
      },
    ];

    mockFinancialOverviewFetch({
      accounts: mockAccounts,
      financialOverview: {
        netWorth: 75000,
        totalCash: 0,
        totalDebt: 0,
        totalInvestments: 75000,
        homeValue: null,
      },
      investmentPortfolio: {
        totalValue: 75000,
        assetAllocation: [],
        holdingCount: 20,
        securityCount: 12,
      },
    });

    render(<FinancialOverview />);

    // Wait for the component to finish loading and show the overview
    await waitFor(() => {
      // Should use portfolio value (75000) instead of account balance (50000)
      // Check that there are exactly 2 elements with $75,000 (Total Investments and Net Worth)
      const elementsWith75000 = screen.getAllByText('$75,000');
      expect(elementsWith75000).toHaveLength(2);
    }, { timeout: 3000 });
  });
});

describe('FinancialOverview reconnect indicator', () => {
  beforeEach(() => {
    (global.fetch as jest.Mock).mockReset();
    localStorageMock.getItem.mockImplementation((key) =>
      key === 'auth_token' ? 'mock-auth-token' : null
    );
  });

  const account = { account_id: 'cash', name: 'Checking', type: 'depository' };

  it('surfaces a broken connection on the dashboard card', async () => {
    mockFinancialOverviewFetch({
      accounts: [account],
      connectionHealth: {
        reauthRequiredCount: 1,
        reauthRequiredInstitutions: ['Bank of America'],
      },
    });

    render(<FinancialOverview />);

    // The whole point: visible without navigating to Accounts & context.
    expect(await screen.findByText(/Bank of America needs to be reconnected/)).toBeInTheDocument();
  });

  it('stays quiet when every connection is healthy', async () => {
    mockFinancialOverviewFetch({
      accounts: [account],
      connectionHealth: { reauthRequiredCount: 0, reauthRequiredInstitutions: [] },
    });

    render(<FinancialOverview />);

    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(screen.queryByText(/needs? to be reconnected/)).not.toBeInTheDocument();
  });

  it('stays quiet against a server that does not send the field', async () => {
    mockFinancialOverviewFetch({ accounts: [account] });

    render(<FinancialOverview />);

    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(screen.queryByText(/needs? to be reconnected/)).not.toBeInTheDocument();
  });
});
