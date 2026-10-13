'use client';

import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import {
  cellStyle,
  ENGAGED_CELL_STYLE,
  formatDate,
  GRAIN_LABEL,
  GrainSelect,
  NumberControl,
  percent,
  type CohortCell,
  type Grain,
} from './cohort-shared';
import { isInternalAnalyticsBrowser, setOperatorBrowserCounted } from '../../lib/internal-analytics';

type Action = 'coast_fire_run' | 'retirement_run' | 'cash_flow_check' | 'coffee_widget';
type Metric = 'any_action' | Action | 'visited' | 'signed_up';
type ActionCounts = Record<Action, number>;

interface VisitorSession {
  sessionId: string;
  startedAt: string;
  landingPage: string;
  channel: string;
  campaign: string;
  device: string;
  pageViews: number;
  engagementSeconds: number;
  actions: ActionCounts;
}

interface VisitorMember {
  visitorId: string;
  firstSeenAt: string;
  landingPage: string;
  channel: string;
  campaign: string;
  device: string;
  sessionCount: number;
  actions: ActionCounts;
  outcome: 'signed_up' | 'signed_in' | null;
  outcomeAt: string | null;
  sessions: VisitorSession[];
}

interface VisitorTotals {
  actions: Record<Action, { visitors: number; count: number }>;
  anyAction: number;
  returned: number;
  signedUp: number;
  signedIn: number;
}

interface VisitorRow {
  key: string;
  label: string;
  size: number;
  totals: VisitorTotals;
  cells: Record<Metric, CohortCell[]>;
  members: VisitorMember[];
}

interface VisitorReport {
  kind: 'visitors';
  state: 'live' | 'needs_configuration' | 'error' | 'truncated';
  detail: string;
  reportEnd: string | null;
  periodGrain: Grain;
  periodCount: number;
  memberLimit: number;
  membersFor: string | null;
  cohorts: VisitorRow[];
  overall: { size: number; totals: VisitorTotals; cells: Record<Metric, CohortCell[]> };
  excluded: { operatorBrowsers: number; automatedSessions: number; seenBeforeWindow: number };
  notes: string[];
}

const ACTIONS: Action[] = ['coast_fire_run', 'retirement_run', 'cash_flow_check', 'coffee_widget'];

const ACTION_LABEL: Record<Action, string> = {
  coast_fire_run: 'Coast FIRE',
  retirement_run: 'Retirement',
  cash_flow_check: 'Cash flow check',
  coffee_widget: 'Coffee',
};

const ACTION_DONE: Record<Action, string> = {
  coast_fire_run: 'ran the Coast FIRE calculator',
  retirement_run: 'ran the retirement calculator',
  cash_flow_check: 'opened the cash flow check',
  coffee_widget: 'opened Buy Me a Coffee',
};

const METRICS: Array<{ value: Metric; label: string }> = [
  { value: 'any_action', label: 'Any action' },
  ...ACTIONS.map(action => ({ value: action as Metric, label: ACTION_LABEL[action] })),
  { value: 'visited', label: 'Visited' },
  { value: 'signed_up', label: 'Signed up' },
];

const METRIC_DONE: Record<Metric, string> = {
  any_action: 'did any of the four',
  ...ACTION_DONE,
  visited: 'visited',
  signed_up: 'had signed up',
};

const LANDINGS = [
  ['all', 'All pages'],
  ['coast_fire_calculator', 'Coast FIRE calculator'],
  ['retirement_calculator', 'Retirement calculator'],
  ['cash_flow_forecast', 'Cash flow forecast page'],
  ['other', 'Any other page'],
] as const;

const CHANNELS = [
  ['all', 'All channels'],
  ['paid', 'Paid'],
  ['organic_search', 'Organic search'],
  ['organic_social', 'Organic social'],
  ['direct', 'Direct'],
  ['referral', 'Referral'],
  ['other', 'Other'],
] as const;

const DEVICES = [['all', 'All devices'], ['desktop', 'Desktop'], ['mobile', 'Mobile'], ['tablet', 'Tablet']] as const;

const SELECT_CLASS = 'h-10 rounded border border-[#102319]/15 bg-white px-3 text-sm text-[#102319]';

