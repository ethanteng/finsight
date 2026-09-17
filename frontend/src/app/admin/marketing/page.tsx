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

type LeadSummary = {
  state: 'live' | 'error';
  periodStart: string;
  periodEnd: string;
  requests: number | null;
  emailsSent: number | null;
  uniqueEmails: number | null;
  mailerliteSynced: number | null;
  continuedToSignup: number | null;
  matchedAccounts: number | null;
  verifiedMatchedAccounts?: number | null;
  savedResultAccounts?: number | null;
  attributionCaptured: number | null;
  paidAttributionCaptured: number | null;
  deliveryRate: number | null;
  continuationRate: number | null;
  accountMatchRate: number | null;
  attributionRate: number | null;
  note: string;
};

type LeadCapture = {
  resultSessions: Metric;
  rawResultsEmailedEvents: Metric;
  resultsEmailedSessions: Metric;
  emailRequestExclusions: Array<{
    reason: 'traffic_quality' | 'outside_journey' | 'missing_result' | 'unproven_order';
    label: string;
    sessions: number;
  }>;
  captureRate: Metric;
  emailCtaOpenedSessions: Metric;
  emailTrialCompletedSessions: Metric;
  pendingFirstParty: LeadSummary;
  firstParty: LeadSummary;
};

interface Report {
  calculatorRepeatUsage?: {
    state: 'available' | 'unavailable';
    note: string;
    rows: Array<{
      calculator: 'retirement' | 'coast_fire'; device: string;
      sessions: number; runs: number; repeatSessions: number;
      repeatRate: number | null; averageRuns: number | null;
      distribution: [number, number, number, number];
      singleRunCtaSessions: number; repeatRunCtaSessions: number;
      singleRunCtaRate: number | null; repeatRunCtaRate: number | null;
    }>;
    bothCalculators: Array<{ device: string; sessions: number }>;
  };
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
  signupOutcomes?: {
    state?: 'available' | 'unavailable';
    trackingStartedAt: string | null;
    note: string;
    rows: Array<{
      device: string; origin: string; entry: string; viewed: number; accountsCreated: number;
      handoffs: number; emailLink: number; verificationCode: number; verificationSkipped: number;
      alreadyVerified: number; legacyLogin: number; signupAbandonmentRate: number | null;
    }>;
  };
  warnings: string[];
}

type Filters = { days: 7 | 28 | 90; compare: boolean };

