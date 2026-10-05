import type { RetirementQuestionParams } from '../retirement-analytics/retirement-question-parser';

export type MissingRetirementInput =
  | 'currentAge'
  | 'retirementAge'
  | 'annualWithdrawalAmount'
  | 'withdrawalStartAge';

export interface StoredRetirementInputs {
  currentAge?: number | null;
  retirementAge?: number | null;
  annualWithdrawalAmount?: number | null;
  withdrawalStartAge?: number | null;
  lifeExpectancy?: number | null;
}

/**
 * Why an input the user did not state this time has a value anyway:
 *  - `earlier`: the figure they gave in an earlier conversation;
 *  - `current_spending`: what their cash flow says they spend now;
 *  - `convention`: the conventional planning age, 65 (or now, if past it).
 * Every one of them is stated in the answer, and none is ever stored as the
 * user's own plan.
 */
export type RetirementAssumptionOrigin = 'earlier' | 'current_spending' | 'convention';
export type AssumedRetirementInputs = Partial<Record<'retirementAge' | 'annualWithdrawalAmount', RetirementAssumptionOrigin>>;

/**
 * The assumptions worth remembering as assumptions. A figure from an earlier
 * conversation is the user's own and is not one of them: listing it would
 * strip it from the next run, which would then fall back to current spending
 * and lose what they said retirement would cost.
 */
export function persistableAssumptions(assumed: AssumedRetirementInputs): AssumedRetirementInputs {
  return Object.fromEntries(
    Object.entries(assumed).filter(([, origin]) => origin === 'current_spending' || origin === 'convention')
  ) as AssumedRetirementInputs;
}

/**
 * A stored input with what a previous run assumed taken out, so the next run
 * never reads an assumed 65 or a month-old spending level back as the user's
 * plan. A withdrawal start age equal to the assumed retirement age followed
 * it and goes with it; one the user named apart from it is theirs and stays.
 */
export function withoutStoredAssumptions<T extends Record<string, unknown>>(
  storedInput: T,
  assumptions: AssumedRetirementInputs
): Partial<T> {
  const kept: Partial<T> = { ...storedInput };
  for (const field of Object.keys(assumptions)) delete kept[field];
  if (assumptions.retirementAge && storedInput.withdrawalStartAge === storedInput.retirementAge) {
    delete kept.withdrawalStartAge;
  }
  return kept;
}

/** Same fields assumed for the same reasons, regardless of key order. */
export function sameAssumptions(left: AssumedRetirementInputs, right: AssumedRetirementInputs): boolean {
  const normalize = (value: AssumedRetirementInputs) =>
    JSON.stringify(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)));
  return normalize(left) === normalize(right);
}

/** The conventional age a plan assumes when nobody has named one. */
export const CONVENTIONAL_RETIREMENT_AGE = 65;

export interface ResolvedRetirementInputs extends StoredRetirementInputs {
  lifeExpectancy: number;
  missingParams: MissingRetirementInput[];
  confirmationRequiredParams: Array<'annualWithdrawalAmount'>;
  /** Inputs filled by a disclosed assumption rather than the user's words. */
  assumed: AssumedRetirementInputs;
}

function finiteOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

const MISSING_INPUT_PROMPTS: Record<MissingRetirementInput, string> = {
  currentAge: 'your current age',
  retirementAge: 'the age you plan to retire',
  annualWithdrawalAmount: 'roughly how much you expect to spend per year once retired, in today\'s dollars',
  withdrawalStartAge: 'the age you would start drawing from the portfolio',
};

export interface RetirementNeedsInfo {
  missingParams: MissingRetirementInput[];
  detectedParams?: { annualWithdrawalAmount?: number };
  confirmationRequiredParams?: Array<'annualWithdrawalAmount'>;
  unavailableReason?: string;
}

/**
 * Turn "we could not run the projection" into something the user can act on.
 *
 * The missing inputs were only ever described to the model, buried in the
 * context pack, and the model answered around them rather than asking. When the
 * one thing standing between a question and its analysis is a number the user
 * can supply in a sentence, the answer should say so plainly.
 */
