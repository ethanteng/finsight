'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

type DeliveryStatus = 'clean' | 'recovered' | 'failed';

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
  evidence: { verified: number; salvaged: number; replaced: number; verifiedRate: number | null };
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
      <div className="mt-1 text-xs leading-5 text-gray-400">{detail}</div>
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
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Failed to load answer quality');
    } finally {
      setLoading(false);
    }
  }, [apiUrl]);

  useEffect(() => { void load(); }, [load, refreshToken]);

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
              detail={`${report.evidence.verified} passed · ${report.evidence.salvaged} trimmed · ${report.evidence.replaced} replaced`}
            />
            <CountCard
              title="Planner sufficient"
              value={percent(report.planning.plannerAcceptedRate)}
              detail={`${report.planning.primaryToolExpanded} expanded before answering · ${report.planning.lateExpanded} expanded after a miss · ${report.planning.primaryToolFailed} audit failures`}
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
            <div className="mt-3 text-sm text-gray-300">
              {scenarios.completedCalculations ?? scenarios.completed} completed calculation(s) · {scenarios.unavailableCalculations ?? scenarios.unavailable} unavailable calculation(s)
            </div>
            {Object.keys(scenarios.byCalculator ?? {}).length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {Object.entries(scenarios.byCalculator ?? {}).map(([calculatorId, counts]) => (
                  <div
                    key={calculatorId}
                    className="rounded-full border border-gray-600 bg-gray-600 px-3 py-1.5 text-xs font-medium text-gray-200"
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
            <div className="mt-3 text-xs text-gray-500">
              {search.plannedQueries} planned queries · {search.cacheHits} cache hits · {search.resultCount} results · {search.unavailable} requests without evidence
            </div>
          </div>

          <h3 className="mt-6 font-medium text-white">Recent answers</h3>
          <div className="mt-3 max-h-[32rem] space-y-2 overflow-y-auto">
            {report.recent.length === 0 && <div className="text-sm text-gray-500">No answers with evidence yet.</div>}
            {report.recent.map((answer) => {
              const scenarioSummary = scenarioRunSummary(answer);
              return (
                <div key={answer.id} className="rounded-lg border border-gray-700 bg-gray-900 p-3">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex min-w-0 items-start gap-3">
                      <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${STATUS[answer.deliveryStatus].dot}`} />
                      <div>
                        <div className="text-sm text-gray-200">{answer.question}</div>
                        <div className="mt-1 text-xs leading-5 text-gray-500">{answer.statusReason}</div>
                        <div className="mt-1 text-xs text-gray-500">
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
                    <div className={`shrink-0 text-xs font-medium ${STATUS[answer.deliveryStatus].text}`}>
                      {STATUS[answer.deliveryStatus].label}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
