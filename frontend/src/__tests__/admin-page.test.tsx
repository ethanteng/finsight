import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import AdminPage from '../app/admin/page';

// Mock fetch
global.fetch = jest.fn();

// Mock localStorage
const localStorageMock = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
  length: 0,
  key: jest.fn(),
};
Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
  configurable: true,
});

// Mock the MarkdownRenderer component
jest.mock('../components/MarkdownRenderer', () => {
  return function MockMarkdownRenderer({ children }: { children: string }) {
    return <div data-testid="markdown-renderer">{children}</div>;
  };
});

describe('AdminPage', () => {
  let marketContextsAvailable = true;

  beforeEach(() => {
    jest.clearAllMocks();
    localStorageMock.getItem.mockReturnValue('mock-token');
    marketContextsAvailable = true;
    global.fetch = jest.fn().mockImplementation((url: string) => {
      if (url.includes('/admin/production-sessions')) {
        return Promise.resolve({ ok: true, json: async () => ({ users: [] }) });
      }
      if (url.includes('/admin/production-conversations')) {
        return Promise.resolve({ ok: true, json: async () => ({ conversations: [] }) });
      }
      if (url.includes('/admin/production-users')) {
        return Promise.resolve({ ok: true, json: async () => ({ users: [] }) });
      }
      if (url.includes('/market-news/context/')) {
        const tier = url.split('/').pop();
        return marketContextsAvailable
          ? Promise.resolve({
              ok: true,
              json: async () => ({
                contextText: `${tier} context`,
                dataSources: ['fred'],
                keyEvents: ['event1'],
                lastUpdate: '2025-08-07T01:00:00Z',
                tier,
              }),
            })
          : Promise.resolve({ ok: false, status: 404 });
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({ responseTone: '', defaultResponseTone: '', isDefault: true }),
      });
    });
  });

  it('should render all tabs including Market News', async () => {
    render(<AdminPage />);

    // Wait for loading to complete
    await waitFor(() => {
      expect(screen.queryByText('Loading admin data...')).not.toBeInTheDocument();
    });

    expect(await screen.findByText('Production')).toBeInTheDocument();
    expect(screen.getByText('User Management')).toBeInTheDocument();
    expect(screen.getByText('Market News')).toBeInTheDocument();
  });

  it('should switch to Market News tab when clicked', async () => {
    render(<AdminPage />);

    // Wait for loading to complete
    await waitFor(() => {
      expect(screen.queryByText('Loading admin data...')).not.toBeInTheDocument();
    });

    const marketNewsTab = await screen.findByText('Market News');
    fireEvent.click(marketNewsTab);

    await waitFor(() => {
      expect(screen.getByText(/Market news context/i)).toBeInTheDocument();
    });
  });

  it('should display market context for each tier', async () => {
    render(<AdminPage />);

    // Wait for loading to complete
    await waitFor(() => {
      expect(screen.queryByText('Loading admin data...')).not.toBeInTheDocument();
    });

    const marketNewsTab = await screen.findByText('Market News');
    fireEvent.click(marketNewsTab);

    await waitFor(() => {
      expect(screen.getByText(/starter tier/i)).toBeInTheDocument();
      expect(screen.getByText(/standard tier/i)).toBeInTheDocument();
      expect(screen.getByText(/premium tier/i)).toBeInTheDocument();
    });
  });

  it('should show refresh and edit buttons for each tier', async () => {
    render(<AdminPage />);

    // Wait for loading to complete
    await waitFor(() => {
      expect(screen.queryByText('Loading admin data...')).not.toBeInTheDocument();
    });

    const marketNewsTab = await screen.findByText('Market News');
    fireEvent.click(marketNewsTab);

    await waitFor(() => {
      expect(screen.getAllByText('Refresh')).toHaveLength(3);
      expect(screen.getAllByText('Edit')).toHaveLength(3);
    });
  });

  it('refreshes all market contexts with one all-tier request', async () => {
    render(<AdminPage />);

    await waitFor(() => {
      expect(screen.queryByText('Loading admin data...')).not.toBeInTheDocument();
    });
    fireEvent.click(await screen.findByText('Market News'));
    const refreshAll = await screen.findByText('Refresh All Contexts');
    const fetchMock = global.fetch as jest.Mock;
    fetchMock.mockClear();

    fireEvent.click(refreshAll);

    await waitFor(() => {
      const refreshCalls = fetchMock.mock.calls.filter(([url]) =>
        String(url).includes('/admin/market-news/refresh')
      );
      expect(refreshCalls).toHaveLength(1);
      expect(refreshCalls[0][0]).toMatch(/\/admin\/market-news\/refresh$/);
      expect(refreshCalls[0][1]).toMatchObject({ method: 'POST' });
    });
  });

  it('should handle empty market context gracefully', async () => {
    marketContextsAvailable = false;

    render(<AdminPage />);

    // Wait for loading to complete
    await waitFor(() => {
      expect(screen.queryByText('Loading admin data...')).not.toBeInTheDocument();
    });

    const marketNewsTab = await screen.findByText('Market News');
    fireEvent.click(marketNewsTab);

    await waitFor(() => {
      expect(screen.getAllByText('No market context available for this tier.')).toHaveLength(3);
    });
  });
});