export function describeMissingRetirementInputs(needsInfo: RetirementNeedsInfo | undefined): string | null {
  if (!needsInfo) return null;

  const confirmAmount = needsInfo.confirmationRequiredParams?.includes('annualWithdrawalAmount')
    ? needsInfo.detectedParams?.annualWithdrawalAmount
    : undefined;
  if (confirmAmount != null && Number.isFinite(confirmAmount)) {
    return `To run the retirement projection I need to confirm one thing: are you still planning to spend about $${Math.round(confirmAmount).toLocaleString()} a year in retirement? Tell me either way and I will include the analysis.`;
  }

  const missing = (needsInfo.missingParams || []).filter((param) => param in MISSING_INPUT_PROMPTS);
  // Something else blocked it — holdings, or the analysis service itself. Those
  // are described by the caller, which knows which of them the user can fix.
  if (missing.length === 0) return null;

  const asks = missing.map((param) => MISSING_INPUT_PROMPTS[param]);
  const list = asks.length === 1
    ? asks[0]
    : `${asks.slice(0, -1).join(', ')} and ${asks[asks.length - 1]}`;
  return `To run your retirement projection I need ${list}. Reply with ${asks.length === 1 ? 'that' : 'those'} and I will work it into the next answer.`;
}

/** Stable signature for every portfolio field that can affect retirement analysis. */
export function retirementPortfolioFingerprint(holdings: readonly any[], securities: readonly any[]): string {
  const normalizedHoldings = holdings.map((holding) => ({
    securityId: String(holding?.security_id ?? ''),
    accountId: String(holding?.account_id ?? ''),
    ticker: String(holding?.ticker_symbol ?? '').toUpperCase(),
    quantity: finiteOrNull(holding?.quantity),
    value: finiteOrNull(holding?.institution_value ?? holding?.value),
    costBasis: finiteOrNull(holding?.cost_basis),
    type: String(holding?.security_type ?? holding?.type ?? ''),
  })).sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
  const normalizedSecurities = securities.map((security) => ({
    securityId: String(security?.security_id ?? ''),
    ticker: String(security?.ticker_symbol ?? '').toUpperCase(),
    name: String(security?.name ?? security?.security_name ?? ''),
    type: String(security?.security_type ?? security?.type ?? ''),
    assetClass: String(security?.asset_class ?? ''),
    // Classification reads the custodian's cash-equivalent flag, so a feed that
    // flips it changes the modeled portfolio. Left out of the signature, the
    // cached analysis would survive a change that invalidates it.
    cashEquivalent: security?.is_cash_equivalent === true,
    // Classification resolves this against the Treasury's auction records, so
    // a feed that starts or stops sending it changes the modeled portfolio.
    // Normalized the same way the Treasury provider normalizes it. Stored raw,
    // a feed that flips case without changing the security would bust the
    // fingerprint and force a recompute that resolves to the same CUSIP.
    cusip: String(security?.cusip ?? '').trim().toUpperCase(),
  })).sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
  return JSON.stringify({ holdings: normalizedHoldings, securities: normalizedSecurities });
}

/**
 * Resolve explicit question, profile, or persisted inputs -- and, only when
 * the caller passes `assumeWhenMissing`, fill the gaps with disclosed
 * assumptions instead of stopping the projection to ask.
 *
 * Without it nothing is assumed, which is what every caller got before: a
 * question about a plan nobody has described cannot borrow a rule-of-thumb
 * spending level. With it, a spending level comes from the user's own
 * earlier figure or their current spending, and a retirement age from the
 * conventional 65; the current age is never assumed, because nothing the
 * application holds can stand in for it.
 */
