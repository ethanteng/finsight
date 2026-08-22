'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

type DeliveryStatus = 'clean' | 'recovered' | 'failed';

interface RemovedSentence {
  field: 'summary' | 'insight' | 'suggested_action';
  index?: number;
  text: string;
  reason: 'unsupported_value' | 'dependent_on_removed';
  unsupportedValues?: string[];
}

interface RemovedKeyNumber {
  key: string;
  value: number | null;
  unit?: string;
  provenance?: string;
  issues: string[];
}

interface SearchResultEvidence {
  title: string;
  url: string;
  source: string;
  snippet: string;
  age?: string;
  publishedAt?: string;
}

interface SearchQueryEvidence {
  query: string;
  purpose: string;
  freshness: string | null;
  source: 'cache' | 'provider';
  status: 'succeeded' | 'failed';
  resultCount: number;
  error?: string;
  results: SearchResultEvidence[];
}

interface AnswerDetails {
  groundingIssues: string[];
  secondaryIssues: Array<{ phase: 'initial' | 'retry'; issues: string[] }>;
  removedSentences: RemovedSentence[];
  removedKeyNumbers: RemovedKeyNumber[];
  replacedSummary?: string;
  plannedSearchQueries: Array<{ query: string; purpose: string; freshness: string | null }>;
  searchQueryOutcomes: SearchQueryEvidence[];
}

interface Observation {
  id: string;
  createdAt: string;
  question: string;
  rating: number | null;
  deliveryStatus: DeliveryStatus;
  statusReason: string;
  outcome: 'passed' | 'salvaged' | 'replaced';
  plannerSource: 'context_planner' | 'fallback_all' | 'legacy';
  selectedPacks: string[];
  finalPacks: string[];
  toolAddedPacks: string[];
  primaryToolOutcome: 'accepted' | 'expanded' | 'failed' | 'not_run';
  lateExpansion: boolean;
  scenarioRequested: boolean;
  scenarioStatus: 'completed' | 'unavailable' | 'not_run';
  scenarioStatuses?: Record<string, 'completed' | 'unavailable'>;
  searchRequested: boolean;
  searchQueryCount: number;
  searchRetrieved: boolean;
  searchProviderCalls: number;
  searchCacheHits: number;
  searchResultCount: number;
  /** Absent on a report from a backend that predates the detail fields. */
  details?: AnswerDetails;
}

interface AnswerQualityReport {
  window: { from: string | null; to: string | null; conversations: number; withEvidence: number };
  delivery: {
    total: number;
    clean: number;
    recovered: number;
    failed: number;
    cleanRate: number | null;
    headline: string;
  };
  evidence: {
    verified: number;
    salvaged: number;
    replaced: number;
    verifiedRate: number | null;
    trimmedSentences?: number;
    trimmedKeyNumbers?: number;
  };
  planning: {
    semanticPlans: number;
    fallbackPlans: number;
    plannerAccepted: number;
    primaryToolExpanded: number;
    primaryToolFailed: number;
    lateExpanded: number;
    plannerAcceptedRate: number | null;
    averagePlannerMs: number | null;
    byPack: Record<string, { selectedInitially: number; addedByPrimaryTool: number; presentFinally: number }>;
  };
  scenarios?: {
    requested: number;
    completed: number;
    unavailable: number;
    notRun: number;
    averageMs: number | null;
    completedCalculations?: number;
    unavailableCalculations?: number;
    byCalculator?: Record<string, { completed: number; unavailable: number }>;
  };
  search?: {
    requested: number;
    retrieved: number;
    unavailable: number;
    retrievalRate: number | null;
    plannedQueries: number;
    providerCalls: number;
    cacheHits: number;
    cacheReuseRate: number | null;
    resultCount: number;
    failedQueries?: number;
  };
  users: { rated: number; positive: number; neutral: number; negative: number; averageRating: number | null };
  recent: Observation[];
}

