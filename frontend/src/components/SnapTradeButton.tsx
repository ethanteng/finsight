"use client";

import React, { useState, useEffect } from 'react';
import { SnapTradeReact } from 'snaptrade-react';
import { useWindowMessage } from 'snaptrade-react/hooks/useWindowMessage';
import { financialServiceCoordinator, SERVICE_NAMES } from '../services/FinancialServiceCoordinator';

interface SnapTradeStatus {
  status: string;
  snapTradeUserId?: string;
  createdAt?: string;
  updatedAt?: string;
}

interface SnapTradeAccount {
  id: string;
  name: string;
  type: string;
  subtype?: string;
  institution?: string;
  balance?: number;
}

interface SnapTradeTokenStatus {
  connected: boolean;
  status: string;
  error?: string;
  lastChecked?: string;
}

interface SnapTradeButtonProps {
  onAccountsUpdated?: () => void;
  snapTradeStatus?: SnapTradeTokenStatus | null;
}

export default function SnapTradeButton({ onAccountsUpdated, snapTradeStatus: snapTradeTokenStatus }: SnapTradeButtonProps) {
  const [status, setStatus] = useState<string>('loading');
  const [snapTradeStatus, setSnapTradeStatus] = useState<SnapTradeStatus | null>(null);
  const [connectedAccounts, setConnectedAccounts] = useState<SnapTradeAccount[]>([]);
  const [isInitializing, setIsInitializing] = useState(false);

  // Modal state for SnapTrade connection portal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [redirectLink, setRedirectLink] = useState<string | null>(null);

  const API_URL = process.env.NEXT_PUBLIC_API_URL;

  // Use the useWindowMessage hook for handling SnapTrade events
  useWindowMessage({
    handleSuccess: (data) => {
      console.log('SnapTrade connection successful via window message:', data);
      financialServiceCoordinator.unregisterService(SERVICE_NAMES.SNAPTRADE);
      setIsModalOpen(false);
      setRedirectLink(null);
      // Recompute cached snapshot for Ask Linc (live SnapTrade APIs already power the UI)
      void (async () => {
        await checkConnectedAccounts();
        try {
          const token = localStorage.getItem('auth_token');
          if (token && API_URL) {
            const res = await fetch(`${API_URL}/api/refresh-summary`, {
              method: 'POST',
              headers: { Authorization: `Bearer ${token}` },
            });
            if (!res.ok) {
              console.warn('POST /api/refresh-summary after SnapTrade connect failed:', res.status);
            }
          }
        } catch (e) {
          console.warn('Failed to refresh financial snapshot for Ask Linc after SnapTrade connect', e);
        }
      })();
    },
    handleError: (error) => {
      console.error('SnapTrade connection error via window message:', error);
      financialServiceCoordinator.unregisterService(SERVICE_NAMES.SNAPTRADE);
      setStatus('error');
      setIsModalOpen(false);
      setRedirectLink(null);
    },
    handleExit: () => {
      console.log('User exited SnapTrade connection via window message');
      financialServiceCoordinator.unregisterService(SERVICE_NAMES.SNAPTRADE);
      setIsModalOpen(false);
      setRedirectLink(null);
    },
    close: () => {
      console.log('SnapTrade modal closed via window message');
      financialServiceCoordinator.unregisterService(SERVICE_NAMES.SNAPTRADE);
      setIsModalOpen(false);
      setRedirectLink(null);
    },
  });

  useEffect(() => {
    checkSnapTradeStatus();
  }, []);

  // Auto-initialize SnapTrade if not already initialized (with delay to avoid conflicts)
  useEffect(() => {
    if (status === 'not_initialized' && !isInitializing) {
      console.log('Auto-initializing SnapTrade with delay to avoid conflicts...');
      // Add a delay to prevent conflicts with other components initializing
      const timer = setTimeout(() => {
        initializeSnapTrade();
      }, 2000); // 2 second delay

      return () => clearTimeout(timer);
    }
  }, [status, isInitializing]);

  useEffect(() => {
    if (snapTradeStatus?.status === 'registered') {
      checkConnectedAccounts();
    }
  }, [snapTradeStatus]);

  const checkSnapTradeStatus = async () => {
    try {
      setStatus('loading');

      const token = localStorage.getItem('auth_token');
      if (!token) {
        setStatus('not_authenticated');
        return;
      }

      const response = await fetch(`${API_URL}/snaptrade/status/user`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        setSnapTradeStatus(data);
        setStatus(data.status);
      } else if (response.status === 404) {
        setStatus('not_initialized');
      } else {
        setStatus('error');
      }
    } catch (error) {
      console.error('Error checking SnapTrade status:', error);
      setStatus('error');
    }
  };

  const checkConnectedAccounts = async () => {
    try {
      const token = localStorage.getItem('auth_token');
      if (!token) {
        return;
      }

      const response = await fetch(`${API_URL}/snaptrade/accounts`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        console.log('SnapTrade accounts:', data);
        if (data.data?.accounts) {
          setConnectedAccounts(data.data.accounts);
          // Notify parent component that accounts have been updated
          if (onAccountsUpdated) {
            onAccountsUpdated();
          }
        }
      } else {
        console.log('No connected accounts found or error:', response.status);
        setConnectedAccounts([]);
      }
    } catch (error) {
      console.error('Error checking connected accounts:', error);
      setConnectedAccounts([]);
    }
  };

  const initializeSnapTrade = async () => {
    try {
      setIsInitializing(true);

      const token = localStorage.getItem('auth_token');
      if (!token) {
        setStatus('not_authenticated');
        return;
      }

      const response = await fetch(`${API_URL}/snaptrade/init`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        console.log('SnapTrade initialized:', data);
        await checkSnapTradeStatus(); // Refresh status
      } else {
        const errorData = await response.json();
        console.error('SnapTrade initialization failed:', errorData);
        setStatus('error');
      }
    } catch (error) {
      console.error('Error initializing SnapTrade:', error);
      setStatus('error');
    } finally {
      setIsInitializing(false);
    }
  };

  const connectSnapTrade = async () => {
    try {
      // Check if other financial services are active
      if (financialServiceCoordinator.hasActiveServices()) {
        const activeServices = financialServiceCoordinator.getActiveServices();
        console.log('Other financial services are active, cannot start SnapTrade:', activeServices);
        setStatus('error');
        return;
      }

      // Register this service as active
      financialServiceCoordinator.registerService(SERVICE_NAMES.SNAPTRADE);
      setIsInitializing(true);

      const token = localStorage.getItem('auth_token');
      if (!token) {
        setStatus('not_authenticated');
        financialServiceCoordinator.unregisterService(SERVICE_NAMES.SNAPTRADE);
        return;
      }

      const response = await fetch(`${API_URL}/snaptrade/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        console.log('SnapTrade login redirect:', data);

        // Use the modal approach instead of opening in new tab
        if (data.data?.redirectURI) {
          setRedirectLink(data.data.redirectURI);
          setIsModalOpen(true);
        }
      } else {
        const errorData = await response.json();
        console.error('SnapTrade login failed:', errorData);
        setStatus('error');
      }
    } catch (error) {
      console.error('Error connecting SnapTrade:', error);
      setStatus('error');
      financialServiceCoordinator.unregisterService(SERVICE_NAMES.SNAPTRADE);
    } finally {
      setIsInitializing(false);
    }
  };

  const disconnectSnapTrade = async () => {
    try {
      setIsInitializing(true);

      const token = localStorage.getItem('auth_token');
      if (!token) {
        setStatus('not_authenticated');
        return;
      }

      const response = await fetch(`${API_URL}/snaptrade/delete`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        console.log('SnapTrade disconnected successfully');
        await checkSnapTradeStatus(); // Refresh status
      } else {
        const errorData = await response.json();
        console.error('SnapTrade disconnect failed:', errorData);
        setStatus('error');
      }
    } catch (error) {
      console.error('Error disconnecting SnapTrade:', error);
      setStatus('error');
    } finally {
      setIsInitializing(false);
    }
  };

  const getButtonText = () => {
    switch (status) {
      case 'loading':
        return 'Loading...';
      case 'not_authenticated':
        return 'Please log in';
      case 'not_initialized':
        return isInitializing ? 'Initializing...' : 'Setting up SnapTrade...';
      case 'registered':
        return isInitializing ? 'Connecting...' : 'Connect Account';
      case 'connected':
        return 'SnapTrade Active';
      case 'disconnected':
        return 'Reconnect SnapTrade';
      case 'error':
        return 'Error - Try Again';
      default:
        return 'Connect SnapTrade';
    }
  };

  const getButtonColor = () => {
    switch (status) {
      case 'registered':
      case 'connected':
        return 'bg-green-600 hover:bg-green-700 text-white';
      case 'error':
        return 'bg-red-600 hover:bg-red-700 text-white';
      case 'loading':
      case 'not_initialized':
        return 'bg-gray-600 cursor-not-allowed text-gray-300';
      default:
        return 'bg-blue-600 hover:bg-blue-700 text-white';
    }
  };

  const isButtonDisabled = () => {
    return status === 'loading' || isInitializing || status === 'not_authenticated' || status === 'not_initialized';
  };

  const handleClick = () => {
    if (status === 'error') {
      initializeSnapTrade();
    } else if (status === 'registered') {
      connectSnapTrade();
    } else if (status === 'disconnected') {
      initializeSnapTrade();
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center space-x-4">
          <button
            onClick={handleClick}
            disabled={isButtonDisabled()}
            className={`px-4 py-2 font-medium rounded-lg transition-colors ${getButtonColor()} ${
              isButtonDisabled() ? 'cursor-not-allowed' : 'cursor-pointer'
            }`}
          >
            {getButtonText()}
          </button>

          {status === 'loading' && (
            <div className="text-sm text-gray-400 bg-gray-800 border border-gray-600 rounded-lg p-3">
              <div className="flex items-center space-x-2">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-400"></div>
                <span>Checking SnapTrade status...</span>
              </div>
            </div>
          )}
      </div>



      {connectedAccounts.length > 0 && (
        <div className="mt-4">
          <div className="space-y-3">
            {connectedAccounts.map((account) => {
              // Determine if SnapTrade connection is healthy
              const isHealthy = snapTradeTokenStatus?.connected &&
                               (snapTradeTokenStatus?.status === 'VALID' ||
                                snapTradeTokenStatus?.status === 'valid');

              return (
                <div key={account.id} className="bg-gray-700 border border-gray-600 rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <div className="font-semibold text-white text-base">{account.name}</div>
                        {/* Status Indicator based on SnapTrade connection health */}
                        {isHealthy ? (
                          <span className="text-green-400" title="Connection active">
                            ✓
                          </span>
                        ) : (
                          <span className="text-red-400" title={`Connection issue: ${snapTradeTokenStatus?.error || 'Unknown error'}`}>
                            ✗
                          </span>
                        )}
                      </div>
                      <div className="text-gray-400 text-sm">
                        {account.institution && `${account.institution} • `}{account.type}
                        {account.subtype && ` • ${account.subtype}`}
                      </div>
                      {/* Show error message if connection is unhealthy */}
                      {!isHealthy && snapTradeTokenStatus?.error && (
                        <div className="text-xs text-red-400 mt-1">
                          {snapTradeTokenStatus.error}
                        </div>
                      )}
                    </div>
                    {account.balance && (
                      <div className="text-right">
                        <div className="font-semibold text-white text-base">
                          ${account.balance.toLocaleString()}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {status === 'error' && (
        <div className="text-sm text-red-400 bg-gray-800 border border-red-500/30 rounded-lg p-3">
          <div className="font-medium text-red-300 mb-1">Connection Error</div>
          <div className="text-gray-400">There was an error connecting to SnapTrade. Please try again.</div>
        </div>
      )}

      {/* SnapTrade Connection Modal */}
      {redirectLink && (
        <div data-snaptrade-modal="true">
          <SnapTradeReact
            loginLink={redirectLink}
            isOpen={isModalOpen}
                      close={() => {
            financialServiceCoordinator.unregisterService(SERVICE_NAMES.SNAPTRADE);
            setIsModalOpen(false);
            setRedirectLink(null);
          }}
          onSuccess={(data) => {
            console.log('SnapTrade connection successful:', data);
            financialServiceCoordinator.unregisterService(SERVICE_NAMES.SNAPTRADE);
            setIsModalOpen(false);
            setRedirectLink(null);
            // Refresh connected accounts
            checkConnectedAccounts();
          }}
          onError={(error) => {
            console.error('SnapTrade connection error:', error);
            financialServiceCoordinator.unregisterService(SERVICE_NAMES.SNAPTRADE);
            setStatus('error');
            setIsModalOpen(false);
            setRedirectLink(null);
          }}
          onExit={() => {
            console.log('User exited SnapTrade connection');
            financialServiceCoordinator.unregisterService(SERVICE_NAMES.SNAPTRADE);
            setIsModalOpen(false);
            setRedirectLink(null);
          }}
            contentLabel="Connect Account via SnapTrade"
          />
        </div>
      )}
    </div>
  );
}
