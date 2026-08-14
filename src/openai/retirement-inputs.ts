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
