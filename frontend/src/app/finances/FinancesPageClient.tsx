"use client";
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import NetWorthCard from '../../components/finances/NetWorthCard';
import HomeValueCard from '../../components/finances/HomeValueCard';
import AccountGroupCard from '../../components/finances/AccountGroupCard';
import TrendChart from '../../components/finances/TrendChart';
import AccountDetailModal from '../../components/finances/AccountDetailModal';
import { groupAccounts } from '../../components/finances/AccountGrouping';

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
  const [chartTimeRange, setChartTimeRange] = useState<'1M' | '3M' | '6M' | '1Y' | 'All'>('6M');
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
        if (res.ok) {
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
              setSnapTradeAccounts(snapTradeData.data.accounts);
            }
          }
        } catch (snapTradeError) {
          console.log('Error loading SnapTrade accounts:', snapTradeError);
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

  const handleLogout = () => {
    localStorage.removeItem('auth_token');
    router.push('/login');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p>Loading your financial data...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-400 mb-4">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!snapshot) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-400 mb-4">No financial data available</p>
          <a href="/profile" className="text-blue-400 hover:text-blue-300">
            Connect your accounts
          </a>
        </div>
      </div>
    );
  }

  // Use fresh accounts if available, otherwise fall back to snapshot accounts
  const accounts = freshAccounts.length > 0 ? freshAccounts : (snapshot.accounts || []);
  const groupedAccounts = groupAccounts(accounts, snapTradeAccounts);
  
  // Helper to find account by ID
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
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Header */}
      <div className="bg-gray-800 border-b border-gray-700 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <h1 className="text-2xl font-bold text-white">My Finances HQ</h1>
          </div>
          <div className="flex items-center space-x-3">
            <a 
              href="/app" 
              className="text-gray-300 hover:text-white text-sm transition-colors"
            >
              Back to App
            </a>
            <a 
              href="/profile" 
              className="text-gray-300 hover:text-white text-sm transition-colors"
            >
              Profile
            </a>
            <button 
              onClick={handleLogout}
              className="text-gray-300 hover:text-white text-sm transition-colors"
            >
              Logout
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-4 md:p-6 space-y-6">
        {/* Net Worth Card */}
        <NetWorthCard 
          netWorth={Math.round(
            snapshot.financialOverview.totalCash + 
            snapshot.financialOverview.totalInvestments + 
            (homeData?.value || snapshot.financialOverview.homeValue || 0) - 
            snapshot.financialOverview.totalDebt
          )}
          totalCash={Math.round(snapshot.financialOverview.totalCash)}
          totalInvestments={Math.round(snapshot.financialOverview.totalInvestments)}
          totalDebt={Math.round(snapshot.financialOverview.totalDebt)}
          homeValue={homeData?.value || snapshot.financialOverview.homeValue || null}
        />

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

        {/* Trend Charts */}
        {(snapshot.transactionsSummary?.byMonth || snapshot.transactions) && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            <TrendChart
              type="netWorth"
              snapshot={snapshot}
              timeRange={chartTimeRange}
              onTimeRangeChange={setChartTimeRange}
            />
            <TrendChart
              type="spending"
              snapshot={snapshot}
              timeRange={chartTimeRange}
              onTimeRangeChange={setChartTimeRange}
            />
          </div>
        )}

        {/* Home Value */}
        {homeData && homeData.value > 0 && (
          <HomeValueCard 
            homeData={homeData} 
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
            />
          )}
        </div>
      </div>

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
        />
      )}
    </div>
  );
}

