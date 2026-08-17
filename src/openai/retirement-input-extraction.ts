/**
 * Shared shape and deterministic boundary validation for retirement inputs
 * proposed by the semantic context planner. Nothing here reads language or
 * computes a projection.
 */

export interface RetirementInputTurn {
  question: string;
  answer?: string;
}

export interface ExtractedRetirementInputs {
  currentAge?: number;
  retirementAge?: number;
  annualWithdrawalAmount?: number;
  withdrawalStartAge?: number;
  lifeExpectancy?: number;
  /** The words each value came from, for the answer to cite and Show the Math to display. */
  sources: Partial<Record<ExtractedField, string>>;
}

type ExtractedField =
  | 'currentAge'
  | 'retirementAge'
  | 'annualWithdrawalAmount'
  | 'withdrawalStartAge'
  | 'lifeExpectancy';

const FIELDS: ExtractedField[] = [
  'currentAge',
  'retirementAge',
  'annualWithdrawalAmount',
  'withdrawalStartAge',
  'lifeExpectancy',
];

/**
 * Ranges a human plan can actually occupy. Not wording heuristics — these catch
 * a misread, not a phrasing the rules did not anticipate. An out-of-range value
 * is dropped rather than clamped: reporting the input as missing asks the user,
 * where a clamped number would run a projection nobody chose.
 */
const RANGES: Record<ExtractedField, { min: number; max: number; integer: boolean }> = {
  currentAge: { min: 18, max: 120, integer: true },
  retirementAge: { min: 30, max: 100, integer: true },
  withdrawalStartAge: { min: 30, max: 120, integer: true },
  lifeExpectancy: { min: 50, max: 120, integer: true },
  // No lower floor near a plausible "budget": with the turns in front of it the
  // model can tell $8,000 a year from a monthly bill, which is exactly what the
  // rules could not do. The bound only rejects impossible magnitudes.
  annualWithdrawalAmount: { min: 1, max: 100_000_000, integer: false },
};

/** Drop anything outside the range a real plan occupies; keep the rest. */
export function validateExtractedInputs(raw: unknown): ExtractedRetirementInputs {
  const record = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const rawSources = (record.sources && typeof record.sources === 'object' ? record.sources : {}) as Record<string, unknown>;

  const result: ExtractedRetirementInputs = { sources: {} };
  for (const field of FIELDS) {
    const value = record[field];
    if (typeof value !== 'number' || !Number.isFinite(value)) continue;
    const range = RANGES[field];
    if (value < range.min || value > range.max) continue;
    if (range.integer && !Number.isInteger(value)) continue;
    result[field] = value;
    const source = rawSources[field];
    if (typeof source === 'string' && source.trim()) result.sources[field] = source.trim();
  }

  // Withdrawals start at retirement unless the conversation said otherwise.
  if (result.withdrawalStartAge == null && result.retirementAge != null) {
    result.withdrawalStartAge = result.retirementAge;
  }
  return result;
}
