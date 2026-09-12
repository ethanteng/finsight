'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BarChart3,
  ChevronDown,
  CircleDollarSign,
  Database,
  ExternalLink,
  FlaskConical,
  Link2,
  Mail,
  MessageCircle,
  RefreshCw,
  Target,
} from 'lucide-react';
import PageMeta from '../../../components/PageMeta';
import AuthenticatedPageHeader from '../../../components/authenticated/AuthenticatedPageHeader';
import { markInternalAnalyticsBrowser } from '../../../lib/internal-analytics';

type Metric = {
  value: number | null;
  previous: number | null;
  unit: 'count' | 'percent' | 'seconds' | 'currency';
  source: string;
  note?: string;
};

type JourneyStage = {
  id: 'qualified_visit' | 'calculator_result' | 'plan_cta' | 'trial_complete';
  label: string;
  value: number | null;
  previous: number | null;
  conversionRate: number | null;
  previousConversionRate: number | null;
  note: string;
};

type SourceDiagnostic = {
  id: string;
  name: string;
  state: string;
  freshness: string | null;
  detail: string;
};

type LeadCapture = {
  resultsEmailedSessions: Metric;
  captureRate: Metric;
  emailCtaOpenedSessions: Metric;
  emailTrialCompletedSessions: Metric;
  firstParty: {
    state: 'live' | 'error';
    requests: number | null;
    emailsSent: number | null;
    uniqueEmails: number | null;
    mailerliteSynced: number | null;
    continuedToSignup: number | null;
    matchedAccounts: number | null;
    deliveryRate: number | null;
    continuationRate: number | null;
    accountMatchRate: number | null;
    note: string;
  };
};

interface Report {
  period: { start: string; end: string; previousStart: string; previousEnd: string };
  coverage: {
    eventTrackingStartedAt: string | null;
    fullyObservedThrough: string | null;
    usesFallbackSnapshot: boolean;
  };
  firstParty: {
    accountsCreated: number | null;
    createdAccountsWithFinancialConnection: number | null;
    createdAccountsWithConversation: number | null;
    createdAccountsCurrentlyPaid: number | null;
  };
  retirementCalculatorHealth: {
    state: 'live' | 'error';
    windowDays: number;
    submissions: number | null;
    answered: number | null;
    rejected: number | null;
    answerRate: number | null;
    note: string;
  };
  beachhead: {
    state: 'prelaunch' | 'collecting' | 'measuring' | 'needs_configuration' | 'error';
    cohortLabel: string;
    cohortDefinition: string;
    coastFireJourney: JourneyStage[];
    currentCalculatorBaseline: JourneyStage[];
    leadCapture: {
      coastFire: LeadCapture;
      retirement: LeadCapture;
    };
    downstream: {
      financialConnectionRate: Metric;
      activationRate: Metric;
      paidRate: Metric;
    };
    evidenceGaps: string[];
  };
  diagnostics: SourceDiagnostic[];
  warnings: string[];
}

type Filters = { days: 7 | 28 | 90; compare: boolean };

const DEFAULT_FILTERS: Filters = { days: 28, compare: true };
const count = (value: number | null) => value === null
  ? '—'
  : new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value);
const percent = (value: number | null) => value === null
  ? '—'
  : `${(value * 100).toFixed(value < 0.1 ? 1 : 0)}%`;
const precisePercent = (value: number | null) => value === null
  ? '—'
  : `${(value * 100).toFixed(1)}%`;
