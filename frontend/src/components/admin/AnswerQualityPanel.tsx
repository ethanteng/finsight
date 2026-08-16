'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

const ROUTED_CONTEXT_LABELS: Record<string, string> = {
  accountsIncluded: 'Account balances',
  transactionDetailsIncluded: 'Transaction detail',
  investmentDetailsIncluded: 'Investment holdings',
  marketContextRequested: 'Market context',
  searchContextRequested: 'Search context',
};

type Grade = 'green' | 'yellow' | 'red';

interface Aggregate {
  samples: number;
  missRate: number | null;
  ratedSamples: number;
  averageRating: number | null;
}

interface RatingGroup {
  samples: number;
  ratedSamples: number;
  averageRating: number | null;
}

interface Observation {
  id: string;
  createdAt: string;
  question: string;
  rating: number | null;
  outcome: 'passed' | 'salvaged' | 'replaced';
  grounded: boolean;
  escalated: boolean;
  withheld: string[];
  unsupportedValues: number;
  grade: Grade;
  gradeReason: string;
}

interface ScorecardReason {
  id: string;
  label: string;
  severity: Grade;
  answers: number;
  share: number;
  detail: string | null;
  example: { id: string; question: string } | null;
}

interface Scorecard {
  score: number | null;
  status: Grade | 'unknown';
  headline: string;
  answers: number;
  counts: Record<Grade, number>;
  trend: { previousScore: number; delta: number; comparedAnswers: number } | null;
  reasons: ScorecardReason[];
}

interface AnswerQualityReport {
  scorecard: Scorecard;
  window: { from: string | null; to: string | null; conversations: number; withManifest: number; rated: number };
  quality: {
    groundedRate: number | null;
    escalationRate: number | null;
    averageRating: number | null;
    byOutcome: Record<'passed' | 'salvaged' | 'replaced', RatingGroup>;
    byEscalation: Record<'escalated' | 'notEscalated', RatingGroup>;
  };
  routing: Record<string, {
    withheld: Aggregate;
    supplied: Aggregate;
    excessMissWhenWithheld: number | null;
    ratingPenaltyWhenWithheld: number | null;
  }>;
  recent: Observation[];
}

const percent = (value: number | null) => (value === null ? '—' : `${(value * 100).toFixed(1)}%`);
const rating = (value: number | null) => (value === null ? '—' : value.toFixed(2));
const signed = (value: number | null, digits = 1) => {
  if (value === null) return '—';
  const shown = digits === 1 ? (value * 100).toFixed(1) : value.toFixed(2);
  return `${value > 0 ? '+' : ''}${shown}${digits === 1 ? '%' : ''}`;
};

/** Red when withholding this tier looks like it is costing answers. */
function concernClass(value: number | null, threshold: number): string {
  if (value === null) return 'text-gray-500';
  if (value >= threshold) return 'text-red-400 font-semibold';
  if (value > 0) return 'text-yellow-400';
  return 'text-gray-400';
}

const STATUS_STYLES: Record<Grade | 'unknown', { dot: string; text: string; ring: string; word: string }> = {
  green: { dot: 'bg-green-400', text: 'text-green-300', ring: 'border-green-500/60 bg-green-900/20', word: 'Healthy' },
  yellow: { dot: 'bg-yellow-400', text: 'text-yellow-300', ring: 'border-yellow-500/60 bg-yellow-900/20', word: 'Needs attention' },
  red: { dot: 'bg-red-400', text: 'text-red-300', ring: 'border-red-500/60 bg-red-900/20', word: 'Problem' },
  unknown: { dot: 'bg-gray-500', text: 'text-gray-300', ring: 'border-gray-700 bg-gray-900', word: 'No data yet' },
};

const GRADE_LABELS: Record<Grade, string> = { green: 'Good', yellow: 'Shaky', red: 'Bad' };

function Dot({ grade, className = '' }: { grade: Grade | 'unknown'; className?: string }) {
  return <span className={`inline-block rounded-full ${STATUS_STYLES[grade].dot} ${className || 'w-2.5 h-2.5'}`} />;
}

/** The three counts as one bar, so the mix reads at a glance. */
function GradeBar({ counts, total }: { counts: Record<Grade, number>; total: number }) {
  if (total === 0) return null;
  const order: Grade[] = ['green', 'yellow', 'red'];
  return (
    <div className="flex h-2 rounded-full overflow-hidden bg-gray-900">
      {order.map((grade) => (
        counts[grade] > 0 && (
          <div
            key={grade}
            className={STATUS_STYLES[grade].dot}
            style={{ width: `${(counts[grade] / total) * 100}%` }}
            title={`${GRADE_LABELS[grade]}: ${counts[grade]}`}
          />
        )
      ))}
    </div>
  );
}

