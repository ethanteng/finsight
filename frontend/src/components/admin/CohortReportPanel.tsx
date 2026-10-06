'use client';

import { useEffect, useId, useRef, useState, type CSSProperties } from 'react';

type Grain = 'day' | 'week' | 'month';
type Segment = 'signup' | 'trial' | 'paid';
type Kind = 'engagement' | 'activation';
type LinkSource = 'plaid' | 'snaptrade' | 'public';

interface CohortCell {
  rate: number | null;
  count: number;
  eligible: number;
}

interface MemberSummary {
  userId: string;
  email: string;
  startedAt: string;
  signedUpAt: string;
  trialStartedAt: string | null;
  firstChargeAt: string | null;
  subscriptionStatus: string;
  tier: string;
  lastLoginAt: string | null;
}

interface EngagementMember extends MemberSummary {
  totalQuestions: number;
  periods: Array<{ questions: number; required: number; engaged: boolean } | null>;
}

interface ActivationMember extends MemberSummary {
  firstLinkedAt: string | null;
  linkSources: LinkSource[];
  activatedInPeriod: number | null;
  daysToFirstLink: number | null;
}

interface CohortRow<Member> {
  key: string;
  label: string;
  size: number;
  cells: CohortCell[];
  members: Member[];
  activatedToDate?: number;
  medianDaysToFirstLink?: number | null;
}

interface CohortReport {
  kind: Kind;
  segment: Segment;
  cohortGrain: Grain;
  periodGrain: Grain;
  periodCount: number;
  generatedAt: string;
  overall: CohortCell[];
  excluded: { operatorAccounts: number; payingWithoutRecordedCharge?: number };
  notes: string[];
  rule?: { questions: number; per: Grain; requiredPerPeriod: { min: number; max: number } };
  cohorts: Array<CohortRow<EngagementMember | ActivationMember>>;
}

const GRAIN_LABEL: Record<Grain, { one: string; plural: string; title: string }> = {
  day: { one: 'day', plural: 'days', title: 'Day' },
  week: { one: 'week', plural: 'weeks', title: 'Week' },
  month: { one: 'month', plural: 'months', title: 'Month' },
};

const STATUS_LABEL: Record<string, string> = {
  inactive: 'No subscription',
  trialing: 'Trialing',
  active: 'Paying',
  past_due: 'Past due',
  canceled: 'Canceled',
  incomplete: 'Incomplete',
  incomplete_expired: 'Expired checkout',
  unpaid: 'Unpaid',
  paused: 'Paused',
};

const SOURCE_LABEL: Record<LinkSource, string> = { plaid: 'Plaid', snaptrade: 'SnapTrade', public: 'Public' };

const DATE = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' });

function formatDate(iso: string | null): string {
  return iso ? DATE.format(new Date(iso)) : '—';
}

function percent(rate: number | null): string {
  return rate === null ? '—' : `${Math.round(rate * 100)}%`;
}