const STATUS: Record<DeliveryStatus, { label: string; dot: string; border: string; text: string }> = {
  clean: { label: 'Clean', dot: 'bg-green-400', border: 'border-green-800 bg-green-950/20', text: 'text-green-300' },
  recovered: { label: 'Corrected', dot: 'bg-yellow-400', border: 'border-yellow-800 bg-yellow-950/20', text: 'text-yellow-300' },
  failed: { label: 'Failed', dot: 'bg-red-400', border: 'border-red-800 bg-red-950/20', text: 'text-red-300' },
};

const PACK_LABELS: Record<string, string> = {
  account_details: 'Accounts',
  transaction_details: 'Transactions',
  investment_details: 'Investments',
  monthly_cash_flow: 'Monthly cash flow',
  user_profile: 'Profile',
  home_value: 'Home value',
  retirement_analysis: 'Retirement analysis',
  market_context: 'Market context',
  search_context: 'Rates & rules',
};

const CALCULATOR_LABELS: Record<string, string> = {
  retirement: 'Retirement scenario',
  home_affordability: 'Home affordability',
};

function calculatorLabel(id: string): string {
  return CALCULATOR_LABELS[id]
    ?? id.replace(/_/g, ' ').replace(/^./, (letter) => letter.toUpperCase());
}

function scenarioRunSummary(answer: Observation): string {
  const statuses = Object.entries(answer.scenarioStatuses ?? {});
  if (statuses.length > 0) {
    return statuses.map(([calculatorId, status]) =>
      `${calculatorLabel(calculatorId)} ${status === 'completed' ? 'completed' : 'missing inputs'}`
    ).join(' · ');
  }
  if (answer.scenarioStatus === 'completed') return 'Scenario completed';
  if (answer.scenarioStatus === 'unavailable') return 'Scenario missing inputs';
  return answer.scenarioRequested ? 'Scenario not run' : '';
}

const percent = (value: number | null) => value === null ? '—' : `${Math.round(value * 100)}%`;

const FIELD_LABELS: Record<RemovedSentence['field'], string> = {
  summary: 'Summary',
  insight: 'Insight',
  suggested_action: 'Suggested action',
};

const REMOVAL_REASONS: Record<RemovedSentence['reason'], string> = {
  unsupported_value: 'cited a number the fact pack did not contain',
  dependent_on_removed: 'referred back to a sentence that was removed',
};

const FRESHNESS_LABELS: Record<string, string> = {
  pd: 'past day',
  pw: 'past week',
  pm: 'past month',
  py: 'past year',
};

/** True when there is anything worth expanding for this answer. */
function hasDetails(details: AnswerDetails | undefined): details is AnswerDetails {
  if (!details) return false;
  return details.removedSentences.length > 0
    || details.removedKeyNumbers.length > 0
    || Boolean(details.replacedSummary)
    || details.groundingIssues.length > 0
    || details.secondaryIssues.length > 0
    || details.searchQueryOutcomes.length > 0
    || details.plannedSearchQueries.length > 0;
}

function DetailSection({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <div className="mt-3 first:mt-0">
      <div className="text-xs font-semibold uppercase tracking-wide text-gray-400">{title}</div>
      {note && <div className="mt-0.5 text-xs text-gray-500">{note}</div>}
      <div className="mt-2 space-y-2">{children}</div>
    </div>
  );
}

function Chip({ children, tone = 'text-gray-300 border-gray-600' }: { children: React.ReactNode; tone?: string }) {
  return <span className={`rounded-full border px-2 py-0.5 text-[11px] ${tone}`}>{children}</span>;
}

