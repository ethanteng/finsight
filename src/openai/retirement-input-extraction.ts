/**
 * Shared shape and deterministic boundary validation for retirement inputs
 * proposed by the semantic context planner. Nothing here reads language or
 * computes a projection.
 */

import { INCOME_INFLATION_OPTIONS, type IncomeInflation } from '../services/stated-figures';
import type { StatedPartner } from '../services/household';
import type { StatedSpendingCut } from '../services/spending-flexibility';
import type { StatedAccountSplit } from '../services/retirement-taxes';
import type { PreMedicareCoverage, StatedHealthcare } from '../services/retirement-healthcare';
import { PRE_MEDICARE_COVERAGE_CHOICES } from '../services/stated-figures';

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
  /** Social Security a year, in today's dollars. */
  socialSecurityAnnual?: number;
  socialSecurityStartAge?: number;
  /** The claiming age the user's Social Security figure is for, when they named one. */
  socialSecurityAmountAge?: number;
  /** What the user adds to investments a year until retirement, match included, in today's dollars. */
  annualContributionAmount?: number;
  /** A pension or other income that is not Social Security, a year. */
  pensionAnnual?: number;
  pensionStartAge?: number;
  pensionInflation?: IncomeInflation;
  /** A spouse or partner: their age today and their own incomes, on their own ages. */
  partnerAge?: number;
  partnerSocialSecurityAnnual?: number;
  partnerSocialSecurityStartAge?: number;
  partnerSocialSecurityAmountAge?: number;
  partnerPensionAnnual?: number;
  partnerPensionStartAge?: number;
  partnerPensionInflation?: IncomeInflation;
  partnerPlanThroughAge?: number;
  /** What one survivor would spend a year, in today's dollars. */
  survivorAnnualSpending?: number;
  /** Whether the user and their partner are married, when the user says or makes it plain. */
  partnerMarried?: boolean;
  /**
   * How much of their retirement spending the user could cut in a bad market,
   * in whichever form they said it: percentage points, dollars a year less,
   * or the spending a year they could not go below.
   */
  spendingCutPercent?: number;
  spendingCutAnnual?: number;
  essentialAnnualSpending?: number;
  /** How the user's savings are held, for taxes: dollars in each kind of account, or percentage points. */
  pretaxSavings?: number;
  rothSavings?: number;
  taxableSavings?: number;
  pretaxSavingsPercent?: number;
  rothSavingsPercent?: number;
  taxableSavingsPercent?: number;
  /** The user's state income tax rate on retirement income, in percentage points. */
  stateIncomeTaxPercent?: number;
  /** Health coverage before Medicare, and its premium a year per person, when the user says. */
  preMedicareCoverage?: PreMedicareCoverage;
  preMedicareAnnualPremium?: number;
  /** Whether the user's retirement spending already pays for health premiums. */
  healthcareInSpending?: boolean;
  /** The words each value came from, for the answer to cite and Show the Math to display. */
  sources: Partial<Record<ExtractedField | ExtractedChoiceField, string>>;
}

type ExtractedChoiceField =
  | 'pensionInflation'
  | 'partnerPensionInflation'
  | 'partnerMarried'
  | 'preMedicareCoverage'
  | 'healthcareInSpending';

type ExtractedField =
  | 'currentAge'
  | 'retirementAge'
  | 'annualWithdrawalAmount'
  | 'withdrawalStartAge'
  | 'lifeExpectancy'
  | 'socialSecurityAnnual'
  | 'socialSecurityStartAge'
  | 'socialSecurityAmountAge'
  | 'annualContributionAmount'
  | 'pensionAnnual'
  | 'pensionStartAge'
  | 'partnerAge'
  | 'partnerSocialSecurityAnnual'
  | 'partnerSocialSecurityStartAge'
  | 'partnerSocialSecurityAmountAge'
  | 'partnerPensionAnnual'
  | 'partnerPensionStartAge'
  | 'partnerPlanThroughAge'
  | 'survivorAnnualSpending'
  | 'spendingCutPercent'
  | 'spendingCutAnnual'
  | 'essentialAnnualSpending'
  | 'pretaxSavings'
  | 'rothSavings'
  | 'taxableSavings'
  | 'pretaxSavingsPercent'
  | 'rothSavingsPercent'
  | 'taxableSavingsPercent'
  | 'stateIncomeTaxPercent'
  | 'preMedicareAnnualPremium';

