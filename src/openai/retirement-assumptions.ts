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

import type { FinancialContextSnapshot, RetirementHousehold } from './types';
import type { RetirementIncomeOrigins } from './retirement-income';
import { incomeOfStream } from '../services/household';
import {
  describeHouseholdTimeline,
  describePartnerIncome,
  incomeEndClause,
  MISSING_PARTNER_AGE_CLAUSE,
} from './household-evidence';
import type { RetirementContributionOrigin } from './retirement-contributions';
import { savedOn } from '../services/stated-figures';
import { describeClaimingAdjustmentBriefly } from '../services/social-security-claiming';
import type { RetirementIncomeStream } from '../retirement-analytics/types';
import {
  RETIREMENT_CALCULATOR_ID,
  describeRetirementScenarioExecution,
  type RetirementScenarioExecution,
} from '../scenarios/retirement-scenario';

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

/** Why a value nobody stated this time is in the projection. */
const ASSUMPTION_REASONS: Record<'earlier' | 'current_spending' | 'convention', string> = {
  earlier: 'the figure you gave me before',
  current_spending: 'which is what you spend now (I assumed retirement costs the same)',
  convention: 'a conventional age I assumed because you did not name one',
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
  const assumed = analysis._assumedInputs || {};
  const parts: string[] = [];
  for (const field of REPORTED_FIELDS) {
    const value = values[field];
    if (typeof value !== 'number' || !Number.isFinite(value)) continue;
    // An assumed value has no quote to show: say where it came from instead,
    // so the one figure the user never gave is the easiest one to correct.
    const origin = field === 'currentAge' ? undefined : assumed[field];
    const quote = !origin && sources[field] ? formatQuote(sources[field]!) : null;
    parts.push(
      origin
        ? `${LABELS[field]} ${formatValue(field, value)}, ${ASSUMPTION_REASONS[origin]}`
        : quote
          ? `${LABELS[field]} ${formatValue(field, value)}, from “${quote}”`
          : `${LABELS[field]} ${formatValue(field, value)}`
    );
  }
  parts.push(...describeIncome(values.incomeStreams, analysis._incomeOrigins, analysis._household));
  parts.push(...describeHousehold(
    analysis._household,
    values.annualWithdrawalAmount,
    analysis._storedInputParams?.survivorSpending
  ));
  parts.push(...describeContribution(values, analysis._contributionOrigin));
  if (parts.length === 0) return null;

  return `This projection assumes ${parts.join('; ')}. Tell me if any of that is wrong and I will re-run it.`;
}

function money(value: number): string {
  return `$${Math.round(value).toLocaleString('en-US')}`;
}

/**
 * Each income the projection counted, when it starts, and which of its terms
 * were assumed or came from Your numbers. A projection that counts none says
 * so, because Social Security is the largest figure most plans leave out.
 * Analyses recorded before income was resolved say nothing either way.
 */
function describeIncome(
  streams: readonly RetirementIncomeStream[] | undefined,
  origins: RetirementIncomeOrigins | undefined,
  household: RetirementHousehold | undefined
): string[] {
  if (!origins) return [];
  const partner = household && !('missingAge' in household) ? household : undefined;
  const missingPartnerAge = household && 'missingAge' in household ? [MISSING_PARTNER_AGE_CLAUSE] : [];
  if (!streams || streams.length === 0) {
    return [
      partner
        ? 'no Social Security or pension for either of you, since I have none (tell me yours and I will count them)'
        : 'no Social Security or pension, since I have none for you (tell me yours and I will count it)',
      ...missingPartnerAge,
    ];
  }
  const savedNote = origins.savedAt ? ` (from Your numbers, saved ${savedOn(origins.savedAt)})` : '';
  const parts = streams.map((stream) => {
    const { owner, kind } = incomeOfStream(stream);
    if (owner === 'partner' && partner) return describePartnerIncome(stream, partner);
    const until = incomeEndClause(stream, partner);
    if (kind === 'social_security') {
      const assumedStart = origins.socialSecurity?.startAge === 'default' ? ', an age I assumed' : '';
      const saved = origins.socialSecurity?.amount === 'saved' ? savedNote : '';
      const claiming = origins.socialSecurity?.claiming;
      const claimed = claiming ? ` (${describeClaimingAdjustmentBriefly(claiming)})` : '';
      return `${partner ? 'your ' : ''}Social Security ${money(stream.annualAmount)} a year in today's dollars from ${stream.startAge}${assumedStart}${claimed}${until}${saved}`;
    }
    const pension = origins.pension;
    const terms = stream.inflationAdjusted
      ? `${partner ? 'your' : 'a'} pension of ${money(stream.annualAmount)} a year in today's dollars from ${stream.startAge}, rising with inflation`
      : `${partner ? 'your' : 'a'} pension of ${money(stream.annualAmount)} a year from ${stream.startAge}, a fixed amount that buys less each year prices rise`;
    const assumed = [
      pension?.startAge === 'default' ? 'that it starts when you retire' : null,
      pension?.inflation === 'default' ? 'that it does not rise with inflation' : null,
    ].filter((item): item is string => Boolean(item));
    const assumedNote = assumed.length > 0 ? ` (I assumed ${assumed.join(' and ')})` : '';
    const saved = pension?.amount === 'saved' ? savedNote : '';
    return `${terms}${until}${assumedNote}${saved}`;
  });
  return [...parts, ...missingPartnerAge];
}

