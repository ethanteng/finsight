"use client";
import { useState, useMemo } from 'react';
import InvestmentPortfolio from '../InvestmentPortfolio';

interface Account {
  id: string;
  account_id: string;
  name: string;
  type: string;
  subtype: string;
  balance: {
    current: number;
    available?: number;
    limit?: number;
    iso_currency_code: string;
  };
  institution?: string;
  source?: 'plaid' | 'snaptrade';
}

interface SnapTradeAccount {
  id: string;
  name: string;
  type: string;
  institution: string;
  balance: number;
  accountNumber: string;
}

interface Transaction {
  id?: string;
  transaction_id?: string;
  account_id: string;
  amount: number;
  date: string;
  name: string;
  category?: string[] | string;
  pending?: boolean;
  merchant_name?: string;
  enriched_data?: {
    merchant_name?: string;
    website?: string;
    logo_url?: string;
    category?: string[] | string;
  };
  transaction_type?: string;
}

interface Holding {
  id: string;
  account_id: string;
  security_id: string;
  institution_value: number;
  institution_price: number;
  institution_price_as_of: string;
  cost_basis: number;
  quantity: number;
  iso_currency_code: string;
  security_name?: string;
  security_type?: string;
  ticker_symbol?: string;
}

interface InvestmentTransaction {
  id?: string;
  transaction_id?: string;
  account_id: string;
  security_id: string;
  amount: number;
  date: string;
  name?: string;
  security_name?: string;
  security_type?: string;
  ticker_symbol?: string;
  quantity: number;
  type: string;
  iso_currency_code: string;
}

interface AccountDetailModalProps {
  account: Account | SnapTradeAccount;
  accountId: string;
  transactions: Transaction[];
  holdings?: Holding[];
  investmentTransactions?: InvestmentTransaction[];
  onClose: () => void;
}

type CashDebtView = 'categories' | 'transactions';
type InvestmentView = 'overview' | 'holdings' | 'transactions';

