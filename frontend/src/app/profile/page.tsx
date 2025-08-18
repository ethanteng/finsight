"use client";
import { useState, useEffect, useCallback, useRef } from 'react';
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
  const [deleteMessage, setDeleteMessage] = useState<string>('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [userEmail, setUserEmail] = useState<string>('');
  const [demoStatusDetermined, setDemoStatusDetermined] = useState(false); // Start as false
  const [subscriptionStatus, setSubscriptionStatus] = useState<{
    status?: string;
    tier?: string;
    currentPeriodEnd?: string;
    cancelAtPeriodEnd?: boolean;
    stripeCustomerId?: string;
    accessLevel?: string;
  } | null>(null);
  const [isManagingSubscription, setIsManagingSubscription] = useState(false);
  const [subscriptionMessage, setSubscriptionMessage] = useState<string>('');
  const [retryCount, setRetryCount] = useState(0);
  const [isRetrying, setIsRetrying] = useState(false);
  const [retryMessage, setRetryMessage] = useState<string>('');

  // Ref for TransactionHistory component to trigger refresh
  const transactionHistoryRef = useRef<{ refresh: () => void }>(null);

  const API_URL = process.env.NEXT_PUBLIC_API_URL;

  // Load subscription status for non-demo users
  const loadSubscriptionStatus = useCallback(async () => {
    if (isDemo) return;
    
    try {
      const token = localStorage.getItem('auth_token');
      if (!token) return;
      
      const response = await fetch(`${API_URL}/api/stripe/subscription-status`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        setSubscriptionStatus(data);
      }
    } catch (error) {
      console.error('Failed to load subscription status:', error);
    }
  }, [API_URL, isDemo]);

  // Handle subscription management
  const handleManageSubscription = async () => {
    if (isDemo) return;
    
    setIsManagingSubscription(true);
    try {
      // Use environment variable for Stripe customer portal URL
      const portalUrl = process.env.NEXT_PUBLIC_STRIPE_CUSTOMER_PORTAL_URL;
      if (!portalUrl) {
        throw new Error('Stripe customer portal URL not configured');
      }
      window.location.href = portalUrl;
    } catch (error) {
      console.error('Error opening subscription management:', error);
      setError('Failed to open subscription management');
    } finally {
      setIsManagingSubscription(false);
    }
  };

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

  // Function to refresh all data after successful Plaid connection with retry logic
  const refreshAllData = useCallback(async (isRetry = false, currentRetryCount = 0) => {
    if (isDemo !== undefined) {
      try {
        // Show retry message if this is a retry attempt
        if (isRetry) {
          setRetryMessage(`Trying to get your transaction history (attempt ${currentRetryCount + 1}/5)...`);
        } else {
          setRetryMessage('Getting your transaction history...');
        }
        
        // Load accounts and investment data
        await loadConnectedAccountsWithDemoMode(isDemo);
        await loadInvestmentData(isDemo);
        
        // Try to refresh transaction history
        if (transactionHistoryRef.current?.refresh) {
          try {
            await transactionHistoryRef.current.refresh();
            // Success! Clear retry state
            setRetryCount(0);
            setIsRetrying(false);
            setRetryMessage('✅ Data refreshed successfully!');
            // Clear success message after 3 seconds
            setTimeout(() => setRetryMessage(''), 3000);
          } catch (error) {
            console.log('Transaction refresh failed:', error);
            // Check if it's a PRODUCT_NOT_READY error
            if (error instanceof Error && (
                error.message.includes('PRODUCT_NOT_READY') || 
                error.message.includes('not yet ready'))) {
              // Handle retry inline to avoid circular dependency
              if (currentRetryCount < 4) { // Max 5 attempts (0-4)
                const newRetryCount = currentRetryCount + 1;
                setRetryCount(newRetryCount);
                setIsRetrying(true);
                
                // Exponential backoff: 10s, 20s, 40s, 80s
                const delay = Math.pow(2, newRetryCount) * 10000;
                
                console.log(`Scheduling retry ${newRetryCount + 1}/5 in ${delay/1000} seconds...`);
                
                setTimeout(() => {
                  refreshAllData(true, newRetryCount);
                }, delay);
              } else {
                // Max retries reached
                setIsRetrying(false);
                setRetryMessage('⏰ Data is still processing. Please check back in a few minutes or refresh manually.');
                setTimeout(() => setRetryMessage(''), 10000);
              }
            } else {
              // Other error, don't retry
              setRetryMessage('❌ Failed to refresh transactions. Please try again later.');
              setTimeout(() => setRetryMessage(''), 5000);
            }
          }
        }
      } catch (error) {
        console.error('Error in refreshAllData:', error);
        // Check if it's a PRODUCT_NOT_READY error
        if (error instanceof Error && (
            error.message.includes('PRODUCT_NOT_READY') || 
            error.message.includes('not yet ready'))) {
          // Handle retry inline to avoid circular dependency
          if (currentRetryCount < 4) { // Max 5 attempts (0-4)
            const newRetryCount = currentRetryCount + 1;
            setRetryCount(newRetryCount);
            setIsRetrying(true);
            
            // Exponential backoff: 10s, 20s, 40s, 80s
            const delay = Math.pow(2, newRetryCount) * 10000;
            
            console.log(`Scheduling retry ${newRetryCount + 1}/5 in ${delay/1000} seconds...`);
            
            setTimeout(() => {
              refreshAllData(true, newRetryCount);
            }, delay);
          } else {
            // Max retries reached
            setIsRetrying(false);
            setRetryMessage('⏰ Data is still processing. Please check back in a few minutes or refresh manually.');
            setTimeout(() => setRetryMessage(''), 10000);
          }
        } else {
          setRetryMessage('❌ Failed to refresh data. Please try again later.');
          setTimeout(() => setRetryMessage(''), 5000);
        }
      }
    }
  }, [isDemo, loadConnectedAccountsWithDemoMode, loadInvestmentData]);

  useEffect(() => {
    // Check if demo mode is explicitly requested via URL parameter
    const urlParams = new URLSearchParams(window.location.search);
    const isFromDemo = urlParams.get('demo') === 'true';
    
    // Check for subscription-related URL parameters
    const subscriptionParam = urlParams.get('subscription');
    if (subscriptionParam) {
      switch (subscriptionParam) {
        case 'updated':
          setSubscriptionMessage('✅ Your subscription has been updated successfully!');
          break;
        case 'canceled':
          setSubscriptionMessage('ℹ️ Your subscription has been canceled. You can still access your data.');
          break;
        case 'active':
          setSubscriptionMessage('✅ Your subscription is now active!');
          break;
      }
      // Clear the message after 5 seconds
      setTimeout(() => setSubscriptionMessage(''), 5000);
    }
    
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

  // Fetch user email and subscription status when not in demo mode
  useEffect(() => {
    if (!isDemo) {
      const fetchUserData = async () => {
        try {
          const token = localStorage.getItem('auth_token');
          if (token) {
            // Fetch user email
            const userRes = await fetch(`${API_URL}/auth/verify`, {
              headers: {
                'Authorization': `Bearer ${token}`
              }
            });
            
            if (userRes.ok) {
              const userData = await userRes.json();
              setUserEmail(userData.user.email);
            }
            
            // Fetch subscription status
            await loadSubscriptionStatus();
          }
        } catch (error) {
          console.error('Failed to fetch user data:', error);
        }
      };
      
      fetchUserData();
    }
  }, [isDemo, API_URL, loadSubscriptionStatus]);

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
                // Refresh all data when an account is successfully linked
                console.log('Account linked, refreshing all data');
                refreshAllData();
              }}
              isDemo={isDemo}
            />
            
            {/* Retry Status Messages */}
            {retryMessage && (
              <div className={`mt-3 p-3 rounded-lg text-sm ${
                retryMessage.includes('✅') 
                  ? 'bg-green-900/20 border border-green-700 text-green-300'
                  : retryMessage.includes('❌') 
                  ? 'bg-red-900/20 border border-red-700 text-red-300'
                  : retryMessage.includes('⏰')
                  ? 'bg-yellow-900/20 border border-yellow-700 text-yellow-300'
                  : 'bg-blue-900/20 border border-blue-700 text-blue-300'
              }`}>
                {retryMessage}
              </div>
            )}
            
            {/* Retry Progress Indicator */}
            {isRetrying && (
              <div className="mt-3 p-3 bg-blue-900/20 border border-blue-700 rounded-lg">
                <div className="flex items-center gap-2 text-blue-300 text-sm">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-300"></div>
                  <span>Waiting for data to be ready... (Retry {retryCount + 1}/5)</span>
                </div>
              </div>
            )}
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
          <TransactionHistory ref={transactionHistoryRef} isDemo={isDemo} />
        </div>

        {/* Subscription Management Section */}
        {!isDemo && (
          <div className="mb-6">
            <div className="bg-gray-800 rounded-lg p-6">
              <h2 className="text-xl font-semibold mb-4">Subscription Management</h2>
              
              {/* Subscription Message */}
              {subscriptionMessage && (
                <div className="mb-4 p-3 bg-green-900/20 border border-green-700 rounded-lg">
                  <div className="text-sm text-green-400">
                    {subscriptionMessage}
                  </div>
                </div>
              )}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-medium text-white mb-2">Current Plan</h3>
                    <p className="text-gray-400 text-sm">
                      Manage your subscription, update payment methods, and view billing history
                    </p>
                  </div>
                  <div className="text-right">
                    <button
                      onClick={handleManageSubscription}
                      disabled={isManagingSubscription}
                      className="px-4 py-2 rounded text-sm transition-colors text-white bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800"
                      title="Open Stripe customer portal"
                    >
                      {isManagingSubscription ? 'Opening...' : 'Manage Subscription'}
                    </button>
                    <div className="text-xs text-gray-400 mt-1">
                      Opens Stripe customer portal
                    </div>
                  </div>
                </div>
                
                {subscriptionStatus ? (
                  <div className="border border-gray-600 rounded-lg p-4 bg-gray-700">
                    <div className="mb-2">
                      <div className="flex items-center space-x-2">
                        <span className="text-sm font-medium text-gray-300">Status</span>
                        <span className={`px-2 py-1 text-xs rounded-full ${
                          subscriptionStatus.stripeCustomerId && subscriptionStatus.status === 'active'
                            ? 'bg-green-600 text-white' 
                            : subscriptionStatus.accessLevel === 'full'
                            ? 'bg-blue-600 text-white'
                            : 'bg-yellow-600 text-white'
                        }`}>
                          {subscriptionStatus.stripeCustomerId && subscriptionStatus.status === 'active'
                            ? 'Active Subscription'
                            : subscriptionStatus.accessLevel === 'full'
                            ? 'Admin Access'
                            : subscriptionStatus.status}
                        </span>
                      </div>
                    </div>
                    <div className="text-sm text-gray-400">
                      Plan: {subscriptionStatus.tier} • Access: {subscriptionStatus.accessLevel}
                    </div>
                    {!subscriptionStatus.stripeCustomerId && (
                      <div className="mt-2 text-xs text-blue-400">
                        No active subscription found. You can still access the customer portal to view billing options.
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="border border-gray-600 rounded-lg p-4 bg-gray-700">
                    <div className="text-sm text-gray-400">
                      Loading subscription status...
                    </div>
                  </div>
                )}
                
                {/* Error Display */}
                {error && (
                  <div className="border border-red-600 rounded-lg p-4 bg-red-900/20">
                    <div className="text-sm text-red-400">
                      ⚠️ {error}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

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