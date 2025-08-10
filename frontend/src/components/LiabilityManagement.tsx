'use client';

import React, { useState, useEffect, useCallback } from 'react';

interface LiabilityAccount {
  account_id: string;
  name: string;
  type: string;
  subtype: string;
  balances: {
    current: number;
    available: number;
    limit?: number;
    iso_currency_code: string;
  };
  verification_status?: string;
  last_updated_datetime?: string;
}

interface LiabilityData {
  accounts: LiabilityAccount[];
  item: any;
  request_id: string;
}

interface LiabilityManagementProps {
  isDemo?: boolean;
}

export default function LiabilityManagement({ isDemo = false }: LiabilityManagementProps) {
  const [liabilityData, setLiabilityData] = useState<LiabilityData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const API_URL = process.env.NEXT_PUBLIC_API_URL;

  const loadLiabilityData = useCallback(async () => {
    setLoading(true);
    setError('');
    
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      if (isDemo) {
        headers['x-demo-mode'] = 'true';
      } else {
        const token = localStorage.getItem('auth_token');
        if (token) {
          headers['Authorization'] = `Bearer ${token}`;
        }
      }

      const res = await fetch(`${API_URL}/plaid/liabilities`, {
        method: 'GET',
        headers,
      });

      if (res.ok) {
        const data = await res.json();
        console.log('Received liability data:', data);
        setLiabilityData(data.liabilities || []);
      } else {
        if (res.status === 401) {
          setError('Authentication required. Please log in.');
        } else {
          setError('Failed to load liability data');
        }
      }
    } catch (err) {
      console.error('Error loading liability data:', err);
      setError('Error loading liability data');
    } finally {
      setLoading(false);
    }
  }, [isDemo, API_URL]);

  useEffect(() => {
    loadLiabilityData();
  }, [loadLiabilityData]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const getAccountTypeIcon = (type: string, subtype: string) => {
    const typeLower = type.toLowerCase();
    const subtypeLower = subtype.toLowerCase();
    
    if (typeLower.includes('credit') || subtypeLower.includes('credit')) return '💳';
    if (typeLower.includes('loan') || subtypeLower.includes('loan')) return '🏦';
    if (typeLower.includes('mortgage') || subtypeLower.includes('mortgage')) return '🏠';
    if (typeLower.includes('student') || subtypeLower.includes('student')) return '🎓';
    if (typeLower.includes('auto') || subtypeLower.includes('auto')) return '🚗';
    return '💰';
  };

  const getTotalLiabilities = () => {
    return liabilityData.reduce((total, data) => {
      return total + data.accounts.reduce((accountTotal, account) => {
        return accountTotal + (account.balances.current || 0);
      }, 0);
    }, 0);
  };

  const getTotalCreditLimit = () => {
    return liabilityData.reduce((total, data) => {
      return total + data.accounts.reduce((accountTotal, account) => {
        return accountTotal + (account.balances.limit || 0);
      }, 0);
    }, 0);
  };

  const getTotalAccounts = () => {
    return liabilityData.reduce((total, data) => total + data.accounts.length, 0);
  };

  if (error) {
    return (
      <div className="bg-gray-800 rounded-lg p-6">
        <div className="text-red-400 text-center py-4">{error}</div>
        <button
          onClick={loadLiabilityData}
          className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded text-sm transition-colors mx-auto block"
        >
          Retry
        </button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="bg-gray-800 rounded-lg p-6">
        <div className="text-gray-400 text-center py-4">Loading liability information...</div>
      </div>
    );
  }

  if (liabilityData.length === 0 || liabilityData.every(data => data.accounts.length === 0)) {
    return (
      <div className="bg-gray-800 rounded-lg p-6">
        <div className="text-gray-400 text-center py-4">
          No liability accounts found. Connect your credit and loan accounts to see your debt information.
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gray-800 rounded-lg p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold text-white">Liability Management</h2>
        <button
          onClick={loadLiabilityData}
          disabled={loading}
          className={`px-3 py-1 rounded text-sm transition-colors ${
            loading 
              ? 'bg-gray-500 cursor-not-allowed' 
              : 'bg-blue-600 hover:bg-blue-700'
          }`}
        >
          {loading ? 'Loading...' : 'Refresh'}
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-gray-700 rounded-lg p-4">
          <div className="text-sm text-gray-400">Total Liabilities</div>
          <div className="text-2xl font-bold text-red-400">{formatCurrency(getTotalLiabilities())}</div>
        </div>
        <div className="bg-gray-700 rounded-lg p-4">
          <div className="text-sm text-gray-400">Total Credit Limit</div>
          <div className="text-2xl font-bold text-green-400">{formatCurrency(getTotalCreditLimit())}</div>
        </div>
        <div className="bg-gray-700 rounded-lg p-4">
          <div className="text-sm text-gray-400">Total Accounts</div>
          <div className="text-2xl font-bold text-white">{getTotalAccounts()}</div>
        </div>
      </div>

      {/* Liability Accounts */}
      <div className="space-y-4">
        <h3 className="text-lg font-medium text-white mb-4">Liability Accounts</h3>
        {liabilityData.map((data) => 
          data.accounts.map((account) => (
            <div key={account.account_id} className="bg-gray-700 rounded-lg p-4 border border-gray-600">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3 flex-1">
                  <div className="text-2xl">
                    {getAccountTypeIcon(account.type, account.subtype)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-white truncate">
                      {account.name}
                    </div>
                    <div className="text-sm text-gray-400">
                      {account.type} • {account.subtype}
                    </div>
                    {account.verification_status && (
                      <div className="text-xs text-gray-500">
                        Status: {account.verification_status}
                      </div>
                    )}
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-semibold text-red-400">
                    {formatCurrency(account.balances.current)}
                  </div>
                  {account.balances.limit && (
                    <div className="text-sm text-gray-400">
                      Limit: {formatCurrency(account.balances.limit)}
                    </div>
                  )}
                  {account.balances.available !== undefined && (
                    <div className="text-sm text-green-400">
                      Available: {formatCurrency(account.balances.available)}
                    </div>
                  )}
                  {account.last_updated_datetime && (
                    <div className="text-xs text-gray-500">
                      Updated: {formatDate(account.last_updated_datetime)}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