const FIELDS: ExtractedField[] = [
  'currentAge',
  'retirementAge',
  'annualWithdrawalAmount',
  'withdrawalStartAge',
  'lifeExpectancy',
  'socialSecurityAnnual',
  'socialSecurityStartAge',
  'socialSecurityAmountAge',
  'annualContributionAmount',
  'pensionAnnual',
  'pensionStartAge',
  'partnerAge',
  'partnerSocialSecurityAnnual',
  'partnerSocialSecurityStartAge',
  'partnerSocialSecurityAmountAge',
  'partnerPensionAnnual',
  'partnerPensionStartAge',
  'partnerPlanThroughAge',
  'survivorAnnualSpending',
  'spendingCutPercent',
  'spendingCutAnnual',
  'essentialAnnualSpending',
  'pretaxSavings',
  'rothSavings',
  'taxableSavings',
  'pretaxSavingsPercent',
  'rothSavingsPercent',
  'taxableSavingsPercent',
  'stateIncomeTaxPercent',
  'preMedicareAnnualPremium',
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
  // Where the calculators that read the same figures accept them. Zero is a
  // statement ("no pension"), so it is kept.
  socialSecurityAnnual: { min: 0, max: 250_000, integer: false },
  socialSecurityStartAge: { min: 50, max: 80, integer: true },
  // Ages a retirement benefit can be claimed at, and so be quoted for.
  socialSecurityAmountAge: { min: 62, max: 70, integer: true },
  // The what-if's own bound. Zero is a statement ("I've stopped saving").
  annualContributionAmount: { min: 0, max: 100_000_000, integer: false },
  pensionAnnual: { min: 0, max: 10_000_000, integer: false },
  pensionStartAge: { min: 30, max: 95, integer: true },
  // Where Your numbers keeps the same figures.
  partnerAge: { min: 18, max: 90, integer: true },
  partnerSocialSecurityAnnual: { min: 0, max: 250_000, integer: false },
  partnerSocialSecurityStartAge: { min: 50, max: 80, integer: true },
  partnerSocialSecurityAmountAge: { min: 62, max: 70, integer: true },
  partnerPensionAnnual: { min: 0, max: 10_000_000, integer: false },
  partnerPensionStartAge: { min: 30, max: 95, integer: true },
  partnerPlanThroughAge: { min: 60, max: 110, integer: true },
  survivorAnnualSpending: { min: 1_000, max: 10_000_000, integer: false },
  // Zero is a statement ("we couldn't cut anything"). The calculators drop a
  // cut beyond what a plan can be built on.
  spendingCutPercent: { min: 0, max: 100, integer: false },
  spendingCutAnnual: { min: 0, max: 100_000_000, integer: false },
  essentialAnnualSpending: { min: 0, max: 100_000_000, integer: false },
  pretaxSavings: { min: 0, max: 100_000_000, integer: false },
  rothSavings: { min: 0, max: 100_000_000, integer: false },
  taxableSavings: { min: 0, max: 100_000_000, integer: false },
  pretaxSavingsPercent: { min: 0, max: 100, integer: false },
  rothSavingsPercent: { min: 0, max: 100, integer: false },
  taxableSavingsPercent: { min: 0, max: 100, integer: false },
  // Where Your numbers keeps it: no state taxes retirement income above 15%.
  stateIncomeTaxPercent: { min: 0, max: 15, integer: false },
  preMedicareAnnualPremium: { min: 0, max: 100_000, integer: false },
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
  for (const field of ['pensionInflation', 'partnerPensionInflation'] as const) {
    const inflation = record[field];
    if (typeof inflation === 'string' && (INCOME_INFLATION_OPTIONS as readonly string[]).includes(inflation)) {
      result[field] = inflation as IncomeInflation;
      const source = rawSources[field];
      if (typeof source === 'string' && source.trim()) result.sources[field] = source.trim();
    }
  }

  // Married or not, only when the user said; unspecified is unknown.
  const married = record.partnerMarried;
  if (married === 'yes' || married === 'no') {
    result.partnerMarried = married === 'yes';
    const source = rawSources.partnerMarried;
    if (typeof source === 'string' && source.trim()) result.sources.partnerMarried = source.trim();
  }

  const coverage = record.preMedicareCoverage;
  if (typeof coverage === 'string' && (PRE_MEDICARE_COVERAGE_CHOICES as readonly string[]).includes(coverage)) {
    result.preMedicareCoverage = coverage as PreMedicareCoverage;
    const source = rawSources.preMedicareCoverage;
    if (typeof source === 'string' && source.trim()) result.sources.preMedicareCoverage = source.trim();
  }
  const inSpending = record.healthcareInSpending;
  if (inSpending === 'yes' || inSpending === 'no') {
    result.healthcareInSpending = inSpending === 'yes';
    const source = rawSources.healthcareInSpending;
    if (typeof source === 'string' && source.trim()) result.sources.healthcareInSpending = source.trim();
  }

  // Withdrawals start at retirement unless the conversation said otherwise.
  if (result.withdrawalStartAge == null && result.retirementAge != null) {
    result.withdrawalStartAge = result.retirementAge;
  }
  return result;
}

