"use client";
import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

interface Account {
  id: string;
  name: string;
  type: string;
  subtype: string;
  balance: {
    current: number;
    available: number;
    limit?: number;
    iso_currency_code: string;
  };
}

interface SnapTradeAccount {
  id: string;
  name: string;
  type: string;
  institution: string;
  balance: number;
  accountNumber: string;
  syncStatus: string;
}

interface InvestmentData {
  portfolio: {
    totalValue: number;
    assetAllocation: Array<{
      type: string;
      value: number;
      percentage: number;
    }>;
    holdingCount: number;
    securityCount: number;
  };
}

interface FinancialSummaryData {
  financialOverview: {
    netWorth: number;
    totalCash: number;
    totalInvestments: number;
    totalDebt: number;
    homeValue: number | null;
  };
  investmentPortfolio: {
    totalValue: number;
    holdingsCount: number;
    assetAllocation: Array<{
      type: string;
      value: number;
      percentage: number;
    }>;
    securityCount: number;
  };
  lastUpdated: string;
}

interface FinancialOverviewProps {
  isDemo?: boolean;
}

interface HomeData {
  address: string;
  value: number;
  valueLow: number;
  valueHigh: number;
  lastUpdated: string;
}

export default function FinancialOverview({ isDemo = false }: FinancialOverviewProps) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [snapTradeAccounts, setSnapTradeAccounts] = useState<SnapTradeAccount[]>([]);
  const [investmentData, setInvestmentData] = useState<InvestmentData | null>(null);
  const [homeData, setHomeData] = useState<HomeData | null>(null);
  const [financialSummary, setFinancialSummary] = useState<FinancialSummaryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const router = useRouter();

  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

  useEffect(() => {
    const loadFinancialData = async () => {
      try {
        setLoading(true);
        setError('');

        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
        };

        if (isDemo) {
          headers['x-demo-mode'] = 'true';
        } else {
          const token = localStorage.getItem('auth_token');
          if (token) {
            headers['Authorization'] = `Bearer ${token}`;
          } else {
            // No token means user is not authenticated
            setLoading(false);
            return;
          }
        }

        // Load financial summary from new endpoint (includes overview and portfolio)
        if (!isDemo) {
          try {
            const summaryRes = await fetch(`${API_URL}/api/summaries`, {
              headers,
            });

            if (summaryRes.ok) {
              const summaryData: FinancialSummaryData = await summaryRes.json();
              
              // Extract financial overview data
              if (summaryData.financialOverview) {
                // Set home data from summary
                if (summaryData.financialOverview.homeValue !== null && summaryData.financialOverview.homeValue !== undefined) {
                  setHomeData({
                    address: '',
                    value: summaryData.financialOverview.homeValue,
                    valueLow: summaryData.financialOverview.homeValue * 0.9,
                    valueHigh: summaryData.financialOverview.homeValue * 1.1,
                    lastUpdated: summaryData.lastUpdated || new Date().toISOString()
                  });
                }
              }
              
              // Extract investment portfolio data
              if (summaryData.investmentPortfolio) {
                setInvestmentData({
                  portfolio: {
                    totalValue: summaryData.investmentPortfolio.totalValue,
                    assetAllocation: summaryData.investmentPortfolio.assetAllocation,
                    holdingCount: summaryData.investmentPortfolio.holdingsCount,
                    securityCount: summaryData.investmentPortfolio.securityCount
                  }
                });
              }
              
              // ✅ Store summary data for use in calculateTotals
              setFinancialSummary(summaryData);
            } else {
              const errorText = await summaryRes.text();
              console.error('Failed to load financial summary:', summaryRes.status, errorText);
              setFinancialSummary(null);
            }
          } catch (summaryError) {
            console.error('Error loading financial summary:', summaryError);
            setFinancialSummary(null);
          }
        }

        // Still load accounts separately for display (needed for account list)
        const accountsRes = await fetch(`${API_URL}/plaid/all-accounts`, {
          headers,
        });

        if (accountsRes.ok) {
          const accountsData = await accountsRes.json();
          const accounts = accountsData.accounts || [];
          console.log(`📊 Received ${accounts.length} accounts from backend`);
          setAccounts(accounts);
        } else {
          console.error('Failed to load Plaid accounts:', accountsRes.status);
          setAccounts([]);
        }

        // Load SnapTrade accounts (only for authenticated users, not demo)
        if (!isDemo) {
          try {
            const snapTradeRes = await fetch(`${API_URL}/snaptrade/accounts`, {
              headers,
            });

            if (snapTradeRes.ok) {
              const snapTradeData = await snapTradeRes.json();
              if (snapTradeData.success && snapTradeData.data?.accounts) {
                const snapTradeAccounts = snapTradeData.data.accounts;
                console.log(`📊 Received ${snapTradeAccounts.length} SnapTrade accounts from backend`);
                setSnapTradeAccounts(snapTradeAccounts);
              }
            }
          } catch (snapTradeError) {
            console.log('Error loading SnapTrade accounts:', snapTradeError);
          }
        }
      } catch (error) {
        console.error('Error loading financial data:', error);
        setError('Failed to load financial data');
        setAccounts([]);
      } finally {
        setLoading(false);
      }
    };

    loadFinancialData();
  }, [API_URL, isDemo]);

  // Calculate totals
  const calculateTotals = () => {
    // ✅ FIRST: Try to use summary data if available (most accurate)
    if (financialSummary?.financialOverview) {
      console.log('✅ Using financial summary data from backend');
      return {
        totalCash: financialSummary.financialOverview.totalCash || 0,
        totalDebt: financialSummary.financialOverview.totalDebt || 0,
        totalInvestments: financialSummary.financialOverview.totalInvestments || 0,
        totalHomeValue: financialSummary.financialOverview.homeValue || 0,
        uncategorizedAccounts: 0
      };
    }

    // Fallback: Calculate from accounts (but avoid double-counting)
    let totalCash = 0;
    let totalDebt = 0;
    let totalInvestments = 0;
    let uncategorizedAccounts = 0;

    console.log('⚠️ Calculating totals from accounts (summary endpoint failed or unavailable)');
    console.log('Plaid accounts:', accounts.length);
    console.log('SnapTrade accounts:', snapTradeAccounts.length);

    // ✅ Trust backend - accounts from /plaid/all-accounts are already deduplicated by FinancialDataService
    // No need for client-side deduplication

    // Process Plaid accounts (EXCLUDE investment accounts - they're counted via holdings)
    accounts.forEach(account => {
      let balance;
      if (account.type === 'depository' || 
          account.subtype === 'checking' || 
          account.subtype === 'savings' || 
          account.subtype === 'cd' ||
          account.subtype === 'money market' ||
          account.subtype === 'prepaid') {
        balance = account.balance?.available !== undefined && account.balance?.available !== null 
          ? account.balance.available 
          : account.balance?.current || 0;
      } else if (account.type === 'credit') {
        balance = account.balance?.current || 0;
      } else if (account.type === 'loan') {
        balance = account.balance?.current || 0;
      } else {
        balance = account.balance?.current || 0;
      }
      
      const accountType = account.type;
      const accountSubtype = account.subtype;
      
      // ✅ IMPORTANT: Skip investment accounts - they're counted via holdings, not balances
      if (accountType === 'investment' || 
          accountSubtype === '401k' || 
          accountSubtype === 'ira' || 
          accountSubtype === 'roth' || 
          accountSubtype === 'brokerage' || 
          accountSubtype === 'hsa' || 
          accountSubtype === '529' ||
          accountSubtype === 'pension' ||
          accountSubtype === 'annuity') {
        // Investment accounts are NOT counted here - use holdings data instead
        return;
      }
      
      if (accountType === 'depository' || 
          accountSubtype === 'checking' || 
          accountSubtype === 'savings' || 
          accountSubtype === 'cd' ||
          accountSubtype === 'money market' ||
          accountSubtype === 'prepaid') {
        totalCash += Math.max(0, balance);
      } else if (accountType === 'credit') {
        totalDebt += Math.abs(balance);
      } else if (accountType === 'loan' || 
                 accountSubtype === 'mortgage' || 
                 accountSubtype === 'student' || 
                 accountSubtype === 'personal' ||
                 accountSubtype === 'auto' ||
                 accountSubtype === 'home equity') {
        totalDebt += Math.max(0, balance);
      } else {
        if (balance > 0) {
          totalCash += balance;
        } else if (balance < 0) {
          totalDebt += Math.abs(balance);
        }
        uncategorizedAccounts++;
      }
    });

    // ✅ Use investment portfolio value from holdings (not account balances)
    // This avoids double-counting investment account balances AND holdings
    if (investmentData?.portfolio?.totalValue) {
      console.log('✅ Using investment portfolio value from holdings:', investmentData.portfolio.totalValue);
      totalInvestments = investmentData.portfolio.totalValue;
    } else {
      // Fallback: Only count SnapTrade balances if we don't have holdings data
      // But this should rarely happen since holdings are fetched separately
      console.warn('⚠️ No investment holdings data available, using SnapTrade balances as fallback');
      snapTradeAccounts.forEach(account => {
        const balance = account.balance || 0;
        totalInvestments += Math.max(0, balance);
      });
    }

    // Add home value if available
    let totalHomeValue = 0;
    if (homeData?.value) {
      totalHomeValue = homeData.value;
    }

    console.log('Final totals - totalCash:', totalCash, 'totalDebt:', totalDebt, 'totalInvestments:', totalInvestments, 'totalHomeValue:', totalHomeValue);
    return { totalCash, totalDebt, totalInvestments, totalHomeValue, uncategorizedAccounts };
  };

  const { totalCash, totalDebt, totalInvestments, totalHomeValue, uncategorizedAccounts } = calculateTotals();
  const hasAccounts = accounts.length > 0 || snapTradeAccounts.length > 0;

  // ✅ Trust backend - FinancialDataService should have already deduplicated accounts
  // Only deduplicate here if backend bug causes duplicates (should not happen)
  const deduplicatedAccounts = React.useMemo(() => {
    const accountMap = new Map<string, Account>();
    accounts.forEach(account => {
      const accountId = account.id;
      if (accountMap.has(accountId)) {
        console.warn(`⚠️ Frontend: Backend returned duplicate account: ${accountId} (${account.name})`);
      }
      accountMap.set(accountId, account);
    });
    const unique = Array.from(accountMap.values());
    if (unique.length !== accounts.length) {
      console.error(`❌ Frontend: Backend returned ${accounts.length} accounts but only ${unique.length} are unique!`);
    }
    return unique;
  }, [accounts]);

  const deduplicatedSnapTradeAccounts = React.useMemo(() => {
    const accountMap = new Map<string, SnapTradeAccount>();
    snapTradeAccounts.forEach(account => {
      // ✅ FIX: Use accountNumber (not number) as fallback - matches SnapTradeAccount interface
      const accountId = account.id || account.accountNumber;
      if (accountId) {
        if (accountMap.has(accountId)) {
          console.warn(`⚠️ Frontend: Backend returned duplicate SnapTrade account: ${accountId}`);
        }
        accountMap.set(accountId, account);
      }
    });
    return Array.from(accountMap.values());
  }, [snapTradeAccounts]);

  // Use deduplicated counts for display (should match accounts.length if backend is correct)
  const totalAccountCount = deduplicatedAccounts.length + deduplicatedSnapTradeAccounts.length;

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const handleAddAccounts = () => {
    // Set a flag in localStorage to indicate user wants to connect accounts
    localStorage.setItem('wants_to_connect_accounts', 'true');
    router.push('/profile');
  };

  if (loading) {
    return (
      <div className="bg-gray-800 border border-gray-700 rounded-lg p-4 mb-6">
        <div className="animate-pulse">
          <div className="h-4 bg-gray-700 rounded w-1/3 mb-3"></div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="h-16 bg-gray-700 rounded"></div>
            <div className="h-16 bg-gray-700 rounded"></div>
            <div className="h-16 bg-gray-700 rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  if (!hasAccounts && !isDemo) {
    return (
      <div className="bg-blue-900 border border-blue-700 rounded-lg p-4 mb-6">
        <div className="text-center">
          <h3 className="text-lg font-semibold text-blue-100 mb-2">
            Your Financial Overview
          </h3>
          <p className="text-blue-200 text-sm mb-4">
            Add your accounts to start seeing your financial overview
          </p>
          <button
            onClick={handleAddAccounts}
            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-md text-sm font-medium transition-colors"
          >
            Add Your Accounts
          </button>
        </div>
      </div>
    );
  }

  // Calculate Net Worth
  const netWorth = totalCash + totalInvestments + totalHomeValue - totalDebt;

  return (
    <div className="bg-blue-900 border border-blue-700 rounded-lg p-3 mb-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center space-x-2">
          <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse"></div>
          <h3 className="text-base font-semibold text-blue-100">Your Financial Overview</h3>
        </div>
        
        {/* Add More Accounts link - only show when user has accounts */}
        {hasAccounts && (
          <button
            onClick={handleAddAccounts}
            className="text-blue-300 hover:text-blue-200 text-sm transition-colors underline decoration-blue-400/30 hover:decoration-blue-400/60"
          >
            Add More Accounts
          </button>
        )}
      </div>
      
      {/* Net Worth - Featured Card */}
      <div className="bg-gradient-to-br from-blue-700 to-blue-800 rounded-lg p-4 mb-3 border border-blue-600">
        <div className="text-blue-300 text-xs font-medium mb-1">Net Worth</div>
        <div className="text-white font-bold text-2xl">
          {formatCurrency(netWorth)}
        </div>
      </div>
      
      {/* Financial Metrics Row */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-2 mb-3">
        <div className="bg-blue-800 rounded p-2.5">
          <div className="text-blue-300 text-xs mb-1">Total Cash</div>
          <div className="text-white font-medium text-base">
            {formatCurrency(totalCash)}
          </div>
        </div>
        
        <div className="bg-blue-800 rounded p-2.5">
          <div className="text-blue-300 text-xs mb-1">Total Debt</div>
          <div className="text-white font-medium text-base">
            {formatCurrency(totalDebt)}
          </div>
        </div>
        
        <div className="bg-blue-800 rounded p-2.5">
          <div className="text-blue-300 text-xs mb-1">Total Investments</div>
          <div className="text-white font-medium text-base">
            {formatCurrency(totalInvestments)}
          </div>
        </div>

        <div className="bg-blue-800 rounded p-2.5">
          <div className="text-blue-300 text-xs mb-1">Home Value</div>
          <div className="text-white font-medium text-base">
            {totalHomeValue > 0 ? formatCurrency(totalHomeValue) : '$0'}
          </div>
          {homeData && (
            <div className="text-blue-400 text-xs mt-0.5" title={`Range: ${formatCurrency(homeData.valueLow)} - ${formatCurrency(homeData.valueHigh)}`}>
              Range: {formatCurrency(homeData.valueLow)} - {formatCurrency(homeData.valueHigh)}
            </div>
          )}
        </div>
      </div>

      {/* Account Statistics Row */}
      {hasAccounts && (
        <div className="grid grid-cols-3 md:grid-cols-3 gap-2">
          <div className="bg-blue-800 rounded p-2.5">
            <div className="text-blue-300 text-xs mb-1">Accounts</div>
            <div className="text-white font-medium text-base">{totalAccountCount}</div>
          </div>
          
          {investmentData?.portfolio && (
            <>
              <div className="bg-blue-800 rounded p-2.5">
                <div className="text-blue-300 text-xs mb-1">Holdings</div>
                <div className="text-white font-medium text-base">{investmentData.portfolio.holdingCount}</div>
              </div>
              <div className="bg-blue-800 rounded p-2.5">
                <div className="text-blue-300 text-xs mb-1">Securities</div>
                <div className="text-white font-medium text-base">{investmentData.portfolio.securityCount}</div>
              </div>
            </>
          )}
          
          {/* Show uncategorized accounts count if any exist */}
          {uncategorizedAccounts > 0 && (
            <div className="bg-yellow-800 rounded p-2.5">
              <div className="text-yellow-300 text-xs mb-1">Uncategorized</div>
              <div className="text-white font-medium text-base">{uncategorizedAccounts}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
