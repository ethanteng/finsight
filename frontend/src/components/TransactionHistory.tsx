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
  transaction_type?: string; // From categorization service: income, expense, transfer_in, transfer_out, buy, sell, etc.
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

export default forwardRef<{ refresh: () => void }, object>(function TransactionHistory(_props, ref) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [dateRange, setDateRange] = useState('90');

  const API_URL = process.env.NEXT_PUBLIC_API_URL;

  type SnapshotTransaction = {
    transaction_id?: string;
    id?: string;
    account_id: string;
    amount: number | string;
    date: string;
    name: string;
    merchant_name?: string;
    category?: string[] | string;
    pending?: boolean;
    transaction_type?: string;
    enriched_data?: {
      merchant_name?: string;
      website?: string;
      logo_url?: string;
    };
  };

  const loadTransactions = useCallback(async () => {
    setLoading(true);
    setError('');

    // Clear stale transactions before loading the latest snapshot.
    setTransactions([]);

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      const token = localStorage.getItem('auth_token');
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      // Use single source of truth: snapshot transactions
      const res = await fetch(`${API_URL}/api/summaries?view=full&_t=${Date.now()}`, {
        method: 'GET',
        headers
      });

      if (res.ok) {
        const data = await res.json();
        console.log('🔍 Frontend: Received snapshot (full) for transactions:', data);

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

        const snapshotTx: SnapshotTransaction[] = Array.isArray(data.transactions) ? data.transactions as SnapshotTransaction[] : [];
        // Ensure each transaction has an id
        const normalized = snapshotTx.map((t) => ({
          id: t.transaction_id || t.id || `${t.account_id}-${t.date}-${t.name}`,
          account_id: t.account_id,
          amount: typeof t.amount === 'number' ? t.amount : Number(t.amount || 0),
          date: t.date,
          name: t.name,
          merchant_name: t.merchant_name,
          category: Array.isArray(t.category) ? t.category : (typeof t.category === 'string' ? [t.category] : []),
          pending: Boolean(t.pending),
          transaction_type: t.transaction_type,
          enriched_data: t.enriched_data
        })) as Transaction[];
        setTransactions(normalized);
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
  }, [dateRange, API_URL]);

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

  // Filter transactions based on date range and always show pending,
  // newest transaction date first.
  const filteredTransactions = useMemo(() => {
    const daysAgo = new Date();
    daysAgo.setDate(daysAgo.getDate() - parseInt(dateRange));

    return transactions
      .filter(transaction => {
        const transactionDate = new Date(transaction.date);
        return transactionDate >= daysAgo;
      })
      .sort((a, b) => {
        const aTime = new Date(a.date).getTime();
        const bTime = new Date(b.date).getTime();
        // Keep undated/unparseable rows at the end rather than scattering them.
        if (Number.isNaN(aTime) && Number.isNaN(bTime)) return 0;
        if (Number.isNaN(aTime)) return 1;
        if (Number.isNaN(bTime)) return -1;
        return bTime - aTime;
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
            className="rounded-lg border border-[#102319]/15 bg-[#fffdf5] px-3 py-2 text-sm text-[#102319] focus:border-[#397052] focus:outline-none"
          >
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
            <option value="90">Last 90 days</option>
            <option value="365">Last year</option>
          </select>

          <button
            onClick={loadTransactions}
            disabled={loading}
            className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
              loading
                ? 'cursor-not-allowed bg-[#dfe2da] text-[#7a847d]'
                : 'bg-[#d9ff6f] text-[#102319] hover:bg-[#cdef64]'
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
              className={`rounded-xl border border-[#102319]/10 bg-[#f8f7ef] p-4 shadow-[inset_3px_0_0_var(--transaction-accent)] ${
                transaction.amount < 0 ? '[--transaction-accent:#b56a5f]' : '[--transaction-accent:#6f9b7e]'
              } ${hasEnrichedData ? 'ring-1 ring-[#397052]/15' : ''}`}
            >
              {/* Enriched data indicator */}
              {hasEnrichedData && (
                <div className="flex items-center gap-1 mb-2">
                  <div className="h-2 w-2 rounded-full bg-[#397052]"></div>
                  <span className="text-xs font-medium text-[#397052]">Enhanced Data Available</span>
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

                    {/* Transaction Type - Only show if it's from our categorization service (not Plaid's payment method) */}
                    {/* Plaid's transaction_type is payment method (place, digital, etc.) - we don't want to show that */}
                    {/* Our categorization service sets transaction_type to income, expense, transfer_in, etc. */}
                    {transaction.transaction_type &&
                     !['place', 'special', 'digital', 'atm', 'other'].includes(transaction.transaction_type.toLowerCase()) && (
                      <div className="mb-2">
                        <span className="inline-block rounded-full border border-[#397052]/20 bg-[#c9f2df]/55 px-2.5 py-1 text-xs font-semibold text-[#285c43]">
                          {transaction.transaction_type.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, l => l.toUpperCase())}
                        </span>
                      </div>
                    )}

                    {/* Categories section */}
                    <div className="space-y-2">
                      {/* Show meaningful categories if available */}
                      {transaction.enriched_data?.category &&
                       Array.isArray(transaction.enriched_data.category) &&
                       transaction.enriched_data.category.length > 0 &&
                       transaction.enriched_data.category.some(cat => cat && cat.trim() !== '' && cat !== '0') ? (
                        <div>
                          <span className="text-xs font-medium text-[#5e6b63]">Enhanced Categories:</span>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {transaction.enriched_data.category
                              .filter(cat => cat && cat.trim() !== '' && cat !== '0')
                              .map((cat, index) => (
                                <span
                                  key={index}
                                  className="inline-block rounded-full border border-[#397052]/18 bg-[#edf3e9] px-2.5 py-1 text-xs text-[#365d49]"
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
                                  className="inline-block rounded-full border border-[#102319]/12 bg-[#ecece4] px-2.5 py-1 text-xs text-[#56635b]"
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
                          className="text-[#397052] underline hover:text-[#102319]"
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
                    transaction.amount < 0 ? 'text-[#8b4137]' : 'text-[#28704d]'
                  }`}>
                    {transaction.amount < 0 ? '' : '+'}${Math.abs(transaction.amount).toFixed(2)}
                  </div>
                  {transaction.pending && (
                    <div className="mt-1 text-xs text-[#76510f]">Pending</div>
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
