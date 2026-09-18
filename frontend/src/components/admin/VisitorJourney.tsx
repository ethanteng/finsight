'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { ArrowDown, ChevronDown } from 'lucide-react';

type Step = {
  id: string; label: string; sessions: number;
  continuedRate: number | null; droppedSessions: number | null; dropoffRate: number | null;
};
export type JourneyData = {
  state: 'available' | 'unavailable'; ratesAvailable: boolean;
  period: { start: string; end: string }; note: string;
  rows: Array<{ id: string; label: string; device: string; steps: Step[] }>;
};

const count = (value: number) => value.toLocaleString('en-US');
const percent = (value: number | null) => value === null ? '—' : `${(value * 100).toFixed(1)}%`;

export function ReportDetails({ title, description, children }: {
  title: string; description?: string; children: ReactNode;
}) {
  return <details className="group mt-5 rounded-2xl border border-[#102319]/15 bg-[#fffdf5]">
    <summary className="flex cursor-pointer list-none items-center justify-between gap-4 p-5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#397052]">
      <span><span className="block text-base font-semibold">{title}</span>{description && <span className="mt-1 block text-sm font-normal text-[#66736b]">{description}</span>}</span>
      <ChevronDown size={18} className="shrink-0 transition-transform group-open:rotate-180" />
    </summary>
    <div className="border-t border-[#102319]/10 p-4 sm:p-5">{children}</div>
  </details>;
}

