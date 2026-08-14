"use client";
import { useState, useEffect, useCallback, lazy, Suspense } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, BarChart3, Building2, Landmark, ShieldCheck, TrendingUp } from 'lucide-react';
import NetWorthCard from '../../components/finances/NetWorthCard';
import HomeValueCard from '../../components/finances/HomeValueCard';
import AccountGroupCard from '../../components/finances/AccountGroupCard';
import AccountDetailModal from '../../components/finances/AccountDetailModal';
import FinancialMetricsChart, { HistoricalSnapshot } from '../../components/finances/FinancialMetricsChart';
import IncomeExpenseOverrides from '../../components/finances/IncomeExpenseOverrides';
import { groupAccounts } from '../../components/finances/AccountGrouping';
import type { ManualAccount } from '../../types/manual-account';
import { resetUserIdentity } from '../../lib/heycatch';
import AuthenticatedPageHeader from '../../components/authenticated/AuthenticatedPageHeader';

const ManualAccountList = lazy(() => import('../../components/ManualAccountList'));

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

interface FinancialOverview {
  netWorth: number;
  totalCash: number;
  totalInvestments: number;
  totalDebt: number;
  homeValue: number | null;
}

interface InvestmentPortfolio {
  totalValue: number;
  holdingsCount: number;
  securityCount: number;
  assetAllocation: Array<{
    type: string;
    value: number;
    percentage: number;
  }>;
}

