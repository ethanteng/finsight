import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import ProfilePage from '../app/profile/page';

jest.mock('snaptrade-react', () => ({
  SnapTradeReact: () => null,
}));

jest.mock('snaptrade-react/hooks/useWindowMessage', () => ({
  useWindowMessage: jest.fn(),
}));

// Mock fetch globally
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

interface MockOptions {
  headers?: Record<string, string>;
  method?: string;
}

let lastDisconnectOptions: MockOptions | null = null;
let lastDeleteOptions: MockOptions | null = null;

function mockFetchForDisconnect({ ok = true, status = 200 } = {}) {
  lastDisconnectOptions = null;
  (global.fetch as jest.Mock).mockImplementation((url, options) => {
    if (url && typeof url === 'string' && url.endsWith('/privacy/disconnect-accounts') && options?.method === 'POST') {
      lastDisconnectOptions = options as MockOptions;
      return Promise.resolve({ ok, status, json: async () => ({ success: ok }) });
    }
    if (url && typeof url === 'string' && url.endsWith('/snaptrade/delete') && options?.method === 'DELETE') {
      return Promise.resolve({ ok, status, json: async () => ({ success: ok }) });
    }
    return Promise.resolve({ ok: true, status: 200, json: async () => ({}) });
  });
}

function mockFetchForDelete({ ok = true, status = 200 } = {}) {
  lastDeleteOptions = null;
  (global.fetch as jest.Mock).mockImplementation((url, options) => {
    if (url && typeof url === 'string' && url.endsWith('/privacy/delete-all-data') && options?.method === 'DELETE') {
      lastDeleteOptions = options as MockOptions;
      return Promise.resolve({ ok, status, json: async () => ({ success: ok }) });
    }
    if (url && typeof url === 'string' && url.endsWith('/snaptrade/delete') && options?.method === 'DELETE') {
      return Promise.resolve({ ok, status, json: async () => ({ success: ok }) });
    }
    return Promise.resolve({ ok: true, status: 200, json: async () => ({}) });
  });
}

// Save original location
const originalLocation = window.location;

beforeAll(() => {
  process.env.NEXT_PUBLIC_API_URL = 'http://localhost:3000';
  delete (window as unknown as Record<string, unknown>).location;
  (window as unknown as Record<string, unknown>).location = { href: '', search: '' } as Location;
  // Set up localStorage mock globally
  localStorageMock.getItem.mockImplementation((key) => {
    console.log('localStorage.getItem called with key:', key);
    if (key === 'auth_token') {
      console.log('Returning mock-auth-token for auth_token');
      return 'mock-auth-token';
    }
    console.log('Returning null for key:', key);
    return null;
  });
  // Also set up window.localStorage to ensure it's available
  Object.defineProperty(window, 'localStorage', {
    value: localStorageMock,
    writable: true,
  });
});
afterAll(() => {
  (window as unknown as Record<string, unknown>).location = originalLocation;
});

