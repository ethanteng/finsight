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
  type RetirementQuickPlanRequest,
  type RetirementQuickPlanResult,
} from '../services/retirement-quickplan';

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
  'lifeExpectancy',
] as const;

type NumericField = (typeof NUMERIC_FIELDS)[number];
export type StatedRetirementPlanField = NumericField | 'allocation';

const ALLOCATION_OPTIONS = ['unspecified', 'conservative', 'balanced', 'growth'] as const;
const ALL_FIELDS: readonly StatedRetirementPlanField[] = [...NUMERIC_FIELDS, 'allocation'];

const NULLABLE_NUMBER = { type: ['number', 'null'] as const };
const NULLABLE_STRING = { type: ['string', 'null'] as const };

const PLANNED_OVERRIDES_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [...ALL_FIELDS, 'sources'],
  properties: {
    ...Object.fromEntries(NUMERIC_FIELDS.map((field) => [field, NULLABLE_NUMBER])),
    allocation: { type: 'string', enum: [...ALLOCATION_OPTIONS] },
    sources: {
      type: 'object',
      additionalProperties: false,
      required: [...ALL_FIELDS],
      properties: Object.fromEntries(ALL_FIELDS.map((field) => [field, NULLABLE_STRING])),
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
  lifeExpectancy?: number;
  allocation?: QuickPlanAllocationId;
  sources: Partial<Record<StatedRetirementPlanField, string>>;
}

export interface StatedRetirementPlan {
  requested: true;
  primary: { overrides?: PlannedStatedRetirementOverrides };
  comparison?: { overrides: PlannedStatedRetirementOverrides };
}

/**
 * Where a value came from: the user's words, the connected investment total
 * (an account whose provider reports a balance but no holdings), an age the
 * user told Linc earlier, or the public calculator's named default.
 */
export type StatedRetirementAssumptionOrigin = 'user' | 'snapshot' | 'profile' | 'default';

export interface StatedRetirementAssumption {
  key: StatedRetirementPlanField;
  label: string;
  value: number | string;
  origin: StatedRetirementAssumptionOrigin;
  source?: string;
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
  outcome: {
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
}

export interface CompletedStatedRetirementPlanExecution {
  version: number;
  calculator: typeof STATED_RETIREMENT_PLAN_CALCULATOR_ID;
  status: 'completed';
  computedAt: string;
  durationMs: number;
  scenarios: StatedRetirementPlanResult[];
  comparisonUnavailableReason?: string;
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
}

export type StatedRetirementPlanExecution =
  | CompletedStatedRetirementPlanExecution
  | UnavailableStatedRetirementPlanExecution;

export type QuickPlanRunner = (request: RetirementQuickPlanRequest) => Promise<RetirementQuickPlanResult>;

/** The public calculator's own bounds, so a follow-up accepts what the page accepted. */
const RANGES: Record<NumericField, { minimum: number; maximum: number; integer?: boolean }> = {
  currentAge: { minimum: 18, maximum: 90, integer: true },
  retirementAge: { minimum: 30, maximum: 95, integer: true },
  investableAssets: { minimum: 1_000, maximum: 100_000_000 },
  annualSpending: { minimum: 1_000, maximum: 10_000_000 },
  annualContributions: { minimum: 0, maximum: 5_000_000 },
  socialSecurityAnnual: { minimum: 0, maximum: 250_000 },
  socialSecurityStartAge: { minimum: 50, maximum: 80, integer: true },
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
  lifeExpectancy: 'Planning horizon age',
  allocation: 'Preset asset mix',
};

const MISSING_INPUT_PROMPTS: Partial<Record<StatedRetirementPlanField, string>> = {
  investableAssets: 'roughly how much you have invested today',
  annualSpending: 'what you expect to spend a year in retirement, in today\'s dollars',
  currentAge: 'your current age',
  retirementAge: 'the age you want to retire',
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

  return ALL_FIELDS.some((field) => overrides[field] !== undefined) ? overrides : undefined;
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

/** Only an account with no linked holdings needs a stand-in projection. */
export function statedRetirementPlanApplies(snapshot: FinancialContextSnapshot): boolean {
  return (snapshot.investments?.holdings?.length ?? 0) === 0;
}

function layer(
  base: PlannedStatedRetirementOverrides,
  top: PlannedStatedRetirementOverrides | undefined
): PlannedStatedRetirementOverrides {
  if (!top) return base;
  const merged: PlannedStatedRetirementOverrides = { ...base, sources: { ...base.sources } };
  for (const field of ALL_FIELDS) {
    const value = top[field];
    const source = top.sources[field];
    if (value === undefined || !source) continue;
    (merged as unknown as Record<string, unknown>)[field] = value;
    merged.sources[field] = source;
  }
  return merged;
}

interface ResolvedVariant {
  request: Required<RetirementQuickPlanRequest>;
  assumptions: StatedRetirementAssumption[];
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
  overrides: PlannedStatedRetirementOverrides
): ResolvedVariant | { missing: string[] } {
  const assumptions: StatedRetirementAssumption[] = [];
  const missing: string[] = [];
  const take = <T extends number | string>(
    field: StatedRetirementPlanField,
    fallback?: { value: T; origin: Exclude<StatedRetirementAssumptionOrigin, 'user'> }
  ): T | undefined => {
    const stated = overrides[field] as T | undefined;
    const source = overrides.sources[field];
    if (stated !== undefined && source) {
      assumptions.push({ key: field, label: LABELS[field], value: stated, origin: 'user', source });
      return stated;
    }
    if (fallback) {
      assumptions.push({ key: field, label: LABELS[field], value: fallback.value, origin: fallback.origin });
      return fallback.value;
    }
    const prompt = MISSING_INPUT_PROMPTS[field];
    if (prompt) missing.push(prompt);
    return undefined;
  };

  const profileAge = snapshot.userProfileValues?.age;
  const knownAge = typeof profileAge === 'number' && Number.isInteger(profileAge) &&
    profileAge >= RANGES.currentAge.minimum && profileAge <= RANGES.currentAge.maximum
    ? profileAge
    : undefined;
  const connectedTotal = snapshot.financialSummary?.financialOverview?.totalInvestments;
  const knownAssets = typeof connectedTotal === 'number' && Number.isFinite(connectedTotal) &&
    connectedTotal >= RANGES.investableAssets.minimum && connectedTotal <= RANGES.investableAssets.maximum
    ? connectedTotal
    : undefined;

  const investableAssets = take<number>(
    'investableAssets',
    knownAssets !== undefined ? { value: knownAssets, origin: 'snapshot' } : undefined
  );
  const annualSpending = take<number>('annualSpending');
  const currentAge = take<number>(
    'currentAge',
    knownAge !== undefined ? { value: knownAge, origin: 'profile' } : undefined
  );
  const retirementAge = take<number>('retirementAge');
  if (missing.length > 0) return { missing };

  const annualContributions = take<number>('annualContributions', { value: 0, origin: 'default' })!;
  const socialSecurityAnnual = take<number>('socialSecurityAnnual', { value: 0, origin: 'default' })!;
  // A claiming age with no benefit behind it is only the form's default, and
  // listing it would narrate money this plan does not contain.
  const socialSecurityStartAge = socialSecurityAnnual > 0
    ? take<number>('socialSecurityStartAge', { value: DEFAULT_SOCIAL_SECURITY_START_AGE, origin: 'default' })!
    : DEFAULT_SOCIAL_SECURITY_START_AGE;
  const lifeExpectancy = take<number>('lifeExpectancy', {
    value: Math.max(DEFAULT_LIFE_EXPECTANCY, retirementAge! + 1),
    origin: 'default',
  })!;
  const allocation = take<QuickPlanAllocationId>('allocation', { value: DEFAULT_ALLOCATION_ID, origin: 'default' })!;

  return {
    request: {
      currentAge: currentAge!,
      retirementAge: retirementAge!,
      investableAssets: investableAssets!,
      annualSpending: annualSpending!,
      annualContributions,
      socialSecurityAnnual,
      socialSecurityStartAge,
      lifeExpectancy,
      allocation,
    },
    assumptions,
  };
}

function money(value: number): string {
  return `$${Math.round(value).toLocaleString('en-US')}`;
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function describeField(field: StatedRetirementPlanField, value: number | string): string {
  switch (field) {
    case 'currentAge': return `age ${value}`;
    case 'retirementAge': return `retiring at ${value}`;
    case 'investableAssets': return `${money(Number(value))} invested`;
    case 'annualSpending': return `spending ${money(Number(value))} a year`;
    case 'annualContributions': return `saving ${money(Number(value))} a year`;
    case 'socialSecurityAnnual': return `${money(Number(value))} a year of Social Security`;
    case 'socialSecurityStartAge': return `Social Security from ${value}`;
    case 'lifeExpectancy': return `planning through ${value}`;
    case 'allocation': return `the ${QUICKPLAN_ALLOCATIONS[value as QuickPlanAllocationId]?.label ?? value} mix`;
  }
}

function variantLabel(own: ResolvedVariant, peer: ResolvedVariant | undefined): string {
  if (!peer) return 'Your plan';
  const differing = ALL_FIELDS.filter((field) =>
    (own.request as unknown as Record<string, unknown>)[field] !==
      (peer.request as unknown as Record<string, unknown>)[field]
  );
  const described = differing.slice(0, 2).map((field) =>
    describeField(field, (own.request as unknown as Record<string, number | string>)[field])
  );
  return described.length > 0 ? capitalize(described.join(' and ')) : 'Your plan';
}

function requestKey(variant: ResolvedVariant): string {
  return JSON.stringify(variant.request);
}

function scenarioId(variant: ResolvedVariant): string {
  const digest = createHash('sha256')
    .update(JSON.stringify({ version: STATED_RETIREMENT_PLAN_VERSION, ...variant.request }))
    .digest('hex')
    .slice(0, 16);
  return `stated_retirement_plan_${digest}`;
}

function unavailable(
  startedAt: number,
  reason: string,
  missingInputs?: string[]
): UnavailableStatedRetirementPlanExecution {
  return {
    version: STATED_RETIREMENT_PLAN_VERSION,
    calculator: STATED_RETIREMENT_PLAN_CALCULATOR_ID,
    status: 'unavailable',
    computedAt: new Date().toISOString(),
    durationMs: Date.now() - startedAt,
    reason,
    ...(missingInputs && missingInputs.length > 0 && { missingInputs }),
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
  // Both money figures were supplied, so the quick plan answered in `plan`
  // mode and evaluated this plan. A null here would be an engine contract
  // break, not a missing input.
  const evaluated = run.primary;
  if (!evaluated) throw new Error('The retirement engine did not evaluate the stated plan.');
  const allocation = QUICKPLAN_ALLOCATIONS[run.inputs.allocation];
  return {
    id: scenarioId(variant),
    label,
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
    outcome: {
      survivalRate: evaluated.survivalRate,
      sequencesTested: evaluated.sequencesTested,
      sequencesSurvived: evaluated.sequencesSurvived,
      projectedPortfolioAtRetirement: evaluated.projectedPortfolioAtRetirement,
      firstYearPortfolioWithdrawal: evaluated.firstYearPortfolioWithdrawal,
      firstYearWithdrawalRate: evaluated.firstYearWithdrawalRate,
      depletionYears: evaluated.depletionYears,
    },
    ...(run.sustainableSpending && {
      sustainableSpending: { p10: run.sustainableSpending.p10, p50: run.sustainableSpending.p50 },
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
  const primaryOverrides = layer({ sources: {} }, plan.primary.overrides);
  const layers = [primaryOverrides];
  if (plan.comparison?.overrides) layers.push(layer(primaryOverrides, plan.comparison.overrides));

  const variants: ResolvedVariant[] = [];
  for (const overrides of layers) {
    const variant = resolveVariant(snapshot, overrides);
    // The comparison inherits every primary value, so it can only be missing
    // what the primary was missing.
    if ('missing' in variant) {
      return unavailable(startedAt, `Missing ${joinList(variant.missing)}.`, variant.missing);
    }
    if (!variants.some((existing) => requestKey(existing) === requestKey(variant))) variants.push(variant);
  }

  const scenarios: StatedRetirementPlanResult[] = [];
  let comparisonUnavailableReason: string | undefined;
  for (const [index, variant] of variants.entries()) {
    try {
      const run = await runQuickPlan(variant.request);
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
      if (assumption.key === 'allocation' || typeof assumption.value !== 'number') continue;
      // Zero contributions and zero Social Security are defaults, not figures
      // worth quoting back.
      if (assumption.value === 0) continue;
      add('scenario_input', factId(assumption.key), assumption.label, assumption.value, INPUT_UNITS[assumption.key]);
    }
    const mix = `${scenario.allocation.label} preset`;
    add('scenario_input', 'us_stock_share', `${mix} share in US stocks`, scenario.allocation.usEquityPercent, 'percent');
    add('scenario_input', 'bond_share', `${mix} share in bonds`, scenario.allocation.bondsPercent, 'percent');
    add('scenario_input', 'cash_share', `${mix} share in cash`, scenario.allocation.cashPercent, 'percent');

    const outcome = scenario.outcome;
    add('scenario_calculation', 'historical_survival_rate', 'Share of tested historical sequences in which the money lasted', asPercent(outcome.survivalRate), 'percent');
    add('scenario_calculation', 'historical_sequences_tested', 'Historical sequences tested', outcome.sequencesTested, 'count');
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
    if (scenario.sustainableSpending) {
      add('scenario_calculation', 'sustainable_spending_p10', 'Annual spending this mix sustained in the 10th-percentile sequence, in today\'s dollars', roundMoney(scenario.sustainableSpending.p10), 'usd');
      add('scenario_calculation', 'sustainable_spending_p50', 'Annual spending this mix sustained in the median sequence, in today\'s dollars', roundMoney(scenario.sustainableSpending.p50), 'usd');
    }
    for (const alternative of scenario.alternatives ?? []) {
      const altPrefix = `alternative_${factId(alternative.id)}`;
      // A lever on this plan, with every other input as stated.
      const subject = `${alternative.label} instead, everything else as in ${scenario.label.toLowerCase()}`;
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
      return 'I can test this against a century of market history before any accounts are linked, using a preset ' +
        `mix — I just need ${joinList(items)}. Reply with ${items.length === 1 ? 'that' : 'those'} and I will run it. ` +
        'Or link your investment accounts, and I will use what you actually hold.';
    }
    return `I could not run your plan against market history: ${execution.reason}`;
  }
  const [primary] = execution.scenarios;
  if (!primary) return null;
  const inputs = primary.inputs;

  const socialSecurity = inputs.socialSecurityAnnual > 0
    ? ` Social Security of ${money(inputs.socialSecurityAnnual)} a year starts at ${inputs.socialSecurityStartAge}.`
    : ' No Social Security is included, so the portfolio funds every year on its own.';
  const saving = inputs.annualContributions > 0
    ? ` You keep saving ${money(inputs.annualContributions)} a year until you retire.`
    : '';
  const horizon = assumptionOf(primary, 'lifeExpectancy')?.origin === 'default'
    ? ` It plans through age ${inputs.lifeExpectancy}, since you did not give a horizon.`
    : ` It plans through age ${inputs.lifeExpectancy}.`;
  const mixDefault = assumptionOf(primary, 'allocation')?.origin === 'default'
    ? ` You did not name a mix, so I used the ${primary.allocation.label} preset.`
    : '';
  const assets = assumptionOf(primary, 'investableAssets');
  const assetsNotice = assets?.origin === 'snapshot'
    ? ` The amount invested is your connected investment total of ${money(Number(assets.value))}; its holdings are not itemized, so they cannot be modeled directly.`
    : '';
  const age = assumptionOf(primary, 'currentAge');
  const ageNotice = age?.origin === 'profile' ? ` Your age, ${age.value}, is the one you told me earlier.` : '';
  const comparison = execution.scenarios.length > 1
    ? ` I compared ${execution.scenarios.map((scenario) => scenario.label.toLowerCase()).join(' with ')}.`
    : '';
  const comparisonNotice = execution.comparisonUnavailableReason
    ? ` I could not run the comparison case: ${execution.comparisonUnavailableReason}`
    : '';

  return `Plan assumptions: no investment holdings are linked, so this ran the ${primary.allocation.label} preset ` +
    `(${primary.allocation.description}) rather than what you hold, against every overlapping ` +
    `${primary.history.horizonYears}-year stretch of US market returns and inflation that began between ` +
    `${readableMonth(primary.history.firstStartMonth)} and ${readableMonth(primary.history.lastStartMonth)}.` +
    `${comparison}${socialSecurity}${saving}${horizon}${mixDefault}${assetsNotice}${ageNotice}${comparisonNotice} ` +
    'Fund fees, taxes and account types are not modeled. Change any of these and I will re-run it.';
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
    { id: 'investable_assets', label: 'Invested today', description: 'Defaults to the connected investment total when holdings are not itemized.', valueType: 'currency', minimum: 1_000, maximum: 100_000_000 },
    { id: 'annual_spending', label: 'Annual retirement spending', description: 'In today\'s dollars.', valueType: 'currency', minimum: 1_000, maximum: 10_000_000 },
    { id: 'annual_contributions', label: 'Annual saving until retirement', description: 'In today\'s dollars.', valueType: 'currency', minimum: 0, maximum: 5_000_000 },
    { id: 'social_security_annual', label: 'Annual Social Security', description: 'Inflation-adjusted income that reduces withdrawals once it starts.', valueType: 'currency', minimum: 0, maximum: 250_000 },
    { id: 'social_security_start_age', label: 'Social Security start age', description: 'Age the benefit begins.', valueType: 'age', minimum: 50, maximum: 80 },
    { id: 'life_expectancy', label: 'Planning horizon age', description: 'Age through which the plan is modeled.', valueType: 'age', minimum: 60, maximum: 110 },
    { id: 'allocation', label: 'Preset asset mix', description: 'Conservative, balanced, or growth.', valueType: 'enum', options: ['conservative', 'balanced', 'growth'] },
  ],
  defaults: [
    { id: 'allocation', value: DEFAULT_ALLOCATION_ID, description: 'The public retirement calculator\'s default preset.' },
    { id: 'life_expectancy', value: DEFAULT_LIFE_EXPECTANCY, description: 'Planning horizon when none is stated.' },
    { id: 'social_security_start_age', value: DEFAULT_SOCIAL_SECURITY_START_AGE, description: 'Used only when a benefit is stated without a start age.' },
    { id: 'annual_contributions', value: 0, description: 'No saving before retirement unless stated.' },
    { id: 'social_security_annual', value: 0, description: 'No Social Security unless stated.' },
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
    instructions: `Request this for any question about whether the user can retire, whether their savings will last, how much they can spend in retirement, or a change to such a plan stated earlier in this decision, including a plan the free retirement calculator answered. Application code runs it only when no investment holdings are linked, as a stand-in for the holdings-based projection, so request it for those questions even when the user has stated nothing yet; it asks for whatever is missing. Fill primary.overrides with values the user stated anywhere in this decision, the newest revision winning, and put the user's short wording in overrides.sources: currentAge, retirementAge, investableAssets (invested savings today), annualSpending (spending per year once retired, in today's dollars), annualContributions (saving per year until retirement), socialSecurityAnnual and socialSecurityStartAge, lifeExpectancy (the age the plan runs through), and allocation: conservative (40% US stocks / 50% bonds / 10% cash), balanced (60% / 35% / 5%) or growth (80% / 18% / 2%) when the user, or an earlier answer in this decision, names one of those presets; otherwise unspecified with a null source. When the newest message changes an input of a plan stated earlier, put the earlier plan in primary and only the changed values in comparison. When the user gives a range for one value, put the low end in primary and only the high end in comparison. Never estimate or supply typical values. Do not request it for a Coast FIRE question unless the user also asks whether that plan survives market history. The overrides object and every field and source are always present. When there is no such retirement question, set requested=false, allocation=unspecified, and null for every other value and every source in both variants.`,
    parsePlan: parseStatedRetirementPlan,
  },
  execution: {
    progressMessage: 'Testing your plan against market history',
    failureMessage: 'The stated retirement plan could not be run against market history.',
  },
  appliesTo: statedRetirementPlanApplies,
  execute: (snapshot, plan) => runStatedRetirementPlan(snapshot, plan),
  unavailable: (startedAt, reason) => unavailable(startedAt, reason),
  compactEvidence: compactStatedRetirementPlanExecution,
  canonicalFacts: statedRetirementPlanCanonicalFacts,
  describeAssumptions: describeStatedRetirementPlanExecution,
};