interface HomeData {
  address: string;
  value: number;
  valueLow: number;
  valueHigh: number;
  lastUpdated: string;
  isManualOverride?: boolean;
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

interface Snapshot {
  computedAt: string;
  financialOverview: FinancialOverview;
  investmentPortfolio: InvestmentPortfolio;
  accounts?: Account[];
  transactions?: Transaction[];
  holdings?: Holding[];
  activities?: InvestmentTransaction[];
  transactionsSummary?: {
    byMonth: Record<string, { income: number; expense: number }>;
    byCategory: Record<string, number>;
  };
}

function FinancesEmptyState({ onLogout }: { onLogout: () => void }) {
  return (
    <div className="authenticated-site min-h-screen">
      <AuthenticatedPageHeader
        activePage="finances"
        eyebrow="Financial overview"
        title="Your finances"
        onLogout={onLogout}
      />

      <main className="mx-auto max-w-[1200px] px-5 py-10 sm:px-6 md:py-14">
        <section className="overflow-hidden rounded-[2rem] border border-[#102319]/10 bg-[#fffdf5] shadow-[0_24px_70px_rgba(16,35,25,0.08)]">
          <div className="grid lg:grid-cols-[0.9fr_1.1fr]">
            <div className="flex flex-col justify-center p-7 sm:p-10 lg:p-14">
              <div className="mb-6 grid h-12 w-12 place-items-center rounded-2xl bg-[#d9ff6f] text-[#102319]">
                <Building2 size={24} aria-hidden="true" />
              </div>
              <p className="mb-3 text-xs font-extrabold uppercase tracking-[0.16em] text-[#49725a]">
                Start with your accounts
              </p>
              <h2 className="max-w-lg text-3xl font-semibold leading-tight tracking-[-0.045em] text-[#102319] sm:text-4xl">
                See your whole financial picture in one place.
              </h2>
              <p className="mt-5 max-w-lg text-sm leading-7 text-[#5e6b63] sm:text-base">
                Add a bank, investment, loan, property, or manual account. Ask Linc will organize your balances into a clear view of your net worth and trends.
              </p>

              <div className="mt-8 flex flex-col items-start gap-4 sm:flex-row sm:items-center">
                <Link
                  href="/profile"
                  className="inline-flex min-h-12 items-center gap-2 rounded-full bg-[#102319] px-6 py-3 text-sm font-bold text-white transition hover:bg-[#173c2c] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#102319] focus-visible:ring-offset-2"
                >
                  Add your accounts
                  <ArrowRight size={17} aria-hidden="true" />
                </Link>
                <span className="inline-flex items-center gap-2 text-xs font-semibold text-[#5e6b63]">
                  <ShieldCheck size={17} className="text-[#397052]" aria-hidden="true" />
                  Secure, read-only connections
                </span>
              </div>
            </div>

            <div className="relative border-t border-[#102319]/10 bg-[#e8eee4] p-5 sm:p-8 lg:border-l lg:border-t-0 lg:p-10">
              <div className="absolute inset-0 opacity-30 [background-image:radial-gradient(#397052_0.7px,transparent_0.7px)] [background-size:18px_18px]" aria-hidden="true" />
              <div className="relative mx-auto max-w-xl rounded-[1.6rem] border border-[#102319]/10 bg-[#f8f7ef] p-5 shadow-[0_20px_50px_rgba(16,35,25,0.12)] sm:p-6">
                <div className="mb-6 flex items-center justify-between gap-4">
                  <div>
                    <p className="text-[0.65rem] font-extrabold uppercase tracking-[0.15em] text-[#49725a]">Example overview</p>
                    <p className="mt-1 text-sm font-bold text-[#102319]">What you’ll see after setup</p>
                  </div>
                  <span className="rounded-full border border-[#102319]/10 bg-white/70 px-3 py-1 text-[0.65rem] font-bold text-[#66736b]">PREVIEW</span>
                </div>

                <div className="rounded-2xl bg-[#102319] p-5 text-white">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-xs font-semibold text-white/60">Net worth</p>
                      <p className="mt-1 text-3xl font-semibold tracking-[-0.04em]">$128,450</p>
                    </div>
                    <div className="grid h-10 w-10 place-items-center rounded-xl bg-white/10 text-[#d9ff6f]">
                      <TrendingUp size={20} aria-hidden="true" />
                    </div>
                  </div>
                  <div className="mt-6 flex h-14 items-end gap-2" aria-label="Example upward net worth trend">
                    {[35, 43, 39, 52, 59, 66, 74, 82].map((height, index) => (
                      <span key={index} className="flex-1 rounded-t bg-[#d9ff6f]/80" style={{ height: `${height}%` }} />
                    ))}
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-3 gap-3">
                  {[
                    { label: 'Cash', value: '$18.2k', icon: Landmark, color: 'bg-[#c9f2df]' },
                    { label: 'Investments', value: '$124.8k', icon: BarChart3, color: 'bg-[#c6dbff]' },
                    { label: 'Debt', value: '$14.6k', icon: Building2, color: 'bg-[#f4ead0]' },
                  ].map(({ label, value, icon: Icon, color }) => (
                    <div key={label} className="min-w-0 rounded-2xl border border-[#102319]/10 bg-white/65 p-3 sm:p-4">
                      <span className={`mb-3 grid h-8 w-8 place-items-center rounded-lg text-[#102319] ${color}`}>
                        <Icon size={16} aria-hidden="true" />
                      </span>
                      <p className="truncate text-[0.65rem] font-semibold text-[#66736b]">{label}</p>
                      <p className="mt-0.5 truncate text-sm font-bold text-[#102319] sm:text-base">{value}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

export default function FinancesPageClient() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [freshAccounts, setFreshAccounts] = useState<Account[]>([]);
  const [snapTradeAccounts, setSnapTradeAccounts] = useState<SnapTradeAccount[]>([]);
  const [homeData, setHomeData] = useState<HomeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedAccountGroup, setSelectedAccountGroup] = useState<string | null>(null);
  const [selectedAccount, setSelectedAccount] = useState<Account | SnapTradeAccount | null>(null);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [isHomeValueExpanded, setIsHomeValueExpanded] = useState(false);
  const [historicalData, setHistoricalData] = useState<HistoricalSnapshot[]>([]);
  const [historicalDataLoading, setHistoricalDataLoading] = useState(true);
  const [chartTimeRange, setChartTimeRange] = useState<'1M' | '3M' | '6M' | '1Y' | 'All'>('All');
  const [manualAccounts, setManualAccounts] = useState<ManualAccount[]>([]);
  const [refreshingSummary, setRefreshingSummary] = useState(false);
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
        if (!token) {
          router.push('/login');
          return;
        }
        headers['Authorization'] = `Bearer ${token}`;

        // Load snapshot
        let snapshotData: Snapshot | null = null;
        const res = await fetch(`${API_URL}/api/summaries?view=full`, { headers });
        if (res.status === 204) {
          // A brand-new user has no summary yet. This is an expected empty state,
          // and a 204 response intentionally has no JSON body to parse.
          setSnapshot(null);
        } else if (res.ok) {
          snapshotData = await res.json();
          setSnapshot(snapshotData);
          
          // Always try to get home data from profile endpoint (more reliable)
          try {
            const homeRes = await fetch(`${API_URL}/profile/home`, { headers });
            if (homeRes.ok) {
              const homeDataResponse = await homeRes.json();
              console.log('🏠 FinancesPage: Profile home data response:', homeDataResponse);
              if (homeDataResponse.hasHome && homeDataResponse.homeData && homeDataResponse.homeData.value > 0) {
                console.log(`🏠 FinancesPage: Setting home data from profile: $${homeDataResponse.homeData.value}`);
                setHomeData({
                  address: homeDataResponse.homeData.address || '',
                  value: homeDataResponse.homeData.value,
                  valueLow: homeDataResponse.homeData.valueLow || homeDataResponse.homeData.value * 0.9,
                  valueHigh: homeDataResponse.homeData.valueHigh || homeDataResponse.homeData.value * 1.1,
                  lastUpdated: homeDataResponse.homeData.lastUpdated || snapshotData?.computedAt || new Date().toISOString(),
                  isManualOverride: homeDataResponse.homeData.isManualOverride || false
                });
              } else {
                console.log('🏠 FinancesPage: Profile endpoint returned no home data or invalid value');
              }
            } else {
              console.log(`🏠 FinancesPage: Profile endpoint returned status ${homeRes.status}`);
            }
          } catch (e) {
            console.log('🏠 FinancesPage: Error fetching from profile endpoint:', e);
            // Fallback: try to use home value from snapshot if profile endpoint fails
            if (snapshotData?.financialOverview?.homeValue && snapshotData.financialOverview.homeValue > 0) {
              console.log(`🏠 FinancesPage: Using snapshot home value: $${snapshotData.financialOverview.homeValue}`);
              setHomeData({
                address: '',
                value: snapshotData.financialOverview.homeValue,
                valueLow: snapshotData.financialOverview.homeValue * 0.9,
                valueHigh: snapshotData.financialOverview.homeValue * 1.1,
                lastUpdated: snapshotData.computedAt || new Date().toISOString(),
                isManualOverride: false
              });
            } else {
              console.log('🏠 FinancesPage: No home value found in snapshot either');
            }
          }
        } else {
          if (res.status === 401) {
            router.push('/login');
            return;
          }
          setError('Failed to load financial data');
        }

        // Load fresh account data from /plaid/all-accounts (same as profile page)
        try {
          const accountsRes = await fetch(`${API_URL}/plaid/all-accounts`, { headers });
          if (accountsRes.ok) {
            const accountsData = await accountsRes.json();
            const accounts = accountsData.accounts || [];
            console.log(`📊 FinancesPage: Loaded ${accounts.length} fresh accounts from /plaid/all-accounts`);
            setFreshAccounts(accounts);
          } else {
            console.log('Failed to load fresh accounts, falling back to snapshot');
            // Fallback to snapshot accounts if fresh fetch fails
            setFreshAccounts(snapshotData?.accounts || []);
          }
        } catch (accountsError) {
          console.log('Error loading fresh accounts:', accountsError);
          // Fallback to snapshot accounts
          setFreshAccounts(snapshotData?.accounts || []);
        }

        // Load SnapTrade accounts
        try {
          const snapTradeRes = await fetch(`${API_URL}/snaptrade/accounts`, { headers });
          if (snapTradeRes.ok) {
            const snapTradeData = await snapTradeRes.json();
            if (snapTradeData.success && snapTradeData.data?.accounts) {
              // Normalize SnapTrade account IDs to match holdings format (snaptrade-{id})
              const normalizedAccounts = snapTradeData.data.accounts.map((acc: SnapTradeAccount) => ({
                ...acc,
                id: acc.id.startsWith('snaptrade-') ? acc.id : `snaptrade-${acc.id}`,
              }));
              setSnapTradeAccounts(normalizedAccounts);
            }
          }
        } catch (snapTradeError) {
          console.log('Error loading SnapTrade accounts:', snapTradeError);
        }

        // Load manual accounts
        try {
          const manualAccountsRes = await fetch(`${API_URL}/api/manual-accounts`, { headers });
          if (manualAccountsRes.ok) {
            const manualAccountsData = await manualAccountsRes.json();
            if (manualAccountsData.success && manualAccountsData.data) {
              setManualAccounts(manualAccountsData.data);
            }
          }
        } catch (manualAccountsError) {
          console.log('Error loading manual accounts:', manualAccountsError);
        }

        // Load historical financial data
        try {
          setHistoricalDataLoading(true);
          const historyRes = await fetch(`${API_URL}/api/financial-history`, { headers });
          if (historyRes.ok) {
            const historyData = await historyRes.json();
            // Ensure we always have an array
            const safeHistoryData = Array.isArray(historyData) ? historyData : [];
            console.log(`📊 FinancesPage: Loaded ${safeHistoryData.length} historical snapshots`);
            setHistoricalData(safeHistoryData);
          } else {
            console.log('Failed to load historical data, will show empty state');
            setHistoricalData([]);
          }
        } catch (historyError) {
          console.log('Error loading historical data:', historyError);
          setHistoricalData([]);
        } finally {
          setHistoricalDataLoading(false);
        }
      } catch (error) {
        console.error('Error loading financial data:', error);
        setError('Failed to load financial data');
      } finally {
        setLoading(false);
      }
    };

    loadFinancialData();
  }, [API_URL, router]);

