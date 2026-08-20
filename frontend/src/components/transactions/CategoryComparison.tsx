import React, { useState, useEffect, useCallback, useRef } from 'react';

const TRANSACTION_TYPES = [
  'income',
  'expense',
  'transfer_in',
  'transfer_out',
  'buy',
  'sell',
  'deposit',
  'withdrawal',
  'fee',
  'refund',
  'adjustment'
] as const;

type TransactionType = typeof TRANSACTION_TYPES[number];

interface Transaction {
  id: string;
  name: string;
  merchantName?: string;
  amount: number;
  date: string;
  account: {
    name: string;
    institution?: string;
  };
  originalCategory?: string;
  transaction_type?: string | null;
  aiCategory?: string; // Legacy field, kept for backwards compatibility
  aiCategoryReason?: string;
  categoryComparedAt?: string;
  isManualCorrection?: boolean;
  match: boolean;
  enrichedData?: Record<string, unknown>;
  pending?: boolean;
}

export const CategoryComparison: React.FC = () => {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('all');
  const [showPending, setShowPending] = useState<boolean>(true);
  const [editingTransactionId, setEditingTransactionId] = useState<string | null>(null);
  const [savingTransactionId, setSavingTransactionId] = useState<string | null>(null);
  const [localTransactionTypes, setLocalTransactionTypes] = useState<Map<string, TransactionType>>(new Map());
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const scrollPositionRef = useRef<number>(0);
  const lastEditedTransactionIdRef = useRef<string | null>(null);

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || (typeof window !== 'undefined' && window.location.hostname === 'localhost' ? 'http://localhost:3000' : 'https://finsight-backend.onrender.com');

  const fetchTransactions = useCallback(async (preserveScroll: boolean = false, scrollToTransactionId: string | null = null) => {
    // Save scroll position before fetching if we want to preserve it
    if (preserveScroll && tableContainerRef.current) {
      scrollPositionRef.current = tableContainerRef.current.scrollTop;
    }
    
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch(
        `${apiUrl}/api/ai/transactions/comparison?filter=${filter}&limit=100`,
        {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('auth_token')}`,
          },
        }
      );
      
      if (!response.ok) {
        throw new Error('Failed to fetch transactions');
      }
      
      const data = await response.json();
      setTransactions(data.transactions);
      
      // Initialize local state with current transaction types
      // Only store valid transaction types (filter out old category names like "Special", "Place")
      const typesMap = new Map<string, TransactionType>();
      data.transactions.forEach((tx: Transaction) => {
        // Check both transaction_type and aiCategory (legacy field) for backwards compatibility
        const typeToUse = tx.transaction_type || tx.aiCategory;
        if (typeToUse) {
          const normalized = String(typeToUse).toLowerCase().trim();
          if (TRANSACTION_TYPES.includes(normalized as TransactionType)) {
            typesMap.set(tx.id, normalized as TransactionType);
          }
        }
      });
      setLocalTransactionTypes(typesMap);
      
      // Store the transaction ID to scroll to after render
      if (scrollToTransactionId) {
        lastEditedTransactionIdRef.current = scrollToTransactionId;
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [filter, apiUrl]);

  useEffect(() => {
    fetchTransactions();
  }, [fetchTransactions]);

  // Restore scroll position after transactions are loaded and rendered
  useEffect(() => {
    if (!loading && transactions.length > 0 && tableContainerRef.current) {
      // Use requestAnimationFrame to ensure DOM is fully rendered, with a small delay for React to finish rendering
      requestAnimationFrame(() => {
        setTimeout(() => {
          if (!tableContainerRef.current) return;
          
          if (lastEditedTransactionIdRef.current) {
            // Scroll to the specific transaction that was just edited
            const transactionElement = document.querySelector(`[data-transaction-id="${lastEditedTransactionIdRef.current}"]`) as HTMLElement;
            if (transactionElement && tableContainerRef.current) {
              // Get the table element to find the header height
              const table = tableContainerRef.current.querySelector('table');
              const thead = table?.querySelector('thead');
              const headerHeight = thead?.offsetHeight || 0;
              
              // Calculate position relative to the scroll container
              // offsetTop is relative to the offsetParent (table), so we need to account for the header
              const elementTop = transactionElement.offsetTop + headerHeight;
              
              // If the table is inside the scroll container, we need to adjust
              // The scroll container's scrollTop should position the element
              const containerHeight = tableContainerRef.current.clientHeight;
              const elementHeight = transactionElement.offsetHeight;
              
              // Center the element in the visible area
              const scrollTo = elementTop - (containerHeight / 2) + (elementHeight / 2);
              
              tableContainerRef.current.scrollTo({
                top: Math.max(0, scrollTo),
                behavior: 'smooth'
              });
              
              lastEditedTransactionIdRef.current = null;
              return;
            }
          }
          
          // Otherwise, restore the saved scroll position
          if (scrollPositionRef.current > 0) {
            tableContainerRef.current.scrollTop = scrollPositionRef.current;
            scrollPositionRef.current = 0;
          }
        }, 50); // Small delay to ensure DOM is fully updated
      });
    }
  }, [loading, transactions]);

  const handleTransactionTypeChange = (transactionId: string, newType: TransactionType) => {
    const updatedMap = new Map(localTransactionTypes);
    updatedMap.set(transactionId, newType);
    setLocalTransactionTypes(updatedMap);
  };

  const handleSaveTransactionType = async (transactionId: string) => {
    const transactionType = localTransactionTypes.get(transactionId);
    
    if (!transactionType) {
      setError('Please select a transaction type');
      return;
    }

    setSavingTransactionId(transactionId);
    setError(null);
    
    try {
      const response = await fetch(
        `${apiUrl}/api/ai/transactions/${transactionId}/transaction-type`,
        {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('auth_token')}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            transaction_type: transactionType,
            reason: 'Manually corrected by user'
          }),
        }
      );
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update transaction type');
      }

      // Refresh the list to get updated data, preserving scroll position and scrolling to this transaction
      await fetchTransactions(true, transactionId);
      setEditingTransactionId(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setSavingTransactionId(null);
    }
  };

  const beginEditing = (transaction: Transaction) => {
    const typeToUse = transaction.transaction_type || transaction.aiCategory;
    if (typeToUse) {
      const normalized = String(typeToUse).toLowerCase().trim();
      if (TRANSACTION_TYPES.includes(normalized as TransactionType)) {
        setLocalTransactionTypes(prev => {
          const updated = new Map(prev);
          updated.set(transaction.id, normalized as TransactionType);
          return updated;
        });
      }
    }
    setEditingTransactionId(transaction.id);
  };

  const cancelEditing = (transaction: Transaction) => {
    setEditingTransactionId(null);
    const originalType = transaction.transaction_type || transaction.aiCategory;
    setLocalTransactionTypes(prev => {
      const updated = new Map(prev);
      const normalized = originalType ? String(originalType).toLowerCase().trim() : '';
      if (TRANSACTION_TYPES.includes(normalized as TransactionType)) {
        updated.set(transaction.id, normalized as TransactionType);
      } else {
        updated.delete(transaction.id);
      }
      return updated;
    });
  };

  const formatTransactionType = (type: string): string => {
    return type
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  // Filter transactions based on showPending state
  const filteredTransactions = transactions.filter(tx => {
    if (!showPending && tx.pending) {
      return false;
    }
    return true;
  });

  return (
    <div className="p-0 sm:p-6">
      {/* Filters */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="mobile-scroll-strip flex gap-2 overflow-x-auto pb-2 sm:flex-wrap sm:overflow-visible sm:pb-0">
          <button
            onClick={() => setFilter('all')}
            className={`min-h-11 shrink-0 rounded-md px-4 py-2 text-sm font-medium ${
              filter === 'all'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            All
          </button>
          {TRANSACTION_TYPES.map(type => (
            <button
              key={type}
              onClick={() => setFilter(type)}
              className={`min-h-11 shrink-0 rounded-md px-4 py-2 text-sm font-medium ${
                filter === type
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {formatTransactionType(type)}
            </button>
          ))}
        </div>
        
        <div className="flex min-h-11 items-center gap-2">
          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
            <input
              type="checkbox"
              checked={showPending}
              onChange={(e) => setShowPending(e.target.checked)}
              className="h-5 w-5 cursor-pointer rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span>Show Pending</span>
          </label>
        </div>
        
        <div className="flex-1" />
        
        <button
          onClick={() => fetchTransactions()}
          disabled={loading}
          className="min-h-11 rounded-md bg-gray-600 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50"
        >
          Refresh
        </button>
      </div>
      
      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
          {error}
        </div>
      )}
      
      {loading ? (
        <div className="text-center py-8 text-gray-500">Loading transactions...</div>
      ) : filteredTransactions.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          No transactions found for this filter.
        </div>
      ) : (
        <>
        <div className="max-h-[calc(100dvh-220px)] space-y-3 overflow-y-auto md:hidden">
          {filteredTransactions.map(transaction => {
            const isEditing = editingTransactionId === transaction.id;
            const isSaving = savingTransactionId === transaction.id;
            const rawType = localTransactionTypes.get(transaction.id) || transaction.transaction_type || transaction.aiCategory;
            const normalizedRawType = rawType ? String(rawType).toLowerCase().trim() : null;
            const currentType = normalizedRawType && TRANSACTION_TYPES.includes(normalizedRawType as TransactionType)
              ? normalizedRawType as TransactionType
              : undefined;

            return (
              <article
                key={transaction.id}
                data-transaction-id={transaction.id}
                className="rounded-xl border border-gray-700 bg-white p-4 text-gray-900 shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="break-words text-sm font-semibold">
                      {transaction.merchantName || transaction.name}
                    </h2>
                    <p className="mt-1 break-words text-xs text-gray-500">
                      {transaction.account.name}
                      {transaction.account.institution && ` • ${transaction.account.institution}`}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="font-semibold">${Math.abs(transaction.amount).toFixed(2)}</div>
                    <div className="mt-1 text-xs text-gray-500">{new Date(transaction.date).toLocaleDateString()}</div>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${transaction.pending ? 'bg-yellow-100 text-yellow-800' : 'bg-green-100 text-green-800'}`}>
                    {transaction.pending ? 'Pending' : 'Settled'}
                  </span>
                  {currentType ? (
                    <span className="inline-flex rounded-full bg-blue-100 px-2 py-1 text-xs font-medium text-blue-800">
                      {formatTransactionType(currentType)}
                    </span>
                  ) : (
                    <span className="text-xs text-gray-500">Not categorized</span>
                  )}
                </div>

                <div className="mt-3 rounded-lg bg-gray-50 p-3">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Plaid category</div>
                  <div className="mt-1 break-words text-sm">{transaction.originalCategory || 'N/A'}</div>
                  {transaction.aiCategoryReason && (
                    <div className="mt-2 break-words text-xs text-gray-500">{transaction.aiCategoryReason}</div>
                  )}
                </div>

                {isEditing ? (
                  <div className="mt-3 space-y-3">
                    <label className="block text-xs font-medium text-gray-700">
                      Transaction type
                      <select
                        value={currentType || ''}
                        onChange={(event) => handleTransactionTypeChange(transaction.id, event.target.value as TransactionType)}
                        className="mt-1 min-h-11 w-full rounded-md border border-blue-500 bg-white px-3 py-2 text-base text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        disabled={isSaving}
                      >
                        <option value="">Select type...</option>
                        {TRANSACTION_TYPES.map(type => <option key={type} value={type}>{formatTransactionType(type)}</option>)}
                      </select>
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => void handleSaveTransactionType(transaction.id)}
                        disabled={isSaving || !currentType}
                        className="min-h-11 rounded-md bg-green-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
                      >
                        {isSaving ? 'Saving...' : 'Save'}
                      </button>
                      <button
                        onClick={() => cancelEditing(transaction)}
                        disabled={isSaving}
                        className="min-h-11 rounded-md bg-gray-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => beginEditing(transaction)}
                    className="mt-3 min-h-11 w-full rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
                  >
                    Edit transaction type
                  </button>
                )}
              </article>
            );
          })}
        </div>
        <div 
          ref={tableContainerRef}
          className="hidden max-h-[calc(100vh-250px)] overflow-auto rounded-lg bg-white shadow md:block"
        >
          <table className="min-w-[1100px] divide-y divide-gray-200" style={{ tableLayout: 'fixed', width: '100%' }}>
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-[25%]">
                  Transaction
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-[10%]">
                  Amount
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-[10%]">
                  Date
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-[10%]">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-[20%]">
                  Plaid Category
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-[15%]">
                  Transaction Type
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-[10%]">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredTransactions.map(transaction => {
                const isEditing = editingTransactionId === transaction.id;
                const isSaving = savingTransactionId === transaction.id;
                // Get the transaction type, but validate it's actually a valid TransactionType
                // Filter out invalid values like "Special", "Place" (old category names) or payment channels
                // Check both transaction_type and aiCategory (legacy field) for backwards compatibility
                const rawType = localTransactionTypes.get(transaction.id) || transaction.transaction_type || transaction.aiCategory;
                const normalizedRawType = rawType ? String(rawType).toLowerCase().trim() : null;
                const currentType = normalizedRawType && TRANSACTION_TYPES.includes(normalizedRawType as TransactionType) 
                  ? (normalizedRawType as TransactionType)
                  : undefined;
                
                return (
                  <tr
                    key={transaction.id}
                    data-transaction-id={transaction.id}
                    className="hover:bg-gray-50"
                  >
                    <td className="px-6 py-4">
                      <div className="text-sm font-medium text-gray-900 break-words">
                        {transaction.merchantName || transaction.name}
                      </div>
                      <div className="text-sm text-gray-500 break-words">
                        {transaction.account.name}
                        {transaction.account.institution && ` • ${transaction.account.institution}`}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900">
                      ${Math.abs(transaction.amount).toFixed(2)}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {new Date(transaction.date).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4">
                      {transaction.pending ? (
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                          Pending
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                          Settled
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-gray-900 break-words">
                        {transaction.originalCategory || 'N/A'}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      {isEditing ? (
                        <select
                          value={currentType || ''}
                          onChange={(e) => handleTransactionTypeChange(transaction.id, e.target.value as TransactionType)}
                          className="text-sm border border-blue-500 rounded-md px-3 py-2 bg-white text-gray-900 w-full focus:outline-none focus:ring-2 focus:ring-blue-500"
                          disabled={isSaving}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <option value="">Select type...</option>
                          {TRANSACTION_TYPES.map(type => (
                            <option key={type} value={type}>
                              {formatTransactionType(type)}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <div>
                          {currentType ? (
                            <div className="flex flex-col gap-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-sm font-medium text-gray-900">
                                  {formatTransactionType(currentType)}
                                </span>
                                {transaction.isManualCorrection ? (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                                    Manual
                                  </span>
                                ) : transaction.aiCategoryReason ? (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                                    AI
                                  </span>
                                ) : null}
                              </div>
                              {transaction.aiCategoryReason && (
                                <div className="text-xs text-gray-500 mt-1 break-words">
                                  {transaction.aiCategoryReason}
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className="text-sm text-gray-400">Not categorized</span>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      {isEditing ? (
                        <div className="flex gap-2">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSaveTransactionType(transaction.id);
                            }}
                            disabled={isSaving || !currentType}
                            className="px-3 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {isSaving ? 'Saving...' : 'Save'}
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              cancelEditing(transaction);
                            }}
                            disabled={isSaving}
                            className="px-3 py-1 text-xs bg-gray-600 text-white rounded hover:bg-gray-700 disabled:opacity-50"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            beginEditing(transaction);
                          }}
                          className="px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
                        >
                          Edit
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        </>
      )}
    </div>
  );
};