function clampWhole(value: string, max: number): number | null {
  if (!/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return parsed >= 1 && parsed <= max ? parsed : null;
}

/**
 * One green, light to dark, with the text color that reads on each step: every
 * pair clears 4.5:1, and the lightest step still stands out from the page, so
 * a 0% cell is visibly a cell. 0% has its own step; the rest are 20-point bands.
 */
const HEAT_STEPS: Array<{ background: string; text: string }> = [
  { background: '#94bf9d', text: '#102319' },
  { background: '#76aa85', text: '#102319' },
  { background: '#5c946d', text: '#102319' },
  { background: '#3f7a55', text: '#ffffff' },
  { background: '#2c6043', text: '#ffffff' },
  { background: '#1b4530', text: '#ffffff' },
];

/**
 * Inline, like the heatmap: the signed-in theme re-inks `.text-white` dark
 * (globals.css) and only restores it on its near-black background, so a
 * `text-white` class on green renders dark on dark. White on this green is 5.8:1.
 */
const ENGAGED_CELL_STYLE: CSSProperties = { backgroundColor: '#397052', color: '#ffffff' };

function cellStyle(cell: CohortCell): CSSProperties {
  if (cell.rate === null) return { backgroundColor: 'transparent' };
  const step = cell.rate === 0 ? HEAT_STEPS[0] : HEAT_STEPS[Math.min(5, 1 + Math.floor(cell.rate * 5))];
  return { backgroundColor: step.background, color: step.text };
}

function cellTitle(cell: CohortCell, kind: Kind, size: number): string {
  if (cell.eligible === 0) return 'No one in this cohort has finished this period yet';
  const verb = kind === 'engagement' ? 'engaged' : 'linked an account by then';
  const pending = size - cell.eligible;
  return `${cell.count} of ${cell.eligible} ${verb}${pending > 0 ? ` (${pending} still in this period)` : ''}`;
}

function NumberControl({ label, value, max, onCommit }: {
  label: string;
  value: number;
  max: number;
  onCommit: (value: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  const id = useId();
  useEffect(() => setDraft(String(value)), [value]);
  return (
    <div className="flex flex-col gap-1 text-xs font-medium text-[#5e6b63]">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type="number"
        min={1}
        max={max}
        value={draft}
        onChange={(event) => {
          setDraft(event.target.value);
          const parsed = clampWhole(event.target.value, max);
          if (parsed !== null) onCommit(parsed);
        }}
        onBlur={() => setDraft(String(value))}
        className="h-10 w-24 rounded border border-[#102319]/15 bg-white px-3 text-sm text-[#102319]"
      />
    </div>
  );
}

function GrainSelect({ label, value, onChange, plural = false }: {
  label: string;
  value: Grain;
  onChange: (value: Grain) => void;
  plural?: boolean;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1 text-xs font-medium text-[#5e6b63]">
      <label htmlFor={id}>{label}</label>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value as Grain)}
        className="h-10 rounded border border-[#102319]/15 bg-white px-3 text-sm text-[#102319]"
      >
        {(['day', 'week', 'month'] as Grain[]).map((grain) => (
          <option key={grain} value={grain}>
            {plural ? GRAIN_LABEL[grain].title + 's' : GRAIN_LABEL[grain].title}
          </option>
        ))}
      </select>
    </div>
  );
}

const SEGMENT_LABEL: Record<Segment, string> = { signup: 'Signups', trial: 'Trials', paid: 'Paid' };

/** Each segment's start, as a member date column, in the order an account reaches them. */
const MILESTONES: Array<{ label: string; field: 'signedUpAt' | 'trialStartedAt' | 'firstChargeAt' }> = [
  { label: 'Signed up', field: 'signedUpAt' },
  { label: 'Trial started', field: 'trialStartedAt' },
  { label: 'First charge', field: 'firstChargeAt' },
];

function EngagementMembers({ members, periodGrain }: { members: EngagementMember[]; periodGrain: Grain }) {
  const columns = members[0]?.periods.length ?? 0;
  return (
    <table className="min-w-full text-left text-sm">
      <thead className="whitespace-nowrap text-xs uppercase tracking-wide text-[#5e6b63]">
        <tr>
          <th className="px-3 py-2">User</th>
          {MILESTONES.map((column) => (
            <th key={column.field} className="px-3 py-2">{column.label}</th>
          ))}
          <th className="px-3 py-2">Plan now</th>
          <th className="px-3 py-2 text-right">Questions</th>
          {Array.from({ length: columns }, (_, index) => (
            <th key={index} className="px-2 py-2 text-center">{GRAIN_LABEL[periodGrain].title[0]}{index + 1}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {members.map((member) => (
          <tr key={member.userId} className="border-t border-[#102319]/10">
            <td className="px-3 py-2 font-medium text-[#102319]">{member.email}</td>
            {MILESTONES.map((column) => (
              <td key={column.field} className="whitespace-nowrap px-3 py-2 text-[#5e6b63]">{formatDate(member[column.field])}</td>
            ))}
            <td className="whitespace-nowrap px-3 py-2 text-[#5e6b63]">{STATUS_LABEL[member.subscriptionStatus] ?? member.subscriptionStatus}</td>
            <td className="px-3 py-2 text-right tabular-nums text-[#102319]">{member.totalQuestions}</td>
            {member.periods.map((period, index) => (
              <td
                key={index}
                title={period ? `${period.questions} asked, ${period.required} needed` : 'Still in this period'}
                className={`px-2 py-2 text-center tabular-nums ${
                  period === null ? 'text-[#a3aca6]' : period.engaged ? 'font-semibold' : 'text-[#5e6b63]'
                }`}
                style={period?.engaged ? ENGAGED_CELL_STYLE : undefined}
              >
                {period === null ? '·' : period.questions}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ActivationMembers({ members, periodGrain }: { members: ActivationMember[]; periodGrain: Grain }) {
  return (
    <table className="min-w-full text-left text-sm">
      <thead className="whitespace-nowrap text-xs uppercase tracking-wide text-[#5e6b63]">
        <tr>
          <th className="px-3 py-2">User</th>
          {MILESTONES.map((column) => (
            <th key={column.field} className="px-3 py-2">{column.label}</th>
          ))}
          <th className="px-3 py-2">Plan now</th>
          <th className="px-3 py-2">First linked</th>
          <th className="px-3 py-2">Providers linked</th>
          <th className="px-3 py-2 text-right">Days to link</th>
          <th className="px-3 py-2">Linked in</th>
        </tr>
      </thead>
      <tbody>
        {members.map((member) => (
          <tr key={member.userId} className="border-t border-[#102319]/10">
            <td className="px-3 py-2 font-medium text-[#102319]">{member.email}</td>
            {MILESTONES.map((column) => (
              <td key={column.field} className="whitespace-nowrap px-3 py-2 text-[#5e6b63]">{formatDate(member[column.field])}</td>
            ))}
            <td className="whitespace-nowrap px-3 py-2 text-[#5e6b63]">{STATUS_LABEL[member.subscriptionStatus] ?? member.subscriptionStatus}</td>
            <td className="whitespace-nowrap px-3 py-2 text-[#5e6b63]">{member.firstLinkedAt ? formatDate(member.firstLinkedAt) : 'Not linked'}</td>
            <td className="px-3 py-2 text-[#5e6b63]">{member.linkSources.map((source) => SOURCE_LABEL[source]).join(', ') || '—'}</td>
            <td className="px-3 py-2 text-right tabular-nums text-[#102319]">{member.daysToFirstLink ?? '—'}</td>
            <td className="px-3 py-2 text-[#5e6b63]">
              {member.activatedInPeriod === null
                ? '—'
                : member.firstLinkedAt && new Date(member.firstLinkedAt) < new Date(member.startedAt)
                  ? 'Before start'
                  : `${GRAIN_LABEL[periodGrain].title} ${member.activatedInPeriod + 1}`}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function CohortReportPanel({
  kind,
  apiUrl,
  getAuthHeaders,
}: {
  kind: Kind;
  apiUrl: string | undefined;
  getAuthHeaders: () => Record<string, string>;
}) {
  const [segment, setSegment] = useState<Segment>('signup');
  const [cohortGrain, setCohortGrain] = useState<Grain>('week');
  const [periodGrain, setPeriodGrain] = useState<Grain>('week');
  const [cohortCount, setCohortCount] = useState(12);
  const [periodCount, setPeriodCount] = useState(12);
  const [questions, setQuestions] = useState(1);
  const [per, setPer] = useState<Grain>('week');
  /** "Per" follows the columns until it is chosen explicitly. */
  const [perChosen, setPerChosen] = useState(false);
  const [report, setReport] = useState<CohortReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const perId = useId();
  const authHeadersRef = useRef(getAuthHeaders);
  authHeadersRef.current = getAuthHeaders;

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({
      segment,
      cohort: cohortGrain,
      period: periodGrain,
      cohorts: String(cohortCount),
      periods: String(periodCount),
    });
    if (kind === 'engagement') {
      params.set('questions', String(questions));
      params.set('per', per);
    }
    // Drop the open drill-down when the query changes so a prior cohort's users
    // are not shown against a report that has not arrived yet.
    setSelectedKey(null);
    setLoading(true);
    setError(null);
    fetch(`${apiUrl}/admin/cohorts/${kind}?${params.toString()}`, {
      headers: authHeadersRef.current(),
      signal: controller.signal,
    })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        // AbortController rejects in-flight fetch, but a response that already
        // arrived can still land after a newer request started. Ignore those.
        if (controller.signal.aborted) return;
        if (!response.ok) throw new Error(body?.error || `Failed to load the ${kind} report`);
        if (!Array.isArray(body?.cohorts)) throw new Error(`The ${kind} report came back in an unexpected shape`);
        setReport(body as CohortReport);
      })
      .catch((caught: unknown) => {
        if (controller.signal.aborted) return;
        setError(caught instanceof Error ? caught.message : `Failed to load the ${kind} report`);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [apiUrl, kind, segment, cohortGrain, periodGrain, cohortCount, periodCount, questions, per, reloadToken]);

  const selected = report?.cohorts.find((row) => row.key === selectedKey) ?? null;
  const periodTitle = GRAIN_LABEL[report?.periodGrain ?? periodGrain].title;
  const required = report?.rule?.requiredPerPeriod;
  const isEngagement = kind === 'engagement';

  return (
    <div className="space-y-6">
      <div className="rounded-lg bg-white/70 p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-[#102319]">
              {isEngagement ? 'Cohort engagement' : 'Cohort activation'}
            </h2>
            <p className="mt-1 max-w-2xl text-sm text-[#5e6b63]">
              {isEngagement
                ? 'Share of each cohort that asked enough questions in each period after they started.'
                : 'Share of each cohort that had linked at least one account by the end of each period after they started.'}
              {' '}Cohorts use UTC dates. Click a cohort to see its users.
            </p>
          </div>
          <button
            onClick={() => setReloadToken((value) => value + 1)}
            disabled={loading}
            className="min-h-10 rounded bg-[#102319] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {loading ? 'Loading…' : 'Refresh'}
          </button>
        </div>

        <div className="mt-5 flex flex-wrap items-end gap-4">
          <div className="flex flex-col gap-1 text-xs font-medium text-[#5e6b63]">
            Accounts
            <div className="flex h-10 rounded border border-[#102319]/15 bg-white p-0.5" role="group" aria-label="Accounts">
              {(['signup', 'trial', 'paid'] as Segment[]).map((value) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={segment === value}
                  onClick={() => setSegment(value)}
                  className={`rounded px-3 text-sm font-medium ${
                    segment === value ? 'bg-[#102319] text-white' : 'text-[#5e6b63] hover:text-[#102319]'
                  }`}
                >
                  {SEGMENT_LABEL[value]}
                </button>
              ))}
            </div>
          </div>
          <GrainSelect label="Cohort by" value={cohortGrain} onChange={setCohortGrain} />
          <NumberControl label="Cohorts shown" value={cohortCount} max={90} onCommit={setCohortCount} />
          <GrainSelect
            label="Columns"
            value={periodGrain}
            onChange={(value) => {
              setPeriodGrain(value);
              if (!perChosen) setPer(value);
            }}
            plural
          />
          <NumberControl label="Columns shown" value={periodCount} max={90} onCommit={setPeriodCount} />
          {isEngagement && (
            <div className="flex flex-wrap items-end gap-2">
              <NumberControl label="Engaged at" value={questions} max={100} onCommit={setQuestions} />
              <div className="flex flex-col gap-1 text-xs font-medium text-[#5e6b63]">
                <label htmlFor={perId}>questions per</label>
                <select
                  id={perId}
                  value={per}
                  onChange={(event) => {
                    setPer(event.target.value as Grain);
                    setPerChosen(true);
                  }}
                  className="h-10 rounded border border-[#102319]/15 bg-white px-3 text-sm text-[#102319]"
                >
                  {(['day', 'week', 'month'] as Grain[]).map((grain) => (
                    <option key={grain} value={grain}>{GRAIN_LABEL[grain].one}</option>
                  ))}
                </select>
              </div>
            </div>
          )}
        </div>
        {isEngagement && required && report && (
          <p className="mt-3 text-xs text-[#5e6b63]">
            Counts as engaged in a {GRAIN_LABEL[report.periodGrain].one} column with{' '}
            {required.min === required.max ? required.min : `${required.min}–${required.max}`}{' '}
            or more questions{required.min === required.max ? '' : ', depending on the month length'}.
          </p>
        )}

        {error && <p className="mt-4 rounded bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        {loading && !report && <p className="mt-4 text-sm text-[#5e6b63]">Loading cohorts…</p>}
      </div>

      {report && (
        <div className="rounded-lg bg-white/70 p-6">
          <div className="overflow-x-auto">
            <table className="min-w-full border-separate border-spacing-0.5 text-sm">
              <thead className="whitespace-nowrap text-xs uppercase tracking-wide text-[#5e6b63]">
                <tr>
                  <th className="sticky left-0 bg-[#f4f6f1] px-3 py-2 text-left">Cohort</th>
                  <th className="px-3 py-2 text-right">Users</th>
                  {!isEngagement && <th className="px-3 py-2 text-right">Activated to-date</th>}
                  {!isEngagement && <th className="px-3 py-2 text-right">Median days</th>}
                  {Array.from({ length: report.periodCount }, (_, index) => (
                    <th key={index} className="min-w-14 px-2 py-2 text-center">{periodTitle} {index + 1}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {report.cohorts.map((row) => (
                  <tr key={row.key} className={selectedKey === row.key ? 'outline outline-2 outline-[#397052]' : undefined}>
                    <th className="sticky left-0 bg-[#f4f6f1] px-1 py-1 text-left font-medium">
                      <button
                        type="button"
                        onClick={() => setSelectedKey(selectedKey === row.key ? null : row.key)}
                        aria-expanded={selectedKey === row.key}
                        className="w-full whitespace-nowrap rounded px-2 py-1 text-left text-[#102319] underline-offset-2 hover:underline"
                      >
                        {row.label}
                      </button>
                    </th>
                    <td className="px-3 py-1 text-right tabular-nums text-[#102319]">{row.size}</td>
                    {!isEngagement && (
                      <td className="whitespace-nowrap px-3 py-1 text-right tabular-nums text-[#102319]">
                        {row.size > 0 ? `${row.activatedToDate} (${percent((row.activatedToDate ?? 0) / row.size)})` : '—'}
                      </td>
                    )}
                    {!isEngagement && (
                      <td className="px-3 py-1 text-right tabular-nums text-[#102319]">{row.medianDaysToFirstLink ?? '—'}</td>
                    )}
                    {row.cells.map((cell, index) => (
                      <td
                        key={index}
                        title={cellTitle(cell, kind, row.size)}
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
                  <td className="px-3 py-2 text-right font-semibold tabular-nums text-[#102319]">
                    {report.cohorts.reduce((sum, row) => sum + row.size, 0)}
                  </td>
                  {!isEngagement && <td />}
                  {!isEngagement && <td />}
                  {report.overall.map((cell, index) => (
                    <td
                      key={index}
                      title={cellTitle(cell, kind, cell.eligible)}
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

          {selected && (
            <div className="mt-6 rounded-lg border border-[#102319]/10 bg-white p-4" aria-label={`${selected.label} users`}>
              <div className="mb-3 flex items-center justify-between gap-3">
                <h3 className="text-base font-semibold text-[#102319]">
                  {selected.label}: {selected.size} {selected.size === 1 ? 'user' : 'users'}
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
                <p className="text-sm text-[#5e6b63]">No one started in this cohort.</p>
              ) : (
                <div className="overflow-x-auto">
                  {isEngagement ? (
                    <EngagementMembers members={selected.members as EngagementMember[]} periodGrain={report.periodGrain} />
                  ) : (
                    <ActivationMembers members={selected.members as ActivationMember[]} periodGrain={report.periodGrain} />
                  )}
                </div>
              )}
              <p className="mt-3 text-xs text-[#5e6b63]">
                Dates are UTC. {isEngagement
                  ? 'Each column shows the questions asked in that period; shaded means engaged, a dot means still in that period.'
                  : 'Each account is clocked from its signup, trial start or first charge, depending on the view.'}
              </p>
            </div>
          )}

          <ul className="mt-6 space-y-1 text-xs text-[#5e6b63]">
            {report.notes.map((note) => <li key={note}>{note}</li>)}
            {report.excluded.operatorAccounts > 0 && (
              <li>{report.excluded.operatorAccounts} operator {report.excluded.operatorAccounts === 1 ? 'account is' : 'accounts are'} left out of this window.</li>
            )}
            {(report.excluded.payingWithoutRecordedCharge ?? 0) > 0 && (
              <li>
                {report.excluded.payingWithoutRecordedCharge} paying {report.excluded.payingWithoutRecordedCharge === 1 ? 'account has' : 'accounts have'} no
                logged charge to start {report.excluded.payingWithoutRecordedCharge === 1 ? 'its' : 'their'} clock, so {report.excluded.payingWithoutRecordedCharge === 1 ? 'it is' : 'they are'} not in any paid cohort.
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
