'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

const ROUTED_CONTEXT_LABELS: Record<string, string> = {
  accountsIncluded: 'Account balances',
  transactionDetailsIncluded: 'Transaction detail',
  investmentDetailsIncluded: 'Investment holdings',
  marketContextRequested: 'Market context',
  searchContextRequested: 'Search context',
};

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
}

interface AnswerQualityReport {
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

const OUTCOME_STYLES: Record<Observation['outcome'], string> = {
  passed: 'bg-green-900/50 text-green-300',
  salvaged: 'bg-yellow-900/50 text-yellow-300',
  replaced: 'bg-red-900/50 text-red-300',
};

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="bg-gray-900 rounded-lg p-4 border border-gray-700">
      <div className="text-xs uppercase tracking-wide text-gray-400">{label}</div>
      <div className="text-2xl font-semibold text-white mt-1">{value}</div>
      {hint && <div className="text-xs text-gray-500 mt-1">{hint}</div>}
    </div>
  );
}

export default function AnswerQualityPanel({
  apiUrl,
  getAuthHeaders,
}: {
  /** Matches the admin page, where NEXT_PUBLIC_API_URL may be unset. */
  apiUrl: string | undefined;
  getAuthHeaders: () => Record<string, string>;
}) {
  const [report, setReport] = useState<AnswerQualityReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
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

  useEffect(() => { load(); }, [load]);

  return (
    <div className="bg-gray-800 rounded-lg p-6 mb-6">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-xl font-semibold text-white">Answer quality &amp; context routing</h2>
        <button
          onClick={load}
          disabled={loading}
          className={`px-4 py-2 rounded-lg text-sm ${loading ? 'bg-gray-600 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'} text-white`}
        >
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>
      <p className="text-sm text-gray-400 mb-4">
        Whether withholding a context tier costs users good answers. A positive miss excess means answers
        failed to ground more often when the tier was withheld; a positive rating penalty means users rated
        those answers worse. Both are correlations — read the questions before concluding the router is wrong.
      </p>

      {error && <div className="bg-red-900/50 border border-red-700 text-red-200 rounded-lg p-3 mb-4">{error}</div>}
      {!report && !error && <div className="text-gray-400">Loading report…</div>}

      {report && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <Stat label="Grounded" value={percent(report.quality.groundedRate)} hint={`${report.window.withManifest} answers with evidence`} />
            <Stat label="Context escalated" value={percent(report.quality.escalationRate)} hint="routing withheld something needed" />
            <Stat label="Average rating" value={rating(report.quality.averageRating)} hint={`${report.window.rated} rated`} />
            <Stat
              label="Rating: grounded vs replaced"
              value={`${rating(report.quality.byOutcome.passed.averageRating)} / ${rating(report.quality.byOutcome.replaced.averageRating)}`}
              hint="passed / could-not-verify"
            />
          </div>

          <h3 className="text-lg font-medium text-white mb-2">Is routing costing us answers?</h3>
          <div className="overflow-x-auto mb-6">
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

          <h3 className="text-lg font-medium text-white mb-2">Recent answers</h3>
          <div className="space-y-2 max-h-[28rem] overflow-y-auto">
            {report.recent.length === 0 && (
              <div className="text-gray-400 text-sm">No answers with evidence manifests yet.</div>
            )}
            {report.recent.map((observation) => (
              <div key={observation.id} className="bg-gray-900 rounded-lg p-3 border border-gray-700">
                <div className="flex items-start justify-between gap-4">
                  <p className="text-sm text-gray-200 flex-1">{observation.question}</p>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`text-xs px-2 py-1 rounded ${OUTCOME_STYLES[observation.outcome]}`}>
                      {observation.outcome}
                    </span>
                    {observation.escalated && (
                      <span className="text-xs px-2 py-1 rounded bg-blue-900/50 text-blue-300">escalated</span>
                    )}
                    <span className="text-xs text-gray-300 w-14 text-right">
                      {observation.rating === null ? 'unrated' : `${observation.rating}/5`}
                    </span>
                  </div>
                </div>
                <div className="text-xs text-gray-500 mt-2">
                  {new Date(observation.createdAt).toLocaleString()}
                  {observation.unsupportedValues > 0 && ` · ${observation.unsupportedValues} unsupported value(s)`}
                  {observation.withheld.length > 0 && ` · withheld: ${observation.withheld.map((tier) => ROUTED_CONTEXT_LABELS[tier] ?? tier).join(', ')}`}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
