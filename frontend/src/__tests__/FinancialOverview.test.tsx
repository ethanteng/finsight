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

describe('FinancialOverview', () => {
  beforeEach(() => {
    (global.fetch as jest.Mock).mockClear();
    (global.fetch as jest.Mock).mockReset();
    localStorageMock.getItem.mockClear();
    localStorageMock.removeItem.mockClear();
  });

  afterEach(() => {
    (global.fetch as jest.Mock).mockRestore();
  });

  beforeAll(() => {
    // Set up localStorage mock to return auth token
    localStorageMock.getItem.mockImplementation((key) => {
      console.log('localStorage.getItem called with key:', key);
      if (key === 'auth_token') {
        console.log('Returning mock-auth-token for auth_token');
        return 'mock-auth-token';
      }
      console.log('Returning null for key:', key);
      return null;
    });
  });

  it('renders without crashing', () => {
    render(<FinancialOverview />);
    // The component should render something (either loading skeleton or add accounts message)
    expect(document.body).not.toBeEmptyDOMElement();
  });

  it('shows add accounts message when no accounts exist', () => {
    render(<FinancialOverview />);
    expect(screen.getByText('Your Financial Overview')).toBeInTheDocument();
    expect(screen.getByText('Add your accounts to start seeing your financial overview')).toBeInTheDocument();
    expect(screen.getByText('Add Your Accounts')).toBeInTheDocument();
  });

  it('shows financial overview when accounts exist (demo mode)', async () => {
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

    const mockInvestmentData = {
      portfolio: {
        totalValue: 100000,
        assetAllocation: [],
        holdingCount: 25,
        securityCount: 15,
      },
    };

    // Mock fetch responses BEFORE rendering
    (global.fetch as jest.Mock)
      .mockImplementation((url) => {
        if (url.includes('/plaid/all-accounts')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ accounts: mockAccounts }),
          });
        } else if (url.includes('/plaid/investments')) {
          return Promise.resolve({
            ok: true,
            json: async () => mockInvestmentData,
          });
        }
        return Promise.resolve({
          ok: false,
          status: 404,
          json: async () => ({ error: 'Not found' }),
        });
      });

    render(<FinancialOverview isDemo={true} />);

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

  it('handles demo mode correctly', async () => {
    const mockDemoAccounts = [
      {
        id: 'demo_checking',
        name: 'Demo Checking',
        type: 'depository',
        subtype: 'checking',
        balance: {
          current: 10000,
          available: 10000,
          iso_currency_code: 'USD',
        },
      },
    ];

    const mockDemoInvestmentData = {
      portfolio: {
        totalValue: 50000,
        assetAllocation: [],
        holdingCount: 10,
        securityCount: 8,
      },
    };

    // Mock fetch responses for demo mode BEFORE rendering
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ accounts: mockDemoAccounts }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockDemoInvestmentData,
      });

    render(<FinancialOverview isDemo={true} />);

    // Wait for the component to finish loading and show the overview
    await waitFor(() => {
      expect(screen.getByText('$10,000')).toBeInTheDocument(); // Total Cash
    }, { timeout: 3000 });

    // Now check all the other values
    expect(screen.getByText('$0')).toBeInTheDocument(); // Total Debt
    expect(screen.getByText('$50,000')).toBeInTheDocument(); // Total Investments
  });

  it('calculates totals correctly for different account types (demo mode)', async () => {
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

    // Mock fetch responses BEFORE rendering
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ accounts: mockAccounts }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 404,
      });

    render(<FinancialOverview isDemo={true} />);

    // Wait for the component to finish loading and show the overview
    await waitFor(() => {
      expect(screen.getByText('$15,000')).toBeInTheDocument(); // Total Cash (5000 + 10000)
    }, { timeout: 3000 });

    // Now check all the other values
    expect(screen.getByText('$203,000')).toBeInTheDocument(); // Total Debt (3000 + 200000)
    expect(screen.getByText('$75,000')).toBeInTheDocument(); // Total Investments
    expect(screen.getByText('-$113,000')).toBeInTheDocument(); // Net Worth (15000 + 75000 - 203000)
  });

  it('uses investment portfolio value when available (demo mode)', async () => {
    const mockAccounts = [
      {
        id: 'investment_1',
        name: '401k',
        type: 'investment',
        subtype: '401k',
        balance: { current: 50000, available: 50000, iso_currency_code: 'USD' },
      },
    ];

    const mockInvestmentData = {
      portfolio: {
        totalValue: 75000, // Higher than account balance
        assetAllocation: [],
        holdingCount: 20,
        securityCount: 12,
      },
    };

    // Mock fetch responses BEFORE rendering
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ accounts: mockAccounts }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockInvestmentData,
      });

    render(<FinancialOverview isDemo={true} />);

    // Wait for the component to finish loading and show the overview
    await waitFor(() => {
      // Should use portfolio value (75000) instead of account balance (50000)
      // Check that there are exactly 2 elements with $75,000 (Total Investments and Net Worth)
      const elementsWith75000 = screen.getAllByText('$75,000');
      expect(elementsWith75000).toHaveLength(2);
    }, { timeout: 3000 });
  });
});
