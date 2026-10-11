/**
 * Coast FIRE in Ask Linc.
 *
 * The public Coast FIRE calculator hands its run to Ask Linc as the account's
 * first decision. Every follow-up used to land on the historical retirement
 * engine instead, which needs linked holdings, so a new account with nothing
 * linked was told it could not be helped with the question it had just been
 * answered. Coast FIRE needs no holdings at all: it is one formula over seven
 * numbers the user can state, and `services/coast-fire.ts` already owns it.
 *
 * This registers that formula as a calculator. The models identify the request
 * and copy the user's figures; the arithmetic, the defaults and the wording of
 * every disclosure stay here.
 *
 * One addition the public page does not make: given what the user invests each
 * year, the calculator finds the first birthday at which their savings could
 * stop receiving new money and still reach the target -- "when will I reach
 * Coast FIRE?". Contributions are added once a year, at the end of the year,
 * so the answer is a whole age rather than a false-precision fraction.
 *
 * And one the public page cannot make room for: until holdings are linked, the
 * same savings are also run through the historical engine on a disclosed
 * preset mix, left alone until the retirement age and then spent. The straight
 * line says whether one average return clears the bar; the history says how
 * often coasting from today actually would have, which is the answer linking
 * would then make about the user's own holdings.
 */

import { createHash } from 'crypto';
import type { FinancialContextSnapshot } from '../openai/types';
import type { CanonicalFact, CanonicalFactUnit } from '../openai/canonical-facts';
import type { ScenarioCalculatorDefinition } from './calculator-registry';
import {
  CoastFireValidationError,
  type CoastFireInputs,
  type CoastFireResult,
} from '../services/coast-fire';
import {
  calculateCoastFireWithIncome,
  type CoastFireIncome,
  type CoastFireIncomeResult,
} from './coast-fire-income';
import {
  DEFAULT_ALLOCATION_ID,
  DEFAULT_LIFE_EXPECTANCY,
  DEFAULT_SOCIAL_SECURITY_START_AGE,
  QUICKPLAN_ALLOCATIONS,
  runRetirementQuickPlan,
  type QuickPlanAllocationId,
  type QuickPlanRunner,
} from '../services/retirement-quickplan';
import { presetStandInReason } from './preset-stand-in';
import { CONVENTIONAL_RETIREMENT_AGE } from '../openai/retirement-inputs';
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
  householdIncomes,
  householdTimeline,
  partnerAgeMissing,
  partnerSavableFigures,
  resolvePartner,
  survivorSpendingFor,
  toStream,
} from '../services/household';
import {
  describeHouseholdTimeline,
  householdIncomeFactRows,
  householdSocialSecurityFactRows,
  householdTimelineFactRows,
  incomeEndClause,
  describePartnerIncome,
  describeSpousalIncome,
  MISSING_PARTNER_AGE_SENTENCE,
  partnerAgeAt,
  householdInputRequest,
  withPartnerAgeField,
  type PlannedHousehold,
} from '../openai/household-evidence';

export const COAST_FIRE_CALCULATOR_ID = 'coast_fire' as const;
/**
 * 2: Social Security and a pension are separate incomes, each with its own
 * start age, and a pension may be a fixed amount. `metrics.annualRetirementIncome`
 * is the income counted once all of it has started; at 1 it was the single
 * income the user stated, counted from the retirement date.
 */
export const COAST_FIRE_SCENARIO_VERSION = 2 as const;

/** The public calculator's own defaults, so a follow-up agrees with the page. */
export const DEFAULT_COAST_FIRE_REAL_RETURN_PERCENT = 5;
export const DEFAULT_COAST_FIRE_WITHDRAWAL_RATE_PERCENT = 4;

const COAST_FIRE_OVERRIDE_FIELDS = [
  'currentAge',
  'retirementAge',
  'currentSavings',
  'annualRetirementSpending',
  'annualRetirementIncome',
  'retirementIncomeStartAge',
  'socialSecurityAnnual',
  'socialSecurityStartAge',
  'socialSecurityAmountAge',
  'realReturnRatePercent',
  'withdrawalRatePercent',
  'annualContribution',
  'lifeExpectancy',
] as const;

export type CoastFireOverrideField = (typeof COAST_FIRE_OVERRIDE_FIELDS)[number];

const NULLABLE_NUMBER = { type: ['number', 'null'] as const };
const NULLABLE_STRING = { type: ['string', 'null'] as const };

/** The historical test's preset mix; `unspecified` leaves the disclosed default. */
const ALLOCATION_OPTIONS = ['unspecified', 'conservative', 'balanced', 'growth'] as const;
const PENSION_INFLATION_OPTIONS = ['unspecified', ...INCOME_INFLATION_OPTIONS] as const;
const SOURCE_FIELDS = [...COAST_FIRE_OVERRIDE_FIELDS, 'allocation', 'retirementIncomeInflation'] as const;
type CoastFireSourceField = (typeof SOURCE_FIELDS)[number];

const PLANNED_COAST_FIRE_OVERRIDES_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [...SOURCE_FIELDS, 'sources'],
  properties: {
    ...Object.fromEntries(COAST_FIRE_OVERRIDE_FIELDS.map((field) => [field, NULLABLE_NUMBER])),
    allocation: { type: 'string', enum: [...ALLOCATION_OPTIONS] },
    retirementIncomeInflation: { type: 'string', enum: [...PENSION_INFLATION_OPTIONS] },
    sources: {
      type: 'object',
      additionalProperties: false,
      required: [...SOURCE_FIELDS],
      properties: Object.fromEntries(SOURCE_FIELDS.map((field) => [field, NULLABLE_STRING])),
    },
  },
} as const;

const PLANNED_COAST_FIRE_VARIANT_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['overrides'],
  properties: { overrides: PLANNED_COAST_FIRE_OVERRIDES_JSON_SCHEMA },
} as const;

export const COAST_FIRE_SCENARIO_PLAN_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['requested', 'primary', 'comparison'],
  properties: {
    requested: { type: 'boolean' },
    primary: PLANNED_COAST_FIRE_VARIANT_JSON_SCHEMA,
    comparison: PLANNED_COAST_FIRE_VARIANT_JSON_SCHEMA,
  },
} as const;

export interface PlannedCoastFireOverrides {
  currentAge?: number;
  retirementAge?: number;
  currentSavings?: number;
  annualRetirementSpending?: number;
  annualRetirementIncome?: number;
  retirementIncomeStartAge?: number;
  socialSecurityAnnual?: number;
  socialSecurityStartAge?: number;
  /** The age the user's Social Security figure is for, when they named one. */
  socialSecurityAmountAge?: number;
  realReturnRatePercent?: number;
  withdrawalRatePercent?: number;
  annualContribution?: number;
  /** The age to plan through: what incomes are valued over and the market-history test runs to. */
  lifeExpectancy?: number;
  allocation?: QuickPlanAllocationId;
  retirementIncomeInflation?: IncomeInflation;
  sources: Partial<Record<CoastFireSourceField, string>>;
}

export interface CoastFireScenarioPlan {
  requested: true;
  primary: { overrides?: PlannedCoastFireOverrides };
  comparison?: { overrides: PlannedCoastFireOverrides };
}

/**
 * Where a value came from. `snapshot` is the investment total or current
 * spending Linc holds (`basis` says whether linked accounts or the user's own
 * entries), `profile` an age the user told Linc earlier, `saved` a figure
 * from the plan they saved in Your numbers, `default` the public calculator's
 * named default.
 */
export type CoastFireAssumptionOrigin = 'user' | 'snapshot' | 'profile' | 'saved' | 'default';