/** What one row of the "What they did" table shows, in column order. */
function didColumns(totals: VisitorTotals): Array<{ key: string; label: string; visitors: number; title: (size: number) => string }> {
  return [
    ...ACTIONS.map(action => ({
      key: action,
      label: ACTION_LABEL[action],
      visitors: totals.actions[action].visitors,
      title: (size: number) => `${totals.actions[action].visitors} of ${size} ${ACTION_DONE[action]}, ${totals.actions[action].count} ${totals.actions[action].count === 1 ? 'time' : 'times'} in all`,
    })),
    { key: 'any', label: 'Any of these', visitors: totals.anyAction, title: size => `${totals.anyAction} of ${size} did at least one of the four` },
    { key: 'returned', label: 'Came back', visitors: totals.returned, title: size => `${totals.returned} of ${size} had a second session` },
    { key: 'signed_up', label: 'Signed up', visitors: totals.signedUp, title: size => `${totals.signedUp} of ${size} signed up` },
  ];
}

function shareOf(visitors: number, size: number): number | null {
  return size > 0 ? visitors / size : null;
}

/**
 * A share with its count and a thin bar scaled to the column's largest share.
 * A bar rather than a filled cell: these shares run from 1% to 40%, so one
 * heat scale leaves the small columns blank, and a scale per column paints a
 * handful of coffee clicks as dark as a third of the cohort.
 */
function ShareCell({ visitors, size, max, title, strong = false }: {
  visitors: number;
  size: number;
  max: number;
  title: string;
  strong?: boolean;
}) {
  const rate = shareOf(visitors, size);
  if (rate === null) return <td className="px-2 py-1.5 text-center text-[#a3aca6]" title={title}>—</td>;
  return (
    <td className="px-2 py-1.5 align-top tabular-nums" title={title}>
      <div className="flex items-baseline justify-between gap-2">
        <span className={strong ? 'font-semibold text-[#102319]' : 'font-medium text-[#102319]'}>{percent(rate)}</span>
        <span className="text-[11px] text-[#5e6b63]">{visitors}</span>
      </div>
      <div className="mt-1 h-1 rounded-full bg-[#e3e9df]" aria-hidden="true">
        <div className="h-1 rounded-full bg-[#3f7a55]" style={{ width: `${max > 0 ? Math.round((rate / max) * 100) : 0}%` }} />
      </div>
    </td>
  );
}

