/**
 * Saying which words the projection acted on.
 *
 * A retirement projection is only as right as its inputs, and its inputs are
 * read out of a conversation. When that reading is wrong the answer is still
 * confident, fully formed, and built on a number the user never meant — the
 * failure this whole area keeps producing. Every guard so far has tried to stop
 * a misread from happening; this one makes a misread visible, which is the only
 * defence that works against the cases nobody anticipated.
 *
 * Deterministic and appended after the model has finished, for the same reason
 * the missing-input asks are: these values come from persisted state, and a
 * sentence about what the projection used must not itself be generated.
 */

import type { FinancialContextSnapshot } from './types';

/** Ordered by how much a misread costs: spending drives the whole projection. */
const REPORTED_FIELDS = [
  'annualWithdrawalAmount',
  'retirementAge',
  'currentAge',
] as const;

type ReportedField = (typeof REPORTED_FIELDS)[number];

const LABELS: Record<ReportedField, string> = {
  annualWithdrawalAmount: 'spending',
  retirementAge: 'retiring at',
  currentAge: 'age today',
};

function formatValue(field: ReportedField, value: number): string {
  if (field !== 'annualWithdrawalAmount') return String(value);
  return `$${Math.round(value).toLocaleString('en-US')} a year`;
}

/**
 * The quote is the user's own text going into an answer that the security
 * output validator then scans — and a flag there replaces the whole answer, not
 * the offending line. A phrase that merely looks like an injection would cost
 * the user a good projection, so keep plain prose and the characters money is
 * written with, and drop everything else. A quote is also only worth showing if
 * it can be read at a glance.
 */
function formatQuote(quote: string): string | null {
  const cleaned = quote
    .replace(/[^\p{L}\p{N} $.,%'\-/]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned || cleaned.length > 120) return null;
  return cleaned;
}

/**
 * @returns one sentence naming the inputs the projection used and, where the
 *   words are known, the phrase each came from — or null when no projection ran
 */
export function describeRetirementAssumptions(
  snapshot: Pick<FinancialContextSnapshot, 'retirementAnalysis'>
): string | null {
  const analysis = snapshot.retirementAnalysis;
  const values = analysis?._storedInputParams;
  if (!analysis || !values) return null;

  const sources = analysis._inputSources || {};
  const parts: string[] = [];
  for (const field of REPORTED_FIELDS) {
    const value = values[field];
    if (typeof value !== 'number' || !Number.isFinite(value)) continue;
    const quote = sources[field] ? formatQuote(sources[field]!) : null;
    parts.push(
      quote
        ? `${LABELS[field]} ${formatValue(field, value)}, from “${quote}”`
        : `${LABELS[field]} ${formatValue(field, value)}`
    );
  }
  if (parts.length === 0) return null;

  return `This projection assumes ${parts.join('; ')}. Tell me if any of that is wrong and I will re-run it.`;
}
