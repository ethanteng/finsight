"use client";
import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, ChevronUp } from 'lucide-react';
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
  asOf?: string | null;
  status?: 'current' | 'stale' | 'partial' | 'unavailable' | null;
  financialOverview: {
    netWorth: number;
    totalCash: number;
    totalInvestments: number;
    totalDebt: number;
    homeValue: number | null;
  };
  investmentPortfolio: {
    totalValue: number;
    holdingCount: number;
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
  tier?: string;
}

interface HomeData {
  address: string;
  value: number;
  valueLow: number;
  valueHigh: number;
  lastUpdated: string;
}

export default function FinancialOverview({ tier }: FinancialOverviewProps) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [snapTradeAccounts, setSnapTradeAccounts] = useState<SnapTradeAccount[]>([]);
  const [mobileExpanded, setMobileExpanded] = useState(false);
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

        const token = localStorage.getItem('auth_token');
        if (token) {
          headers['Authorization'] = `Bearer ${token}`;
        } else {
          setLoading(false);
          return;
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
              asOf: snapshot.asOf,
              status: snapshot.status,
              financialOverview: finOverview,
              investmentPortfolio: portfolio,
              lastUpdated: computedAt,
            } as unknown as FinancialSummaryData);
            setInvestmentData({ portfolio });
            // Only display a range when the provider supplied both bounds. The
            // canonical midpoint remains the authoritative overview value.
            let profileHomeData: { address: string; value: number; valueLow: number; valueHigh: number; lastUpdated: string } | null = null;
            try {
                const homeRes = await fetch(`${API_URL}/profile/home`, { headers });
                if (homeRes.ok) {
                  const homeDataResponse = await homeRes.json();
                  if (homeDataResponse.hasHome && homeDataResponse.homeData?.value != null) {
                    const hd = homeDataResponse.homeData;
                    if (typeof hd.valueLow === 'number' && typeof hd.valueHigh === 'number') {
                      profileHomeData = {
                        address: hd.address || '',
                        value: hd.value,
                        valueLow: hd.valueLow,
                        valueHigh: hd.valueHigh,
                        lastUpdated: hd.lastUpdated || computedAt
                      };
                    }
                  }
                }
            } catch (homeError) {
              console.log('Error loading home data from /profile/home:', homeError);
            }
            if (profileHomeData) {
              setHomeData(profileHomeData);
            } else {
              setHomeData(null);
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

        // Load SnapTrade accounts.
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
      } catch (error) {
        console.error('Error loading financial data:', error);
        setError('Failed to load financial data');
        setAccounts([]);
      } finally {
        setLoading(false);
      }
    };

    loadFinancialData();
  }, [API_URL]);

  // Canonical metrics come only from the backend snapshot. A known zero remains
  // zero; unavailable values are not reconstructed from raw account arrays.
  const overview = financialSummary?.financialOverview;
  const totalCash = overview?.totalCash ?? null;
  const totalDebt = overview?.totalDebt ?? null;
  const totalInvestments = overview?.totalInvestments ?? null;
  const totalHomeValue = overview?.homeValue ?? null;
  const netWorth = overview?.netWorth ?? null;
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

  const formatMetric = (value: number | null) =>
    value === null ? 'Unavailable' : formatCurrency(value);

  const handleAddAccounts = () => {
    // Set a flag in localStorage to indicate user wants to connect accounts
    localStorage.setItem('wants_to_connect_accounts', 'true');
    router.push('/profile');
  };

  const handleOverviewClick = () => {
    router.push('/finances');
  };

  if (loading) {
    return (
      <div className="rounded-[22px] border border-[#102319]/10 bg-[#fffdf5] p-5 shadow-[0_16px_40px_rgba(18,60,47,.06)]">
        <div className="animate-pulse">
          <div className="mb-3 h-4 w-1/3 rounded bg-[#dfe6d4]"></div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="h-16 rounded-xl bg-[#f1ede4]"></div>
            <div className="h-16 rounded-xl bg-[#f1ede4]"></div>
            <div className="h-16 rounded-xl bg-[#f1ede4]"></div>
          </div>
        </div>
      </div>
    );
  }

  if (!hasAccounts) {
    return (
      <div
        className="cursor-pointer rounded-[22px] border border-[#102319]/12 bg-[#fffdf5] p-5 shadow-[0_16px_40px_rgba(18,60,47,.06)] transition hover:border-[#102319]/25"
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
          <h3 className="mb-2 text-lg font-semibold text-[#102319]">
            Your Financial Overview
          </h3>
          <p className="mb-4 text-sm text-[#5e6b63]">
            Add your accounts to start seeing your financial overview
          </p>
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleAddAccounts();
            }}
            className="relative rounded-full bg-[#102319] px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#173c2c] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#102319] focus-visible:ring-offset-2"
          >
            Add Your Accounts
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <div
        className="cursor-pointer overflow-hidden rounded-[22px] border border-[#102319]/12 bg-[#fffdf5] p-4 text-[#102319] shadow-[0_18px_40px_rgba(18,60,47,.08)] transition hover:-translate-y-0.5"
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
            <div className="h-2 w-2 animate-pulse rounded-full bg-[#49725a]"></div>
            <h3 className="text-base font-semibold text-[#102319]">Your Financial Overview</h3>
          </div>

          {/* Add More Accounts link - only show when user has accounts */}
          {hasAccounts && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleAddAccounts();
              }}
              className="rounded-full border border-[#102319]/20 bg-transparent px-4 py-2 text-sm font-semibold text-[#102319] transition-colors hover:bg-[#f3f2e9] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#102319] focus-visible:ring-offset-2"
              title="Add more accounts"
            >
              Add More Accounts
            </button>
          )}
        </div>
        {(financialSummary?.asOf || (financialSummary?.status && financialSummary.status !== 'current')) && (
          <div className="mb-3 flex flex-wrap items-center gap-2 text-[11px] text-[#5e6b63]">
            {financialSummary.asOf && (
              <span>Data as of {new Date(financialSummary.asOf).toLocaleString()}</span>
            )}
            {financialSummary.status && financialSummary.status !== 'current' && (
              <span className="rounded-full bg-[#fff3ce] px-2 py-0.5 font-semibold text-[#76510f]">
                {financialSummary.status === 'partial' ? 'Some data unavailable' :
                  financialSummary.status === 'stale' ? 'Some data is stale' : 'Source data unavailable'}
              </span>
            )}
          </div>
        )}

      {/* Net Worth - Featured Card */}
      <div className="mb-3 rounded-2xl border border-[#397052]/12 bg-[#e2edff] p-4">
        <div className="mb-1 text-xs font-semibold text-[#486b91]">Net Worth</div>
        <div className="text-2xl font-bold text-[#102319]">
          {formatMetric(netWorth)}
        </div>
      </div>

      {/* Mobile expand/collapse toggle */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          setMobileExpanded(!mobileExpanded);
        }}
        className="mb-2 flex w-full items-center justify-center gap-1.5 py-2 text-sm font-medium text-[#48675e] transition-colors hover:text-[#102319] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#102319] focus-visible:ring-offset-2 md:hidden"
        aria-expanded={mobileExpanded}
        type="button"
      >
        {mobileExpanded ? (
          <>
            <ChevronUp className="w-4 h-4" />
            Hide details
          </>
        ) : (
          <>
            <ChevronDown className="w-4 h-4" />
            Show details
          </>
        )}
      </button>

      {/* Financial Metrics Row - collapsible on mobile */}
      <div className={`${!mobileExpanded ? 'hidden' : ''} md:block`}>
      <div className="grid grid-cols-2 gap-2 mb-3">
        <div className="min-w-0 rounded-xl bg-[#f3eee4] p-3">
          <div className="mb-1 text-[11px] leading-4 text-[#5e6b63]">Total Cash</div>
          <div className="break-words text-sm font-semibold text-[#102319] sm:text-base">
            {formatMetric(totalCash)}
          </div>
        </div>

        <div className="min-w-0 rounded-xl bg-[#f3eee4] p-3">
          <div className="mb-1 text-[11px] leading-4 text-[#5e6b63]">Total Debt</div>
          <div className="break-words text-sm font-semibold text-[#102319] sm:text-base">
            {formatMetric(totalDebt)}
          </div>
        </div>

        <div className="min-w-0 rounded-xl bg-[#f3eee4] p-3">
          <div className="mb-1 text-[11px] leading-4 text-[#5e6b63]">Total Investments</div>
          <div className="break-words text-sm font-semibold text-[#102319] sm:text-base">
            {formatMetric(totalInvestments)}
          </div>
        </div>

        <div className="min-w-0 rounded-xl bg-[#f3eee4] p-3">
          <div className="mb-1 text-[11px] leading-4 text-[#5e6b63]">Home Value</div>
          <div className="break-words text-sm font-semibold text-[#102319] sm:text-base">
            {formatMetric(totalHomeValue)}
          </div>
          {homeData && (
            <div className="mt-0.5 text-xs text-[#486b91]" title={`Range: ${formatCurrency(homeData.valueLow)} - ${formatCurrency(homeData.valueHigh)}`}>
              Range: {formatCurrency(homeData.valueLow)} - {formatCurrency(homeData.valueHigh)}
            </div>
          )}
        </div>
      </div>

      {/* Account Statistics Row */}
      {hasAccounts && (
        <div className="grid grid-cols-3 gap-2">
          <div className="min-w-0 rounded-xl bg-[#e6f3c8] p-3">
            <div className="mb-1 text-[11px] leading-4 text-[#526e45]">Accounts</div>
            <div className="break-words text-sm font-semibold text-[#102319] sm:text-base">{totalAccountCount}</div>
          </div>

          {investmentData?.portfolio && (
            <>
              <div className="min-w-0 rounded-xl bg-[#e6f3c8] p-3">
                <div className="mb-1 text-[11px] leading-4 text-[#526e45]">Holdings</div>
                <div className="break-words text-sm font-semibold text-[#102319] sm:text-base">{investmentData.portfolio.holdingCount}</div>
              </div>
              <div className="min-w-0 rounded-xl bg-[#e6f3c8] p-3">
                <div className="mb-1 text-[11px] leading-4 text-[#526e45]">Securities</div>
                <div className="break-words text-sm font-semibold text-[#102319] sm:text-base">{investmentData.portfolio.securityCount}</div>
              </div>
            </>
          )}

        </div>
      )}
      </div>
    </div>
    </>
  );
}