function TrendNote({ trend }: { trend: Scorecard['trend'] }) {
  if (!trend) return null;
  if (trend.delta === 0) {
    return <span className="text-sm text-gray-400">Flat vs the previous {trend.comparedAnswers} answers</span>;
  }
  const improving = trend.delta > 0;
  return (
    <span className={`text-sm ${improving ? 'text-green-300' : 'text-red-300'}`}>
      {improving ? '▲' : '▼'} {Math.abs(trend.delta)} pts vs the previous {trend.comparedAnswers} answers
    </span>
  );
}

export default function AnswerQualityPanel({
  apiUrl,
  getAuthHeaders,
  refreshToken = 0,
}: {
  /** Matches the admin page, where NEXT_PUBLIC_API_URL may be unset. */
  apiUrl: string | undefined;
  getAuthHeaders: () => Record<string, string>;
  /** Bumped by the tab's refresh button so the panel cannot drift from it. */
  refreshToken?: number;
}) {
  const [report, setReport] = useState<AnswerQualityReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDetail, setShowDetail] = useState(false);
  // The caller re-creates getAuthHeaders every render. Holding it in a ref keeps
  // it out of the effect's dependencies, which would otherwise refetch forever.
  const authHeadersRef = useRef(getAuthHeaders);
  authHeadersRef.current = getAuthHeaders;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${apiUrl}/admin/answer-quality`, { headers: authHeadersRef.current() });
      if (!response.ok) {
        setError(response.status === 401 || response.status === 403
          ? 'Authentication required for admin access'
          : 'Failed to load answer quality report');
        return;
      }
      setReport(await response.json());
    } catch {
      setError('Failed to load answer quality report');
    } finally {
      setLoading(false);
    }
  }, [apiUrl]);

  useEffect(() => { load(); }, [load, refreshToken]);

  const scorecard = report?.scorecard;
  const status = scorecard?.status ?? 'unknown';

  return (
    <div className="bg-gray-800 rounded-lg p-6 mb-6">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-xl font-semibold text-white">Answer quality</h2>
        <button
          onClick={load}
          disabled={loading}
          className={`px-4 py-2 rounded-lg text-sm ${loading ? 'bg-gray-600 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'} text-white`}
        >
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>
      <p className="text-sm text-gray-400 mb-4">
        Every recent answer graded green, yellow, or red on the worse of two things: whether we could back
        it up with the user&apos;s real numbers, and how the user rated it.
      </p>

      {error && <div className="bg-red-900/50 border border-red-700 text-red-200 rounded-lg p-3 mb-4">{error}</div>}
      {!report && !error && <div className="text-gray-400">Loading report…</div>}

      {report && scorecard && (
        <>
          <div className={`rounded-lg border p-5 mb-6 ${STATUS_STYLES[status].ring}`}>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
              <div className="flex items-baseline gap-2">
                <span className="text-5xl font-semibold text-white">
                  {scorecard.score === null ? '—' : scorecard.score}
                </span>
                <span className="text-lg text-gray-400">/ 100</span>
              </div>
              <div className="flex items-center gap-2">
                <Dot grade={status} className="w-4 h-4" />
                <span className={`text-lg font-medium ${STATUS_STYLES[status].text}`}>
                  {STATUS_STYLES[status].word}
                </span>
              </div>
              <TrendNote trend={scorecard.trend} />
            </div>

            <p className="text-gray-200 mt-3">{scorecard.headline}</p>

            {scorecard.answers > 0 && (
              <div className="mt-4">
                <GradeBar counts={scorecard.counts} total={scorecard.answers} />
                <div className="flex flex-wrap gap-x-6 gap-y-1 mt-2 text-sm text-gray-400">
                  {(['green', 'yellow', 'red'] as Grade[]).map((grade) => (
                    <span key={grade} className="flex items-center gap-2">
                      <Dot grade={grade} />
                      {GRADE_LABELS[grade]}: {scorecard.counts[grade]}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          <h3 className="text-lg font-medium text-white mb-2">What&apos;s costing us points</h3>
          <div className="space-y-2 mb-6">
            {scorecard.reasons.length === 0 && (
              <div className="text-sm text-gray-400">
                Nothing — every graded answer came back verified and well rated.
              </div>
            )}
            {scorecard.reasons.map((reason) => (
              <div key={reason.id} className="bg-gray-900 rounded-lg p-3 border border-gray-700">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <Dot grade={reason.severity} className="w-2.5 h-2.5 mt-1.5" />
                    <div>
                      <p className="text-sm text-gray-200">{reason.label}</p>
                      {reason.detail && <p className="text-xs text-gray-500 mt-1">{reason.detail}</p>}
                      {reason.example && (
                        <p className="text-xs text-gray-500 mt-1 italic">e.g. &ldquo;{reason.example.question}&rdquo;</p>
                      )}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-lg font-semibold text-white">{reason.answers}</div>
                    <div className="text-xs text-gray-500">{percent(reason.share)} of answers</div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <h3 className="text-lg font-medium text-white mb-2">Recent answers</h3>
          <div className="space-y-2 max-h-[28rem] overflow-y-auto">
            {report.recent.length === 0 && (
              <div className="text-gray-400 text-sm">No answers with evidence manifests yet.</div>
            )}
            {report.recent.map((observation) => (
              <div key={observation.id} className="bg-gray-900 rounded-lg p-3 border border-gray-700">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3 flex-1">
                    <Dot grade={observation.grade} className="w-2.5 h-2.5 mt-1.5" />
                    <div>
                      <p className="text-sm text-gray-200">{observation.question}</p>
                      <p className="text-xs text-gray-500 mt-1">{observation.gradeReason}</p>
                    </div>
                  </div>
                  <span className="text-xs text-gray-300 w-14 text-right shrink-0">
                    {observation.rating === null ? 'unrated' : `${observation.rating}/5`}
                  </span>
                </div>
                <div className="text-xs text-gray-600 mt-2">
                  {new Date(observation.createdAt).toLocaleString()}
                </div>
              </div>
            ))}
          </div>

          {/* The routing correlations still matter when the score drops — they
              just are not the thing to read first. */}
          <button
            onClick={() => setShowDetail((shown) => !shown)}
            className="mt-6 text-sm text-blue-400 hover:text-blue-300"
          >
            {showDetail ? 'Hide' : 'Show'} technical detail
          </button>

          {showDetail && (
            <div className="mt-4">
              <p className="text-sm text-gray-400 mb-4">
                Whether withholding a context tier costs users good answers. A positive miss excess means answers
                failed to ground more often when the tier was withheld; a positive rating penalty means users rated
                those answers worse. Both are correlations — read the questions before concluding the router is wrong.
              </p>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                {[
                  { label: 'Grounded', value: percent(report.quality.groundedRate), hint: `${report.window.withManifest} answers with evidence` },
                  { label: 'Context escalated', value: percent(report.quality.escalationRate), hint: 'routing withheld something needed' },
                  { label: 'Average rating', value: rating(report.quality.averageRating), hint: `${report.window.rated} rated` },
                  {
                    label: 'Rating: grounded vs replaced',
                    value: `${rating(report.quality.byOutcome.passed.averageRating)} / ${rating(report.quality.byOutcome.replaced.averageRating)}`,
                    hint: 'passed / could-not-verify',
                  },
                ].map((stat) => (
                  <div key={stat.label} className="bg-gray-900 rounded-lg p-4 border border-gray-700">
                    <div className="text-xs uppercase tracking-wide text-gray-400">{stat.label}</div>
                    <div className="text-2xl font-semibold text-white mt-1">{stat.value}</div>
                    <div className="text-xs text-gray-500 mt-1">{stat.hint}</div>
                  </div>
                ))}
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="text-left text-gray-400 border-b border-gray-700">
                      <th className="py-2 pr-4">Context tier</th>
                      <th className="py-2 pr-4">Withheld</th>
                      <th className="py-2 pr-4">Miss rate</th>
                      <th className="py-2 pr-4">Rating</th>
                      <th className="py-2 pr-4">Supplied</th>
                      <th className="py-2 pr-4">Miss rate</th>
                      <th className="py-2 pr-4">Rating</th>
                      <th className="py-2 pr-4">Miss excess</th>
                      <th className="py-2">Rating penalty</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(report.routing).map(([tier, row]) => (
                      <tr key={tier} className="border-b border-gray-800">
                        <td className="py-2 pr-4 text-gray-200">{ROUTED_CONTEXT_LABELS[tier] ?? tier}</td>
                        <td className="py-2 pr-4 text-gray-400">{row.withheld.samples}</td>
                        <td className="py-2 pr-4 text-gray-300">{percent(row.withheld.missRate)}</td>
                        <td className="py-2 pr-4 text-gray-300">{rating(row.withheld.averageRating)}</td>
                        <td className="py-2 pr-4 text-gray-400">{row.supplied.samples}</td>
                        <td className="py-2 pr-4 text-gray-300">{percent(row.supplied.missRate)}</td>
                        <td className="py-2 pr-4 text-gray-300">{rating(row.supplied.averageRating)}</td>
                        <td className={`py-2 pr-4 ${concernClass(row.excessMissWhenWithheld, 0.1)}`}>
                          {signed(row.excessMissWhenWithheld)}
                        </td>
                        <td className={`py-2 ${concernClass(row.ratingPenaltyWhenWithheld, 0.5)}`}>
                          {signed(row.ratingPenaltyWhenWithheld, 2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="text-xs text-gray-500 mt-3">
                Per-answer detail: withheld tiers and unsupported values.
              </div>
              <div className="space-y-1 mt-2 max-h-64 overflow-y-auto">
                {report.recent.map((observation) => (
                  <div key={observation.id} className="text-xs text-gray-500">
                    <span className="text-gray-400">{observation.outcome}</span>
                    {observation.escalated && ' · escalated'}
                    {observation.unsupportedValues > 0 && ` · ${observation.unsupportedValues} unsupported value(s)`}
                    {observation.withheld.length > 0 && ` · withheld: ${observation.withheld.map((tier) => ROUTED_CONTEXT_LABELS[tier] ?? tier).join(', ')}`}
                    {` · ${observation.question}`}
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
