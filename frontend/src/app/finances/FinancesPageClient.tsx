"use client";
import { useState, useEffect, useCallback, useRef, lazy, Suspense } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, BarChart3, Building2, Landmark, ShieldCheck, TrendingUp } from 'lucide-react';
import NetWorthCard from '../../components/finances/NetWorthCard';
import HomeValueCard from '../../components/finances/HomeValueCard';
import AccountGroupCard from '../../components/finances/AccountGroupCard';
import FinancialMetricsChart, { HistoricalSnapshot } from '../../components/finances/FinancialMetricsChart';
import IncomeExpenseOverrides from '../../components/finances/IncomeExpenseOverrides';
import type { FinancesAccount, FinancesOverview } from '../../types/finances-overview';
import { resetUserIdentity } from '../../lib/heycatch';
import AuthenticatedPageHeader from '../../components/authenticated/AuthenticatedPageHeader';
import { mergeCanonicalCurrentWithHistory } from '../../lib/canonical-financial-history';
import {
  calendarDateInTimeZone,
  getEffectiveUserTimeZone,
  observationDateForCalendarDate,
  clearStoredUserTimeZone,
  syncStoredUserTimeZoneFromAuthUser,
} from '../../lib/browser-time-zone';

const ManualAccountList = lazy(() => import('../../components/ManualAccountList'));
const AccountDetailModal = lazy(() => import('../../components/finances/AccountDetailModal'));

// Account edits return as soon as they are durable; the canonical snapshot they feed is
// rebuilt in the background because it re-reads every connected provider. Poll the
// overview until that new revision lands so totals catch up without a manual reload.
const REVISION_POLL_INTERVAL_MS = 2000;
// How long to wait when the server reports nothing in flight, and the hard ceiling for a
// rebuild it says is still running.
const REVISION_POLL_ATTEMPTS = 30;
const REVISION_POLL_MAX_ATTEMPTS = 150;

type SavedHomeValue = {
  address: string;
  value: number;
  valueLow: number | null;
  valueHigh: number | null;
  lastUpdated: string;
  isManualOverride?: boolean;
};

type PendingHome = {
  baselineRevision: string | null;
  home: FinancesOverview['home'];
};