function CalculatorRepeatUsage({ data, observedThrough }: {
  data: Report['calculatorRepeatUsage']; observedThrough: string | null;
}) {
  const [device, setDevice] = useState('all');
  const devices = [...new Set(['all', 'desktop', 'mobile', ...(data?.rows.map(row => row.device) || [])])];
  // Fall back immediately when a refresh drops the selected device (e.g. tablet →
  // a window with no tablet sessions); otherwise the select stays invalid and the
  // cards/`bothCalculators` line show empty/zero as if nothing happened.
  const activeDevice = devices.includes(device) ? device : 'all';
  useEffect(() => {
    if (device !== activeDevice) setDevice(activeDevice);
  }, [device, activeDevice]);
  const deviceLabel = (value: string) => value === 'all' ? 'All devices' : value.charAt(0).toUpperCase() + value.slice(1);
  return <section aria-labelledby="calculator-repeat-heading" className="rounded-[24px] border border-[#102319]/10 bg-white p-5 sm:p-8">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h2 id="calculator-repeat-heading" className="text-2xl font-semibold tracking-[-.035em]">Do people run the calculators again?</h2>
        <p className="mt-2 text-sm leading-6 text-[#66736b]">Successful runs in the same session—not repeated button clicks.</p>
      </div>
      <DataTiming kind="delayed" observedThrough={observedThrough} />
    </div>
    {!data || data.state !== 'available' ? <p className="mt-5 text-sm text-[#66736b]">{data?.note || 'Repeat-run reporting is unavailable until the updated reporting API is deployed.'}</p> : <>
      <label className="mt-5 flex items-center gap-3 text-sm font-semibold">Device
        <select className="rounded-lg border border-[#102319]/20 bg-white p-2" value={activeDevice} onChange={event => setDevice(event.target.value)}>
          {devices.map(value => <option key={value} value={value}>{deviceLabel(value)}</option>)}
        </select>
      </label>
      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        {data.rows.filter(row => row.device === activeDevice).map(row => <article key={row.calculator} className="min-w-0 rounded-2xl border border-[#102319]/10 p-4 sm:p-5">
          <h3 className="text-lg font-semibold">{row.calculator === 'retirement' ? 'Retirement calculator' : 'Coast FIRE calculator'}</h3>
          <dl className="mt-4 grid grid-cols-2 gap-4 text-sm">
            {[
              ['Calculating sessions', count(row.sessions)],
              ['Successful runs', count(row.runs)],
              ['Ran again', `${precisePercent(row.repeatRate)} (${count(row.repeatSessions)} sessions)`],
              ['Runs per calculating session', row.averageRuns === null ? '—' : row.averageRuns.toFixed(2)],
            ].map(([label, value]) => <div key={label}><dt className="text-xs text-[#66736b]">{label}</dt><dd className="mt-1 font-semibold">{value}</dd></div>)}
          </dl>
          <p className="mt-5 text-xs font-semibold">Sessions by number of runs</p>
          <dl className="mt-2 grid grid-cols-4 gap-2 rounded-xl bg-[#f8f7ef] p-3 text-center text-sm">
            {row.distribution.map((sessions, index) => <div key={index}><dt className="text-xs text-[#66736b]">{index === 3 ? '4+' : index + 1} {index === 0 ? 'run' : 'runs'}</dt><dd className="mt-1 font-semibold">{count(sessions)}</dd></div>)}
          </dl>
          <p className="mt-5 text-xs font-semibold">Start free clicked in the same session</p>
          <dl className="mt-2 grid grid-cols-2 gap-3 text-sm">
            <div><dt className="text-xs text-[#66736b]">Single-run sessions</dt><dd>{precisePercent(row.singleRunCtaRate)} <span className="text-xs text-[#66736b]">({count(row.singleRunCtaSessions)}/{count(row.distribution[0])})</span></dd></div>
            <div><dt className="text-xs text-[#66736b]">Repeat-run sessions</dt><dd>{precisePercent(row.repeatRunCtaRate)} <span className="text-xs text-[#66736b]">({count(row.repeatRunCtaSessions)}/{count(row.repeatSessions)})</span></dd></div>
          </dl>
          {row.sessions === 0 && <p className="mt-3 text-xs text-[#66736b]">No successful runs observed for this device and period. This alone does not confirm tracking is working.</p>}
        </article>)}
      </div>
      <p className="mt-4 text-sm"><strong>{count(data.bothCalculators.find(row => row.device === activeDevice)?.sessions ?? 0)}</strong> sessions ran both calculators. Those sessions appear in both calculator cards.</p>
      <p className="mt-3 text-xs leading-5 text-[#66736b]">{data.note}</p>
    </>}
  </section>;
}

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

