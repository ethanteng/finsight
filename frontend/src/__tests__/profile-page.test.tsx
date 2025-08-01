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
};
global.localStorage = localStorageMock;

// Mock window.location
Object.defineProperty(window, 'location', {
  value: {
    href: '',
  },
  writable: true,
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
      // Mock demo mode by setting URL search params
      Object.defineProperty(window, 'location', {
        value: {
          search: '?demo=true',
        },
        writable: true,
      });

      render(<ProfilePage />);
      
      const disconnectButton = screen.getByText('Disconnect All Accounts');
      fireEvent.click(disconnectButton);

      await waitFor(() => {
        expect(screen.getByText('This is a demo only. In the real app, your accounts would have been disconnected.')).toBeInTheDocument();
      });
    });

    it('should show demo message when deleting data in demo mode', async () => {
      // Mock demo mode by setting URL search params
      Object.defineProperty(window, 'location', {
        value: {
          search: '?demo=true',
        },
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
      });
    });

    it('should not make API calls in demo mode', async () => {
      // Mock demo mode
      Object.defineProperty(window, 'location', {
        value: {
          search: '?demo=true',
        },
        writable: true,
      });

      render(<ProfilePage />);
      
      const disconnectButton = screen.getByText('Disconnect All Accounts');
      fireEvent.click(disconnectButton);

      await waitFor(() => {
        expect(screen.getByText('This is a demo only. In the real app, your accounts would have been disconnected.')).toBeInTheDocument();
      });

      // Verify no API calls were made
      expect(global.fetch).not.toHaveBeenCalled();
    });
  });

  describe('Real Mode Functionality', () => {
    beforeEach(() => {
      localStorageMock.getItem.mockReturnValue('mock-auth-token');
    });

    it('should call disconnect API when not in demo mode', async () => {
      // Mock successful API response
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      });

      render(<ProfilePage />);
      
      const disconnectButton = screen.getByText('Disconnect All Accounts');
      fireEvent.click(disconnectButton);

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          expect.stringContaining('/privacy/disconnect-accounts'),
          expect.objectContaining({
            method: 'POST',
            headers: expect.objectContaining({
              'Authorization': 'Bearer mock-auth-token',
            }),
          })
        );
      });

      await waitFor(() => {
        expect(screen.getByText('Your accounts have been successfully disconnected.')).toBeInTheDocument();
      });
    });

    it('should call delete API when not in demo mode', async () => {
      // Mock successful API response
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
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
        expect(global.fetch).toHaveBeenCalledWith(
          expect.stringContaining('/privacy/delete-all-data'),
          expect.objectContaining({
            method: 'DELETE',
            headers: expect.objectContaining({
              'Authorization': 'Bearer mock-auth-token',
            }),
          })
        );
      });

      await waitFor(() => {
        expect(screen.getByText('All your data has been successfully deleted.')).toBeInTheDocument();
      });
    });

    it('should handle API errors gracefully', async () => {
      // Mock failed API response
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      render(<ProfilePage />);
      
      const disconnectButton = screen.getByText('Disconnect All Accounts');
      fireEvent.click(disconnectButton);

      await waitFor(() => {
        expect(screen.getByText('Failed to disconnect accounts. Please try again.')).toBeInTheDocument();
      });
    });

    it('should redirect to home page after successful deletion', async () => {
      // Mock successful API response
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      });

      render(<ProfilePage />);
      
      const deleteButton = screen.getByText('Delete All Data');
      fireEvent.click(deleteButton);

      const confirmButton = screen.getByText('Yes, Delete Everything');
      fireEvent.click(confirmButton);

      await waitFor(() => {
        expect(localStorageMock.removeItem).toHaveBeenCalledWith('auth_token');
      });

      // Check that redirect happens after 2 seconds
      await waitFor(() => {
        expect(window.location.href).toBe('/');
      }, { timeout: 3000 });
    });
  });

  describe('Confirmation Modal', () => {
    it('should show confirmation modal when delete button is clicked', async () => {
      render(<ProfilePage />);
      
      const deleteButton = screen.getByText('Delete All Data');
      fireEvent.click(deleteButton);

      await waitFor(() => {
        expect(screen.getByText('Confirm Data Deletion')).toBeInTheDocument();
        expect(screen.getByText('This action will permanently delete all your data including:')).toBeInTheDocument();
        expect(screen.getByText('• All connected bank accounts')).toBeInTheDocument();
        expect(screen.getByText('• Transaction history')).toBeInTheDocument();
        expect(screen.getByText('• Conversation history')).toBeInTheDocument();
        expect(screen.getByText('• Account balances and sync data')).toBeInTheDocument();
        expect(screen.getByText('This action cannot be undone.')).toBeInTheDocument();
      });
    });

    it('should close modal when cancel is clicked', async () => {
      render(<ProfilePage />);
      
      const deleteButton = screen.getByText('Delete All Data');
      fireEvent.click(deleteButton);

      await waitFor(() => {
        expect(screen.getByText('Confirm Data Deletion')).toBeInTheDocument();
      });

      const cancelButton = screen.getByText('Cancel');
      fireEvent.click(cancelButton);

      await waitFor(() => {
        expect(screen.queryByText('Confirm Data Deletion')).not.toBeInTheDocument();
      });
    });

    it('should show loading state during API calls', async () => {
      // Mock slow API response
      (global.fetch as jest.Mock).mockImplementationOnce(() => 
        new Promise(resolve => setTimeout(() => resolve({ ok: true, json: () => ({ success: true }) }), 100))
      );

      localStorageMock.getItem.mockReturnValue('mock-auth-token');

      render(<ProfilePage />);
      
      const disconnectButton = screen.getByText('Disconnect All Accounts');
      fireEvent.click(disconnectButton);

      // Should show loading state
      expect(screen.getByText('Disconnecting...')).toBeInTheDocument();
      expect(disconnectButton).toBeDisabled();

      await waitFor(() => {
        expect(screen.getByText('Your accounts have been successfully disconnected.')).toBeInTheDocument();
      });
    });
  });

  describe('Authentication Handling', () => {
    it('should handle missing auth token gracefully', async () => {
      localStorageMock.getItem.mockReturnValue(null);

      // Mock failed API response due to missing auth
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 401,
      });

      render(<ProfilePage />);
      
      const disconnectButton = screen.getByText('Disconnect All Accounts');
      fireEvent.click(disconnectButton);

      await waitFor(() => {
        expect(screen.getByText('Failed to disconnect accounts. Please try again.')).toBeInTheDocument();
      });
    });

    it('should include auth token in API calls when available', async () => {
      localStorageMock.getItem.mockReturnValue('mock-auth-token');

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      });

      render(<ProfilePage />);
      
      const disconnectButton = screen.getByText('Disconnect All Accounts');
      fireEvent.click(disconnectButton);

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({
            headers: expect.objectContaining({
              'Authorization': 'Bearer mock-auth-token',
            }),
          })
        );
      });
    });
  });

  describe('Error Message Display', () => {
    it('should show success messages in green', async () => {
      localStorageMock.getItem.mockReturnValue('mock-auth-token');

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      });

      render(<ProfilePage />);
      
      const disconnectButton = screen.getByText('Disconnect All Accounts');
      fireEvent.click(disconnectButton);

      await waitFor(() => {
        const successMessage = screen.getByText('Your accounts have been successfully disconnected.');
        expect(successMessage).toHaveClass('bg-green-900');
      });
    });

    it('should show error messages in red', async () => {
      localStorageMock.getItem.mockReturnValue('mock-auth-token');

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

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