/** The couple's timeline, when the projection planned for a partner. */
function describeHousehold(
  household: RetirementHousehold | undefined,
  spending: number | undefined,
  survivorSpending: { fromAge: number; annualAmount: number } | undefined
): string[] {
  if (!household || 'missingAge' in household) return [];
  return describeHouseholdTimeline(household, {
    ...(typeof spending === 'number' && { annual: spending }),
    ...(survivorSpending && { survivor: survivorSpending }),
  });
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function monthName(month: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  return match ? `${MONTH_NAMES[Number(match[2]) - 1]} ${match[1]}` : month;
}

/**
 * What the projection adds each year until withdrawals begin, and where that
 * came from. Linked accounts give a typical month, which a once-a-year deposit
 * is not part of, so that figure says so. Silent for a projection whose
 * withdrawals have begun, and for one recorded before contributions resolved.
 */
function describeContribution(
  values: NonNullable<NonNullable<FinancialContextSnapshot['retirementAnalysis']>['_storedInputParams']>,
  origin: RetirementContributionOrigin | undefined
): string[] {
  if (!origin) return [];
  const { currentAge, withdrawalStartAge } = values;
  if (typeof currentAge !== 'number' || typeof withdrawalStartAge !== 'number' || withdrawalStartAge <= currentAge) {
    return [];
  }
  const amount = values.annualContributionAmount ?? 0;
  const saving = `adding ${money(amount)} a year in today's dollars until withdrawals begin at ${withdrawalStartAge}`;
  switch (origin.origin) {
    case 'stated':
      return [`${saving}, the figure you gave me`];
    case 'saved':
      return [`${saving}${origin.savedAt ? ` (from Your numbers, saved ${savedOn(origin.savedAt)})` : ' (from Your numbers)'}`];
    case 'linked': {
      const linked = origin.linked;
      if (!linked) return [saving];
      const span = `${monthName(linked.firstMonth)} to ${monthName(linked.lastMonth)}`;
      // An account whose activity did not come through is left out, not read
      // as saving nothing, and the answer says so.
      const partial = typeof linked.accountsRead === 'number' && typeof linked.accountsHeld === 'number' &&
        linked.accountsRead < linked.accountsHeld;
      const accounts = partial
        ? `the ${linked.accountsRead} of your ${linked.accountsHeld} linked investment accounts whose activity came through`
        : 'your linked investment accounts';
      const notes = [
        ...(partial ? ['the others may add more'] : []),
        'a deposit made once a year, like an IRA contribution, is not part of a typical month, so tell me if you make one',
      ].join('; ');
      return amount > 0
        ? [`${saving}: what ${accounts} received in a typical month from ${span}, less withdrawals, ` +
          `times twelve (${notes})`]
        : [`no new contributions, since in a typical month from ${span} ${accounts} received ` +
          `nothing after withdrawals (${notes})`];
    }
    case 'none':
      return ['no new contributions before withdrawals begin, since I have none for you (tell me what you add each year and I will count it)'];
  }
}

/** Deterministic disclosure for what-if results appended after model validation. */
export function describeRetirementScenarioAssumptions(
  snapshot: Pick<FinancialContextSnapshot, 'scenarioExecutions' | 'retirementScenarioExecution'>
): string | null {
  const execution = snapshot.scenarioExecutions?.[RETIREMENT_CALCULATOR_ID]
    ?? snapshot.retirementScenarioExecution;
  return execution
    ? describeRetirementScenarioExecution(execution as RetirementScenarioExecution)
    : null;
}