  const refreshAccounts = useCallback(async () => {
    try {
      console.log('🔄 Refreshing accounts after rename...');
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      const token = localStorage.getItem('auth_token');
      if (!token) {
        console.warn('No auth token found, skipping refresh');
        return;
      }
      headers['Authorization'] = `Bearer ${token}`;

      // Reload Plaid accounts
      try {
        const accountsRes = await fetch(`${API_URL}/plaid/all-accounts`, { headers });
        if (accountsRes.ok) {
          const accountsData = await accountsRes.json();
          const accounts = accountsData.accounts || [];
          console.log(`✅ Refreshed ${accounts.length} Plaid accounts`);
          setFreshAccounts(accounts);
        } else {
          console.error(`❌ Failed to refresh accounts: ${accountsRes.status}`);
        }
      } catch (accountsError) {
        console.error('Error refreshing accounts:', accountsError);
      }

      // Reload SnapTrade accounts
      try {
        const snapTradeRes = await fetch(`${API_URL}/snaptrade/accounts`, { headers });
        if (snapTradeRes.ok) {
          const snapTradeData = await snapTradeRes.json();
          if (snapTradeData.success && snapTradeData.data?.accounts) {
            const normalizedAccounts = snapTradeData.data.accounts.map((acc: SnapTradeAccount) => ({
              ...acc,
              id: acc.id.startsWith('snaptrade-') ? acc.id : `snaptrade-${acc.id}`,
            }));
            console.log(`✅ Refreshed ${normalizedAccounts.length} SnapTrade accounts`);
            setSnapTradeAccounts(normalizedAccounts);
          }
        }
      } catch (snapTradeError) {
        console.error('Error refreshing SnapTrade accounts:', snapTradeError);
      }
    } catch (error) {
      console.error('Error refreshing accounts:', error);
    }
  }, [API_URL]);

