/**
 * A retirement plan from stated figures, for an account with no holdings linked.
 *
 * Ask Linc's retirement projection runs the user's actual holdings through the
 * historical engine, so until something is linked it has nothing to run, and
 * every retirement question used to end on "link an account". That includes
 * the first follow-up of everyone the public retirement calculator sends here:
 * they arrive with an answer the calculator produced from six numbers and a
 * preset mix, ask "what if I retire at 62?", and are refused.
 *
 * The public calculator's engine needs no holdings. It runs the same
 * historical record against a preset mix (`services/retirement-quickplan.ts`),
 * and says so. This registers that run as a calculator, so the follow-up gets
 * the same quality of answer the calculator gave, with the same disclosures,
 * and linking accounts becomes the upgrade it is -- your real mix instead of a
 * preset -- rather than the price of any answer at all.
 *
 * It stands in for the holdings-based projection and never competes with it:
 * once holdings are linked it does not apply, and the real projection answers.
 */

import { createHash } from 'crypto';
import type { FinancialContextSnapshot } from '../openai/types';
import type { CanonicalFact, CanonicalFactUnit } from '../openai/canonical-facts';
import type { ScenarioCalculatorDefinition } from './calculator-registry';
import {
  DEFAULT_ALLOCATION_ID,
  DEFAULT_LIFE_EXPECTANCY,
  DEFAULT_SOCIAL_SECURITY_START_AGE,
  QUICKPLAN_ALLOCATIONS,
  QuickPlanValidationError,
  runRetirementQuickPlan,
  type QuickPlanAllocationId,
  type QuickPlanHousehold,
  type QuickPlanRunner,
  type RetirementQuickPlanRequest,
  type RetirementQuickPlanResult,
} from '../services/retirement-quickplan';
import { presetStandInReason, type PresetStandInReason } from './preset-stand-in';
import { CONVENTIONAL_RETIREMENT_AGE } from '../openai/retirement-inputs';
import { COAST_FIRE_CALCULATOR_ID } from './coast-fire-scenario';
import { balanceBasis, type BalanceBasis } from '../openai/linked-data';
import {
  buildInputRequest,
  type InputRequest,
  type InputRequestSpec,
  type KnownInput,
} from '../openai/input-request';
import {
  describeSavedFigures,
  INCOME_INFLATION_OPTIONS,
  savedChoice,
  savedNumber,
  type IncomeInflation,
  type StatedFigureKey,
} from '../services/stated-figures';
import type { SavableFigure, SaveOfferKey } from '../openai/save-offer';
import {
  benefitAtClaimingAge,
  describeClaimingAdjustment,
  EARLIEST_CLAIMING_AGE,
  LATEST_CREDIT_AGE,
  socialSecurityQuoteAge,
  withClaimedBenefit,
  type ClaimingAdjustment,
} from '../services/social-security-claiming';
import {
  householdTimeline,
  incomeOfStream,
  partnerAgeMissing,
  partnerSavableFigures,
  partnerClaimingAt,
  partnerClaimingUnavailableReason,
  resolvePartner,
} from '../services/household';
import {
  describeHouseholdTimeline,
  describePartnerIncome,
  describeSpousalIncome,
  householdIncomeFactRows,
  householdSocialSecurityFactRows,
  householdTimelineFactRows,
  MISSING_PARTNER_AGE_SENTENCE,
  partnerAgeAt,
  householdInputRequest,
  withPartnerAgeField,
  type PlannedHousehold,
} from '../openai/household-evidence';
import type { RetirementIncomeStream, SpendingFlexibilityOutcome } from '../retirement-analytics/types';
import {
  resolveSpendingFlexibility,
  savableSpendingCut,
  spendingFlexibilityInput,
  type SpendingFlexibilityResolution,
} from '../services/spending-flexibility';
import {
  describeSpendingCut,
  describeSpendingFlexibilityResults,
  spendingFlexibilityFactRows,
} from '../openai/spending-flexibility-evidence';

export const STATED_RETIREMENT_PLAN_CALCULATOR_ID = 'stated_retirement_plan' as const;
export const STATED_RETIREMENT_PLAN_VERSION = 1 as const;

const NUMERIC_FIELDS = [
  'currentAge',
  'retirementAge',
  'investableAssets',
  'annualSpending',
  'annualContributions',
  'socialSecurityAnnual',
  'socialSecurityStartAge',
  'socialSecurityAmountAge',
  'pensionAnnual',
  'pensionStartAge',
  'lifeExpectancy',
] as const;

type NumericField = (typeof NUMERIC_FIELDS)[number];
export type StatedRetirementPlanField = NumericField | 'allocation' | 'pensionInflation';

const ALLOCATION_OPTIONS = ['unspecified', 'conservative', 'balanced', 'growth'] as const;
const PENSION_INFLATION_OPTIONS = ['unspecified', ...INCOME_INFLATION_OPTIONS] as const;
const ALL_FIELDS: readonly StatedRetirementPlanField[] = [...NUMERIC_FIELDS, 'allocation', 'pensionInflation'];
/**
 * Every field the planner fills: the plan's own, and a what-if on when the
 * partner claims, whose figures otherwise come from the retirement inputs.
 */
type PlanSourceField = StatedRetirementPlanField | 'partnerSocialSecurityStartAge';
const SOURCE_FIELDS: readonly PlanSourceField[] = [...ALL_FIELDS, 'partnerSocialSecurityStartAge'];

const NULLABLE_NUMBER = { type: ['number', 'null'] as const };
const NULLABLE_STRING = { type: ['string', 'null'] as const };

const PLANNED_OVERRIDES_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [...SOURCE_FIELDS, 'sources'],
  properties: {
    ...Object.fromEntries(NUMERIC_FIELDS.map((field) => [field, NULLABLE_NUMBER])),
    allocation: { type: 'string', enum: [...ALLOCATION_OPTIONS] },
    pensionInflation: { type: 'string', enum: [...PENSION_INFLATION_OPTIONS] },
    partnerSocialSecurityStartAge: NULLABLE_NUMBER,
    sources: {
      type: 'object',
      additionalProperties: false,
      required: [...SOURCE_FIELDS],
      properties: Object.fromEntries(SOURCE_FIELDS.map((field) => [field, NULLABLE_STRING])),
    },
  },
} as const;

const PLANNED_VARIANT_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['overrides'],
  properties: { overrides: PLANNED_OVERRIDES_JSON_SCHEMA },
} as const;

export const STATED_RETIREMENT_PLAN_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['requested', 'primary', 'comparison'],
  properties: {
    requested: { type: 'boolean' },
    primary: PLANNED_VARIANT_JSON_SCHEMA,
    comparison: PLANNED_VARIANT_JSON_SCHEMA,
  },
} as const;

export interface PlannedStatedRetirementOverrides {
  currentAge?: number;
  retirementAge?: number;
  investableAssets?: number;
  annualSpending?: number;
  annualContributions?: number;
  socialSecurityAnnual?: number;
  socialSecurityStartAge?: number;
  /** The age the user's Social Security figure is for, when they named one. */
  socialSecurityAmountAge?: number;
  pensionAnnual?: number;
  pensionStartAge?: number;
  lifeExpectancy?: number;
  allocation?: QuickPlanAllocationId;
  pensionInflation?: IncomeInflation;
  /** A what-if on when the partner claims Social Security, at their age; their benefit moves by the claiming rules. */
  partnerSocialSecurityStartAge?: number;
  sources: Partial<Record<PlanSourceField, string>>;
}

export interface StatedRetirementPlan {
  requested: true;
  primary: { overrides?: PlannedStatedRetirementOverrides };
  comparison?: { overrides: PlannedStatedRetirementOverrides };
}

/**
 * Where a value came from: the user's words, the investment total or current
 * spending Linc holds (`basis` says whether linked accounts -- a balance with
 * no holdings itemized -- or the user's own entries), an age the user told
 * Linc earlier, a figure from the plan they saved in Your numbers, or the
 * public calculator's named default.
 */
export type StatedRetirementAssumptionOrigin = 'user' | 'snapshot' | 'profile' | 'saved' | 'default';

export interface StatedRetirementAssumption {
  key: StatedRetirementPlanField;
  label: string;
  value: number | string;
  origin: StatedRetirementAssumptionOrigin;
  source?: string;
  /**
   * For a `snapshot` value: whether it came from linked accounts, from figures
   * the user entered on the Finances page, or both. Absent on executions
   * recorded before it, which were all read as linked.
   */
  basis?: BalanceBasis;
  /** For a `saved` value: when the user saved it in Your numbers. */
  savedAt?: string;
}

export interface StatedRetirementAlternative {
  id: string;
  label: string;
  retirementAge: number;
  annualSpending: number;
  survivalRate: number;
  projectedPortfolioAtRetirement: number;
}

export interface StatedRetirementPlanResult {
  id: string;
  label: string;
  /**
   * `plan` evaluated a spending level. `rates` had none to evaluate -- nobody
   * stated one and nothing linked says what the user spends -- so instead of
   * a verdict it reports what the mix sustained, which still answers "how
   * much could I spend?".
   */
  mode: 'plan' | 'rates';
  assumptions: StatedRetirementAssumption[];
  inputs: RetirementQuickPlanResult['inputs'];
  allocation: {
    id: QuickPlanAllocationId;
    label: string;
    description: string;
    usEquityPercent: number;
    bondsPercent: number;
    cashPercent: number;
  };
  history: Pick<RetirementQuickPlanResult['history'],
    'firstStartMonth' | 'lastStartMonth' | 'sequencesTested' | 'horizonYears'>;
  /** The verdict on the stated spending level; absent in `rates` mode. */
  outcome?: {
    survivalRate: number;
    sequencesTested: number;
    sequencesSurvived: number;
    projectedPortfolioAtRetirement: number;
    firstYearPortfolioWithdrawal: number;
    firstYearWithdrawalRate: number;
    depletionYears: { p10: number | null; p25: number | null; p50: number | null } | null;
  };
  /** Annual spending, in today's dollars, the mix sustained in history. */
  sustainableSpending?: { p10: number; p50: number };
  /** The engine's fixed levers -- retiring later, spending less -- for the primary case only. */
  alternatives?: StatedRetirementAlternative[];
  /**
   * Set when the Social Security figure was for another claiming age and the
   * run claims at this one: `inputs.socialSecurityAnnual` is then the benefit
   * by Social Security's claiming rules, and this names both.
   */
  claiming?: ClaimingAdjustment;
  /**
   * The partner the run planned for as well: their figures, the joint
   * timeline, every income it counted on the user's ages, and the survivor's
   * spending when the user said it. `inputs.lifeExpectancy` stays the user's own.
   */
  household?: PlannedHousehold & {
    incomeStreams: RetirementIncomeStream[];
    survivorSpending?: { fromAge: number; annualAmount: number };
  };
  /** Set when a partner's incomes are known but not their age, so they were left out. */
  missingPartnerAge?: true;
  /**
   * Spending flexibility: how the run treated a cut in a bad market (the
   * user's, a stated inability to cut, or the comparison), and what the cut
   * did. Absent on runs recorded before spending flexibility, and in `rates`
   * mode, which has no spending to cut.
   */
  spendingFlexibility?: {
    resolution: SpendingFlexibilityResolution;
    outcome?: SpendingFlexibilityOutcome;
    comparison?: SpendingFlexibilityOutcome;
  };
}

