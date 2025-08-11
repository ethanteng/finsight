"use client";
import { useState, useEffect, useCallback } from 'react';
import PlaidLinkButton from '../../components/PlaidLinkButton';
import TransactionHistory from '../../components/TransactionHistory';
import UserProfile from '../../components/UserProfile';
import InvestmentPortfolio from '../../components/InvestmentPortfolio';

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

interface InvestmentData {
  portfolio: {
    totalValue: number;
    assetAllocation: Array<{
      type: string;
      value: number;
      percentage: number;
    }>;
    holdingCount: number;
    securityCount: number;
  };
  holdings: Array<{
    id: string;
    account_id: string;
    security_id: string;
    institution_value: number;
    institution_price: number;
    institution_price_as_of: string;
    cost_basis: number;
    quantity: number;
    iso_currency_code: string;
  }>;
  transactions: Array<{
    id: string;
    account_id: string;
    security_id: string;
    amount: number;
    date: string;
    name: string;
    quantity: number;
    price: number;
    fees: number;
    type: string;
    iso_currency_code: string;
  }>;
}

export default function ProfilePage() {
  const [connectedAccounts, setConnectedAccounts] = useState<Account[]>([]);
  const [investmentData, setInvestmentData] = useState<InvestmentData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isDemo, setIsDemo] = useState<boolean | undefined>(undefined); // Start as undefined to prevent premature rendering
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteMessage, setDeleteMessage] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [userEmail, setUserEmail] = useState<string>('');
  const [demoStatusDetermined, setDemoStatusDetermined] = useState(false); // Start as false

  const API_URL = process.env.NEXT_PUBLIC_API_URL;

  // Helper functions that take demo mode as parameter
  const loadConnectedAccountsWithDemoMode = useCallback(async (demoMode: boolean) => {
    console.log('loadConnectedAccountsWithDemoMode called with demoMode:', demoMode);
    console.log('API_URL in function:', API_URL);
    
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

      const requestUrl = `${API_URL}/plaid/all-accounts`;
      console.log('Making request to:', requestUrl);
      console.log('Request headers:', headers);
      
      const res = await fetch(requestUrl, {
        method: 'GET',
        headers,
      });

      console.log('Response status:', res.status);
      console.log('Response ok:', res.ok);

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
    } catch (error) {
      console.error('Error in loadConnectedAccountsWithDemoMode:', error);
      setError('Error loading accounts');
    } finally {
      setLoading(false);
    }
  }, [API_URL]);

  // NEW: Load enhanced investment data
  const loadInvestmentData = useCallback(async (demoMode: boolean) => {
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      if (demoMode) {
        headers['x-demo-mode'] = 'true';
      } else {
        const token = localStorage.getItem('auth_token');
        if (token) {
          headers['Authorization'] = `Bearer ${token}`;
        }
      }

      // Use the new comprehensive investment endpoint
      const res = await fetch(`${API_URL}/plaid/investments`, {
        method: 'GET',
        headers,
      });

      if (res.ok) {
        const data = await res.json();
        console.log('Received enhanced investment data:', data);
        setInvestmentData(data);
      } else {
        console.log('Failed to load investment data:', res.status);
        // Don't set error here as this is optional data
      }
    } catch (err) {
      console.error('Error loading investment data:', err);
      // Don't set error here as this is optional data
    }
  }, [API_URL]);

  useEffect(() => {
    // Check if demo mode is explicitly requested via URL parameter
    const urlParams = new URLSearchParams(window.location.search);
    const isFromDemo = urlParams.get('demo') === 'true';
    
    // Also check if we have an auth token (indicates real user)
    const hasAuthToken = !!localStorage.getItem('auth_token');
    
    // Determine demo mode: true only if explicitly requested via URL
    const shouldBeDemo = isFromDemo;
    
    console.log('Demo detection debug:', {
      urlParams: urlParams.get('demo'),
      isFromDemo,
      hasAuthToken,
      shouldBeDemo,
      currentUrl: window.location.href
    });
    
    console.log('Setting isDemo to:', shouldBeDemo);
    setIsDemo(shouldBeDemo);
    setDemoStatusDetermined(true);
    
    // Only call API functions after we've determined demo mode
    if (shouldBeDemo) {
      console.log('Demo mode detected, calling API functions');
      console.log('API_URL:', API_URL);
      loadConnectedAccountsWithDemoMode(true);
      loadInvestmentData(true);
    } else {
      console.log('Real user mode detected, calling API functions');
      loadConnectedAccountsWithDemoMode(false);
      loadInvestmentData(false);
    }
  }, [loadConnectedAccountsWithDemoMode, loadInvestmentData, API_URL]);

  // Fetch user email when not in demo mode
  useEffect(() => {
    if (!isDemo) {
      const fetchUserEmail = async () => {
        try {
          const token = localStorage.getItem('auth_token');
          if (token) {
            const res = await fetch(`${API_URL}/auth/verify`, {
              headers: {
                'Authorization': `Bearer ${token}`
              }
            });
            
            if (res.ok) {
              const data = await res.json();
              setUserEmail(data.user.email);
            }
          }
        } catch (error) {
          console.error('Failed to fetch user email:', error);
        }
      };
      
      fetchUserEmail();
    }
  }, [isDemo, API_URL]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  const handleDisconnectAccounts = async () => {
    if (isDemo) {
      setDeleteMessage('This is a demo only. In the real app, your accounts would have been disconnected.');
      return;
    }

    setIsDeleting(true);
    setDeleteMessage('');
    
    try {
      const token = localStorage.getItem('auth_token');
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const response = await fetch(`${API_URL}/privacy/disconnect-accounts`, {
        method: 'POST',
        headers,
      });

      if (response.ok) {
        setDeleteMessage('Your accounts have been successfully disconnected.');
        // Reload accounts to show they're disconnected
        loadConnectedAccountsWithDemoMode(false);
      } else {
        setDeleteMessage('Failed to disconnect accounts. Please try again.');
      }
    } catch (_error) {
      setDeleteMessage('An error occurred while disconnecting your accounts. Please try again.');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDeleteAllData = async () => {
    if (isDemo) {
      setDeleteMessage('This is a demo only. In the real app, your account data would have been deleted.');
      setShowDeleteConfirm(false);
      return;
    }

    setIsDeleting(true);
    setDeleteMessage('');
    
    try {
      const token = localStorage.getItem('auth_token');
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const response = await fetch(`${API_URL}/privacy/delete-all-data`, {
        method: 'DELETE',
        headers,
      });

      if (response.ok) {
        setDeleteMessage('All your data has been successfully deleted.');
        localStorage.removeItem('auth_token');
        // Redirect to home page after successful deletion
        setTimeout(() => {
          window.location.href = '/';
        }, 2000);
      } else {
        setDeleteMessage('Failed to delete data. Please try again or contact support.');
      }
    } catch (_error) {
      setDeleteMessage('An error occurred while deleting your data. Please try again.');
    } finally {
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  // Don't render anything until we've determined if this is demo mode or not
  if (!demoStatusDetermined || isDemo === undefined) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-400">Loading profile...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      
      {/* Header */}
      <div className="bg-gray-800 border-b border-gray-700 p-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-white">Profile</h1>
          <div className="flex items-center space-x-3">
            {userEmail && !isDemo && (
              <span className="text-gray-400 text-sm">
                {userEmail}
              </span>
            )}
            <a 
              href={isDemo ? "/demo" : "/app"}
              className="bg-gray-700 hover:bg-gray-600 px-3 py-1 rounded text-sm transition-colors"
            >
              Back to App
            </a>
            {!isDemo && (
              <button 
                onClick={() => {
                  localStorage.removeItem('auth_token');
                  window.location.href = '/login';
                }}
                className="text-gray-300 hover:text-white text-sm transition-colors"
              >
                Logout
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto p-6">
        {/* User Profile Section */}
        {demoStatusDetermined && (
          <UserProfile userId={userEmail ? 'user' : undefined} isDemo={isDemo} />
        )}
        
        {/* Account Management Section */}
        <div className="bg-gray-800 rounded-lg p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Your Connected Accounts</h2>
          
          {/* Connect New Account */}
          <div className="mb-6">
            <PlaidLinkButton 
              onSuccess={() => {
                // Only reload accounts when an account is actually linked
                console.log('Account linked, reloading accounts');
                loadConnectedAccountsWithDemoMode(isDemo || false);
                loadInvestmentData(isDemo || false);
              }}
              isDemo={isDemo}
            />
          </div>

          {/* Connected Accounts List */}
          <div>
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

        {/* NEW: Enhanced Investment Portfolio Section */}
        {investmentData && (
          <div className="mb-6">
            <InvestmentPortfolio 
              portfolio={{
                totalValue: investmentData.portfolio?.totalValue || 0,
                assetAllocation: investmentData.portfolio?.assetAllocation || [],
                holdingCount: investmentData.portfolio?.holdingCount || 0,
                securityCount: investmentData.portfolio?.securityCount || 0
              }}
              holdings={investmentData.holdings || []}
              transactions={investmentData.transactions || []}
              isDemo={isDemo}
            />
          </div>
        )}

        {/* Transaction History - Show ALL transactions */}
        <div className="mb-6">
          <TransactionHistory isDemo={isDemo} />
        </div>

        {/* Account Settings */}
        <div className="bg-gray-800 rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-4">Account Settings</h2>
          <div className="space-y-6">
            <div>
              <p className="text-gray-400 text-sm mb-4">
                Your financial data is read-only and never stored permanently. 
                We use Plaid&apos;s secure API to access your accounts.
              </p>
              
              <div className="space-y-4">
                <div className="border border-gray-600 rounded-lg p-4">
                  <h4 className="font-medium mb-2">Disconnect Your Accounts</h4>
                  <p className="text-gray-400 text-sm mb-3">
                    Remove all Plaid connections and clear your financial data. 
                    This will disconnect all linked bank accounts but keep your conversation history.
                  </p>
                  <button
                    onClick={handleDisconnectAccounts}
                    disabled={isDeleting}
                    className="bg-slate-600 hover:bg-slate-700 disabled:bg-slate-800 px-4 py-2 rounded text-sm transition-colors"
                  >
                    {isDeleting ? 'Disconnecting...' : 'Disconnect All Accounts'}
                  </button>
                </div>

                <div className="border border-gray-600 rounded-lg p-4">
                  <h4 className="font-medium mb-2">Delete All Your Data</h4>
                  <p className="text-gray-400 text-sm mb-3">
                    Permanently delete all your data including accounts, transactions, 
                    conversations, and Plaid connections. This action cannot be undone.
                  </p>
                  <button
                    onClick={() => setShowDeleteConfirm(true)}
                    disabled={isDeleting}
                    className="bg-rose-600 hover:bg-rose-700 disabled:bg-rose-800 px-4 py-2 rounded text-sm transition-colors"
                  >
                    Delete All Data
                  </button>
                </div>
              </div>

              {deleteMessage && (
                <div className={`mt-4 p-3 rounded-lg ${
                  deleteMessage.includes('successfully') || deleteMessage.includes('This is a demo only')
                    ? 'bg-green-900 border border-green-700 text-green-200' 
                    : 'bg-red-900 border border-red-700 text-red-200'
                }`}>
                  {deleteMessage}
                </div>
              )}
            </div>
          </div>

          {/* Delete Confirmation Modal */}
          {showDeleteConfirm && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
              <div className="bg-gray-800 border border-gray-600 rounded-lg p-6 max-w-md mx-4">
                <div className="flex items-center gap-3 mb-4">
                  <div className="h-6 w-6 text-red-400">⚠️</div>
                  <h3 className="text-lg font-semibold">Confirm Data Deletion</h3>
                </div>
                <p className="text-gray-300 mb-4">
                  This action will permanently delete all your data including:
                </p>
                <ul className="text-sm text-gray-400 mb-4 space-y-1">
                  <li>• All connected bank accounts</li>
                  <li>• Transaction history</li>
                  <li>• Conversation history</li>
                  <li>• Account balances and sync data</li>
                  <li>• Financial profile</li>
                </ul>
                <p className="text-sm text-red-400 mb-4 font-medium">
                  This action cannot be undone.
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={handleDeleteAllData}
                    disabled={isDeleting}
                    className="bg-rose-600 hover:bg-rose-700 disabled:bg-rose-800 px-4 py-2 rounded text-sm transition-colors flex-1"
                  >
                    {isDeleting ? 'Deleting...' : 'Yes, Delete Everything'}
                  </button>
                  <button
                    onClick={() => setShowDeleteConfirm(false)}
                    className="bg-gray-600 hover:bg-gray-700 px-4 py-2 rounded text-sm transition-colors flex-1"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
} 