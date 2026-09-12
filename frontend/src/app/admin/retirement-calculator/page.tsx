'use client';

/**
 * Patterns across runs of the public retirement calculator.
 *
 * Everything here is banded rather than averaged. A mean portfolio across a
 * landing page's visitors is decided by whoever typed the most zeroes; what
 * the page needs to know is how many people arrive at each scale, and which
 * of those the model serves badly.
 *
 * Refusals sit beside answers throughout, because a calculator nobody can get
 * an answer out of is what prompted the logging.
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ArrowLeft, BarChart3, Database, Mail, RefreshCw, ShieldAlert, SlidersHorizontal } from 'lucide-react';
import PageMeta from '../../../components/PageMeta';
import AuthenticatedPageHeader from '../../../components/authenticated/AuthenticatedPageHeader';
import { markInternalAnalyticsBrowser } from '../../../lib/internal-analytics';

interface Band { label: string; count: number; share: number }

interface Report {
  generatedAt: string;
  windowDays: number;
  truncated: boolean;
  totals: {
    runs: number;
    answeredWithVerdict: number;
    answeredWithRates: number;
    rejected: number;
    answerRate: number;
    cachedShare: number;
    medianDurationMs: number | null;
  };
  rejectionsByField: Band[];
  blanksByField: Band[];
  assumptionsByField: Band[];
  distributions: {
    currentAge: Band[];
    retirementAge: Band[];
    investableAssets: Band[];
    annualSpending: Band[];
    socialSecurityAnnual: Band[];
    allocation: Band[];
    survivalRate: Band[];
  };
  daily: Array<{ date: string; runs: number; rejected: number; answerRate: number }>;
  leadCapture: {
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
}

const FIELD_LABELS: Record<string, string> = {
  currentAge: 'Current age',
  retirementAge: 'Retirement age',
  investableAssets: 'Investment assets',
  annualSpending: 'Annual spending',
  annualContributions: 'Annual contributions',
  socialSecurityAnnual: 'Social Security estimate',
  socialSecurityStartAge: 'Social Security start age',
  allocation: 'Allocation',
  lifeExpectancy: 'Life expectancy',
  body: 'Malformed request',
};

const fieldLabel = (field: string) => FIELD_LABELS[field] ?? field;
const percent = (value: number | null) => (value === null ? '—' : `${(value * 100).toFixed(1)}%`);
const number = (value: number | null) => (value === null ? '—' : value.toLocaleString('en-US'));

export default function RetirementCalculatorAdminPage() {
  const [days, setDays] = useState<7 | 28 | 90>(28);
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const apiUrl = process.env.NEXT_PUBLIC_API_URL;

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const token = localStorage.getItem('auth_token');
      const response = await fetch(`${apiUrl}/admin/retirement-calculator?days=${days}`, {
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      });
      if (response.status === 401 || response.status === 403) {
        throw new Error('Sign in with an admin account to view calculator runs.');
      }
      if (!response.ok) throw new Error('Calculator runs could not be loaded.');
      markInternalAnalyticsBrowser();
      setReport(await response.json() as Report);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Calculator runs could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [apiUrl, days]);

  useEffect(() => { void load(); }, [load]);

  const peakDailyRuns = Math.max(1, ...(report?.daily.map((entry) => entry.runs) ?? [1]));

  return <>
    <PageMeta title="Retirement calculator runs | Ask Linc" description="What visitors enter into the public retirement calculator, and what it returns." />
    <div className="authenticated-site min-h-screen bg-[#f2f1e8] text-[#102319]">
      <AuthenticatedPageHeader activePage="admin" eyebrow="Product intelligence" title="Retirement calculator runs" />
      <main className="mx-auto max-w-[1320px] px-4 pb-20 pt-7 sm:px-6">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <Link href="/admin" className="inline-flex items-center gap-2 text-sm font-bold text-[#486657] hover:text-[#102319]">
            <ArrowLeft size={15} /> Back to administration
          </Link>
          <div className="flex items-center gap-2">
            <div className="mr-1 inline-flex items-center gap-2 text-xs font-extrabold uppercase tracking-[.11em] text-[#486657]">
              <SlidersHorizontal size={14} /> Window
            </div>
            {([7, 28, 90] as const).map((option) => (
              <button key={option} type="button" onClick={() => setDays(option)}
                className={`min-h-9 rounded-full px-3 text-xs font-bold ${days === option ? 'bg-[#102319] text-white' : 'bg-[#e9eee5] text-[#486657]'}`}>
                {option}d
              </button>
            ))}
            <button type="button" onClick={() => void load()} disabled={loading} className="admin-button-secondary gap-2">
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
            </button>
          </div>
        </div>

        {error && (
          <div className="mt-6 rounded-2xl border border-[#b84a3d]/25 bg-[#f8e8e3] p-5 text-sm text-[#8b3027]">
            <ShieldAlert className="mr-2 inline" size={17} />{error}
          </div>
        )}
        {loading && !report && (
          <div className="grid min-h-[360px] place-items-center">
            <div className="flex items-center gap-3 text-sm font-bold text-[#486657]">
              <RefreshCw className="animate-spin" size={18} /> Loading calculator runs…
            </div>
          </div>
        )}

        {report && report.totals.runs === 0 && !error && (
          <div className="mt-6 rounded-2xl border border-[#102319]/10 bg-[#fffdf5] p-6 text-sm text-[#5e6b63]">
            No runs recorded in the last {report.windowDays} days. Rows are written from the moment the
            calculator is deployed with logging enabled, so an empty window here is expected until then.
          </div>
        )}

        {report && (
          <section className="mt-6 rounded-[22px] border border-[#102319]/10 bg-[#fffdf5] p-5 shadow-[0_18px_45px_rgba(16,35,25,.05)] sm:p-6">
            <div className="flex items-start gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#102319] text-[#d8ff71]"><Mail size={18} /></span>
              <div>
                <p className="text-[10px] font-extrabold uppercase tracking-[.13em] text-[#49725a]">Known-prospect capture</p>
                <h2 className="text-lg font-semibold tracking-[-.03em]">Email me these results</h2>
                <p className="mt-2 max-w-4xl text-xs leading-5 text-[#66736b]">{report.leadCapture.note}</p>
              </div>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
              <Kpi label="Requests stored" value={number(report.leadCapture.requests)} />
              <Kpi label="Emails sent" value={number(report.leadCapture.emailsSent)} note={`${percent(report.leadCapture.deliveryRate)} of stored requests`} accent />
              <Kpi label="Unique emails" value={number(report.leadCapture.uniqueEmails)} />
              <Kpi label="MailerLite synced" value={number(report.leadCapture.mailerliteSynced)} />
              <Kpi label="Email CTA continued" value={number(report.leadCapture.continuedToSignup)} note={`${percent(report.leadCapture.continuationRate)} of delivered emails`} />
              <Kpi label="Matched accounts" value={number(report.leadCapture.matchedAccounts)} note={`${percent(report.leadCapture.accountMatchRate)} of unique lead emails`} />
            </div>
          </section>
        )}

        {report && report.totals.runs > 0 && (
          <div className={loading ? 'pointer-events-none opacity-55 transition-opacity' : 'transition-opacity'}>
            {report.truncated && (
              <div className="mt-2 rounded-2xl border border-[#9d6a16]/20 bg-[#f4ead0] px-5 py-4">
                <div className="flex gap-3">
                  <AlertTriangle className="mt-0.5 shrink-0 text-[#76510f]" size={17} />
                  <div>
                    <div className="text-sm font-bold text-[#76510f]">This window is clipped</div>
                    <p className="mt-1 text-xs leading-5 text-[#76510f]/85">
                      More runs happened in the last {report.windowDays} days than this report
                      reads. Every share below is over the {number(report.totals.runs)} most recent
                      runs, not the whole window. Narrow the window for a complete picture.
                    </p>
                  </div>
                </div>
              </div>
            )}
            <section className="mt-2">
              <div className="mb-4 flex items-end justify-between gap-4">
                <div>
                  <p className="text-[10px] font-extrabold uppercase tracking-[.15em] text-[#49725a]">Last {report.windowDays} days</p>
                  <h2 className="mt-1 text-2xl font-semibold tracking-[-.04em]">Did the calculator answer?</h2>
                </div>
                <div className="hidden text-xs text-[#748078] sm:block">Updated {new Date(report.generatedAt).toLocaleString()}</div>
              </div>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
                <Kpi label="Submissions" value={number(report.totals.runs)} />
                <Kpi label="Got an answer" value={percent(report.totals.answerRate)} accent />
                <Kpi label="Full verdict" value={number(report.totals.answeredWithVerdict)} />
                <Kpi label="Rates only" value={number(report.totals.answeredWithRates)} note="A portfolio or spending level was blank" />
                <Kpi label="Refused" value={number(report.totals.rejected)} />
                <Kpi label="Median run" value={report.totals.medianDurationMs === null ? '—' : `${report.totals.medianDurationMs} ms`} note={`${percent(report.totals.cachedShare)} served from cache`} />
              </div>
            </section>

            <section className="mt-10 grid gap-5 lg:grid-cols-3">
              <Panel eyebrow="Friction" title="Which figure the model refused"
                subtitle="Every refusal is a visitor who asked and left without an answer.">
                <Bands bands={report.rejectionsByField} format={fieldLabel} tone="warn" />
              </Panel>
              <Panel eyebrow="Blanks" title="Which boxes people skip"
                subtitle="A blank portfolio or spending level drops the run to a rates answer.">
                <Bands bands={report.blanksByField} format={fieldLabel} />
              </Panel>
              <Panel eyebrow="Assumptions" title="What the model filled in"
                subtitle="Horizon defaults the model applied and named on the results.">
                <Bands bands={report.assumptionsByField} format={fieldLabel} />
              </Panel>
            </section>

            <section className="mt-10 grid gap-5 lg:grid-cols-2">
              <Panel icon={<BarChart3 size={18} />} eyebrow="Who is arriving" title="Investment assets entered"
                subtitle="Banded, not averaged: one large portfolio would decide a mean.">
                <Bands bands={report.distributions.investableAssets} />
              </Panel>
              <Panel icon={<BarChart3 size={18} />} eyebrow="Who is arriving" title="Annual spending entered">
                <Bands bands={report.distributions.annualSpending} />
              </Panel>
              <Panel eyebrow="Who is arriving" title="Current age"><Bands bands={report.distributions.currentAge} /></Panel>
              <Panel eyebrow="Who is arriving" title="Retirement age"><Bands bands={report.distributions.retirementAge} /></Panel>
              <Panel eyebrow="Who is arriving" title="Social Security estimate"><Bands bands={report.distributions.socialSecurityAnnual} /></Panel>
              <Panel eyebrow="Who is arriving" title="Asset mix chosen"><Bands bands={report.distributions.allocation} /></Panel>
            </section>

            <section className="mt-10 grid gap-5 lg:grid-cols-[1fr_1.1fr]">
              <Panel eyebrow="What they were told" title="Survival rate returned"
                subtitle="Only runs that claimed a verdict. A page full of weak answers is a different problem from a page full of refusals.">
                <Bands bands={report.distributions.survivalRate} tone="survival" />
              </Panel>
              <Panel icon={<Database size={18} />} eyebrow="Over time" title="Runs and refusals by day">
                <div className="mt-5 space-y-2">
                  {report.daily.map((entry) => (
                    <div key={entry.date} className="flex items-center gap-3 text-xs">
                      <span className="w-20 shrink-0 tabular-nums text-[#748078]">{entry.date.slice(5)}</span>
                      <div className="flex h-4 min-w-0 flex-1 overflow-hidden rounded-full bg-[#dfe5dc]">
                        <div className="h-full bg-[#397052]" style={{ width: `${((entry.runs - entry.rejected) / peakDailyRuns) * 100}%` }} />
                        <div className="h-full bg-[#b84a3d]" style={{ width: `${(entry.rejected / peakDailyRuns) * 100}%` }} />
                      </div>
                      <span className="w-24 shrink-0 text-right tabular-nums">
                        {entry.runs} · {percent(entry.answerRate)}
                      </span>
                    </div>
                  ))}
                </div>
                <p className="mt-4 text-[10px] leading-4 text-[#66736b]">
                  Green is answered, red refused. The trailing figure is the share that got an answer.
                </p>
              </Panel>
            </section>
          </div>
        )}
      </main>
    </div>
  </>;
}

function Kpi({ label, value, note, accent }: { label: string; value: string; note?: string; accent?: boolean }) {
  return (
    <div className={`rounded-2xl border p-4 ${accent ? 'border-transparent bg-[#102319] text-white' : 'border-[#102319]/10 bg-[#fffdf5]'}`}>
      <div className="text-2xl font-semibold tabular-nums tracking-[-.04em]">{value}</div>
      <div className={`mt-2 text-xs ${accent ? 'text-white/60' : 'text-[#748078]'}`}>{label}</div>
      {note && <div className={`mt-1 text-[10px] leading-4 ${accent ? 'text-white/45' : 'text-[#98a29a]'}`}>{note}</div>}
    </div>
  );
}

function Panel({ icon, eyebrow, title, subtitle, children }: {
  icon?: React.ReactNode; eyebrow: string; title: string; subtitle?: string; children: React.ReactNode;
}) {
  return (
    <section className="rounded-[22px] border border-[#102319]/10 bg-[#fffdf5] p-5 shadow-[0_18px_45px_rgba(16,35,25,.05)] sm:p-6">
      <div className="flex items-center gap-3">
        {icon && <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#102319] text-[#d8ff71]">{icon}</span>}
        <div>
          <p className="text-[10px] font-extrabold uppercase tracking-[.13em] text-[#49725a]">{eyebrow}</p>
          <h2 className="text-lg font-semibold tracking-[-.03em]">{title}</h2>
        </div>
      </div>
      {subtitle && <p className="mt-3 text-xs leading-5 text-[#66736b]">{subtitle}</p>}
      {children}
    </section>
  );
}

function Bands({ bands, format, tone }: {
  bands: Band[]; format?: (label: string) => string; tone?: 'warn' | 'survival';
}) {
  if (bands.length === 0) {
    return <p className="mt-5 rounded-xl bg-[#f8f7ef] p-4 text-xs text-[#748078]">Nothing recorded in this window.</p>;
  }
  const peak = Math.max(...bands.map((entry) => entry.count));

  return (
    <div className="mt-5 space-y-3">
      {bands.map((entry) => (
        <div key={entry.label}>
          <div className="flex items-baseline justify-between gap-3 text-xs">
            <span className="font-bold">{format ? format(entry.label) : entry.label}</span>
            <span className="shrink-0 tabular-nums text-[#748078]">
              {entry.count.toLocaleString('en-US')} · {(entry.share * 100).toFixed(0)}%
            </span>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[#dfe5dc]">
            <div
              className={`h-full rounded-full ${tone === 'warn' ? 'bg-[#b84a3d]' : tone === 'survival' ? 'bg-[#9d6a16]' : 'bg-[#397052]'}`}
              style={{ width: `${Math.max(2, (entry.count / peak) * 100)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