export interface CompletedStatedRetirementPlanExecution {
  version: number;
  calculator: typeof STATED_RETIREMENT_PLAN_CALCULATOR_ID;
  status: 'completed';
  computedAt: string;
  durationMs: number;
  scenarios: StatedRetirementPlanResult[];
  comparisonUnavailableReason?: string;
  /** What the preset stood in for: no holdings, or linked holdings none of which can be simulated. */
  standInFor: PresetStandInReason;
}

export interface UnavailableStatedRetirementPlanExecution {
  version: number;
  calculator: typeof STATED_RETIREMENT_PLAN_CALCULATOR_ID;
  status: 'unavailable';
  computedAt: string;
  durationMs: number;
  reason: string;
  /** In the user's terms, when the only obstacle is a figure nobody stated. */
  missingInputs?: string[];
  /** The same figures by field, for the form that asks for them. */
  missingFields?: StatedRetirementPlanField[];
  /** What was already known when they were found missing, so the form can show it. */
  knownInputs?: KnownInput[];
  /** A partner to plan for whose age is not known either, so the form asks for it too. */
  partnerAgeMissing?: true;
  standInFor?: PresetStandInReason;
}

export type StatedRetirementPlanExecution =
  | CompletedStatedRetirementPlanExecution
  | UnavailableStatedRetirementPlanExecution;

export type { QuickPlanRunner };

/** The public calculator's own bounds, so a follow-up accepts what the page accepted. */
const RANGES: Record<NumericField, { minimum: number; maximum: number; integer?: boolean }> = {
  currentAge: { minimum: 18, maximum: 90, integer: true },
  retirementAge: { minimum: 30, maximum: 95, integer: true },
  investableAssets: { minimum: 1_000, maximum: 100_000_000 },
  annualSpending: { minimum: 1_000, maximum: 10_000_000 },
  annualContributions: { minimum: 0, maximum: 5_000_000 },
  socialSecurityAnnual: { minimum: 0, maximum: 250_000 },
  socialSecurityStartAge: { minimum: 50, maximum: 80, integer: true },
  // Ages a retirement benefit can be claimed at, and so be quoted for.
  socialSecurityAmountAge: { minimum: EARLIEST_CLAIMING_AGE, maximum: LATEST_CREDIT_AGE, integer: true },
  pensionAnnual: { minimum: 0, maximum: 10_000_000 },
  pensionStartAge: { minimum: 30, maximum: 95, integer: true },
  lifeExpectancy: { minimum: 60, maximum: 110, integer: true },
};

const LABELS: Record<StatedRetirementPlanField, string> = {
  currentAge: 'Current age',
  retirementAge: 'Retirement age',
  investableAssets: 'Invested today',
  annualSpending: 'Annual spending in retirement, in today\'s dollars',
  annualContributions: 'Annual saving until retirement, in today\'s dollars',
  socialSecurityAnnual: 'Annual Social Security, in today\'s dollars',
  socialSecurityStartAge: 'Social Security start age',
  socialSecurityAmountAge: 'Age your Social Security figure is for',
  pensionAnnual: 'Pension or other income a year',
  pensionStartAge: 'Pension start age',
  pensionInflation: 'Whether the pension rises with inflation',
  lifeExpectancy: 'Planning horizon age',
  allocation: 'Preset asset mix',
};

/** How a figure taken from Your numbers is named in the disclosure. */
const SAVED_PHRASES: Partial<Record<StatedRetirementPlanField, (value: number | string) => string>> = {
  retirementAge: (value) => `retiring at ${value}`,
  annualSpending: (value) => `spending ${money(Number(value))} a year in retirement`,
  annualContributions: (value) => `saving ${money(Number(value))} a year until then`,
  socialSecurityAnnual: (value) => `${money(Number(value))} a year of Social Security`,
  socialSecurityStartAge: (value) => `Social Security from ${value}`,
  pensionAnnual: (value) => `a pension of ${money(Number(value))} a year`,
  pensionStartAge: (value) => `the pension from ${value}`,
  pensionInflation: (value) => value === 'rises_with_inflation'
    ? 'the pension rising with inflation'
    : 'the pension as a fixed amount',
  lifeExpectancy: (value) => `planning through age ${value}`,
  allocation: (value) => `the ${QUICKPLAN_ALLOCATIONS[value as QuickPlanAllocationId]?.label ?? value} preset`,
};

/**
 * The two figures nothing can stand in for. A retirement age has a
 * conventional default and spending has the user's current spending or the
 * sustained-spending answer; how much someone has and how old they are have
 * neither.
 */
const MISSING_INPUT_PROMPTS: Partial<Record<StatedRetirementPlanField, string>> = {
  investableAssets: 'roughly how much you have invested today',
  currentAge: 'your current age',
};

function finiteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function shortSource(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const source = value
    .replace(/[^\p{L}\p{N} $.,%'’/+-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return source ? source.slice(0, 160) : undefined;
}

function isAllocationId(value: unknown): value is QuickPlanAllocationId {
  return typeof value === 'string' && value in QUICKPLAN_ALLOCATIONS;
}

function isIncomeInflation(value: unknown): value is IncomeInflation {
  return typeof value === 'string' && (INCOME_INFLATION_OPTIONS as readonly string[]).includes(value);
}

function parseOverrides(value: unknown): PlannedStatedRetirementOverrides | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const rawSources = record.sources && typeof record.sources === 'object' && !Array.isArray(record.sources)
    ? record.sources as Record<string, unknown>
    : {};
  const overrides: PlannedStatedRetirementOverrides = { sources: {} };

  for (const field of NUMERIC_FIELDS) {
    const numericValue = finiteNumber(record[field]);
    const source = shortSource(rawSources[field]);
    const range = RANGES[field];
    if (
      numericValue === undefined ||
      numericValue < range.minimum ||
      numericValue > range.maximum ||
      (range.integer && !Number.isInteger(numericValue)) ||
      !source
    ) {
      continue;
    }
    overrides[field] = numericValue;
    overrides.sources[field] = source;
  }
  const allocationSource = shortSource(rawSources.allocation);
  if (isAllocationId(record.allocation) && allocationSource) {
    overrides.allocation = record.allocation;
    overrides.sources.allocation = allocationSource;
  }
  const pensionInflationSource = shortSource(rawSources.pensionInflation);
  if (isIncomeInflation(record.pensionInflation) && pensionInflationSource) {
    overrides.pensionInflation = record.pensionInflation;
    overrides.sources.pensionInflation = pensionInflationSource;
  }
  // An age a partner's retirement benefit can be claimed at, like the user's own.
  const partnerClaimAge = finiteNumber(record.partnerSocialSecurityStartAge);
  const partnerClaimSource = shortSource(rawSources.partnerSocialSecurityStartAge);
  if (
    partnerClaimAge !== undefined && partnerClaimSource && Number.isInteger(partnerClaimAge) &&
    partnerClaimAge >= EARLIEST_CLAIMING_AGE && partnerClaimAge <= RANGES.socialSecurityStartAge.maximum
  ) {
    overrides.partnerSocialSecurityStartAge = partnerClaimAge;
    overrides.sources.partnerSocialSecurityStartAge = partnerClaimSource;
  }

  return SOURCE_FIELDS.some((field) => overrides[field] !== undefined) ? overrides : undefined;
}

/** Validate the semantic planner result without reading numbers out of prose. */
export function parseStatedRetirementPlan(value: unknown): StatedRetirementPlan | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  if (record.requested !== true) return undefined;
  const asRecord = (item: unknown) => item && typeof item === 'object' && !Array.isArray(item)
    ? item as Record<string, unknown>
    : undefined;
  const primary = asRecord(record.primary);
  if (!primary) return undefined;
  const primaryOverrides = parseOverrides(primary.overrides);
  const comparison = asRecord(record.comparison);
  const comparisonOverrides = comparison ? parseOverrides(comparison.overrides) : undefined;
  return {
    requested: true,
    // A request with nothing stated yet is still a request: the runner asks
    // for the figures instead of the question ending on "link an account".
    primary: primaryOverrides ? { overrides: primaryOverrides } : {},
    ...(comparisonOverrides && { comparison: { overrides: comparisonOverrides } }),
  };
}

/**
 * Only an account the holdings-based projection cannot run for needs a
 * stand-in: nothing linked, or nothing linked that the engine can simulate.
 */
export function statedRetirementPlanApplies(snapshot: FinancialContextSnapshot): boolean {
  return presetStandInReason(snapshot) !== null;
}

function layer(
  base: PlannedStatedRetirementOverrides,
  top: PlannedStatedRetirementOverrides | undefined
): PlannedStatedRetirementOverrides {
  if (!top) return base;
  const merged: PlannedStatedRetirementOverrides = { ...base, sources: { ...base.sources } };
  for (const field of SOURCE_FIELDS) {
    const value = top[field];
    const source = top.sources[field];
    if (value === undefined || !source) continue;
    (merged as unknown as Record<string, unknown>)[field] = value;
    merged.sources[field] = source;
  }
  return merged;
}

interface ResolvedVariant {
  /** No spending level runs the engine in `rates` mode. */
  request: Omit<Required<RetirementQuickPlanRequest>, 'annualSpending'> & { annualSpending?: number };
  assumptions: StatedRetirementAssumption[];
  /** The Social Security figure as given and the age it is for, before any claiming rule. */
  socialSecurityQuote?: { amount: number; age: number };
  claiming?: ClaimingAdjustment;
  /** A partner to plan for as well, on this case's ages. */
  household?: PlannedHousehold;
  missingPartnerAge?: true;
  /** When the user claims Social Security and whether their own benefit is known, for a spousal benefit. */
  userSocialSecurity: { claimAge: number; known: boolean };
  /** How much the user could cut in a bad market, or the comparison; absent without a spending level. */
  spendingFlexibility?: SpendingFlexibilityResolution;
  /** Why a what-if on when the partner claims could not move them; the case then cannot run as asked. */
  partnerClaimingUnavailable?: string;
}

/**
 * Fill each input from the user's words, then from what Linc already holds,
 * then from the public calculator's named defaults -- never the four figures
 * the verdict is about. The quick plan will assume a horizon convention and a
 * preset mix; it will not assume how much someone has, spends, or how old they
 * are, and neither does this.
 */
