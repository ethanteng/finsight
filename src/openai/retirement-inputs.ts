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
  if (missing.length === 0) {
    // Something else blocked it — holdings, or the analysis service itself.
    return needsInfo.unavailableReason ? null : null;
  }

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
