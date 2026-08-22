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

export interface ResolvedRetirementInputs extends StoredRetirementInputs {
  lifeExpectancy: number;
  missingParams: MissingRetirementInput[];
  confirmationRequiredParams: Array<'annualWithdrawalAmount'>;
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
  return `I could not run a retirement projection because I am missing ${list}. Reply with ${asks.length === 1 ? 'that' : 'those'} and I will work it into the next answer.`;
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
  })).sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
  return JSON.stringify({ holdings: normalizedHoldings, securities: normalizedSecurities });
}

/** Resolve only explicit question, profile, or persisted inputs—never financial-rule defaults. */
export function resolveRetirementInputs(args: {
  questionParams: RetirementQuestionParams;
  profileAge: number | null;
  profileRetirementAge: number | null;
  storedInput?: StoredRetirementInputs;
  allowStoredAnnualWithdrawal?: boolean;
}): ResolvedRetirementInputs {
  const {
    questionParams,
    profileAge,
    profileRetirementAge,
    storedInput = {},
    allowStoredAnnualWithdrawal = false,
  } = args;
  const currentAge = questionParams.currentAge ?? profileAge ?? storedInput.currentAge;
  const retirementAge = questionParams.retirementAge ?? profileRetirementAge ?? storedInput.retirementAge;
  const storedAnnualWithdrawalNeedsConfirmation =
    questionParams.annualWithdrawalAmount == null &&
    storedInput.annualWithdrawalAmount != null &&
    !allowStoredAnnualWithdrawal;
  const annualWithdrawalAmount = questionParams.annualWithdrawalAmount
    ?? (allowStoredAnnualWithdrawal ? storedInput.annualWithdrawalAmount : undefined);
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
  };
}

/**
 * Snapshot date a stored retirement analysis was actually built for.
 *
 * Target-date-fund entries are selected only when `allocationAsOf <= asOfDate`,
 * so two otherwise identical analyses can use different evidence on adjacent
 * dates. The full UTC date therefore belongs in the cache key; a year cannot
 * prevent a January snapshot from seeing a June allocation.
 *
 * Rows written before `asOfDate` was persisted, or with an invalid stored date,
 * fall back to the row's UTC computation date. That may cause a safe cache miss
 * when the original snapshot was older, but it cannot introduce future data.
 *
 * Null never equals a candidate date, so a row with no trustworthy date is
 * recomputed rather than trusted.
 */
export function resolveStoredAsOfDate(
  storedAnalysisInput: Record<string, unknown> | null | undefined,
  computedAt: Date | null | undefined
): string | null {
  const stored = storedAnalysisInput?.asOfDate;
  if (typeof stored === 'string' && isUtcCalendarDate(stored)) return stored;
  if (!(computedAt instanceof Date) || Number.isNaN(computedAt.getTime())) return null;
  return computedAt.toISOString().slice(0, 10);
}

function isUtcCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}
