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
  const [_error, setError] = useState('');
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

        // Load single-source snapshot (summary view)
        try {
          const res = await fetch(`${API_URL}/api/summaries?view=summary`, { headers });
          if (res.ok) {
            const snapshot = await res.json();
            // Map snapshot to local state types
            const finOverview = snapshot.financialOverview;
            const portfolio = snapshot.investmentPortfolio;
            const computedAt = snapshot.computedAt || new Date().toISOString();
            setFinancialSummary({
              financialOverview: finOverview,
              investmentPortfolio: portfolio,
              lastUpdated: computedAt,
            } as unknown as FinancialSummaryData);
            setInvestmentData({ portfolio });
            if (finOverview?.homeValue && finOverview.homeValue > 0) {
              setHomeData({
                address: '',
                value: finOverview.homeValue,
                valueLow: finOverview.homeValue * 0.9,
                valueHigh: finOverview.homeValue * 1.1,
                lastUpdated: computedAt
              });
            } else {
              // Fallback: Try to load home data from profile endpoint if snapshot doesn't have it
              setHomeData(null);
              if (!isDemo) {
                try {
                  const homeRes = await fetch(`${API_URL}/profile/home`, { headers });
                  if (homeRes.ok) {
                    const homeDataResponse = await homeRes.json();
                    if (homeDataResponse.hasHome && homeDataResponse.homeData?.value) {
                      setHomeData({
                        address: homeDataResponse.homeData.address || '',
                        value: homeDataResponse.homeData.value,
                        valueLow: homeDataResponse.homeData.valueLow || homeDataResponse.homeData.value * 0.9,
                        valueHigh: homeDataResponse.homeData.valueHigh || homeDataResponse.homeData.value * 1.1,
                        lastUpdated: homeDataResponse.homeData.lastUpdated || computedAt
                      });
                      console.log(`🏠 Loaded home value from /profile/home endpoint: $${homeDataResponse.homeData.value}`);
                    }
                  }
                } catch (homeError) {
                  console.log('Error loading home data from /profile/home:', homeError);
                }
              }
            }
          } else {
            setFinancialSummary(null);
          }
        } catch (e) {
          setFinancialSummary(null);
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

          // Load manual accounts
          try {
            const manualAccountsRes = await fetch(`${API_URL}/api/manual-accounts`, {
              headers,
            });

            if (manualAccountsRes.ok) {
              const manualAccountsData = await manualAccountsRes.json();
              if (manualAccountsData.success && manualAccountsData.data) {
                console.log(`📊 Received ${manualAccountsData.data.length} manual accounts from backend`);
                // Manual accounts are already included in the snapshot from backend
                // But we can store them for display if needed
              }
            }
          } catch (manualAccountsError) {
            console.log('Error loading manual accounts:', manualAccountsError);
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
    // Compute derived totals from snapshot-first data
    const deriveFromAccounts = () => {
      let totalCash = 0;
      let totalDebt = 0;
      let uncategorizedAccounts = 0;
      
      accounts.forEach(account => {
        let balance: number;
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
        
        const t = account.type;
        const st = account.subtype;
        // Skip investment-like accounts here
        if (t === 'investment' ||
            st === '401k' || st === 'ira' || st === 'roth' ||
            st === 'brokerage' || st === 'hsa' || st === '529' ||
            st === 'pension' || st === 'annuity') {
          return;
        }
        
        if (t === 'depository' || st === 'checking' || st === 'savings' || st === 'cd' ||
            st === 'money market' || st === 'prepaid') {
          totalCash += Math.max(0, balance);
        } else if (t === 'credit') {
          totalDebt += Math.abs(balance);
        } else if (t === 'loan' || st === 'mortgage' || st === 'student' || st === 'personal' ||
                   st === 'auto' || st === 'home equity') {
          totalDebt += Math.max(0, balance);
        } else {
          if (balance > 0) totalCash += balance;
          else if (balance < 0) totalDebt += Math.abs(balance);
          uncategorizedAccounts++;
        }
      });
      
      const totalInvestments = investmentData?.portfolio?.totalValue || 0;
      const totalHomeValue = homeData?.value || 0;
      return { totalCash, totalDebt, totalInvestments, totalHomeValue, uncategorizedAccounts };
    };
    
    // Prefer snapshot (financialSummary) values, backfill from derived accounts if missing
    if (financialSummary?.financialOverview) {
      const derived = deriveFromAccounts();
      const s = financialSummary.financialOverview;
      console.log('✅ Using financial summary with derived backfill where needed', { summary: s, derived });
      return {
        totalCash: s.totalCash && s.totalCash > 0 ? s.totalCash : derived.totalCash,
        totalDebt: s.totalDebt && s.totalDebt > 0 ? s.totalDebt : derived.totalDebt,
        totalInvestments: s.totalInvestments && s.totalInvestments > 0 ? s.totalInvestments : derived.totalInvestments,
        // Use snapshot homeValue if available (backend-calculated), otherwise fall back to derived
        // This ensures consistency with backend net worth calculation
        totalHomeValue: s.homeValue != null && s.homeValue > 0 ? s.homeValue : (derived.totalHomeValue || 0),
        uncategorizedAccounts: derived.uncategorizedAccounts
      };
    }

    // Fallback: derive entirely from accounts/holdings if no summary
    const derived = deriveFromAccounts();
    console.log('⚠️ Calculating totals from accounts (summary endpoint failed or unavailable)', derived);
    return derived;
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

  const handleOverviewClick = () => {
    if (!isDemo) {
      router.push('/finances');
    }
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
      <div 
        className="bg-blue-900 border-2 border-blue-700 rounded-lg p-4 mb-6 cursor-pointer hover:bg-blue-800 hover:border-blue-500 hover:shadow-lg hover:shadow-blue-900/50 transition-all duration-200"
        onClick={handleOverviewClick}
        title="Click to view full financial dashboard"
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleOverviewClick();
          }
        }}
      >
        <div className="text-center">
          <h3 className="text-lg font-semibold text-blue-100 mb-2">
            Your Financial Overview
          </h3>
          <p className="text-blue-200 text-sm mb-4">
            Add your accounts to start seeing your financial overview
          </p>
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleAddAccounts();
            }}
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
    <div 
      className="bg-blue-900 border-2 border-blue-700 rounded-lg p-3 mb-4 cursor-pointer hover:bg-blue-800 hover:border-blue-500 hover:shadow-lg hover:shadow-blue-900/50 transition-all duration-200"
      onClick={handleOverviewClick}
      title="Click to view full financial dashboard"
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleOverviewClick();
        }
      }}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center space-x-2">
          <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse"></div>
          <h3 className="text-base font-semibold text-blue-100">Your Financial Overview</h3>
        </div>
        
        {/* Add More Accounts link - only show when user has accounts */}
        {hasAccounts && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleAddAccounts();
            }}
            className="text-blue-300 hover:text-blue-200 text-sm transition-colors underline decoration-blue-400/30 hover:decoration-blue-400/60"
            title="Add more accounts"
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