export interface CoastFireAssumption {
  key: CoastFireOverrideField;
  label: string;
  value: number;
  unit: CanonicalFactUnit;
  origin: CoastFireAssumptionOrigin;
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

/** When contributions get savings to the point where they could coast. */
export interface CoastFireContributionPath {
  annualContribution: number;
  /** False when contributions only reach the target at or after retirement. */
  reachedBeforeRetirement: boolean;
  yearsUntilCoastFire?: number;
  ageAtCoastFire?: number;
  savingsAtCoastFire?: number;
  /** The Coast FIRE number at that age: it rises every year retirement gets closer. */
  coastFireNumberAtThatAge?: number;
  /** Savings at retirement if the contributions continue every year until then. */
  projectedSavingsAtRetirementWithContributions: number;
}

/**
 * The same savings left alone until the retirement age and then spent, run
 * through the historical record on a preset mix. Present only while no
 * holdings are linked; once they are, the holdings-based projection is the
 * historical answer.
 */
export interface CoastFireHistoricalTest {
  allocation: {
    id: QuickPlanAllocationId;
    label: string;
    description: string;
    /** Whether the user named the mix, saved it in Your numbers, or it is the disclosed default. */
    origin: 'user' | 'saved' | 'default';
    savedAt?: string;
    usEquityPercent: number;
    bondsPercent: number;
    cashPercent: number;
  };
  /** The age the test runs through. */
  lifeExpectancy: number;
  survivalRate: number;
  sequencesTested: number;
  sequencesSurvived: number;
  /** Median across the tested sequences, in today's dollars. */
  projectedPortfolioAtRetirement: number;
  firstStartMonth: string;
  lastStartMonth: string;
  horizonYears: number;
}

/** Whether the pension rises with prices, and whether the user said so. */
export interface CoastFirePensionInflation {
  value: IncomeInflation;
  origin: 'user' | 'saved' | 'default';
  savedAt?: string;
}

/**
 * The straight line's figures. The income fields are absent on executions
 * recorded at version 1, when the one income ran from the retirement date.
 */
export type CoastFireScenarioMetrics = CoastFireResult &
  Partial<Pick<CoastFireIncomeResult,
    'incomes' | 'bridgeReserve' | 'planThroughAge' | 'inflationPercent' | 'spendingChange' | 'levelSpending'>>;

export interface CoastFireScenarioResult {
  id: string;
  label: string;
  assumptions: CoastFireAssumption[];
  /** Present when a pension is counted. */
  pensionInflation?: CoastFirePensionInflation;
  metrics: CoastFireScenarioMetrics;
  contributionPath?: CoastFireContributionPath;
  historicalTest?: CoastFireHistoricalTest;
  /**
   * Set when the Social Security figure was for another claiming age: the
   * income counted is the benefit at this case's claiming age by Social
   * Security's rules, and this names both.
   */
  claiming?: ClaimingAdjustment;
  /**
   * The partner the case planned for as well. Their incomes are in
   * `metrics.incomes` (owner `partner`), on the user's ages.
   */
  household?: PlannedHousehold;
  /** Set when a partner's incomes are known but not their age, so they were left out. */
  missingPartnerAge?: true;
}

export type { QuickPlanRunner };

export interface CompletedCoastFireScenarioExecution {
  version: number;
  calculator: typeof COAST_FIRE_CALCULATOR_ID;
  status: 'completed';
  computedAt: string;
  durationMs: number;
  scenarios: CoastFireScenarioResult[];
  /** Set when the primary case ran but the requested comparison could not. */
  comparisonUnavailableReason?: string;
}

export interface UnavailableCoastFireScenarioExecution {
  version: number;
  calculator: typeof COAST_FIRE_CALCULATOR_ID;
  status: 'unavailable';
  computedAt: string;
  durationMs: number;
  reason: string;
  /**
   * What the user can reply with to make this run, in their terms. Present
   * when the only obstacle is a figure nobody stated -- the disclosure then
   * asks for it rather than reporting a failure.
   */
  missingInputs?: string[];
  /** The same figures by field, for the form that asks for them. */
  missingFields?: CoastFireOverrideField[];
  /** What was already known when they were found missing, so the form can show it. */
  knownInputs?: KnownInput[];
  /** A partner to plan for whose age is not known either, so the form asks for it too. */
  partnerAgeMissing?: true;
}

export type CoastFireScenarioExecution =
  | CompletedCoastFireScenarioExecution
  | UnavailableCoastFireScenarioExecution;

const OVERRIDE_RANGES: Record<CoastFireOverrideField, { minimum: number; maximum: number; integer?: boolean }> = {
  currentAge: { minimum: 18, maximum: 90, integer: true },
  retirementAge: { minimum: 30, maximum: 95, integer: true },
  currentSavings: { minimum: 0, maximum: 100_000_000 },
  annualRetirementSpending: { minimum: 1_000, maximum: 10_000_000 },
  annualRetirementIncome: { minimum: 0, maximum: 10_000_000 },
  retirementIncomeStartAge: { minimum: 30, maximum: 95, integer: true },
  // The quick plan's bounds, so the market-history test runs on any figure the
  // straight line accepts.
  socialSecurityAnnual: { minimum: 0, maximum: 250_000 },
  socialSecurityStartAge: { minimum: 50, maximum: 80, integer: true },
  // Ages a retirement benefit can be claimed at, and so be quoted for.
  socialSecurityAmountAge: { minimum: EARLIEST_CLAIMING_AGE, maximum: LATEST_CREDIT_AGE, integer: true },
  realReturnRatePercent: { minimum: 0, maximum: 12 },
  withdrawalRatePercent: { minimum: 2, maximum: 8 },
  annualContribution: { minimum: 0, maximum: 10_000_000 },
  // Where the stated plan and Your numbers keep a planning age.
  lifeExpectancy: { minimum: 60, maximum: 110, integer: true },
};

/** The two fields carried in percentage points, where 5% is 5. */
const PERCENTAGE_POINT_FIELDS = new Set<CoastFireOverrideField>(['realReturnRatePercent', 'withdrawalRatePercent']);

/** Every percentage the user's wording states: "5%" and "5 percent" are both 5. */
function statedPercentages(source: string): number[] {
  return Array.from(source.matchAll(/(\d+(?:\.\d+)?|\.\d+)\s*(?:%|percent\b)/gi), (match) => Number(match[1]));
}

/**
 * Percentage-point fields can still arrive as a decimal fraction: 5% sent as
 * 0.05 would quietly multiply the Coast FIRE number, and 3.5% sent as 0.035
 * would fall outside the withdrawal range and be replaced by the default with
 * a disclosure saying the user gave none. But 0.1% is also a rate someone can
 * mean. A value below 1 is therefore read against the user's own wording: kept
 * when they wrote it, scaled when they wrote a hundred times it, and dropped
 * only when the wording supports neither.
 */
function asPercentagePoints(value: number, source: string): number | undefined {
  if (value === 0 || value >= 1) return value;
  const stated = statedPercentages(source);
  const wrote = (candidate: number) => stated.some((percent) => Math.abs(percent - candidate) < 1e-9);
  if (wrote(value)) return value;
  const scaled = Number((value * 100).toFixed(6));
  return wrote(scaled) ? scaled : undefined;
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function isIncomeInflation(value: unknown): value is IncomeInflation {
  return typeof value === 'string' && (INCOME_INFLATION_OPTIONS as readonly string[]).includes(value);
}

function shortSource(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const source = value
    .replace(/[^\p{L}\p{N} $.,%'’/+-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return source ? source.slice(0, 160) : undefined;
}

function parseOverrides(value: unknown): PlannedCoastFireOverrides | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const rawSources = record.sources && typeof record.sources === 'object' && !Array.isArray(record.sources)
    ? record.sources as Record<string, unknown>
    : {};
  const overrides: PlannedCoastFireOverrides = { sources: {} };

  for (const field of COAST_FIRE_OVERRIDE_FIELDS) {
    const rawValue = finiteNumber(record[field]);
    const source = shortSource(rawSources[field]);
    const range = OVERRIDE_RANGES[field];
    const numericValue = rawValue !== undefined && source && PERCENTAGE_POINT_FIELDS.has(field)
      ? asPercentagePoints(rawValue, source)
      : rawValue;
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
  if (typeof record.allocation === 'string' && record.allocation in QUICKPLAN_ALLOCATIONS && allocationSource) {
    overrides.allocation = record.allocation as QuickPlanAllocationId;
    overrides.sources.allocation = allocationSource;
  }
  const inflationSource = shortSource(rawSources.retirementIncomeInflation);
  if (isIncomeInflation(record.retirementIncomeInflation) && inflationSource) {
    overrides.retirementIncomeInflation = record.retirementIncomeInflation;
    overrides.sources.retirementIncomeInflation = inflationSource;
  }

  return SOURCE_FIELDS.some((field) => overrides[field] !== undefined)
    ? overrides
    : undefined;
}

/** Validate the semantic planner result without reading numbers out of prose. */
export function parseCoastFireScenarioPlan(value: unknown): CoastFireScenarioPlan | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  if (record.requested !== true) return undefined;
  const primaryRecord = record.primary && typeof record.primary === 'object' && !Array.isArray(record.primary)
    ? record.primary as Record<string, unknown>
    : undefined;
  // A request with no figures is still a request: the runner then asks for
  // what it needs instead of the question going unanswered.
  if (!primaryRecord) return undefined;
  const primaryOverrides = parseOverrides(primaryRecord.overrides);
  const comparisonRecord = record.comparison && typeof record.comparison === 'object' && !Array.isArray(record.comparison)
    ? record.comparison as Record<string, unknown>
    : undefined;
  const comparisonOverrides = comparisonRecord ? parseOverrides(comparisonRecord.overrides) : undefined;
  return {
    requested: true,
    primary: primaryOverrides ? { overrides: primaryOverrides } : {},
    ...(comparisonOverrides && { comparison: { overrides: comparisonOverrides } }),
  };
}

function layer(
  base: PlannedCoastFireOverrides,
  top: PlannedCoastFireOverrides | undefined
): PlannedCoastFireOverrides {
  if (!top) return base;
  const merged: PlannedCoastFireOverrides = { ...base, sources: { ...base.sources } };
  for (const field of COAST_FIRE_OVERRIDE_FIELDS) {
    const value = top[field];
    const source = top.sources[field];
    if (value === undefined || !source) continue;
    merged[field] = value;
    merged.sources[field] = source;
  }
  if (top.allocation && top.sources.allocation) {
    merged.allocation = top.allocation;
    merged.sources.allocation = top.sources.allocation;
  }
  if (top.retirementIncomeInflation && top.sources.retirementIncomeInflation) {
    merged.retirementIncomeInflation = top.retirementIncomeInflation;
    merged.sources.retirementIncomeInflation = top.sources.retirementIncomeInflation;
  }
  return merged;
}

const ASSUMPTION_LABELS: Record<CoastFireOverrideField, { label: string; unit: CanonicalFactUnit }> = {
  currentAge: { label: 'Current age', unit: 'age' },
  retirementAge: { label: 'Retirement age', unit: 'age' },
  currentSavings: { label: 'Invested retirement savings today', unit: 'usd' },
  annualRetirementSpending: { label: 'Annual spending in retirement, in today\'s dollars', unit: 'usd' },
  annualRetirementIncome: { label: 'Pension or other income a year', unit: 'usd' },
  retirementIncomeStartAge: { label: 'Pension start age', unit: 'age' },
  socialSecurityAnnual: { label: 'Social Security a year, in today\'s dollars', unit: 'usd' },
  socialSecurityStartAge: { label: 'Social Security start age', unit: 'age' },
  socialSecurityAmountAge: { label: 'Age your Social Security figure is for', unit: 'age' },
  realReturnRatePercent: { label: 'Annual growth after inflation', unit: 'percent' },
  withdrawalRatePercent: { label: 'Withdrawal rate', unit: 'percent' },
  annualContribution: { label: 'Annual contributions until savings can coast, in today\'s dollars', unit: 'usd' },
  lifeExpectancy: { label: 'Age the plan runs through', unit: 'age' },
};

/** How a figure taken from Your numbers is named in the disclosure. */
const SAVED_PHRASES: Partial<Record<CoastFireOverrideField, (value: number) => string>> = {
  retirementAge: (value) => `retiring at ${value}`,
  annualRetirementSpending: (value) => `spending ${money(value)} a year in retirement`,
  annualRetirementIncome: (value) => `a pension of ${money(value)} a year`,
  retirementIncomeStartAge: (value) => `the pension from ${value}`,
  socialSecurityAnnual: (value) => `${money(value)} a year of Social Security`,
  socialSecurityStartAge: (value) => `Social Security from ${value}`,
  annualContribution: (value) => `investing ${money(value)} a year now`,
  lifeExpectancy: (value) => `planning through age ${value}`,
};

/** In the user's terms, for the ask when a figure is missing. */
const MISSING_INPUT_PROMPTS: Partial<Record<CoastFireOverrideField, string>> = {
  currentAge: 'your current age',
  retirementAge: 'the age you plan to retire',
  currentSavings: 'how much you have invested for retirement today',
  annualRetirementSpending: 'roughly how much you expect to spend a year once you stop working, in today\'s dollars',
};

function profileAge(snapshot: FinancialContextSnapshot): number | undefined {
  const age = snapshot.userProfileValues?.age;
  const range = OVERRIDE_RANGES.currentAge;
  return typeof age === 'number' && Number.isInteger(age) && age >= range.minimum && age <= range.maximum
    ? age
    : undefined;
}

/** Annual spending from linked cash flow; null there already where nothing linked says. */
function currentAnnualSpending(snapshot: FinancialContextSnapshot): number | undefined {
  const monthly = snapshot.expectedMonthly?.spending;
  if (typeof monthly !== 'number' || !Number.isFinite(monthly)) return undefined;
  const annual = Math.round(monthly * 12);
  const range = OVERRIDE_RANGES.annualRetirementSpending;
  return annual >= range.minimum && annual <= range.maximum ? annual : undefined;
}

/** The investment total Linc holds, from linked accounts, balances the user entered, or both. */
function knownInvestmentTotal(snapshot: FinancialContextSnapshot): { value: number; basis: BalanceBasis } | undefined {
  const total = snapshot.financialSummary?.financialOverview?.totalInvestments;
  return typeof total === 'number' && Number.isFinite(total) && total > 0 && total <= OVERRIDE_RANGES.currentSavings.maximum
    ? { value: total, basis: balanceBasis(snapshot.linkedData, 'investments') ?? 'linked' }
    : undefined;
}

interface ResolvedCoastFireVariant {
  /** `annualRetirementIncome` is the pension as stated; `incomes` is what is counted. */
  inputs: CoastFireInputs;
  incomes: CoastFireIncome[];
  pensionInflation?: CoastFirePensionInflation;
  annualContribution: number;
  assumptions: CoastFireAssumption[];
  allocation: { id: QuickPlanAllocationId; origin: 'user' | 'saved' | 'default'; savedAt?: string };
  /** The Social Security figure as given and the age it is for, before any claiming rule. */
  socialSecurityQuote?: { amount: number; age: number };
  claiming?: ClaimingAdjustment;
  /** A partner to plan for as well, on this case's ages. */
  household?: PlannedHousehold;
  missingPartnerAge?: true;
  /** When the user claims Social Security and whether their own benefit is known, for a spousal benefit. */
  userSocialSecurity: { claimAge: number; known: boolean };
  /** The age the incomes are valued through: the household's horizon with a partner. */
  planThroughAge: number;
  /** The user's own planning age, when they said it or saved it; otherwise the convention. */
  userPlanThroughAge?: number;
  /** What one survivor spends from the first death, when the user said. */
  survivorSpending?: { fromAge: number; annualAmount: number };
}

/** Whether the pension rises with prices: the user's words, then Your numbers, then fixed. */
function pensionInflationFor(
  snapshot: FinancialContextSnapshot,
  overrides: PlannedCoastFireOverrides
): CoastFirePensionInflation {
  if (overrides.retirementIncomeInflation && overrides.sources.retirementIncomeInflation) {
    return { value: overrides.retirementIncomeInflation, origin: 'user' };
  }
  const saved = savedChoice(snapshot.statedFigures, 'retirementIncomeInflation');
  if (saved && isIncomeInflation(saved.value)) return { value: saved.value, origin: 'saved', savedAt: saved.savedAt };
  // Most private pensions pay a fixed amount, and overstating future income is
  // the costlier mistake.
  return { value: 'fixed', origin: 'default' };
}

/** The pension's label as a fact, in the units it is in. */
function pensionLabel(inflation: IncomeInflation): string {
  return inflation === 'rises_with_inflation'
    ? 'Pension or other income a year, in today\'s dollars, rising with inflation'
    : 'Pension or other income a year, a fixed dollar amount that does not rise with inflation';
}

/**
 * Fill each input from the user's words first, then from what Linc already
 * holds, then from a named default -- and refuse to default the four figures
 * the answer is about. An age, a retirement date, a spending level and a
 * balance are facts about the person; assuming any of them would make this the
 * most confident number in the answer and the only invented one.
 */
function resolveVariant(
  snapshot: FinancialContextSnapshot,
  overrides: PlannedCoastFireOverrides,
  /** For a comparison that only moves the claiming age: the age the main case's figure was for. */
  inheritedQuoteAge?: number
): ResolvedCoastFireVariant | { missing: string[]; missingFields: CoastFireOverrideField[]; known: KnownInput[] } {
  const assumptions: CoastFireAssumption[] = [];
  const missing: string[] = [];
  const missingFields: CoastFireOverrideField[] = [];
  const take = (
    field: CoastFireOverrideField,
    fallback?: { value: number; origin: Exclude<CoastFireAssumptionOrigin, 'user'>; basis?: BalanceBasis; savedAt?: string }
  ): number | undefined => {
    const stated = overrides[field];
    const source = overrides.sources[field];
    if (stated !== undefined && source) {
      assumptions.push({ key: field, ...ASSUMPTION_LABELS[field], value: stated, origin: 'user', source });
      return stated;
    }
    if (fallback) {
      assumptions.push({
        key: field,
        ...ASSUMPTION_LABELS[field],
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
  const knownAge = profileAge(snapshot);
  const investmentTotal = knownInvestmentTotal(snapshot);
  const knownSpending = currentAnnualSpending(snapshot);
  // A spending override is the figure the user set on the Finances page.
  const spendingBasis: BalanceBasis = snapshot.expectedMonthly?.spendingSource === 'override' ? 'entered' : 'linked';
  const currentAge = take('currentAge', knownAge !== undefined ? { value: knownAge, origin: 'profile' } : undefined);
  // A saved retirement age the user has already reached is no plan for the
  // future; then the conventional age while it is still ahead of them. Past
  // that, there is no coasting to work out, so it is asked for instead.
  const savedRetirementAge = saved('retirementAge');
  const retirementAge = take(
    'retirementAge',
    savedRetirementAge && (currentAge === undefined || savedRetirementAge.value > currentAge)
      ? savedRetirementAge
      : currentAge !== undefined && currentAge < CONVENTIONAL_RETIREMENT_AGE
        ? { value: CONVENTIONAL_RETIREMENT_AGE, origin: 'default' }
        : undefined
  );
  const currentSavings = take(
    'currentSavings',
    investmentTotal !== undefined ? { ...investmentTotal, origin: 'snapshot' } : undefined
  );
  // What they spend now, when linked accounts or their own monthly figure
  // say; I assume retirement costs the same and say so.
  const annualRetirementSpending = take(
    'annualRetirementSpending',
    saved('annualRetirementSpending') ??
      (knownSpending !== undefined ? { value: knownSpending, origin: 'snapshot', basis: spendingBasis } : undefined)
  );
  const annualRetirementIncome = take(
    'annualRetirementIncome',
    saved('retirementIncome') ?? { value: 0, origin: 'default' }
  )!;
  // A pension most often starts when work stops. Like its inflation terms, a
  // start age means nothing without a pension behind it, so it is not listed.
  const pensionStartAge = annualRetirementIncome > 0
    ? take(
      'retirementIncomeStartAge',
      saved('retirementIncomeStartAge') ??
        (retirementAge !== undefined ? { value: retirementAge, origin: 'default' } : undefined)
    )
    : undefined;
  const pensionInflation = annualRetirementIncome > 0 ? pensionInflationFor(snapshot, overrides) : undefined;
  if (pensionInflation) {
    const pension = assumptions.find((assumption) => assumption.key === 'annualRetirementIncome');
    if (pension) pension.label = pensionLabel(pensionInflation.value);
  }
  const socialSecurityAnnual = take(
    'socialSecurityAnnual',
    saved('socialSecurityAnnual') ?? { value: 0, origin: 'default' }
  )!;
  const socialSecurityStartAge = socialSecurityAnnual > 0
    ? take(
      'socialSecurityStartAge',
      saved('socialSecurityStartAge') ?? { value: DEFAULT_SOCIAL_SECURITY_START_AGE, origin: 'default' }
    )!
    : undefined;
  // A benefit belongs to an age. Claimed at another, it is the benefit Social
  // Security's own rules pay there, not the same amount started later.
  const socialSecurityQuote = socialSecurityStartAge !== undefined
    ? {
      amount: socialSecurityAnnual,
      age: socialSecurityQuoteAge({
        namedAge: take('socialSecurityAmountAge'),
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
  const realReturnRate = take('realReturnRatePercent', {
    value: DEFAULT_COAST_FIRE_REAL_RETURN_PERCENT,
    origin: 'default',
  });
  const withdrawalRate = take('withdrawalRatePercent', {
    value: DEFAULT_COAST_FIRE_WITHDRAWAL_RATE_PERCENT,
    origin: 'default',
  });
  // Zero is the honest reading of an unstated contribution, and it changes
  // nothing about the Coast FIRE number itself; only a stated or saved one is
  // recorded.
  const savedContribution = saved('annualContribution');
  const statedContribution = (overrides.annualContribution !== undefined && overrides.sources.annualContribution) ||
    savedContribution
    ? take('annualContribution', savedContribution)
    : undefined;

  if (missing.length > 0) {
    // Defaults are not shown as known: the form names them as what a blank
    // field means, so they never come back as something the user said.
    const known: KnownInput[] = assumptions
      .filter((assumption) => assumption.origin !== 'default')
      .map((assumption) => ({
        key: assumption.key,
        value: assumption.value,
        origin: assumption.origin as KnownInput['origin'],
        ...(assumption.basis && { basis: assumption.basis }),
      }));
    if (pensionInflation && pensionInflation.origin !== 'default') {
      known.push({ key: 'retirementIncomeInflation', value: pensionInflation.value, origin: pensionInflation.origin });
    }
    // The planning age is resolved after the figures that can be missing, so
    // the form shows what the user said or saved for it here.
    const statedHorizon = overrides.lifeExpectancy !== undefined && overrides.sources.lifeExpectancy
      ? overrides.lifeExpectancy
      : undefined;
    const savedHorizonForForm = saved('planThroughAge');
    if (statedHorizon !== undefined) {
      known.push({ key: 'lifeExpectancy', value: statedHorizon, origin: 'user' });
    } else if (savedHorizonForForm && (retirementAge === undefined || savedHorizonForForm.value > retirementAge)) {
      known.push({ key: 'lifeExpectancy', value: savedHorizonForForm.value, origin: 'saved' });
    }
    return { missing, missingFields, known };
  }
  const claiming = socialSecurityQuote
    ? benefitAtClaimingAge({
      amount: socialSecurityQuote.amount,
      quotedAtAge: socialSecurityQuote.age,
      claimAge: socialSecurityStartAge!,
      currentAge: currentAge!,
    })
    : null;
  const ownIncomes: CoastFireIncome[] = [];
  if (socialSecurityAnnual > 0) {
    ownIncomes.push({
      kind: 'social_security',
      annualAmount: claiming?.amount ?? socialSecurityAnnual,
      startAge: socialSecurityStartAge!,
      inflationAdjusted: true,
    });
  }
  if (annualRetirementIncome > 0) {
    ownIncomes.push({
      kind: 'pension',
      annualAmount: annualRetirementIncome,
      startAge: pensionStartAge ?? retirementAge!,
      inflationAdjusted: pensionInflation?.value === 'rises_with_inflation',
    });
  }
  // The age to plan through, which the incomes are valued over and the
  // market-history test runs to: what the user said, then the one saved in
  // Your numbers when retirement does not already run past it, then the
  // convention. Always recorded as an assumption (including the default) so a
  // comparison that only moves the horizon cannot label the baseline as
  // "Planning through 0". With a partner, until the later of the two planning
  // ages.
  const savedHorizon = saved('planThroughAge');
  const userPlanThroughAge = take(
    'lifeExpectancy',
    savedHorizon && savedHorizon.value > retirementAge!
      ? savedHorizon
      : { value: Math.max(DEFAULT_LIFE_EXPECTANCY, retirementAge! + 1), origin: 'default' }
  )!;
  // Stated or saved only: the convention must not change variant ids or force
  // an explicit horizon onto the market-history request.
  const namedPlanThroughAge = assumptions.find((assumption) =>
    assumption.key === 'lifeExpectancy' && assumption.origin !== 'default'
  )?.value;
  // A spousal benefit needs to know when the user claims and whether their
  // own benefit is known (a stated zero is), even with none of their own.
  const userSocialSecurity = {
    claimAge: socialSecurityStartAge ??
      (overrides.socialSecurityStartAge !== undefined && overrides.sources.socialSecurityStartAge
        ? overrides.socialSecurityStartAge
        : saved('socialSecurityStartAge')?.value) ??
      DEFAULT_SOCIAL_SECURITY_START_AGE,
    known: assumptions.find((assumption) => assumption.key === 'socialSecurityAnnual')?.origin !== 'default',
  };
  const partner = resolvePartner({
    stated: snapshot.statedPartner,
    statedFigures: snapshot.statedFigures,
    retirementAge: retirementAge!,
    currentAge: currentAge!,
    ...(snapshot.userProfileValues?.householdStatus && { householdStatus: snapshot.userProfileValues.householdStatus }),
  });
  const resolvedPartner = partner && !('missingAge' in partner) ? partner : undefined;
  const timeline = resolvedPartner
    ? householdTimeline({ currentAge: currentAge!, userPlanThroughAge, partner: resolvedPartner.plan })
    : undefined;
  // With a partner, their incomes join the user's, each stopping with its
  // holder, with whatever spousal and survivor benefits a marriage adds.
  const couple = resolvedPartner && timeline
    ? householdIncomes({
      user: {
        socialSecurity: {
          ...(ownIncomes[0]?.kind === 'social_security' && {
            benefit: { annualAmount: ownIncomes[0].annualAmount, startAge: ownIncomes[0].startAge },
          }),
          ...userSocialSecurity,
        },
        ...(ownIncomes.find((income) => income.kind === 'pension') && {
          pension: ownIncomes.find((income) => income.kind === 'pension')!,
        }),
      },
      household: { ...resolvedPartner, timeline },
      currentAge: currentAge!,
    })
    : undefined;
  const household: PlannedHousehold | undefined = resolvedPartner && timeline && couple
    ? { ...resolvedPartner, timeline, socialSecurity: couple.socialSecurity }
    : undefined;
  const incomes: CoastFireIncome[] = couple?.incomes ?? ownIncomes;
  const survivorSpending = household ? survivorSpendingFor(household.plan, household.timeline) : undefined;

  return {
    inputs: {
      currentAge: currentAge!,
      retirementAge: retirementAge!,
      currentSavings: currentSavings!,
      annualRetirementSpending: annualRetirementSpending!,
      annualRetirementIncome,
      realReturnRate: realReturnRate!,
      withdrawalRate: withdrawalRate!,
    },
    incomes,
    ...(pensionInflation && { pensionInflation }),
    annualContribution: statedContribution ?? 0,
    assumptions,
    allocation: allocationFor(snapshot, overrides),
    ...(socialSecurityQuote && { socialSecurityQuote }),
    ...(claiming && { claiming }),
    ...(household && { household }),
    ...(partner && 'missingAge' in partner && { missingPartnerAge: true as const }),
    userSocialSecurity,
    planThroughAge: household?.timeline.horizonAge ?? userPlanThroughAge,
    ...(namedPlanThroughAge !== undefined && { userPlanThroughAge: namedPlanThroughAge }),
    ...(survivorSpending && { survivorSpending }),
  };
}

/** The preset mix: the user's words, then the one they saved, then the default. */
function allocationFor(
  snapshot: FinancialContextSnapshot,
  overrides: PlannedCoastFireOverrides
): ResolvedCoastFireVariant['allocation'] {
  if (overrides.allocation && overrides.sources.allocation) return { id: overrides.allocation, origin: 'user' };
  const savedMix = savedChoice(snapshot.statedFigures, 'allocation');
  if (savedMix && savedMix.value in QUICKPLAN_ALLOCATIONS) {
    return { id: savedMix.value as QuickPlanAllocationId, origin: 'saved', savedAt: savedMix.savedAt };
  }
  return { id: DEFAULT_ALLOCATION_ID, origin: 'default' };
}

/**
 * The first birthday at which savings could stop receiving new money and
 * still reach the retirement target by the retirement age.
 *
 * Year by year rather than solved in closed form: the condition compares a
 * balance that grows with contributions against a Coast FIRE number that rises
 * as retirement approaches, and a loop states that comparison exactly as the
 * user would check it. Reaching the target only in the retirement year is not
 * coasting -- it is contributing all the way -- so the search stops a year
 * short of it.
 */
export function coastFireContributionPath(
  metrics: CoastFireResult,
  annualContribution: number
): CoastFireContributionPath {
  const growth = 1 + metrics.realReturnRate / 100;
  const years = metrics.yearsToRetirement;
  let balance = metrics.currentSavings;
  let reached: Omit<CoastFireContributionPath, 'annualContribution' | 'reachedBeforeRetirement' | 'projectedSavingsAtRetirementWithContributions'> | undefined;

  for (let year = 1; year <= years; year++) {
    balance = balance * growth + annualContribution;
    if (reached || year === years) continue;
    const coastNumberNow = metrics.retirementTarget / growth ** (years - year);
    // A cent of tolerance so floating-point drift cannot postpone a match.
    if (balance + 0.005 >= coastNumberNow) {
      reached = {
        yearsUntilCoastFire: year,
        ageAtCoastFire: metrics.currentAge + year,
        savingsAtCoastFire: balance,
        coastFireNumberAtThatAge: coastNumberNow,
      };
    }
  }

  return {
    annualContribution,
    reachedBeforeRetirement: Boolean(reached),
    ...reached,
    projectedSavingsAtRetirementWithContributions: balance,
  };
}

function money(value: number): string {
  return `$${Math.round(value).toLocaleString('en-US')}`;
}

function rate(value: number): string {
  return `${Number(value.toFixed(2))}%`;
}

/** How a variant differs from its peer, named in the user's terms. */
function describeField(field: CoastFireOverrideField, value: number): string {
  switch (field) {
    case 'currentAge': return `age ${value}`;
    case 'retirementAge': return `retiring at ${value}`;
    case 'currentSavings': return `${money(value)} saved`;
    case 'annualRetirementSpending': return `spending ${money(value)} a year`;
    case 'annualRetirementIncome': return `a ${money(value)} pension`;
    case 'retirementIncomeStartAge': return `the pension from ${value}`;
    case 'socialSecurityAnnual': return `${money(value)} a year of Social Security`;
    case 'socialSecurityStartAge': return `claiming Social Security at ${value}`;
    case 'socialSecurityAmountAge': return `a Social Security figure for ${value}`;
    case 'realReturnRatePercent': return `${rate(value)} growth after inflation`;
    case 'withdrawalRatePercent': return `a ${rate(value)} withdrawal rate`;
    case 'annualContribution': return `investing ${money(value)} a year`;
    case 'lifeExpectancy': return `planning through ${value}`;
  }
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/** Mid-sentence, a label keeps its proper nouns: "claiming Social Security at 70". */
function decapitalize(value: string): string {
  return value.charAt(0).toLowerCase() + value.slice(1);
}

function variantLabel(own: ResolvedCoastFireVariant, peer: ResolvedCoastFireVariant | undefined): string {
  if (!peer) return 'Your Coast FIRE plan';
  const ownValues = new Map(own.assumptions.map((assumption) => [assumption.key, assumption.value]));
  const peerValues = new Map(peer.assumptions.map((assumption) => [assumption.key, assumption.value]));
  // A pension start that only follows the retirement age is not a second difference.
  const defaulted = (variant: ResolvedCoastFireVariant, field: CoastFireOverrideField) =>
    variant.assumptions.find((assumption) => assumption.key === field)?.origin === 'default';
  const differing = COAST_FIRE_OVERRIDE_FIELDS.filter((field) =>
    ownValues.get(field) !== peerValues.get(field) &&
    !(field === 'retirementIncomeStartAge' && defaulted(own, field) && defaulted(peer, field))
  );
  const described = differing.slice(0, 2).map((field) => describeField(field, ownValues.get(field) ?? 0));
  if (described.length < 2 && own.pensionInflation && own.pensionInflation.value !== peer.pensionInflation?.value) {
    described.push(own.pensionInflation.value === 'rises_with_inflation' ? 'a pension that rises with inflation' : 'a fixed pension');
  }
  if (described.length < 2 && own.allocation.id !== peer.allocation.id) {
    described.push(`the ${QUICKPLAN_ALLOCATIONS[own.allocation.id].label} mix`);
  }
  return described.length > 0 ? capitalize(described.join(' and ')) : 'Your Coast FIRE plan';
}

function variantKey(variant: ResolvedCoastFireVariant): string {
  return JSON.stringify({
    ...variant.inputs,
    incomes: variant.incomes,
    annualContribution: variant.annualContribution,
    allocation: variant.allocation.id,
    // Only when saved or with a partner, so any other case keeps its id.
    ...(variant.userPlanThroughAge !== undefined && { userPlanThroughAge: variant.userPlanThroughAge }),
    ...(variant.household && {
      partner: variant.household.plan,
      planThroughAge: variant.planThroughAge,
      survivorSpending: variant.survivorSpending ?? null,
    }),
  });
}

/**
 * What the historical test depends on. Contributions are not part of it --
 * coasting means none -- so a contribution range runs the test once.
 */
function historicalTestKey(variant: ResolvedCoastFireVariant): string {
  const { currentAge, retirementAge, currentSavings, annualRetirementSpending } = variant.inputs;
  return JSON.stringify([
    currentAge, retirementAge, currentSavings, annualRetirementSpending, variant.incomes, variant.allocation.id,
    variant.household?.plan ?? null, variant.planThroughAge,
  ]);
}

/**
 * The quick plan's own floor that a Coast FIRE input can fall below; under it
 * the test is skipped rather than run on an input it would have to bend. Its
 * income bounds are Coast FIRE's own.
 */
const QUICKPLAN_MINIMUM_ASSETS = 1_000;


/**
 * Leave today's savings alone until the retirement age, then spend from them,
 * across every historical sequence the record covers, on a preset mix.
 *
 * Never fails the Coast FIRE answer: the straight line is what was asked, and
 * this is the better reading of it. A skipped or failed test is simply absent.
 */
async function presetHistoricalTest(
  variant: ResolvedCoastFireVariant,
  runQuickPlan: QuickPlanRunner
): Promise<CoastFireHistoricalTest | undefined> {
  const inputs = variant.inputs;
  if (inputs.currentSavings < QUICKPLAN_MINIMUM_ASSETS) return undefined;
  // The user's own; the quick plan adds the partner's and the survivor rule itself.
  const own = variant.incomes.filter((income) => income.owner !== 'partner');
  const socialSecurity = own.find((income) => income.kind === 'social_security');
  const pension = own.find((income) => income.kind === 'pension');

  try {
    const run = await runQuickPlan({
      currentAge: inputs.currentAge,
      retirementAge: inputs.retirementAge,
      investableAssets: inputs.currentSavings,
      annualSpending: inputs.annualRetirementSpending,
      // Coasting: nothing more goes in.
      annualContributions: 0,
      // Each income on the schedule the straight line counted it on.
      socialSecurityAnnual: socialSecurity?.annualAmount ?? 0,
      socialSecurityStartAge: socialSecurity?.startAge ?? DEFAULT_SOCIAL_SECURITY_START_AGE,
      pensionAnnual: pension?.annualAmount ?? 0,
      pensionStartAge: pension?.startAge ?? inputs.retirementAge,
      pensionInflationAdjusted: pension?.inflationAdjusted ?? false,
      allocation: variant.allocation.id,
      // The planning age the straight line valued incomes through.
      ...(variant.userPlanThroughAge !== undefined && { lifeExpectancy: variant.userPlanThroughAge }),
    }, variant.household && {
      partner: variant.household.plan,
      origins: variant.household.origins,
      ...(variant.household.married && { married: variant.household.married }),
      userSocialSecurity: variant.userSocialSecurity,
    });
    const evaluated = run.primary;
    if (!evaluated) return undefined;
    const mix = QUICKPLAN_ALLOCATIONS[run.inputs.allocation];
    return {
      allocation: {
        id: mix.id,
        label: mix.label,
        description: mix.description,
        origin: variant.allocation.origin,
        ...(variant.allocation.savedAt && { savedAt: variant.allocation.savedAt }),
        usEquityPercent: Math.round(mix.usEquity * 100),
        bondsPercent: Math.round(mix.bonds * 100),
        cashPercent: Math.round(mix.cash * 100),
      },
      lifeExpectancy: run.household?.timeline.horizonAge ?? run.inputs.lifeExpectancy,
      survivalRate: evaluated.survivalRate,
      sequencesTested: evaluated.sequencesTested,
      sequencesSurvived: evaluated.sequencesSurvived,
      projectedPortfolioAtRetirement: evaluated.projectedPortfolioAtRetirement,
      firstStartMonth: run.history.firstStartMonth,
      lastStartMonth: run.history.lastStartMonth,
      horizonYears: run.history.horizonYears,
    };
  } catch (error) {
    console.warn('Ask Linc: Coast FIRE historical test skipped:', error);
    return undefined;
  }
}

function scenarioId(variant: ResolvedCoastFireVariant): string {
  const digest = createHash('sha256')
    .update(JSON.stringify({ version: COAST_FIRE_SCENARIO_VERSION, ...JSON.parse(variantKey(variant)) }))
    .digest('hex')
    .slice(0, 16);
  return `coast_fire_${digest}`;
}

function unavailable(
  startedAt: number,
  reason: string,
  missing?: { prompts: string[]; fields: CoastFireOverrideField[]; known: KnownInput[]; partnerAgeMissing?: boolean }
): UnavailableCoastFireScenarioExecution {
  return {
    version: COAST_FIRE_SCENARIO_VERSION,
    calculator: COAST_FIRE_CALCULATOR_ID,
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
  };
}

function joinList(items: string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`;
}

/** Run the stated Coast FIRE case and, when requested, one comparison case. */
export async function runCoastFireScenario(
  snapshot: FinancialContextSnapshot,
  plan: CoastFireScenarioPlan,
  runQuickPlan: QuickPlanRunner = runRetirementQuickPlan
): Promise<CoastFireScenarioExecution> {
  const startedAt = Date.now();
  const primaryOverrides = layer({ sources: {} }, plan.primary.overrides);
  const layers = [primaryOverrides];
  if (plan.comparison?.overrides) layers.push(layer(primaryOverrides, plan.comparison.overrides));

  // "What if I claim at 70?" moves the main case's benefit to another age; a
  // comparison that names its own figure, or the age it is for, does not.
  const comparisonOwn = plan.comparison?.overrides;
  const comparisonMovesSameBenefit = comparisonOwn !== undefined &&
    comparisonOwn.socialSecurityAnnual === undefined &&
    comparisonOwn.socialSecurityAmountAge === undefined;

  const resolved: ResolvedCoastFireVariant[] = [];
  const results: Array<{ variant: ResolvedCoastFireVariant; metrics: CoastFireIncomeResult }> = [];
  let comparisonUnavailableReason: string | undefined;
  let primaryQuoteAge: number | undefined;
  for (const [index, overrides] of layers.entries()) {
    const variant = resolveVariant(
      snapshot,
      overrides,
      index > 0 && comparisonMovesSameBenefit ? primaryQuoteAge : undefined
    );
    if ('missing' in variant) {
      // The comparison inherits every primary value, so it can only be missing
      // something the primary was missing too.
      return unavailable(
        startedAt,
        `Missing ${joinList(variant.missing)}.`,
        {
          prompts: variant.missing,
          fields: variant.missingFields,
          known: variant.known,
          partnerAgeMissing: partnerAgeMissing(snapshot.statedPartner, snapshot.statedFigures),
        }
      );
    }
    if (index === 0) primaryQuoteAge = variant.socialSecurityQuote?.age;
    try {
      const { currentAge, retirementAge, currentSavings, annualRetirementSpending, realReturnRate, withdrawalRate } = variant.inputs;
      // Valued through the market-history test's own horizon.
      const base = { currentAge, retirementAge, currentSavings, annualRetirementSpending, realReturnRate, withdrawalRate };
      // A stated planning age the retirement would already run past is a
      // figure the formula cannot use; say so rather than move it.
      if (variant.userPlanThroughAge !== undefined && variant.userPlanThroughAge <= retirementAge) {
        throw new CoastFireValidationError('The age to plan through must be after the retirement age.', 'lifeExpectancy');
      }
      const metrics = calculateCoastFireWithIncome(base, variant.incomes, {
        planThroughAge: variant.planThroughAge,
        ...(variant.survivorSpending && { spendingChange: variant.survivorSpending }),
      });
      if (resolved.some((existing) => variantKey(existing) === variantKey(variant))) continue;
      resolved.push(variant);
      results.push({ variant, metrics });
    } catch (error) {
      if (!(error instanceof CoastFireValidationError)) throw error;
      if (index === 0) return unavailable(startedAt, error.message);
      comparisonUnavailableReason = error.message;
    }
  }

  // Only where the holdings-based projection cannot give the history itself.
  const runHistory = presetStandInReason(snapshot) !== null;
  const testedKeys = new Set<string>();
  const scenarios: CoastFireScenarioResult[] = [];
  for (const [index, { variant, metrics }] of results.entries()) {
    const peer = resolved[index === 0 ? 1 : 0];
    // Once per distinct test: a contribution range would otherwise put the
    // same historical figures in the answer twice under two labels.
    const testKey = historicalTestKey(variant);
    const historicalTest = runHistory && !testedKeys.has(testKey)
      ? await presetHistoricalTest(variant, runQuickPlan)
      : undefined;
    testedKeys.add(testKey);
    scenarios.push({
      id: scenarioId(variant),
      label: variantLabel(variant, peer),
      assumptions: variant.assumptions,
      ...(variant.pensionInflation && { pensionInflation: variant.pensionInflation }),
      metrics,
      ...(variant.annualContribution > 0 && !metrics.hasReachedCoastFire && {
        contributionPath: coastFireContributionPath(metrics, variant.annualContribution),
      }),
      ...(historicalTest && { historicalTest }),
      ...(variant.claiming && { claiming: variant.claiming }),
      ...(variant.household && { household: variant.household }),
      ...(variant.missingPartnerAge && { missingPartnerAge: true as const }),
    });
  }

  return {
    version: COAST_FIRE_SCENARIO_VERSION,
    calculator: COAST_FIRE_CALCULATOR_ID,
    status: 'completed',
    computedAt: new Date().toISOString(),
    durationMs: Date.now() - startedAt,
    scenarios,
    ...(comparisonUnavailableReason && { comparisonUnavailableReason }),
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

/** Convert Coast FIRE inputs and outputs into canonical scenario evidence. */
export function coastFireScenarioCanonicalFacts(execution: CoastFireScenarioExecution): CanonicalFact[] {
  if (execution.status !== 'completed') return [];
  const facts: CanonicalFact[] = [];

  for (const scenario of execution.scenarios) {
    const prefix = `coast_fire_scenario_${factId(scenario.id.replace(/^coast_fire_/, ''))}`;
    const provenance = (kind: 'scenario_input' | 'scenario_calculation', source: string) => ({
      kind,
      source,
      scenarioId: scenario.id,
      calculatorId: COAST_FIRE_CALCULATOR_ID,
      calculatorVersion: execution.version,
    });
    const add = (
      kind: 'scenario_input' | 'scenario_calculation',
      suffix: string,
      label: string,
      value: number,
      unit: CanonicalFactUnit,
      calculation?: { formula: string; inputFactIds: string[] }
    ): string => {
      const id = `${prefix}_${suffix}`;
      if (!Number.isFinite(value)) return id;
      facts.push({
        id,
        label: `${scenario.label}: ${label}`,
        value,
        unit,
        provenance: {
          ...provenance(kind, kind === 'scenario_input'
            ? `coastFireScenario.${scenario.id}.assumptions`
            : `coastFireScenario.${scenario.id}`),
          ...calculation,
        },
      });
      return id;
    };

    const inputIds = new Map<CoastFireOverrideField, string>();
    for (const assumption of scenario.assumptions) {
      // No pension and no Social Security are defaults, not figures worth quoting.
      if ((assumption.key === 'annualRetirementIncome' || assumption.key === 'socialSecurityAnnual') && assumption.value === 0) continue;
      // A Social Security figure for another claiming age is not the one counted.
      const label = assumption.key === 'socialSecurityAnnual' && scenario.claiming
        ? `Social Security a year as given, for claiming at ${scenario.claiming.fromAge}, in today's dollars`
        : assumption.label;
      inputIds.set(
        assumption.key,
        add('scenario_input', factId(assumption.key), label, assumption.value, assumption.unit)
      );
    }
    if (scenario.claiming) {
      const { claiming } = scenario;
      add('scenario_calculation', 'social_security_at_claiming_age', `Social Security a year claimed at ${claiming.toAge}, by Social Security's claiming rules, in today's dollars`, claiming.amount, 'usd');
      add('scenario_calculation', 'social_security_claiming_change', `Change in annual Social Security from claiming at ${claiming.toAge} instead of ${claiming.fromAge}`, Number(((claiming.amount / claiming.fromAmount - 1) * 100).toFixed(4)), 'percent');
    }

    const m = scenario.metrics;
    add('scenario_calculation', 'years_to_retirement', 'Years until the retirement age', m.yearsToRetirement, 'years');
    if (m.annualRetirementIncome > 0) {
      add(
        'scenario_calculation',
        'income_counted',
        'Retirement income counted against spending once all of it has started, in today\'s dollars a year',
        roundMoney(m.annualRetirementIncome),
        'usd'
      );
      add(
        'scenario_calculation',
        'portfolio_spending_need',
        'Annual spending the portfolio must cover once all retirement income has started',
        roundMoney(m.portfolioSpendingNeed),
        'usd'
      );
    }
    for (const income of m.incomes ?? []) {
      // Counted at its own amount unless it is fixed, stops before the plan
      // ends, or is a survivor benefit spread over all of retirement.
      const ends = income.endAge !== undefined;
      if ((income.inflationAdjusted && !ends && income.kind !== 'survivor') || !(income.levelAmount > 0)) continue;
      const partner = income.owner === 'partner';
      // A survivor benefit paid alone until the survivor's own starts is its own segment.
      const bridging = income.kind === 'survivor' && ends;
      const name = income.kind === 'pension'
        ? 'pension'
        : income.kind === 'spousal'
          ? 'spousal benefit'
          : income.kind === 'survivor'
            ? bridging ? 'survivor benefit, before their own Social Security starts' : 'survivor benefit, above their own Social Security'
            : income.inflationAdjusted ? 'Social Security' : 'income';
      const whose = partner ? 'The partner\'s ' : income.kind === 'spousal' || income.kind === 'survivor' ? 'The user\'s ' : '';
      const what = income.inflationAdjusted ? `${whose}${name}` : `${whose}${partner ? 'fixed' : 'Fixed'} ${name}`;
      add(
        'scenario_calculation',
        `${partner ? 'partner_' : ''}${income.kind}${bridging ? '_before_own' : ''}_counted_value`,
        `${what} counted as, in today's dollars a year: its level worth over retirement through age ${m.planThroughAge}` +
          (income.inflationAdjusted ? '' : ` if prices rise ${rate(m.inflationPercent ?? 0)} a year`) +
          (ends ? `, paid until the user's age ${income.endAge}` : ''),
        roundMoney(income.levelAmount),
        'usd'
      );
    }
    if (m.levelSpending !== undefined && m.spendingChange) {
      add(
        'scenario_calculation',
        'spending_counted',
        'Spending counted against the target, in today\'s dollars a year: the level amount with the same value over ' +
          `retirement as the couple's spending until the user's age ${m.spendingChange.fromAge} and the survivor's after`,
        roundMoney(m.levelSpending),
        'usd'
      );
    }
    // The partner's incomes, when any income stops, and the couple's timeline.
    if (scenario.household) {
      const streams = (m.incomes ?? []).map((income) => toStream(income));
      const rows = [
        ...householdIncomeFactRows(streams, scenario.household),
        ...householdSocialSecurityFactRows(scenario.household),
        ...householdTimelineFactRows(scenario.household, m.spendingChange),
      ];
      for (const row of rows) add('scenario_input', row.suffix, row.label, row.value, row.unit);
    }
    if (m.inflationPercent !== undefined) {
      add('scenario_input', 'assumed_inflation', 'Inflation assumed to value a fixed pension', m.inflationPercent, 'percent');
    }
    if ((m.bridgeReserve ?? 0) > 0) {
      add(
        'scenario_calculation',
        'bridge_reserve',
        'Part of the target set aside at the retirement age to cover the years before retirement income starts, in today\'s dollars',
        roundMoney(m.bridgeReserve!),
        'usd'
      );
    }
    const targetId = add(
      'scenario_calculation',
      'retirement_target',
      'Portfolio needed at the retirement age',
      roundMoney(m.retirementTarget),
      'usd'
    );
    const coastNumberId = add(
      'scenario_calculation',
      'coast_fire_number',
      'Coast FIRE number: what would need to be invested today to reach the target with no further contributions',
      roundMoney(m.coastFireNumber),
      'usd'
    );
    const projectedId = add(
      'scenario_calculation',
      'projected_savings_at_retirement',
      'Current savings at the retirement age with no further contributions',
      roundMoney(m.projectedSavingsAtRetirement),
      'usd'
    );
    const savingsId = inputIds.get('currentSavings');
    if (savingsId) {
      const savingsFact = facts.find((fact) => fact.id === savingsId)!;
      const coastFact = facts.find((fact) => fact.id === coastNumberId)!;
      add(
        'scenario_calculation',
        'savings_versus_coast_fire_number',
        m.hasReachedCoastFire
          ? 'Amount current savings exceed the Coast FIRE number'
          : 'Amount current savings fall short of the Coast FIRE number',
        roundMoney(Math.abs(savingsFact.value - coastFact.value)),
        'usd',
        { formula: 'abs(input[0] - input[1])', inputFactIds: [savingsId, coastNumberId] }
      );
      if (m.coastFireNumber > 0) {
        add(
          'scenario_calculation',
          'share_of_coast_fire_number',
          'Current savings as a percentage of the Coast FIRE number',
          Number(((m.currentSavings / m.coastFireNumber) * 100).toFixed(4)),
          'percent'
        );
      }
    }
    const projectedFact = facts.find((fact) => fact.id === projectedId)!;
    const targetFact = facts.find((fact) => fact.id === targetId)!;
    add(
      'scenario_calculation',
      'projected_versus_target',
      m.projectedSavingsAtRetirement >= m.retirementTarget
        ? 'Amount current savings, with no further contributions, would exceed the target at the retirement age'
        : 'Amount current savings, with no further contributions, would fall short of the target at the retirement age',
      roundMoney(Math.abs(projectedFact.value - targetFact.value)),
      'usd',
      { formula: 'abs(input[0] - input[1])', inputFactIds: [projectedId, targetId] }
    );

    const path = scenario.contributionPath;
    if (path) {
      if (path.reachedBeforeRetirement) {
        add('scenario_calculation', 'years_until_coast_fire', 'Years of contributions until savings can coast', path.yearsUntilCoastFire!, 'years');
        add('scenario_calculation', 'age_at_coast_fire', 'Age at which savings can coast', path.ageAtCoastFire!, 'age');
        add(
          'scenario_calculation',
          'savings_at_coast_fire',
          'Savings at the age they can coast, with contributions until then',
          roundMoney(path.savingsAtCoastFire!),
          'usd'
        );
        add(
          'scenario_calculation',
          'coast_fire_number_at_that_age',
          'Coast FIRE number at the age savings can coast',
          roundMoney(path.coastFireNumberAtThatAge!),
          'usd'
        );
      }
      add(
        'scenario_calculation',
        'projected_savings_at_retirement_with_contributions',
        'Savings at the retirement age if contributions continue every year until then',
        roundMoney(path.projectedSavingsAtRetirementWithContributions),
        'usd'
      );
    }

    const test = scenario.historicalTest;
    if (test) {
      const mix = `Market-history test on the ${test.allocation.label} preset, coasting from today`;
      add('scenario_input', 'history_us_stock_share', `${mix}: share in US stocks`, test.allocation.usEquityPercent, 'percent');
      add('scenario_input', 'history_bond_share', `${mix}: share in bonds`, test.allocation.bondsPercent, 'percent');
      add('scenario_input', 'history_cash_share', `${mix}: share in cash`, test.allocation.cashPercent, 'percent');
      add('scenario_input', 'history_horizon_age', `${mix}: age the test runs through`, test.lifeExpectancy, 'age');
      add(
        'scenario_calculation',
        'history_survival_rate',
        `${mix}: share of tested historical sequences in which the money lasted through age ${test.lifeExpectancy}`,
        Number((test.survivalRate * 100).toFixed(4)),
        'percent'
      );
      add('scenario_calculation', 'history_sequences_tested', `${mix}: historical sequences tested`, test.sequencesTested, 'count');
      add('scenario_calculation', 'history_sequences_survived', `${mix}: sequences in which the money lasted`, test.sequencesSurvived, 'count');
      add(
        'scenario_calculation',
        'history_median_portfolio_at_retirement',
        `${mix}: median portfolio at the retirement age across those sequences, in today's dollars`,
        roundMoney(test.projectedPortfolioAtRetirement),
        'usd'
      );
    }
  }
  return facts;
}

/**
 * The evidence record is the execution itself: every number in it is already
 * a fact or a stated input, and it is small.
 */
export function compactCoastFireScenarioExecution(
  execution: CoastFireScenarioExecution
): CoastFireScenarioExecution {
  return execution;
}

function assumptionOf(scenario: CoastFireScenarioResult, key: CoastFireOverrideField): CoastFireAssumption | undefined {
  return scenario.assumptions.find((assumption) => assumption.key === key);
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function readableMonth(month: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  return match ? `${MONTH_NAMES[Number(match[2]) - 1]} ${match[1]}` : month;
}

/** What the market-history test ran, stated the way the straight line's assumptions are. */
function describeHistoricalTest(scenario: CoastFireScenarioResult): string {
  const test = scenario.historicalTest;
  if (!test) return '';
  const m = scenario.metrics;
  const household = scenario.household;
  // A survivor benefit paid in two parts is one income.
  const listed = (m.incomes ?? []).filter((income, index, all) =>
    all.findIndex((other) => other.owner === income.owner && other.kind === income.kind) === index);
  const incomes = listed.map((income) => {
    const name = incomeName(income.kind);
    if (household && income.owner === 'partner') return `your partner's ${name} from ${partnerAgeAt(income.startAge, household)}`;
    if (household) return `your ${name} from ${income.startAge}`;
    return `${income.kind === 'social_security' ? 'Social Security' : 'the pension'} from ${income.startAge}`;
  });
  const survivor = m.spendingChange ? ` (${money(m.spendingChange.annualAmount)} from ${m.spendingChange.fromAge})` : '';
  const spending = incomes.length > 0
    ? `paying ${money(m.annualRetirementSpending)} a year${survivor}, part of it from ${joinList(incomes)}`
    : m.annualRetirementIncome > 0
      ? `paying ${money(m.annualRetirementSpending)} a year, ${money(m.annualRetirementIncome)} of it from retirement income`
      : `paying ${money(m.annualRetirementSpending)} a year${survivor}`;
  const mixDefault = test.allocation.origin === 'default'
    ? ` You did not name a mix, so I used the ${test.allocation.label} preset.`
    : '';
  return ` The market-history test ran the ${test.allocation.label} preset (${test.allocation.description}), not ` +
    `what you hold: ${money(m.currentSavings)} left alone from ${m.currentAge} to ${m.retirementAge}, then ` +
    `${spending} through ${household ? 'your age' : 'age'} ${test.lifeExpectancy}, against every overlapping ${test.horizonYears}-year stretch ` +
    `of US market returns and inflation that began between ${readableMonth(test.firstStartMonth)} and ` +
    `${readableMonth(test.lastStartMonth)}.${mixDefault}`;
}

/**
 * Each income, when it starts, what a fixed pension is counted as and why, the
 * reserve for the years before income starts, and which terms were assumed --
 * the parts users find hardest to model and most need to check.
 */
function describeIncomes(scenario: CoastFireScenarioResult): string {
  const m = scenario.metrics;
  const terms = m.incomes;
  if (!terms) {
    // Recorded at version 1: one income, from the retirement date.
    return m.annualRetirementIncome > 0
      ? ` It counts ${money(m.annualRetirementIncome)} a year of retirement income from ${m.retirementAge}, in today's dollars.`
      : ' No retirement income is counted.';
  }
  const household = scenario.household;
  if (terms.length === 0) {
    return household
      ? ' No Social Security or pension is counted for either of you, so the portfolio pays for all of retirement.'
      : ' No Social Security or pension is counted, so the portfolio pays for all of retirement.';
  }
  const sentences: string[] = [];
  for (const term of terms) {
    const stream = toStream(term);
    const until = incomeEndClause(stream, household);
    // A benefit that stops early is counted at the level worth of what it pays.
    const stopsEarly = term.inflationAdjusted && term.endAge !== undefined && term.levelAmount > 0
      ? ` Since it stops then, I counted it as ${money(term.levelAmount)} a year: its average worth through age ${m.planThroughAge}.`
      : '';
    // The survivor benefit is part of the couple's timeline, below.
    if (term.kind === 'survivor') continue;
    if (household && term.kind === 'spousal') {
      sentences.push(`${capitalize(describeSpousalIncome(stream, household))}.${stopsEarly}`);
      continue;
    }
    if (household && term.owner === 'partner') {
      const clause = describePartnerIncome(stream, household);
      const fixed = !term.inflationAdjusted && term.levelAmount > 0
        ? ` I counted it as ${money(term.levelAmount)} a year in today's dollars: its average worth through age ` +
          `${m.planThroughAge} if prices rise ${rate(m.inflationPercent ?? 0)} a year.`
        : '';
      sentences.push(`${capitalize(clause)}.${stopsEarly}${fixed}`);
      continue;
    }
    if (term.kind === 'social_security') {
      const startAssumed = assumptionOf(scenario, 'socialSecurityStartAge')?.origin === 'default'
        ? ` (you did not say when it starts, so I used ${DEFAULT_SOCIAL_SECURITY_START_AGE})`
        : '';
      sentences.push(`${household ? 'Your Social Security' : 'Social Security'} of ${money(term.annualAmount)} a year in today's dollars starts at ${term.startAge}${startAssumed}${until}.${stopsEarly}`);
      continue;
    }
    const startAssumed = assumptionOf(scenario, 'retirementIncomeStartAge')?.origin === 'default'
      ? ' I assumed it starts when you retire.'
      : '';
    const inflationAssumed = scenario.pensionInflation?.origin === 'default'
      ? ' You did not say whether it rises with inflation, so I assumed it does not; tell me if it has a cost-of-living adjustment.'
      : '';
    const pension = household ? 'Your pension' : 'A pension';
    sentences.push(term.inflationAdjusted
      ? `${pension} of ${money(term.annualAmount)} a year in today's dollars starts at ${term.startAge} and rises with inflation${until}.${stopsEarly}${startAssumed}${inflationAssumed}`
      : `${pension} of ${money(term.annualAmount)} a year starts at ${term.startAge} as a fixed amount${until}. It buys less every year ` +
        `prices rise, so I counted it as ${money(term.levelAmount)} a year in today's dollars: its average worth through age ` +
        `${m.planThroughAge} if prices rise ${rate(m.inflationPercent ?? 0)} a year.${startAssumed}${inflationAssumed}`);
  }
  // What every survivor benefit, paid only from the first death, was counted as.
  const survivorLevel = terms
    .filter((term) => term.kind === 'survivor')
    .reduce((sum, term) => sum + term.levelAmount, 0);
  if (household && survivorLevel > 0) {
    sentences.push(`Since the survivor benefit is paid only after the first death, I counted it as ${money(survivorLevel)} ` +
      `a year: its average worth over retirement through age ${m.planThroughAge}.`);
  }
  const gaps = terms
    .filter((term) => term.gapYears > 0)
    .map((term) => {
      const name = term.kind === 'social_security' ? 'Social Security' : 'the pension';
      const whose = !household ? name : term.owner === 'partner'
        ? `your partner's ${incomeName(term.kind)}`
        : `your ${incomeName(term.kind)}`;
      return `${whose}'s share for the ${term.gapYears === 1 ? 'year' : `${term.gapYears} years`} before it starts`;
    });
  if ((m.bridgeReserve ?? 0) > 0 && gaps.length > 0) {
    sentences.push(`The target includes ${money(m.bridgeReserve!)} set aside at ${m.retirementAge} to pay ${joinList(gaps)}.`);
  }
  return ` ${sentences.join(' ')}`;
}

/** An income's name in a sentence, after "your" or "your partner's". */
function incomeName(kind: CoastFireIncome['kind']): string {
  switch (kind) {
    case 'pension': return 'pension';
    case 'spousal': return 'spousal benefit';
    case 'survivor': return 'survivor benefit';
    default: return 'Social Security';
  }
}

/**
 * The couple: the timeline, what changes at the first death, and the level
 * spending a survivor's lower spending was counted as; or, without the
 * partner's age, that their incomes were left out.
 */
function describeHousehold(scenario: CoastFireScenarioResult): string {
  if (scenario.missingPartnerAge) return ` ${MISSING_PARTNER_AGE_SENTENCE}`;
  const household = scenario.household;
  if (!household) return '';
  const m = scenario.metrics;
  const clauses = describeHouseholdTimeline(household, {
    annual: m.annualRetirementSpending,
    ...(m.spendingChange && { survivor: m.spendingChange }),
  }, m.incomes?.map((income) => ({
    kind: income.kind,
    ...(income.endAge !== undefined && { endAge: income.endAge }),
  })));
  const level = m.levelSpending !== undefined && m.spendingChange
    ? ` I counted spending as ${money(m.levelSpending)} a year: the level amount with the same value over retirement as ` +
      `${money(m.annualRetirementSpending)} a year until your ${m.spendingChange.fromAge} and ${money(m.spendingChange.annualAmount)} after.`
    : '';
  return `${clauses.map((clause) => ` ${capitalize(clause)}.`).join('')}${level}`;
}

/**
 * Deterministic disclosure appended to every Coast FIRE answer: what the
 * straight line assumed, which values were defaulted or taken from elsewhere,
 * and that changing any of them re-runs it. When figures were missing, this is
 * instead the ask for them.
 */
export function describeCoastFireScenarioExecution(execution: CoastFireScenarioExecution): string | null {
  if (execution.status === 'unavailable') {
    if (execution.missingInputs?.length) {
      const items = execution.missingInputs;
      const partner = execution.partnerAgeMissing ? ' Tell me your partner\'s age too and I will include them.' : '';
      return `To work out your Coast FIRE number I need ${joinList(items)}. ` +
        `Reply with ${items.length === 1 ? 'that' : 'those'} and I will run it — no linked accounts needed.${partner}`;
    }
    return `I could not run the Coast FIRE calculation: ${execution.reason}`;
  }
  const [primary] = execution.scenarios;
  if (!primary) return null;

  const m = primary.metrics;
  const income = describeIncomes(primary);
  const household = describeHousehold(primary);
  const savings = assumptionOf(primary, 'currentSavings');
  const savingsNotice = savings?.origin !== 'snapshot'
    ? ''
    : savings.basis === 'entered'
      ? ` Your savings figure is the ${money(savings.value)} of investments you entered, which counts every investment balance you entered, not only retirement accounts.`
      : savings.basis === 'linked_and_entered'
        ? ` Your savings figure is your investment total of ${money(savings.value)}: every linked investment account plus the investment balances you entered, not only retirement accounts.`
        : ` Your savings figure is your connected investment total of ${money(savings.value)}, which counts every linked investment account, not only retirement accounts.`;
  const age = assumptionOf(primary, 'currentAge');
  const ageNotice = age?.origin === 'profile' ? ` Your age, ${age.value}, is the one you told me earlier.` : '';
  const retirementAgeNotice = assumptionOf(primary, 'retirementAge')?.origin === 'default'
    ? ` You did not name a retirement age, so I used ${CONVENTIONAL_RETIREMENT_AGE}.`
    : '';
  const spending = assumptionOf(primary, 'annualRetirementSpending');
  const spendingNotice = spending?.origin !== 'snapshot'
    ? ''
    : spending.basis === 'entered'
      ? ` Retirement spending is the monthly spending you set on the Finances page, ${money(spending.value)} a year; ` +
        'I assumed retirement costs the same.'
      : ` Retirement spending is what you spend now according to your linked accounts, ${money(spending.value)} a year; ` +
        'I assumed retirement costs the same.';
  const defaults = [
    assumptionOf(primary, 'realReturnRatePercent')?.origin === 'default'
      ? `a growth rate, so I used ${rate(DEFAULT_COAST_FIRE_REAL_RETURN_PERCENT)}`
      : null,
    assumptionOf(primary, 'withdrawalRatePercent')?.origin === 'default'
      ? `a withdrawal rate, so I used ${rate(DEFAULT_COAST_FIRE_WITHDRAWAL_RATE_PERCENT)}`
      : null,
  ].filter((item): item is string => Boolean(item));
  const defaultsNotice = defaults.length > 0 ? ` You did not give ${defaults.join(', or ')}.` : '';
  const contributionNotice = execution.scenarios.some((scenario) => scenario.contributionPath)
    ? ' Contributions are added once a year, and the Coast FIRE age is the first birthday by which savings could stop receiving new money and still reach the target.'
    : '';
  const comparison = execution.scenarios.length > 1
    ? ` I compared ${execution.scenarios.map((scenario) => decapitalize(scenario.label)).join(' with ')}.`
    : '';
  // Each benefit moved to another claiming age, once, with both amounts.
  const claimingNotice = [...new Set(execution.scenarios.flatMap((scenario) =>
    scenario.claiming ? [` ${describeClaimingAdjustment(scenario.claiming)}`] : []
  ))].join('');
  const comparisonNotice = execution.comparisonUnavailableReason
    ? ` I could not run the comparison case: ${execution.comparisonUnavailableReason}`
    : '';

  const tested = execution.scenarios.filter((scenario) => scenario.historicalTest);
  const historyNotice = tested.map(describeHistoricalTest).join('');
  const savedMix = primary.historicalTest?.allocation;
  const savedNotice = describeSavedFigures([
    ...primary.assumptions.flatMap((assumption) => {
      const phrase = assumption.origin === 'saved' && assumption.savedAt
        ? SAVED_PHRASES[assumption.key]?.(assumption.value)
        : undefined;
      return phrase ? [{ phrase, savedAt: assumption.savedAt! }] : [];
    }),
    ...(savedMix?.origin === 'saved' && savedMix.savedAt
      ? [{ phrase: `the ${savedMix.label} preset`, savedAt: savedMix.savedAt }]
      : []),
    ...(primary.pensionInflation?.origin === 'saved' && primary.pensionInflation.savedAt
      ? [{
          phrase: primary.pensionInflation.value === 'rises_with_inflation'
            ? 'the pension rising with inflation'
            : 'the pension as a fixed amount',
          savedAt: primary.pensionInflation.savedAt,
        }]
      : []),
  ]);
  const straightLine = tested.length > 0
    ? ' The Coast FIRE number itself is a single straight line — the same return every year. Neither part models taxes or fees.'
    : ' It is a single straight line — the same return every year, with no taxes, fees or market swings.';

  return `Coast FIRE assumptions: ${rate(m.realReturnRate)} a year after inflation and a ${rate(m.withdrawalRate)} ` +
    `withdrawal rate.${income}${household}${claimingNotice}${comparison}${retirementAgeNotice}${spendingNotice}` +
    `${savingsNotice}${ageNotice}${savedNotice}` +
    `${defaultsNotice}${contributionNotice}${comparisonNotice}${historyNotice}${straightLine} ` +
    'Change any of these and I will re-run it.';
}

/**
 * The Coast FIRE form: every input the calculation reads, each with the
 * sentence it is sent in. The wording is what the planner is told to look for
 * ("annual spending once retired, in today's dollars"), so a submitted form
 * reads back as exactly the figures it held.
 */
const COAST_FIRE_INPUT_REQUEST: InputRequestSpec = {
  calculatorId: COAST_FIRE_CALCULATOR_ID,
  title: 'Your Coast FIRE figures',
  question: 'What is my Coast FIRE number?',
  submitLabel: 'Work out my Coast FIRE number',
  fields: [
    {
      id: 'currentAge',
      label: 'Your age',
      kind: 'age',
      ...OVERRIDE_RANGES.currentAge,
      sentence: 'I am {value} years old.',
    },
    {
      id: 'currentSavings',
      label: 'Invested for retirement today',
      kind: 'usd',
      ...OVERRIDE_RANGES.currentSavings,
      sentence: 'I have {value} invested for retirement today.',
    },
    {
      id: 'annualRetirementSpending',
      label: 'What you expect to spend a year once you stop working',
      kind: 'usd_per_year',
      ...OVERRIDE_RANGES.annualRetirementSpending,
      sentence: 'I expect to spend {value} a year once I stop working, in today\'s dollars.',
    },
    {
      id: 'retirementAge',
      label: 'Age you plan to retire',
      kind: 'age',
      ...OVERRIDE_RANGES.retirementAge,
      sentence: 'I plan to retire at {value}.',
      defaultNote: `${CONVENTIONAL_RETIREMENT_AGE} if left blank`,
    },
    {
      id: 'socialSecurityAnnual',
      label: 'Social Security a year',
      kind: 'usd_per_year',
      ...OVERRIDE_RANGES.socialSecurityAnnual,
      sentence: 'I expect {value} a year from Social Security, in today\'s dollars.',
      defaultNote: 'None if left blank',
    },
    {
      id: 'socialSecurityStartAge',
      label: 'Age Social Security starts',
      kind: 'age',
      ...OVERRIDE_RANGES.socialSecurityStartAge,
      sentence: 'My Social Security starts at {value}.',
      defaultNote: `${DEFAULT_SOCIAL_SECURITY_START_AGE} if left blank`,
    },
    {
      id: 'annualRetirementIncome',
      label: 'Pension or other income a year',
      kind: 'usd_per_year',
      ...OVERRIDE_RANGES.annualRetirementIncome,
      sentence: 'I expect a pension or other income of {value} a year.',
      defaultNote: 'None if left blank',
    },
    {
      id: 'retirementIncomeStartAge',
      label: 'Age the pension starts',
      kind: 'age',
      ...OVERRIDE_RANGES.retirementIncomeStartAge,
      sentence: 'My pension starts at {value}.',
      defaultNote: 'When you retire, if left blank',
    },
    {
      id: 'retirementIncomeInflation',
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
      id: 'annualContribution',
      label: 'What you invest a year now',
      kind: 'usd_per_year',
      ...OVERRIDE_RANGES.annualContribution,
      sentence: 'I invest {value} a year now.',
      defaultNote: 'Optional: shows when you could stop adding to it',
    },
    {
      id: 'realReturnRatePercent',
      label: 'Growth a year after inflation',
      kind: 'percent',
      ...OVERRIDE_RANGES.realReturnRatePercent,
      sentence: 'Assume {value} growth a year after inflation.',
      defaultNote: `${DEFAULT_COAST_FIRE_REAL_RETURN_PERCENT}% if left blank`,
    },
    {
      id: 'withdrawalRatePercent',
      label: 'Withdrawal rate in retirement',
      kind: 'percent',
      ...OVERRIDE_RANGES.withdrawalRatePercent,
      sentence: 'Use a {value} withdrawal rate.',
      defaultNote: `${DEFAULT_COAST_FIRE_WITHDRAWAL_RATE_PERCENT}% if left blank`,
    },
    {
      id: 'lifeExpectancy',
      label: 'Plan through age',
      kind: 'age',
      ...OVERRIDE_RANGES.lifeExpectancy,
      // The stated plan's own sentence, so both read back the same way.
      sentence: 'Plan through age {value}.',
      defaultNote: `${DEFAULT_LIFE_EXPECTANCY} if left blank`,
    },
  ],
};

/** The form for a Coast FIRE run waiting on figures, or null for one that ran or failed otherwise. */
export function coastFireInputRequest(execution: CoastFireScenarioExecution): InputRequest | null {
  // A number worked out without the partner asks for their age alone; one
  // that could not count spousal or survivor benefits asks whether they are married.
  if (execution.status === 'completed') {
    const primary = execution.scenarios[0];
    return householdInputRequest(
      primary?.missingPartnerAge ? { missingAge: true } : primary?.household,
      COAST_FIRE_CALCULATOR_ID,
      COAST_FIRE_INPUT_REQUEST.question
    );
  }
  if (!execution.missingFields?.length) return null;
  // Without an age there is no telling whether the conventional retirement
  // age is still ahead, so both were asked for. Given an age under it, a blank
  // retirement age is the default, so the form does not insist on one — until
  // the entered age is at or past that threshold, when the default no longer
  // applies and the field becomes needed again (requireWhen).
  const ageMissing = execution.missingFields.includes('currentAge');
  const missing = ageMissing
    ? execution.missingFields.filter((field) => field !== 'retirementAge')
    : execution.missingFields;
  const request = buildInputRequest(
    execution.partnerAgeMissing ? withPartnerAgeField(COAST_FIRE_INPUT_REQUEST) : COAST_FIRE_INPUT_REQUEST,
    missing,
    execution.knownInputs
  );
  if (!request || !ageMissing) return request;
  return {
    ...request,
    fields: request.fields.map((field) =>
      field.id !== 'retirementAge'
        ? field
        : {
            ...field,
            defaultNote: `${CONVENTIONAL_RETIREMENT_AGE} if you are under ${CONVENTIONAL_RETIREMENT_AGE}`,
            requireWhen: { fieldId: 'currentAge', minimum: CONVENTIONAL_RETIREMENT_AGE },
          }
    ),
  };
}

/** Where each figure the user states would be kept in Your numbers. */
const SAVE_KEYS: Partial<Record<CoastFireOverrideField, SaveOfferKey>> = {
  retirementAge: 'retirementAge',
  annualRetirementSpending: 'annualRetirementSpending',
  annualRetirementIncome: 'retirementIncome',
  retirementIncomeStartAge: 'retirementIncomeStartAge',
  socialSecurityAnnual: 'socialSecurityAnnual',
  socialSecurityStartAge: 'socialSecurityStartAge',
  annualContribution: 'annualContribution',
  lifeExpectancy: 'planThroughAge',
  currentSavings: 'investedBalance',
};

/**
 * What the main case took from the user's own words, for "Use these next
 * time?". A comparison's values are what-ifs and are never offered.
 */
export function coastFireSavableFigures(execution: CoastFireScenarioExecution): SavableFigure[] {
  if (execution.status !== 'completed') return [];
  const [primary] = execution.scenarios;
  if (!primary) return [];
  const figures: SavableFigure[] = primary.assumptions.flatMap((assumption) => {
    const key = assumption.origin === 'user' ? SAVE_KEYS[assumption.key] : undefined;
    return key ? [{ key, value: assumption.value }] : [];
  });
  const mix = primary.historicalTest?.allocation;
  if (mix?.origin === 'user') figures.push({ key: 'allocation', value: mix.id });
  if (primary.pensionInflation?.origin === 'user') {
    figures.push({ key: 'retirementIncomeInflation', value: primary.pensionInflation.value });
  }
  return [
    ...withClaimedBenefit(figures, primary.claiming, primary.assumptions.some((assumption) =>
      assumption.key === 'socialSecurityAmountAge' && assumption.origin === 'user'
    )),
    ...(primary.household ? partnerSavableFigures(primary.household) : []),
  ];
}

export const coastFireScenarioCalculator: ScenarioCalculatorDefinition<
  CoastFireScenarioPlan,
  CoastFireScenarioExecution,
  CoastFireScenarioExecution
> = {
  id: COAST_FIRE_CALCULATOR_ID,
  version: COAST_FIRE_SCENARIO_VERSION,
  label: 'Coast FIRE',
  description: 'Whether invested savings can stop receiving contributions and still reach a retirement target, and when contributions get them there.',
  // Coast FIRE itself needs nothing linked. The retirement pack rides along so
  // a user who has linked holdings also gets the historical projection of
  // leaving them alone until retirement -- the better answer the
  // straight line stands in for -- and a user who has not is told what linking
  // would add instead of being refused.
  requiredPacks: ['retirement_analysis'],
  supportedOverrides: [
    { id: 'current_age', label: 'Current age', description: 'Age today.', valueType: 'age', minimum: 18, maximum: 90 },
    { id: 'retirement_age', label: 'Retirement age', description: 'Age at which the target must be reached.', valueType: 'age', minimum: 30, maximum: 95 },
    { id: 'current_savings', label: 'Invested retirement savings', description: 'Invested today; defaults to the investment total from linked accounts and balances the user entered.', valueType: 'currency', minimum: 0, maximum: 100_000_000 },
    { id: 'annual_retirement_spending', label: 'Annual retirement spending', description: 'In today\'s dollars.', valueType: 'currency', minimum: 1_000, maximum: 10_000_000 },
    { id: 'annual_retirement_income', label: 'Pension or other income a year', description: 'Income other than Social Security that reduces what the portfolio must cover once it starts.', valueType: 'currency', minimum: 0, maximum: 10_000_000 },
    { id: 'retirement_income_start_age', label: 'Pension start age', description: 'Age the pension begins.', valueType: 'age', minimum: 30, maximum: 95 },
    { id: 'retirement_income_inflation', label: 'Pension inflation treatment', description: 'A fixed dollar amount, or today\'s dollars rising with inflation.', valueType: 'enum', options: ['fixed', 'rises_with_inflation'] },
    { id: 'social_security_annual', label: 'Annual Social Security', description: 'In today\'s dollars; reduces what the portfolio must cover once it starts.', valueType: 'currency', minimum: 0, maximum: 250_000 },
    { id: 'social_security_start_age', label: 'Social Security start age', description: 'Age the benefit begins; a benefit for another age is rescaled by Social Security\'s claiming rules.', valueType: 'age', minimum: 50, maximum: 80 },
    { id: 'social_security_amount_age', label: 'Age the Social Security figure is for', description: 'The claiming age a stated benefit was quoted for, when it differs from the start age.', valueType: 'age', minimum: EARLIEST_CLAIMING_AGE, maximum: LATEST_CREDIT_AGE },
    { id: 'real_return_rate_percent', label: 'Growth after inflation', description: 'Percentage points; 5% is 5.', valueType: 'percentage', minimum: 0, maximum: 12 },
    { id: 'withdrawal_rate_percent', label: 'Withdrawal rate', description: 'Percentage points; 4% is 4.', valueType: 'percentage', minimum: 2, maximum: 8 },
    { id: 'annual_contribution', label: 'Annual contributions', description: 'What the user invests each year now; used to find when savings can coast.', valueType: 'currency', minimum: 0, maximum: 10_000_000 },
    { id: 'life_expectancy', label: 'Planning horizon age', description: 'The age incomes are valued through and the market-history test runs to.', valueType: 'age', minimum: 60, maximum: 110 },
    { id: 'allocation', label: 'Preset asset mix', description: 'The mix for the market-history test that runs while holdings cannot be: conservative, balanced, or growth.', valueType: 'enum', options: ['conservative', 'balanced', 'growth'] },
  ],
  defaults: [
    { id: 'real_return_rate_percent', value: DEFAULT_COAST_FIRE_REAL_RETURN_PERCENT, description: 'The public Coast FIRE calculator\'s default growth after inflation.' },
    { id: 'withdrawal_rate_percent', value: DEFAULT_COAST_FIRE_WITHDRAWAL_RATE_PERCENT, description: 'The public Coast FIRE calculator\'s default withdrawal rate.' },
    { id: 'annual_retirement_income', value: 0, description: 'No pension unless the user states one.' },
    { id: 'retirement_income_start_age', value: 'retirement age', description: 'Used only when a pension is stated without a start age.' },
    { id: 'retirement_income_inflation', value: 'fixed', description: 'A stated pension is a fixed dollar amount unless the user says it rises with inflation.' },
    { id: 'social_security_annual', value: 0, description: 'No Social Security unless the user states it.' },
    { id: 'social_security_start_age', value: DEFAULT_SOCIAL_SECURITY_START_AGE, description: 'Used only when a benefit is stated without a start age.' },
    { id: 'annual_contribution', value: 0, description: 'No contribution path unless the user states what they invest.' },
    { id: 'allocation', value: DEFAULT_ALLOCATION_ID, description: 'The public retirement calculator\'s default preset, for the market-history test.' },
    { id: 'life_expectancy', value: DEFAULT_LIFE_EXPECTANCY, description: 'Planning horizon when none is stated or saved.' },
  ],
  outputs: [
    { id: 'retirement_target', label: 'Portfolio needed at retirement', unit: 'usd', scope: 'variant', description: 'Spending not covered once all retirement income has started, divided by the withdrawal rate, plus a reserve for the years before income starts.' },
    { id: 'coast_fire_number', label: 'Coast FIRE number', unit: 'usd', scope: 'variant', description: 'The retirement target discounted to today at the real return.' },
    { id: 'projected_savings_at_retirement', label: 'Savings at retirement with no further contributions', unit: 'usd', scope: 'variant', description: 'Current savings compounded at the real return.' },
    { id: 'savings_versus_coast_fire_number', label: 'Gap to the Coast FIRE number', unit: 'usd', scope: 'variant', description: 'Absolute difference between savings and the Coast FIRE number.' },
    { id: 'share_of_coast_fire_number', label: 'Share of the Coast FIRE number', unit: 'percent', scope: 'variant', description: 'Savings divided by the Coast FIRE number.' },
    { id: 'age_at_coast_fire', label: 'Age savings can coast', unit: 'age', scope: 'variant', description: 'First birthday at which contributions could stop and the target still be reached.' },
    { id: 'projected_savings_at_retirement_with_contributions', label: 'Savings at retirement with contributions', unit: 'usd', scope: 'variant', description: 'Savings if the stated contributions continue until retirement.' },
    { id: 'history_survival_rate', label: 'Market-history survival share', unit: 'percent', scope: 'variant', description: 'With no holdings linked: share of historical sequences in which today\'s savings, left alone on a preset mix until retirement and then spent, lasted the horizon.' },
    { id: 'history_median_portfolio_at_retirement', label: 'Market-history median at retirement', unit: 'usd', scope: 'variant', description: 'Median real portfolio at the retirement age across those sequences.' },
  ],
  planner: {
    jsonSchema: COAST_FIRE_SCENARIO_PLAN_JSON_SCHEMA,
    instructions: `When the user asks whether they have reached Coast FIRE, what their Coast FIRE number is, when they will reach Coast FIRE, or changes an input of a Coast FIRE answer earlier in this decision, set requested=true. Coast FIRE means having enough invested today that growth alone, with no further contributions, reaches the retirement target by the retirement age. Fill primary.overrides with values the user stated anywhere in this decision, the newest revision winning, and put the user's short wording in overrides.sources: currentAge, retirementAge, currentSavings (invested retirement savings today), annualRetirementSpending (annual spending once retired, in today's dollars), annualRetirementIncome (a pension, annuity or other income in retirement that is not Social Security, per year), retirementIncomeStartAge (when that income starts), retirementIncomeInflation (fixed when the user says the pension is a fixed amount or has no cost-of-living adjustment, rises_with_inflation when they say it has a cost-of-living adjustment or rises with inflation; otherwise unspecified with a null source), socialSecurityAnnual and socialSecurityStartAge (Social Security only; socialSecurityStartAge is when the user claims it), socialSecurityAmountAge (only when the user says which claiming age their Social Security figure is for, such as a statement showing $2,500 a month at 67; otherwise null), realReturnRatePercent (growth after inflation in percentage points: 5% is 5, never 0.05), withdrawalRatePercent (percentage points: 4% is 4), annualContribution (what the user invests per year now; only used to find when they reach Coast FIRE), and lifeExpectancy (the age the user wants their plan to run through, only when they say one). Until holdings are linked (or while none of the linked ones can be simulated), application code also runs the savings through market history on a preset mix: set allocation to conservative (40% US stocks / 50% bonds / 10% cash), balanced (60% / 35% / 5%) or growth (80% / 18% / 2%) when the user, or an earlier answer in this decision, names one of those presets, and otherwise to unspecified with a null source. When the user gives a range for one value, put the low end in primary and only the high end in comparison. When the newest message changes an input of the earlier Coast FIRE case, put the earlier case in primary and only the changed values in comparison; for claiming Social Security at another age, that is only socialSecurityStartAge, never a new amount, because application code applies Social Security's own claiming rules to the benefit. A spouse's or partner's age, Social Security, pension or planning age is never one of these fields; it belongs in the retirement inputs' partner fields, which application code reads for this calculation too. Never estimate or supply typical values; application code applies disclosed defaults and asks for anything else missing, so request the calculation even when figures are missing. A Coast FIRE question does not by itself request any other calculator. The overrides object and every field and source are always present; use null for absent values. When there is no Coast FIRE question, set requested=false, allocation=unspecified, retirementIncomeInflation=unspecified, and null for every other value and every source in both variants.`,
    parsePlan: parseCoastFireScenarioPlan,
  },
  execution: {
    progressMessage: 'Working out your Coast FIRE number',
    failureMessage: 'The Coast FIRE calculation could not be completed.',
  },
  execute: (snapshot, plan) => runCoastFireScenario(snapshot, plan),
  unavailable: (startedAt, reason) => unavailable(startedAt, reason),
  inputRequest: coastFireInputRequest,
  savableFigures: coastFireSavableFigures,
  compactEvidence: compactCoastFireScenarioExecution,
  canonicalFacts: coastFireScenarioCanonicalFacts,
  describeAssumptions: describeCoastFireScenarioExecution,
};