function DataTiming({
  kind,
  observedThrough,
}: {
  kind: 'live' | 'delayed';
  observedThrough?: string | null;
}) {
  const isLive = kind === 'live';
  const label = isLive
    ? 'Live'
    : observedThrough
      ? `Delayed · ${shortDate(observedThrough)}`
      : 'Delayed';
  const description = isLive
    ? 'Live data, queried from the first-party database when this page was refreshed; selected date-window limits still apply.'
    : observedThrough
      ? `Delayed GA4 data from the daily export, complete through ${freshness(observedThrough)}.`
      : 'Delayed GA4 data from the daily export; the latest complete date is unavailable.';
  return <span
    aria-label={description}
    title={description}
    className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-1 text-[8px] font-extrabold uppercase tracking-[.08em] ${isLive ? 'bg-[#e5f0e6] text-[#3d6a50]' : 'bg-[#f3ead8] text-[#80601e]'}`}
  >
    <span className={`h-1.5 w-1.5 rounded-full ${isLive ? 'bg-[#4d8b65]' : 'bg-[#b3852e]'}`} />
    {label}
  </span>;
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
  observedThrough,
}: {
  stages: JourneyStage[];
  compare: boolean;
  unavailableLabel: string;
  observedThrough: string | null;
}) {
  return <div className="mt-6 grid gap-3 lg:grid-cols-4">
    {stages.map((stage, index) => {
      const countDelta = compare ? change(stage.value, stage.previous) : null;
      const conversionDelta = compare ? rateChange(stage.conversionRate, stage.previousConversionRate) : null;
      return <div key={stage.id} className="relative min-w-0">
        <article className="h-full rounded-[18px] border border-[#102319]/10 bg-[#f8f7ef] p-4 sm:p-5">
          <div className="flex items-center justify-between gap-3">
            <span className="grid h-7 w-7 place-items-center rounded-full bg-[#e4eadf] text-xs font-extrabold text-[#315d45]">{index + 1}</span>
            <div className="flex flex-wrap items-center justify-end gap-1.5">
              {countDelta && <span className="rounded-full bg-[#e4eadf] px-2 py-1 text-[10px] font-bold text-[#315d45]">{countDelta}</span>}
              <DataTiming kind="delayed" observedThrough={observedThrough} />
            </div>
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

function LeadCapturePanel({
  capture,
  ga4PeriodEnd,
  ga4ObservedThrough,
}: {
  capture: LeadCapture;
  ga4PeriodEnd: string;
  ga4ObservedThrough: string | null;
}) {
  const excludedSessions = capture.emailRequestExclusions.reduce((sum, row) => sum + row.sessions, 0);
  const firstPartyTiming = capture.firstParty.state === 'live' ? 'live' as const : null;
  const pendingFirstPartyTiming = capture.pendingFirstParty.state === 'live' ? 'live' as const : null;
  const funnel = [
    {
      label: 'Ran calculator',
      value: capture.resultSessions.value,
      note: capture.resultSessions.note || 'Qualified result sessions in the email-tracking window',
    },
    {
      label: 'Emailed results',
      value: capture.resultsEmailedSessions.value,
      note: capture.captureRate.value === null
        ? 'Conversion from calculator runs unavailable'
        : `${precisePercent(capture.captureRate.value)} of calculator runs`,
    },
    {
      label: 'Clicked email CTA',
      value: capture.emailCtaOpenedSessions.value,
      note: 'Observed in this window; the email may have been sent earlier',
    },
    {
      label: 'Signup handoff to app',
      value: capture.emailTrialCompletedSessions.value,
      note: 'Email-attributed handoffs observed; no second login required',
    },
  ];
  const cells: Array<{ label: string; value: string; note?: string; timing: 'live' | 'delayed' | null }> = [
    { label: 'GA4 email events observed', value: count(capture.rawResultsEmailedEvents.value), note: capture.rawResultsEmailedEvents.note, timing: 'delayed' },
    { label: 'Qualified GA4 email sessions', value: count(capture.resultsEmailedSessions.value), note: capture.resultsEmailedSessions.note, timing: 'delayed' },
    { label: 'Excluded or unmatched sessions', value: count(excludedSessions), note: excludedSessions > 0 ? 'See the reconciliation below.' : 'Every observed session qualified.', timing: 'delayed' },
    { label: 'GA4 capture rate', value: precisePercent(capture.captureRate.value), note: capture.captureRate.note, timing: 'delayed' },
    { label: 'GA4 email CTA opens', value: count(capture.emailCtaOpenedSessions.value), note: capture.emailCtaOpenedSessions.note, timing: 'delayed' },
    { label: 'GA4 email-path handoffs', value: count(capture.emailTrialCompletedSessions.value), note: capture.emailTrialCompletedSessions.note, timing: 'delayed' },
    { label: 'First-party emails sent', value: count(capture.firstParty.emailsSent), note: `${precisePercent(capture.firstParty.deliveryRate)} of stored requests`, timing: firstPartyTiming },
    { label: 'Unique lead emails', value: count(capture.firstParty.uniqueEmails), note: `${count(capture.firstParty.mailerliteSynced)} synced to MailerLite`, timing: firstPartyTiming },
    { label: 'Attribution captured', value: count(capture.firstParty.attributionCaptured), note: `${precisePercent(capture.firstParty.attributionRate)} of stored requests · ${count(capture.firstParty.paidAttributionCaptured)} paid`, timing: firstPartyTiming },
    { label: 'First-party continuations', value: count(capture.firstParty.continuedToSignup), note: `${precisePercent(capture.firstParty.continuationRate)} of delivered emails`, timing: firstPartyTiming },
    { label: 'Matched accounts', value: count(capture.firstParty.matchedAccounts), note: `${precisePercent(capture.firstParty.accountMatchRate)} of unique lead emails`, timing: firstPartyTiming },
    { label: 'Verified matched accounts', value: count(capture.firstParty.verifiedMatchedAccounts ?? null), note: 'Current verification status; not proof of link attribution', timing: firstPartyTiming },
    { label: 'Results saved to accounts', value: count(capture.firstParty.savedResultAccounts ?? null), note: 'Automatic first decisions, not user-submitted questions', timing: firstPartyTiming },
    { label: 'Pending after GA4 cutoff', value: count(capture.pendingFirstParty.emailsSent), note: `First-party emails since ${shortDate(ga4PeriodEnd)}; not compared until the GA4 export settles.`, timing: pendingFirstPartyTiming },
  ];
  return <div className="mt-6 rounded-[18px] border border-[#102319]/10 bg-[#edf1e9] p-4 sm:p-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#102319] text-[#d8ff71]"><Mail size={16} /></span>
        <div>
          <p className="text-[10px] font-extrabold uppercase tracking-[.14em] text-[#49725a]">Known-prospect branch</p>
          <h3 className="mt-1 text-base font-semibold tracking-[-.025em]">Email me these results</h3>
          <p className="mt-1 max-w-4xl text-[10px] leading-4 text-[#66736b]">Calculator runs and email requests share the email-tracking window. Later email clicks and trials are outcomes observed in the selected reporting window.</p>
        </div>
      </div>
    </div>
    <div className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-4">
      {funnel.map((step, index) => <div key={step.label} className="relative min-w-0">
        <div className="h-full rounded-xl bg-[#fffdf5] px-4 py-4">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2 text-[10px] font-extrabold uppercase tracking-[.1em] text-[#49725a]">
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[#e4eadf] text-[#315d45]">{index + 1}</span>
              {step.label}
            </div>
            <DataTiming kind="delayed" observedThrough={ga4ObservedThrough} />
          </div>
          <div className="mt-4 text-3xl font-semibold tracking-[-.05em] tabular-nums">{count(step.value)}</div>
          <div className="mt-2 text-[10px] leading-4 text-[#7b867f]">{step.note}</div>
        </div>
        {index < funnel.length - 1 && <span className="absolute -right-5 top-1/2 z-10 hidden h-7 w-7 -translate-y-1/2 place-items-center rounded-full border border-[#102319]/10 bg-[#edf1e9] text-[#49725a] lg:grid"><ArrowRight size={13} /></span>}
      </div>)}
    </div>
    <details className="group mt-4 rounded-xl border border-[#102319]/10 bg-[#fffdf5]">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-4 py-3 text-xs font-bold text-[#486657]">
        <span>Show measurement details</span>
        <ChevronDown size={15} className="transition-transform group-open:rotate-180" />
      </summary>
      <div className="border-t border-[#102319]/10 p-4">
        <p className="text-[10px] leading-4 text-[#66736b]">GA4 and first-party comparison rows both cover {shortDate(capture.firstParty.periodStart)} through {shortDate(capture.firstParty.periodEnd)}. Activity after {shortDate(ga4PeriodEnd)} is separated as pending until the daily GA4 export settles. {capture.firstParty.note}</p>
        <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {cells.map(cell => <div key={cell.label} className="rounded-xl bg-[#f8f7ef] px-4 py-3">
            <div className="flex items-start justify-between gap-2">
              <div className="text-2xl font-semibold tracking-[-.04em] tabular-nums">{cell.value}</div>
              {cell.timing ? <DataTiming kind={cell.timing} observedThrough={cell.timing === 'delayed' ? ga4ObservedThrough : undefined} /> : null}
            </div>
            <div className="mt-1 text-[11px] font-bold text-[#66736b]">{cell.label}</div>
            <div className="mt-1 text-[9px] leading-4 text-[#89938c]">{cell.note}</div>
          </div>)}
        </div>
        {capture.emailRequestExclusions.length > 0 && <div className="mt-3 rounded-xl border border-[#9d6a16]/15 bg-[#f8f1df] px-4 py-3">
          <div className="text-[10px] font-extrabold uppercase tracking-[.1em] text-[#775617]">GA4 reconciliation</div>
          <ul className="mt-2 space-y-1">
            {capture.emailRequestExclusions.map(row => <li key={row.reason} className="text-[10px] leading-4 text-[#6f654c]">{count(row.sessions)} session{row.sessions === 1 ? '' : 's'}: {row.label}.</li>)}
          </ul>
        </div>}
      </div>
    </details>
  </div>;
}

function OutcomeCard({
  icon,
  label,
  metric,
  numerator,
  denominator,
  showLiveTiming,
}: {
  icon: ReactNode;
  label: string;
  metric: Metric;
  numerator: number | null;
  denominator: number | null;
  showLiveTiming: boolean;
}) {
  return <article className="rounded-[18px] border border-[#102319]/10 bg-[#fffdf5] p-5 shadow-[0_14px_36px_rgba(16,35,25,.045)]">
    <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#e9eee5] text-[#397052]">{icon}</span>
    <div className="mt-5 flex items-start justify-between gap-3">
      <div className="text-3xl font-semibold tracking-[-.05em] tabular-nums">{percent(metric.value)}</div>
      {showLiveTiming ? <DataTiming kind="live" /> : null}
    </div>
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
  const firstPartyDiagnostic = report?.diagnostics.find(source => source.id === 'first_party');
  const ga4ObservedThrough = ga4Diagnostic?.state === 'live'
    ? report?.coverage.fullyObservedThrough || null
    : null;
  const firstPartyLive = firstPartyDiagnostic?.state === 'live';
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
              <p className="mt-5 max-w-2xl text-sm leading-6 text-white/65">Track calculator use, repeat runs, and the path from a result to a trial.</p>
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

            <Journey
              stages={report.beachhead.coastFireJourney}
              compare={filters.compare}
              unavailableLabel={journeyUnavailableLabel}
              observedThrough={ga4ObservedThrough}
            />
            <LeadCapturePanel
              capture={report.beachhead.leadCapture.coastFire}
              ga4PeriodEnd={report.period.end}
              ga4ObservedThrough={ga4ObservedThrough}
            />
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
                ].map(([label, value]) => <div key={label} className="rounded-xl bg-[#fffdf5] px-4 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="text-2xl font-semibold tracking-[-.04em] tabular-nums">{value}</div>
                    {report.retirementCalculatorHealth.state === 'live' ? <DataTiming kind="live" /> : null}
                  </div>
                  <div className="mt-1 text-[11px] font-bold text-[#66736b]">{label}</div>
                </div>)}
              </div>
            </div>}
            <Journey
              stages={report.beachhead.currentCalculatorBaseline}
              compare={filters.compare}
              unavailableLabel={journeyUnavailableLabel}
              observedThrough={ga4ObservedThrough}
            />
            <LeadCapturePanel
              capture={report.beachhead.leadCapture.retirement}
              ga4PeriodEnd={report.period.end}
              ga4ObservedThrough={ga4ObservedThrough}
            />
          </section>

          <div className="mt-10">
            <CalculatorRepeatUsage data={report.calculatorRepeatUsage} observedThrough={ga4ObservedThrough} />
          </div>

          {report.signupOutcomes && <section className="mt-10 rounded-[22px] border border-[#102319]/10 bg-[#fffdf5] p-5 sm:p-6">
            <h2 className="text-2xl font-semibold tracking-[-.035em]">Signup paths by device</h2>
            <p className="mt-2 max-w-4xl text-xs leading-5 text-[#66736b]">{report.signupOutcomes.note}</p>
            {!report.signupOutcomes.trackingStartedAt && <p className="mt-2 text-xs text-[#8b5c16]">New handoff tracking is collecting. Rates stay blank until a complete day of tracking is verified.</p>}
            <div className="mt-5 overflow-x-auto">
              <table className="w-full min-w-[1020px] text-left text-xs">
                <caption className="sr-only">Observed signup sessions by entry route and device</caption>
                <thead><tr>{['Signup route', 'Device', 'Viewed signup', 'Accounts created', 'Handoffs', 'Email link verified', 'Code verified', 'Skipped verification', 'Already verified', 'Legacy login', 'Signup drop-off'].map(label => <th key={label} scope="col" className="p-2 font-semibold">{label}</th>)}</tr></thead>
                <tbody>{report.signupOutcomes.rows.map(row => <tr key={`${row.origin}:${row.entry}:${row.device}`} className="border-t border-[#102319]/10">
                  <th scope="row" className="p-2 font-medium">{row.origin.replaceAll('_', ' ')} / {row.entry.replaceAll('_', ' ')}</th>
                  <td className="p-2">{row.device}</td>
                  {[row.viewed, row.accountsCreated, row.handoffs, row.emailLink, row.verificationCode, row.verificationSkipped, row.alreadyVerified, row.legacyLogin].map((value, index) => <td key={index} className="p-2 tabular-nums">{count(value)}</td>)}
                  <td className="p-2 tabular-nums">{precisePercent(row.signupAbandonmentRate)}</td>
                </tr>)}</tbody>
              </table>
            </div>
            {report.signupOutcomes.rows.length === 0 && <p className="mt-4 text-sm text-[#66736b]">{report.signupOutcomes.state === 'unavailable' ? 'Signup data is unavailable or the export was truncated; no zero counts have been substituted.' : 'No signup sessions observed in this reporting window.'}</p>}
          </section>}

          <section className="mt-10">
            <div className="max-w-3xl">
              <p className="text-[10px] font-extrabold uppercase tracking-[.14em] text-[#49725a]">Downstream value</p>
              <h2 className="mt-1 text-2xl font-semibold tracking-[-.035em]">Do new accounts become valuable users?</h2>
              <p className="mt-2 text-sm leading-6 text-[#66736b]">Financial connection, questions people submit, and payment. Automatically saved calculator results do not count as questions. These cards describe all new accounts, not just calculator-email signups.</p>
            </div>
            <div className="mt-5 grid gap-4 md:grid-cols-3">
              <OutcomeCard icon={<Link2 size={17} />} label="Connected financial data" metric={report.beachhead.downstream.financialConnectionRate} numerator={report.firstParty.createdAccountsWithFinancialConnection} denominator={report.firstParty.accountsCreated} showLiveTiming={firstPartyLive} />
              <OutcomeCard icon={<MessageCircle size={17} />} label="Asked a planning question" metric={report.beachhead.downstream.activationRate} numerator={report.firstParty.createdAccountsWithConversation} denominator={report.firstParty.accountsCreated} showLiveTiming={firstPartyLive} />
              <OutcomeCard icon={<CircleDollarSign size={18} />} label="Paid now" metric={report.beachhead.downstream.paidRate} numerator={report.firstParty.createdAccountsCurrentlyPaid} denominator={report.firstParty.accountsCreated} showLiveTiming={firstPartyLive} />
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