function duration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${seconds % 60}s`;
}

function acquisition(channel: string, campaign: string): string {
  return campaign && campaign !== '(not set)' ? `${channel} · ${campaign}` : channel;
}

function outcomeText(member: VisitorMember): string {
  if (member.outcome === 'signed_up') return `Signed up ${formatDate(member.outcomeAt)}`;
  if (member.outcome === 'signed_in') return `Signed in ${formatDate(member.outcomeAt)} (existing account)`;
  return '—';
}

function CountCell({ value }: { value: number }) {
  return (
    <td
      className={`px-2 py-2 text-center tabular-nums ${value > 0 ? 'font-semibold' : 'text-[#5e6b63]'}`}
      style={value > 0 ? ENGAGED_CELL_STYLE : undefined}
    >
      {value}
    </td>
  );
}

function VisitorTable({ members }: { members: VisitorMember[] }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <table className="min-w-full text-left text-sm">
      <thead className="whitespace-nowrap text-xs uppercase tracking-wide text-[#5e6b63]">
        <tr>
          <th className="px-3 py-2">Visitor</th>
          <th className="px-3 py-2">First seen</th>
          <th className="px-3 py-2">Landed on</th>
          <th className="px-3 py-2">Channel</th>
          <th className="px-3 py-2">Device</th>
          <th className="px-3 py-2 text-right">Sessions</th>
          {ACTIONS.map(action => <th key={action} className="px-2 py-2 text-center">{ACTION_LABEL[action]}</th>)}
          <th className="px-3 py-2">Outcome</th>
        </tr>
      </thead>
      <tbody>
        {members.map(member => {
          const expanded = open === member.visitorId;
          return (
            <Fragment key={member.visitorId}>
              <tr className="border-t border-[#102319]/10">
                <td className="px-3 py-2">
                  <button
                    type="button"
                    onClick={() => setOpen(expanded ? null : member.visitorId)}
                    aria-expanded={expanded}
                    aria-label={`${expanded ? 'Hide' : 'Show'} sessions for visitor ${member.visitorId}`}
                    className="whitespace-nowrap rounded font-mono text-xs text-[#102319] underline-offset-2 hover:underline"
                  >
                    <span aria-hidden="true">{expanded ? '▾' : '▸'} </span>{member.visitorId}
                  </button>
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-[#5e6b63]">{formatDate(member.firstSeenAt)}</td>
                <td className="whitespace-nowrap px-3 py-2 text-[#5e6b63]">{member.landingPage}</td>
                <td className="whitespace-nowrap px-3 py-2 text-[#5e6b63]">{acquisition(member.channel, member.campaign)}</td>
                <td className="px-3 py-2 capitalize text-[#5e6b63]">{member.device}</td>
                <td className="px-3 py-2 text-right tabular-nums text-[#102319]">{member.sessionCount}</td>
                {ACTIONS.map(action => <CountCell key={action} value={member.actions[action]} />)}
                <td className="whitespace-nowrap px-3 py-2 text-[#5e6b63]">{outcomeText(member)}</td>
              </tr>
              {expanded && member.sessions.map(session => (
                <tr key={session.sessionId} className="bg-[#f4f6f1] text-xs">
                  <td className="px-3 py-1.5 pl-8 text-[#5e6b63]">Session</td>
                  <td className="whitespace-nowrap px-3 py-1.5 text-[#5e6b63]">{formatDate(session.startedAt)}</td>
                  <td className="whitespace-nowrap px-3 py-1.5 text-[#5e6b63]">{session.landingPage}</td>
                  <td className="whitespace-nowrap px-3 py-1.5 text-[#5e6b63]">{acquisition(session.channel, session.campaign)}</td>
                  <td className="px-3 py-1.5 capitalize text-[#5e6b63]">{session.device}</td>
                  <td className="whitespace-nowrap px-3 py-1.5 text-right tabular-nums text-[#5e6b63]">
                    {session.pageViews} {session.pageViews === 1 ? 'page' : 'pages'} · {duration(session.engagementSeconds)}
                  </td>
                  {ACTIONS.map(action => <CountCell key={action} value={session.actions[action]} />)}
                  <td />
                </tr>
              ))}
            </Fragment>
          );
        })}
      </tbody>
    </table>
  );
}

function OperatorBrowserSwitch() {
  const [marked, setMarked] = useState<boolean | null>(null);
  const [switched, setSwitched] = useState(false);
  useEffect(() => setMarked(isInternalAnalyticsBrowser()), []);
  if (marked === null) return null;
  return (
    <p className="mt-4 text-xs text-[#5e6b63]">
      {marked
        ? '✓ This browser is marked as yours, so analytics stays off in it. '
        : switched
          ? 'Analytics runs in this browser again from the next page load. '
          : 'Analytics runs in this browser. '}
      <button
        type="button"
        onClick={() => {
          setOperatorBrowserCounted(marked);
          setMarked(isInternalAnalyticsBrowser());
          setSwitched(true);
        }}
        className="font-medium text-[#102319] underline underline-offset-2"
      >
        {marked ? 'Count this browser again' : 'Leave this browser out'}
      </button>
      {marked ? ' (to check tags from it; its visits stay out of this report).' : ''}
    </p>
  );
}

export default function VisitorCohortPanel({
  apiUrl,
  getAuthHeaders,
}: {
  apiUrl: string | undefined;
  getAuthHeaders: () => Record<string, string>;
}) {
  const [landing, setLanding] = useState('all');
  const [channel, setChannel] = useState('all');
  const [campaign, setCampaign] = useState('');
  const [campaignDraft, setCampaignDraft] = useState('');
  const [device, setDevice] = useState('all');
  const [cohortGrain, setCohortGrain] = useState<Grain>('week');
  const [periodGrain, setPeriodGrain] = useState<Grain>('week');
  const [cohortCount, setCohortCount] = useState(12);
  const [periodCount, setPeriodCount] = useState(12);
  const [metric, setMetric] = useState<Metric>('any_action');
  const [report, setReport] = useState<VisitorReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [members, setMembers] = useState<{ key: string; rows: VisitorMember[] } | null>(null);
  const [membersError, setMembersError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const freshRef = useRef(false);
  const authHeadersRef = useRef(getAuthHeaders);
  authHeadersRef.current = getAuthHeaders;

  const query = useMemo(() => new URLSearchParams({
    landing, channel, campaign, device,
    cohort: cohortGrain,
    period: periodGrain,
    cohorts: String(cohortCount),
    periods: String(periodCount),
  }).toString(), [landing, channel, campaign, device, cohortGrain, periodGrain, cohortCount, periodCount]);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams(query);
    // Refresh re-reads the export; other changes may reuse the server's copy.
    if (freshRef.current) params.set('refresh', '1');
    freshRef.current = false;
    setSelectedKey(null);
    setLoading(true);
    setError(null);
    fetch(`${apiUrl}/admin/cohorts/visitors?${params.toString()}`, {
      headers: authHeadersRef.current(),
      signal: controller.signal,
    })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (controller.signal.aborted) return;
        if (!response.ok) throw new Error(body?.error || 'Failed to load the visitor report');
        if (body?.kind !== 'visitors' || !Array.isArray(body?.cohorts)) {
          throw new Error('The visitor report came back in an unexpected shape');
        }
        setReport(body as VisitorReport);
      })
      .catch((caught: unknown) => {
        if (controller.signal.aborted) return;
        // The last report answered other filters; left up, it would read as this one's answer.
        setReport(null);
        setError(caught instanceof Error ? caught.message : 'Failed to load the visitor report');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [apiUrl, query, reloadToken]);

  // A cohort's visitors come on their own request, so the report stays small.
  useEffect(() => {
    setMembers(null);
    setMembersError(null);
    if (!selectedKey) return;
    const controller = new AbortController();
    const params = new URLSearchParams(query);
    params.set('members', selectedKey);
    fetch(`${apiUrl}/admin/cohorts/visitors?${params.toString()}`, {
      headers: authHeadersRef.current(),
      signal: controller.signal,
    })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (controller.signal.aborted) return;
        if (!response.ok) throw new Error(body?.error || 'Failed to load this cohort’s visitors');
        const row = body?.state === 'live' && Array.isArray(body?.cohorts)
          ? (body.cohorts as VisitorRow[]).find(cohort => cohort.key === selectedKey)
          : undefined;
        if (!row) throw new Error(body?.detail || 'This cohort’s visitors could not be loaded');
        setMembers({ key: selectedKey, rows: row.members });
      })
      .catch((caught: unknown) => {
        if (controller.signal.aborted) return;
        setMembersError(caught instanceof Error ? caught.message : 'Failed to load this cohort’s visitors');
      });
    return () => controller.abort();
  }, [apiUrl, query, selectedKey]);

  const live = report?.state === 'live' ? report : null;
  const selected = live?.cohorts.find(row => row.key === selectedKey) ?? null;
  const periodTitle = GRAIN_LABEL[live?.periodGrain ?? periodGrain].title;
  const periodOne = GRAIN_LABEL[live?.periodGrain ?? periodGrain].one;
  // Bars compare cohorts within a column; the shares differ too much between columns to share a scale.
  const columnMax = (index: number) => Math.max(0, ...(live?.cohorts ?? [])
    .filter(row => row.size > 0)
    .map(row => (didColumns(row.totals)[index].visitors / row.size)));
  const toggleCohort = (key: string) => setSelectedKey(selectedKey === key ? null : key);

  return (
    <div className="space-y-6">
      <div className="rounded-lg bg-white/70 p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-[#102319]">Visitor cohorts</h2>
            <p className="mt-1 max-w-2xl text-sm text-[#5e6b63]">
              People who came to the site signed out, grouped by their first visit, and what they did before
              signing up or in. Cohorts use UTC dates. Click a cohort to see its visitors.
            </p>
            <p className="mt-2 text-xs font-medium uppercase tracking-wide text-[#486657]">
              GA4 daily export · not live{report?.reportEnd ? ` · through ${formatDate(`${report.reportEnd}T12:00:00Z`)}` : ''}
            </p>
          </div>
          <button
            onClick={() => {
              freshRef.current = true;
              setReloadToken(value => value + 1);
            }}
            disabled={loading}
            className="min-h-10 rounded bg-[#102319] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {loading ? 'Loading…' : 'Refresh'}
          </button>
        </div>

        <div className="mt-5 flex flex-wrap items-end gap-4">
          <label className="flex flex-col gap-1 text-xs font-medium text-[#5e6b63]">
            Landed on
            <select value={landing} onChange={event => setLanding(event.target.value)} className={SELECT_CLASS}>
              {LANDINGS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-[#5e6b63]">
            Channel
            <select value={channel} onChange={event => setChannel(event.target.value)} className={SELECT_CLASS}>
              {CHANNELS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <form onSubmit={event => { event.preventDefault(); setCampaign(campaignDraft.trim()); }} className="flex items-end gap-2">
            <label className="flex flex-col gap-1 text-xs font-medium text-[#5e6b63]">
              Campaign (utm_campaign)
              <input value={campaignDraft} onChange={event => setCampaignDraft(event.target.value)}
                maxLength={256} placeholder="All campaigns" className="h-10 w-44 rounded border border-[#102319]/15 bg-white px-3 text-sm" />
            </label>
            <button type="submit" className="h-10 rounded border border-[#102319]/15 px-3 text-sm">Apply</button>
          </form>
          <label className="flex flex-col gap-1 text-xs font-medium text-[#5e6b63]">
            Device
            <select value={device} onChange={event => setDevice(event.target.value)} className={SELECT_CLASS}>
              {DEVICES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <GrainSelect label="Cohort by" value={cohortGrain} onChange={setCohortGrain} />
          <NumberControl label="Cohorts shown" value={cohortCount} max={90} onCommit={setCohortCount} />
          <GrainSelect label="Columns" value={periodGrain} onChange={setPeriodGrain} plural />
          <NumberControl label="Columns shown" value={periodCount} max={90} onCommit={setPeriodCount} />
        </div>
        <p className="mt-3 text-xs text-[#5e6b63]">Filters read each visitor’s first session.</p>
        <OperatorBrowserSwitch />

        {error && <p className="mt-4 rounded bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        {report && report.state !== 'live' && (
          <p className="mt-4 rounded bg-amber-50 p-3 text-sm text-amber-900" role="status">
            {report.state === 'needs_configuration' ? 'GA4 is not connected. ' : report.state === 'truncated' ? '' : 'GA4 could not be read. '}
            {report.detail}
          </p>
        )}
        {loading && !report && <p className="mt-4 text-sm text-[#5e6b63]">Loading visitors…</p>}
      </div>

      {live && (
        <div className={`rounded-lg bg-white/70 p-6 transition-opacity ${loading ? 'opacity-60' : ''}`} aria-busy={loading}>
          <section aria-label="What they did">
            <h3 className="font-semibold text-[#102319]">What they did</h3>
            <p className="mt-1 text-xs text-[#5e6b63]">
              Share of each cohort that did each at least once, to date, with how many visitors that is.
              Newer cohorts have had less time. Bars compare cohorts within a column.
            </p>
            <div className="mt-3 overflow-x-auto">
              <table className="min-w-full border-separate border-spacing-x-1 border-spacing-y-0.5 text-sm">
                <thead className="whitespace-nowrap text-xs uppercase tracking-wide text-[#5e6b63]">
                  <tr>
                    <th className="sticky left-0 bg-[#f4f6f1] px-3 py-2 text-left">Cohort</th>
                    <th className="px-3 py-2 text-right">Visitors</th>
                    {didColumns(live.overall.totals).map(column => (
                      <th key={column.key} className="min-w-24 px-2 py-2 text-left">{column.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {live.cohorts.map(row => (
                    <tr key={row.key} className={selectedKey === row.key ? 'outline outline-2 outline-[#397052]' : undefined}>
                      <th className="sticky left-0 bg-[#f4f6f1] px-1 py-1 text-left font-medium">
                        <button
                          type="button"
                          onClick={() => toggleCohort(row.key)}
                          aria-expanded={selectedKey === row.key}
                          className="w-full whitespace-nowrap rounded px-2 py-1 text-left text-[#102319] underline-offset-2 hover:underline"
                        >
                          {row.label}
                        </button>
                      </th>
                      <td className="px-3 py-1 text-right tabular-nums text-[#102319]">{row.size}</td>
                      {didColumns(row.totals).map((column, index) => (
                        <ShareCell
                          key={column.key}
                          visitors={column.visitors}
                          size={row.size}
                          max={columnMax(index)}
                          title={row.size > 0 ? column.title(row.size) : 'No visitors in this cohort'}
                        />
                      ))}
                    </tr>
                  ))}
                  <tr>
                    <th className="sticky left-0 bg-[#f4f6f1] px-3 py-2 text-left font-semibold text-[#102319]">All cohorts</th>
                    <td className="px-3 py-2 text-right font-semibold tabular-nums text-[#102319]">{live.overall.size}</td>
                    {didColumns(live.overall.totals).map((column, index) => (
                      <ShareCell
                        key={column.key}
                        visitors={column.visitors}
                        size={live.overall.size}
                        max={columnMax(index)}
                        title={live.overall.size > 0 ? column.title(live.overall.size) : 'No visitors'}
                        strong
                      />
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
            {live.overall.totals.signedIn > 0 && (
              <p className="mt-2 text-xs text-[#5e6b63]">
                {live.overall.totals.signedIn} more signed in to an existing account rather than signing up.
              </p>
            )}
          </section>

          <section aria-label="When they came back" className="mt-8">
            <h3 className="font-semibold text-[#102319]">When they came back</h3>
            <div className="mt-3 flex flex-wrap gap-1 rounded border border-[#102319]/15 bg-white p-0.5" role="group" aria-label="Show">
              {METRICS.map(option => (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={metric === option.value}
                  onClick={() => setMetric(option.value)}
                  className={`min-h-9 rounded px-3 text-sm font-medium ${
                    metric === option.value ? 'bg-[#102319] text-white' : 'text-[#5e6b63] hover:text-[#102319]'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-[#5e6b63]">
              {metric === 'signed_up'
                ? `Share of each cohort that had signed up by the end of each ${periodOne} after their first visit.`
                : `Share of each cohort that ${METRIC_DONE[metric]} in each ${periodOne} after their first visit.`}
              {metric === 'visited' ? ` ${periodTitle} 1 is always everyone; later columns are returns.` : ''}
            </p>
            <div className="mt-3 overflow-x-auto">
              <table className="min-w-full border-separate border-spacing-0.5 text-sm">
                <thead className="whitespace-nowrap text-xs uppercase tracking-wide text-[#5e6b63]">
                  <tr>
                    <th className="sticky left-0 bg-[#f4f6f1] px-3 py-2 text-left">Cohort</th>
                    <th className="px-3 py-2 text-right">Visitors</th>
                    {Array.from({ length: live.periodCount }, (_, index) => (
                      <th key={index} className="min-w-14 px-2 py-2 text-center">{periodTitle} {index + 1}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {live.cohorts.map(row => (
                    <tr key={row.key} className={selectedKey === row.key ? 'outline outline-2 outline-[#397052]' : undefined}>
                      <th className="sticky left-0 bg-[#f4f6f1] px-1 py-1 text-left font-medium">
                        <button
                          type="button"
                          onClick={() => toggleCohort(row.key)}
                          aria-expanded={selectedKey === row.key}
                          className="w-full whitespace-nowrap rounded px-2 py-1 text-left text-[#102319] underline-offset-2 hover:underline"
                        >
                          {row.label}
                        </button>
                      </th>
                      <td className="px-3 py-1 text-right tabular-nums text-[#102319]">{row.size}</td>
                      {row.cells[metric].map((cell, index) => (
                        <td
                          key={index}
                          title={cell.eligible === 0
                            ? 'No one in this cohort has finished this period yet'
                            : `${cell.count} of ${cell.eligible} ${METRIC_DONE[metric]}${row.size > cell.eligible ? ` (${row.size - cell.eligible} still in this period)` : ''}`}
                          style={cellStyle(cell)}
                          className={`rounded px-2 py-1 text-center tabular-nums ${cell.rate === null ? 'text-[#a3aca6]' : ''}`}
                        >
                          {percent(cell.rate)}
                          {cell.rate !== null && cell.eligible < row.size ? '*' : ''}
                        </td>
                      ))}
                    </tr>
                  ))}
                  <tr>
                    <th className="sticky left-0 bg-[#f4f6f1] px-3 py-2 text-left font-semibold text-[#102319]">All cohorts</th>
                    <td className="px-3 py-2 text-right font-semibold tabular-nums text-[#102319]">{live.overall.size}</td>
                    {live.overall.cells[metric].map((cell, index) => (
                      <td
                        key={index}
                        title={cell.eligible === 0 ? 'No one has finished this period yet' : `${cell.count} of ${cell.eligible} ${METRIC_DONE[metric]}`}
                        style={cellStyle(cell)}
                        className={`rounded px-2 py-2 text-center font-semibold tabular-nums ${cell.rate === null ? 'text-[#a3aca6]' : ''}`}
                      >
                        {percent(cell.rate)}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-xs text-[#5e6b63]">
              * Some of the cohort is still in this period; the share is of those who have finished it. A dash means no one has finished it yet.
            </p>
          </section>

          {selected && (
            <div className="mt-6 rounded-lg border border-[#102319]/10 bg-white p-4" aria-label={`${selected.label} visitors`}>
              <div className="mb-3 flex items-center justify-between gap-3">
                <h3 className="text-base font-semibold text-[#102319]">
                  {selected.label}: {selected.size} {selected.size === 1 ? 'visitor' : 'visitors'}
                </h3>
                <button
                  type="button"
                  onClick={() => setSelectedKey(null)}
                  className="rounded px-3 py-1 text-sm text-[#5e6b63] hover:bg-[#e9eee5] hover:text-[#102319]"
                >
                  Close
                </button>
              </div>
              {selected.size === 0 ? (
                <p className="text-sm text-[#5e6b63]">No one first visited in this cohort.</p>
              ) : membersError ? (
                <p className="rounded bg-red-50 p-3 text-sm text-red-700">{membersError}</p>
              ) : members?.key !== selected.key ? (
                <p className="text-sm text-[#5e6b63]">Loading visitors…</p>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <VisitorTable members={members.rows} />
                  </div>
                  <p className="mt-3 text-xs text-[#5e6b63]">
                    {selected.size > members.rows.length
                      ? `Showing the ${members.rows.length} most active of ${selected.size} visitors, signups first. `
                      : 'Signups first, then the most active. '}
                    Dates are UTC. Click a visitor to see each session. Counts stop at signing up or in.
                  </p>
                </>
              )}
            </div>
          )}

          <ul className="mt-6 space-y-1 text-xs text-[#5e6b63]">
            {live.notes.map(note => <li key={note}>{note}</li>)}
            {live.excluded.operatorBrowsers > 0 && (
              <li>
                {live.excluded.operatorBrowsers} operator {live.excluded.operatorBrowsers === 1 ? 'browser is' : 'browsers are'} left
                out entirely: {live.excluded.operatorBrowsers === 1 ? 'it' : 'each'} opened /admin or was marked when an admin signed in.
              </li>
            )}
            {live.excluded.seenBeforeWindow > 0 && (
              <li>
                {live.excluded.seenBeforeWindow} {live.excluded.seenBeforeWindow === 1 ? 'browser' : 'browsers'} first visited before
                the oldest cohort shown, so {live.excluded.seenBeforeWindow === 1 ? 'it is' : 'they are'} not new here.
              </li>
            )}
            {live.excluded.automatedSessions > 0 && (
              <li>{live.excluded.automatedSessions} automated, test or off-site {live.excluded.automatedSessions === 1 ? 'session is' : 'sessions are'} left out.</li>
            )}
            <li>{live.detail}</li>
          </ul>
        </div>
      )}
    </div>
  );
}
