"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, MessageSquareText } from 'lucide-react';
import AuthenticatedPageHeader from '../../components/authenticated/AuthenticatedPageHeader';
import BetaBadge from '../../components/authenticated/BetaBadge';
import CashFlowChart, { CashFlowChartLegend } from '../../components/cash-flow/CashFlowChart';
import CashFlowHighlights from '../../components/cash-flow/CashFlowHighlights';
import CashFlowPeriodTable, { CashPositionPeriodTable } from '../../components/cash-flow/CashFlowPeriodTable';
import CashPositionChart, { CashPositionLegend } from '../../components/cash-flow/CashPositionChart';
import CreditCardsPanel from '../../components/cash-flow/CreditCardsPanel';
import ForecastBasis from '../../components/cash-flow/ForecastBasis';
import ForecastBoard from '../../components/cash-flow/ForecastBoard';
import PlannedEventsPanel, { type CardPaymentRequest } from '../../components/cash-flow/PlannedEventsPanel';
import { clearStoredUserTimeZone } from '../../lib/browser-time-zone';
import { CONNECT_ACCOUNTS_PATH } from '../../lib/connect-accounts';
import {
  cardsLeftOutText,
  formatCalendarDate,
  formatMoney,
  lastIncludedDay,
  projectsCardDebt,
  unavailableMessage,
} from '../../lib/cash-flow-format';
import type { CashFlowGranularity, CashFlowReport } from '../../types/cash-flow';

type View = CashFlowGranularity | 'custom';

// Five full labels do not fit a phone-width row, so phones see the short ones.
const VIEWS: Array<{ value: View; label: string; shortLabel: string }> = [
  { value: 'week', label: 'Weekly', shortLabel: 'Week' },
  { value: 'month', label: 'Monthly', shortLabel: 'Month' },
  { value: 'quarter', label: 'Quarterly', shortLabel: 'Quarter' },
  { value: 'year', label: 'Annually', shortLabel: 'Year' },
  { value: 'custom', label: 'Custom', shortLabel: 'Custom' },
];

const HORIZONS = [1, 3, 6, 12];

const GROUPINGS: Array<{ value: CashFlowGranularity; label: string }> = [
  { value: 'week', label: 'By week' },
  { value: 'month', label: 'By month' },
  { value: 'quarter', label: 'By quarter' },
  { value: 'year', label: 'By year' },
];

const ASK_EXAMPLES = [
  'How much can I expect to save this month?',
  'How much will I save this quarter if my bonus comes through?',
  'What should I do with my expected surplus: pay down my card, invest it, or save it?',
];

type ChartView = 'savings' | 'position';

const POSITION_UNAVAILABLE: Record<string, string> = {
  forecast_unavailable: 'Cash position needs a forecast first.',
  no_cash_accounts: 'Connect a checking or savings account to see your cash position.',
  unknown_balance: 'One of your cash accounts didn’t report a balance, so your cash position can’t be added up yet.',
};

const controlClass =
  'min-h-10 rounded-full border border-[#102319]/15 bg-[#fffdf5] px-4 py-2 text-sm font-bold text-[#102319] transition hover:border-[#102319]/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#102319] focus-visible:ring-offset-2';

interface CustomRange {
  from: string;
  to: string;
  granularity: CashFlowGranularity;
}

type LoadState = 'loading' | 'ready' | 'empty' | 'error';