export function VisitorJourney({ data, initialPath = 'retirement', retirementOnly = false }: {
  data?: JourneyData; initialPath?: string; retirementOnly?: boolean;
}) {
  const [path, setPath] = useState(initialPath);
  const [device, setDevice] = useState('all');
  const paths = (data?.rows || []).filter(row => row.device === 'all'
    && (!retirementOnly || row.id === 'retirement' || row.id.startsWith('signup_retirement')));
  const activePath = paths.some(row => row.id === path) ? path : paths[0]?.id;
  const devices = [...new Set(['all', 'mobile', 'desktop', ...(data?.rows.map(row => row.device) || [])])];
  const activeDevice = devices.includes(device) ? device : 'all';
  const journey = data?.rows.find(row => row.id === activePath && row.device === activeDevice);
  const steps = journey?.steps || [];
  const first = steps[0]?.sessions || 0;
  const biggestDrop = steps.slice(1).reduce<Step | null>((largest, step) =>
    step.droppedSessions !== null && step.droppedSessions > (largest?.droppedSessions ?? 0) ? step : largest, null);
  const beforeDrop = biggestDrop ? steps[steps.indexOf(biggestDrop) - 1] : null;
  const isSignup = activePath?.startsWith('signup');
  const dateLabel = data ? `${data.period.start} to ${data.period.end}` : '';

  return <section aria-labelledby="visitor-journey-heading" className="mt-6 rounded-[24px] border border-[#102319]/10 bg-white p-5 sm:p-7">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 id="visitor-journey-heading" className="text-2xl font-semibold tracking-[-.035em]">Where do people stop?</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[#66736b]">Follow the same sessions from one step to the next. Switch paths to see the signup form or email returns.</p>
      </div>
      {data?.state === 'available' && <p className="text-xs text-[#66736b]">GA4 daily export<br />{dateLabel}</p>}
    </div>
    {!data || data.state !== 'available' ? <p role="status" className="mt-5 rounded-xl bg-[#f8f1df] p-4 text-sm text-[#76510f]">Session journeys are unavailable. Check the data-source details; missing data is not zero traffic.</p> : <>
      <div className="mt-5 flex flex-wrap items-end gap-4">
        <label className="flex min-w-0 max-w-full flex-col gap-2 text-sm font-semibold">Path
          <select className="max-w-full rounded-xl border border-[#102319]/20 bg-white p-3 font-normal" value={activePath} onChange={event => setPath(event.target.value)}>
            {paths.map(row => <option key={row.id} value={row.id}>{row.label}</option>)}
          </select>
        </label>
        <div role="group" aria-label="Journey device" className="flex flex-wrap gap-2">
          {devices.map(value => <button key={value} type="button" aria-pressed={value === activeDevice} onClick={() => setDevice(value)}
            className={`min-h-11 rounded-full px-4 text-sm font-semibold ${value === activeDevice ? 'bg-[#102319] text-white' : 'bg-[#edf1e9] text-[#486657]'}`}>
            {value === 'all' ? 'All devices' : value.charAt(0).toUpperCase() + value.slice(1)}
          </button>)}
        </div>
      </div>
      {!data.ratesAvailable && <p role="status" className="mt-5 rounded-xl bg-[#f8f1df] p-4 text-sm leading-6 text-[#76510f]">Counts are observed, but drop-off rates are not ready. This date range needs verified tracking throughout. Missing events must not be treated as people leaving.</p>}
      <p className="mt-5 text-sm leading-6 text-[#66736b]">{isSignup
        ? 'Starts at /getstarted. Includes direct visits and returns in a later session. No second login is required.'
        : 'Starts with sessions landing on this calculator. Saving results and the signup button below the result are alternative ways to continue. Later email returns are a separate signup path.'}
        {!isSignup && activePath === 'coast_fire' ? ' Only submitted calculations count; the initial default result does not.' : ''}</p>
      {first === 0 && <p className="mt-4 text-sm text-[#66736b]">No sessions entered this path for the selected device and dates. That alone does not confirm tracking is working.</p>}
      <div className="mt-6 grid items-start gap-6 lg:grid-cols-[1.5fr_1fr]">
        <ol aria-label="Ordered session journey" className="min-w-0">
          {steps.map((step, index) => <li key={step.id}>
            {index > 0 && <div className="flex items-start gap-2 py-3 pl-3 text-xs leading-5 text-[#66736b]">
              <ArrowDown size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
              {step.dropoffRate !== null ? <p><span className="font-semibold text-[#315d45]">{percent(step.continuedRate)} continued</span><span className="mx-2">·</span><span>{count(step.droppedSessions!)} did not reach this step ({percent(step.dropoffRate)})</span></p>
                : <p>{data.ratesAvailable ? 'No sessions in the previous step to compare.' : 'Drop-off not yet measurable'}</p>}
            </div>}
            <div className="relative overflow-hidden rounded-xl border border-[#102319]/10 bg-[#f8f7ef] p-4">
              <div aria-hidden="true" className="absolute inset-y-0 left-0 bg-[#e1eedf]" style={{ width: `${first ? step.sessions / first * 100 : 0}%` }} />
              <div className="relative flex items-center justify-between gap-3">
                <span className="flex items-center gap-3 text-sm font-semibold"><span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-white/80 text-xs">{index + 1}</span>{step.label}</span>
                <span className="shrink-0 text-xl font-semibold tabular-nums">{count(step.sessions)}<span className="ml-2 hidden text-xs font-normal text-[#66736b] sm:inline">sessions</span></span>
              </div>
            </div>
          </li>)}
        </ol>
        <aside className="rounded-2xl bg-[#f8f7ef] p-5">
          <h3 className="text-base font-semibold">What to look at first</h3>
          {biggestDrop && beforeDrop ? <>
            <p className="mt-3 text-sm leading-6">The largest loss of sessions is between <strong>{beforeDrop.label.toLowerCase()}</strong> and <strong>{biggestDrop.label.toLowerCase()}</strong>.</p>
            <p className="mt-3 text-3xl font-semibold">{count(biggestDrop.droppedSessions!)} <span className="text-sm font-normal text-[#66736b]">{biggestDrop.droppedSessions === 1 ? 'session' : 'sessions'} · {percent(biggestDrop.dropoffRate)}</span></p>
            <p className="mt-3 text-xs leading-5 text-[#66736b]">This identifies where to investigate, not why people left. Small samples can move sharply.</p>
          </> : <p className="mt-3 text-sm leading-6 text-[#66736b]">{!data.ratesAvailable ? 'Wait for verified tracking before judging the largest drop-off.' : first ? 'No step-to-step loss was observed in this path.' : 'There is not enough activity to identify a drop-off.'}</p>}
          <p className="mt-5 border-t border-[#102319]/10 pt-4 text-xs leading-5 text-[#66736b]">“Continued to the app” is the signup handoff, not a confirmed app load. Verification can use an email link, a code, or be skipped.</p>
        </aside>
      </div>
      <div className="mt-7 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <caption className="mb-3 text-left font-semibold">Mobile vs desktop · this path</caption>
          <thead><tr>{['Device', 'Entered path', 'Continued to app', 'Completion'].map(label => <th key={label} scope="col" className="p-2 text-xs font-medium text-[#66736b]">{label}</th>)}</tr></thead>
          <tbody>{['mobile', 'desktop'].map(value => {
            const row = data.rows.find(row => row.id === activePath && row.device === value);
            const entered = row?.steps[0]?.sessions ?? 0;
            const completed = row?.steps.at(-1)?.sessions ?? 0;
            return <tr key={value} className="border-t border-[#102319]/10"><th scope="row" className="p-2 font-medium">{value === 'mobile' ? 'Mobile' : 'Desktop'}</th><td className="p-2">{count(entered)}</td><td className="p-2">{count(completed)}</td><td className="p-2">{percent(data.ratesAvailable && entered ? completed / entered : null)}</td></tr>;
          })}</tbody>
        </table>
      </div>
      <details className="mt-5 text-xs leading-5 text-[#66736b]"><summary className="cursor-pointer font-semibold">How these numbers relate</summary><p className="mt-2">{data.note} Calculator paths count account creation only after the signup form was started and submitted in order. These counts exclude email-return routes and CTA clicks before a result; choose a signup path to include those visits. Bars show the share of sessions that entered this path, not a separate conversion rate. First-party run and email totals below use different records and cutoffs, so they are not steps in this funnel.</p></details>
    </>}
  </section>;
}

/** Calculator health remains usable even when the slower GA4 source is down. */
export function RetirementVisitorJourney({ days, refreshKey }: { days: 7 | 28 | 90; refreshKey: number }) {
  const [state, setState] = useState<{ loading: boolean; data?: JourneyData }>({ loading: true });
  const apiUrl = process.env.NEXT_PUBLIC_API_URL;
  useEffect(() => {
    const controller = new AbortController();
    setState(current => ({ ...current, loading: true }));
    const token = localStorage.getItem('auth_token');
    void fetch(`${apiUrl}/admin/marketing?days=${days}&compare=false`, {
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      signal: controller.signal,
    }).then(async response => {
      if (!response.ok) throw new Error('Journey unavailable');
      const report = await response.json() as { visitorJourneys?: JourneyData };
      if (!controller.signal.aborted) setState({ loading: false, data: report.visitorJourneys });
    }).catch(() => { if (!controller.signal.aborted) setState({ loading: false }); });
    return () => controller.abort();
  }, [apiUrl, days, refreshKey]);
  return <>
    {state.loading && <p role="status" className="mt-6 rounded-2xl bg-white p-5 text-sm text-[#66736b]">Loading session journey… Calculator health is available separately below.{state.data ? ' The previous dates remain visible until the new report arrives.' : ''}</p>}
    <div hidden={state.loading && !state.data} aria-busy={state.loading} className={state.loading ? 'pointer-events-none opacity-55' : ''}>
      <VisitorJourney data={state.data} retirementOnly />
    </div>
  </>;
}
