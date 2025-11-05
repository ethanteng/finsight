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
}

export const CategoryComparison: React.FC = () => {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'matched' | 'mismatched' | 'uncategorized'>('all');
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

  const formatTransactionType = (type: string): string => {
    return type
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  return (
    <div className="p-6">
      {/* Filters */}
      <div className="mb-6 flex items-center gap-4 flex-wrap">
        <div className="flex gap-2">
          {(['all', 'matched', 'mismatched', 'uncategorized'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-2 rounded-md text-sm font-medium ${
                filter === f
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
        
        <div className="flex-1" />
        
        <button
          onClick={fetchTransactions}
          disabled={loading}
          className="px-4 py-2 bg-gray-600 text-white rounded-md text-sm font-medium hover:bg-gray-700 disabled:opacity-50"
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
      ) : transactions.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          No transactions found for this filter.
        </div>
      ) : (
        <div 
          ref={tableContainerRef}
          className="bg-white rounded-lg shadow overflow-x-auto max-h-[calc(100vh-250px)] overflow-y-auto"
        >
          <table className="min-w-full divide-y divide-gray-200" style={{ tableLayout: 'auto' }}>
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Transaction
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Amount
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Date
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Plaid Category
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Transaction Type
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {transactions.map(transaction => {
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
                      <div className="text-sm font-medium text-gray-900">
                        {transaction.merchantName || transaction.name}
                      </div>
                      <div className="text-sm text-gray-500">
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
                    <td className="px-6 py-4 min-w-[250px]">
                      <div className="text-sm text-gray-900 break-words">
                        {transaction.originalCategory || 'N/A'}
                      </div>
                    </td>
                    <td className="px-6 py-4 min-w-[200px]">
                      {isEditing ? (
                        <select
                          value={currentType || ''}
                          onChange={(e) => handleTransactionTypeChange(transaction.id, e.target.value as TransactionType)}
                          className="text-sm border border-blue-500 rounded-md px-3 py-2 bg-white text-gray-900 min-w-[180px] focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                        <div className="min-w-[200px]">
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
                              setEditingTransactionId(null);
                              // Reset to original value from transaction data
                              const originalType = transaction.transaction_type || transaction.aiCategory;
                              if (originalType) {
                                const normalized = String(originalType).toLowerCase().trim();
                                if (TRANSACTION_TYPES.includes(normalized as TransactionType)) {
                                  setLocalTransactionTypes(prev => {
                                    const updated = new Map(prev);
                                    updated.set(transaction.id, normalized as TransactionType);
                                    return updated;
                                  });
                                } else {
                                  // Invalid type, remove from local state
                                  setLocalTransactionTypes(prev => {
                                    const updated = new Map(prev);
                                    updated.delete(transaction.id);
                                    return updated;
                                  });
                                }
                              } else {
                                // No original type, remove from local state
                                setLocalTransactionTypes(prev => {
                                  const updated = new Map(prev);
                                  updated.delete(transaction.id);
                                  return updated;
                                });
                              }
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
                            // Ensure the current transaction type is loaded into local state when entering edit mode
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
      )}
    </div>
  );
};