function EmptyState() {
  return (
    <div className="rounded-[2rem] border border-[#102319]/10 bg-[#fffdf5] p-8 text-center shadow-sm sm:p-12">
      <h2 className="text-2xl font-semibold tracking-[-0.03em] text-[#102319]">Connect an account to see your cash flow</h2>
      <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-[#5e6b63]">
        Cash flow is built from your checking, savings and credit card transactions.
      </p>
      <Link
        href={CONNECT_ACCOUNTS_PATH}
        className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-full bg-[#102319] px-5 py-2.5 text-sm font-bold text-white transition hover:bg-[#173c2c]"
      >
        Connect accounts <ArrowRight size={16} aria-hidden="true" />
      </Link>
    </div>
  );
}

export default function CashFlowPageClient() {
  const router = useRouter();
  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
  const [state, setState] = useState<LoadState>('loading');
  const [report, setReport] = useState<CashFlowReport | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [view, setView] = useState<View>('month');
  const [horizonMonths, setHorizonMonths] = useState(6);
  const [customRange, setCustomRange] = useState<CustomRange | null>(null);
  const [customDraft, setCustomDraft] = useState<CustomRange | null>(null);
  const [chartView, setChartView] = useState<ChartView>('savings');
  const [cardPaymentRequest, setCardPaymentRequest] = useState<CardPaymentRequest | null>(null);
  const requestRef = useRef(0);

  const query = useMemo(() => {
    const params = new URLSearchParams();
    if (view === 'custom' && customRange) {
      params.set('granularity', customRange.granularity);
      params.set('from', customRange.from);
      params.set('to', customRange.to);
    } else {
      params.set('granularity', view === 'custom' ? 'month' : view);
      params.set('horizonMonths', String(horizonMonths));
    }
    return params.toString();
  }, [view, customRange, horizonMonths]);

  const load = useCallback(async () => {
    const token = localStorage.getItem('auth_token');
    if (!token) {
      router.push('/login');
      return;
    }
    const requestId = ++requestRef.current;
    setRefreshing(true);
    try {
      const response = await fetch(`${API_URL}/api/cash-flow?${query}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      // A newer request was made while this one was in flight; let it decide.
      if (requestId !== requestRef.current) return;
      if (response.status === 401) {
        router.push('/login');
        return;
      }
      if (response.status === 204) {
        setReport(null);
        setState('empty');
        return;
      }
      if (!response.ok) throw new Error('Failed to load cash flow');
      setReport(await response.json() as CashFlowReport);
      setState('ready');
    } catch (error) {
      if (requestId !== requestRef.current) return;
      console.error('Error loading cash flow:', error);
      setState(current => (current === 'ready' ? current : 'error'));
    } finally {
      if (requestId === requestRef.current) setRefreshing(false);
    }
  }, [API_URL, query, router]);

  useEffect(() => {
    void load();
  }, [load]);

  const chooseView = (next: View) => {
    if (next === 'custom' && !customDraft && report) {
      setCustomDraft({ from: report.range.from, to: lastIncludedDay(report.range.toExclusive), granularity: report.granularity });
    }
    setView(next);
  };

  const handleLogout = () => {
    localStorage.removeItem('auth_token');
    clearStoredUserTimeZone();
    router.push('/login');
  };

  const header = (
    <AuthenticatedPageHeader
      activePage="cash-flow"
      eyebrow="Cash flow"
      title="Cash in, cash out"
      badge={<BetaBadge />}
      onLogout={handleLogout}
    />
  );

  if (state === 'loading') {
    return (
      <div className="authenticated-site min-h-screen">
        {header}
        <div className="flex justify-center py-24" role="status">
          <div className="h-10 w-10 animate-spin rounded-full border-b-2 border-[#102319]" aria-hidden="true" />
          <span className="sr-only">Loading your cash flow…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="authenticated-site min-h-screen">
      {header}
      <main className="mx-auto max-w-[1200px] space-y-6 p-5 py-10 sm:px-6 md:py-12">
        <div className="authenticated-intro mb-10">
          <h2>What’s coming in, what’s going out, and what’s left.</h2>
          <p>
            Your income and spending across checking, savings and credit cards, with a forecast built from your
            regular paychecks and bills, your typical spending, and anything you plan.
          </p>
        </div>

        {state === 'error' && (
          <div className="rounded-2xl border border-[#b84a3d]/25 bg-[#f8e8e3] p-5 text-sm text-[#8b3027]" role="alert">
            We couldn’t load your cash flow.{' '}
            <button type="button" onClick={() => void load()} className="font-bold underline">Try again</button>
          </div>
        )}

        {state === 'empty' && <EmptyState />}

        {state === 'ready' && report && (
          <div className={`space-y-6 transition-opacity ${refreshing ? 'opacity-60' : ''}`} aria-busy={refreshing}>
            {!report.forecast.available && (
              <div className="rounded-2xl border border-[#d4a72c]/30 bg-[#fff3ce] p-4 text-sm leading-6 text-[#76510f]" role="status">
                {unavailableMessage(report.forecast.reason)}
              </div>
            )}
            {report.snapshot.status === 'partial' && (
              <div className="rounded-2xl border border-[#d4a72c]/30 bg-[#fff3ce] p-4 text-sm leading-6 text-[#76510f]" role="status">
                Some accounts didn’t update last time, so recent activity may be missing.
              </div>
            )}

            {report.forecast.available && <CashFlowHighlights report={report} />}

            <section className="rounded-[1.6rem] border border-[#102319]/10 bg-[#fffdf5] p-5 shadow-sm sm:p-7" aria-labelledby="cash-flow-chart-heading">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <h3 id="cash-flow-chart-heading" className="text-lg font-semibold text-[#102319]">Cash flow over time</h3>
                  <p className="mt-1 text-xs text-[#66736b]">
                    Transactions through {formatCalendarDate(report.dataThrough)}
                    {report.forecast.available ? ` · forecast from ${formatCalendarDate(report.forecastStart)}` : ''}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="grid w-full grid-cols-5 gap-1 rounded-xl border border-[#102319]/10 bg-[#f3f2e9] p-1 sm:w-auto" role="group" aria-label="Group cash flow by">
                    {VIEWS.map(option => (
                      <button
                        key={option.value}
                        type="button"
                        aria-label={option.label}
                        aria-pressed={view === option.value}
                        onClick={() => chooseView(option.value)}
                        className={`min-w-0 rounded-md px-1 py-2 text-xs font-semibold transition-colors sm:px-3 sm:text-sm ${view === option.value ? 'bg-[#102319] text-white shadow-sm' : 'text-[#5e6b63] hover:bg-white/60 hover:text-[#102319]'}`}
                      >
                        <span className="sm:hidden">{option.shortLabel}</span>
                        <span className="hidden sm:inline">{option.label}</span>
                      </button>
                    ))}
                  </div>
                  {view !== 'custom' && (
                    <label className="sr-only" htmlFor="cash-flow-horizon">Forecast length</label>
                  )}
                  {view !== 'custom' && (
                    <select
                      id="cash-flow-horizon"
                      className={controlClass}
                      value={horizonMonths}
                      onChange={event => setHorizonMonths(Number(event.target.value))}
                    >
                      {HORIZONS.map(months => (
                        <option key={months} value={months}>
                          Forecast {months} month{months === 1 ? '' : 's'}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              </div>

              {view === 'custom' && customDraft && (
                <form
                  className="mt-4 flex flex-wrap items-end gap-3 rounded-2xl border border-[#102319]/10 bg-[#f3f2e9] p-4"
                  onSubmit={event => {
                    event.preventDefault();
                    if (customDraft.from && customDraft.to && customDraft.from <= customDraft.to) setCustomRange(customDraft);
                  }}
                >
                  <label className="text-xs font-bold text-[#102319]">
                    From
                    <input
                      type="date"
                      className={`${controlClass} mt-1 block font-semibold`}
                      value={customDraft.from}
                      onChange={event => setCustomDraft({ ...customDraft, from: event.target.value })}
                      required
                    />
                  </label>
                  <label className="text-xs font-bold text-[#102319]">
                    To
                    <input
                      type="date"
                      className={`${controlClass} mt-1 block font-semibold`}
                      value={customDraft.to}
                      min={customDraft.from}
                      onChange={event => setCustomDraft({ ...customDraft, to: event.target.value })}
                      required
                    />
                  </label>
                  <label className="text-xs font-bold text-[#102319]">
                    Show
                    <select
                      className={`${controlClass} mt-1 block`}
                      value={customDraft.granularity}
                      onChange={event => setCustomDraft({ ...customDraft, granularity: event.target.value as CashFlowGranularity })}
                    >
                      {GROUPINGS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                  </label>
                  <button type="submit" className="min-h-10 rounded-full bg-[#102319] px-5 py-2 text-sm font-bold text-white transition hover:bg-[#173c2c]">
                    Show range
                  </button>
                </form>
              )}

              <div className="mt-5 grid w-full max-w-sm grid-cols-2 gap-1 rounded-xl border border-[#102319]/10 bg-[#f3f2e9] p-1" role="group" aria-label="Show">
                {([['savings', 'Savings'], ['position', 'Cash position']] as Array<[ChartView, string]>).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={chartView === value}
                    onClick={() => setChartView(value)}
                    className={`rounded-md px-3 py-2 text-sm font-semibold transition-colors ${chartView === value ? 'bg-[#102319] text-white shadow-sm' : 'text-[#5e6b63] hover:bg-white/60 hover:text-[#102319]'}`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {chartView === 'savings' ? (
                <div className="mt-5">
                  <CashFlowChartLegend />
                  <div className="mt-3">
                    <CashFlowChart report={report} />
                  </div>
                  {/* Only when Cash position will actually apply an upcoming plan: expired
                      events and one-time plans on unprojected cards never move it. */}
                  {report.position.available && report.plannedEvents.some(event => {
                    if (event.kind !== 'card_payment' || event.nextDate === null || !event.accountId) return false;
                    const card = report.cards.find(item => item.accountId === event.accountId);
                    return Boolean(card && (card.currentPace || card.withPlans));
                  }) && (
                    <p className="mt-3 text-xs leading-5 text-[#66736b]">
                      Card payments aren’t cash out here: purchases already count when you make them. Your planned card
                      payments show in Cash position.
                    </p>
                  )}
                </div>
              ) : report.position.available ? (
                <div className="mt-5">
                  <CashPositionLegend hasCards={projectsCardDebt(report)} />
                  {cardsLeftOutText(report) && (
                    <p className="mt-2 text-xs leading-5 text-[#76510f]">
                      {projectsCardDebt(report) ? 'Owed on credit cards leaves out ' : 'Credit card balances aren’t shown: '}
                      {cardsLeftOutText(report)}.
                    </p>
                  )}
                  <div className="mt-3">
                    <CashPositionChart report={report} />
                  </div>
                  {report.position.lowPoint && (
                    <p className={`mt-3 text-sm ${report.position.lowPoint.cash < 0 ? 'font-bold text-[#9b4137]' : 'text-[#5e6b63]'}`}>
                      Lowest point: {formatMoney(report.position.lowPoint.cash)} on {formatCalendarDate(report.position.lowPoint.date)}
                      {report.position.lowPoint.cash < 0 ? ' — your cash is projected to run short.' : '.'}
                    </p>
                  )}
                  <p className="mt-1 text-xs leading-5 text-[#66736b]">
                    Starts from {formatMoney(report.position.startingCash ?? 0)} across your checking and savings. Card payments
                    come out of cash on their due days; planned income and expenses are assumed to go through cash.
                  </p>
                </div>
              ) : (
                <p className="mt-5 rounded-2xl border border-[#d4a72c]/30 bg-[#fff3ce] p-4 text-sm leading-6 text-[#76510f]" role="status">
                  {POSITION_UNAVAILABLE[report.position.reason ?? ''] ?? 'Cash position isn’t available yet.'}
                </p>
              )}

              {/* Each view tabulates its own figures; with no cash position there is nothing to list. */}
              {(chartView === 'savings' || report.position.available) && (
                <details className="mt-4 rounded-2xl border border-[#102319]/10 bg-white/50 p-4">
                  <summary className="cursor-pointer text-sm font-bold text-[#102319]">See every period</summary>
                  <div className="mt-3">
                    {chartView === 'savings' ? <CashFlowPeriodTable report={report} /> : <CashPositionPeriodTable report={report} />}
                  </div>
                </details>
              )}
            </section>

            <CreditCardsPanel
              cards={report.cards}
              onPlanPayment={accountId => setCardPaymentRequest(current => ({ accountId, requestId: (current?.requestId ?? 0) + 1 }))}
            />

            <ForecastBoard report={report} apiUrl={API_URL} onChanged={load} />

            <PlannedEventsPanel
              apiUrl={API_URL}
              events={report.plannedEvents}
              cards={report.cards}
              cardPaymentRequest={cardPaymentRequest}
              today={report.today}
              forecastStart={report.forecastStart}
              onChanged={load}
            />

            <ForecastBasis report={report} />

            <section className="flex flex-col gap-4 rounded-[1.6rem] bg-[#102319] p-6 text-white sm:flex-row sm:items-center sm:justify-between sm:p-8">
              <div>
                <h3 className="text-lg font-semibold">Ask Linc about your cash flow</h3>
                <ul className="mt-2 space-y-1 text-sm text-white/70">
                  {ASK_EXAMPLES.map(example => <li key={example}>“{example}”</li>)}
                </ul>
              </div>
              <Link
                href="/app"
                className="inline-flex min-h-11 shrink-0 items-center gap-2 self-start rounded-full bg-[#d9ff6f] px-5 py-2.5 text-sm font-bold text-[#102319] transition hover:bg-white sm:self-center"
              >
                <MessageSquareText size={16} aria-hidden="true" />
                Ask in Decisions
              </Link>
            </section>

            <p className="text-xs leading-5 text-[#66736b]">
              Cash flow is in beta. Forecasts are estimates from your history and the events you add, not guarantees.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