function resolveVariant(
  snapshot: FinancialContextSnapshot,
  overrides: PlannedStatedRetirementOverrides,
  /** For a comparison that only moves the claiming age: the age the main case's figure was for. */
  inheritedQuoteAge?: number
): ResolvedVariant | { missing: string[]; missingFields: StatedRetirementPlanField[]; known: KnownInput[] } {
  const assumptions: StatedRetirementAssumption[] = [];
  const missing: string[] = [];
  const missingFields: StatedRetirementPlanField[] = [];
  const take = <T extends number | string>(
    field: StatedRetirementPlanField,
    fallback?: {
      value: T;
      origin: Exclude<StatedRetirementAssumptionOrigin, 'user'>;
      basis?: BalanceBasis;
      savedAt?: string;
    }
  ): T | undefined => {
    const stated = overrides[field] as T | undefined;
    const source = overrides.sources[field];
    if (stated !== undefined && source) {
      assumptions.push({ key: field, label: LABELS[field], value: stated, origin: 'user', source });
      return stated;
    }
    if (fallback) {
      assumptions.push({
        key: field,
        label: LABELS[field],
        value: fallback.value,
        origin: fallback.origin,
        ...(fallback.basis && { basis: fallback.basis }),
        ...(fallback.savedAt && { savedAt: fallback.savedAt }),
      });
      return fallback.value;
    }
    const prompt = MISSING_INPUT_PROMPTS[field];
    if (prompt) {
      missing.push(prompt);
      missingFields.push(field);
    }
    return undefined;
  };

  // The plan the user saved in Your numbers stands in after anything they
  // said in this decision and before what accounts or defaults would give.
  const saved = (key: StatedFigureKey) => {
    const figure = savedNumber(snapshot.statedFigures, key);
    return figure && { value: figure.value, origin: 'saved' as const, savedAt: figure.savedAt };
  };
  const savedMix = savedChoice(snapshot.statedFigures, 'allocation');
  const savedInflationChoice = savedChoice(snapshot.statedFigures, 'retirementIncomeInflation');
  const savedPensionInflation = savedInflationChoice && isIncomeInflation(savedInflationChoice.value)
    ? { value: savedInflationChoice.value, savedAt: savedInflationChoice.savedAt }
    : undefined;
  // The pension the form would open on: what the user said here, else saved.
  const savedPensionAmount = (known: KnownInput[]): number => {
    const held = known.find((input) => input.key === 'pensionAnnual')?.value;
    return typeof held === 'number' ? held : 0;
  };
  const profileAge = snapshot.userProfileValues?.age;
  const knownAge = typeof profileAge === 'number' && Number.isInteger(profileAge) &&
    profileAge >= RANGES.currentAge.minimum && profileAge <= RANGES.currentAge.maximum
    ? profileAge
    : undefined;
  const investmentTotal = snapshot.financialSummary?.financialOverview?.totalInvestments;
  const knownAssets = typeof investmentTotal === 'number' && Number.isFinite(investmentTotal) &&
    investmentTotal >= RANGES.investableAssets.minimum && investmentTotal <= RANGES.investableAssets.maximum
    ? investmentTotal
    : undefined;
  const assetsBasis = balanceBasis(snapshot.linkedData, 'investments') ?? 'linked';
  // A spending override is the figure the user set on the Finances page.
  const spendingBasis: BalanceBasis = snapshot.expectedMonthly?.spendingSource === 'override' ? 'entered' : 'linked';

  // Already null where nothing linked could say what the user spends.
  const monthlySpending = snapshot.expectedMonthly?.spending;
  const annualFromCashFlow = typeof monthlySpending === 'number' && Number.isFinite(monthlySpending)
    ? Math.round(monthlySpending * 12)
    : undefined;
  const knownSpending = annualFromCashFlow !== undefined &&
    annualFromCashFlow >= RANGES.annualSpending.minimum && annualFromCashFlow <= RANGES.annualSpending.maximum
    ? annualFromCashFlow
    : undefined;

  const investableAssets = take<number>(
    'investableAssets',
    knownAssets !== undefined ? { value: knownAssets, origin: 'snapshot', basis: assetsBasis } : undefined
  );
  const currentAge = take<number>(
    'currentAge',
    knownAge !== undefined ? { value: knownAge, origin: 'profile' } : undefined
  );
  if (missing.length > 0) {
    // Everything else the user stated, and the spending their accounts or
    // Finances page show, so the form opens on what Linc already holds.
    // Defaults are left out: a blank field already means the default.
    const known: KnownInput[] = assumptions.map((assumption) => ({
      key: assumption.key,
      value: assumption.value,
      origin: assumption.origin as KnownInput['origin'],
      ...(assumption.basis && { basis: assumption.basis }),
    }));
    for (const field of ALL_FIELDS) {
      const stated = overrides[field];
      if (stated !== undefined && overrides.sources[field] && !known.some((input) => input.key === field)) {
        known.push({ key: field, value: stated, origin: 'user' });
      }
    }
    // What Your numbers holds for the rest, unless the user said otherwise here.
    // Same filters as the completed path: a saved retirement age already reached,
    // a horizon that would not outlast retirement, or a claiming age with no
    // benefit must not prefill the form (submitting them would re-state junk).
    const savedFor: Partial<Record<StatedRetirementPlanField, StatedFigureKey>> = {
      retirementAge: 'retirementAge',
      annualSpending: 'annualRetirementSpending',
      annualContributions: 'annualContribution',
      socialSecurityAnnual: 'socialSecurityAnnual',
      socialSecurityStartAge: 'socialSecurityStartAge',
      pensionAnnual: 'retirementIncome',
      pensionStartAge: 'retirementIncomeStartAge',
      lifeExpectancy: 'planThroughAge',
    };
    const usableSavedRetirementAge = (() => {
      const figure = saved('retirementAge');
      if (!figure) return undefined;
      if (currentAge !== undefined && figure.value <= currentAge) return undefined;
      return figure.value;
    })();
    const knownNumber = (field: StatedRetirementPlanField): number | undefined => {
      const held = known.find((input) => input.key === field)?.value;
      return typeof held === 'number' ? held : undefined;
    };
    for (const [field, key] of Object.entries(savedFor) as Array<[StatedRetirementPlanField, StatedFigureKey]>) {
      const figure = saved(key);
      if (!figure || known.some((input) => input.key === field)) continue;
      if (field === 'retirementAge' && usableSavedRetirementAge === undefined) continue;
      if (field === 'lifeExpectancy') {
        const retirementAgeForHorizon =
          knownNumber('retirementAge') ??
          (overrides.retirementAge !== undefined && overrides.sources.retirementAge
            ? overrides.retirementAge
            : undefined) ??
          usableSavedRetirementAge;
        if (retirementAgeForHorizon !== undefined && figure.value <= retirementAgeForHorizon) continue;
      }
      if (field === 'socialSecurityStartAge') {
        const benefit =
          knownNumber('socialSecurityAnnual') ??
          (overrides.socialSecurityAnnual !== undefined && overrides.sources.socialSecurityAnnual
            ? overrides.socialSecurityAnnual
            : undefined) ??
          saved('socialSecurityAnnual')?.value;
        if (!(typeof benefit === 'number' && benefit > 0)) continue;
      }
      if (field === 'pensionStartAge' && !(savedPensionAmount(known) > 0)) continue;
      known.push({ key: field, value: figure.value, origin: 'saved' });
    }
    if (savedMix && !known.some((input) => input.key === 'allocation')) {
      known.push({ key: 'allocation', value: savedMix.value, origin: 'saved' });
    }
    // Like a start age, how a pension keeps up with prices means nothing
    // without a pension behind it.
    if (
      savedPensionInflation &&
      savedPensionAmount(known) > 0 &&
      !known.some((input) => input.key === 'pensionInflation')
    ) {
      known.push({ key: 'pensionInflation', value: savedPensionInflation.value, origin: 'saved' });
    }
    if (knownSpending !== undefined && !known.some((input) => input.key === 'annualSpending')) {
      known.push({ key: 'annualSpending', value: knownSpending, origin: 'snapshot', basis: spendingBasis });
    }
    return { missing, missingFields, known };
  }
  // A saved retirement age the user has already reached is no plan for the
  // future; then the conventional planning age, or now for someone past it.
  const savedRetirementAge = saved('retirementAge');
  const retirementAge = take<number>(
    'retirementAge',
    savedRetirementAge && savedRetirementAge.value > currentAge!
      ? savedRetirementAge
      : { value: Math.max(currentAge!, CONVENTIONAL_RETIREMENT_AGE), origin: 'default' }
  )!;
  // The spending the user planned for, then what they spend now when their
  // accounts say; otherwise no spending level at all, and the engine answers
  // with what the mix sustained.
  const annualSpending = take<number>(
    'annualSpending',
    saved('annualRetirementSpending') ??
      (knownSpending !== undefined ? { value: knownSpending, origin: 'snapshot', basis: spendingBasis } : undefined)
  );

  const annualContributions = take<number>(
    'annualContributions',
    saved('annualContribution') ?? { value: 0, origin: 'default' }
  )!;
  const statedSocialSecurity = take<number>(
    'socialSecurityAnnual',
    saved('socialSecurityAnnual') ?? { value: 0, origin: 'default' }
  )!;
  // A claiming age with no benefit behind it is only the form's default, and
  // listing it would narrate money this plan does not contain.
  const socialSecurityStartAge = statedSocialSecurity > 0
    ? take<number>(
      'socialSecurityStartAge',
      saved('socialSecurityStartAge') ?? { value: DEFAULT_SOCIAL_SECURITY_START_AGE, origin: 'default' }
    )!
    : DEFAULT_SOCIAL_SECURITY_START_AGE;
  // A benefit belongs to an age. Claimed at another, it is the benefit Social
  // Security's own rules pay there, not the same amount started later.
  const socialSecurityQuote = statedSocialSecurity > 0
    ? {
      amount: statedSocialSecurity,
      age: socialSecurityQuoteAge({
        namedAge: take<number>('socialSecurityAmountAge'),
        inheritedAge: inheritedQuoteAge,
        ...(assumptions.find((assumption) => assumption.key === 'socialSecurityAnnual')?.origin === 'saved' && {
          saved: {
            startAge: saved('socialSecurityStartAge')?.value,
            defaultStartAge: DEFAULT_SOCIAL_SECURITY_START_AGE,
          },
        }),
        claimAge: socialSecurityStartAge,
      }),
    }
    : undefined;
  const claiming = socialSecurityQuote
    ? benefitAtClaimingAge({
      amount: socialSecurityQuote.amount,
      quotedAtAge: socialSecurityQuote.age,
      claimAge: socialSecurityStartAge,
      currentAge: currentAge!,
    })
    : null;
  const socialSecurityAnnual = claiming?.amount ?? statedSocialSecurity;
  // A pension most often starts when work stops, and most private pensions
  // pay a fixed amount; overstating future income is the costlier mistake.
  // Like Social Security's start age, neither is listed without a pension.
  const pensionAnnual = take<number>(
    'pensionAnnual',
    saved('retirementIncome') ?? { value: 0, origin: 'default' }
  )!;
  const pensionStartAge = pensionAnnual > 0
    ? take<number>(
      'pensionStartAge',
      saved('retirementIncomeStartAge') ?? { value: retirementAge, origin: 'default' }
    )!
    : retirementAge;
  const pensionInflation = pensionAnnual > 0
    ? take<IncomeInflation>(
      'pensionInflation',
      savedPensionInflation
        ? { value: savedPensionInflation.value, origin: 'saved', savedAt: savedPensionInflation.savedAt }
        : { value: 'fixed', origin: 'default' }
    )!
    : 'fixed';
  // A saved horizon the retirement would already run past is not used.
  const savedHorizon = saved('planThroughAge');
  const lifeExpectancy = take<number>(
    'lifeExpectancy',
    savedHorizon && savedHorizon.value > retirementAge
      ? savedHorizon
      : { value: Math.max(DEFAULT_LIFE_EXPECTANCY, retirementAge + 1), origin: 'default' }
  )!;
  const allocation = take<QuickPlanAllocationId>(
    'allocation',
    savedMix && savedMix.value in QUICKPLAN_ALLOCATIONS
      ? { value: savedMix.value as QuickPlanAllocationId, origin: 'saved', savedAt: savedMix.savedAt }
      : { value: DEFAULT_ALLOCATION_ID, origin: 'default' }
  )!;

  // A partner, the same in every case, timed on this case's ages: their
  // incomes, a plan that runs until the later of the two planning ages, the
  // survivor years, and, married, spousal and survivor benefits. Without
  // their age their incomes cannot be timed.
  const partner = resolvePartner({
    stated: snapshot.statedPartner,
    statedFigures: snapshot.statedFigures,
    retirementAge,
    currentAge: currentAge!,
    ...(snapshot.userProfileValues?.householdStatus && { householdStatus: snapshot.userProfileValues.householdStatus }),
  });
  // How much the user could cut in a bad market, the same in every case; the
  // comparison runs only when nobody has said. Nothing to cut without a
  // spending level.
  const spendingFlexibility = resolveSpendingFlexibility({
    stated: snapshot.statedSpendingCut,
    statedFigures: snapshot.statedFigures,
    annualSpending,
  });
  // A spousal benefit needs to know when the user claims and whether their
  // own benefit is known (a stated zero is), even with none of their own.
  const userSocialSecurity = {
    claimAge: statedSocialSecurity > 0
      ? socialSecurityStartAge
      : (overrides.socialSecurityStartAge !== undefined && overrides.sources.socialSecurityStartAge
        ? overrides.socialSecurityStartAge
        : saved('socialSecurityStartAge')?.value) ?? DEFAULT_SOCIAL_SECURITY_START_AGE,
    known: assumptions.find((assumption) => assumption.key === 'socialSecurityAnnual')?.origin !== 'default',
  };
  // "What if my partner claims at 70?" moves their benefit by the same rules.
  const partnerClaimAge = overrides.sources.partnerSocialSecurityStartAge
    ? overrides.partnerSocialSecurityStartAge
    : undefined;
  const knownPartner = partner && !('missingAge' in partner) ? partner : undefined;
  const partnerClaimingUnavailable = partnerClaimAge !== undefined
    ? partnerClaimingUnavailableReason(knownPartner, partnerClaimAge)
    : undefined;
  const planned = knownPartner && partnerClaimAge !== undefined && !partnerClaimingUnavailable
    ? partnerClaimingAt(knownPartner, partnerClaimAge)
    : knownPartner;
  const household: PlannedHousehold | undefined = planned
    ? {
      ...planned,
      timeline: householdTimeline({ currentAge: currentAge!, userPlanThroughAge: lifeExpectancy, partner: planned.plan }),
    }
    : undefined;

  return {
    request: {
      currentAge: currentAge!,
      retirementAge,
      investableAssets: investableAssets!,
      ...(annualSpending !== undefined && { annualSpending }),
      annualContributions,
      socialSecurityAnnual,
      socialSecurityStartAge,
      pensionAnnual,
      pensionStartAge,
      pensionInflationAdjusted: pensionInflation === 'rises_with_inflation',
      lifeExpectancy,
      allocation,
    },
    assumptions,
    ...(socialSecurityQuote && { socialSecurityQuote }),
    ...(claiming && { claiming }),
    ...(household && { household }),
    ...(partner && 'missingAge' in partner && { missingPartnerAge: true as const }),
    userSocialSecurity,
    ...(spendingFlexibility && { spendingFlexibility }),
    ...(partnerClaimingUnavailable && { partnerClaimingUnavailable }),
  };
}

