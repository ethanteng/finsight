"use client";
import { useState, useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
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
  onAccountRenamed?: () => void;
}

type CashDebtView = 'categories' | 'transactions';

export default function AccountDetailModal({
  account,
  accountId,
  transactions,
  holdings = [],
  investmentTransactions = [],
  onClose,
  onAccountRenamed
}: AccountDetailModalProps) {
  const [isEditingName, setIsEditingName] = useState(false);
  const [editName, setEditName] = useState<string>(account.name || '');
  const [isSavingName, setIsSavingName] = useState(false);
  const isInvestment = (account as Account).type === 'investment' || 
                      ['401k', 'ira', 'roth', 'brokerage', 'hsa', '529'].includes((account as Account).subtype?.toLowerCase() || '') ||
                      (account as SnapTradeAccount).type === 'investment' ||
                      // SnapTrade accounts can have various types that are all investments
                      ['treasury', 'brokerage', 'ira', '401k', 'hsa', '529'].includes((account as SnapTradeAccount).type?.toLowerCase() || '');

  // Determine if account is cash or debt
  const isCashAccount = useMemo(() => {
    const acc = account as Account;
    return acc.type === 'depository' || 
           ['checking', 'savings', 'cd', 'money market', 'prepaid'].includes(acc.subtype?.toLowerCase() || '');
  }, [account]);

  const isDebtAccount = useMemo(() => {
    const acc = account as Account;
    return acc.type === 'credit' || 
           acc.type === 'loan' ||
           ['mortgage', 'student', 'personal', 'auto', 'home equity'].includes(acc.subtype?.toLowerCase() || '');
  }, [account]);

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

  // Helper function to extract lowest-level category name
  const getLowestLevelCategory = (categoryPath: string): string => {
    const parts = categoryPath.split(' > ');
    return parts[parts.length - 1] || categoryPath;
  };

  // Color palette function for different category types
  const getCategoryColor = (type: 'income' | 'expense' | 'payment' | 'additionalDebt', index: number): string => {
    const palettes = {
      income: ['#397052', '#5F8D72', '#82B79D', '#A7CFB8'],
      expense: ['#9B4137', '#B76155', '#C98578', '#DDA99E'],
      payment: ['#486657', '#6F8D78', '#91AC98', '#B3C8B8'],
      additionalDebt: ['#5D7190', '#7891B6', '#91ADDA', '#B5C9E8']
    };
    return palettes[type][index % palettes[type].length];
  };

  // Filter transactions for this account
  const accountTransactions = useMemo(() => {
    return transactions.filter(t => {
      const txAccountId = t.account_id;
      const accId = (account as Account).account_id || (account as Account).id || (account as SnapTradeAccount).id;
      return txAccountId === accId || txAccountId === accountId;
    });
  }, [transactions, account, accountId]);

  // Group transactions by category, separating by type (income/expense or payment/additionalDebt)
  const categoryTotals = useMemo(() => {
    const incomeTotals: Record<string, { total: number; count: number; fullCategory: string }> = {};
    const expenseTotals: Record<string, { total: number; count: number; fullCategory: string }> = {};
    
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
      
      // Determine transaction type based on account type and amount sign
      let isIncome = false;
      let isPayment = false;
      
      if (isCashAccount) {
        // For cash accounts: positive = income, negative = expense
        isIncome = tx.amount > 0;
      } else if (isDebtAccount) {
        // For debt accounts: negative = payment (reducing debt), positive = additional debt
        // Check both amount sign and category to properly identify payments
        const categoryLower = categoryKey.toLowerCase();
        const isPaymentCategory = categoryLower.includes('transfer_out') || 
                                 categoryLower.includes('payment') ||
                                 categoryLower.includes('loan_payment') ||
                                 categoryLower.includes('payoff');
        // Negative amounts are payments, or explicitly marked payment categories
        isPayment = tx.amount < 0 || isPaymentCategory;
      }
      
      const targetTotals = isCashAccount 
        ? (isIncome ? incomeTotals : expenseTotals)
        : (isPayment ? incomeTotals : expenseTotals); // For debt: payments go to "income" (reducing debt), additional debt goes to "expense" (increasing debt)
      
      if (!targetTotals[categoryKey]) {
        targetTotals[categoryKey] = { total: 0, count: 0, fullCategory: categoryKey };
      }
      targetTotals[categoryKey].total += Math.abs(tx.amount);
      targetTotals[categoryKey].count += 1;
    });
    
    // Calculate totals for percentage calculation
    const incomeTotal = Object.values(incomeTotals).reduce((sum, cat) => sum + cat.total, 0);
    const expenseTotal = Object.values(expenseTotals).reduce((sum, cat) => sum + cat.total, 0);
    const grandTotal = incomeTotal + expenseTotal;
    
    // Convert to arrays with type information
    const incomeCategories = Object.entries(incomeTotals)
      .map(([category, data]) => ({
        category,
        fullCategory: data.fullCategory,
        shortenedCategory: getLowestLevelCategory(category),
        total: data.total,
        count: data.count,
        percentage: grandTotal > 0 ? (data.total / grandTotal) * 100 : 0,
        type: isCashAccount ? 'income' : 'payment' as 'income' | 'expense' | 'payment' | 'additionalDebt'
      }))
      .sort((a, b) => b.total - a.total);
    
    const expenseCategories = Object.entries(expenseTotals)
      .map(([category, data]) => ({
        category,
        fullCategory: data.fullCategory,
        shortenedCategory: getLowestLevelCategory(category),
        total: data.total,
        count: data.count,
        percentage: grandTotal > 0 ? (data.total / grandTotal) * 100 : 0,
        type: isCashAccount ? 'expense' : 'additionalDebt' as 'income' | 'expense' | 'payment' | 'additionalDebt'
      }))
      .sort((a, b) => b.total - a.total);
    
    return {
      income: incomeCategories,
      expense: expenseCategories,
      incomeTotal,
      expenseTotal,
      grandTotal
    };
  }, [accountTransactions, isCashAccount, isDebtAccount]);

  // Bar chart data for categories
  const categoryBarData = useMemo(() => {
    const allCategories = [
      ...categoryTotals.income.map(cat => ({ ...cat, section: isCashAccount ? 'Income' : 'Payments' })),
      ...categoryTotals.expense.map(cat => ({ ...cat, section: isCashAccount ? 'Expenses' : 'Additional Debt' }))
    ];
    return allCategories.sort((a, b) => b.total - a.total);
  }, [categoryTotals, isCashAccount]);

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
      
      // Handle both raw and prefixed account IDs for SnapTrade accounts
      // Holdings use prefixed format (snaptrade-{id}), accounts may use raw format
      const normalizedAccId = accId.startsWith('snaptrade-') ? accId : `snaptrade-${accId}`;
      const rawAccId = accId.startsWith('snaptrade-') ? accId.replace('snaptrade-', '') : accId;
      
      return holdingAccountId === accId || 
             holdingAccountId === accountId || 
             holdingAccountId === normalizedAccId ||
             holdingAccountId === `snaptrade-${rawAccId}`;
    });
  }, [holdings, account, accountId]);

  // Filter investment transactions for this account
  const accountInvestmentTransactions = useMemo(() => {
    return investmentTransactions.filter(tx => {
      const txAccountId = tx.account_id;
      const accId = (account as Account).account_id || (account as Account).id || (account as SnapTradeAccount).id;
      
      // Handle both raw and prefixed account IDs for SnapTrade accounts
      // Transactions use prefixed format (snaptrade-{id}), accounts may use raw format
      const normalizedAccId = accId.startsWith('snaptrade-') ? accId : `snaptrade-${accId}`;
      const rawAccId = accId.startsWith('snaptrade-') ? accId.replace('snaptrade-', '') : accId;
      
      return txAccountId === accId || 
             txAccountId === accountId || 
             txAccountId === normalizedAccId ||
             txAccountId === `snaptrade-${rawAccId}`;
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

  const handleStartEditName = () => {
    setIsEditingName(true);
    setEditName(getAccountName());
  };

  const handleCancelEditName = () => {
    setIsEditingName(false);
    setEditName(getAccountName());
  };

  const handleSaveName = async () => {
    if (!editName.trim()) {
      alert('Account name cannot be empty');
      return;
    }

    setIsSavingName(true);
    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
      const token = localStorage.getItem('auth_token');
      
      if (!token) {
        alert('Authentication required. Please log in again.');
        setIsSavingName(false);
        return;
      }

      // Get the account ID (plaidAccountId or snaptrade-{id})
      // For Plaid accounts, use account_id if available, otherwise id
      // For SnapTrade accounts, use id
      const accId = (account as Account).account_id || (account as Account).id || (account as SnapTradeAccount).id;

      console.log(`🔄 Renaming account in modal: accountId=${accId}, newName=${editName.trim()}`);

      const response = await fetch(`${API_URL}/api/accounts/${encodeURIComponent(accId)}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ name: editName.trim() }),
      });

      if (response.ok) {
        const result = await response.json();
        console.log('✅ Account renamed successfully:', result);
        // Update local account name (create new object to trigger re-render)
        account.name = editName.trim();
        setIsEditingName(false);
        // Trigger refresh if callback provided
        if (onAccountRenamed) {
          await onAccountRenamed();
        }
      } else {
        const data = await response.json();
        console.error('❌ Failed to rename account:', data);
        alert(data.error || 'Failed to rename account');
      }
    } catch (error) {
      console.error('Error renaming account:', error);
      alert('Network error. Please try again.');
    } finally {
      setIsSavingName(false);
    }
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
            <div className="flex-1">
              {isEditingName ? (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handleSaveName();
                      } else if (e.key === 'Escape') {
                        handleCancelEditName();
                      }
                    }}
                    className="text-2xl font-bold px-2 py-1 bg-gray-700 text-white border border-gray-600 rounded focus:outline-none focus:border-blue-500"
                    autoFocus
                    disabled={isSavingName}
                  />
                  <button
                    onClick={handleSaveName}
                    disabled={isSavingName}
                    className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                  >
                    {isSavingName ? 'Saving...' : 'Save'}
                  </button>
                  <button
                    onClick={handleCancelEditName}
                    disabled={isSavingName}
                    className="px-3 py-1 bg-gray-600 text-white rounded hover:bg-gray-500 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <h2 className="text-2xl font-bold text-white">{getAccountName()}</h2>
                  <button
                    onClick={handleStartEditName}
                    className="text-gray-400 hover:text-white text-lg"
                    title="Rename account"
                  >
                    ✏️
                  </button>
                </div>
              )}
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
          <div className="flex-1">
            {isEditingName ? (
              <div className="flex items-center gap-2 mb-2">
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleSaveName();
                    } else if (e.key === 'Escape') {
                      handleCancelEditName();
                    }
                  }}
                  className="text-2xl font-bold px-2 py-1 bg-gray-700 text-white border border-gray-600 rounded focus:outline-none focus:border-blue-500"
                  autoFocus
                  disabled={isSavingName}
                />
                <button
                  onClick={handleSaveName}
                  disabled={isSavingName}
                  className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                >
                  {isSavingName ? 'Saving...' : 'Save'}
                </button>
                <button
                  onClick={handleCancelEditName}
                  disabled={isSavingName}
                  className="px-3 py-1 bg-gray-600 text-white rounded hover:bg-gray-500 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2 mb-2">
                <h2 className="text-2xl font-bold text-white">{getAccountName()}</h2>
                <button
                  onClick={handleStartEditName}
                  className="text-gray-400 hover:text-white text-lg"
                  title="Rename account"
                >
                  ✏️
                </button>
              </div>
            )}
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
            Categories ({categoryTotals.income.length + categoryTotals.expense.length})
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
            <div className="space-y-6">
              <h3 className="text-lg font-semibold text-white mb-4">Transaction Categories</h3>
              {categoryTotals.grandTotal > 0 ? (
                <>
                  {/* Income/Payments Section */}
                  {categoryTotals.income.length > 0 && (
                    <div className="space-y-4">
                      <h4 className="text-md font-semibold text-white">
                        {isCashAccount ? 'Income Categories' : 'Debt Payments'}
                      </h4>
                      <div className="bg-gray-700 rounded-lg p-6 border border-gray-600">
                        <ResponsiveContainer width="100%" height={Math.min(300, categoryTotals.income.length * 40)}>
                          <BarChart
                            data={categoryTotals.income}
                            layout="vertical"
                            margin={{ top: 5, right: 30, left: 150, bottom: 5 }}
                          >
                            <CartesianGrid strokeDasharray="3 3" stroke="#D6DBD1" />
                            <XAxis
                              type="number"
                              stroke="#66736B"
                              style={{ fontSize: '12px' }}
                              tickFormatter={formatCurrency}
                            />
                            <YAxis
                              type="category"
                              dataKey="shortenedCategory"
                              stroke="#66736B"
                              style={{ fontSize: '12px' }}
                              width={140}
                            />
                            <Tooltip
                              formatter={(value: number, name: string, props: { payload?: { percentage: number; shortenedCategory: string } }) => {
                                if (!props.payload) return [`${formatCurrency(value)}`, name];
                                return [
                                  `${formatCurrency(value)} (${props.payload.percentage.toFixed(1)}%)`,
                                  props.payload.shortenedCategory
                                ];
                              }}
                              labelFormatter={() => ''}
                              contentStyle={{
                                backgroundColor: '#102319',
                                border: '1px solid #486657',
                                borderRadius: '8px',
                                color: '#fff',
                                fontSize: '12px',
                                padding: '8px'
                              }}
                              itemStyle={{ color: '#fff', fontSize: '12px' }}
                              labelStyle={{ color: '#fff', fontSize: '12px' }}
                            />
                            <Bar
                              dataKey="total"
                              fill={isCashAccount ? '#397052' : '#486657'}
                              background={{ fill: '#e3e7de' }}
                              radius={[0, 4, 4, 0]}
                              onClick={(data) => {
                                if (data && data.fullCategory) {
                                  setSelectedCategory(data.fullCategory);
                                }
                              }}
                              style={{ cursor: 'pointer' }}
                            />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                      {/* Income/Payments Details List */}
                      <div className="space-y-2">
                        {categoryTotals.income.map((cat, index) => (
                          <button
                            key={cat.category}
                            onClick={() => setSelectedCategory(cat.fullCategory)}
                            className="w-full bg-gray-700 rounded-lg p-4 border border-gray-600 hover:bg-gray-600 transition-colors text-left"
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3 flex-1">
                                <div className="w-4 h-4 rounded" style={{ backgroundColor: getCategoryColor(cat.type, index) }} />
                                <div className="flex-1">
                                  <div className="font-medium text-white">{cat.shortenedCategory}</div>
                                  <div className="text-sm text-gray-400">{cat.count} transactions</div>
                                </div>
                              </div>
                              <div className="text-right">
                                <div className="font-semibold text-white text-lg">
                                  {formatCurrency(cat.total)}
                                </div>
                                <div className="text-sm text-gray-400">
                                  {cat.percentage.toFixed(1)}%
                                </div>
                              </div>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Expense/Additional Debt Section */}
                  {categoryTotals.expense.length > 0 && (
                    <div className="space-y-4">
                      <h4 className="text-md font-semibold text-white">
                        {isCashAccount ? 'Expense Categories' : 'Additional Debt'}
                      </h4>
                      <div className="bg-gray-700 rounded-lg p-6 border border-gray-600">
                        <ResponsiveContainer width="100%" height={Math.min(300, categoryTotals.expense.length * 40)}>
                          <BarChart
                            data={categoryTotals.expense}
                            layout="vertical"
                            margin={{ top: 5, right: 30, left: 150, bottom: 5 }}
                          >
                            <CartesianGrid strokeDasharray="3 3" stroke="#D6DBD1" />
                            <XAxis
                              type="number"
                              stroke="#66736B"
                              style={{ fontSize: '12px' }}
                              tickFormatter={formatCurrency}
                            />
                            <YAxis
                              type="category"
                              dataKey="shortenedCategory"
                              stroke="#66736B"
                              style={{ fontSize: '12px' }}
                              width={140}
                            />
                            <Tooltip
                              formatter={(value: number, name: string, props: { payload?: { percentage: number; shortenedCategory: string } }) => {
                                if (!props.payload) return [`${formatCurrency(value)}`, name];
                                return [
                                  `${formatCurrency(value)} (${props.payload.percentage.toFixed(1)}%)`,
                                  props.payload.shortenedCategory
                                ];
                              }}
                              labelFormatter={() => ''}
                              contentStyle={{
                                backgroundColor: '#102319',
                                border: '1px solid #486657',
                                borderRadius: '8px',
                                color: '#fff',
                                fontSize: '12px',
                                padding: '8px'
                              }}
                              itemStyle={{ color: '#fff', fontSize: '12px' }}
                              labelStyle={{ color: '#fff', fontSize: '12px' }}
                            />
                            <Bar
                              dataKey="total"
                              fill={isCashAccount ? '#9B5B50' : '#66758A'}
                              background={{ fill: '#e3e7de' }}
                              radius={[0, 4, 4, 0]}
                              onClick={(data) => {
                                if (data && data.fullCategory) {
                                  setSelectedCategory(data.fullCategory);
                                }
                              }}
                              style={{ cursor: 'pointer' }}
                            />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                      {/* Expense/Additional Debt Details List */}
                      <div className="space-y-2">
                        {categoryTotals.expense.map((cat, index) => (
                          <button
                            key={cat.category}
                            onClick={() => setSelectedCategory(cat.fullCategory)}
                            className="w-full bg-gray-700 rounded-lg p-4 border border-gray-600 hover:bg-gray-600 transition-colors text-left"
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3 flex-1">
                                <div className="w-4 h-4 rounded" style={{ backgroundColor: getCategoryColor(cat.type, index) }} />
                                <div className="flex-1">
                                  <div className="font-medium text-white">{cat.shortenedCategory}</div>
                                  <div className="text-sm text-gray-400">{cat.count} transactions</div>
                                </div>
                              </div>
                              <div className="text-right">
                                <div className="font-semibold text-white text-lg">
                                  {formatCurrency(cat.total)}
                                </div>
                                <div className="text-sm text-gray-400">
                                  {cat.percentage.toFixed(1)}%
                                </div>
                              </div>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </>
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
