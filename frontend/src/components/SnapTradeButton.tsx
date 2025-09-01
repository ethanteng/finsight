"use client";

import React, { useState, useEffect } from 'react';

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

export default function SnapTradeButton() {
  const [status, setStatus] = useState<string>('loading');
  const [snapTradeStatus, setSnapTradeStatus] = useState<SnapTradeStatus | null>(null);
  const [connectedAccounts, setConnectedAccounts] = useState<SnapTradeAccount[]>([]);
  const [isInitializing, setIsInitializing] = useState(false);

  const API_URL = process.env.NEXT_PUBLIC_API_URL;

  useEffect(() => {
    checkSnapTradeStatus();
  }, []);

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
      setIsInitializing(true);
      
      const token = localStorage.getItem('auth_token');
      if (!token) {
        setStatus('not_authenticated');
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
        
        // Redirect user to SnapTrade
        if (data.data?.redirectURI) {
          window.open(data.data.redirectURI, '_blank');
          // Wait a bit then check for new accounts
          setTimeout(() => {
            checkConnectedAccounts();
          }, 2000);
        }
      } else {
        const errorData = await response.json();
        console.error('SnapTrade login failed:', errorData);
        setStatus('error');
      }
    } catch (error) {
      console.error('Error connecting SnapTrade:', error);
      setStatus('error');
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
        return isInitializing ? 'Initializing...' : 'Initialize SnapTrade';
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
        return 'bg-gray-600 cursor-not-allowed text-gray-300';
      default:
        return 'bg-blue-600 hover:bg-blue-700 text-white';
    }
  };

  const isButtonDisabled = () => {
    return status === 'loading' || isInitializing || status === 'not_authenticated';
  };

  const handleClick = () => {
    if (status === 'not_initialized' || status === 'error') {
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
        
        {(status === 'registered' || status === 'connected') && (
                      <button
              onClick={disconnectSnapTrade}
              disabled={isInitializing}
              className="px-4 py-2 text-red-400 border border-red-500 hover:bg-red-600 hover:text-white font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
            Disconnect
          </button>
        )}
        
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
            {connectedAccounts.map((account) => (
              <div key={account.id} className="bg-gray-700 border border-gray-600 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="font-semibold text-white text-base mb-1">{account.name}</div>
                    <div className="text-gray-400 text-sm">
                      {account.institution} • {account.type}
                      {account.subtype && ` • ${account.subtype}`}
                    </div>
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
            ))}
          </div>
        </div>
      )}

      {status === 'error' && (
        <div className="text-sm text-red-400 bg-gray-800 border border-red-500/30 rounded-lg p-3">
          <div className="font-medium text-red-300 mb-1">Connection Error</div>
          <div className="text-gray-400">There was an error connecting to SnapTrade. Please try again.</div>
        </div>
      )}
    </div>
  );
}
