import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import ProfilePage from '../app/profile/page';

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

let lastDisconnectOptions: any = null;
let lastDeleteOptions: any = null;

function mockFetchForDisconnect({ ok = true, status = 200 } = {}) {
  lastDisconnectOptions = null;
  (global.fetch as jest.Mock).mockImplementation((url, options) => {
    if (url && typeof url === 'string' && url.endsWith('/privacy/disconnect-accounts') && options?.method === 'POST') {
      lastDisconnectOptions = options;
      return Promise.resolve({ ok, status, json: async () => ({ success: ok }) });
    }
    return Promise.resolve({ ok: true, status: 200, json: async () => ({}) });
  });
}

function mockFetchForDelete({ ok = true, status = 200 } = {}) {
  lastDeleteOptions = null;
  (global.fetch as jest.Mock).mockImplementation((url, options) => {
    if (url && typeof url === 'string' && url.endsWith('/privacy/delete-all-data') && options?.method === 'DELETE') {
      lastDeleteOptions = options;
      return Promise.resolve({ ok, status, json: async () => ({ success: ok }) });
    }
    return Promise.resolve({ ok: true, status: 200, json: async () => ({}) });
  });
}

// Save original location
const originalLocation = window.location;

beforeAll(() => {
  process.env.NEXT_PUBLIC_API_URL = 'http://localhost:3000';
  delete (window as any).location;
  (window as any).location = { href: '', search: '' } as any;
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
  (window as any).location = originalLocation;
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
      expect(screen.getByText(/Remove all Plaid connections and clear your financial data/)).toBeInTheDocument();
      expect(screen.getByText(/This will disconnect all linked bank accounts but keep your conversation history/)).toBeInTheDocument();
      
      // Check delete context
      expect(screen.getByText(/Permanently delete all your data including accounts, transactions/)).toBeInTheDocument();
      expect(screen.getByText(/This action cannot be undone/)).toBeInTheDocument();
    });
  });

  describe('Demo Mode Handling', () => {
    it('should show demo message when disconnecting accounts in demo mode', async () => {
      // Mock demo mode by setting URL search params and referrer
      (window.location as any).search = '?demo=true';
      Object.defineProperty(document, 'referrer', {
        value: 'http://localhost:3001/demo',
        writable: true,
      });
      render(<ProfilePage />);
      const disconnectButton = screen.getByText('Disconnect All Accounts');
      fireEvent.click(disconnectButton);
      await waitFor(() => {
        expect(screen.getByText('This is a demo only. In the real app, your accounts would have been disconnected.')).toBeInTheDocument();
        // Demo message should be red
        expect(screen.getByText('This is a demo only. In the real app, your accounts would have been disconnected.')).toHaveClass('bg-red-900');
      });
    });

    it('should show demo message when deleting data in demo mode', async () => {
      // Mock demo mode by setting URL search params and referrer
      (window.location as any).search = '?demo=true';
      Object.defineProperty(document, 'referrer', {
        value: 'http://localhost:3001/demo',
        writable: true,
      });
      render(<ProfilePage />);
      const deleteButton = screen.getByText('Delete All Data');
      fireEvent.click(deleteButton);
      // Should show confirmation modal
      await waitFor(() => {
        expect(screen.getByText('Confirm Data Deletion')).toBeInTheDocument();
      });
      const confirmButton = screen.getByText('Yes, Delete Everything');
      fireEvent.click(confirmButton);
      await waitFor(() => {
        expect(screen.getByText('This is a demo only. In the real app, your account data would have been deleted.')).toBeInTheDocument();
        // Demo message should be red
        expect(screen.getByText('This is a demo only. In the real app, your account data would have been deleted.')).toHaveClass('bg-red-900');
      });
    });

    it('should make API calls with demo headers in demo mode', async () => {
      // Mock demo mode by setting URL search params and referrer
      (window.location as any).search = '?demo=true';
      Object.defineProperty(document, 'referrer', {
        value: 'http://localhost:3001/demo',
        writable: true,
      });

      render(<ProfilePage />);

      // Verify API calls were made with demo headers
      await waitFor(() => {
        const calls = (global.fetch as jest.Mock).mock.calls;
        const demoCalls = calls.filter(([url, options]) => 
          url.includes('/plaid/all-accounts') && 
          options.headers['x-demo-mode'] === 'true'
        );
        expect(demoCalls.length).toBeGreaterThan(0);
      });
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

    it('should call disconnect API when not in demo mode', async () => {
      // Ensure not in demo mode
      (window.location as any).search = '';
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
      expect(lastDisconnectOptions.headers['Authorization']).toBe('Bearer mock-auth-token');
    });
    it('should call delete API when not in demo mode', async () => {
      // Ensure not in demo mode
      (window.location as any).search = '';
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
      expect(lastDeleteOptions.headers['Authorization']).toBe('Bearer mock-auth-token');
    });
    it('should show success message after successful deletion', async () => {
      // Ensure not in demo mode
      (window.location as any).search = '';
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
        expect(screen.getByText('All your data has been successfully deleted.')).toBeInTheDocument();
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
      // Ensure not in demo mode
      (window.location as any).search = '';
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
        expect(screen.getByText('Failed to disconnect accounts. Please try again.')).toBeInTheDocument();
        expect(screen.getByText('Failed to disconnect accounts. Please try again.')).toHaveClass('bg-red-900');
      });
      await waitFor(() => {
        expect(lastDisconnectOptions).not.toBeNull();
      });
      expect(lastDisconnectOptions.headers['Authorization']).toBeUndefined();
    });

    it('should include auth token in API calls when available', async () => {
      // Ensure not in demo mode
      (window.location as any).search = '';
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
      expect(lastDisconnectOptions.headers['Authorization']).toBe('Bearer mock-auth-token');
    });
  });

  describe('Error Message Display', () => {
    it('should show success messages in green', async () => {
      // Ensure not in demo mode
      (window.location as any).search = '';
      Object.defineProperty(document, 'referrer', {
        value: '',
        writable: true,
      });
      localStorageMock.getItem.mockReturnValue('mock-auth-token');
      mockFetchForDisconnect({ ok: true, status: 200 });
      render(<ProfilePage />);
      const disconnectButton = screen.getByText('Disconnect All Accounts');
      fireEvent.click(disconnectButton);
      await waitFor(() => {
        const successMessage = screen.getByText('Your accounts have been successfully disconnected.');
        expect(successMessage).toHaveClass('bg-green-900');
      });
    });
    it('should show error messages in red', async () => {
      // Ensure not in demo mode
      (window.location as any).search = '';
      Object.defineProperty(document, 'referrer', {
        value: '',
        writable: true,
      });
      localStorageMock.getItem.mockReturnValue('mock-auth-token');
      mockFetchForDisconnect({ ok: false, status: 500 });
      render(<ProfilePage />);
      const disconnectButton = screen.getByText('Disconnect All Accounts');
      fireEvent.click(disconnectButton);
      await waitFor(() => {
        const errorMessage = screen.getByText('Failed to disconnect accounts. Please try again.');
        expect(errorMessage).toHaveClass('bg-red-900');
      });
    });
  });
}); 