export default function AccountDetailModal({
  account,
  accountId,
  transactions,
  holdings = [],
  investmentTransactions = [],
  onClose
}: AccountDetailModalProps) {
  const isInvestment = (account as Account).type === 'investment' || 
                      ['401k', 'ira', 'roth', 'brokerage', 'hsa', '529'].includes((account as Account).subtype?.toLowerCase() || '') ||
                      (account as SnapTradeAccount).type === 'investment';

  const [cashDebtView, setCashDebtView] = useState<CashDebtView>('categories');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  // Filter transactions for this account
  const accountTransactions = useMemo(() => {
    return transactions.filter(t => {
      const txAccountId = t.account_id;
      const accId = (account as Account).account_id || (account as Account).id || (account as SnapTradeAccount).id;
      return txAccountId === accId || txAccountId === accountId;
    });
  }, [transactions, account, accountId]);

  // Group transactions by category
  const categoryTotals = useMemo(() => {
    const totals: Record<string, { total: number; count: number }> = {};
    
    accountTransactions.forEach(tx => {
      // Handle category as array or string
      let categories: string[] = [];
      if (tx.enriched_data?.category) {
        const enrichedCat = tx.enriched_data.category;
        if (Array.isArray(enrichedCat)) {
          categories = enrichedCat;
        } else if (typeof enrichedCat === 'string') {
          categories = enrichedCat.split(',').map((c: string) => c.trim());
        }
      } else if (tx.category) {
        if (Array.isArray(tx.category)) {
          categories = tx.category;
        } else if (typeof tx.category === 'string') {
          categories = tx.category.split(',').map((c: string) => c.trim());
        }
      }
      
      const categoryKey = categories.length > 0 && categories.some(c => c && c !== '0')
        ? categories.filter(c => c && c !== '0' && c.trim() !== '').join(' > ')
        : 'Uncategorized';
      
      if (!totals[categoryKey]) {
        totals[categoryKey] = { total: 0, count: 0 };
      }
      totals[categoryKey].total += Math.abs(tx.amount);
      totals[categoryKey].count += 1;
    });
    
    return Object.entries(totals)
      .map(([category, data]) => ({ category, ...data }))
      .sort((a, b) => b.total - a.total);
  }, [accountTransactions]);

  // Filter transactions by selected category
  const categoryTransactions = useMemo(() => {
    if (!selectedCategory) return [];
    
    return accountTransactions.filter(tx => {
      // Handle category as array or string
      let categories: string[] = [];
      if (tx.enriched_data?.category) {
        const enrichedCat = tx.enriched_data.category;
        if (Array.isArray(enrichedCat)) {
          categories = enrichedCat;
        } else if (typeof enrichedCat === 'string') {
          categories = enrichedCat.split(',').map((c: string) => c.trim());
        }
      } else if (tx.category) {
        if (Array.isArray(tx.category)) {
          categories = tx.category;
        } else if (typeof tx.category === 'string') {
          categories = tx.category.split(',').map((c: string) => c.trim());
        }
      }
      
      const categoryKey = categories.length > 0 && categories.some(c => c && c !== '0')
        ? categories.filter(c => c && c !== '0' && c.trim() !== '').join(' > ')
        : 'Uncategorized';
      return categoryKey === selectedCategory;
    }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [accountTransactions, selectedCategory]);

  // Filter holdings for this account
  const accountHoldings = useMemo(() => {
    return holdings.filter(h => {
      const holdingAccountId = h.account_id;
      const accId = (account as Account).account_id || (account as Account).id || (account as SnapTradeAccount).id;
      return holdingAccountId === accId || holdingAccountId === accountId;
    });
  }, [holdings, account, accountId]);

  // Filter investment transactions for this account
  const accountInvestmentTransactions = useMemo(() => {
    return investmentTransactions.filter(tx => {
      const txAccountId = tx.account_id;
      const accId = (account as Account).account_id || (account as Account).id || (account as SnapTradeAccount).id;
      return txAccountId === accId || txAccountId === accountId;
    });
  }, [investmentTransactions, account, accountId]);

  // Calculate portfolio for this account
  const accountPortfolio = useMemo(() => {
    const totalValue = accountHoldings.reduce((sum, h) => sum + (h.institution_value || 0), 0);
    
    // Calculate asset allocation
    const allocationMap: Record<string, number> = {};
    accountHoldings.forEach(h => {
      const type = h.security_type || 'Unknown';
      allocationMap[type] = (allocationMap[type] || 0) + (h.institution_value || 0);
    });
    
    const assetAllocation = Object.entries(allocationMap).map(([type, value]) => ({
      type,
      value,
      percentage: totalValue > 0 ? (value / totalValue) * 100 : 0
    })).sort((a, b) => b.value - a.value);
    
    const uniqueSecurities = new Set(accountHoldings.map(h => h.security_id)).size;
    
    return {
      totalValue,
      assetAllocation,
      holdingCount: accountHoldings.length,
      securityCount: uniqueSecurities
    };
  }, [accountHoldings]);

  const getAccountBalance = (): number => {
    if ('balance' in account && typeof account.balance === 'object') {
      const acc = account as Account;
      if (acc.type === 'depository' || acc.subtype === 'checking' || acc.subtype === 'savings') {
        return acc.balance.available ?? acc.balance.current ?? 0;
      }
      return acc.balance.current ?? 0;
    }
    return (account as SnapTradeAccount).balance ?? 0;
  };

  const getAccountName = (): string => {
    return account.name || 'Unknown Account';
  };

  const getAccountInstitution = (): string => {
    if ('institution' in account) {
      return (account as Account).institution || (account as SnapTradeAccount).institution || '';
    }
    return '';
  };

  if (isInvestment) {
    // Investment account view
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-gray-800 rounded-lg max-w-6xl w-full max-h-[90vh] overflow-hidden flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-gray-700">
            <div>
              <h2 className="text-2xl font-bold text-white">{getAccountName()}</h2>
              <div className="text-sm text-gray-400 mt-1">
                {getAccountInstitution()} • {(account as Account).type} • {(account as Account).subtype}
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white text-2xl"
            >
              ×
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6">
            <InvestmentPortfolio
              portfolio={accountPortfolio}
              holdings={accountHoldings}
              transactions={accountInvestmentTransactions}
            />
          </div>
        </div>
      </div>
    );
  }

  // Cash/Debt account view
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 rounded-lg max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-700">
          <div>
            <h2 className="text-2xl font-bold text-white">{getAccountName()}</h2>
            <div className="text-sm text-gray-400 mt-1">
              {getAccountInstitution()} • {(account as Account).type} • {(account as Account).subtype}
            </div>
            <div className="text-lg font-semibold text-white mt-2">
              Balance: {formatCurrency(getAccountBalance())}
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white text-2xl"
          >
            ×
          </button>
        </div>

        {/* Navigation */}
        <div className="flex space-x-1 px-6 pt-4 bg-gray-800 border-b border-gray-700">
          <button
            onClick={() => {
              setCashDebtView('categories');
              setSelectedCategory(null);
            }}
            className={`py-2 px-4 rounded-t-md text-sm font-medium transition-colors ${
              cashDebtView === 'categories'
                ? 'bg-gray-700 text-white'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            Categories ({categoryTotals.length})
          </button>
          <button
            onClick={() => setCashDebtView('transactions')}
            className={`py-2 px-4 rounded-t-md text-sm font-medium transition-colors ${
              cashDebtView === 'transactions'
                ? 'bg-gray-700 text-white'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            All Transactions ({accountTransactions.length})
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {cashDebtView === 'categories' && !selectedCategory && (
            <div className="space-y-3">
              <h3 className="text-lg font-semibold text-white mb-4">Transaction Categories</h3>
              {categoryTotals.length > 0 ? (
                categoryTotals.map((cat) => (
                  <button
                    key={cat.category}
                    onClick={() => setSelectedCategory(cat.category)}
                    className="w-full bg-gray-700 rounded-lg p-4 border border-gray-600 hover:bg-gray-600 transition-colors text-left"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="font-medium text-white">{cat.category}</div>
                        <div className="text-sm text-gray-400">{cat.count} transactions</div>
                      </div>
                      <div className="text-right">
                        <div className="font-semibold text-white text-lg">
                          {formatCurrency(cat.total)}
                        </div>
                      </div>
                    </div>
                  </button>
                ))
              ) : (
                <div className="text-gray-400 text-center py-8">
                  No categorized transactions found
                </div>
              )}
            </div>
          )}

          {cashDebtView === 'categories' && selectedCategory && (
            <div className="space-y-4">
              <div className="flex items-center gap-4 mb-4">
                <button
                  onClick={() => setSelectedCategory(null)}
                  className="text-blue-400 hover:text-blue-300"
                >
                  ← Back to Categories
                </button>
                <h3 className="text-lg font-semibold text-white">{selectedCategory}</h3>
              </div>
              <div className="space-y-3">
                {categoryTransactions.map((tx) => (
                  <div key={tx.id || tx.transaction_id} className="bg-gray-700 rounded-lg p-4 border border-gray-600">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          {tx.enriched_data?.logo_url && (
                            <img 
                              src={tx.enriched_data.logo_url} 
                              alt={`${tx.enriched_data?.merchant_name || tx.name} logo`}
                              className="w-8 h-8 rounded object-contain bg-white p-1"
                              onError={(e) => {
                                e.currentTarget.style.display = 'none';
                              }}
                            />
                          )}
                          <div className="font-medium text-white">
                            {tx.enriched_data?.merchant_name || tx.merchant_name || tx.name}
                          </div>
                        </div>
                        <div className="text-sm text-gray-400">
                          {formatDate(tx.date)}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className={`font-semibold text-lg ${
                          tx.amount < 0 ? 'text-green-400' : 'text-red-400'
                        }`}>
                          {tx.amount < 0 ? '+' : ''}{formatCurrency(Math.abs(tx.amount))}
                        </div>
                        {tx.pending && (
                          <div className="text-xs text-yellow-400 mt-1">Pending</div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {cashDebtView === 'transactions' && (
            <div className="space-y-3">
              <h3 className="text-lg font-semibold text-white mb-4">All Transactions</h3>
              {accountTransactions.length > 0 ? (
                accountTransactions
                  .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                  .map((tx) => (
                    <div key={tx.id || tx.transaction_id} className="bg-gray-700 rounded-lg p-4 border border-gray-600">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            {tx.enriched_data?.logo_url && (
                              <img 
                                src={tx.enriched_data.logo_url} 
                                alt={`${tx.enriched_data?.merchant_name || tx.name} logo`}
                                className="w-8 h-8 rounded object-contain bg-white p-1"
                                onError={(e) => {
                                  e.currentTarget.style.display = 'none';
                                }}
                              />
                            )}
                            <div className="font-medium text-white">
                              {tx.enriched_data?.merchant_name || tx.merchant_name || tx.name}
                            </div>
                          </div>
                          <div className="text-sm text-gray-400 mb-1">
                            {formatDate(tx.date)}
                          </div>
                          {(tx.enriched_data?.category || tx.category) && (() => {
                            let categories: string[] = [];
                            if (tx.enriched_data?.category) {
                              const enrichedCat = tx.enriched_data.category;
                              if (Array.isArray(enrichedCat)) {
                                categories = enrichedCat;
                              } else if (typeof enrichedCat === 'string') {
                                categories = enrichedCat.split(',').map((c: string) => c.trim());
                              }
                            } else if (tx.category) {
                              if (Array.isArray(tx.category)) {
                                categories = tx.category;
                              } else if (typeof tx.category === 'string') {
                                categories = tx.category.split(',').map((c: string) => c.trim());
                              }
                            }
                            return categories.length > 0 ? (
                              <div className="flex flex-wrap gap-1 mt-2">
                                {categories
                                  .filter((c: string) => c && c !== '0')
                                  .map((cat: string, idx: number) => (
                                    <span 
                                      key={idx}
                                      className="inline-block px-2 py-1 bg-blue-900/30 text-blue-300 text-xs rounded border border-blue-700/50"
                                    >
                                      {cat.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, l => l.toUpperCase())}
                                    </span>
                                  ))}
                              </div>
                            ) : null;
                          })()}
                        </div>
                        <div className="text-right">
                          <div className={`font-semibold text-lg ${
                            tx.amount < 0 ? 'text-green-400' : 'text-red-400'
                          }`}>
                            {tx.amount < 0 ? '+' : ''}{formatCurrency(Math.abs(tx.amount))}
                          </div>
                          {tx.pending && (
                            <div className="text-xs text-yellow-400 mt-1">Pending</div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))
              ) : (
                <div className="text-gray-400 text-center py-8">
                  No transactions found for this account
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