function money(value: number): string {
  return `$${Math.round(value).toLocaleString('en-US')}`;
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/** Mid-sentence, a label keeps its proper nouns: "claiming Social Security at 70". */
function decapitalize(value: string): string {
  return value.charAt(0).toLowerCase() + value.slice(1);
}

function describeField(field: StatedRetirementPlanField, value: number | string): string {
  switch (field) {
    case 'currentAge': return `age ${value}`;
    case 'retirementAge': return `retiring at ${value}`;
    case 'investableAssets': return `${money(Number(value))} invested`;
    case 'annualSpending': return `spending ${money(Number(value))} a year`;
    case 'annualContributions': return `saving ${money(Number(value))} a year`;
    case 'socialSecurityAnnual': return `${money(Number(value))} a year of Social Security`;
    case 'socialSecurityStartAge': return `claiming Social Security at ${value}`;
    case 'socialSecurityAmountAge': return `a Social Security figure for ${value}`;
    case 'pensionAnnual': return `a ${money(Number(value))} pension`;
    case 'pensionStartAge': return `the pension from ${value}`;
    case 'pensionInflation': return value === 'rises_with_inflation'
      ? 'a pension that rises with inflation'
      : 'a fixed pension';
    case 'lifeExpectancy': return `planning through ${value}`;
    case 'allocation': return `the ${QUICKPLAN_ALLOCATIONS[value as QuickPlanAllocationId]?.label ?? value} mix`;
  }
}

/**
 * A field's value as the run used it. The request carries the inflation
 * choice as a flag, and a pension's terms mean nothing without a pension: its
 * start age follows the retirement age then, which is no difference to name.
 */
function requestValue(variant: ResolvedVariant, field: StatedRetirementPlanField): number | string | undefined {
  const hasPension = variant.request.pensionAnnual > 0;
  if (field === 'pensionInflation') {
    if (!hasPension) return undefined;
    return variant.request.pensionInflationAdjusted ? 'rises_with_inflation' : 'fixed';
  }
  if ((field === 'pensionAnnual' || field === 'pensionStartAge') && !hasPension) return undefined;
  return (variant.request as unknown as Record<string, number | string | undefined>)[field];
}

/** The same benefit in both cases, so any difference in its amount is the claiming rule. */
function sameSocialSecurityQuote(own: ResolvedVariant, peer: ResolvedVariant): boolean {
  return own.socialSecurityQuote !== undefined &&
    own.socialSecurityQuote.amount === peer.socialSecurityQuote?.amount &&
    own.socialSecurityQuote.age === peer.socialSecurityQuote.age;
}

function variantLabel(own: ResolvedVariant, peer: ResolvedVariant | undefined): string {
  if (!peer) return 'Your plan';
  const differing = ALL_FIELDS.filter((field) =>
    requestValue(own, field) !== requestValue(peer, field) &&
    !(field === 'socialSecurityAnnual' && sameSocialSecurityQuote(own, peer))
  );
  const described = differing
    .filter((field) => requestValue(own, field) !== undefined)
    .slice(0, 2)
    .map((field) => describeField(field, requestValue(own, field)!));
  const partnerClaimAge = own.household?.plan.socialSecurityClaimAge;
  if (described.length < 2 && partnerClaimAge !== undefined && partnerClaimAge !== peer.household?.plan.socialSecurityClaimAge) {
    described.push(`your partner claiming Social Security at ${partnerClaimAge}`);
  }
  return described.length > 0 ? capitalize(described.join(' and ')) : 'Your plan';
}

/** What a run depends on: the request, and the partner when there is one. */
function runInputs(variant: ResolvedVariant): Record<string, unknown> {
  return {
    ...variant.request,
    spendingCut: variant.spendingFlexibility?.kind === 'cut' ? variant.spendingFlexibility.cutShare : null,
    ...(variant.household && {
      partner: variant.household.plan,
      married: variant.household.married?.value ?? null,
      userSocialSecurity: variant.userSocialSecurity,
    }),
  };
}

/** The household as the quick plan takes it. */
function quickPlanHousehold(variant: ResolvedVariant): QuickPlanHousehold | undefined {
  const household = variant.household;
  if (!household) return undefined;
  return {
    partner: household.plan,
    origins: household.origins,
    ...(household.married && { married: household.married }),
    userSocialSecurity: variant.userSocialSecurity,
  };
}

function requestKey(variant: ResolvedVariant): string {
  return JSON.stringify(runInputs(variant));
}

function scenarioId(variant: ResolvedVariant): string {
  const digest = createHash('sha256')
    .update(JSON.stringify({ version: STATED_RETIREMENT_PLAN_VERSION, ...runInputs(variant) }))
    .digest('hex')
    .slice(0, 16);
  return `stated_retirement_plan_${digest}`;
}

function unavailable(
  startedAt: number,
  reason: string,
  missing?: { prompts: string[]; fields: StatedRetirementPlanField[]; known: KnownInput[]; partnerAgeMissing?: boolean },
  standInFor?: PresetStandInReason
): UnavailableStatedRetirementPlanExecution {
  return {
    version: STATED_RETIREMENT_PLAN_VERSION,
    calculator: STATED_RETIREMENT_PLAN_CALCULATOR_ID,
    status: 'unavailable',
    computedAt: new Date().toISOString(),
    durationMs: Date.now() - startedAt,
    reason,
    ...(missing && missing.prompts.length > 0 && {
      missingInputs: missing.prompts,
      missingFields: missing.fields,
      ...(missing.known.length > 0 && { knownInputs: missing.known }),
      ...(missing.partnerAgeMissing && { partnerAgeMissing: true as const }),
    }),
    ...(standInFor && { standInFor }),
  };
}

function joinList(items: string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`;
}

function toResult(
  variant: ResolvedVariant,
  label: string,
  run: RetirementQuickPlanResult,
  includeAlternatives: boolean
): StatedRetirementPlanResult {
  // With a spending level the quick plan evaluates the plan; without one it
  // answers in `rates` mode and `primary` is null by design.
  const evaluated = run.primary;
  if (variant.request.annualSpending !== undefined && !evaluated) {
    throw new Error('The retirement engine did not evaluate the stated plan.');
  }
  const allocation = QUICKPLAN_ALLOCATIONS[run.inputs.allocation];
  return {
    id: scenarioId(variant),
    label,
    mode: evaluated ? 'plan' : 'rates',
    assumptions: variant.assumptions,
    inputs: run.inputs,
    allocation: {
      id: allocation.id,
      label: allocation.label,
      description: allocation.description,
      usEquityPercent: Math.round(allocation.usEquity * 100),
      bondsPercent: Math.round(allocation.bonds * 100),
      cashPercent: Math.round(allocation.cash * 100),
    },
    history: {
      firstStartMonth: run.history.firstStartMonth,
      lastStartMonth: run.history.lastStartMonth,
      sequencesTested: run.history.sequencesTested,
      horizonYears: run.history.horizonYears,
    },
    ...(evaluated && {
      outcome: {
        survivalRate: evaluated.survivalRate,
        sequencesTested: evaluated.sequencesTested,
        sequencesSurvived: evaluated.sequencesSurvived,
        projectedPortfolioAtRetirement: evaluated.projectedPortfolioAtRetirement,
        firstYearPortfolioWithdrawal: evaluated.firstYearPortfolioWithdrawal,
        firstYearWithdrawalRate: evaluated.firstYearWithdrawalRate,
        depletionYears: evaluated.depletionYears,
      },
    }),
    ...(run.sustainableSpending && {
      sustainableSpending: { p10: run.sustainableSpending.p10, p50: run.sustainableSpending.p50 },
    }),
    ...(variant.claiming && { claiming: variant.claiming }),
    ...(variant.household && run.household && {
      household: {
        ...variant.household,
        timeline: run.household.timeline,
        socialSecurity: run.household.socialSecurity,
        incomeStreams: run.household.incomeStreams,
        ...(run.household.survivorSpending && { survivorSpending: run.household.survivorSpending }),
      },
    }),
    ...(variant.missingPartnerAge && { missingPartnerAge: true as const }),
    ...(evaluated && variant.spendingFlexibility && {
      spendingFlexibility: {
        resolution: variant.spendingFlexibility,
        ...(run.spendingFlexibility && { outcome: run.spendingFlexibility }),
        ...(run.spendingFlexibilityComparison && { comparison: run.spendingFlexibilityComparison }),
      },
    }),
    ...(includeAlternatives && run.alternatives.length > 0 && {
      alternatives: run.alternatives.map((alternative) => ({
        id: alternative.id,
        // The engine labels the spending lever as a percentage; the dollar
        // amount is the figure the answer can cite, so the label carries that.
        label: alternative.retirementAge !== run.inputs.retirementAge
          ? `Retiring at ${alternative.retirementAge}`
          : `Spending ${money(alternative.annualSpending)} a year`,
        retirementAge: alternative.retirementAge,
        annualSpending: alternative.annualSpending,
        survivalRate: alternative.survivalRate,
        projectedPortfolioAtRetirement: alternative.projectedPortfolioAtRetirement,
      })),
    }),
  };
}

/** Run the stated plan and, when requested, one comparison case. */
export async function runStatedRetirementPlan(
  snapshot: FinancialContextSnapshot,
  plan: StatedRetirementPlan,
  runQuickPlan: QuickPlanRunner = runRetirementQuickPlan
): Promise<StatedRetirementPlanExecution> {
  const startedAt = Date.now();
  // The registry only runs this where a preset has to stand in; called
  // directly, the conservative reading is that nothing is linked.
  const standInFor = presetStandInReason(snapshot) ?? 'no_holdings';
  const primaryOverrides = layer({ sources: {} }, plan.primary.overrides);
  const layers = [primaryOverrides];
  if (plan.comparison?.overrides) layers.push(layer(primaryOverrides, plan.comparison.overrides));

  // "What if I claim at 70?" moves the main case's benefit to another age; a
  // comparison that names its own figure, or the age it is for, does not.
  const comparisonOwn = plan.comparison?.overrides;
  const comparisonMovesSameBenefit = comparisonOwn !== undefined &&
    comparisonOwn.socialSecurityAnnual === undefined &&
    comparisonOwn.socialSecurityAmountAge === undefined;

  const variants: ResolvedVariant[] = [];
  let partnerClaimingUnavailable: string | undefined;
  for (const [index, overrides] of layers.entries()) {
    const inheritedQuoteAge = index > 0 && comparisonMovesSameBenefit
      ? variants[0]?.socialSecurityQuote?.age
      : undefined;
    const variant = resolveVariant(snapshot, overrides, inheritedQuoteAge);
    // The comparison inherits every primary value, so it can only be missing
    // what the primary was missing.
    if ('missing' in variant) {
      return unavailable(
        startedAt,
        `Missing ${joinList(variant.missing)}.`,
        {
          prompts: variant.missing,
          fields: variant.missingFields,
          known: variant.known,
          partnerAgeMissing: partnerAgeMissing(snapshot.statedPartner, snapshot.statedFigures),
        },
        standInFor
      );
    }
    // A what-if on when the partner claims needs a partner it can move.
    if (variant.partnerClaimingUnavailable) {
      // On the main case the what-if is the ask: refuse rather than answer as
      // if it had never been said. On a comparison, keep the main case.
      if (index === 0) {
        return unavailable(startedAt, variant.partnerClaimingUnavailable, undefined, standInFor);
      }
      partnerClaimingUnavailable = variant.partnerClaimingUnavailable;
      continue;
    }
    if (!variants.some((existing) => requestKey(existing) === requestKey(variant))) variants.push(variant);
  }

  const scenarios: StatedRetirementPlanResult[] = [];
  let comparisonUnavailableReason: string | undefined = partnerClaimingUnavailable;
  for (const [index, variant] of variants.entries()) {
    try {
      // The comparison cut runs beside the main case only.
      const flexibility = spendingFlexibilityInput(variant.spendingFlexibility);
      const run = await runQuickPlan(variant.request as RetirementQuickPlanRequest, quickPlanHousehold(variant), {
        ...(flexibility.spendingFlexibility && { spendingFlexibility: flexibility.spendingFlexibility }),
        ...(index === 0 && flexibility.spendingFlexibilityComparison && {
          spendingFlexibilityComparison: flexibility.spendingFlexibilityComparison,
        }),
      });
      const peer = variants[index === 0 ? 1 : 0];
      scenarios.push(toResult(variant, variantLabel(variant, peer), run, index === 0));
    } catch (error) {
      if (!(error instanceof QuickPlanValidationError)) throw error;
      if (index === 0) return unavailable(startedAt, error.message);
      comparisonUnavailableReason = error.message;
    }
  }

  return {
    version: STATED_RETIREMENT_PLAN_VERSION,
    calculator: STATED_RETIREMENT_PLAN_CALCULATOR_ID,
    status: 'completed',
    computedAt: new Date().toISOString(),
    durationMs: Date.now() - startedAt,
    scenarios,
    ...(comparisonUnavailableReason && { comparisonUnavailableReason }),
    standInFor,
  };
}

function factId(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 80);
}

function roundMoney(value: number): number {
  return Number(value.toFixed(2));
}

function asPercent(fraction: number): number {
  return Number((fraction * 100).toFixed(4));
}

const INPUT_UNITS: Record<NumericField, CanonicalFactUnit> = {
  currentAge: 'age',
  retirementAge: 'age',
  investableAssets: 'usd',
  annualSpending: 'usd',
  annualContributions: 'usd',
  socialSecurityAnnual: 'usd',
  socialSecurityStartAge: 'age',
  socialSecurityAmountAge: 'age',
  pensionAnnual: 'usd',
  pensionStartAge: 'age',
  lifeExpectancy: 'age',
};

/** Convert stated-plan inputs and engine outputs into canonical scenario evidence. */
export function statedRetirementPlanCanonicalFacts(execution: StatedRetirementPlanExecution): CanonicalFact[] {
  if (execution.status !== 'completed') return [];
  const facts: CanonicalFact[] = [];

  for (const scenario of execution.scenarios) {
    const prefix = `stated_retirement_plan_${factId(scenario.id.replace(/^stated_retirement_plan_/, ''))}`;
    const add = (
      kind: 'scenario_input' | 'scenario_calculation',
      suffix: string,
      label: string,
      value: number | null | undefined,
      unit: CanonicalFactUnit,
      subject = scenario.label
    ) => {
      if (typeof value !== 'number' || !Number.isFinite(value)) return;
      facts.push({
        id: `${prefix}_${suffix}`,
        label: `${subject}: ${label}`,
        value,
        unit,
        provenance: {
          kind,
          source: kind === 'scenario_input'
            ? `statedRetirementPlan.${scenario.id}.assumptions`
            : `statedRetirementPlan.${scenario.id}`,
          scenarioId: scenario.id,
          calculatorId: STATED_RETIREMENT_PLAN_CALCULATOR_ID,
          calculatorVersion: execution.version,
        },
      });
    };

    for (const assumption of scenario.assumptions) {
      if (typeof assumption.value !== 'number') continue;
      // Zero contributions, Social Security and pension are defaults, not
      // figures worth quoting back.
      if (assumption.value === 0) continue;
      const key = assumption.key as NumericField;
      // A fixed pension is in the dollars it pays, not today's; the label says
      // which, so the answer cannot restate it in the wrong units. A Social
      // Security figure for another claiming age is not the one this case ran.
      const label = key === 'pensionAnnual'
        ? scenario.inputs.pensionInflationAdjusted
          ? 'Pension or other income a year, in today\'s dollars, rising with inflation'
          : 'Pension or other income a year, a fixed dollar amount that does not rise with inflation'
        : key === 'socialSecurityAnnual' && scenario.claiming
          ? `Annual Social Security as given, for claiming at ${scenario.claiming.fromAge}, in today's dollars`
          : assumption.label;
      add('scenario_input', factId(key), label, assumption.value, INPUT_UNITS[key]);
    }
    if (scenario.claiming) {
      const { claiming } = scenario;
      add('scenario_calculation', 'social_security_at_claiming_age', `Annual Social Security claimed at ${claiming.toAge}, by Social Security's claiming rules, in today's dollars`, claiming.amount, 'usd');
      add('scenario_calculation', 'social_security_claiming_change', `Change in annual Social Security from claiming at ${claiming.toAge} instead of ${claiming.fromAge}`, asPercent(claiming.amount / claiming.fromAmount - 1), 'percent');
    }
    // The partner's incomes, when any income stops, and the couple's timeline.
    if (scenario.household) {
      const rows = [
        ...householdIncomeFactRows(scenario.household.incomeStreams, scenario.household),
        ...householdSocialSecurityFactRows(scenario.household),
        ...householdTimelineFactRows(scenario.household, scenario.household.survivorSpending),
      ];
      for (const row of rows) add('scenario_input', row.suffix, row.label, row.value, row.unit);
    }
    // The user's cut in a bad market and what it did, or the comparison's.
    if (scenario.spendingFlexibility) {
      for (const row of spendingFlexibilityFactRows(scenario.spendingFlexibility)) {
        add(row.input ? 'scenario_input' : 'scenario_calculation', row.suffix, row.label, row.value, row.unit);
      }
    }
    const mix = `${scenario.allocation.label} preset`;
    add('scenario_input', 'us_stock_share', `${mix} share in US stocks`, scenario.allocation.usEquityPercent, 'percent');
    add('scenario_input', 'bond_share', `${mix} share in bonds`, scenario.allocation.bondsPercent, 'percent');
    add('scenario_input', 'cash_share', `${mix} share in cash`, scenario.allocation.cashPercent, 'percent');

    const outcome = scenario.outcome;
    add('scenario_calculation', 'historical_sequences_tested', 'Historical sequences tested', scenario.history.sequencesTested, 'count');
    if (outcome) {
      add('scenario_calculation', 'historical_survival_rate', 'Share of tested historical sequences in which the money lasted', asPercent(outcome.survivalRate), 'percent');
      add('scenario_calculation', 'historical_sequences_survived', 'Historical sequences in which the money lasted', outcome.sequencesSurvived, 'count');
      add('scenario_calculation', 'median_portfolio_at_retirement', 'Median portfolio at retirement across those sequences, in today\'s dollars', roundMoney(outcome.projectedPortfolioAtRetirement), 'usd');
      add('scenario_calculation', 'first_year_portfolio_withdrawal', 'Spending the portfolio itself covers in the first year of retirement', roundMoney(outcome.firstYearPortfolioWithdrawal), 'usd');
      add('scenario_calculation', 'first_year_withdrawal_rate', 'First-year withdrawal rate from the median portfolio', asPercent(outcome.firstYearWithdrawalRate), 'percent');
      for (const percentile of ['p10', 'p25', 'p50'] as const) {
        add(
          'scenario_calculation',
          `depletion_years_${percentile}`,
          `${percentile} years from retirement until the money ran out, among sequences where it did`,
          outcome.depletionYears?.[percentile],
          'years'
        );
      }
    }
    if (scenario.sustainableSpending) {
      add('scenario_calculation', 'sustainable_spending_p10', 'Annual spending this mix sustained in the 10th-percentile sequence, in today\'s dollars', roundMoney(scenario.sustainableSpending.p10), 'usd');
      add('scenario_calculation', 'sustainable_spending_p50', 'Annual spending this mix sustained in the median sequence, in today\'s dollars', roundMoney(scenario.sustainableSpending.p50), 'usd');
    }
    for (const alternative of scenario.alternatives ?? []) {
      const altPrefix = `alternative_${factId(alternative.id)}`;
      // A lever on this plan, with every other input as stated.
      const subject = `${alternative.label} instead, everything else as in ${decapitalize(scenario.label)}`;
      if (alternative.annualSpending !== scenario.inputs.annualSpending) {
        add('scenario_input', `${altPrefix}_annual_spending`, 'annual spending', alternative.annualSpending, 'usd', subject);
      }
      add('scenario_calculation', `${altPrefix}_historical_survival_rate`, 'share of tested sequences in which the money lasted', asPercent(alternative.survivalRate), 'percent', subject);
      add('scenario_calculation', `${altPrefix}_median_portfolio_at_retirement`, 'median portfolio at retirement', roundMoney(alternative.projectedPortfolioAtRetirement), 'usd', subject);
    }
  }
  return facts;
}