/** What the user said about cutting spending in a bad market, or undefined when nothing. */
export function statedSpendingCutOf(inputs: ExtractedRetirementInputs | undefined): StatedSpendingCut | undefined {
  if (!inputs) return undefined;
  const cut: StatedSpendingCut = {
    percent: inputs.spendingCutPercent,
    annualAmount: inputs.spendingCutAnnual,
    essentialAnnual: inputs.essentialAnnualSpending,
  };
  const said = Object.fromEntries(Object.entries(cut).filter(([, value]) => value !== undefined)) as StatedSpendingCut;
  return Object.keys(said).length > 0 ? said : undefined;
}

/** What the user said about a partner in this decision, or undefined when nothing. */
export function statedPartnerOf(inputs: ExtractedRetirementInputs | undefined): StatedPartner | undefined {
  if (!inputs) return undefined;
  const partner: StatedPartner = {
    age: inputs.partnerAge,
    socialSecurityAnnual: inputs.partnerSocialSecurityAnnual,
    socialSecurityStartAge: inputs.partnerSocialSecurityStartAge,
    socialSecurityAmountAge: inputs.partnerSocialSecurityAmountAge,
    pensionAnnual: inputs.partnerPensionAnnual,
    pensionStartAge: inputs.partnerPensionStartAge,
    pensionInflation: inputs.partnerPensionInflation,
    planThroughAge: inputs.partnerPlanThroughAge,
    survivorAnnualSpending: inputs.survivorAnnualSpending,
    married: inputs.partnerMarried,
  };
  const said = Object.fromEntries(Object.entries(partner).filter(([, value]) => value !== undefined)) as StatedPartner;
  return Object.keys(said).length > 0 ? said : undefined;
}

/** How the user said their savings are held, in this decision, or undefined when they did not. */
export function statedAccountSplitOf(inputs: ExtractedRetirementInputs | undefined): StatedAccountSplit | undefined {
  if (!inputs) return undefined;
  const split: StatedAccountSplit = {
    pretaxAmount: inputs.pretaxSavings,
    rothAmount: inputs.rothSavings,
    taxableAmount: inputs.taxableSavings,
    pretaxPercent: inputs.pretaxSavingsPercent,
    rothPercent: inputs.rothSavingsPercent,
    taxablePercent: inputs.taxableSavingsPercent,
  };
  const said = Object.fromEntries(Object.entries(split).filter(([, value]) => value !== undefined)) as StatedAccountSplit;
  return Object.keys(said).length > 0 ? said : undefined;
}

/** What the user said about health coverage in this decision, or undefined when nothing. */
export function statedHealthcareOf(inputs: ExtractedRetirementInputs | undefined): StatedHealthcare | undefined {
  if (!inputs) return undefined;
  const healthcare: StatedHealthcare = {
    coverage: inputs.preMedicareCoverage,
    annualPremium: inputs.preMedicareAnnualPremium,
    inSpending: inputs.healthcareInSpending,
  };
  const said = Object.fromEntries(Object.entries(healthcare).filter(([, value]) => value !== undefined)) as StatedHealthcare;
  return Object.keys(said).length > 0 ? said : undefined;
}
