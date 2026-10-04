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
 */

import { createHash } from 'crypto';
import type { FinancialContextSnapshot } from '../openai/types';
import type { CanonicalFact, CanonicalFactUnit } from '../openai/canonical-facts';
import type { ScenarioCalculatorDefinition } from './calculator-registry';
import {
  calculateCoastFire,
  CoastFireValidationError,
  type CoastFireInputs,
  type CoastFireResult,
} from '../services/coast-fire';

export const COAST_FIRE_CALCULATOR_ID = 'coast_fire' as const;
export const COAST_FIRE_SCENARIO_VERSION = 1 as const;

/** The public calculator's own defaults, so a follow-up agrees with the page. */
export const DEFAULT_COAST_FIRE_REAL_RETURN_PERCENT = 5;
export const DEFAULT_COAST_FIRE_WITHDRAWAL_RATE_PERCENT = 4;

const COAST_FIRE_OVERRIDE_FIELDS = [
  'currentAge',
  'retirementAge',
  'currentSavings',
  'annualRetirementSpending',
  'annualRetirementIncome',
  'realReturnRatePercent',
  'withdrawalRatePercent',
  'annualContribution',
] as const;

export type CoastFireOverrideField = (typeof COAST_FIRE_OVERRIDE_FIELDS)[number];

const NULLABLE_NUMBER = { type: ['number', 'null'] as const };
const NULLABLE_STRING = { type: ['string', 'null'] as const };

const PLANNED_COAST_FIRE_OVERRIDES_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [...COAST_FIRE_OVERRIDE_FIELDS, 'sources'],
  properties: {
    ...Object.fromEntries(COAST_FIRE_OVERRIDE_FIELDS.map((field) => [field, NULLABLE_NUMBER])),
    sources: {
      type: 'object',
      additionalProperties: false,
      required: [...COAST_FIRE_OVERRIDE_FIELDS],
      properties: Object.fromEntries(COAST_FIRE_OVERRIDE_FIELDS.map((field) => [field, NULLABLE_STRING])),
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
  realReturnRatePercent?: number;
  withdrawalRatePercent?: number;
  annualContribution?: number;
  sources: Partial<Record<CoastFireOverrideField, string>>;
}

export interface CoastFireScenarioPlan {
  requested: true;
  primary: { overrides?: PlannedCoastFireOverrides };
  comparison?: { overrides: PlannedCoastFireOverrides };
}

/**
 * Where a value came from. `snapshot` is the connected investment total,
 * `profile` an age the user told Linc earlier, `default` the public
 * calculator's named default.
 */
export type CoastFireAssumptionOrigin = 'user' | 'snapshot' | 'profile' | 'default';

export interface CoastFireAssumption {
  key: CoastFireOverrideField;
  label: string;
  value: number;
  unit: CanonicalFactUnit;
  origin: CoastFireAssumptionOrigin;
  source?: string;
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

export interface CoastFireScenarioResult {
  id: string;
  label: string;
  assumptions: CoastFireAssumption[];
  metrics: CoastFireResult;
  contributionPath?: CoastFireContributionPath;
}

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
  realReturnRatePercent: { minimum: 0, maximum: 12 },
  withdrawalRatePercent: { minimum: 2, maximum: 8 },
  annualContribution: { minimum: 0, maximum: 10_000_000 },
};

/**
 * A real return between 0% and 0.2% is far more likely to be 5% sent as 0.05
 * than a rate anyone meant, and taking it would quietly multiply the Coast
 * FIRE number. Dropping it lets the disclosed default stand instead.
 */
const IMPLAUSIBLE_REAL_RETURN_CEILING = 0.2;

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

function parseOverrides(value: unknown): PlannedCoastFireOverrides | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const rawSources = record.sources && typeof record.sources === 'object' && !Array.isArray(record.sources)
    ? record.sources as Record<string, unknown>
    : {};
  const overrides: PlannedCoastFireOverrides = { sources: {} };

  for (const field of COAST_FIRE_OVERRIDE_FIELDS) {
    const numericValue = finiteNumber(record[field]);
    const source = shortSource(rawSources[field]);
    const range = OVERRIDE_RANGES[field];
    if (
      numericValue === undefined ||
      numericValue < range.minimum ||
      numericValue > range.maximum ||
      (range.integer && !Number.isInteger(numericValue)) ||
      (field === 'realReturnRatePercent' && numericValue > 0 && numericValue < IMPLAUSIBLE_REAL_RETURN_CEILING) ||
      !source
    ) {
      continue;
    }
    overrides[field] = numericValue;
    overrides.sources[field] = source;
  }

  return COAST_FIRE_OVERRIDE_FIELDS.some((field) => overrides[field] !== undefined)
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
  return merged;
}

