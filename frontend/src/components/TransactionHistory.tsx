'use client';

import React, { useState, useEffect, useCallback, useMemo, forwardRef, useImperativeHandle } from 'react';

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

export default forwardRef<{ refresh: () => void }, TransactionHistoryProps>(function TransactionHistory({ isDemo = false }, ref) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [dateRange, setDateRange] = useState('90');

  const API_URL = process.env.NEXT_PUBLIC_API_URL;

  const loadTransactions = useCallback(async () => {
    setLoading(true);
    setError('');
    
    // Clear any existing transactions to prevent demo/real data mixing
    setTransactions([]);
    
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

      console.log('🔍 Frontend: Fetching transactions from', startDate, 'to', endDate);
      console.log('🔍 Frontend: Demo mode:', isDemo);

      // Use the existing transactions endpoint which already includes enriched data
      const res = await fetch(`${API_URL}/plaid/transactions?start_date=${startDate}&end_date=${endDate}&count=50&_t=${Date.now()}`, {
        method: 'GET',
        headers,
      });

      if (res.ok) {
        const data = await res.json();
        console.log('🔍 Frontend: Received transactions data:', data);
        console.log('🔍 Frontend: Has enriched data?', data.transactions?.[0]?.enriched_data ? 'YES' : 'NO');
        console.log('🔍 Frontend: Enriched fields:', data.transactions?.[0]?.enriched_data ? Object.keys(data.transactions[0].enriched_data) : 'NONE');
        console.log('🔍 Frontend: Top-level merchant_name:', data.transactions?.[0]?.merchant_name);
        console.log('🔍 Frontend: Enriched merchant_name:', data.transactions?.[0]?.enriched_data?.merchant_name);
        
        // Debug: Show the exact enriched_data structure
        if (data.transactions?.[0]?.enriched_data) {
          console.log('🔍 Frontend: Full enriched_data object:', JSON.stringify(data.transactions[0].enriched_data, null, 2));
        }
        
        // Debug: Check for merchant name inconsistencies
        if (data.transactions?.[0]) {
          const firstTransaction = data.transactions[0];
          console.log('🔍 Frontend: Merchant name debug:', {
            originalName: firstTransaction.name,
            merchantName: firstTransaction.merchant_name,
            enrichedMerchantName: firstTransaction.enriched_data?.merchant_name,
            allNames: [
              firstTransaction.name,
              firstTransaction.merchant_name,
              firstTransaction.enriched_data?.merchant_name
            ].filter(Boolean)
          });
        }
        
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

  // Expose refresh method to parent component
  useImperativeHandle(ref, () => ({
    refresh: loadTransactions
  }), [loadTransactions]);

  useEffect(() => {
    loadTransactions();
  }, [loadTransactions]);

  // Debug: Log when transactions state changes
  useEffect(() => {
    console.log('🔍 Frontend: Transactions state updated:', {
      count: transactions.length,
      firstTransaction: transactions[0],
      hasEnrichedData: transactions[0]?.enriched_data ? 'YES' : 'NO',
      enrichedFields: transactions[0]?.enriched_data ? Object.keys(transactions[0].enriched_data) : 'NONE'
    });
  }, [transactions]);

  // Filter transactions based on date range and always show pending
  const filteredTransactions = useMemo(() => {
    const daysAgo = new Date();
    daysAgo.setDate(daysAgo.getDate() - parseInt(dateRange));
    
    return transactions.filter(transaction => {
      const transactionDate = new Date(transaction.date);
      return transactionDate >= daysAgo;
    });
  }, [transactions, dateRange]);

  return (
    <div className="bg-gray-800 rounded-lg p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold text-white">Transaction History</h2>
        
        {/* Controls */}
        <div className="flex items-center space-x-4">
          <select
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value)}
            className="bg-gray-700 text-white px-3 py-1 rounded text-sm border border-gray-600 focus:border-blue-500 focus:outline-none"
          >
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
            <option value="90">Last 90 days</option>
            <option value="365">Last year</option>
          </select>
          
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



      {transactions.length === 0 && !loading ? (
        <div className="text-center text-gray-400 py-8">
          No transactions found for the selected date range.
        </div>
      ) : (
        <div className="space-y-3 max-h-96 overflow-y-auto">
          {filteredTransactions.map((transaction) => {
            const hasEnrichedData = transaction.enriched_data && Object.keys(transaction.enriched_data).length > 0;
            return (
            <div 
              key={transaction.id} 
              className={`bg-gray-700 rounded-lg p-4 border-l-4 ${
                transaction.amount < 0 ? 'border-red-500' : 'border-green-500'
              } ${hasEnrichedData ? 'ring-1 ring-blue-400/30' : ''}`}
            >
              {/* Enriched data indicator */}
              {hasEnrichedData && (
                <div className="flex items-center gap-1 mb-2">
                  <div className="w-2 h-2 bg-blue-400 rounded-full"></div>
                  <span className="text-xs text-blue-400 font-medium">Enhanced Data Available</span>
                </div>
              )}
              
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  {/* Header row with merchant name and logo */}
                  <div className="flex items-center gap-3 mb-2">
                    {/* Merchant logo */}
                    {transaction.enriched_data?.logo_url && (
                      <img 
                        src={transaction.enriched_data.logo_url} 
                        alt={`${transaction.enriched_data?.merchant_name || transaction.name} logo`}
                        className="w-8 h-8 rounded object-contain bg-white p-1 flex-shrink-0"
                        onError={(e) => {
                          // Hide broken images
                          e.currentTarget.style.display = 'none';
                        }}
                      />
                    )}
                    
                    {/* Merchant name */}
                    <div className="font-medium text-white truncate">
                      {transaction.enriched_data?.merchant_name || 
                       transaction.merchant_name || 
                       transaction.name}
                    </div>
                  </div>
                  
                  {/* Date and categories row */}
                  <div className="mb-3">
                    {/* Date */}
                    <div className="text-sm text-gray-400 mb-2">
                      {new Date(transaction.date).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric'
                      })}
                    </div>
                    
                    {/* Categories section */}
                    <div className="space-y-2">
                      {/* Show meaningful categories if available */}
                      {transaction.enriched_data?.category && 
                       Array.isArray(transaction.enriched_data.category) && 
                       transaction.enriched_data.category.length > 0 && 
                       transaction.enriched_data.category.some(cat => cat && cat.trim() !== '' && cat !== '0') ? (
                        <div>
                          <span className="text-blue-400 font-medium text-xs">Enhanced Categories:</span>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {transaction.enriched_data.category
                              .filter(cat => cat && cat.trim() !== '' && cat !== '0')
                              .map((cat, index) => (
                                <span 
                                  key={index}
                                  className="inline-block px-2 py-1 bg-blue-900/30 text-blue-300 text-xs rounded border border-blue-700/50"
                                >
                                  {cat.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, l => l.toUpperCase())}
                                </span>
                              ))}
                          </div>
                        </div>
                      ) : null}
                      
                      {/* Show basic Plaid categories if available */}
                      {transaction.category && 
                       Array.isArray(transaction.category) && 
                       transaction.category.length > 0 && 
                       transaction.category.some(cat => cat && cat.trim() !== '' && cat !== '0') ? (
                        <div>
                          <span className="text-gray-400 font-medium text-xs">Basic Categories:</span>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {transaction.category
                              .filter(cat => cat && cat.trim() !== '' && cat !== '0')
                              .map((cat, index) => (
                                <span 
                                  key={index}
                                  className="inline-block px-2 py-1 bg-gray-600/30 text-gray-300 text-xs rounded border border-gray-500/50"
                                >
                                  {cat.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, l => l.toUpperCase())}
                                </span>
                              ))}
                          </div>
                        </div>
                      ) : null}
                      
                      {/* Show message when no categories are available */}
                      {(!transaction.enriched_data?.category || transaction.enriched_data.category.length === 0) && 
                       (!transaction.category || transaction.category.length === 0) && (
                        <div className="text-xs text-gray-500 italic">
                          No category information available
                        </div>
                      )}
                    </div>
                  </div>
                  
                  {/* Enriched metadata row */}
                  <div className="space-y-1">
                    {/* Website link */}
                    {transaction.enriched_data?.website && (
                      <div className="flex items-center text-xs text-gray-500">
                        <svg className="w-3 h-3 mr-1 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M4.083 9h1.946c.089-1.546.383-2.97.837-4.118A6.004 6.004 0 004.083 9zM10 2a8 8 0 100 16 8 8 0 000-16zm0 2c-.076 0-.232.032-.465.262-.238.234-.497.623-.737 1.182-.389.907-.673 2.142-.766 3.556h3.936c-.093-1.414-.377-2.649-.766-3.556-.24-.56-.5-.948-.737-1.182C10.232 4.032 10.076 4 10 4zM3.552 12.049c.233.39.574.689.944.951.562.392 1.313.956 2.165 1.603C7.825 15.449 8.948 16 10 16c1.053 0 2.172-.551 3.338 1.397-.853.647 1.603 1.211 2.165 1.603.37-.263-.711.561-.944-.951.416-.693.676-1.456.676-2.049s-.26-1.356-.676-2.049c-.233-.39-.574-.689-.944-.951-.562-.392-1.313-.956-2.165-1.603C12.175 4.551 11.053 4 10 4c-1.053 0-2.172.551-3.338 1.397-.853.647-1.603 1.211-2.165 1.603-.37.263-.711.561-.944.951C4.26 8.644 4 9.407 4 10s.26 1.356.676 2.049z" clipRule="evenodd" />
                        </svg>
                        <a 
                          href={transaction.enriched_data.website.startsWith('http') ? transaction.enriched_data.website : `https://${transaction.enriched_data.website}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-400 hover:text-blue-300 underline"
                        >
                          {transaction.enriched_data.website}
                        </a>
                      </div>
                    )}
                    
                    {/* Additional enriched metadata */}
                    {(transaction.enriched_data?.domain || transaction.enriched_data?.brand_name) && (
                      <div className="text-xs text-gray-500">
                        {transaction.enriched_data?.domain && (
                          <span className="mr-3">🌐 {transaction.enriched_data.domain}</span>
                        )}
                        {transaction.enriched_data?.brand_name && (
                          <span>🏷️ {transaction.enriched_data.brand_name}</span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                
                <div className="text-right ml-4 flex-shrink-0">
                  <div className={`font-semibold text-lg ${
                    transaction.amount < 0 ? 'text-red-400' : 'text-green-400'
                  }`}>
                    {transaction.amount < 0 ? '' : '+'}${Math.abs(transaction.amount).toFixed(2)}
                  </div>
                  {transaction.pending && (
                    <div className="text-xs text-yellow-400 mt-1">Pending</div>
                  )}
                </div>
              </div>
            </div>
          )})}
        </div>
      )}
      
      {transactions.length > 0 && (
        <div className="text-center text-gray-400 mt-4">
          Showing {filteredTransactions.length} of {transactions.length} transactions
        </div>
      )}
    </div>
  );
}) 