// An edit is settled once the snapshot has moved past the revision it was made against and
// the server has no further rebuild scheduled. `rebuildPending` is process-local, so an
// older backend or a request served by another instance simply falls back to the revision
// check rather than polling forever.
function isReconciled(overview: FinancesOverview, baselineRevision: string | null): boolean {
  if (overview.revision.rebuildPending) return false;
  return overview.revision.computedAt !== baselineRevision;
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
  const [overview, setOverview] = useState<FinancesOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedAccountGroup, setSelectedAccountGroup] = useState<string | null>(null);
  const [selectedAccount, setSelectedAccount] = useState<FinancesAccount | null>(null);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [isHomeValueExpanded, setIsHomeValueExpanded] = useState(false);
  const [historicalData, setHistoricalData] = useState<HistoricalSnapshot[]>([]);
  const [historicalDataLoading, setHistoricalDataLoading] = useState(true);
  const [chartTimeRange, setChartTimeRange] = useState<'1M' | '3M' | '6M' | '1Y' | 'All'>('All');
  const [refreshingSummary, setRefreshingSummary] = useState(false);
  const [refreshSummaryMessage, setRefreshSummaryMessage] = useState<{
    kind: 'success' | 'warning' | 'error';
    text: string;
  } | null>(null);
  const [awaitingRevision, setAwaitingRevision] = useState(false);
  const [revisionStalled, setRevisionStalled] = useState(false);
  const router = useRouter();
  const revisionRef = useRef<string | null>(null);
  const mountedRef = useRef(true);
  const pendingHomeRef = useRef<PendingHome | null>(null);

  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const loadOverview = useCallback(async (): Promise<FinancesOverview | null> => {
    const token = localStorage.getItem('auth_token');
    if (!token) {
      router.push('/login');
      return null;
    }
    const response = await fetch(`${API_URL}/api/finances/overview`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (response.status === 204) {
      setOverview(null);
      return null;
    }
    if (response.status === 401) {
      router.push('/login');
      return null;
    }
    if (!response.ok) throw new Error('Failed to load financial data');
    const data = await response.json() as FinancesOverview;
    syncStoredUserTimeZoneFromAuthUser({ timeZone: data.userTimeZone });

    const pendingHome = pendingHomeRef.current;
    const resolved = pendingHome && !isReconciled(data, pendingHome.baselineRevision)
      ? { ...data, home: pendingHome.home }
      : data;
    if (pendingHome && resolved === data) pendingHomeRef.current = null;

    setOverview(resolved);
    revisionRef.current = data.revision.computedAt;
    return data;
  }, [API_URL, router]);

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

        setHistoricalDataLoading(true);
        await Promise.all([
          loadOverview(),
          (async () => {
            try {
              const historyRes = await fetch(`${API_URL}/api/financial-history`, { headers });
              const historyData = historyRes.ok ? await historyRes.json() : [];
              setHistoricalData(Array.isArray(historyData) ? historyData : []);
            } catch {
              setHistoricalData([]);
            } finally {
              setHistoricalDataLoading(false);
            }
          })(),
        ]);
      } catch (error) {
        console.error('Error loading financial data:', error);
        setError('Failed to load financial data');
      } finally {
        setLoading(false);
      }
    };

    void loadFinancialData();
  }, [API_URL, loadOverview, router]);

  // Reload right away so the edit is visible (manual accounts and names read straight from
  // the database), then keep polling until the background snapshot rebuild publishes a new
  // revision so the derived totals and account groups line up too.
  const refreshAfterAccountEdit = useCallback(async () => {
    const baselineRevision = revisionRef.current;
    setRevisionStalled(false);
    const immediate = await loadOverview().catch(() => null);
    // A revision that already moved past the baseline settles this edit only if the server
    // has nothing further queued. Back-to-back edits land in separate rebuilds, so the
    // first one publishing is not the end of the story.
    if (!immediate || !isReconciled(immediate, baselineRevision)) {
      setAwaitingRevision(true);
      try {
        for (let attempt = 0; attempt < REVISION_POLL_MAX_ATTEMPTS; attempt += 1) {
          await new Promise(resolve => setTimeout(resolve, REVISION_POLL_INTERVAL_MS));
          if (!mountedRef.current) return;
          // A transient failure costs an attempt; it is not a reason to stop watching for
          // a rebuild that is still on its way.
          const next = await loadOverview().catch(() => null);
          if (next && isReconciled(next, baselineRevision)) return;
          // A user with many connected providers can take longer than the default window
          // to re-read them all. Keep waiting while the server says work is still in
          // flight; the shorter window only bounds the case where nothing is known to be
          // running, and the outer cap bounds a flag that never clears.
          if (attempt + 1 >= REVISION_POLL_ATTEMPTS && !next?.revision.rebuildPending) break;
        }
        // The rebuild never published. Say so rather than leaving stale totals unexplained.
        if (mountedRef.current) setRevisionStalled(true);
      } finally {
        if (mountedRef.current) setAwaitingRevision(false);
      }
    }
  }, [loadOverview]);

  const refreshAccounts = refreshAfterAccountEdit;
  const refreshManualAccounts = refreshAfterAccountEdit;

  // Unlike manual accounts, the home card is fed by the snapshot rather than read live, so
  // reloading before the rebuild lands would snap the value back to the old one. Hold the
  // value the server just saved — flagged as not yet reflected in the snapshot — over every
  // reload until a new revision arrives, then reconcile like any other edit.
  const refreshAfterHomeEdit = useCallback(async (savedHome: SavedHomeValue) => {
    pendingHomeRef.current = {
      baselineRevision: revisionRef.current,
      home: {
        address: savedHome.address,
        value: savedHome.value,
        valueLow: savedHome.valueLow,
        valueHigh: savedHome.valueHigh,
        lastUpdated: savedHome.lastUpdated,
        isManualOverride: Boolean(savedHome.isManualOverride),
        isSnapshotAligned: false,
      },
    };
    await refreshAfterAccountEdit();
  }, [refreshAfterAccountEdit]);

  const refreshSummary = useCallback(async () => {
    try {
      setRefreshingSummary(true);
      setRefreshSummaryMessage(null);
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      const token = localStorage.getItem('auth_token');
      if (!token) {
        console.warn('No auth token found, skipping refresh');
        setRefreshSummaryMessage({ kind: 'error', text: 'Please sign in again before refreshing totals.' });
        return;
      }
      headers['Authorization'] = `Bearer ${token}`;
      const res = await fetch(`${API_URL}/api/refresh-summary`, { method: 'POST', headers });
      const body = await res.json().catch(() => ({}));
      if (res.ok) {
        await loadOverview();
        setRevisionStalled(false);
        setRefreshSummaryMessage(body.status === 'current'
          ? { kind: 'success', text: 'Totals refreshed from your connected providers.' }
          : { kind: 'warning', text: 'Refresh completed, but some connected-source data is stale or unavailable.' });
      } else {
        console.error('Failed to refresh summary:', res.status, body);
        setRefreshSummaryMessage({
          kind: 'error',
          text: body.error || 'Live totals could not be refreshed. Please try again.',
        });
      }
    } catch (error) {
      console.error('Error refreshing summary:', error);
      setRefreshSummaryMessage({ kind: 'error', text: 'Live totals could not be refreshed. Please try again.' });
    } finally {
      setRefreshingSummary(false);
    }
  }, [API_URL, loadOverview]);

  const handleLogout = () => {
    localStorage.removeItem('auth_token');
    clearStoredUserTimeZone();
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

  if (!overview) {
    return <FinancesEmptyState onLogout={handleLogout} />;
  }

  // While the background rebuild is being polled for, the out-of-sync notice would just be
  // telling the user to do what the page is already doing.
  const visibleWarnings = awaitingRevision
    ? overview.warnings.filter(warning =>
        warning.code !== 'manual-accounts-out-of-sync' &&
        warning.code !== 'home-metadata-out-of-sync'
      )
    : overview.warnings;

  const findAccountById = (accountId: string): FinancesAccount | null => {
    const allAccounts = [
      ...overview.accountGroups.cash.accounts,
      ...overview.accountGroups.investments.accounts,
      ...overview.accountGroups.debt.accounts,
      ...overview.accountGroups.other.accounts,
    ];
    return allAccounts.find(acc => {
      const accId = acc.account_id || acc.id;
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
        <div className="flex flex-wrap items-center gap-2 text-xs text-[#5e6b63]">
          {overview.revision.asOf && (
            <span>Source data as of {new Date(overview.revision.asOf).toLocaleString()}</span>
          )}
          <span>Snapshot computed {new Date(overview.revision.computedAt).toLocaleString()}</span>
          {awaitingRevision && (
            <span role="status" className="inline-flex items-center gap-2 font-medium text-[#102319]">
              <span className="h-3 w-3 animate-spin rounded-full border-b-2 border-[#102319]" aria-hidden="true" />
              Updating totals with your change…
            </span>
          )}
        </div>
        {revisionStalled && !awaitingRevision && (
          <div role="status" className="rounded-xl border border-[#d4a72c]/30 bg-[#fff3ce] px-4 py-3 text-sm font-medium text-[#76510f]">
            Your change was saved, but totals have not caught up yet. Use Refresh totals to try again.
          </div>
        )}
        {visibleWarnings.length > 0 && (
          <div className="space-y-2" role="status" aria-label="Financial data warnings">
            {visibleWarnings.map(warning => (
              <div key={warning.code} className="rounded-xl border border-[#d4a72c]/30 bg-[#fff3ce] px-4 py-3 text-sm font-medium text-[#76510f]">
                {warning.message}
              </div>
            ))}
          </div>
        )}
        {/* Net Worth Card */}
        <NetWorthCard 
          netWorth={Math.round(overview.financialOverview.netWorth)}
          totalCash={Math.round(overview.financialOverview.totalCash)}
          totalInvestments={Math.round(overview.financialOverview.totalInvestments)}
          totalDebt={Math.round(overview.financialOverview.totalDebt)}
          homeValue={overview.financialOverview.homeValue}
        />

        {/* Financial Metrics Chart */}
        {!historicalDataLoading && (() => {
          // Preserve the canonical values and source time exactly. The chart
          // must not rewrite historical rows with today's home value.
          const safeHistoricalData = Array.isArray(historicalData) ? historicalData : [];
          const userTimeZone = getEffectiveUserTimeZone();
          const calendarDate = calendarDateInTimeZone(
            new Date(overview.revision.computedAt),
            userTimeZone
          );
          const currentSnapshot = {
            computedAt: overview.revision.computedAt,
            observationDate: observationDateForCalendarDate(calendarDate),
            timeZone: userTimeZone,
            netWorth: overview.financialOverview.netWorth,
            totalCash: overview.financialOverview.totalCash,
            totalInvestments: overview.financialOverview.totalInvestments,
            totalDebt: overview.financialOverview.totalDebt,
            homeValue: overview.financialOverview.homeValue,
          };

          const chartData = mergeCanonicalCurrentWithHistory(currentSnapshot, safeHistoricalData);

          return (
            <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
              {refreshSummaryMessage && (
                <div
                  role={refreshSummaryMessage.kind === 'error' ? 'alert' : 'status'}
                  className={`mb-5 rounded-xl border px-4 py-3 text-sm font-medium ${
                    refreshSummaryMessage.kind === 'success'
                      ? 'border-[#28704d]/25 bg-[#c9f2df]/55 text-[#28704d]'
                      : refreshSummaryMessage.kind === 'warning'
                        ? 'border-[#d4a72c]/30 bg-[#fff3ce] text-[#76510f]'
                        : 'border-[#b84a3d]/25 bg-[#f8e8e3] text-[#8b3027]'
                  }`}
                >
                  {refreshSummaryMessage.text}
                </div>
              )}
              <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <h3 className="text-lg font-semibold text-white">Financial Metrics Over Time</h3>
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={chartTimeRange}
                    onChange={(e) => {
                      const value = e.target.value as '1M' | '3M' | '6M' | '1Y' | 'All';
                      setChartTimeRange(value);
                    }}
                    className="min-h-10 rounded-full border border-[#102319]/15 bg-[#fffdf5] px-4 py-2 text-sm font-bold text-[#102319] transition hover:border-[#102319]/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#102319] focus-visible:ring-offset-2"
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
                    className="inline-flex min-h-10 items-center gap-2 rounded-full border border-[#102319]/15 bg-[#fffdf5] px-4 py-2 text-sm font-bold text-[#102319] transition hover:border-[#102319]/30 hover:bg-[#f0f0e8] disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#102319] focus-visible:ring-offset-2"
                  >
                    {refreshingSummary && (
                      <span
                        aria-hidden="true"
                        className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[#102319]/25 border-t-[#102319]"
                      />
                    )}
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
              {new Intl.NumberFormat('en-US', { style: 'currency', currency: overview.revision.reportingCurrency, minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(Math.round(overview.financialOverview.totalCash))}
            </div>
          </div>
          
          <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
            <div className="text-gray-400 text-sm mb-1">Total Debt</div>
            <div className="text-white font-semibold text-xl">
              {new Intl.NumberFormat('en-US', { style: 'currency', currency: overview.revision.reportingCurrency, minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(Math.round(overview.financialOverview.totalDebt))}
            </div>
          </div>
          
          <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
            <div className="text-gray-400 text-sm mb-1">Total Investments</div>
            <div className="text-white font-semibold text-xl">
              {new Intl.NumberFormat('en-US', { style: 'currency', currency: overview.revision.reportingCurrency, minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(Math.round(overview.financialOverview.totalInvestments))}
            </div>
          </div>

          <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
            <div className="text-gray-400 text-sm mb-1">Home Value</div>
            <div className="text-white font-semibold text-xl">
              {overview.financialOverview.homeValue === null
                ? 'Unavailable'
                : new Intl.NumberFormat('en-US', { style: 'currency', currency: overview.revision.reportingCurrency, minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(Math.round(overview.financialOverview.homeValue))}
            </div>
          </div>
        </div>

        <IncomeExpenseOverrides
          calculatedIncome={overview.cashFlow.calculatedMonthlyIncome}
          calculatedExpense={overview.cashFlow.calculatedMonthlyExpense}
          initialMonthlyIncome={overview.cashFlow.monthlyIncomeOverride}
          initialMonthlyExpense={overview.cashFlow.monthlyExpenseOverride}
        />

        {/* Home Value */}
        {overview.home && overview.home.value > 0 && (
          <HomeValueCard 
            homeData={overview.home}
            isExpanded={isHomeValueExpanded}
            onToggle={() => setIsHomeValueExpanded(!isHomeValueExpanded)}
            onValueUpdate={(savedHome) => { void refreshAfterHomeEdit(savedHome); }}
          />
        )}

        {/* Account Groups */}
        <div className="space-y-4 mt-6">
          {/* Cash Accounts */}
          {overview.accountGroups.cash.accounts.length > 0 && (
            <AccountGroupCard
              title="Cash Accounts"
              accounts={overview.accountGroups.cash.accounts}
              totalBalance={overview.accountGroups.cash.totalBalance}
              unavailableBalanceCount={overview.accountGroups.cash.unavailableBalanceCount}
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
          {overview.accountGroups.investments.accounts.length > 0 && (
            <AccountGroupCard
              title="Investment Accounts"
              accounts={overview.accountGroups.investments.accounts}
              totalBalance={overview.accountGroups.investments.totalBalance}
              unavailableBalanceCount={overview.accountGroups.investments.unavailableBalanceCount}
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
          {overview.accountGroups.debt.accounts.length > 0 && (
            <AccountGroupCard
              title="Debt Accounts"
              accounts={overview.accountGroups.debt.accounts}
              totalBalance={overview.accountGroups.debt.totalBalance}
              unavailableBalanceCount={overview.accountGroups.debt.unavailableBalanceCount}
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

          {overview.accountGroups.other.accounts.length > 0 && (
            <AccountGroupCard
              title="Other Accounts"
              accounts={overview.accountGroups.other.accounts}
              totalBalance={overview.accountGroups.other.totalBalance}
              unavailableBalanceCount={overview.accountGroups.other.unavailableBalanceCount}
              isExpanded={selectedAccountGroup === 'other'}
              onToggle={() => setSelectedAccountGroup(selectedAccountGroup === 'other' ? null : 'other')}
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
          <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
            <Suspense fallback={<div className="text-gray-400">Loading manual accounts...</div>}>
              <ManualAccountList
                accounts={overview.manualAccounts}
                onRefresh={refreshManualAccounts}
              />
            </Suspense>
          </div>
        </div>
      </main>


      {/* Account Detail Modal */}
      {selectedAccount && selectedAccountId && (
        <Suspense fallback={<div className="fixed inset-0 z-50 grid place-items-center bg-black/50 text-white">Loading account details...</div>}>
          <AccountDetailModal
            account={selectedAccount}
            accountId={selectedAccountId}
            revisionId={overview.revision.id}
            onClose={() => {
              setSelectedAccount(null);
              setSelectedAccountId(null);
            }}
            onAccountRenamed={refreshAccounts}
          />
        </Suspense>
      )}
    </div>
  );
}
