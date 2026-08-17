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

/** Deterministic disclosure for what-if results appended after model validation. */
export function describeRetirementScenarioAssumptions(
  snapshot: Pick<FinancialContextSnapshot, 'retirementScenarioExecution'>
): string | null {
  const execution = snapshot.retirementScenarioExecution;
  if (!execution) return null;
  if (execution.status === 'unavailable') {
    return `I could not run the requested scenario comparison: ${execution.reason}`;
  }
  if (execution.scenarios.length === 0) return null;

  const labels = execution.scenarios.map((scenario) => scenario.label);
  const assumptionMaps = execution.scenarios.map((scenario) =>
    new Map(scenario.assumptions.map((assumption) => [assumption.key, assumption]))
  );
  // Older compact fixtures only attached the full ledger to the first variant.
  // Treat that ledger as shared when every later map is empty.
  const comparisonLedgersAvailable = assumptionMaps.slice(1).every((map) => map.size > 0);
  const commonValue = (key: string): string | number | undefined => {
    const first = assumptionMaps[0].get(key)?.value;
    if (!comparisonLedgersAvailable) return first;
    return assumptionMaps.every((map) => map.get(key)?.value === first) ? first : undefined;
  };
  const annualSpending = commonValue('annual_withdrawal_amount');
  const annualContribution = commonValue('pre_withdrawal_contributions');
  const currentAge = commonValue('current_age');
  const retirementAge = commonValue('retirement_age');
  const withdrawalStartAge = commonValue('withdrawal_start_age');
  const lifeExpectancy = commonValue('life_expectancy');
  const defaults = execution.scenarios.flatMap((scenario) => scenario.assumptions)
    .filter((assumption) => assumption.origin === 'default' && assumption.key === 'annual_growth_rate');

  const heldConstant = [
    typeof annualSpending === 'number'
      ? `starting spending of $${Math.round(annualSpending).toLocaleString('en-US')} a year in today's dollars`
      : null,
    typeof currentAge === 'number' ? `age ${currentAge} today` : null,
    typeof retirementAge === 'number' ? `retirement at ${retirementAge}` : null,
    typeof withdrawalStartAge === 'number' && withdrawalStartAge !== retirementAge
      ? `withdrawals starting at ${withdrawalStartAge}`
      : null,
    typeof lifeExpectancy === 'number' ? `life expectancy ${lifeExpectancy}` : null,
    // Only treat contributions as held-constant when every compared ledger agrees.
    // Differing values leave annualContribution undefined; do not fall through to
    // the zero-contribution default or the disclosure contradicts the variant inputs.
    typeof annualContribution === 'number'
      ? annualContribution > 0
        ? `$${Math.round(annualContribution).toLocaleString('en-US')} a year in pre-withdrawal contributions in today's dollars`
        : 'no additional contributions before withdrawals begin'
      : comparisonLedgersAvailable
        ? null
        : 'no additional contributions before withdrawals begin',
  ].filter((item): item is string => Boolean(item));
  const changedInputs = execution.scenarios.flatMap((scenario) => {
    const currencyKeys = new Set(['annual_withdrawal_amount', 'pre_withdrawal_contributions']);
    const changes = scenario.assumptions
      .filter((assumption) => assumption.origin === 'user' && assumption.key !== 'withdrawal_policy')
      .map((assumption) => `${assumption.label.toLowerCase()} ${
        typeof assumption.value === 'number' && currencyKeys.has(assumption.key)
          ? `$${Math.round(assumption.value).toLocaleString('en-US')}`
          : assumption.value
      }`);
    return changes.length > 0 ? [`${scenario.label}: ${changes.join(', ')}`] : [];
  });
  const changesNotice = changedInputs.length > 0
    ? ` User-supplied variant inputs: ${changedInputs.join('; ')}.`
    : '';
  const defaultNotice = defaults.length > 0
    ? ` The fixed-growth rate was not specified, so I used the disclosed Ask Linc default of ${Number((Number(defaults[0].value) * 100).toFixed(4))}%.`
    : '';

  const action = labels.length > 1
    ? `compared ${labels.join(' with ')}`
    : `ran ${labels[0]}`;
  const heldConstantNotice = heldConstant.length > 0
    ? ` while holding ${heldConstant.join(', ')} constant`
    : '';
  return `Scenario assumptions: ${action}${heldConstantNotice}.${changesNotice}${defaultNotice} Change any assumption and I will re-run it.`;
}
