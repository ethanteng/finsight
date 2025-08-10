'use client';

import React, { useState, useEffect, useCallback } from 'react';

interface EnrichedTransaction {
  transaction_id: string;
  merchant_name?: string;
  website?: string;
  logo_url?: string;
  category?: string;
  amount: number;
  date: string;
  name: string;
  account_id: string;
}

interface TransactionEnrichment {
  enriched_transactions: EnrichedTransaction[];
  request_id: string;
}

interface EnhancedTransactionsProps {
  isDemo?: boolean;
  tier?: string;
}

export default function EnhancedTransactions({ isDemo = false, tier = 'standard' }: EnhancedTransactionsProps) {
  const [enrichments, setEnrichments] = useState<TransactionEnrichment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedTransactions, setSelectedTransactions] = useState<string[]>([]);

  const API_URL = process.env.NEXT_PUBLIC_API_URL;

  const loadEnrichments = useCallback(async () => {
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

      // For demo purposes, we'll show sample enriched data
      if (isDemo) {
        const demoEnrichments: TransactionEnrichment[] = [
          {
            enriched_transactions: [
              {
                transaction_id: 'demo_1',
                merchant_name: 'Starbucks',
                website: 'starbucks.com',
                logo_url: 'https://logo.clearbit.com/starbucks.com',
                category: 'Food & Drink',
                amount: -5.75,
                date: '2024-01-15',
                name: 'STARBUCKS STORE #12345',
                account_id: 'demo_account'
              },
              {
                transaction_id: 'demo_2',
                merchant_name: 'Amazon',
                website: 'amazon.com',
                logo_url: 'https://logo.clearbit.com/amazon.com',
                category: 'Shopping',
                amount: -89.99,
                date: '2024-01-14',
                name: 'AMZN Mktp US*1234567890',
                account_id: 'demo_account'
              }
            ],
            request_id: 'demo_request'
          }
        ];
        setEnrichments(demoEnrichments);
        setLoading(false);
        return;
      }

      // In production, call the real enhanced transaction endpoint
      const endDate = new Date().toISOString().split('T')[0];
      const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      // Use the existing transactions endpoint which already includes enriched data
      const res = await fetch(`${API_URL}/plaid/transactions?start_date=${startDate}&end_date=${endDate}&count=50`, {
        method: 'GET',
        headers,
      });

      if (res.ok) {
        const data = await res.json();
        console.log('Received enhanced transaction data:', data);
        
        // Transform the data to match our interface
        // The existing endpoint returns transactions with enriched_data already included
        const transformedEnrichments: TransactionEnrichment[] = [{
          enriched_transactions: data.transactions || [],
          request_id: data.request_id || 'real_request'
        }];
        
        setEnrichments(transformedEnrichments);
      } else {
        console.log('Failed to load enhanced transactions:', res.status);
        setError('Failed to load enhanced transactions');
      }
      
      setLoading(false);
    } catch (err) {
      console.error('Error loading transaction enrichments:', err);
      setError('Error loading transaction enrichments');
      setLoading(false);
    }
  }, [isDemo, API_URL]);

  useEffect(() => {
    loadEnrichments();
  }, [loadEnrichments]);

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

  const getTransactionIcon = (category: string) => {
    const categoryLower = category.toLowerCase();
    if (categoryLower.includes('food') || categoryLower.includes('drink')) return '🍽️';
    if (categoryLower.includes('shopping')) return '🛍️';
    if (categoryLower.includes('transport')) return '🚗';
    if (categoryLower.includes('entertainment')) return '🎬';
    if (categoryLower.includes('health')) return '🏥';
    if (categoryLower.includes('travel')) return '✈️';
    return '💰';
  };

  if (error) {
    return (
      <div className="bg-gray-800 rounded-lg p-6">
        <div className="text-red-400 text-center py-4">{error}</div>
        <button
          onClick={loadEnrichments}
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
        <div className="text-gray-400 text-center py-4">Loading enhanced transactions...</div>
      </div>
    );
  }

  // Check if user has access to this feature
  if (tier === 'starter' && !isDemo) {
    return (
      <div className="bg-gray-800 rounded-lg p-6">
        <div className="text-center py-8">
          <div className="text-2xl mb-4">🔒</div>
          <h3 className="text-lg font-semibold text-white mb-2">Standard+ Feature</h3>
          <p className="text-gray-400 mb-4">
            Upgrade to Standard or Premium for enhanced transaction insights
          </p>
          <p className="text-sm text-gray-500">
            Get detailed merchant information, website links, and enhanced transaction analysis
          </p>
        </div>
      </div>
    );
  }

  if (enrichments.length === 0 && !isDemo) {
    return (
      <div className="bg-gray-800 rounded-lg p-6">
        <div className="text-center py-8">
          <div className="text-2xl mb-4">📊</div>
          <h3 className="text-lg font-semibold text-white mb-2">Enhanced Transactions</h3>
          <p className="text-gray-400 mb-4">
            No enriched transaction data available
          </p>
          <p className="text-sm text-gray-500">
            This feature provides merchant details, website links, and enhanced categorization
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gray-800 rounded-lg p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold text-white">Enhanced Transactions</h2>
        <button
          onClick={loadEnrichments}
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

      <div className="space-y-4 max-h-96 overflow-y-auto">
        {enrichments.map((enrichment) => 
          enrichment.enriched_transactions.map((transaction) => (
            <div key={transaction.transaction_id} className="bg-gray-700 rounded-lg p-4 border border-gray-600">
              <div className="flex items-start justify-between">
                <div className="flex items-start space-x-3 flex-1">
                  <div className="text-2xl">
                    {getTransactionIcon(transaction.category || 'Unknown')}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-white truncate">
                      {transaction.merchant_name || transaction.name}
                    </div>
                    <div className="text-sm text-gray-400">
                      {transaction.category} • {formatDate(transaction.date)}
                    </div>
                    {transaction.website && (
                      <div className="text-sm text-blue-400 hover:text-blue-300 cursor-pointer">
                        🌐 {transaction.website}
                      </div>
                    )}
                    <div className="text-xs text-gray-500 mt-1">
                      Transaction ID: {transaction.transaction_id}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className={`text-lg font-semibold ${
                    transaction.amount < 0 ? 'text-red-400' : 'text-green-400'
                  }`}>
                    {transaction.amount < 0 ? '-' : '+'}{formatCurrency(transaction.amount)}
                  </div>
                  <div className="text-sm text-gray-400">
                    {transaction.amount < 0 ? 'Payment' : 'Credit'}
                  </div>
                </div>
              </div>
              
              {transaction.logo_url && (
                <div className="mt-3 flex items-center space-x-2">
                  <img 
                    src={transaction.logo_url} 
                    alt={`${transaction.merchant_name} logo`}
                    className="w-6 h-6 rounded"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                    }}
                  />
                  <span className="text-xs text-gray-500">
                    Merchant verified
                  </span>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {isDemo && (
        <div className="mt-4 p-3 bg-blue-900/20 border border-blue-700/30 rounded-lg">
          <p className="text-sm text-blue-300">
            💡 <strong>Demo Mode:</strong> This shows sample enriched transaction data. 
            In production, this would display real merchant information from your connected accounts.
          </p>
        </div>
      )}
    </div>
  );
}
