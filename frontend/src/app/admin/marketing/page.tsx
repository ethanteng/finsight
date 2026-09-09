'use client';

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import {
  AlertTriangle, ArrowLeft, ArrowRight, BarChart3, Bot, Clock3, Database,
  ExternalLink, Filter, Gauge, Lightbulb, RefreshCw, Search, ShieldAlert,
  Sparkles, Target, Users,
} from 'lucide-react';
import PageMeta from '../../../components/PageMeta';
import AuthenticatedPageHeader from '../../../components/authenticated/AuthenticatedPageHeader';
import { markInternalAnalyticsBrowser } from '../../../lib/internal-analytics';

type IntentId = 'retirement_high_intent' | 'generic_ai_financial_planning' | 'competitor_comparison'
  | 'savings_net_worth' | 'brand_direct' | 'blog_informational_seo' | 'paid_nonbrand' | 'paid_brand' | 'unknown';
type TrafficQuality = 'human' | 'bot' | 'internal' | 'synthetic' | 'unknown';
type Metric = { value: number | null; previous: number | null; unit: 'count' | 'percent' | 'seconds' | 'currency'; source: string; note?: string };
type Breakdown = { key: string; label: string; sessions: number; users: number | null; engagedRate: number | null; ctaRate: number | null; bounceRate?: number | null; pageViewsPerSession?: number | null; engagementSeconds?: number | null; medianEngagementSeconds?: number | null; p75EngagementSeconds?: number | null; share?: number | null; raw?: Record<string, string> };
type FunnelStep = { event: string; label: string; sessions: number | null; users: number | null; previousStepRate: number | null; abandonmentRate: number | null; medianSecondsFromPrevious: number | null; coverage: string; rawEventSessions?: number };
type IntentRow = Breakdown & { intent: IntentId; signupStartRate: number | null; accountCreatedRate: number | null; trialCompleteRate: number | null; activatedUsers: number | null };
type PageRow = { page: string; sessions: number; activityRate: number | null; bounceRate: number | null; exitRate: number | null; scrollReach: number | null; interactionSeconds: number | null; lcpP75Seconds: number | null; warning?: string };

interface Filters {
  days: 7 | 28 | 90;
  compare: boolean;
  source?: string;
  channel?: string;
  campaign?: string;
  landingPage?: string;
  device?: string;
  visitorType?: 'new' | 'returning';
  trafficQuality?: TrafficQuality;
  includeExcluded?: boolean;
  intent?: IntentId;
}

interface Report {
  generatedAt: string;
  period: { start: string; end: string; previousStart: string; previousEnd: string };
  coverage: { eventTrackingStartedAt: string | null; fullyObservedThrough: string | null; usesFallbackSnapshot: boolean };
  summary: Record<'users' | 'sessions' | 'engagedSessionRate' | 'ctaClicks' | 'signupStarts' | 'trialsCompleted' | 'clickToTrialRate' | 'paidSpend' | 'cac', Metric>;
  firstParty: { accountsCreated: number | null; accountsCurrentlyVerified: number | null; createdAccountsWithLogin: number | null; createdAccountsWithConversation: number | null; subscriptionsCreated: number | null; currentlyTrialingAccounts: number | null; note: string };
  funnel: FunnelStep[];
  funnelErrors: Array<{ event: string; sessions: number | null; events: number | null; rate: number | null }>;
  acquisition: Breakdown[];
  landingPages: PageRow[];
  devices: Breakdown[];
  visitorTypes: Breakdown[];
  trafficQuality: {
    rawSessions: number;
    includedSessions: number;
    excludedSessions: number;
    averageEngagementSeconds: number | null;
    medianEngagementSeconds: number | null;
    p75EngagementSeconds: number | null;
    byQuality: Array<{ quality: TrafficQuality; sessions: number; includedByDefault: boolean }>;
    exclusionReasons: Array<{ reason: string; sessions: number }>;
    note: string;
  };
  intents: IntentRow[];
  seo: { rankingKeywords: number; estimatedMonthlyTraffic: number; domainAuthority: number; backlinks: number; referringDomains: number; trackedKeywords: number; topTenKeywords: number; topHundredKeywords: number; keywords: Array<{ query: string; page: string; intent: IntentId; position: number | null; volume: number | null }> };
  findings: Array<{ severity: 'critical' | 'warning' | 'opportunity' | 'info'; title: string; detail: string; action: string }>;
  diagnostics: Array<{ id: string; name: string; state: string; freshness: string | null; detail: string }>;
  warnings: string[];
  filterOptions: { sources: string[]; channels: string[]; campaigns: string[]; landingPages: string[]; devices: string[]; visitorTypes: string[]; trafficQualities: TrafficQuality[]; intents: IntentId[] };
}

