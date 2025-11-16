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
              
              // ✅ Fetch actual holdings to calculate accurate counts
              type InvestmentHolding = {
                account_id: string;
                security_id: string;
                institution_value?: number;
                value?: number;
              };
              let actualHoldings: InvestmentHolding[] = [];
              try {
                const investmentsRes = await fetch(`${API_URL}/plaid/investments`, {
                  headers,
                });
                
                if (investmentsRes.ok) {
                  const investmentsData = await investmentsRes.json();
                  console.log('📊 FinancialOverview: Investments endpoint response structure:', {
                    hasHoldings: !!investmentsData.holdings,
                    hasAllHoldings: !!investmentsData.allHoldings,
                    holdingsType: Array.isArray(investmentsData.holdings) ? 'array' : typeof investmentsData.holdings,
                    keys: Object.keys(investmentsData)
                  });
                  
                  // Handle response format: holdings is an array of objects, each with a holdings property
                  if (investmentsData.holdings && Array.isArray(investmentsData.holdings)) {
                    // Check if holdings[0] has a holdings property (nested structure)
                    if (investmentsData.holdings.length > 0 && investmentsData.holdings[0]?.holdings) {
                      // Nested format: array of account holdings, each with holdings array
                      actualHoldings = investmentsData.holdings.flatMap(
                        (h: { holdings?: InvestmentHolding[] }) => h.holdings || []
                      );
                      console.log(`📊 FinancialOverview: Parsed ${investmentsData.holdings.length} account holdings into ${actualHoldings.length} total holdings`);
                    } else {
                      // Flat format: direct array of holdings
                      actualHoldings = investmentsData.holdings as InvestmentHolding[];
                    }
                  } else if (investmentsData.allHoldings && Array.isArray(investmentsData.allHoldings)) {
                    // Alternative format: allHoldings array
                    actualHoldings = investmentsData.allHoldings.flatMap(
                      (h: { holdings?: InvestmentHolding[] }) => h.holdings || []
                    );
                  }
                  
                  // If holdings still empty, fall back to combinedPortfolio/summary from backend response
                  if ((!actualHoldings || actualHoldings.length === 0) && investmentsData.combinedPortfolio) {
                    console.log('📊 FinancialOverview: Using combinedPortfolio fallback from backend');
                    setInvestmentData({
                      portfolio: {
                        totalValue: investmentsData.combinedPortfolio.totalValue || 0,
                        assetAllocation: investmentsData.combinedPortfolio.assetAllocation || [],
                        holdingCount: (investmentsData.summary?.totalHoldings as number) || 0,
                        securityCount: (investmentsData.summary?.totalSecurities as number) || 0
                      }
                    });
                  }
                  
                  console.log(`📊 FinancialOverview: Loaded ${actualHoldings.length} holdings from investments endpoint`);
                }
              } catch (investmentsError) {
                console.warn('FinancialOverview: Failed to load holdings, using summary data only:', investmentsError);
              }
              
              // ✅ Calculate counts from actual holdings array instead of trusting cached summary
              const actualHoldingCount = actualHoldings.length;
              const actualSecurityCount = new Set(
                actualHoldings.map((h: InvestmentHolding) => h.security_id)
              ).size;
              const actualTotalValue = actualHoldings.length > 0 
                ? actualHoldings.reduce((sum: number, h: InvestmentHolding) => {
                    return sum + (h.institution_value ?? h.value ?? 0);
                  }, 0)
                : summaryData.investmentPortfolio?.totalValue || 0;
              
              // Extract investment portfolio data - use actual counts if available
              if (summaryData.investmentPortfolio) {
                setInvestmentData({
                  portfolio: {
                    totalValue: actualTotalValue > 0 ? actualTotalValue : summaryData.investmentPortfolio.totalValue,
                    assetAllocation: summaryData.investmentPortfolio.assetAllocation,
                    holdingCount: actualHoldingCount > 0 ? actualHoldingCount : (summaryData.investmentPortfolio.holdingsCount || 0),
                    securityCount: actualSecurityCount > 0 ? actualSecurityCount : (summaryData.investmentPortfolio.securityCount || 0)
                  }
                });
                
                console.log('📊 FinancialOverview: Investment portfolio data set:', {
                  totalValue: actualTotalValue > 0 ? actualTotalValue : summaryData.investmentPortfolio.totalValue,
                  holdingCount: actualHoldingCount > 0 ? actualHoldingCount : summaryData.investmentPortfolio.holdingsCount,
                  securityCount: actualSecurityCount > 0 ? actualSecurityCount : summaryData.investmentPortfolio.securityCount,
                  holdingsFromAPI: actualHoldings.length,
                  holdingsFromSummary: summaryData.investmentPortfolio.holdingsCount
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
    // Compute derived totals from local data for robustness
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
    
    // Prefer backend summary when it provides non-zero values, but backfill from derived data if missing
    if (financialSummary?.financialOverview) {
      const derived = deriveFromAccounts();
      const s = financialSummary.financialOverview;
      console.log('✅ Using financial summary with derived backfill where needed', { summary: s, derived });
      return {
        totalCash: s.totalCash && s.totalCash > 0 ? s.totalCash : derived.totalCash,
        totalDebt: s.totalDebt && s.totalDebt > 0 ? s.totalDebt : derived.totalDebt,
        totalInvestments: s.totalInvestments && s.totalInvestments > 0 ? s.totalInvestments : derived.totalInvestments,
        totalHomeValue: (s.homeValue ?? 0) > 0 ? (s.homeValue as number) : derived.totalHomeValue,
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