function SearchQueryCard({ outcome }: { outcome: SearchQueryEvidence }) {
  const failed = outcome.status === 'failed';
  return (
    <div className="rounded border border-gray-700 bg-gray-950/40 p-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-gray-200">“{outcome.query}”</span>
        <Chip tone={outcome.source === 'cache' ? 'border-blue-800 text-blue-300' : 'border-gray-600 text-gray-300'}>
          {outcome.source === 'cache' ? 'served from cache' : 'Brave provider call'}
        </Chip>
        <Chip>{outcome.purpose}</Chip>
        {outcome.freshness && <Chip>{FRESHNESS_LABELS[outcome.freshness] ?? outcome.freshness}</Chip>}
        <Chip tone={failed ? 'border-red-800 text-red-300' : 'border-green-800 text-green-300'}>
          {failed ? 'failed' : `${outcome.resultCount} result${outcome.resultCount === 1 ? '' : 's'}`}
        </Chip>
      </div>
      {outcome.error && <div className="mt-1 text-xs text-red-300">{outcome.error}</div>}
      {outcome.results.length > 0 && (
        <ol className="mt-2 space-y-2">
          {outcome.results.map((result, index) => (
            <li key={`${result.url}-${index}`} className="border-l-2 border-gray-700 pl-2">
              <a
                href={result.url}
                target="_blank"
                rel="noreferrer noopener"
                className="text-sm text-blue-300 hover:underline"
              >
                {result.title || result.url}
              </a>
              <div className="text-[11px] text-gray-500">
                {result.source}
                {result.publishedAt ? ` · ${new Date(result.publishedAt).toLocaleDateString()}` : result.age ? ` · ${result.age}` : ''}
              </div>
              {result.snippet && <div className="mt-0.5 text-xs leading-5 text-gray-400">{result.snippet}</div>}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function AnswerDetailPanel({ details }: { details: AnswerDetails }) {
  const retrievedQueries = new Set(details.searchQueryOutcomes.map((outcome) => outcome.query));
  const unattempted = details.plannedSearchQueries.filter((planned) => !retrievedQueries.has(planned.query));
  return (
    <div className="mt-3 rounded border border-gray-700 bg-gray-950/60 p-3">
      {details.removedSentences.length > 0 && (
        <DetailSection
          title={`Removed from the answer (${details.removedSentences.length})`}
          note="These sentences were cut before the answer reached the user."
        >
          {details.removedSentences.map((sentence, index) => (
            <div key={`${sentence.field}-${index}`} className="rounded border border-yellow-900/60 bg-yellow-950/10 p-2">
              <div className="flex flex-wrap items-center gap-2">
                <Chip tone="border-yellow-800 text-yellow-300">
                  {FIELD_LABELS[sentence.field]}
                  {sentence.index === undefined ? '' : ` #${sentence.index + 1}`}
                </Chip>
                <span className="text-[11px] text-gray-500">{REMOVAL_REASONS[sentence.reason]}</span>
                {(sentence.unsupportedValues ?? []).map((value) => (
                  <Chip key={value} tone="border-red-800 text-red-300">{value}</Chip>
                ))}
              </div>
              <div className="mt-1 text-sm leading-6 text-gray-300 line-through decoration-gray-600">{sentence.text}</div>
            </div>
          ))}
        </DetailSection>
      )}

      {details.removedKeyNumbers.length > 0 && (
        <DetailSection
          title={`Dropped key numbers (${details.removedKeyNumbers.length})`}
          note="Figures that did not cite, match, or unit-match a canonical fact."
        >
          {details.removedKeyNumbers.map((number) => (
            <div key={number.key} className="rounded border border-yellow-900/60 bg-yellow-950/10 p-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm text-gray-200">{number.key}</span>
                <Chip tone="border-red-800 text-red-300">
                  {number.value === null ? 'no value' : number.value.toLocaleString()}{number.unit ? ` ${number.unit}` : ''}
                </Chip>
                {number.provenance && <Chip>cited {number.provenance}</Chip>}
              </div>
              {number.issues.map((issue) => (
                <div key={issue} className="mt-1 text-xs text-gray-400">{issue}</div>
              ))}
            </div>
          ))}
        </DetailSection>
      )}

      {details.replacedSummary && (
        <DetailSection
          title="Replaced answer"
          note="Nothing in this answer survived grounding, so the user received the fallback instead of the text below."
        >
          <div className="rounded border border-red-900/60 bg-red-950/10 p-2 text-sm leading-6 text-gray-300 whitespace-pre-wrap">
            {details.replacedSummary}
          </div>
        </DetailSection>
      )}

      {details.groundingIssues.length > 0 && (
        <DetailSection title="Grounding checks that failed">
          <ul className="list-disc space-y-1 pl-5 text-xs leading-5 text-gray-400">
            {details.groundingIssues.map((issue) => <li key={issue}>{issue}</li>)}
          </ul>
        </DetailSection>
      )}

      {details.secondaryIssues.length > 0 && (
        <DetailSection title="Secondary reviewer objections">
          {details.secondaryIssues.map((entry) => (
            <div key={entry.phase}>
              <div className="text-[11px] uppercase tracking-wide text-gray-500">{entry.phase} generation</div>
              <ul className="list-disc space-y-1 pl-5 text-xs leading-5 text-gray-400">
                {entry.issues.map((issue) => <li key={issue}>{issue}</li>)}
              </ul>
            </div>
          ))}
        </DetailSection>
      )}

      {details.searchQueryOutcomes.length > 0 && (
        <DetailSection
          title={`Brave searches (${details.searchQueryOutcomes.length})`}
          note="Each standalone query the plan asked for, and what came back."
        >
          {details.searchQueryOutcomes.map((outcome, index) => (
            <SearchQueryCard key={`${outcome.query}-${index}`} outcome={outcome} />
          ))}
        </DetailSection>
      )}

      {unattempted.length > 0 && (
        <DetailSection
          title={`Planned queries with no recorded retrieval (${unattempted.length})`}
          note="Planned before answering; no per-query record was stored for these."
        >
          {unattempted.map((planned) => (
            <div key={planned.query} className="flex flex-wrap items-center gap-2 text-sm text-gray-300">
              <span>“{planned.query}”</span>
              <Chip>{planned.purpose}</Chip>
              {planned.freshness && <Chip>{FRESHNESS_LABELS[planned.freshness] ?? planned.freshness}</Chip>}
            </div>
          ))}
        </DetailSection>
      )}
    </div>
  );
}

function CountCard({
  title,
  value,
  detail,
  tone = 'text-white',
}: {
  title: string;
  value: string | number;
  detail: string;
  tone?: string;
}) {
  return (
    <div className="rounded-lg border border-gray-700 bg-gray-900 p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-gray-500">{title}</div>
      <div className={`mt-1 text-3xl font-semibold ${tone}`}>{value}</div>
      <div className="mt-1 text-xs leading-5 text-[#3f4d45]">{detail}</div>
    </div>
  );
}

export default function AnswerQualityPanel({
  apiUrl,
  getAuthHeaders,
  refreshToken = 0,
}: {
  apiUrl: string | undefined;
  getAuthHeaders: () => Record<string, string>;
  refreshToken?: number;
}) {
  const [report, setReport] = useState<AnswerQualityReport | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const authHeadersRef = useRef(getAuthHeaders);
  authHeadersRef.current = getAuthHeaders;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${apiUrl}/admin/answer-quality`, { headers: authHeadersRef.current() });
      if (!response.ok) throw new Error('Failed to load answer quality');
      setReport(await response.json());
      setExpanded(new Set());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Failed to load answer quality');
    } finally {
      setLoading(false);
    }
  }, [apiUrl]);

  useEffect(() => { void load(); }, [load, refreshToken]);

  const toggleDetails = useCallback((id: string) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }, []);

  const overall: DeliveryStatus = report?.delivery.failed
    ? 'failed'
    : report?.delivery.recovered
      ? 'recovered'
      : 'clean';
  const scenarios = report?.scenarios ?? {
    requested: 0,
    completed: 0,
    unavailable: 0,
    notRun: 0,
    averageMs: null,
    completedCalculations: 0,
    unavailableCalculations: 0,
    byCalculator: {},
  };
  const search = report?.search ?? {
    requested: 0,
    retrieved: 0,
    unavailable: 0,
    retrievalRate: null,
    plannedQueries: 0,
    providerCalls: 0,
    cacheHits: 0,
    cacheReuseRate: null,
    resultCount: 0,
    failedQueries: 0,
  };

  return (
    <div className="mb-6 rounded-lg bg-gray-800 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-white">Answer quality</h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-gray-400">
            A direct view of delivery, evidence, context planning, and user feedback. “Corrected” means the safeguards fixed an issue before the final answer reached the user.
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="rounded bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:bg-gray-700"
        >
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>

      {error && <div className="mt-4 rounded border border-red-700 bg-red-900/40 p-3 text-red-200">{error}</div>}
      {!report && !error && <div className="mt-4 text-sm text-gray-400">Loading report…</div>}

      {report && (
        <>
          <div className={`mt-5 rounded-lg border p-5 ${STATUS[overall].border}`}>
            <div className="flex flex-wrap items-center gap-3">
              <span className={`h-3 w-3 rounded-full ${STATUS[overall].dot}`} />
              <span className={`text-lg font-semibold ${STATUS[overall].text}`}>
                {overall === 'clean' ? 'Answers are delivering cleanly' : overall === 'recovered' ? 'Safeguards are correcting some answers' : 'Some answers failed'}
              </span>
            </div>
            <p className="mt-2 text-gray-200">{report.delivery.headline}</p>
            <p className="mt-1 text-xs text-gray-500">Based on {report.window.withEvidence} recent answers with evidence.</p>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <CountCard
              title="Delivered cleanly"
              value={percent(report.delivery.cleanRate)}
              detail={`${report.delivery.clean} clean · ${report.delivery.recovered} corrected · ${report.delivery.failed} failed`}
              tone={report.delivery.failed > 0 ? 'text-red-300' : 'text-green-300'}
            />
            <CountCard
              title="Evidence verified"
              value={percent(report.evidence.verifiedRate)}
              detail={`${report.evidence.verified} passed · ${report.evidence.salvaged} trimmed · ${report.evidence.replaced} replaced${
                report.evidence.trimmedSentences
                  ? ` · ${report.evidence.trimmedSentences} sentence(s) and ${report.evidence.trimmedKeyNumbers ?? 0} key number(s) removed`
                  : ''
              }`}
            />
            <CountCard
              title="Planner sufficient"
              value={percent(report.planning.plannerAcceptedRate)}
              detail={`${report.planning.primaryToolExpanded} expanded before answering · ${report.planning.lateExpanded} expanded after a miss · ${report.planning.primaryToolFailed} audit failures${report.planning.fallbackPlans > 0 ? ` · ${report.planning.fallbackPlans} planner fallback(s)` : ''}`}
            />
            <CountCard
              title="User rating"
              value={report.users.averageRating === null ? '—' : `${report.users.averageRating}/5`}
              detail={`${report.users.rated} rated · ${report.users.positive} positive · ${report.users.negative} negative`}
            />
          </div>

          <div className="mt-4 rounded-lg border border-gray-700 bg-gray-900 p-4">
            <h3 className="font-medium text-white">Scenario runner</h3>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div><div className="text-2xl font-semibold text-white">{scenarios.requested}</div><div className="text-xs text-gray-500">scenario requests</div></div>
              <div><div className="text-2xl font-semibold text-green-300">{scenarios.completed}</div><div className="text-xs text-gray-500">answers with a completed scenario</div></div>
              <div><div className="text-2xl font-semibold text-yellow-300">{scenarios.unavailable}</div><div className="text-xs text-gray-500">answers with no runnable scenario</div></div>
              <div><div className="text-2xl font-semibold text-white">{scenarios.averageMs === null ? '—' : `${Math.round(scenarios.averageMs)} ms`}</div><div className="text-xs text-gray-500">average calculation time</div></div>
            </div>
            <div className="mt-3 text-sm font-medium text-[#3f4d45]">
              {scenarios.completedCalculations ?? scenarios.completed} completed calculation(s) · {scenarios.unavailableCalculations ?? scenarios.unavailable} unavailable calculation(s)
            </div>
            {Object.keys(scenarios.byCalculator ?? {}).length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {Object.entries(scenarios.byCalculator ?? {}).map(([calculatorId, counts]) => (
                  <div
                    key={calculatorId}
                    className="rounded-full border border-[#102319]/20 bg-[#e9eee5] px-3 py-1.5 text-xs font-semibold text-[#102319]"
                  >
                    <span>{calculatorLabel(calculatorId)}</span>
                    {' · '}{counts.completed} completed · {counts.unavailable} unavailable
                  </div>
                ))}
              </div>
            )}
            {scenarios.notRun > 0 && (
              <div className="mt-3 text-xs text-red-300">{scenarios.notRun} requested scenario(s) did not reach the calculator.</div>
            )}
          </div>

          <div className="mt-4 rounded-lg border border-gray-700 bg-gray-900 p-4">
            <h3 className="font-medium text-white">Public search evidence</h3>
            <p className="mt-1 text-xs leading-5 text-gray-500">
              Search is counted only when the semantic plan asks for outside, time-sensitive information. Cache hits replace provider calls without changing the evidence delivered to the answer.
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div><div className="text-2xl font-semibold text-white">{search.requested}</div><div className="text-xs text-gray-500">answers requested search</div></div>
              <div><div className="text-2xl font-semibold text-green-300">{percent(search.retrievalRate)}</div><div className="text-xs text-gray-500">search retrieval completed</div></div>
              <div><div className="text-2xl font-semibold text-blue-300">{search.providerCalls}</div><div className="text-xs text-gray-500">Brave provider calls</div></div>
              <div><div className="text-2xl font-semibold text-white">{percent(search.cacheReuseRate)}</div><div className="text-xs text-gray-500">queries served from cache</div></div>
            </div>
            <div className="mt-3 text-xs font-medium text-[#3f4d45]">
              {search.plannedQueries} planned queries · {search.cacheHits} cache hits · {search.resultCount} results · {search.unavailable} requests without evidence
              {search.failedQueries ? ` · ${search.failedQueries} query failure(s)` : ''}
            </div>
          </div>

          <h3 className="mt-6 font-medium text-white">Recent answers</h3>
          <div className="mt-3 max-h-[32rem] space-y-2 overflow-y-auto">
            {report.recent.length === 0 && <div className="text-sm text-gray-500">No answers with evidence yet.</div>}
            {report.recent.map((answer) => {
              const scenarioSummary = scenarioRunSummary(answer);
              const details = answer.details;
              const expandable = hasDetails(details);
              const isOpen = expanded.has(answer.id);
              return (
                <div key={answer.id} className="rounded-lg border border-gray-700 bg-gray-900 p-3">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                    <div className="flex min-w-0 items-start gap-3">
                      <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${STATUS[answer.deliveryStatus].dot}`} />
                      <div>
                        <div className="text-sm text-gray-200">{answer.question}</div>
                        <div className="mt-1 text-xs leading-5 text-[#3f4d45]">{answer.statusReason}</div>
                        <div className="mt-1 text-xs text-[#3f4d45]">
                          {answer.plannerSource === 'context_planner' ? 'semantic planner' : answer.plannerSource.replace('_', ' ')}
                          {answer.toolAddedPacks.length > 0 && ` · primary tool added ${answer.toolAddedPacks.map((pack) => PACK_LABELS[pack] ?? pack).join(', ')}`}
                          {answer.primaryToolOutcome === 'failed' && ' · primary tool audit failed'}
                          {answer.lateExpansion && ' · late context recovery'}
                          {scenarioSummary && ` · ${scenarioSummary}`}
                          {answer.searchRequested && answer.searchRetrieved && ` · search loaded ${answer.searchResultCount} results`}
                          {answer.searchRequested && !answer.searchRetrieved && ' · search evidence unavailable'}
                        </div>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-3 pl-5 sm:pl-0">
                      {expandable && (
                        <button
                          type="button"
                          onClick={() => toggleDetails(answer.id)}
                          aria-expanded={isOpen}
                          className="rounded border border-gray-600 px-2 py-1 text-xs text-gray-300 hover:bg-gray-800"
                        >
                          {isOpen ? 'Hide details' : 'Show details'}
                        </button>
                      )}
                      <div className={`text-xs font-medium ${STATUS[answer.deliveryStatus].text}`}>
                        {STATUS[answer.deliveryStatus].label}
                      </div>
                    </div>
                  </div>
                  {expandable && isOpen && <AnswerDetailPanel details={details} />}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