export function compactStatedRetirementPlanExecution(
  execution: StatedRetirementPlanExecution
): StatedRetirementPlanExecution {
  return execution;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function readableMonth(month: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  return match ? `${MONTH_NAMES[Number(match[2]) - 1]} ${match[1]}` : month;
}

function assumptionOf(scenario: StatedRetirementPlanResult, key: StatedRetirementPlanField) {
  return scenario.assumptions.find((assumption) => assumption.key === key);
}

/** The pension, and which of its terms were assumed, so they are the easiest to correct. */
function describePension(scenario: StatedRetirementPlanResult): string {
  const inputs = scenario.inputs;
  if (!(inputs.pensionAnnual > 0)) return '';
  const terms = inputs.pensionInflationAdjusted
    ? `${money(inputs.pensionAnnual)} a year in today's dollars starts at ${inputs.pensionStartAge} and rises with inflation`
    : `${money(inputs.pensionAnnual)} a year starts at ${inputs.pensionStartAge} as a fixed amount, so it buys less each year prices rise`;
  const startAssumed = assumptionOf(scenario, 'pensionStartAge')?.origin === 'default'
    ? ' I assumed it starts when you retire.'
    : '';
  const inflationAssumed = assumptionOf(scenario, 'pensionInflation')?.origin === 'default'
    ? ' You did not say whether it rises with inflation, so I assumed it does not; tell me if it has a cost-of-living adjustment.'
    : '';
  return ` ${scenario.household ? 'Your pension' : 'A pension'} of ${terms}.${startAssumed}${inflationAssumed}`;
}

/**
 * The years between retiring and each income starting, when the portfolio
 * covers that income's share on its own -- the stretch sequence risk punishes,
 * so it is named rather than left inside the survival rate.
 */
function describeIncomeGaps(
  inputs: RetirementQuickPlanResult['inputs'],
  household?: StatedRetirementPlanResult['household']
): string {
  const gaps: string[] = [];
  const gap = (amount: number, startAge: number, name: string, at = String(startAge)) => {
    const years = startAge - inputs.retirementAge;
    if (amount > 0 && years > 0) {
      gaps.push(`${name}'s share for the ${years === 1 ? 'year' : `${years} years`} before it starts at ${at}`);
    }
  };
  gap(inputs.socialSecurityAnnual, inputs.socialSecurityStartAge, household ? 'your Social Security' : 'Social Security');
  gap(inputs.pensionAnnual, inputs.pensionStartAge, household ? 'your pension' : 'the pension');
  for (const stream of household?.incomeStreams ?? []) {
    const { owner, kind } = incomeOfStream(stream);
    // The user's own are above; a survivor benefit replaces one that stops
    // rather than starting late.
    if (kind === 'survivor' || (owner === 'user' && kind !== 'spousal')) continue;
    const name = kind === 'pension' ? 'pension' : kind === 'spousal' ? 'spousal benefit' : 'Social Security';
    gap(
      stream.annualAmount,
      stream.startAge,
      owner === 'partner' ? `your partner's ${name}` : `your ${name}`,
      owner === 'partner' ? partnerAgeAt(stream.startAge, household!) : String(stream.startAge)
    );
  }
  return gaps.length > 0 ? ` The portfolio covers ${joinList(gaps)}.` : '';
}

/**
 * The partner's incomes and the couple's timeline, as sentences; or, when the
 * partner's age is missing, that their incomes were left out until it is given.
 */
function describeHousehold(scenario: StatedRetirementPlanResult): string {
  if (scenario.missingPartnerAge) return ` ${MISSING_PARTNER_AGE_SENTENCE}`;
  const household = scenario.household;
  if (!household) return '';
  const clauses = [
    // The partner's incomes and either one's spousal benefit; a survivor
    // benefit is part of the timeline.
    ...household.incomeStreams
      .filter((stream) => {
        const { owner, kind } = incomeOfStream(stream);
        return kind !== 'survivor' && (owner === 'partner' || kind === 'spousal');
      })
      .map((stream) => incomeOfStream(stream).kind === 'spousal'
        ? describeSpousalIncome(stream, household)
        : describePartnerIncome(stream, household)),
    ...describeHouseholdTimeline(household, {
      ...(scenario.mode === 'plan' && { annual: scenario.inputs.annualSpending }),
      ...(household.survivorSpending && { survivor: household.survivorSpending }),
    }, household.incomeStreams.map((stream) => {
      const { kind } = incomeOfStream(stream);
      return { kind, ...(stream.endAge !== undefined && { endAge: stream.endAge }) };
    })),
  ];
  // When the user's own income stops, said once beside theirs.
  const ownEnds = household.incomeStreams
    .filter((stream) => {
      const { owner, kind } = incomeOfStream(stream);
      return owner === 'user' && (kind === 'social_security' || kind === 'pension') && stream.endAge !== undefined;
    })
    .map((stream) => `your ${incomeOfStream(stream).kind === 'pension' ? 'pension' : 'Social Security'} stops at ${stream.endAge}`);
  if (ownEnds.length > 0) clauses.push(joinList(ownEnds));
  return clauses.map((clause) => ` ${capitalize(clause)}.`).join('');
}

/**
 * A comparison that moves the partner's claiming age, with both amounts; the
 * main case's own move is in its partner's income clause.
 */
function describePartnerClaimingComparison(scenarios: StatedRetirementPlanResult[]): string {
  const [primary, ...others] = scenarios;
  const mainAge = primary?.household?.plan.socialSecurityClaimAge;
  return others.flatMap((scenario) => {
    const plan = scenario.household?.plan;
    const claiming = plan?.socialSecurity?.claiming;
    return claiming && plan?.socialSecurityClaimAge !== mainAge ? [` ${describeClaimingAdjustment(claiming, 'partner')}`] : [];
  }).join('');
}

/**
 * Deterministic disclosure appended to every stated-plan answer. It leads with
 * the one thing that most separates this from the real projection -- a preset
 * mix rather than the user's holdings -- because that is both the honest limit
 * and the reason to link.
 */
export function describeStatedRetirementPlanExecution(execution: StatedRetirementPlanExecution): string | null {
  if (execution.status === 'unavailable') {
    if (execution.missingInputs?.length) {
      const items = execution.missingInputs;
      const partner = execution.partnerAgeMissing ? ' Tell me your partner\'s age too and I will include them.' : '';
      const reply = `Reply with ${items.length === 1 ? 'that' : 'those'} and I will run it.${partner}`;
      // Someone whose holdings are linked but cannot be simulated has already
      // linked; offering it again would be the wall in a new place.
      return execution.standInFor === 'unsupported_holdings'
        ? 'I can test this against a century of market history on a preset mix in place of your holdings — ' +
          `I just need ${joinList(items)}. ${reply}`
        : 'I can test this against a century of market history before any accounts are linked, using a preset ' +
          `mix — I just need ${joinList(items)}. ${reply} ` +
          'Or link your investment accounts, and I will use what you actually hold.';
    }
    return `I could not run your plan against market history: ${execution.reason}`;
  }
  const [primary] = execution.scenarios;
  if (!primary) return null;
  const inputs = primary.inputs;

  // With a partner, "Social Security" alone would not say whose.
  const partnerIncome = Boolean(primary.household?.incomeStreams.some((stream) => incomeOfStream(stream).owner === 'partner'));
  const socialSecurity = inputs.socialSecurityAnnual > 0
    ? ` ${primary.household ? 'Your Social Security' : 'Social Security'} of ${money(inputs.socialSecurityAnnual)} a year starts at ${inputs.socialSecurityStartAge}.`
    : partnerIncome
      ? ' None of your own Social Security is included.'
      : inputs.pensionAnnual > 0
        ? ' No Social Security is included.'
        : ' No Social Security is included, so the portfolio funds every year on its own.';
  // Each benefit moved to another claiming age, once, with both amounts.
  const claimingNotice = [...new Set(execution.scenarios.flatMap((scenario) =>
    scenario.claiming ? [` ${describeClaimingAdjustment(scenario.claiming)}`] : []
  ))].join('') + describePartnerClaimingComparison(execution.scenarios);
  const pension = describePension(primary);
  const bridge = describeIncomeGaps(inputs, primary.household);
  const household = describeHousehold(primary);
  const saving = inputs.annualContributions > 0
    ? ` You keep saving ${money(inputs.annualContributions)} a year until you retire.`
    : '';
  // With a partner the plan runs past the user's own planning age when they
  // are younger; the household's sentence says how far.
  const horizon = primary.household
    ? assumptionOf(primary, 'lifeExpectancy')?.origin === 'default'
      ? ` You plan through age ${inputs.lifeExpectancy}, since you did not give a horizon.`
      : ` You plan through age ${inputs.lifeExpectancy}.`
    : assumptionOf(primary, 'lifeExpectancy')?.origin === 'default'
      ? ` It plans through age ${inputs.lifeExpectancy}, since you did not give a horizon.`
      : ` It plans through age ${inputs.lifeExpectancy}.`;
  const mixDefault = assumptionOf(primary, 'allocation')?.origin === 'default'
    ? ` You did not name a mix, so I used the ${primary.allocation.label} preset.`
    : '';
  // The cut the plan ran, then what it did, or what a 20% cut would change.
  const flexibility = primary.spendingFlexibility;
  const cutClause = describeSpendingCut(flexibility?.resolution);
  const spendingCut = (cutClause ? ` It plans on ${cutClause}.` : '') + (flexibility && primary.outcome
    ? describeSpendingFlexibilityResults({
      resolution: flexibility.resolution,
      ...(flexibility.outcome && { outcome: flexibility.outcome }),
      ...(flexibility.comparison && { comparison: flexibility.comparison }),
      survivalRate: primary.outcome.survivalRate,
    })
    : '');
  const assets = assumptionOf(primary, 'investableAssets');
  const unsupported = execution.standInFor === 'unsupported_holdings';
  const notItemized = unsupported ? '' : ', so they cannot be modeled directly';
  const assetsNotice = assets?.origin !== 'snapshot'
    ? ''
    : assets.basis === 'entered'
      ? ` The amount invested is the ${money(Number(assets.value))} of investments you entered; a balance alone has no holdings to model directly.`
      : assets.basis === 'linked_and_entered'
        ? ` The amount invested is your investment total of ${money(Number(assets.value))}: your linked investment accounts plus ` +
          `the investment balances you entered${unsupported ? '' : '; neither has holdings itemized'}${notItemized}.`
        : ` The amount invested is your connected investment total of ${money(Number(assets.value))}` +
          `${unsupported ? '' : '; its holdings are not itemized'}${notItemized}.`;
  const age = assumptionOf(primary, 'currentAge');
  const ageNotice = age?.origin === 'profile' ? ` Your age, ${age.value}, is the one you told me earlier.` : '';
  const comparison = execution.scenarios.length > 1
    ? ` I compared ${execution.scenarios.map((scenario) => decapitalize(scenario.label)).join(' with ')}.`
    : '';
  const comparisonNotice = execution.comparisonUnavailableReason
    ? ` I could not run the comparison case: ${execution.comparisonUnavailableReason}`
    : '';
  // The two figures this answer assumed rather than heard, named so they are
  // the easiest ones to correct.
  const retirementAge = assumptionOf(primary, 'retirementAge');
  const retirementAgeNotice = retirementAge?.origin !== 'default'
    ? ''
    : inputs.retirementAge > CONVENTIONAL_RETIREMENT_AGE
      ? ' You did not name a retirement age, so I modeled retiring now.'
      : ` You did not name a retirement age, so I used ${CONVENTIONAL_RETIREMENT_AGE}.`;
  const spending = assumptionOf(primary, 'annualSpending');
  const spendingNotice = primary.mode === 'rates'
    ? ' You did not give a spending level, so instead of a verdict this shows what the mix sustained: the most it ' +
      'could pay out each year, in today\'s dollars, in a bad stretch of history and in a typical one. Tell me what ' +
      'you expect to spend and I will test that.'
    : spending?.origin !== 'snapshot'
      ? ''
      : spending.basis === 'entered'
        ? ` The spending level is the monthly spending you set on the Finances page, ${money(Number(spending.value))} ` +
          'a year; I assumed retirement costs the same.'
        : ` The spending level is what you spend now according to your linked accounts, ${money(Number(spending.value))} ` +
          'a year; I assumed retirement costs the same.';

  const savedNotice = describeSavedFigures(primary.assumptions.flatMap((assumption) => {
    const phrase = assumption.origin === 'saved' && assumption.savedAt
      ? SAVED_PHRASES[assumption.key]?.(assumption.value)
      : undefined;
    return phrase ? [{ phrase, savedAt: assumption.savedAt! }] : [];
  }));

  const standIn = unsupported
    ? `none of your linked holdings map to a return series I can simulate, so this ran the ${primary.allocation.label} ` +
      `preset (${primary.allocation.description}) in their place`
    : `no investment holdings are linked, so this ran the ${primary.allocation.label} preset ` +
      `(${primary.allocation.description}) rather than what you hold`;

  return `Plan assumptions: ${standIn}, against every overlapping ` +
    `${primary.history.horizonYears}-year stretch of US market returns and inflation that began between ` +
    `${readableMonth(primary.history.firstStartMonth)} and ${readableMonth(primary.history.lastStartMonth)}.` +
    `${comparison}${retirementAgeNotice}${spendingNotice}${socialSecurity}${claimingNotice}${pension}${bridge}${saving}${horizon}${household}${mixDefault}${spendingCut}` +
    `${assetsNotice}${ageNotice}${savedNotice}${comparisonNotice} ` +
    'Fund fees, taxes and account types are not modeled. Change any of these and I will re-run it.';
}

/**
 * The retirement-plan form: the public calculator's inputs, each with the
 * sentence it is sent in, worded the way the planner is told to read them.
 */
const STATED_RETIREMENT_PLAN_INPUT_REQUEST: InputRequestSpec = {
  calculatorId: STATED_RETIREMENT_PLAN_CALCULATOR_ID,
  title: 'Your retirement plan',
  question: 'Can I retire on this plan?',
  submitLabel: 'Test my plan',
  fields: [
    {
      id: 'currentAge',
      label: 'Your age',
      kind: 'age',
      ...RANGES.currentAge,
      sentence: 'I am {value} years old.',
    },
    {
      id: 'investableAssets',
      label: 'Invested today',
      kind: 'usd',
      ...RANGES.investableAssets,
      sentence: 'I have {value} invested today.',
    },
    {
      id: 'retirementAge',
      label: 'Age you plan to retire',
      kind: 'age',
      ...RANGES.retirementAge,
      sentence: 'I plan to retire at {value}.',
      // resolveVariant uses max(currentAge, 65), so blank is "now" once past 65.
      defaultNote: `${CONVENTIONAL_RETIREMENT_AGE}, or now if you are already past it`,
    },
    {
      id: 'annualSpending',
      label: 'What you expect to spend a year in retirement',
      kind: 'usd_per_year',
      ...RANGES.annualSpending,
      sentence: 'I expect to spend {value} a year in retirement, in today\'s dollars.',
      defaultNote: 'If left blank, I will show what the mix can sustain',
    },
    {
      id: 'annualContributions',
      label: 'What you save a year until you retire',
      kind: 'usd_per_year',
      ...RANGES.annualContributions,
      sentence: 'I save {value} a year until I retire.',
      defaultNote: 'None if left blank',
    },
    {
      id: 'socialSecurityAnnual',
      label: 'Social Security a year',
      kind: 'usd_per_year',
      ...RANGES.socialSecurityAnnual,
      sentence: 'I expect {value} a year from Social Security, in today\'s dollars.',
      defaultNote: 'None if left blank',
    },
    {
      id: 'socialSecurityStartAge',
      label: 'Age Social Security starts',
      kind: 'age',
      ...RANGES.socialSecurityStartAge,
      sentence: 'My Social Security starts at {value}.',
      defaultNote: `${DEFAULT_SOCIAL_SECURITY_START_AGE} if left blank`,
    },
    {
      id: 'pensionAnnual',
      label: 'Pension or other income a year',
      kind: 'usd_per_year',
      ...RANGES.pensionAnnual,
      sentence: 'I expect a pension or other income of {value} a year.',
      defaultNote: 'None if left blank',
    },
    {
      id: 'pensionStartAge',
      label: 'Age the pension starts',
      kind: 'age',
      ...RANGES.pensionStartAge,
      sentence: 'My pension starts at {value}.',
      defaultNote: 'When you retire, if left blank',
    },
    {
      id: 'pensionInflation',
      label: 'Does the pension rise with inflation?',
      kind: 'choice',
      options: [
        { value: 'fixed', label: 'a fixed amount that does not rise with inflation' },
        { value: 'rises_with_inflation', label: 'adjusted for inflation' },
      ],
      // Neutral wording: a prefix like "Pension rises with inflation" would
      // contradict the fixed choice and bias the next planner extraction.
      sentence: 'My pension is {value}.',
      defaultNote: 'A fixed amount if left blank',
    },
    {
      id: 'lifeExpectancy',
      label: 'Plan through age',
      kind: 'age',
      ...RANGES.lifeExpectancy,
      sentence: 'Plan through age {value}.',
      defaultNote: `${DEFAULT_LIFE_EXPECTANCY} if left blank`,
    },
    {
      id: 'allocation',
      label: 'Preset mix',
      kind: 'choice',
      options: (['conservative', 'balanced', 'growth'] as const).map((id) => ({
        value: id,
        label: QUICKPLAN_ALLOCATIONS[id].label,
      })),
      sentence: 'Use the {value} preset mix.',
      defaultNote: `${QUICKPLAN_ALLOCATIONS[DEFAULT_ALLOCATION_ID].label} if left blank`,
    },
  ],
};

/** The form for a stated plan waiting on figures, or null for one that ran or failed otherwise. */
export function statedRetirementPlanInputRequest(execution: StatedRetirementPlanExecution): InputRequest | null {
  // A plan that ran without the partner asks for their age alone; one that
  // could not count spousal or survivor benefits asks whether they are married.
  if (execution.status === 'completed') {
    const primary = execution.scenarios[0];
    return householdInputRequest(
      primary?.missingPartnerAge ? { missingAge: true } : primary?.household,
      STATED_RETIREMENT_PLAN_CALCULATOR_ID,
      STATED_RETIREMENT_PLAN_INPUT_REQUEST.question
    );
  }
  if (!execution.missingFields?.length) return null;
  const request = buildInputRequest(
    execution.partnerAgeMissing ? withPartnerAgeField(STATED_RETIREMENT_PLAN_INPUT_REQUEST) : STATED_RETIREMENT_PLAN_INPUT_REQUEST,
    execution.missingFields,
    execution.knownInputs
  );
  if (!request) return null;
  // When age is already known and past the conventional planning age, blank
  // means retiring now — say the concrete age rather than "65".
  const knownAge = execution.knownInputs?.find((input) => input.key === 'currentAge')?.value;
  if (typeof knownAge !== 'number' || knownAge < CONVENTIONAL_RETIREMENT_AGE) return request;
  return {
    ...request,
    fields: request.fields.map((field) =>
      field.id === 'retirementAge' && field.value === undefined && !field.required
        ? { ...field, defaultNote: `${knownAge} if left blank (retiring now)` }
        : field
    ),
  };
}

/** Where each figure the user states would be kept in Your numbers. */
const SAVE_KEYS: Partial<Record<StatedRetirementPlanField, SaveOfferKey>> = {
  retirementAge: 'retirementAge',
  annualSpending: 'annualRetirementSpending',
  annualContributions: 'annualContribution',
  socialSecurityAnnual: 'socialSecurityAnnual',
  socialSecurityStartAge: 'socialSecurityStartAge',
  pensionAnnual: 'retirementIncome',
  pensionStartAge: 'retirementIncomeStartAge',
  pensionInflation: 'retirementIncomeInflation',
  lifeExpectancy: 'planThroughAge',
  allocation: 'allocation',
  investableAssets: 'investedBalance',
};

/**
 * What the main case took from the user's own words, for "Use these next
 * time?". A comparison's values are what-ifs and are never offered.
 */
export function statedRetirementPlanSavableFigures(execution: StatedRetirementPlanExecution): SavableFigure[] {
  if (execution.status !== 'completed') return [];
  const [primary] = execution.scenarios;
  if (!primary) return [];
  const figures = primary.assumptions.flatMap((assumption) => {
    const key = assumption.origin === 'user' ? SAVE_KEYS[assumption.key] : undefined;
    return key ? [{ key, value: assumption.value }] : [];
  });
  return [
    ...withClaimedBenefit(figures, primary.claiming, primary.assumptions.some((assumption) =>
      assumption.key === 'socialSecurityAmountAge' && assumption.origin === 'user'
    )),
    ...(primary.household ? partnerSavableFigures(primary.household) : []),
    ...(savableSpendingCut(primary.spendingFlexibility?.resolution) !== undefined
      ? [{ key: 'spendingCutPercent' as const, value: savableSpendingCut(primary.spendingFlexibility?.resolution)! }]
      : []),
  ];
}

export const statedRetirementPlanCalculator: ScenarioCalculatorDefinition<
  StatedRetirementPlan,
  StatedRetirementPlanExecution,
  StatedRetirementPlanExecution
> = {
  id: STATED_RETIREMENT_PLAN_CALCULATOR_ID,
  version: STATED_RETIREMENT_PLAN_VERSION,
  label: 'Retirement plan from stated figures',
  description: 'Before any holdings are linked, run a stated retirement plan through the historical engine on a disclosed preset mix.',
  // The retirement pack is what loads holdings, and holdings decide whether
  // this applies at all.
  requiredPacks: ['retirement_analysis'],
  supportedOverrides: [
    { id: 'current_age', label: 'Current age', description: 'Age today.', valueType: 'age', minimum: 18, maximum: 90 },
    { id: 'retirement_age', label: 'Retirement age', description: 'Age withdrawals begin.', valueType: 'age', minimum: 30, maximum: 95 },
    { id: 'investable_assets', label: 'Invested today', description: 'Defaults to the investment total from linked accounts with no holdings itemized and balances the user entered.', valueType: 'currency', minimum: 1_000, maximum: 100_000_000 },
    { id: 'annual_spending', label: 'Annual retirement spending', description: 'In today\'s dollars.', valueType: 'currency', minimum: 1_000, maximum: 10_000_000 },
    { id: 'annual_contributions', label: 'Annual saving until retirement', description: 'In today\'s dollars.', valueType: 'currency', minimum: 0, maximum: 5_000_000 },
    { id: 'social_security_annual', label: 'Annual Social Security', description: 'Inflation-adjusted income that reduces withdrawals once it starts.', valueType: 'currency', minimum: 0, maximum: 250_000 },
    { id: 'social_security_start_age', label: 'Social Security start age', description: 'Age the benefit begins; a benefit for another age is rescaled by Social Security\'s claiming rules.', valueType: 'age', minimum: 50, maximum: 80 },
    { id: 'social_security_amount_age', label: 'Age the Social Security figure is for', description: 'The claiming age a stated benefit was quoted for, when it differs from the start age.', valueType: 'age', minimum: EARLIEST_CLAIMING_AGE, maximum: LATEST_CREDIT_AGE },
    { id: 'pension_annual', label: 'Pension or other income a year', description: 'Income other than Social Security that reduces withdrawals once it starts.', valueType: 'currency', minimum: 0, maximum: 10_000_000 },
    { id: 'pension_start_age', label: 'Pension start age', description: 'Age the pension begins.', valueType: 'age', minimum: 30, maximum: 95 },
    { id: 'pension_inflation', label: 'Pension inflation treatment', description: 'A fixed dollar amount, or today\'s dollars rising with inflation.', valueType: 'enum', options: ['fixed', 'rises_with_inflation'] },
    { id: 'life_expectancy', label: 'Planning horizon age', description: 'Age through which the plan is modeled.', valueType: 'age', minimum: 60, maximum: 110 },
    { id: 'allocation', label: 'Preset asset mix', description: 'Conservative, balanced, or growth.', valueType: 'enum', options: ['conservative', 'balanced', 'growth'] },
    { id: 'partner_social_security_start_age', label: 'Partner\'s Social Security claiming age', description: 'A comparison only: the age, the partner\'s own, at which they claim; their benefit moves by Social Security\'s claiming rules.', valueType: 'age', minimum: EARLIEST_CLAIMING_AGE, maximum: 80 },
  ],
  defaults: [
    { id: 'allocation', value: DEFAULT_ALLOCATION_ID, description: 'The public retirement calculator\'s default preset.' },
    { id: 'life_expectancy', value: DEFAULT_LIFE_EXPECTANCY, description: 'Planning horizon when none is stated.' },
    { id: 'social_security_start_age', value: DEFAULT_SOCIAL_SECURITY_START_AGE, description: 'Used only when a benefit is stated without a start age.' },
    { id: 'annual_contributions', value: 0, description: 'No saving before retirement unless stated.' },
    { id: 'social_security_annual', value: 0, description: 'No Social Security unless stated.' },
    { id: 'pension_annual', value: 0, description: 'No pension unless stated.' },
    { id: 'pension_start_age', value: 'retirement age', description: 'Used only when a pension is stated without a start age.' },
    { id: 'pension_inflation', value: 'fixed', description: 'A stated pension is a fixed dollar amount unless the user says it rises with inflation.' },
  ],
  outputs: [
    { id: 'historical_survival_rate', label: 'Historical survival share', unit: 'percent', scope: 'variant', description: 'Share of overlapping historical sequences in which the money lasted the whole horizon.' },
    { id: 'historical_sequences_survived', label: 'Sequences survived', unit: 'count', scope: 'variant', description: 'Count of tested sequences in which the money lasted.' },
    { id: 'median_portfolio_at_retirement', label: 'Median portfolio at retirement', unit: 'usd', scope: 'variant', description: 'Median real portfolio at the retirement age across sequences.' },
    { id: 'first_year_withdrawal_rate', label: 'First-year withdrawal rate', unit: 'percent', scope: 'variant', description: 'First-year portfolio withdrawal divided by the median portfolio at retirement.' },
    { id: 'sustainable_spending', label: 'Sustained spending', unit: 'usd', scope: 'variant', description: 'Annual spending the preset mix sustained in the 10th-percentile and median sequences.' },
  ],
  planner: {
    jsonSchema: STATED_RETIREMENT_PLAN_JSON_SCHEMA,
    instructions: `Request this for any question about whether the user can retire, whether their savings will last, how much they can spend in retirement, or a change to such a plan stated earlier in this decision, including a plan the free retirement calculator answered. Application code runs it only when no investment holdings are linked, or none of the linked ones can be simulated, as a stand-in for the holdings-based projection, so request it for those questions even when the user has stated nothing yet; it asks for whatever is missing. Fill primary.overrides with values the user stated anywhere in this decision, the newest revision winning, and put the user's short wording in overrides.sources: currentAge, retirementAge, investableAssets (invested savings today), annualSpending (spending per year once retired, in today's dollars), annualContributions (saving per year until retirement), socialSecurityAnnual and socialSecurityStartAge (Social Security only; socialSecurityStartAge is when the user claims it), socialSecurityAmountAge (only when the user says which claiming age their Social Security figure is for, such as a statement showing $2,500 a month at 67; otherwise null), pensionAnnual (a pension, annuity or other income in retirement that is not Social Security, per year) and pensionStartAge, pensionInflation (fixed when the user says the pension is a fixed amount or has no cost-of-living adjustment, rises_with_inflation when they say it has a cost-of-living adjustment or rises with inflation; otherwise unspecified with a null source), lifeExpectancy (the age the plan runs through), and allocation: conservative (40% US stocks / 50% bonds / 10% cash), balanced (60% / 35% / 5%) or growth (80% / 18% / 2%) when the user, or an earlier answer in this decision, names one of those presets; otherwise unspecified with a null source. When the newest message changes an input of a plan stated earlier, put the earlier plan in primary and only the changed values in comparison; for claiming Social Security at another age, that is only socialSecurityStartAge, never a new amount, because application code applies Social Security's own claiming rules to the benefit. When the user gives a range for one value, put the low end in primary and only the high end in comparison. A spouse's or partner's age, Social Security, pension or planning age is never one of these fields; it belongs in the retirement inputs' partner fields, which application code reads for this plan too. The one exception is a what-if on when the partner claims Social Security ("what if my wife claims at 70?"): put only that claiming age, at the partner's own age, in comparison.overrides.partnerSocialSecurityStartAge with the primary's null, never a new amount, because application code moves the partner's benefit by the same claiming rules. Never estimate or supply typical values; application code uses the conventional retirement age when none is stated, the user's current spending when their accounts show it, and otherwise reports what the mix sustained instead of a verdict. Do not request it for a Coast FIRE question unless the user also asks whether that plan survives market history. The overrides object and every field and source are always present. When there is no such retirement question, set requested=false, allocation=unspecified, pensionInflation=unspecified, and null for every other value and every source in both variants.`,
    parsePlan: parseStatedRetirementPlan,
  },
  execution: {
    progressMessage: 'Testing your plan against market history',
    failureMessage: 'The stated retirement plan could not be run against market history.',
  },
  appliesTo: statedRetirementPlanApplies,
  // Coast FIRE runs the same engine on the same savings for its own
  // market-history test. Both in one answer would be two near-identical
  // histories under different headings.
  yieldsTo: [COAST_FIRE_CALCULATOR_ID],
  execute: (snapshot, plan) => runStatedRetirementPlan(snapshot, plan),
  unavailable: (startedAt, reason) => unavailable(startedAt, reason),
  inputRequest: statedRetirementPlanInputRequest,
  savableFigures: statedRetirementPlanSavableFigures,
  compactEvidence: compactStatedRetirementPlanExecution,
  canonicalFacts: statedRetirementPlanCanonicalFacts,
  describeAssumptions: describeStatedRetirementPlanExecution,
};