export function resolveRetirementInputs(args: {
  questionParams: RetirementQuestionParams;
  profileAge: number | null;
  profileRetirementAge: number | null;
  storedInput?: StoredRetirementInputs;
  allowStoredAnnualWithdrawal?: boolean;
  assumeWhenMissing?: {
    /** Annual spending read from the user's linked cash flow, when known. */
    currentAnnualSpending?: number | null;
  };
}): ResolvedRetirementInputs {
  const {
    questionParams,
    profileAge,
    profileRetirementAge,
    storedInput = {},
    allowStoredAnnualWithdrawal = false,
    assumeWhenMissing,
  } = args;
  const assumed: AssumedRetirementInputs = {};
  const currentAge = questionParams.currentAge ?? profileAge ?? storedInput.currentAge;
  let retirementAge = questionParams.retirementAge ?? profileRetirementAge ?? storedInput.retirementAge;
  if (retirementAge == null && assumeWhenMissing && currentAge != null) {
    retirementAge = Math.max(currentAge, CONVENTIONAL_RETIREMENT_AGE);
    assumed.retirementAge = 'convention';
  }
  const storedAnnualWithdrawal = storedInput.annualWithdrawalAmount ?? undefined;
  const statedAnnualWithdrawal = questionParams.annualWithdrawalAmount
    ?? (allowStoredAnnualWithdrawal ? storedAnnualWithdrawal : undefined);
  const currentSpending = assumeWhenMissing?.currentAnnualSpending;
  let annualWithdrawalAmount = statedAnnualWithdrawal;
  if (annualWithdrawalAmount == null && assumeWhenMissing) {
    // The user's own earlier figure outranks what they spend now: it is what
    // they said retirement would cost.
    if (storedAnnualWithdrawal != null) {
      annualWithdrawalAmount = storedAnnualWithdrawal;
      assumed.annualWithdrawalAmount = 'earlier';
    } else if (typeof currentSpending === 'number' && Number.isFinite(currentSpending) && currentSpending > 0) {
      annualWithdrawalAmount = Math.round(currentSpending);
      assumed.annualWithdrawalAmount = 'current_spending';
    }
  }
  const storedAnnualWithdrawalNeedsConfirmation =
    annualWithdrawalAmount == null &&
    questionParams.annualWithdrawalAmount == null &&
    storedAnnualWithdrawal != null &&
    !allowStoredAnnualWithdrawal;
  const withdrawalStartAge = questionParams.withdrawalStartAge
    ?? questionParams.retirementAge
    ?? profileRetirementAge
    ?? storedInput.withdrawalStartAge
    ?? retirementAge;
  const lifeExpectancy = questionParams.lifeExpectancy ?? storedInput.lifeExpectancy ?? 95;

  const missingParams: MissingRetirementInput[] = [];
  if (currentAge == null) missingParams.push('currentAge');
  if (retirementAge == null) missingParams.push('retirementAge');
  if (annualWithdrawalAmount == null) missingParams.push('annualWithdrawalAmount');
  if (withdrawalStartAge == null) missingParams.push('withdrawalStartAge');

  return {
    currentAge,
    retirementAge,
    annualWithdrawalAmount,
    withdrawalStartAge,
    lifeExpectancy,
    missingParams,
    confirmationRequiredParams: storedAnnualWithdrawalNeedsConfirmation
      ? ['annualWithdrawalAmount']
      : [],
    assumed,
  };
}

/**
 * Snapshot date a stored retirement analysis was actually built for.
 *
 * Target-date-fund entries are selected only when their verified
 * `availableFrom <= asOfDate`. `allocationAsOf` records the older holdings
 * date separately, so a report cannot become visible to snapshots before it
 * was published or first observed. Two otherwise identical analyses can use
 * different evidence on adjacent dates. The full UTC date therefore belongs
 * in the cache key; a year cannot prevent a January snapshot from seeing a
 * publication first observed in August.
 *
 * Only an explicit, valid stored `asOfDate` matches. Legacy rows that recorded
 * only `asOfYear` (or nothing), and rows with an invalid date, return null so
 * the cache misses and the analysis is recomputed. Falling back to `computedAt`
 * looks safe against look-ahead, but on the common path where the snapshot and
 * the analysis share a calendar day it would reuse pre-registry survival rates
 * that silently redistributed unsupported sleeves.
 *
 * Null never equals a candidate date, so a row with no trustworthy date is
 * recomputed rather than trusted.
 */
export function resolveStoredAsOfDate(
  storedAnalysisInput: Record<string, unknown> | null | undefined,
  _computedAt?: Date | null | undefined
): string | null {
  const stored = storedAnalysisInput?.asOfDate;
  if (typeof stored === 'string' && isUtcCalendarDate(stored)) return stored;
  return null;
}

function isUtcCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}
