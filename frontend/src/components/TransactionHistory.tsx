'use client';

import React, { useState, useEffect, useCallback } from 'react';

interface Transaction {
  id: string;
  account_id: string;
  amount: number;
  date: string;
  name: string;
  merchant_name?: string;
  category?: string[];
  category_id?: string;
  pending: boolean;
  payment_channel?: string;
  location?: {
    address?: string;
    city?: string;
    state?: string;
    zip?: string;
    country?: string;
  };
  // Enhanced transaction data
  enriched_data?: {
    merchant_name?: string;
    website?: string;
    logo_url?: string;
    primary_color?: string;
    domain?: string;
    category?: string[];
    category_id?: string;
    brand_logo_url?: string;
    brand_name?: string;
  };
}

interface TransactionHistoryProps {
  isDemo?: boolean;
}

export default function TransactionHistory({ isDemo = false }: TransactionHistoryProps) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dateRange, setDateRange] = useState('30'); // days
  const [showPending, setShowPending] = useState(true);

  const API_URL = process.env.NEXT_PUBLIC_API_URL;

  const loadTransactions = useCallback(async () => {
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

      // Calculate date range
      const endDate = new Date().toISOString().split('T')[0];
      const startDate = new Date(Date.now() - parseInt(dateRange) * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      // Use the existing transactions endpoint which already includes enriched data
      const res = await fetch(`${API_URL}/plaid/transactions?start_date=${startDate}&end_date=${endDate}&count=50`, {
        method: 'GET',
        headers,
      });

      if (res.ok) {
        const data = await res.json();
        console.log('Received transactions data:', data);
        setTransactions(data.transactions || []);
      } else {
        if (res.status === 401) {
          setError('Authentication required. Please log in.');
        } else {
          setError('Failed to load transactions');
        }
      }
    } catch (err) {
      console.error('Error loading transactions:', err);
      setError('Error loading transactions');
    } finally {
      setLoading(false);
    }
  }, [dateRange, isDemo, API_URL]);

  useEffect(() => {
    loadTransactions();
  }, [loadTransactions]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(Math.abs(amount));
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const getCategoryIcon = (category: string[]) => {
    if (!category || category.length === 0) return '💰';
    
    const firstCategory = category[0].toLowerCase();
    
    if (firstCategory.includes('food') || firstCategory.includes('restaurant')) return '🍽️';
    if (firstCategory.includes('transport') || firstCategory.includes('travel')) return '🚗';
    if (firstCategory.includes('shopping') || firstCategory.includes('store')) return '🛍️';
    if (firstCategory.includes('entertainment')) return '🎬';
    if (firstCategory.includes('health') || firstCategory.includes('medical')) return '🏥';
    if (firstCategory.includes('education')) return '📚';
    if (firstCategory.includes('home') || firstCategory.includes('housing')) return '🏠';
    if (firstCategory.includes('utilities')) return '⚡';
    if (firstCategory.includes('income') || firstCategory.includes('salary')) return '💵';
    
    return '💰';
  };

  const filteredTransactions = transactions.filter(transaction => 
    showPending || !transaction.pending
  );

  return (
    <div className="bg-gray-800 rounded-lg p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold text-white">Transaction History</h2>
        
        {/* Controls */}
        <div className="flex items-center space-x-4">
          <select
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value)}
            className="bg-gray-700 text-white px-3 py-1 rounded text-sm border border-gray-600"
          >
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
            <option value="90">Last 90 days</option>
          </select>
          
          <label className="flex items-center space-x-2 text-sm text-gray-300">
            <input
              type="checkbox"
              checked={showPending}
              onChange={(e) => setShowPending(e.target.checked)}
              className="rounded border-gray-600 bg-gray-700"
            />
            <span>Show pending</span>
          </label>
          
          <button
            onClick={loadTransactions}
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
      </div>

      {error ? (
        <div className="text-red-400 text-center py-4">{error}</div>
      ) : loading ? (
        <div className="text-gray-400 text-center py-4">Loading transactions...</div>
      ) : filteredTransactions.length === 0 ? (
        <div className="text-gray-400 text-center py-4">
          No transactions found for the selected time period.
        </div>
      ) : (
        <div className="space-y-3 max-h-96 overflow-y-auto">
          {filteredTransactions.map((transaction) => (
            <div 
              key={transaction.id} 
              className={`bg-gray-700 rounded-lg p-4 border-l-4 ${
                transaction.pending 
                  ? 'border-yellow-500 bg-gray-700/50' 
                  : // Fix: Invert the transaction amount sign to match expected behavior
                  -(transaction.amount || 0) > 0 
                    ? 'border-green-500' 
                    : 'border-red-500'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3 flex-1">
                  <div className="text-2xl">
                    {getCategoryIcon(transaction.category || [])}
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-white truncate">
                      {transaction.enriched_data?.merchant_name || transaction.merchant_name || transaction.name}
                    </div>
                    <div className="text-sm text-gray-400">
                      {formatDate(transaction.date)}
                      {transaction.pending && (
                        <span className="ml-2 text-yellow-400">• Pending</span>
                      )}
                      {/* Show enriched category data if available, fallback to basic category */}
                      {transaction.enriched_data?.category && transaction.enriched_data.category.length > 0 ? (
                        <span className="ml-2">• {transaction.enriched_data.category.join(', ')}</span>
                      ) : transaction.category && transaction.category.length > 0 ? (
                        <span className="ml-2">• {transaction.category.join(', ')}</span>
                      ) : null}
                    </div>
                    {transaction.location?.city && (
                      <div className="text-xs text-gray-500">
                        📍 {transaction.location.city}, {transaction.location.state}
                      </div>
                    )}
                    {/* Show enhanced merchant information if available */}
                    {transaction.enriched_data?.website && (
                      <div className="text-xs text-blue-400">
                        🌐 {transaction.enriched_data.website}
                      </div>
                    )}
                    {transaction.enriched_data?.brand_name && (
                      <div className="text-xs text-gray-400">
                        🏷️ {transaction.enriched_data.brand_name}
                      </div>
                    )}
                    {/* Show merchant logo if available */}
                    {transaction.enriched_data?.logo_url && (
                      <div className="mt-2 flex items-center space-x-2">
                        <img 
                          src={transaction.enriched_data.logo_url} 
                          alt={`${transaction.enriched_data.merchant_name || transaction.name} logo`}
                          className="w-4 h-4 rounded"
                          onError={(e) => {
                            e.currentTarget.style.display = 'none';
                          }}
                        />
                        <span className="text-xs text-gray-500">
                          Verified merchant
                        </span>
                      </div>
                    )}
                  </div>
                </div>
                
                <div className="text-right">
                  <div className={`font-semibold ${
                    // Fix: Invert the transaction amount sign to match expected behavior
                    // Positive amounts should be negative (money leaving account) and vice versa
                    -(transaction.amount || 0) > 0 ? 'text-green-400' : 'text-red-400'
                  }`}>
                    {/* Fix: Invert the transaction amount sign */}
                    {-(transaction.amount || 0) > 0 ? '+' : '-'}{formatCurrency(transaction.amount)}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      
      {filteredTransactions.length > 0 && (
        <div className="mt-4 text-sm text-gray-400 text-center">
          Showing {filteredTransactions.length} of {transactions.length} transactions
        </div>
      )}
    </div>
  );
} 