  const refreshManualAccounts = useCallback(async () => {
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      const token = localStorage.getItem('auth_token');
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      const manualAccountsRes = await fetch(`${API_URL}/api/manual-accounts`, { headers });
      if (manualAccountsRes.ok) {
        const manualAccountsData = await manualAccountsRes.json();
        if (manualAccountsData.success && manualAccountsData.data) {
          setManualAccounts(manualAccountsData.data);
        }
      }
      // Also refresh the main financial data to update totals
      const res = await fetch(`${API_URL}/api/summaries?view=full`, { headers });
      if (res.ok) {
        const snapshotData = await res.json();
        setSnapshot(snapshotData);
      }
    } catch (error) {
      console.error('Error refreshing manual accounts:', error);
    }
  }, [API_URL]);

  const refreshSummary = useCallback(async () => {
    try {
      setRefreshingSummary(true);
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      const token = localStorage.getItem('auth_token');
      if (!token) {
        console.warn('No auth token found, skipping refresh');
        return;
      }
      headers['Authorization'] = `Bearer ${token}`;
      const url = `${API_URL}/api/refresh-summary`;
      console.log('🔄 Refresh totals →', url, '(same API base as /api/summaries)');
      const res = await fetch(url, { method: 'POST', headers });
      if (res.ok) {
        const data = await res.json();
        console.log('✅ Summary refreshed:', data);
        window.location.reload();
      } else {
        const err = await res.json().catch(() => ({}));
        console.error('Failed to refresh summary:', res.status, err);
      }
    } catch (error) {
      console.error('Error refreshing summary:', error);
    } finally {
      setRefreshingSummary(false);
    }
  }, [API_URL]);

  const handleLogout = () => {
    localStorage.removeItem('auth_token');
    resetUserIdentity();
    router.push('/login');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f3f2e9] text-[#102319] flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p>Loading your financial data...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#f3f2e9] text-[#102319] flex items-center justify-center">
        <div className="text-center">
          <p className="text-[#8b3027] mb-4">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="rounded-full bg-[#102319] px-5 py-2.5 font-semibold text-white transition hover:bg-[#173c2c] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#102319] focus-visible:ring-offset-2"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!snapshot) {
    return <FinancesEmptyState onLogout={handleLogout} />;
  }

  // Use fresh accounts if available, otherwise fall back to snapshot accounts
  // Dedupe by account_id to avoid showing same account twice (e.g. manual account in both Account table and ManualAccount)
  const rawAccounts = freshAccounts.length > 0 ? freshAccounts : (snapshot.accounts || []);
  const accountIdSet = new Set<string>();
  const accounts = rawAccounts.filter((acc) => {
    const id = (acc as Account).account_id || (acc as Account).id;
    if (!id || accountIdSet.has(id)) return false;
    accountIdSet.add(id);
    return true;
  });
  const groupedAccounts = groupAccounts(accounts, snapTradeAccounts);
  
  // Helper to find account by ID (regular function, not a hook)
  const findAccountById = (accountId: string): Account | SnapTradeAccount | null => {
    const allAccounts = [
      ...groupedAccounts.cash,
      ...groupedAccounts.investments,
      ...groupedAccounts.debt,
      ...groupedAccounts.snapTrade
    ];
    return allAccounts.find(acc => {
      const accId = (acc as Account).account_id || (acc as Account).id || (acc as SnapTradeAccount).id;
      return accId === accountId;
    }) || null;
  };

  return (
    <div className="authenticated-site min-h-screen">
      <AuthenticatedPageHeader
        activePage="finances"
        eyebrow="Financial overview"
        title="Your finances"
        onLogout={handleLogout}
      />

      <main className="mx-auto max-w-[1200px] space-y-6 p-5 py-10 sm:px-6 md:py-12">
        <div className="authenticated-intro mb-10"><h2>Your whole financial picture, in one place.</h2><p>A connected view of your net worth, trends, accounts, and the assumptions Ask Linc uses.</p></div>
        {/* Net Worth Card */}
        {/* Use snapshot.homeValue first (backend-calculated), then fall back to homeData.value for display */}
        <NetWorthCard 
          netWorth={Math.round(
            snapshot.financialOverview.totalCash + 
            snapshot.financialOverview.totalInvestments + 
            (snapshot.financialOverview.homeValue ?? homeData?.value ?? 0) - 
            snapshot.financialOverview.totalDebt
          )}
          totalCash={Math.round(snapshot.financialOverview.totalCash)}
          totalInvestments={Math.round(snapshot.financialOverview.totalInvestments)}
          totalDebt={Math.round(snapshot.financialOverview.totalDebt)}
          homeValue={snapshot.financialOverview.homeValue ?? homeData?.value ?? null}
        />

        {/* Financial Metrics Chart */}
        {!historicalDataLoading && snapshot && (() => {
          // Get current home value (prefer snapshot.homeValue - backend-calculated, then fall back to homeData.value)
          const currentHomeValue = snapshot.financialOverview.homeValue ?? homeData?.value ?? null;
          
          // Create current snapshot with accurate values
          const currentSnapshot = {
            computedAt: new Date().toISOString(),
            netWorth: Math.round(
              snapshot.financialOverview.totalCash + 
              snapshot.financialOverview.totalInvestments + 
              (currentHomeValue || 0) - 
              snapshot.financialOverview.totalDebt
            ),
            totalCash: Math.round(snapshot.financialOverview.totalCash),
            totalInvestments: Math.round(snapshot.financialOverview.totalInvestments),
            totalDebt: Math.round(snapshot.financialOverview.totalDebt),
            homeValue: currentHomeValue,
          };

          // Recalculate net worth and fill in missing homeValue for all historical snapshots
          // If a historical snapshot has homeValue as null/0 but we have a current homeValue,
          // use the current homeValue (assuming home value doesn't change frequently)
          // Ensure historicalData is always an array
          const safeHistoricalData = Array.isArray(historicalData) ? historicalData : [];
          const today = new Date().toDateString();
          
          // Filter out any historical snapshots from today - we'll use current snapshot instead
          // This ensures manual accounts are always included in today's data point
          const historicalDataExcludingToday = safeHistoricalData.filter(snapshot => {
            const snapshotDate = new Date(snapshot.computedAt).toDateString();
            return snapshotDate !== today;
          });
          
          const correctedHistoricalData = historicalDataExcludingToday.map(snapshot => {
            // Use current homeValue if historical snapshot is missing it (null or 0)
            const homeValue = (snapshot.homeValue != null && snapshot.homeValue > 0) 
              ? snapshot.homeValue 
              : (currentHomeValue || null);
            
            return {
              ...snapshot,
              homeValue: homeValue,
              netWorth: Math.round(
                snapshot.totalCash + 
                snapshot.totalInvestments + 
                (homeValue || 0) - 
                snapshot.totalDebt
              ),
            };
          });

          // Always use current snapshot for today (includes manual accounts)
          // Prepend it to historical data so it appears as the most recent point
          const chartData = [currentSnapshot, ...correctedHistoricalData];

          return (
            <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
              <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <h3 className="text-lg font-semibold text-white">Financial Metrics Over Time</h3>
                <div className="flex flex-wrap items-center gap-3">
                  <select
                    value={chartTimeRange}
                    onChange={(e) => {
                      const value = e.target.value as '1M' | '3M' | '6M' | '1Y' | 'All';
                      setChartTimeRange(value);
                    }}
                    className="bg-gray-700 text-white px-3 py-1 rounded text-sm border border-gray-600 focus:border-blue-500 focus:outline-none"
                  >
                    <option value="1M">1 Month</option>
                    <option value="3M">3 Months</option>
                    <option value="6M">6 Months</option>
                    <option value="1Y">1 Year</option>
                    <option value="All">All Time</option>
                  </select>
                  <button
                    onClick={refreshSummary}
                    disabled={refreshingSummary}
                    className="text-sm px-3 py-1.5 rounded bg-gray-700 hover:bg-gray-600 text-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {refreshingSummary ? 'Refreshing...' : 'Refresh totals'}
                  </button>
                </div>
              </div>
              <FinancialMetricsChart 
                data={chartData}
                timeRange={chartTimeRange}
              />
            </div>
          );
        })()}

        {/* Key Metrics Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
            <div className="text-gray-400 text-sm mb-1">Total Cash</div>
            <div className="text-white font-semibold text-xl">
              {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(Math.round(snapshot.financialOverview.totalCash))}
            </div>
          </div>
          
          <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
            <div className="text-gray-400 text-sm mb-1">Total Debt</div>
            <div className="text-white font-semibold text-xl">
              {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(Math.round(snapshot.financialOverview.totalDebt))}
            </div>
          </div>
          
          <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
            <div className="text-gray-400 text-sm mb-1">Total Investments</div>
            <div className="text-white font-semibold text-xl">
              {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(Math.round(snapshot.financialOverview.totalInvestments))}
            </div>
          </div>

          <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
            <div className="text-gray-400 text-sm mb-1">Home Value</div>
            <div className="text-white font-semibold text-xl">
              {homeData && homeData.value > 0 ? 
                new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(Math.round(homeData.value)) :
                (snapshot.financialOverview.homeValue && snapshot.financialOverview.homeValue > 0 ?
                  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(Math.round(snapshot.financialOverview.homeValue)) :
                  '$0'
                )
              }
            </div>
          </div>
        </div>

        {/* Monthly Income/Expense Overrides */}
        {snapshot && (
          <IncomeExpenseOverrides
            calculatedIncome={(() => {
              if (snapshot.transactionsSummary?.byMonth) {
                const months = Object.values(snapshot.transactionsSummary.byMonth);
                if (months.length > 0) {
                  const totalIncome = months.reduce((sum, month) => sum + (month.income || 0), 0);
                  return totalIncome / months.length;
                }
              }
              return undefined;
            })()}
            calculatedExpense={(() => {
              if (snapshot.transactionsSummary?.byMonth) {
                const months = Object.values(snapshot.transactionsSummary.byMonth);
                if (months.length > 0) {
                  const totalExpense = months.reduce((sum, month) => sum + (month.expense || 0), 0);
                  return totalExpense / months.length;
                }
              }
              return undefined;
            })()}
          />
        )}

        {/* Home Value */}
        {homeData && homeData.value > 0 && (
          <HomeValueCard 
            homeData={homeData} 
            isExpanded={isHomeValueExpanded}
            onToggle={() => setIsHomeValueExpanded(!isHomeValueExpanded)}
            onValueUpdate={(updatedData) => {
              setHomeData(updatedData);
              // Optionally refresh the snapshot to get updated data
            }}
          />
        )}

        {/* Account Groups */}
        <div className="space-y-4 mt-6">
          {/* Cash Accounts */}
          {groupedAccounts.cash.length > 0 && (
            <AccountGroupCard
              title="Cash Accounts"
              accounts={groupedAccounts.cash}
              totalBalance={groupedAccounts.cash.reduce((sum, acc) => {
                const account = acc as Account;
                // Match profile page logic: use available for checking/savings, current for others
                let balance: number;
                if (account.type === 'depository' || 
                    account.subtype === 'checking' || 
                    account.subtype === 'savings') {
                  balance = account.balance?.available !== undefined && account.balance?.available !== null 
                    ? account.balance.available 
                    : account.balance?.current ?? 0;
                } else {
                  balance = account.balance?.current ?? 0;
                }
                return sum + balance;
              }, 0)}
              isExpanded={selectedAccountGroup === 'cash'}
              onToggle={() => setSelectedAccountGroup(selectedAccountGroup === 'cash' ? null : 'cash')}
              onAccountClick={(accountId) => {
                const account = findAccountById(accountId);
                if (account) {
                  setSelectedAccount(account);
                  setSelectedAccountId(accountId);
                }
              }}
              onAccountRenamed={refreshAccounts}
            />
          )}

          {/* Investment Accounts */}
          {(groupedAccounts.investments.length > 0 || groupedAccounts.snapTrade.length > 0) && (
            <AccountGroupCard
              title="Investment Accounts"
              accounts={[...groupedAccounts.investments, ...groupedAccounts.snapTrade]}
              totalBalance={snapshot.financialOverview.totalInvestments}
              isExpanded={selectedAccountGroup === 'investments'}
              onToggle={() => setSelectedAccountGroup(selectedAccountGroup === 'investments' ? null : 'investments')}
              onAccountClick={(accountId) => {
                const account = findAccountById(accountId);
                if (account) {
                  setSelectedAccount(account);
                  setSelectedAccountId(accountId);
                }
              }}
              onAccountRenamed={refreshAccounts}
            />
          )}

          {/* Debt Accounts */}
          {groupedAccounts.debt.length > 0 && (
            <AccountGroupCard
              title="Debt Accounts"
              accounts={groupedAccounts.debt}
              totalBalance={groupedAccounts.debt.reduce((sum, acc) => {
                const balance = (acc as Account).balance?.current ?? (acc as SnapTradeAccount).balance ?? 0;
                return sum + Math.abs(balance);
              }, 0)}
              isExpanded={selectedAccountGroup === 'debt'}
              onToggle={() => setSelectedAccountGroup(selectedAccountGroup === 'debt' ? null : 'debt')}
              onAccountClick={(accountId) => {
                const account = findAccountById(accountId);
                if (account) {
                  setSelectedAccount(account);
                  setSelectedAccountId(accountId);
                }
              }}
              onAccountRenamed={refreshAccounts}
            />
          )}

          {/* Manual Accounts Management */}
          {snapshot && (
            <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
              <Suspense fallback={<div className="text-gray-400">Loading manual accounts...</div>}>
                <ManualAccountList
                  accounts={manualAccounts}
                  onRefresh={refreshManualAccounts}
                  isDemo={false}
                />
              </Suspense>
            </div>
          )}
        </div>
      </main>


      {/* Account Detail Modal */}
      {selectedAccount && selectedAccountId && snapshot && (
        <AccountDetailModal
          account={selectedAccount}
          accountId={selectedAccountId}
          transactions={snapshot.transactions || []}
          holdings={snapshot.holdings || []}
          investmentTransactions={snapshot.activities || []}
          onClose={() => {
            setSelectedAccount(null);
            setSelectedAccountId(null);
          }}
          onAccountRenamed={refreshAccounts}
        />
      )}
    </div>
  );
}