const shortDate = (value: string) => new Date(`${value}T12:00:00`).toLocaleDateString('en-US', {
  month: 'short',
  day: 'numeric',
});
const freshness = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value)
  ? new Date(`${value}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  : new Date(value).toLocaleString();

function change(current: number | null, previous: number | null): string | null {
  if (current === null || previous === null || previous === 0) return null;
  const delta = (current - previous) / previous;
  return `${delta >= 0 ? '+' : ''}${(delta * 100).toFixed(0)}%`;
}

function rateChange(current: number | null, previous: number | null): string | null {
  if (current === null || previous === null) return null;
  const points = (current - previous) * 100;
  return `${points >= 0 ? '+' : ''}${points.toFixed(1)} pts`;
}

function StatePill({ state }: { state: Report['beachhead']['state'] }) {
  const copy = state === 'measuring'
    ? 'Measuring'
    : state === 'prelaunch'
      ? 'Pre-launch baseline'
      : state === 'needs_configuration'
        ? 'Needs configuration'
        : state === 'error'
          ? 'Data source error'
          : 'Data collecting';
  const style = state === 'measuring'
    ? 'bg-[#d8ff71] text-[#102319]'
    : state === 'prelaunch'
      ? 'bg-[#f6d98f] text-[#5e3d06]'
      : state === 'error'
        ? 'bg-[#f8e8e3] text-[#8b3027]'
        : 'bg-[#f4ead0] text-[#76510f]';
  return <span className={`inline-flex rounded-full px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-[.1em] ${style}`}>{copy}</span>;
}

function Journey({
  stages,
  compare,
  unavailableLabel,
}: {
  stages: JourneyStage[];
  compare: boolean;
  unavailableLabel: string;
}) {
  return <div className="mt-6 grid gap-3 lg:grid-cols-4">
    {stages.map((stage, index) => {
      const countDelta = compare ? change(stage.value, stage.previous) : null;
      const conversionDelta = compare ? rateChange(stage.conversionRate, stage.previousConversionRate) : null;
      return <div key={stage.id} className="relative min-w-0">
        <article className="h-full rounded-[18px] border border-[#102319]/10 bg-[#f8f7ef] p-4 sm:p-5">
          <div className="flex items-center justify-between gap-3">
            <span className="grid h-7 w-7 place-items-center rounded-full bg-[#e4eadf] text-xs font-extrabold text-[#315d45]">{index + 1}</span>
            {countDelta && <span className="rounded-full bg-[#e4eadf] px-2 py-1 text-[10px] font-bold text-[#315d45]">{countDelta}</span>}
          </div>
          <div className="mt-5 text-[clamp(1.8rem,4vw,2.6rem)] font-semibold leading-none tracking-[-.055em] tabular-nums">
            {count(stage.value)}
          </div>
          <h3 className="mt-3 text-sm font-bold">{stage.label}</h3>
          <p className="mt-2 min-h-5 text-[11px] font-semibold text-[#66736b]">
            {stage.value === null
              ? unavailableLabel
              : index === 0
                ? 'Sessions'
                : `${percent(stage.conversionRate)} from prior step${conversionDelta ? ` · ${conversionDelta}` : ''}`}
          </p>
          <p className="mt-3 text-[10px] leading-4 text-[#7b867f]">{stage.note}</p>
        </article>
        {index < stages.length - 1 && <span className="absolute -right-5 top-1/2 z-10 hidden h-7 w-7 -translate-y-1/2 place-items-center rounded-full border border-[#102319]/10 bg-[#fffdf5] text-[#49725a] lg:grid"><ArrowRight size={13} /></span>}
      </div>;
    })}
  </div>;
}

function LeadCapturePanel({ capture }: { capture: LeadCapture }) {
  const cells = [
    ['GA4 email requests', count(capture.resultsEmailedSessions.value), capture.resultsEmailedSessions.note],
    ['GA4 capture rate', precisePercent(capture.captureRate.value), capture.captureRate.note],
    ['GA4 email CTA opens', count(capture.emailCtaOpenedSessions.value), capture.emailCtaOpenedSessions.note],
    ['GA4 email-path trials', count(capture.emailTrialCompletedSessions.value), capture.emailTrialCompletedSessions.note],
    ['First-party emails sent', count(capture.firstParty.emailsSent), `${precisePercent(capture.firstParty.deliveryRate)} of stored requests`],
    ['Unique lead emails', count(capture.firstParty.uniqueEmails), `${count(capture.firstParty.mailerliteSynced)} synced to MailerLite`],
    ['First-party continuations', count(capture.firstParty.continuedToSignup), `${precisePercent(capture.firstParty.continuationRate)} of delivered emails`],
    ['Matched accounts', count(capture.firstParty.matchedAccounts), `${precisePercent(capture.firstParty.accountMatchRate)} of unique lead emails`],
  ];
  return <div className="mt-6 rounded-[18px] border border-[#102319]/10 bg-[#edf1e9] p-4 sm:p-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#102319] text-[#d8ff71]"><Mail size={16} /></span>
        <div>
          <p className="text-[10px] font-extrabold uppercase tracking-[.14em] text-[#49725a]">Known-prospect branch</p>
          <h3 className="mt-1 text-base font-semibold tracking-[-.025em]">Email me these results</h3>
          <p className="mt-1 max-w-4xl text-[10px] leading-4 text-[#66736b]">GA4 rows are attributed sessions from the settled daily export. First-party rows are live Postgres delivery and continuation records. {capture.firstParty.note}</p>
        </div>
      </div>
      <SourcePill state={capture.firstParty.state} />
    </div>
    <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
      {cells.map(([label, value, note]) => <div key={label} className="rounded-xl bg-[#fffdf5] px-4 py-3">
        <div className="text-2xl font-semibold tracking-[-.04em] tabular-nums">{value}</div>
        <div className="mt-1 text-[11px] font-bold text-[#66736b]">{label}</div>
        <div className="mt-1 text-[9px] leading-4 text-[#89938c]">{note}</div>
      </div>)}
    </div>
  </div>;
}

function OutcomeCard({
  icon,
  label,
  metric,
  numerator,
  denominator,
}: {
  icon: ReactNode;
  label: string;
  metric: Metric;
  numerator: number | null;
  denominator: number | null;
}) {
  return <article className="rounded-[18px] border border-[#102319]/10 bg-[#fffdf5] p-5 shadow-[0_14px_36px_rgba(16,35,25,.045)]">
    <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#e9eee5] text-[#397052]">{icon}</span>
    <div className="mt-5 text-3xl font-semibold tracking-[-.05em] tabular-nums">{percent(metric.value)}</div>
    <h3 className="mt-2 text-sm font-bold">{label}</h3>
    <p className="mt-1 text-xs text-[#66736b]">{numerator === null || denominator === null ? 'Unavailable' : `${count(numerator)} of ${count(denominator)} new accounts`}</p>
    <p className="mt-3 text-[10px] leading-4 text-[#7b867f]">{metric.note}</p>
  </article>;
}

function SourcePill({ state }: { state: string }) {
  const live = state === 'live';
  const snapshot = state === 'verified_snapshot';
  const style = live
    ? 'bg-[#dff3e5] text-[#286044]'
    : snapshot
      ? 'bg-[#e8eee5] text-[#486657]'
      : state === 'collecting'
        ? 'bg-[#f4ead0] text-[#76510f]'
        : 'bg-[#f8e8e3] text-[#8b3027]';
  return <span className={`rounded-full px-2.5 py-1 text-[9px] font-extrabold uppercase tracking-[.07em] ${style}`}>{state.replaceAll('_', ' ')}</span>;
}

export default function MarketingDashboardPage() {
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const apiUrl = process.env.NEXT_PUBLIC_API_URL;

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const query = new URLSearchParams({ days: String(filters.days), compare: String(filters.compare) });
      const token = localStorage.getItem('auth_token');
      const response = await fetch(`${apiUrl}/admin/marketing?${query}`, {
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      });
      if (response.status === 401 || response.status === 403) throw new Error('Sign in with an admin account to view this scorecard.');
      if (!response.ok) throw new Error('Marketing data could not be loaded.');
      const nextReport = await response.json() as Report;
      markInternalAnalyticsBrowser();
      setReport(nextReport);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Marketing data could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [apiUrl, filters]);

  useEffect(() => { void load(); }, [load]);

  const ga4Diagnostic = report?.diagnostics.find(source => source.id === 'ga4');
  const journeyUnavailableLabel = report?.beachhead.state === 'prelaunch'
    ? 'Not launched'
    : report?.beachhead.state === 'needs_configuration'
      ? 'Needs configuration'
      : report?.beachhead.state === 'error'
        ? 'Source error'
        : 'Collecting';

  return <>
    <PageMeta title="Coast FIRE GTM scorecard | Ask Linc" description="A focused scorecard for testing Ask Linc's Coast FIRE beachhead." />
    <div className="authenticated-site min-h-screen bg-[#f2f1e8] text-[#102319]">
      <AuthenticatedPageHeader activePage="admin" eyebrow="Go-to-market" title="Coast FIRE scorecard" />
      <main className="mx-auto max-w-[1180px] px-4 pb-20 pt-7 sm:px-6">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <Link href="/admin" className="inline-flex items-center gap-2 text-sm font-bold text-[#486657] hover:text-[#102319]"><ArrowLeft size={15} /> Back to administration</Link>
          <button type="button" onClick={() => void load()} disabled={loading} className="admin-button-secondary gap-2"><RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh</button>
        </div>

        <section className="overflow-hidden rounded-[26px] bg-[#102319] text-white shadow-[0_26px_70px_rgba(16,35,25,.16)]">
          <div className="grid gap-8 px-5 py-7 sm:px-8 lg:grid-cols-[1.35fr_.65fr] lg:px-10 lg:py-10">
            <div>
              <StatePill state={report?.beachhead.state || 'collecting'} />
              <p className="mt-5 text-[10px] font-extrabold uppercase tracking-[.16em] text-[#d8ff71]">The decision this page should answer</p>
              <h2 className="mt-3 max-w-3xl font-serif text-[clamp(2.15rem,5vw,4.2rem)] italic leading-[.96] tracking-[-.045em]">Are Coast FIRE planners moving from a free number to a real plan?</h2>
              <p className="mt-5 max-w-2xl text-sm leading-6 text-white/65">One acquisition-to-value journey, a clean comparison baseline, and no generic engagement metrics that distract from the beachhead test.</p>
            </div>
            <div className="self-end rounded-2xl border border-white/10 bg-white/[.06] p-5">
              <div className="text-2xl font-semibold tracking-[-.05em]">{report ? `${shortDate(report.period.start)}–${shortDate(report.period.end)}` : '—'}</div>
              <p className="mt-2 text-xs text-white/55">Daily-export window</p>
              <div className="mt-5 flex flex-wrap gap-2">
                {([7, 28, 90] as const).map(days => <button key={days} type="button" onClick={() => setFilters(current => ({ ...current, days }))} className={`min-h-9 rounded-full px-3 text-xs font-bold ${filters.days === days ? 'bg-[#d8ff71] text-[#102319]' : 'bg-white/10 text-white'}`}>{days}d</button>)}
              </div>
              <label className="mt-3 inline-flex items-center gap-2 text-xs font-semibold text-white/70"><input type="checkbox" checked={filters.compare} onChange={event => setFilters(current => ({ ...current, compare: event.target.checked }))} /> Compare previous period</label>
            </div>
          </div>
        </section>

        {error && <div className="mt-6 rounded-2xl border border-[#b84a3d]/25 bg-[#f8e8e3] p-5 text-sm text-[#8b3027]"><AlertTriangle className="mr-2 inline" size={17} />{error}</div>}
        {loading && !report && <div className="grid min-h-[360px] place-items-center"><div className="flex items-center gap-3 text-sm font-bold text-[#486657]"><RefreshCw className="animate-spin" size={18} /> Loading the scorecard…</div></div>}

        {report && <div className={loading ? 'pointer-events-none opacity-55 transition-opacity' : 'transition-opacity'}>
          <section className="mt-8 rounded-[24px] border border-[#102319]/10 bg-[#fffdf5] p-5 shadow-[0_18px_45px_rgba(16,35,25,.05)] sm:p-7">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex max-w-3xl gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#e9eee5] text-[#397052]"><Target size={19} /></span>
                <div>
                  <p className="text-[10px] font-extrabold uppercase tracking-[.14em] text-[#49725a]">Beachhead journey</p>
                  <h2 className="mt-1 text-2xl font-semibold tracking-[-.035em]">Coast FIRE experiment</h2>
                  <p className="mt-2 text-sm leading-6 text-[#66736b]">{report.beachhead.cohortDefinition}</p>
                </div>
              </div>
              <StatePill state={report.beachhead.state} />
            </div>

            {report.beachhead.state === 'prelaunch' && <div className="mt-6 rounded-2xl border border-[#9d6a16]/20 bg-[#f4ead0] p-4 text-sm leading-6 text-[#654710]">
              <strong>The experiment is not live yet.</strong> The Coast FIRE experience is still marked prelaunch in code (<code>COAST_FIRE_EXPERIMENT.live</code>). The current <code>/retirement-calculator</code> baseline remains the comparison surface; these blanks are intentional, not zero conversions.
            </div>}

            {(report.beachhead.state === 'needs_configuration' || report.beachhead.state === 'error') && <div className="mt-6 rounded-2xl border border-[#b84a3d]/25 bg-[#f8e8e3] p-4 text-sm leading-6 text-[#7d3028]">
              <AlertTriangle className="mr-2 inline" size={16} /><strong>{report.beachhead.state === 'error' ? 'GA4 reporting failed.' : 'GA4 reporting needs configuration.'}</strong>{' '}{ga4Diagnostic?.detail || 'Open the data-source diagnostics below for details.'}
            </div>}

            <Journey stages={report.beachhead.coastFireJourney} compare={filters.compare} unavailableLabel={journeyUnavailableLabel} />
            <LeadCapturePanel capture={report.beachhead.leadCapture.coastFire} />
          </section>

          <section className="mt-6 rounded-[24px] border border-[#102319]/10 bg-[#fffdf5] p-5 shadow-[0_18px_45px_rgba(16,35,25,.05)] sm:p-7">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex max-w-3xl gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#e9eee5] text-[#397052]"><FlaskConical size={19} /></span>
                <div>
                  <p className="text-[10px] font-extrabold uppercase tracking-[.14em] text-[#49725a]">Comparison, not the new strategy</p>
                  <h2 className="mt-1 text-2xl font-semibold tracking-[-.035em]">Current retirement-calculator baseline</h2>
                  <p className="mt-2 text-sm leading-6 text-[#66736b]">Standard calculator sessions only, excluding any explicit Coast FIRE signal. This shows the existing handoff from a result to “Run this with my actual finances.”</p>
                </div>
              </div>
              <Link href="/admin/retirement-calculator" className="inline-flex items-center gap-2 rounded-full border border-[#102319]/10 bg-[#f8f7ef] px-3 py-2 text-xs font-bold text-[#397052] hover:border-[#397052]/35">Calculator health <ExternalLink size={12} /></Link>
            </div>
            {report.retirementCalculatorHealth && <div className="mt-6 rounded-[18px] border border-[#102319]/10 bg-[#edf1e9] p-4 sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] font-extrabold uppercase tracking-[.14em] text-[#49725a]">First-party product health · last {report.retirementCalculatorHealth.windowDays} days</p>
                  <p className="mt-1 text-xs leading-5 text-[#66736b]">{report.retirementCalculatorHealth.note}</p>
                </div>
                <SourcePill state={report.retirementCalculatorHealth.state} />
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
                {[
                  ['Submissions', count(report.retirementCalculatorHealth.submissions)],
                  ['Answered', count(report.retirementCalculatorHealth.answered)],
                  ['Answer rate', precisePercent(report.retirementCalculatorHealth.answerRate)],
                  ['Rejected', count(report.retirementCalculatorHealth.rejected)],
                ].map(([label, value]) => <div key={label} className="rounded-xl bg-[#fffdf5] px-4 py-3"><div className="text-2xl font-semibold tracking-[-.04em] tabular-nums">{value}</div><div className="mt-1 text-[11px] font-bold text-[#66736b]">{label}</div></div>)}
              </div>
            </div>}
            <Journey stages={report.beachhead.currentCalculatorBaseline} compare={filters.compare} unavailableLabel={journeyUnavailableLabel} />
            <LeadCapturePanel capture={report.beachhead.leadCapture.retirement} />
          </section>

          <section className="mt-10">
            <div className="max-w-3xl">
              <p className="text-[10px] font-extrabold uppercase tracking-[.14em] text-[#49725a]">Downstream value</p>
              <h2 className="mt-1 text-2xl font-semibold tracking-[-.035em]">Do new accounts become valuable users?</h2>
              <p className="mt-2 text-sm leading-6 text-[#66736b]">These are the right outcomes—financial connection, activation, and payment—but they currently describe all new accounts because marketing attribution is not stored with the user.</p>
            </div>
            <div className="mt-5 grid gap-4 md:grid-cols-3">
              <OutcomeCard icon={<Link2 size={17} />} label="Connected financial data" metric={report.beachhead.downstream.financialConnectionRate} numerator={report.firstParty.createdAccountsWithFinancialConnection} denominator={report.firstParty.accountsCreated} />
              <OutcomeCard icon={<MessageCircle size={17} />} label="Asked a planning question" metric={report.beachhead.downstream.activationRate} numerator={report.firstParty.createdAccountsWithConversation} denominator={report.firstParty.accountsCreated} />
              <OutcomeCard icon={<CircleDollarSign size={18} />} label="Paid now" metric={report.beachhead.downstream.paidRate} numerator={report.firstParty.createdAccountsCurrentlyPaid} denominator={report.firstParty.accountsCreated} />
            </div>
          </section>

          <section className="mt-10 grid gap-5 lg:grid-cols-[1.1fr_.9fr]">
            <article className="rounded-[22px] bg-[#102319] p-6 text-white shadow-[0_18px_45px_rgba(16,35,25,.1)]">
              <div className="flex gap-3"><BarChart3 className="mt-0.5 shrink-0 text-[#d8ff71]" size={19} /><div><p className="text-[10px] font-extrabold uppercase tracking-[.14em] text-[#d8ff71]">How to read the test</p><h2 className="mt-1 text-xl font-semibold">The conversion hierarchy</h2></div></div>
              <ol className="mt-6 space-y-4">
                {[
                  ['Demand', 'Can explicit Coast FIRE positioning attract qualified planner traffic?'],
                  ['Intent', 'After seeing a result, do people ask to stress-test it with their actual finances?'],
                  ['Value', 'Do those people connect data, ask planning questions, and ultimately pay?'],
                ].map(([label, detail], index) => <li key={label} className="flex gap-3"><span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[#d8ff71] text-xs font-extrabold text-[#102319]">{index + 1}</span><div><h3 className="text-sm font-bold">{label}</h3><p className="mt-1 text-xs leading-5 text-white/60">{detail}</p></div></li>)}
              </ol>
            </article>

            <article className="rounded-[22px] border border-[#102319]/10 bg-[#fffdf5] p-6">
              <div className="flex gap-3"><Database className="mt-0.5 shrink-0 text-[#397052]" size={19} /><div><p className="text-[10px] font-extrabold uppercase tracking-[.14em] text-[#49725a]">Known measurement gaps</p><h2 className="mt-1 text-xl font-semibold">What must be true before scaling</h2></div></div>
              <ul className="mt-5 space-y-3">
                {report.beachhead.evidenceGaps.map(gap => <li key={gap} className="flex gap-3 text-xs leading-5 text-[#5f6c64]"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#9d6a16]" />{gap}</li>)}
              </ul>
            </article>
          </section>

          <details className="group mt-8 rounded-[20px] border border-[#102319]/10 bg-[#fffdf5]">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 p-5 text-sm font-bold">
              <span className="flex items-center gap-2"><Database size={16} className="text-[#397052]" /> Data sources, freshness, and instrumentation notes</span>
              <ChevronDown size={16} className="transition-transform group-open:rotate-180" />
            </summary>
            <div className="border-t border-[#102319]/10 p-5">
              {report.warnings.length > 0 && <div className="mb-5 rounded-2xl border border-[#9d6a16]/20 bg-[#f4ead0] p-4"><div className="flex gap-3"><AlertTriangle className="mt-0.5 shrink-0 text-[#76510f]" size={16} /><ul className="space-y-1 text-xs leading-5 text-[#654710]">{report.warnings.map(warning => <li key={warning}>{warning}</li>)}</ul></div></div>}
              <div className="grid gap-3 md:grid-cols-2">
                {report.diagnostics.map(source => <article key={source.id} className="rounded-2xl border border-[#102319]/9 bg-[#f8f7ef] p-4">
                  <div className="flex items-center justify-between gap-3"><h3 className="text-sm font-bold">{source.name}</h3><SourcePill state={source.state} /></div>
                  <p className="mt-3 text-xs leading-5 text-[#66736b]">{source.detail}</p>
                  <p className="mt-3 text-[10px] font-semibold text-[#7b867f]">{source.freshness ? `Freshness: ${freshness(source.freshness)}` : 'No freshness timestamp'}</p>
                </article>)}
              </div>
              <div className="mt-5 flex flex-wrap gap-4 text-xs font-bold">
                <a href="https://analytics.google.com/analytics/web/#/analysis/a380265295p519498279/edit/HXBtWKU2Ra-DR6xfs5TmZQ" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-[#397052]">Open GA4 exploration <ExternalLink size={13} /></a>
                <a href="https://app.contentsquare.com/#/dashboards/2193ca02-d057-4f22-83d0-2345fb793f9f?project=530048" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-[#397052]">Open Contentsquare <ExternalLink size={13} /></a>
              </div>
            </div>
          </details>
        </div>}
      </main>
    </div>
  </>;
}
