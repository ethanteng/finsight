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
  const [showPackDetail, setShowPackDetail] = useState(false);
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
            <div className="mt-3 text-xs text-gray-400">
              {scenarios.completedCalculations ?? scenarios.completed} completed calculation(s) · {scenarios.unavailableCalculations ?? scenarios.unavailable} unavailable calculation(s)
            </div>
            {Object.keys(scenarios.byCalculator ?? {}).length > 0 && (
              <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {Object.entries(scenarios.byCalculator ?? {}).map(([calculatorId, counts]) => (
                  <div key={calculatorId} className="rounded border border-gray-700 bg-gray-950/40 px-3 py-2 text-xs text-gray-400">
                    <span className="font-medium text-gray-200">{calculatorLabel(calculatorId)}</span>
                    {' · '}{counts.completed} completed · {counts.unavailable} unavailable
                  </div>
                ))}
              </div>
            )}
            {scenarios.notRun > 0 && (
              <div className="mt-3 text-xs text-red-300">{scenarios.notRun} requested scenario(s) did not reach the calculator.</div>
            )}
          </div>

          <div className="mt-6 rounded-lg border border-gray-700 bg-gray-900 p-4">
            <h3 className="font-medium text-white">How context planning is doing</h3>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div><div className="text-2xl font-semibold text-white">{report.planning.semanticPlans}</div><div className="text-xs text-gray-500">semantic plans</div></div>
              <div><div className="text-2xl font-semibold text-green-300">{report.planning.plannerAccepted}</div><div className="text-xs text-gray-500">accepted without additions</div></div>
              <div><div className="text-2xl font-semibold text-blue-300">{report.planning.primaryToolExpanded}</div><div className="text-xs text-gray-500">widened by primary tool</div></div>
              <div><div className="text-2xl font-semibold text-yellow-300">{report.planning.lateExpanded}</div><div className="text-xs text-gray-500">late evidence recoveries</div></div>
            </div>
            <div className="mt-3 text-xs text-gray-500">
              {report.planning.fallbackPlans} planner fallback(s) · {report.planning.primaryToolFailed} primary-tool audit failure(s) · average preflight {report.planning.averagePlannerMs === null ? '—' : `${Math.round(report.planning.averagePlannerMs)} ms`}
            </div>

            <button
              type="button"
              onClick={() => setShowPackDetail((shown) => !shown)}
              className="mt-4 text-sm text-blue-400 hover:text-blue-300"
            >
              {showPackDetail ? 'Hide' : 'Show'} per-pack detail
            </button>
            {showPackDetail && (
              <div className="mt-3 overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead><tr className="border-b border-gray-700 text-left text-gray-500"><th className="py-2 pr-5">Pack</th><th className="py-2 pr-5">Planner</th><th className="py-2 pr-5">Primary tool added</th><th className="py-2">Final answers</th></tr></thead>
                  <tbody>
                    {Object.entries(report.planning.byPack).map(([pack, counts]) => (
                      <tr key={pack} className="border-b border-gray-800 text-gray-300">
                        <td className="py-2 pr-5">{PACK_LABELS[pack] ?? pack}</td>
                        <td className="py-2 pr-5">{counts.selectedInitially}</td>
                        <td className="py-2 pr-5">{counts.addedByPrimaryTool}</td>
                        <td className="py-2">{counts.presentFinally}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
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
                        <div className="mt-1 text-[11px] text-gray-600">
                          {answer.plannerSource === 'context_planner' ? 'semantic planner' : answer.plannerSource.replace('_', ' ')}
                          {answer.toolAddedPacks.length > 0 && ` · primary tool added ${answer.toolAddedPacks.map((pack) => PACK_LABELS[pack] ?? pack).join(', ')}`}
                          {answer.primaryToolOutcome === 'failed' && ' · primary tool audit failed'}
                          {answer.lateExpansion && ' · late context recovery'}
                          {scenarioSummary && ` · ${scenarioSummary}`}
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