const DEFAULT_FILTERS: Filters = { days: 28, compare: true, includeExcluded: false };
const INTENT_LABELS: Record<IntentId, string> = {
  retirement_high_intent: 'Retirement / calculator', generic_ai_financial_planning: 'AI financial planning',
  competitor_comparison: 'Competitor / comparison', savings_net_worth: 'Savings / net worth',
  brand_direct: 'Brand / direct', blog_informational_seo: 'Blog / informational SEO',
  paid_nonbrand: 'Paid nonbrand', paid_brand: 'Paid brand', unknown: 'Unknown',
};
const QUALITY_LABELS: Record<TrafficQuality, string> = {
  human: 'Human', bot: 'Bot / crawler', internal: 'Internal', synthetic: 'Preview / synthetic', unknown: 'Unknown',
};
const number = (value: number | null) => value === null ? '—' : new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value);
const percent = (value: number | null) => value === null ? '—' : `${(value * 100).toFixed(value < 0.1 ? 1 : 0)}%`;
const seconds = (value: number | null) => value === null ? '—' : value < 60 ? `${Math.round(value)}s` : `${Math.floor(value / 60)}m ${Math.round(value % 60)}s`;
const shortDate = (value: string) => new Date(`${value}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
const freshness = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value)
  ? new Date(`${value}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  : new Date(value).toLocaleString();

function metricText(metric: Metric) {
  if (metric.value === null) return '—';
  if (metric.unit === 'percent') return percent(metric.value);
  if (metric.unit === 'seconds') return seconds(metric.value);
  if (metric.unit === 'currency') return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(metric.value);
  return number(metric.value);
}

function deltaText(metric: Metric) {
  if (metric.value === null || metric.previous === null || metric.previous === 0) return null;
  if (metric.unit === 'percent') {
    const points = (metric.value - metric.previous) * 100;
    return `${points >= 0 ? '+' : ''}${points.toFixed(1)} pts`;
  }
  const change = (metric.value - metric.previous) / metric.previous;
  return `${change >= 0 ? '+' : ''}${(change * 100).toFixed(0)}%`;
}

function Kpi({ label, metric, accent, compare }: { label: string; metric: Metric; accent?: boolean; compare: boolean }) {
  const delta = compare ? deltaText(metric) : null;
  return <article className={`rounded-[18px] border p-4 shadow-[0_12px_35px_rgba(16,35,25,.045)] ${accent ? 'border-[#102319] bg-[#102319] text-white' : 'border-[#102319]/10 bg-[#fffdf5]'}`}>
    <div className={`text-[10px] font-extrabold uppercase tracking-[.13em] ${accent ? 'text-[#d8ff71]' : 'text-[#64806e]'}`}>{label}</div>
    <div className="mt-3 flex items-end justify-between gap-2"><div className="text-[clamp(1.6rem,3vw,2.2rem)] font-semibold leading-none tracking-[-.05em] tabular-nums">{metricText(metric)}</div>{delta && <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${accent ? 'bg-white/10 text-white' : delta.startsWith('+') ? 'bg-[#e0f2e5] text-[#285c43]' : 'bg-[#f8e8e3] text-[#8b3027]'}`}>{delta}</span>}</div>
    <div className={`mt-3 text-[11px] ${accent ? 'text-white/60' : 'text-[#748078]'}`}>{metric.value === null ? metric.source : `From ${metric.source}`}</div>
  </article>;
}

function FilterSelect({ label, value, options, onChange, format = value => value }: { label: string; value?: string; options: string[]; onChange: (value?: string) => void; format?: (value: string) => string }) {
  return <label><span className="sr-only">{label}</span><select aria-label={label} value={value || ''} onChange={event => onChange(event.target.value || undefined)} className="min-h-9 max-w-[170px] rounded-full border border-[#102319]/10 bg-[#f8f7ef] py-1 pl-3 pr-8 text-xs font-bold text-[#486657]"><option value="">All {label.toLowerCase()}</option>{options.map(option => <option key={option} value={option}>{format(option)}</option>)}</select></label>;
}

function Panel({ icon, eyebrow, title, subtitle, children }: { icon: ReactNode; eyebrow: string; title: string; subtitle: string; children: ReactNode }) {
  return <section className="min-w-0 rounded-[22px] border border-[#102319]/10 bg-[#fffdf5] p-5 shadow-[0_18px_45px_rgba(16,35,25,.05)] sm:p-6"><div className="flex gap-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#e9eee5] text-[#397052]">{icon}</span><div><p className="text-[10px] font-extrabold uppercase tracking-[.13em] text-[#49725a]">{eyebrow}</p><h2 className="mt-1 text-xl font-semibold tracking-[-.03em]">{title}</h2><p className="mt-1 text-xs leading-5 text-[#66736b]">{subtitle}</p></div></div>{children}</section>;
}

function MiniStat({ label, value }: { label: string; value: number | null }) {
  return <div className="rounded-xl border border-[#102319]/8 bg-[#fffdf5]/75 p-3"><div className="text-xl font-semibold tabular-nums tracking-[-.04em]">{number(value)}</div><div className="mt-1 text-[10px] font-semibold leading-4 text-[#66736b]">{label}</div></div>;
}

function BarRow({ row, total, meta }: { row: Breakdown; total: number; meta: string }) {
  const share = total > 0 ? row.sessions / total : 0;
  return <div><div className="flex items-end justify-between gap-3"><div className="min-w-0"><div className="truncate text-xs font-bold">{row.label}</div><div className="mt-0.5 text-[10px] text-[#748078]">{meta}</div></div><div className="text-sm font-bold tabular-nums">{number(row.sessions)} <span className="font-normal text-[#748078]">· {percent(share)}</span></div></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-[#e2e7df]"><div className="h-full rounded-full bg-gradient-to-r from-[#397052] to-[#88b59b]" style={{ width: `${Math.max(1.5, share * 100)}%` }} /></div></div>;
}

function Empty({ message = 'This breakdown will populate from the GA4 export. No numbers are inferred while the connector is unavailable.' }: { message?: string }) {
  return <div className="rounded-2xl border border-dashed border-[#102319]/15 bg-[#f8f7ef] p-5 text-center"><Lightbulb className="mx-auto text-[#64806e]" size={18} /><p className="mt-2 text-xs leading-5 text-[#66736b]">{message}</p></div>;
}

function Status({ state }: { state: string }) {
  const style = state === 'live' ? 'bg-[#dff3e5] text-[#286044]' : state === 'verified_snapshot' ? 'bg-[#e8eee5] text-[#486657]' : state === 'collecting' ? 'bg-[#f4ead0] text-[#76510f]' : 'bg-[#f8e8e3] text-[#8b3027]';
  return <span className={`rounded-full px-2.5 py-1 text-[9px] font-extrabold uppercase tracking-[.07em] ${style}`}>{state === 'verified_snapshot' ? 'Verified snapshot' : state.replaceAll('_', ' ')}</span>;
}

export default function MarketingDashboardPage() {
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const apiUrl = process.env.NEXT_PUBLIC_API_URL;

  const load = useCallback(async () => {
    setLoading(true); setError('');
    const query = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => { if (value !== undefined && value !== '') query.set(key, String(value)); });
    try {
      const token = localStorage.getItem('auth_token');
      const response = await fetch(`${apiUrl}/admin/marketing?${query}`, { headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
      if (response.status === 401 || response.status === 403) throw new Error('Sign in with an admin account to view marketing performance.');
      if (!response.ok) throw new Error('Marketing data could not be loaded.');
      const nextReport = await response.json() as Report;
      // A successful response proves this is an authenticated admin browser.
      // Future full loads skip GTM/Contentsquare; the current /admin session is
      // independently classified as internal by the BigQuery adapter.
      markInternalAnalyticsBrowser();
      setReport(nextReport);
    } catch (loadError) { setError(loadError instanceof Error ? loadError.message : 'Marketing data could not be loaded.'); }
    finally { setLoading(false); }
  }, [apiUrl, filters]);

  useEffect(() => { void load(); }, [load]);
  const hasFilters = useMemo(() => Object.entries(filters).some(([key, value]) => !['days', 'compare'].includes(key) && Boolean(value)), [filters]);
  const update = <K extends keyof Filters>(key: K, value: Filters[K]) => setFilters(previous => ({ ...previous, [key]: value === '' ? undefined : value }));

  return <><PageMeta title="Marketing performance | Ask Linc" description="Authenticated acquisition, behavior, intent, and trial conversion diagnostics for Ask Linc." /><div className="authenticated-site min-h-screen bg-[#f2f1e8] text-[#102319]"><AuthenticatedPageHeader activePage="admin" eyebrow="Growth intelligence" title="Marketing performance" /><main className="mx-auto max-w-[1320px] px-4 pb-20 pt-7 sm:px-6">
    <div className="mb-6 flex flex-wrap items-center justify-between gap-4"><Link href="/admin" className="inline-flex items-center gap-2 text-sm font-bold text-[#486657] hover:text-[#102319]"><ArrowLeft size={15} /> Back to administration</Link><button type="button" onClick={() => void load()} disabled={loading} className="admin-button-secondary gap-2"><RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh</button></div>

    <section className="overflow-hidden rounded-[26px] bg-[#102319] text-white shadow-[0_26px_70px_rgba(16,35,25,.16)]"><div className="grid gap-7 px-5 py-7 sm:px-8 lg:grid-cols-[1.25fr_.75fr] lg:px-10 lg:py-10"><div><p className="text-[10px] font-extrabold uppercase tracking-[.16em] text-[#d8ff71]">Why aren&apos;t people converting?</p><h2 className="mt-4 max-w-3xl font-serif text-[clamp(2.1rem,5vw,4.3rem)] italic leading-[.96] tracking-[-.045em]">See the leak, then fix the right part of the journey.</h2><p className="mt-5 max-w-2xl text-sm leading-6 text-white/65">Acquisition, page behavior, intent and the full no-card trial path—kept honest about where tracking is new or incomplete.</p></div><div className="grid grid-cols-2 gap-3 self-end"><div className="rounded-2xl border border-white/10 bg-white/[.06] p-4"><div className="text-2xl font-semibold tracking-[-.05em]">{report ? `${shortDate(report.period.start)}–${shortDate(report.period.end)}` : '—'}</div><div className="mt-2 text-xs text-white/55">Reporting window</div></div><div className="rounded-2xl border border-white/10 bg-[#d8ff71] p-4 text-[#102319]"><div className="text-2xl font-semibold tracking-[-.05em]">{report?.coverage.usesFallbackSnapshot ? 'Snapshot' : report?.coverage.fullyObservedThrough ? 'Live' : 'Collecting'}</div><div className="mt-2 text-xs text-[#102319]/60">Funnel data state</div></div></div></div></section>

    <section className="rounded-b-[22px] border border-t-0 border-[#102319]/10 bg-[#fffdf5] p-4 shadow-[0_16px_40px_rgba(16,35,25,.05)]">
      <div className="flex flex-wrap items-center gap-2">
        <div className="mr-1 inline-flex items-center gap-2 text-xs font-extrabold uppercase tracking-[.11em] text-[#486657]"><Filter size={14} /> View</div>
        {([7, 28, 90] as const).map(days => <button key={days} type="button" onClick={() => update('days', days)} className={`min-h-9 rounded-full px-3 text-xs font-bold ${filters.days === days ? 'bg-[#102319] text-white' : 'bg-[#e9eee5] text-[#486657]'}`}>{days}d</button>)}
        <label className="ml-1 inline-flex min-h-9 items-center gap-2 rounded-full bg-[#e9eee5] px-3 text-xs font-bold text-[#486657]"><input type="checkbox" checked={filters.compare} onChange={event => update('compare', event.target.checked)} /> Previous period</label>
        {report && <>
          <FilterSelect label="Source" value={filters.source} options={report.filterOptions.sources} onChange={value => update('source', value)} />
          <FilterSelect label="Channel" value={filters.channel} options={report.filterOptions.channels} onChange={value => update('channel', value)} />
          <FilterSelect label="Campaign" value={filters.campaign} options={report.filterOptions.campaigns} onChange={value => update('campaign', value)} />
          <FilterSelect label="Landing" value={filters.landingPage} options={report.filterOptions.landingPages} onChange={value => update('landingPage', value)} />
          <FilterSelect label="Device" value={filters.device} options={report.filterOptions.devices} onChange={value => update('device', value)} />
          <FilterSelect label="Visitor" value={filters.visitorType} options={report.filterOptions.visitorTypes} onChange={value => update('visitorType', value as Filters['visitorType'])} />
          {report.filterOptions.trafficQualities.length > 0 && <>
            <FilterSelect label="Quality" value={filters.trafficQuality} options={report.filterOptions.trafficQualities} format={value => QUALITY_LABELS[value as TrafficQuality]} onChange={value => update('trafficQuality', value as TrafficQuality)} />
            <label className="inline-flex min-h-9 items-center gap-2 rounded-full bg-[#e9eee5] px-3 text-xs font-bold text-[#486657]"><input type="checkbox" checked={Boolean(filters.includeExcluded)} onChange={event => update('includeExcluded', event.target.checked)} /> Include excluded</label>
          </>}
          <FilterSelect label="Intent" value={filters.intent} options={report.filterOptions.intents} format={value => INTENT_LABELS[value as IntentId] || value} onChange={value => update('intent', value as IntentId)} />
        </>}
        {hasFilters && <button type="button" onClick={() => setFilters({ days: filters.days, compare: filters.compare, includeExcluded: false })} className="ml-auto text-xs font-bold text-[#8b3027]">Clear filters</button>}
      </div>
    </section>

    {error && <div className="mt-6 rounded-2xl border border-[#b84a3d]/25 bg-[#f8e8e3] p-5 text-sm text-[#8b3027]"><ShieldAlert className="mr-2 inline" size={17} />{error}</div>}
    {loading && !report && <div className="grid min-h-[360px] place-items-center"><div className="flex items-center gap-3 text-sm font-bold text-[#486657]"><RefreshCw className="animate-spin" size={18} /> Loading the journey…</div></div>}

    {report && <div className={loading ? 'pointer-events-none opacity-55 transition-opacity' : 'transition-opacity'}>
      {report.warnings.length > 0 && <div className="mt-6 rounded-2xl border border-[#9d6a16]/20 bg-[#f4ead0] px-5 py-4"><div className="flex gap-3"><AlertTriangle className="mt-0.5 shrink-0 text-[#76510f]" size={17} /><div><div className="text-sm font-bold text-[#76510f]">Read the dates before the rates</div><ul className="mt-1 space-y-1 text-xs leading-5 text-[#76510f]/85">{report.warnings.map(warning => <li key={warning}>{warning}</li>)}</ul></div></div></div>}

      <section className="mt-8"><div className="mb-4 flex items-end justify-between gap-4"><div><p className="text-[10px] font-extrabold uppercase tracking-[.15em] text-[#49725a]">Executive pulse</p><h2 className="mt-1 text-2xl font-semibold tracking-[-.04em]">The numbers that matter first</h2></div><div className="hidden text-xs text-[#748078] sm:block">Updated {new Date(report.generatedAt).toLocaleString()}</div></div><div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8"><Kpi label="Users" metric={report.summary.users} compare={filters.compare} /><Kpi label="Sessions" metric={report.summary.sessions} compare={filters.compare} /><Kpi label="Engaged" metric={report.summary.engagedSessionRate} compare={filters.compare} /><Kpi label="CTA clicks" metric={report.summary.ctaClicks} compare={filters.compare} /><Kpi label="Signup starts" metric={report.summary.signupStarts} compare={filters.compare} /><Kpi label="Trial complete" metric={report.summary.trialsCompleted} compare={filters.compare} accent /><Kpi label="Click → trial" metric={report.summary.clickToTrialRate} compare={filters.compare} /><Kpi label="CAC" metric={report.summary.cac} compare={filters.compare} /></div></section>

      <section className="mt-10 grid gap-5 lg:grid-cols-[1.15fr_.85fr]">
        <div className="rounded-[22px] border border-[#102319]/10 bg-[#fffdf5] p-5 shadow-[0_18px_45px_rgba(16,35,25,.05)] sm:p-6">
          <div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-[#102319] text-[#d8ff71]"><Sparkles size={18} /></span><div><p className="text-[10px] font-extrabold uppercase tracking-[.13em] text-[#49725a]">Conversion diagnosis</p><h2 className="text-xl font-semibold tracking-[-.03em]">What deserves attention now</h2></div></div>
          <div className="mt-6 space-y-3">{report.findings.map((finding, index) => <article key={finding.title} className="rounded-2xl border border-[#102319]/10 bg-[#f8f7ef] p-4"><div className="flex gap-4"><span className={`mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-extrabold ${finding.severity === 'critical' ? 'bg-[#8b3027] text-[#fffdf5]' : finding.severity === 'warning' ? 'bg-[#f0d99d] text-[#76510f]' : finding.severity === 'opportunity' ? 'bg-[#d8ff71] text-[#102319]' : 'bg-[#dfe9e2] text-[#397052]'}`}>{index + 1}</span><div><h3 className="font-bold">{finding.title}</h3><p className="mt-1 text-sm leading-6 text-[#5e6b63]">{finding.detail}</p><p className="mt-2 flex gap-2 text-xs font-semibold leading-5 text-[#397052]"><ArrowRight size={14} className="mt-0.5 shrink-0" />{finding.action}</p></div></div></article>)}</div>
        </div>
        <div className="space-y-5">
          <section className="rounded-[22px] border border-[#102319]/10 bg-[#e9eee5] p-5 sm:p-6"><div className="flex items-center gap-3"><Database size={18} /><h2 className="text-lg font-semibold">First-party reality check</h2></div><div className="mt-5 grid grid-cols-2 gap-3"><MiniStat label="Accounts created" value={report.firstParty.accountsCreated} /><MiniStat label="Currently verified" value={report.firstParty.accountsCurrentlyVerified} /><MiniStat label="Reached a login" value={report.firstParty.createdAccountsWithLogin} /><MiniStat label="Asked a question" value={report.firstParty.createdAccountsWithConversation} /><MiniStat label="Subscriptions created" value={report.firstParty.subscriptionsCreated} /><MiniStat label="Currently trialing" value={report.firstParty.currentlyTrialingAccounts} /></div><p className="mt-4 text-[11px] leading-5 text-[#66736b]">{report.firstParty.note}</p></section>
          <Panel icon={<Bot size={18} />} eyebrow="Traffic quality" title="Reporting population" subtitle="Excluded traffic stays counted and auditable, but is kept out of headline metrics by default.">
            <div className="mt-5 grid grid-cols-3 gap-3"><MiniStat label="Raw sessions" value={report.trafficQuality.rawSessions} /><MiniStat label="Included" value={report.trafficQuality.includedSessions} /><MiniStat label="Excluded" value={report.trafficQuality.excludedSessions} /></div>
            <div className="mt-4 grid grid-cols-3 gap-2 rounded-xl bg-[#f8f7ef] p-3 text-center text-[10px] text-[#66736b]"><div><strong className="block text-sm text-[#102319]">{seconds(report.trafficQuality.averageEngagementSeconds)}</strong>Average</div><div><strong className="block text-sm text-[#102319]">{seconds(report.trafficQuality.medianEngagementSeconds)}</strong>Median</div><div><strong className="block text-sm text-[#102319]">{seconds(report.trafficQuality.p75EngagementSeconds)}</strong>p75</div></div>
            <div className="mt-4 space-y-2">{report.trafficQuality.byQuality.map(row => <div key={row.quality} className="flex items-center justify-between rounded-lg border border-[#102319]/8 px-3 py-2 text-xs"><span className="font-bold">{QUALITY_LABELS[row.quality]} {!row.includedByDefault && <span className="ml-1 text-[9px] uppercase text-[#8b3027]">excluded</span>}</span><span className="tabular-nums">{number(row.sessions)}</span></div>)}</div>
            {report.trafficQuality.exclusionReasons.length > 0 && <div className="mt-4 border-t border-[#102319]/10 pt-3"><div className="text-[10px] font-extrabold uppercase tracking-[.1em] text-[#748078]">Exclusion audit</div>{report.trafficQuality.exclusionReasons.map(row => <div key={row.reason} className="mt-2 flex justify-between gap-3 text-[10px] text-[#66736b]"><span className="break-all">{row.reason.replaceAll('_', ' ')}</span><span className="font-bold tabular-nums text-[#102319]">{row.sessions}</span></div>)}</div>}
            <p className="mt-4 text-[10px] leading-4 text-[#66736b]">{report.trafficQuality.note}</p>
            {report.devices.length > 0 && <div className="mt-5 border-t border-[#102319]/10 pt-4"><div className="mb-3 text-[10px] font-extrabold uppercase tracking-[.1em] text-[#748078]">Included device mix</div><div className="space-y-3">{report.devices.map(row => <BarRow key={row.key} row={row} total={report.devices.reduce((sum, item) => sum + item.sessions, 0)} meta={`${percent(row.bounceRate ?? null)} bounce`} />)}</div></div>}
          </Panel>
        </div>
      </section>

      <section className="mt-10 rounded-[24px] border border-[#102319]/10 bg-[#fffdf5] p-5 shadow-[0_18px_45px_rgba(16,35,25,.05)] sm:p-7"><div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-[10px] font-extrabold uppercase tracking-[.15em] text-[#49725a]">Strict same-session funnel</p><h2 className="mt-1 text-2xl font-semibold tracking-[-.04em]">From promise to first successful login</h2></div><span className="rounded-full bg-[#e9eee5] px-3 py-1.5 text-[11px] font-bold text-[#486657]">{report.coverage.eventTrackingStartedAt ? `Full-day coverage from ${freshness(report.coverage.eventTrackingStartedAt)}` : 'Coverage date not set'}</span></div><div className="mt-7 grid gap-2 md:grid-cols-6 xl:grid-cols-11">{report.funnel.map((step, index) => <div key={step.event} className="relative min-w-0 rounded-xl border border-[#102319]/10 bg-[#f8f7ef] p-3"><div className="text-[9px] font-extrabold uppercase tracking-[.1em] text-[#748078]">{index + 1}</div><div className="mt-2 text-2xl font-semibold tabular-nums">{number(step.sessions)}</div><div className="mt-1 min-h-8 text-[11px] font-bold leading-4">{step.label}</div><div className="mt-2 text-[10px] text-[#748078]">{step.previousStepRate === null ? step.coverage === 'collecting' ? 'Collecting' : 'Entry' : `${percent(step.previousStepRate)} from prior`}</div>{step.rawEventSessions !== undefined && step.rawEventSessions > (step.sessions || 0) && <div className="mt-2 rounded bg-[#f4ead0] p-1.5 text-[9px] font-bold text-[#76510f]">{step.rawEventSessions} raw · sequence gap</div>}</div>)}</div><div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{report.funnelErrors.map(row => <div key={row.event} className="rounded-xl border border-[#b84a3d]/15 bg-[#f8e8e3]/70 p-3"><div className="break-words font-mono text-[10px] text-[#8b3027]">{row.event}</div><div className="mt-2 text-sm font-bold text-[#8b3027]">{number(row.sessions)} sessions · {number(row.events)} events</div><div className="mt-1 text-[10px] text-[#8b3027]/70">{percent(row.rate)} of matching submits</div></div>)}</div></section>

      <section className="mt-10 grid gap-5 lg:grid-cols-2"><Panel icon={<BarChart3 size={18} />} eyebrow="Acquisition" title="Where visits are coming from" subtitle="GA4 session source and medium—not HTTP referrer—define acquisition."><div className="mt-5 space-y-3">{report.acquisition.length ? report.acquisition.map(row => <BarRow key={row.key} row={row} total={report.acquisition.reduce((sum, item) => sum + item.sessions, 0)} meta={`${percent(row.bounceRate ?? null)} bounce`} />) : <Empty message="GA4 session acquisition is not available for this window. Contentsquare referring-page values are intentionally not substituted." />}</div></Panel><Panel icon={<Users size={18} />} eyebrow="Audience" title="New versus returning browsers" subtitle="Internal sessions are excluded before this breakdown is calculated."><div className="mt-5 space-y-4">{report.visitorTypes.length ? report.visitorTypes.map(row => <div key={row.key} className="rounded-2xl bg-[#f8f7ef] p-4"><div className="flex items-start justify-between"><div><div className="font-bold">{row.label}</div><div className="mt-1 text-xs text-[#66736b]">{percent(row.engagedRate)} engaged · {row.pageViewsPerSession?.toFixed(2) || '—'} pages/session · median {seconds(row.medianEngagementSeconds ?? null)}</div></div><div className="text-2xl font-semibold tabular-nums">{number(row.sessions)}</div></div><div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[#dfe5dc]"><div className="h-full rounded-full bg-[#397052]" style={{ width: `${Math.max(2, (row.share || 0) * 100)}%` }} /></div></div>) : <Empty />}</div></Panel></section>

      <section className="mt-10 rounded-[24px] border border-[#102319]/10 bg-[#102319] p-5 text-white shadow-[0_20px_55px_rgba(16,35,25,.15)] sm:p-7"><div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-[10px] font-extrabold uppercase tracking-[.15em] text-[#d8ff71]">Intent cohorts</p><h2 className="mt-1 text-2xl font-semibold tracking-[-.04em]">Traffic quality, not just traffic volume</h2></div><Target className="text-[#d8ff71]" /></div>{report.intents.length ? <div className="mt-6 overflow-x-auto"><table className="w-full min-w-[900px] text-left text-xs"><thead className="text-white/45"><tr><th className="pb-3">Intent</th><th className="pb-3 text-right">Sessions</th><th className="pb-3 text-right">Engaged</th><th className="pb-3 text-right">CTA</th><th className="pb-3 text-right">Signup start</th><th className="pb-3 text-right">Account</th><th className="pb-3 text-right">Trial complete</th><th className="pb-3 text-right">Activated</th></tr></thead><tbody>{report.intents.map(row => <tr key={row.intent} className="border-t border-white/10"><td className="py-4 font-bold">{row.label}</td><td className="py-4 text-right tabular-nums">{row.sessions}</td><td className="py-4 text-right">{percent(row.engagedRate)}</td><td className="py-4 text-right">{percent(row.ctaRate)}</td><td className="py-4 text-right">{percent(row.signupStartRate)}</td><td className="py-4 text-right">{percent(row.accountCreatedRate)}</td><td className="py-4 text-right font-bold text-[#d8ff71]">{percent(row.trialCompleteRate)}</td><td className="py-4 text-right">{number(row.activatedUsers)}</td></tr>)}</tbody></table></div> : <div className="mt-6 rounded-2xl border border-white/10 bg-white/[.06] p-5"><div className="flex gap-3"><Clock3 className="mt-0.5 shrink-0 text-[#d8ff71]" size={18} /><div><h3 className="font-bold">Rules are ready; session data is still collecting.</h3><p className="mt-1 text-sm leading-6 text-white/60">GA4 BigQuery will classify each session by priority using landing page, source, medium, campaign, keyword, creative and referrer. No cohort totals are inferred from unrelated aggregates.</p></div></div><div className="mt-4 flex flex-wrap gap-2">{Object.entries(INTENT_LABELS).map(([id, label]) => <span key={id} className="rounded-full border border-white/10 bg-white/[.05] px-3 py-1.5 text-[11px] text-white/70">{label}</span>)}</div></div>}</section>

      <section className="mt-10 grid gap-5 xl:grid-cols-[1.15fr_.85fr]"><Panel icon={<Gauge size={18} />} eyebrow="Behavior + friction" title="Landing pages that leak attention" subtitle="Behavior is calculated only from the quality-filtered reporting population.">{report.landingPages.length ? <div className="mt-5 overflow-x-auto"><table className="w-full min-w-[720px] text-left text-xs"><thead className="text-[#748078]"><tr><th className="pb-3">Page group</th><th className="pb-3 text-right">Visits</th><th className="pb-3 text-right">Bounce</th><th className="pb-3 text-right">Exit</th><th className="pb-3 text-right">Scroll</th><th className="pb-3 text-right">Interact</th><th className="pb-3 text-right">LCP p75</th></tr></thead><tbody>{report.landingPages.map(row => <tr key={row.page} className="border-t border-[#102319]/10 align-top"><td className="py-3 pr-4"><div className="font-bold">{row.page}</div>{row.warning && <div className="mt-1 max-w-xs text-[10px] leading-4 text-[#8b5b12]">{row.warning}</div>}</td><td className="py-3 text-right">{row.sessions}</td><td className="py-3 text-right">{percent(row.bounceRate)}</td><td className="py-3 text-right">{percent(row.exitRate)}</td><td className="py-3 text-right">{percent(row.scrollReach)}</td><td className="py-3 text-right">{seconds(row.interactionSeconds)}</td><td className={`py-3 text-right font-bold ${row.lcpP75Seconds !== null && row.lcpP75Seconds > 4 ? 'text-[#8b3027]' : ''}`}>{row.lcpP75Seconds === null ? '—' : `${row.lcpP75Seconds.toFixed(1)}s`}</td></tr>)}</tbody></table></div> : <div className="mt-5"><Empty /></div>}</Panel><Panel icon={<Search size={18} />} eyebrow="SEO demand" title="Visibility is still shallow" subtitle="Ubersuggest rankings are available; Search Console impressions and clicks are not connected yet."><div className="mt-5 grid grid-cols-3 gap-3"><MiniStat label="Ranking terms" value={report.seo.rankingKeywords} /><MiniStat label="Top 10" value={report.seo.topTenKeywords} /><MiniStat label="Top 100 tracked" value={report.seo.topHundredKeywords} /><MiniStat label="Est. visits / mo" value={report.seo.estimatedMonthlyTraffic} /><MiniStat label="Authority" value={report.seo.domainAuthority} /><MiniStat label="Referring domains" value={report.seo.referringDomains} /></div><div className="mt-5 space-y-2">{report.seo.keywords.slice(0, 6).map(keyword => <div key={keyword.query} className="rounded-xl border border-[#102319]/9 bg-[#f8f7ef] p-3"><div className="flex justify-between gap-3"><div className="min-w-0"><div className="truncate text-xs font-bold">{keyword.query}</div><div className="mt-1 text-[10px] text-[#748078]">{INTENT_LABELS[keyword.intent]} · {keyword.page}</div></div><div className="shrink-0 text-right"><div className="text-sm font-bold">#{keyword.position ?? '—'}</div><div className="text-[9px] text-[#748078]">position</div></div></div></div>)}</div></Panel></section>

      <section className="mt-10 rounded-[24px] border border-[#102319]/10 bg-[#fffdf5] p-5 sm:p-7"><div className="flex items-center gap-3"><Database size={18} /><div><p className="text-[10px] font-extrabold uppercase tracking-[.14em] text-[#49725a]">Diagnostics</p><h2 className="text-xl font-semibold">Freshness, coverage and instrumentation</h2></div></div><div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{report.diagnostics.map(source => <article key={source.id} className="rounded-2xl border border-[#102319]/10 bg-[#f8f7ef] p-4"><div className="flex items-center justify-between gap-3"><h3 className="font-bold">{source.name}</h3><Status state={source.state} /></div><p className="mt-3 text-xs leading-5 text-[#5e6b63]">{source.detail}</p><p className="mt-3 text-[10px] font-semibold text-[#748078]">{source.freshness ? `Freshness: ${freshness(source.freshness)}` : 'No freshness timestamp'}</p></article>)}</div><div className="mt-5 flex flex-wrap gap-4 text-xs font-bold"><a href="https://analytics.google.com/analytics/web/#/analysis/a380265295p519498279/edit/HXBtWKU2Ra-DR6xfs5TmZQ" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-[#397052]">Open GA4 exploration <ExternalLink size={13} /></a><a href="https://app.contentsquare.com/#/dashboards/2193ca02-d057-4f22-83d0-2345fb793f9f?project=530048" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-[#397052]">Open Contentsquare dashboard <ExternalLink size={13} /></a></div></section>
    </div>}
  </main></div></>;
}