describe('ProfilePage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (global.fetch as jest.Mock).mockClear();
    localStorageMock.getItem.mockClear();
    localStorageMock.removeItem.mockClear();
  });

  describe('Delete Buttons Rendering', () => {
    it('should render disconnect accounts button', () => {
      render(<ProfilePage />);
      expect(screen.getByText('Disconnect All Accounts')).toBeInTheDocument();
    });

    it('should render delete all data button', () => {
      render(<ProfilePage />);
      expect(screen.getByText('Delete All Data')).toBeInTheDocument();
    });

    it('should show helpful context for each button', () => {
      render(<ProfilePage />);

      // Check disconnect context
      expect(screen.getByText(/Remove all Plaid and SnapTrade connections and clear your financial data/)).toBeInTheDocument();
      expect(screen.getByText(/This will disconnect all linked financial accounts but keep your conversation history/)).toBeInTheDocument();

      // Check delete context
      expect(screen.getByText(/Permanently delete all your data including accounts, transactions/)).toBeInTheDocument();
      expect(screen.getByText(/This action cannot be undone/)).toBeInTheDocument();
    });
  });

  describe('Real Mode Functionality', () => {
    beforeEach(() => {
      // Reset localStorage mock for each test
      localStorageMock.getItem.mockReset();
      localStorageMock.removeItem.mockReset();
      // Set up localStorage mock for each test
      localStorageMock.getItem.mockImplementation((key) => {
        if (key === 'auth_token') return 'mock-auth-token';
        return null;
      });
    });

    it('should call disconnect API when as an authenticated user', async () => {
      // Ensure as an authenticated user
      (window.location as unknown as Record<string, unknown>).search = '';
      Object.defineProperty(document, 'referrer', {
        value: '',
        writable: true,
      });
      mockFetchForDisconnect({ ok: true, status: 200 });
      render(<ProfilePage />);
      const disconnectButton = screen.getByText('Disconnect All Accounts');
      fireEvent.click(disconnectButton);
      await waitFor(() => {
        expect(lastDisconnectOptions).not.toBeNull();
      });
      expect(lastDisconnectOptions?.headers?.['Authorization']).toBe('Bearer mock-auth-token');
    });
    it('should call delete API when as an authenticated user', async () => {
      // Ensure as an authenticated user
      (window.location as unknown as Record<string, unknown>).search = '';
      Object.defineProperty(document, 'referrer', {
        value: '',
        writable: true,
      });
      mockFetchForDelete({ ok: true, status: 200 });
      render(<ProfilePage />);
      const deleteButton = screen.getByText('Delete All Data');
      fireEvent.click(deleteButton);
      const confirmButton = screen.getByText('Yes, Delete Everything');
      fireEvent.click(confirmButton);
      await waitFor(() => {
        expect(lastDeleteOptions).not.toBeNull();
      });
      expect(lastDeleteOptions?.headers?.['Authorization']).toBe('Bearer mock-auth-token');
    });
    it('should show success message after successful deletion', async () => {
      // Ensure as an authenticated user
      (window.location as unknown as Record<string, unknown>).search = '';
      Object.defineProperty(document, 'referrer', {
        value: '',
        writable: true,
      });
      localStorageMock.removeItem.mockClear();
      mockFetchForDelete({ ok: true, status: 200 });
      render(<ProfilePage />);
      const deleteButton = screen.getByText('Delete All Data');
      fireEvent.click(deleteButton);
      const confirmButton = screen.getByText('Yes, Delete Everything');
      fireEvent.click(confirmButton);
      // Wait for the success message to appear
      await waitFor(() => {
        expect(screen.getByText('All your data (Plaid and SnapTrade) has been successfully deleted.')).toBeInTheDocument();
      });
      // Verify localStorage.removeItem was called
      expect(localStorageMock.removeItem).toHaveBeenCalledWith('auth_token');
    });
  });

  describe('Authentication Handling', () => {
    beforeEach(() => {
      // Reset localStorage mock for each test
      localStorageMock.getItem.mockReset();
    });

    it('should handle missing auth token gracefully', async () => {
      // Ensure as an authenticated user
      (window.location as unknown as Record<string, unknown>).search = '';
      Object.defineProperty(document, 'referrer', {
        value: '',
        writable: true,
      });
      localStorageMock.getItem.mockReturnValue(null);
      mockFetchForDisconnect({ ok: false, status: 401 });
      render(<ProfilePage />);
      const disconnectButton = screen.getByText('Disconnect All Accounts');
      fireEvent.click(disconnectButton);
      await waitFor(() => {
        expect(screen.getByText('Failed to disconnect some accounts. Please try again.')).toBeInTheDocument();
        expect(screen.getByText('Failed to disconnect some accounts. Please try again.')).toHaveClass('bg-red-900');
      });
      await waitFor(() => {
        expect(lastDisconnectOptions).not.toBeNull();
      });
      expect(lastDisconnectOptions?.headers?.['Authorization']).toBeUndefined();
    });

    it('should include auth token in API calls when available', async () => {
      // Ensure as an authenticated user
      (window.location as unknown as Record<string, unknown>).search = '';
      Object.defineProperty(document, 'referrer', {
        value: '',
        writable: true,
      });
      // Set up localStorage mock before rendering
      localStorageMock.getItem.mockImplementation((key) => {
        if (key === 'auth_token') return 'mock-auth-token';
        return null;
      });
      mockFetchForDisconnect({ ok: true, status: 200 });
      render(<ProfilePage />);
      const disconnectButton = screen.getByText('Disconnect All Accounts');
      fireEvent.click(disconnectButton);
      await waitFor(() => {
        expect(lastDisconnectOptions).not.toBeNull();
      });
      expect(lastDisconnectOptions?.headers?.['Authorization']).toBe('Bearer mock-auth-token');
    });
  });

  describe('Error Message Display', () => {
    it('should show success messages in green', async () => {
      // Ensure as an authenticated user
      (window.location as unknown as Record<string, unknown>).search = '';
      Object.defineProperty(document, 'referrer', {
        value: '',
        writable: true,
      });
      localStorageMock.getItem.mockImplementation((key) => {
        if (key === 'auth_token') return 'mock-auth-token';
        return null;
      });
      mockFetchForDisconnect({ ok: true, status: 200 });
      render(<ProfilePage />);
      const disconnectButton = screen.getByText('Disconnect All Accounts');
      fireEvent.click(disconnectButton);
      await waitFor(() => {
        const successMessage = screen.getByText('All your accounts (Plaid and SnapTrade) have been successfully disconnected.');
        expect(successMessage).toHaveClass('bg-green-900');
      });
    });
    it('should show error messages in red', async () => {
      // Ensure as an authenticated user
      (window.location as unknown as Record<string, unknown>).search = '';
      Object.defineProperty(document, 'referrer', {
        value: '',
        writable: true,
      });
      localStorageMock.getItem.mockImplementation((key) => {
        if (key === 'auth_token') return 'mock-auth-token';
        return null;
      });
      mockFetchForDisconnect({ ok: false, status: 500 });
      render(<ProfilePage />);
      const disconnectButton = screen.getByText('Disconnect All Accounts');
      fireEvent.click(disconnectButton);
      await waitFor(() => {
        const errorMessage = screen.getByText('Failed to disconnect some accounts. Please try again.');
        expect(errorMessage).toHaveClass('bg-red-900');
      });
    });
  });
});
