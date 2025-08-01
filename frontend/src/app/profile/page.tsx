"use client";
import { useState, useEffect, useCallback } from 'react';
import PlaidLinkButton from '../../components/PlaidLinkButton';
import TransactionHistory from '../../components/TransactionHistory';

interface Account {
  id: string;
  name: string;
  type: string;
  subtype: string;
  balance: {
    current: number;
    available: number;
    iso_currency_code: string;
  };
}

interface SyncInfo {
  lastSync: string;
  accountsSynced: number;
  transactionsSynced: number;
}

export default function ProfilePage() {
  const [connectedAccounts, setConnectedAccounts] = useState<Account[]>([]);
  const [syncInfo, setSyncInfo] = useState<SyncInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [isDemo, setIsDemo] = useState(false);

  const API_URL = process.env.NEXT_PUBLIC_API_URL;

  // Helper functions that take demo mode as parameter
  const loadConnectedAccountsWithDemoMode = useCallback(async (demoMode: boolean) => {
    console.log('loadConnectedAccountsWithDemoMode called with demoMode:', demoMode);
    
    setLoading(true);
    setError('');
    
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      // Add demo mode header or authentication header
      if (demoMode) {
        headers['x-demo-mode'] = 'true';
        console.log('Demo mode detected, sending x-demo-mode header');
      } else {
        const token = localStorage.getItem('auth_token');
        if (token) {
          headers['Authorization'] = `Bearer ${token}`;
          console.log('Sending auth token:', token.substring(0, 20) + '...');
        } else {
          console.log('No auth token found in localStorage');
        }
      }

      console.log('Making request to /plaid/all-accounts with headers:', headers);
      const res = await fetch(`${API_URL}/plaid/all-accounts`, {
        method: 'GET',
        headers,
      });

      if (res.ok) {
        const data = await res.json();
        console.log('Received accounts data:', data);
        setConnectedAccounts(data.accounts || []);
      } else {
        if (res.status === 401) {
          setError('Authentication required. Please log in.');
        } else {
          setError('Failed to load accounts');
        }
      }
    } catch {
      setError('Error loading accounts');
    } finally {
      setLoading(false);
    }
  }, [API_URL]);

  const loadSyncStatusWithDemoMode = useCallback(async (demoMode: boolean) => {
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      // Add demo mode header or authentication header
      if (demoMode) {
        headers['x-demo-mode'] = 'true';
        console.log('Demo mode detected, sending x-demo-mode header');
      } else {
        const token = localStorage.getItem('auth_token');
        if (token) {
          headers['Authorization'] = `Bearer ${token}`;
          console.log('Sending auth token for sync status:', token.substring(0, 20) + '...');
        } else {
          console.log('No auth token found in localStorage for sync status');
        }
      }

      const res = await fetch(`${API_URL}/sync/status`, {
        method: 'GET',
        headers,
      });

      if (res.ok) {
        const data = await res.json();
        setSyncInfo(data.syncInfo);
      }
    } catch (err) {
      console.error('Error loading sync status:', err);
    }
  }, [API_URL]);

  // Manual refresh function - handles both data sync and connection refresh
  const handleManualRefresh = async () => {
    setRefreshing(true);
    setNotification(null); // Clear any existing notifications
    
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      // Add demo mode header or authentication header
      if (isDemo) {
        headers['x-demo-mode'] = 'true';
        console.log('Demo mode detected, sending x-demo-mode header');
      } else {
        const token = localStorage.getItem('auth_token');
        if (token) {
          headers['Authorization'] = `Bearer ${token}`;
          console.log('Sending auth token:', token.substring(0, 20) + '...');
        } else {
          console.log('No auth token found in localStorage');
        }
      }

      // Now sync the data
      const res = await fetch(`${API_URL}/sync/manual`, {
        method: 'POST',
        headers,
      });

      if (res.ok) {
        const result = await res.json();
        if (result.success) {
          // Reload both sync status and accounts after successful refresh
          loadSyncStatusWithDemoMode(isDemo || false);
          loadConnectedAccountsWithDemoMode(isDemo || false);
          setNotification({ message: 'Data refreshed successfully!', type: 'success' });
        }
      }
    } catch (err) {
      console.error('Error during manual refresh:', err);
      setNotification({ message: 'Failed to refresh data. Please try again.', type: 'error' });
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    // Check if user came from demo page
    const referrer = document.referrer;
    const urlParams = new URLSearchParams(window.location.search);
    const isFromDemo = referrer.includes('/demo') || urlParams.get('demo') === 'true';
    
    console.log('Demo detection debug:', {
      referrer,
      urlParams: urlParams.get('demo'),
      isFromDemo,
      currentUrl: window.location.href
    });
    
    setIsDemo(isFromDemo);
    
    // Only call API functions after we've determined demo mode
    if (isFromDemo) {
      console.log('Demo mode detected, calling API functions');
      // Call the functions directly with the correct demo mode
      loadConnectedAccountsWithDemoMode(true);
      loadSyncStatusWithDemoMode(true);
    } else {
      console.log('Not demo mode, calling API functions');
      loadConnectedAccountsWithDemoMode(false);
      loadSyncStatusWithDemoMode(false);
    }
  }, [loadConnectedAccountsWithDemoMode, loadSyncStatusWithDemoMode]);

  // Auto-hide notifications after 3 seconds
  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => {
        setNotification(null);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      
      {/* Header */}
      <div className="bg-gray-800 border-b border-gray-700 p-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-white">Profile</h1>
          <div className="flex items-center space-x-3">
            <a 
              href={isDemo ? "/privacy?demo=true" : "/privacy"}
              className="text-gray-300 hover:text-white text-sm transition-colors"
            >
              Privacy
            </a>
            <a 
              href={isDemo ? "/demo" : "/app"}
              className="bg-gray-700 hover:bg-gray-600 px-3 py-1 rounded text-sm transition-colors"
            >
              Back to App
            </a>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto p-6">
        {/* Account Management Section */}
        <div className="bg-gray-800 rounded-lg p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Connected Accounts</h2>
          
                            {/* Connect New Account */}
                  <div className="mb-6">
                    <PlaidLinkButton 
                      onSuccess={() => {
                        // Only reload accounts when an account is actually linked
                        console.log('Account linked, reloading accounts');
                        loadConnectedAccountsWithDemoMode(isDemo || false);
                      }}
                      isDemo={isDemo}
                    />
                  </div>

          {/* Sync Status */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-medium">Sync Status</h3>
              <button
                onClick={handleManualRefresh}
                disabled={refreshing}
                className={`px-3 py-1 rounded text-sm transition-colors ${
                  refreshing 
                    ? 'bg-gray-500 cursor-not-allowed' 
                    : 'bg-blue-600 hover:bg-blue-700'
                }`}
              >
                {refreshing ? 'Refreshing...' : 'Refresh Data'}
              </button>
            </div>
            {syncInfo ? (
              <div className="text-sm text-gray-400">
                Last updated: {new Date(syncInfo.lastSync).toLocaleString()}
                <br />
                Accounts synced: {syncInfo.accountsSynced} | Transactions synced: {syncInfo.transactionsSynced}
              </div>
            ) : (
              <div className="text-sm text-gray-400">
                No sync data available yet. Connect an account and click Refresh Data to sync.
              </div>
            )}
            {refreshing && (
              <div className="text-sm mt-2 text-blue-400">
                Refreshing data...
              </div>
            )}
            {notification && (
              <div className={`text-sm mt-2 ${
                notification.type === 'success' 
                  ? 'text-green-400' 
                  : 'text-red-400'
              }`}>
                {notification.message}
              </div>
            )}
          </div>

          {/* Connected Accounts List */}
          <div>
            <h3 className="text-lg font-medium mb-3">Your Connected Accounts</h3>
            
            {loading ? (
              <div className="text-gray-400">Loading accounts...</div>
            ) : error ? (
              <div className="text-gray-400">
                {error}
              </div>
            ) : connectedAccounts.length === 0 ? (
              <div className="text-gray-400">
                No accounts connected yet. Use the button above to connect your first account.
              </div>
            ) : (
              <div className="space-y-3">
                {connectedAccounts.map((account) => (
                  <div 
                    key={account.id} 
                    className="bg-gray-700 rounded-lg p-4 border border-gray-600"
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <div className="font-medium text-white">{account.name}</div>
                        <div className="text-sm text-gray-400">
                          {account.type} • {account.subtype}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-semibold text-white">
                          {formatCurrency(account.balance.current)}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Transaction History */}
        <div className="mb-6">
          <TransactionHistory isDemo={isDemo} />
        </div>

        {/* Account Settings */}
        <div className="bg-gray-800 rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-4">Account Settings</h2>
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-medium mb-2">Data Privacy</h3>
              <p className="text-gray-400 text-sm">
                Your financial data is read-only and never stored permanently. 
                We use Plaid&apos;s secure API to access your accounts.
              </p>
            </div>
            <div>
              <h3 className="text-lg font-medium mb-2">Disconnect Accounts</h3>
              <p className="text-gray-400 text-sm">
                To disconnect an account, you&apos;ll need to revoke access through your bank&apos;s website 
                or contact your financial institution directly.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 