const ASSUMPTION_LABELS: Record<CoastFireOverrideField, { label: string; unit: CanonicalFactUnit }> = {
  currentAge: { label: 'Current age', unit: 'age' },
  retirementAge: { label: 'Retirement age', unit: 'age' },
  currentSavings: { label: 'Invested retirement savings today', unit: 'usd' },
  annualRetirementSpending: { label: 'Annual spending in retirement, in today\'s dollars', unit: 'usd' },
  annualRetirementIncome: { label: 'Annual retirement income from the retirement date, in today\'s dollars', unit: 'usd' },
  realReturnRatePercent: { label: 'Annual growth after inflation', unit: 'percent' },
  withdrawalRatePercent: { label: 'Withdrawal rate', unit: 'percent' },
  annualContribution: { label: 'Annual contributions until savings can coast, in today\'s dollars', unit: 'usd' },
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

function connectedInvestmentTotal(snapshot: FinancialContextSnapshot): number | undefined {
  const total = snapshot.financialSummary?.financialOverview?.totalInvestments;
  return typeof total === 'number' && Number.isFinite(total) && total > 0 && total <= OVERRIDE_RANGES.currentSavings.maximum
    ? total
    : undefined;
}

interface ResolvedCoastFireVariant {
  inputs: CoastFireInputs;
  annualContribution: number;
  assumptions: CoastFireAssumption[];
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
  overrides: PlannedCoastFireOverrides
): ResolvedCoastFireVariant | { missing: string[] } {
  const assumptions: CoastFireAssumption[] = [];
  const missing: string[] = [];
  const take = (
    field: CoastFireOverrideField,
    fallback?: { value: number; origin: Exclude<CoastFireAssumptionOrigin, 'user'> }
  ): number | undefined => {
    const stated = overrides[field];
    const source = overrides.sources[field];
    if (stated !== undefined && source) {
      assumptions.push({ key: field, ...ASSUMPTION_LABELS[field], value: stated, origin: 'user', source });
      return stated;
    }
    if (fallback) {
      assumptions.push({ key: field, ...ASSUMPTION_LABELS[field], value: fallback.value, origin: fallback.origin });
      return fallback.value;
    }
    const prompt = MISSING_INPUT_PROMPTS[field];
    if (prompt) missing.push(prompt);
    return undefined;
  };

  const knownAge = profileAge(snapshot);
  const connectedTotal = connectedInvestmentTotal(snapshot);
  const currentAge = take('currentAge', knownAge !== undefined ? { value: knownAge, origin: 'profile' } : undefined);
  const retirementAge = take('retirementAge');
  const currentSavings = take(
    'currentSavings',
    connectedTotal !== undefined ? { value: connectedTotal, origin: 'snapshot' } : undefined
  );
  const annualRetirementSpending = take('annualRetirementSpending');
  const annualRetirementIncome = take('annualRetirementIncome', { value: 0, origin: 'default' });
  const realReturnRate = take('realReturnRatePercent', {
    value: DEFAULT_COAST_FIRE_REAL_RETURN_PERCENT,
    origin: 'default',
  });
  const withdrawalRate = take('withdrawalRatePercent', {
    value: DEFAULT_COAST_FIRE_WITHDRAWAL_RATE_PERCENT,
    origin: 'default',
  });
  // Zero is the honest reading of an unstated contribution, and it changes
  // nothing about the Coast FIRE number itself; only a stated one is recorded.
  const statedContribution = overrides.annualContribution !== undefined && overrides.sources.annualContribution
    ? take('annualContribution')
    : undefined;

  if (missing.length > 0) return { missing };
  return {
    inputs: {
      currentAge: currentAge!,
      retirementAge: retirementAge!,
      currentSavings: currentSavings!,
      annualRetirementSpending: annualRetirementSpending!,
      annualRetirementIncome: annualRetirementIncome!,
      realReturnRate: realReturnRate!,
      withdrawalRate: withdrawalRate!,
    },
    annualContribution: statedContribution ?? 0,
    assumptions,
  };
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
    case 'annualRetirementIncome': return `${money(value)} a year of retirement income`;
    case 'realReturnRatePercent': return `${rate(value)} growth after inflation`;
    case 'withdrawalRatePercent': return `a ${rate(value)} withdrawal rate`;
    case 'annualContribution': return `investing ${money(value)} a year`;
  }
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function variantLabel(own: ResolvedCoastFireVariant, peer: ResolvedCoastFireVariant | undefined): string {
  if (!peer) return 'Your Coast FIRE plan';
  const ownValues = new Map(own.assumptions.map((assumption) => [assumption.key, assumption.value]));
  const peerValues = new Map(peer.assumptions.map((assumption) => [assumption.key, assumption.value]));
  const differing = COAST_FIRE_OVERRIDE_FIELDS.filter((field) =>
    ownValues.get(field) !== peerValues.get(field)
  );
  const described = differing.slice(0, 2).map((field) => describeField(field, ownValues.get(field) ?? 0));
  return described.length > 0 ? capitalize(described.join(' and ')) : 'Your Coast FIRE plan';
}

function variantKey(variant: ResolvedCoastFireVariant): string {
  return JSON.stringify({ ...variant.inputs, annualContribution: variant.annualContribution });
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
  missingInputs?: string[]
): UnavailableCoastFireScenarioExecution {
  return {
    version: COAST_FIRE_SCENARIO_VERSION,
    calculator: COAST_FIRE_CALCULATOR_ID,
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

/** Run the stated Coast FIRE case and, when requested, one comparison case. */
export async function runCoastFireScenario(
  snapshot: FinancialContextSnapshot,
  plan: CoastFireScenarioPlan
): Promise<CoastFireScenarioExecution> {
  const startedAt = Date.now();
  const primaryOverrides = layer({ sources: {} }, plan.primary.overrides);
  const layers = [primaryOverrides];
  if (plan.comparison?.overrides) layers.push(layer(primaryOverrides, plan.comparison.overrides));

  const resolved: ResolvedCoastFireVariant[] = [];
  const results: Array<{ variant: ResolvedCoastFireVariant; metrics: CoastFireResult }> = [];
  let comparisonUnavailableReason: string | undefined;
  for (const [index, overrides] of layers.entries()) {
    const variant = resolveVariant(snapshot, overrides);
    if ('missing' in variant) {
      // The comparison inherits every primary value, so it can only be missing
      // something the primary was missing too.
      return unavailable(
        startedAt,
        `Missing ${joinList(variant.missing)}.`,
        variant.missing
      );
    }
    try {
      const metrics = calculateCoastFire(variant.inputs);
      if (resolved.some((existing) => variantKey(existing) === variantKey(variant))) continue;
      resolved.push(variant);
      results.push({ variant, metrics });
    } catch (error) {
      if (!(error instanceof CoastFireValidationError)) throw error;
      if (index === 0) return unavailable(startedAt, error.message);
      comparisonUnavailableReason = error.message;
    }
  }

  const scenarios = results.map(({ variant, metrics }, index): CoastFireScenarioResult => {
    const peer = resolved[index === 0 ? 1 : 0];
    return {
      id: scenarioId(variant),
      label: variantLabel(variant, peer),
      assumptions: variant.assumptions,
      metrics,
      ...(variant.annualContribution > 0 && !metrics.hasReachedCoastFire && {
        contributionPath: coastFireContributionPath(metrics, variant.annualContribution),
      }),
    };
  });

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
      // A zero retirement income is a default, not a figure worth quoting.
      if (assumption.key === 'annualRetirementIncome' && assumption.value === 0) continue;
      inputIds.set(
        assumption.key,
        add('scenario_input', factId(assumption.key), assumption.label, assumption.value, assumption.unit)
      );
    }

    const m = scenario.metrics;
    add('scenario_calculation', 'years_to_retirement', 'Years until the retirement age', m.yearsToRetirement, 'years');
    if (m.annualRetirementIncome > 0) {
      add(
        'scenario_calculation',
        'portfolio_spending_need',
        'Annual spending the portfolio must cover after retirement income',
        roundMoney(m.portfolioSpendingNeed),
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
      return `To work out your Coast FIRE number I need ${joinList(items)}. ` +
        `Reply with ${items.length === 1 ? 'that' : 'those'} and I will run it — no linked accounts needed.`;
    }
    return `I could not run the Coast FIRE calculation: ${execution.reason}`;
  }
  const [primary] = execution.scenarios;
  if (!primary) return null;

  const m = primary.metrics;
  const income = m.annualRetirementIncome > 0
    ? `${money(m.annualRetirementIncome)} a year of retirement income from ${m.retirementAge}`
    : 'no retirement income counted';
  const savings = assumptionOf(primary, 'currentSavings');
  const savingsNotice = savings?.origin === 'snapshot'
    ? ` Your savings figure is your connected investment total of ${money(savings.value)}, which counts every linked investment account, not only retirement accounts.`
    : '';
  const age = assumptionOf(primary, 'currentAge');
  const ageNotice = age?.origin === 'profile' ? ` Your age, ${age.value}, is the one you told me earlier.` : '';
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
    ? ` I compared ${execution.scenarios.map((scenario) => scenario.label.toLowerCase()).join(' with ')}.`
    : '';
  const comparisonNotice = execution.comparisonUnavailableReason
    ? ` I could not run the comparison case: ${execution.comparisonUnavailableReason}`
    : '';

  return `Coast FIRE assumptions: ${rate(m.realReturnRate)} a year after inflation, a ${rate(m.withdrawalRate)} ` +
    `withdrawal rate, and ${income}, all in today's dollars.${comparison}${savingsNotice}${ageNotice}` +
    `${defaultsNotice}${contributionNotice}${comparisonNotice} It is a single straight line — the same return ` +
    'every year, with no taxes, fees or market swings. Change any of these and I will re-run it.';
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
    { id: 'current_savings', label: 'Invested retirement savings', description: 'Invested today; defaults to the connected investment total.', valueType: 'currency', minimum: 0, maximum: 100_000_000 },
    { id: 'annual_retirement_spending', label: 'Annual retirement spending', description: 'In today\'s dollars.', valueType: 'currency', minimum: 1_000, maximum: 10_000_000 },
    { id: 'annual_retirement_income', label: 'Annual retirement income', description: 'Income starting at retirement that reduces what the portfolio must cover.', valueType: 'currency', minimum: 0, maximum: 10_000_000 },
    { id: 'real_return_rate_percent', label: 'Growth after inflation', description: 'Percentage points; 5% is 5.', valueType: 'percentage', minimum: 0, maximum: 12 },
    { id: 'withdrawal_rate_percent', label: 'Withdrawal rate', description: 'Percentage points; 4% is 4.', valueType: 'percentage', minimum: 2, maximum: 8 },
    { id: 'annual_contribution', label: 'Annual contributions', description: 'What the user invests each year now; used to find when savings can coast.', valueType: 'currency', minimum: 0, maximum: 10_000_000 },
  ],
  defaults: [
    { id: 'real_return_rate_percent', value: DEFAULT_COAST_FIRE_REAL_RETURN_PERCENT, description: 'The public Coast FIRE calculator\'s default growth after inflation.' },
    { id: 'withdrawal_rate_percent', value: DEFAULT_COAST_FIRE_WITHDRAWAL_RATE_PERCENT, description: 'The public Coast FIRE calculator\'s default withdrawal rate.' },
    { id: 'annual_retirement_income', value: 0, description: 'No retirement income unless the user states one.' },
    { id: 'annual_contribution', value: 0, description: 'No contribution path unless the user states what they invest.' },
  ],
  outputs: [
    { id: 'retirement_target', label: 'Portfolio needed at retirement', unit: 'usd', scope: 'variant', description: 'Spending not covered by retirement income, divided by the withdrawal rate.' },
    { id: 'coast_fire_number', label: 'Coast FIRE number', unit: 'usd', scope: 'variant', description: 'The retirement target discounted to today at the real return.' },
    { id: 'projected_savings_at_retirement', label: 'Savings at retirement with no further contributions', unit: 'usd', scope: 'variant', description: 'Current savings compounded at the real return.' },
    { id: 'savings_versus_coast_fire_number', label: 'Gap to the Coast FIRE number', unit: 'usd', scope: 'variant', description: 'Absolute difference between savings and the Coast FIRE number.' },
    { id: 'share_of_coast_fire_number', label: 'Share of the Coast FIRE number', unit: 'percent', scope: 'variant', description: 'Savings divided by the Coast FIRE number.' },
    { id: 'age_at_coast_fire', label: 'Age savings can coast', unit: 'years', scope: 'variant', description: 'First birthday at which contributions could stop and the target still be reached.' },
    { id: 'projected_savings_at_retirement_with_contributions', label: 'Savings at retirement with contributions', unit: 'usd', scope: 'variant', description: 'Savings if the stated contributions continue until retirement.' },
  ],
  planner: {
    jsonSchema: COAST_FIRE_SCENARIO_PLAN_JSON_SCHEMA,
    instructions: `When the user asks whether they have reached Coast FIRE, what their Coast FIRE number is, when they will reach Coast FIRE, or changes an input of a Coast FIRE answer earlier in this decision, set requested=true. Coast FIRE means having enough invested today that growth alone, with no further contributions, reaches the retirement target by the retirement age. Fill primary.overrides with values the user stated anywhere in this decision, the newest revision winning, and put the user's short wording in overrides.sources: currentAge, retirementAge, currentSavings (invested retirement savings today), annualRetirementSpending (annual spending once retired, in today's dollars), annualRetirementIncome (pension or other income that starts at retirement), realReturnRatePercent (growth after inflation in percentage points: 5% is 5, never 0.05), withdrawalRatePercent (percentage points: 4% is 4), and annualContribution (what the user invests per year now; only used to find when they reach Coast FIRE). When the user gives a range for one value, put the low end in primary and only the high end in comparison. When the newest message changes an input of the earlier Coast FIRE case, put the earlier case in primary and only the changed values in comparison. Never estimate or supply typical values; application code applies disclosed defaults and asks for anything else missing, so request the calculation even when figures are missing. A Coast FIRE question does not by itself request any other calculator. The overrides object and every field and source are always present; use null for absent values. When there is no Coast FIRE question, set requested=false and return null for every value and source in both variants.`,
    parsePlan: parseCoastFireScenarioPlan,
  },
  execution: {
    progressMessage: 'Working out your Coast FIRE number',
    failureMessage: 'The Coast FIRE calculation could not be completed.',
  },
  execute: runCoastFireScenario,
  unavailable: (startedAt, reason) => unavailable(startedAt, reason),
  compactEvidence: compactCoastFireScenarioExecution,
  canonicalFacts: coastFireScenarioCanonicalFacts,
  describeAssumptions: describeCoastFireScenarioExecution,
};