describe('Admin User Management', () => {
  let accessRevoked = false;
  let accountDeleted = false;

  beforeEach(() => {
    accessRevoked = false;
    accountDeleted = false;
    localStorageMock.getItem.mockReturnValue('mock-token');
    // Mock all API calls to return appropriate data based on the URL
    global.fetch = jest.fn().mockImplementation((url: string) => {
      if (url.includes('/admin/revoke-user-access/')) {
        accessRevoked = true;
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true }) });
      } else if (url.includes('/admin/restore-user-access/')) {
        accessRevoked = false;
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true }) });
      } else if (url.includes('/admin/delete-user-account/')) {
        accountDeleted = true;
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true }) });
      }
      if (url.includes('/admin/production-users')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            users: [
              {
                id: 'user1',
                email: 'test@example.com',
                tier: 'starter',
                createdAt: '2024-01-01T00:00:00Z',
                lastLoginAt: '2024-01-02T00:00:00Z',
                isActive: !accessRevoked,
                subscriptionStatus: 'active',
                accessLevel: 'full',
                upgradeRequired: false,
                subscriptionMessage: '',
                _count: { conversations: 5 }
              },
              {
                id: 'user2',
                email: 'test2@example.com',
                tier: 'premium',
                createdAt: '2024-01-01T00:00:00Z',
                lastLoginAt: null,
                isActive: false,
                subscriptionStatus: 'canceled',
                accessLevel: 'none',
                upgradeRequired: true,
                subscriptionMessage: 'Subscription canceled.',
                _count: { conversations: 0 }
              },
              {
                id: 'user3',
                email: 'trial@example.com',
                tier: 'premium',
                createdAt: '2026-08-13T00:00:00Z',
                lastLoginAt: null,
                isActive: true,
                subscriptionStatus: 'trialing',
                trialExpiresAt: '2026-09-12T12:00:00Z',
                accessLevel: 'full',
                upgradeRequired: false,
                subscriptionMessage: 'premium trial is active',
                _count: { conversations: 1 }
              }
            ].filter((user) => !accountDeleted || user.id !== 'user1')
          })
        });
      } else if (url.includes('/admin/production-sessions')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ users: [] })
        });
      } else if (url.includes('/admin/production-conversations')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ conversations: [] })
        });
      } else if (url.includes('/market-news/context/')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            contextText: '',
            dataSources: [],
            keyEvents: [],
            lastUpdate: '',
            tier: 'starter'
          })
        });
      } else if (url.includes('/admin/ai/response-tone')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ responseTone: '', defaultResponseTone: '', isDefault: true })
        });
      } else {
        // Default fallback
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({})
        });
      }
    });
  });

  it('should display user management tab with user information', async () => {
    render(<AdminPage />);

    // Wait for data to load
    await waitFor(() => {
      expect(screen.queryByText('Loading admin data...')).not.toBeInTheDocument();
    });

    // Click on User Management tab
    const userTab = await screen.findByText('User Management');
    fireEvent.click(userTab);

    // Wait for user data to load
    await waitFor(() => {
      expect(screen.getByText('test@example.com')).toBeInTheDocument();
      expect(screen.getByText('test2@example.com')).toBeInTheDocument();
      expect(screen.getByText('trial@example.com')).toBeInTheDocument();
    });

    // Check that active/inactive status is displayed
    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.getByText('Admin Revoked')).toBeInTheDocument();
    expect(screen.getByText('Active trials').parentElement).toHaveTextContent(/1\s*Active trials/);
    expect(screen.getByText('Trialing')).toBeInTheDocument();
    expect(screen.getByText(/Trial ends:/)).toHaveTextContent('9/12/2026');
  });

  it('should allow revoking user access', async () => {
    render(<AdminPage />);

    // Wait for data to load
    await waitFor(() => {
      expect(screen.queryByText('Loading admin data...')).not.toBeInTheDocument();
    });

    // Navigate to User Management tab
    const userTab = await screen.findByText('User Management');
    fireEvent.click(userTab);

    // Wait for user data to load
    await waitFor(() => {
      expect(screen.getByText('test@example.com')).toBeInTheDocument();
    });

    // Click revoke access button
    const userRow = screen.getByText('test@example.com').closest('article');
    expect(userRow).not.toBeNull();
    const revokeButton = within(userRow!).getByText('Revoke Access');
    fireEvent.click(revokeButton);

    // Verify the API call was made
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/admin/revoke-user-access/user1'),
        expect.objectContaining({
          method: 'PUT',
          headers: expect.objectContaining({
            'Authorization': 'Bearer mock-token'
          })
        })
      );
    });

    // Verify the user status changed to Admin Revoked (and Restore Access button appears)
    await waitFor(() => {
      expect(within(userRow!).getByText('Admin Revoked')).toBeInTheDocument();
      expect(within(userRow!).getByText('Restore Access')).toBeInTheDocument();
    });
  });

  it('should allow restoring user access', async () => {
    accessRevoked = true;
    render(<AdminPage />);

    // Wait for data to load
    await waitFor(() => {
      expect(screen.queryByText('Loading admin data...')).not.toBeInTheDocument();
    });

    // Navigate to User Management tab
    const userTab = await screen.findByText('User Management');
    fireEvent.click(userTab);

    // Wait for user data to load
    await waitFor(() => {
      expect(screen.getByText('test@example.com')).toBeInTheDocument();
    });

    // Click restore access button
    const userRow = screen.getByText('test@example.com').closest('article');
    expect(userRow).not.toBeNull();
    const restoreButton = within(userRow!).getByText('Restore Access');
    fireEvent.click(restoreButton);

    // Verify the API call was made
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/admin/restore-user-access/user1'),
        expect.objectContaining({
          method: 'PUT',
          headers: expect.objectContaining({
            'Authorization': 'Bearer mock-token'
          })
        })
      );
    });

    // Verify the user status changed
    await waitFor(() => {
      expect(screen.getByText('Active')).toBeInTheDocument();
    });
  });

  it('should show delete confirmation modal', async () => {
    render(<AdminPage />);

    // Wait for data to load
    await waitFor(() => {
      expect(screen.queryByText('Loading admin data...')).not.toBeInTheDocument();
    });

    // Navigate to User Management tab
    const userTab = await screen.findByText('User Management');
    fireEvent.click(userTab);

    // Wait for user data to load
    await waitFor(() => {
      expect(screen.getByText('test@example.com')).toBeInTheDocument();
    });

    // Click delete account button for the specific user (use getAllByText to get the first one)
    const userRow = screen.getByText('test@example.com').closest('article');
    expect(userRow).not.toBeNull();
    const deleteButton = within(userRow!).getByText('Delete Account');
    fireEvent.click(deleteButton);

    // Verify confirmation modal is shown
    expect(screen.getByText(/⚠️ Warning:/)).toBeInTheDocument();
    expect(screen.getByText(/This will permanently delete the user account/)).toBeInTheDocument();
    expect(screen.getByText(/This action cannot be undone/)).toBeInTheDocument();
    expect(screen.getByText('Yes, Delete Account')).toBeInTheDocument();
    expect(screen.getByText('Cancel')).toBeInTheDocument();
  });

  it('should allow deleting user account', async () => {
    render(<AdminPage />);

    // Wait for data to load
    await waitFor(() => {
      expect(screen.queryByText('Loading admin data...')).not.toBeInTheDocument();
    });

    // Navigate to User Management tab
    const userTab = await screen.findByText('User Management');
    fireEvent.click(userTab);

    // Wait for user data to load
    await waitFor(() => {
      expect(screen.getByText('test@example.com')).toBeInTheDocument();
    });

    // Click delete account button to show confirmation (use getAllByText to get the first one)
    const userRow = screen.getByText('test@example.com').closest('article');
    expect(userRow).not.toBeNull();
    const deleteButton = within(userRow!).getByText('Delete Account');
    fireEvent.click(deleteButton);

    // Wait for confirmation modal
    await waitFor(() => {
      expect(screen.getByText('Yes, Delete Account')).toBeInTheDocument();
    });

    // Click confirm delete
    const confirmDeleteButton = screen.getByText('Yes, Delete Account');
    fireEvent.click(confirmDeleteButton);

    // Verify the API call was made
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/admin/delete-user-account/user1'),
        expect.objectContaining({
          method: 'DELETE',
          headers: expect.objectContaining({
            'Authorization': 'Bearer mock-token'
          })
        })
      );
    });
  });

  it('should allow canceling delete confirmation', async () => {
    render(<AdminPage />);

    // Wait for data to load
    await waitFor(() => {
      expect(screen.queryByText('Loading admin data...')).not.toBeInTheDocument();
    });

    // Navigate to User Management tab
    const userTab = await screen.findByText('User Management');
    fireEvent.click(userTab);

    // Wait for user data to load
    await waitFor(() => {
      expect(screen.getByText('test@example.com')).toBeInTheDocument();
    });

    // Click delete account button to show confirmation (use getAllByText to get the first one)
    const userRow = screen.getByText('test@example.com').closest('article');
    expect(userRow).not.toBeNull();
    const deleteButton = within(userRow!).getByText('Delete Account');
    fireEvent.click(deleteButton);

    // Wait for confirmation modal
    await waitFor(() => {
      expect(screen.getByText('Cancel')).toBeInTheDocument();
    });

    // Click cancel
    const cancelButton = screen.getByText('Cancel');
    fireEvent.click(cancelButton);

    // Verify confirmation modal is hidden
    await waitFor(() => {
      expect(screen.queryByText(/⚠️ Warning:/)).not.toBeInTheDocument();
    });
  });
});
