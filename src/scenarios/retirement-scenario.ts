import { createHash } from 'crypto';
import type { FinancialContextSnapshot } from '../openai/types';
import type { CanonicalFact, CanonicalFactUnit } from '../openai/canonical-facts';
import {
  analyzeRetirementPortfolio,
  type RetirementAnalysisInput,
  type RetirementAnalysisOutput,
  type WithdrawalPolicy,
} from '../retirement-analytics';
import type { ScenarioCalculatorDefinition } from './calculator-registry';

export const RETIREMENT_SCENARIO_VERSION = 2 as const;
export const RETIREMENT_CALCULATOR_ID = 'retirement' as const;
export const DEFAULT_FIXED_WITHDRAWAL_GROWTH_RATE = 0.03;

const RETIREMENT_OVERRIDE_FIELDS = [
  'annualWithdrawalAmount',
  'annualContributionAmount',
  'retirementAge',
  'withdrawalStartAge',
  'lifeExpectancy',
] as const;

export type RetirementOverrideField = (typeof RETIREMENT_OVERRIDE_FIELDS)[number];

const NULLABLE_NUMBER = { type: ['number', 'null'] as const };
const NULLABLE_STRING = { type: ['string', 'null'] as const };

const PLANNED_OVERRIDES_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [...RETIREMENT_OVERRIDE_FIELDS, 'sources'],
  properties: {
    ...Object.fromEntries(RETIREMENT_OVERRIDE_FIELDS.map((field) => [field, NULLABLE_NUMBER])),
    sources: {
      type: 'object',
      additionalProperties: false,
      required: [...RETIREMENT_OVERRIDE_FIELDS],
      properties: Object.fromEntries(
        RETIREMENT_OVERRIDE_FIELDS.map((field) => [field, NULLABLE_STRING])
      ),
    },
  },
} as const;

const PLANNED_VARIANT_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['type', 'annualRate', 'source', 'overrides'],
  properties: {
    type: {
      type: 'string',
      enum: ['none', 'historical_cpi', 'flat_nominal', 'fixed_growth'],
    },
    annualRate: { type: ['number', 'null'] },
    source: { type: ['string', 'null'] },
    overrides: PLANNED_OVERRIDES_JSON_SCHEMA,
  },
} as const;

/** Shared strict-schema fragment for the preflight and primary-model tool pass. */
export const RETIREMENT_SCENARIO_PLAN_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['requested', 'primary', 'comparison'],
  properties: {
    requested: { type: 'boolean' },
    primary: PLANNED_VARIANT_JSON_SCHEMA,
    comparison: PLANNED_VARIANT_JSON_SCHEMA,
  },
} as const;

export type WithdrawalPolicyType = WithdrawalPolicy['type'];

export interface PlannedWithdrawalPolicy {
  type: WithdrawalPolicyType;
  /** Decimal annual rate; only meaningful for fixed_growth. */
  annualRate?: number;
  /** Short user wording selected by the semantic planner, when available. */
  source?: string;
}

export interface PlannedRetirementOverrides {
  annualWithdrawalAmount?: number;
  annualContributionAmount?: number;
  retirementAge?: number;
  withdrawalStartAge?: number;
  lifeExpectancy?: number;
  sources: Partial<Record<RetirementOverrideField, string>>;
}

export interface PlannedRetirementVariant extends PlannedWithdrawalPolicy {
  overrides?: PlannedRetirementOverrides;
}

export interface RetirementScenarioPlan {
  requested: true;
  primary: PlannedRetirementVariant;
  comparison?: PlannedRetirementVariant;
}

export type ScenarioAssumptionOrigin = 'user' | 'inherited' | 'default';

export interface RetirementScenarioAssumption {
  key: string;
  label: string;
  value: string | number;
  origin: ScenarioAssumptionOrigin;
  source?: string;
}

export interface RetirementScenarioResult {
  id: string;
  label: string;
  withdrawalPolicy: WithdrawalPolicy;
  assumptions: RetirementScenarioAssumption[];
  analysis: RetirementAnalysisOutput;
  reusedBaseline: boolean;
}

export interface CompletedRetirementScenarioExecution {
  /** Numeric so persisted v1 evidence remains readable after calculator upgrades. */
  version: number;
  calculator: 'retirement';
  status: 'completed';
  computedAt: string;
  durationMs: number;
  baselineScenarioId: string;
  scenarios: RetirementScenarioResult[];
}

export interface UnavailableRetirementScenarioExecution {
  /** Numeric so persisted v1 evidence remains readable after calculator upgrades. */
  version: number;
  calculator: 'retirement';
  status: 'unavailable';
  computedAt: string;
  durationMs: number;
  reason: string;
}

export type RetirementScenarioExecution =
  | CompletedRetirementScenarioExecution
  | UnavailableRetirementScenarioExecution;

export type RetirementAnalyzer = typeof analyzeRetirementPortfolio;

const POLICY_TYPES = new Set<WithdrawalPolicyType>([
  'historical_cpi',
  'flat_nominal',
  'fixed_growth',
]);

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

const OVERRIDE_RANGES: Record<RetirementOverrideField, {
  minimum: number;
  maximum: number;
  integer: boolean;
}> = {
  annualWithdrawalAmount: { minimum: 1, maximum: 100_000_000, integer: false },
  annualContributionAmount: { minimum: 0, maximum: 100_000_000, integer: false },
  retirementAge: { minimum: 30, maximum: 100, integer: true },
  withdrawalStartAge: { minimum: 30, maximum: 120, integer: true },
  lifeExpectancy: { minimum: 50, maximum: 120, integer: true },
};

function parseOverrides(value: unknown): PlannedRetirementOverrides | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const rawSources = record.sources && typeof record.sources === 'object' && !Array.isArray(record.sources)
    ? record.sources as Record<string, unknown>
    : {};
  const overrides: PlannedRetirementOverrides = { sources: {} };

  for (const field of RETIREMENT_OVERRIDE_FIELDS) {
    const numericValue = finiteNumber(record[field]);
    const source = shortSource(rawSources[field]);
    const range = OVERRIDE_RANGES[field];
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

  // A changed retirement date normally changes the withdrawal start too. Keep
  // them separate only when the user explicitly supplied both values.
  if (overrides.retirementAge !== undefined && overrides.withdrawalStartAge === undefined) {
    overrides.withdrawalStartAge = overrides.retirementAge;
    overrides.sources.withdrawalStartAge = overrides.sources.retirementAge;
  }

  return RETIREMENT_OVERRIDE_FIELDS.some((field) => overrides[field] !== undefined)
    ? overrides
    : undefined;
}

function parseVariant(value: unknown): PlannedRetirementVariant | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  if (typeof record.type !== 'string' || !POLICY_TYPES.has(record.type as WithdrawalPolicyType)) {
    return undefined;
  }
  const type = record.type as WithdrawalPolicyType;
  const rawRate = finiteNumber(record.annualRate);
  // The planner contract uses decimals. A malformed or implausible value is
  // dropped so the deterministic resolver can use its named default instead of
  // letting a model-supplied typo drive a projection.
  const annualRate = rawRate !== undefined && rawRate >= -0.2 && rawRate <= 0.5
    ? rawRate
    : undefined;
  const overrides = parseOverrides(record.overrides);
  return {
    type,
    ...(type === 'fixed_growth' && annualRate !== undefined && { annualRate }),
    ...(shortSource(record.source) && { source: shortSource(record.source) }),
    ...(overrides && { overrides }),
  };
}

/** Validate the semantic planner/tool result without inferring intent from text. */
export function parseRetirementScenarioPlan(value: unknown): RetirementScenarioPlan | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  if (record.requested !== true) return undefined;
  const primary = parseVariant(record.primary);
  if (!primary) return undefined;
  const comparison = parseVariant(record.comparison);
  return {
    requested: true,
    primary,
    ...(comparison && { comparison }),
  };
}

function resolvePolicy(planned: PlannedWithdrawalPolicy): {
  policy: WithdrawalPolicy;
  assumptions: RetirementScenarioAssumption[];
} {
  const policySource = planned.source;
  if (planned.type === 'fixed_growth') {
    // A model-supplied number is only treated as a user premise when the
    // semantic pass also returns the user's source wording. Otherwise use the
    // named application default rather than giving an untraceable rate authority.
    const userSuppliedRate = planned.annualRate !== undefined && Boolean(policySource);
    const annualRate = userSuppliedRate
      ? planned.annualRate!
      : DEFAULT_FIXED_WITHDRAWAL_GROWTH_RATE;
    return {
      policy: { type: 'fixed_growth', annualRate },
      assumptions: [
        {
          key: 'withdrawal_policy',
          label: 'Withdrawal policy',
          value: 'Fixed annual growth',
          origin: policySource ? 'user' : 'default',
          ...(policySource && { source: policySource }),
        },
        {
          key: 'annual_growth_rate',
          label: 'Annual withdrawal growth',
          value: annualRate,
          origin: userSuppliedRate ? 'user' : 'default',
          ...(userSuppliedRate && policySource && { source: policySource }),
        },
      ],
    };
  }

  return {
    policy: { type: planned.type },
    assumptions: [{
      key: 'withdrawal_policy',
      label: 'Withdrawal policy',
      value: planned.type === 'flat_nominal'
        ? 'Flat nominal dollars after withdrawals begin'
        : 'Historical CPI-linked withdrawals',
      origin: policySource ? 'user' : 'default',
      ...(policySource && { source: policySource }),
    }],
  };
}

function policyLabel(policy: WithdrawalPolicy): string {
  if (policy.type === 'flat_nominal') return 'Flat nominal withdrawals';
  if (policy.type === 'historical_cpi') return 'Historical CPI-linked withdrawals';
  return `${Number((policy.annualRate * 100).toFixed(4))}% annual withdrawal growth`;
}

const OVERRIDE_ASSUMPTIONS: Record<RetirementOverrideField, {
  key: string;
  label: string;
}> = {
  annualWithdrawalAmount: {
    key: 'annual_withdrawal_amount',
    label: 'Starting annual retirement spending in today\'s dollars',
  },
  annualContributionAmount: {
    key: 'pre_withdrawal_contributions',
    label: 'Annual contributions before withdrawals in today\'s dollars',
  },
  retirementAge: { key: 'retirement_age', label: 'Retirement age' },
  withdrawalStartAge: { key: 'withdrawal_start_age', label: 'Withdrawal start age' },
  lifeExpectancy: { key: 'life_expectancy', label: 'Life expectancy' },
};

function resolveVariant(
  baseInput: RetirementAnalysisInput,
  planned: PlannedRetirementVariant
): {
  input: RetirementAnalysisInput;
  policy: WithdrawalPolicy;
  assumptions: RetirementScenarioAssumption[];
} {
  const resolvedPolicy = resolvePolicy(planned);
  const input: RetirementAnalysisInput = {
    ...baseInput,
    withdrawalPolicy: resolvedPolicy.policy,
  };
  const assumptions = [...resolvedPolicy.assumptions];
  const overrides = planned.overrides;
  if (!overrides) return { input, policy: resolvedPolicy.policy, assumptions };

  for (const field of RETIREMENT_OVERRIDE_FIELDS) {
    const value = overrides[field];
    const source = overrides.sources[field];
    if (value === undefined || !source) continue;
    input[field] = value;
    assumptions.push({
      ...OVERRIDE_ASSUMPTIONS[field],
      value,
      origin: 'user',
      source,
    });
  }

  return { input, policy: resolvedPolicy.policy, assumptions };
}

function validateVariantInput(input: RetirementAnalysisInput): string | undefined {
  if (input.retirementAge !== null && input.retirementAge < input.currentAge) {
    return 'Retirement age cannot be earlier than current age.';
  }
  if (input.withdrawalStartAge < input.currentAge) {
    return 'Withdrawal start age cannot be earlier than current age.';
  }
  if (input.lifeExpectancy <= input.withdrawalStartAge) {
    return 'Life expectancy must be later than the withdrawal start age.';
  }
  if ((input.annualContributionAmount ?? 0) > 0 && input.withdrawalStartAge <= input.currentAge) {
    return 'Pre-withdrawal contributions require a future withdrawal start date.';
  }
  return undefined;
}

function inputKey(input: RetirementAnalysisInput, policy: WithdrawalPolicy): string {
  return JSON.stringify({
    currentAge: input.currentAge,
    retirementAge: input.retirementAge,
    lifeExpectancy: input.lifeExpectancy,
    annualWithdrawalAmount: input.annualWithdrawalAmount,
    withdrawalStartAge: input.withdrawalStartAge,
    annualContributionAmount: input.annualContributionAmount ?? 0,
    policy,
  });
}

function variantLabel(
  policy: WithdrawalPolicy,
  assumptions: readonly RetirementScenarioAssumption[]
): string {
  const changed = assumptions.filter((assumption) => assumption.origin === 'user' && assumption.key !== 'withdrawal_policy');
  if (changed.length === 0) return policyLabel(policy);
  const details = changed.slice(0, 2).map((assumption) => {
    if (assumption.key === 'annual_withdrawal_amount') {
      return `$${Number(assumption.value).toLocaleString('en-US')}/year spending`;
    }
    if (assumption.key === 'pre_withdrawal_contributions') {
      return `$${Number(assumption.value).toLocaleString('en-US')}/year contributions`;
    }
    return `${assumption.label.toLowerCase()} ${assumption.value}`;
  });
  return `${policyLabel(policy)} with ${details.join(' and ')}`;
}

function scenarioId(
  input: RetirementAnalysisInput,
  policy: WithdrawalPolicy,
  analysis: RetirementAnalysisOutput
): string {
  const portfolio = input.holdings.map((holding) => ({
    id: holding.id,
    securityId: holding.security_id,
    ticker: holding.ticker_symbol,
    value: holding.institution_value,
  })).sort((left, right) => `${left.id}:${left.securityId}`.localeCompare(`${right.id}:${right.securityId}`));
  const securities = input.securities.map((security) => ({
    id: security.security_id,
    ticker: security.ticker_symbol,
    type: security.type,
  })).sort((left, right) => left.id.localeCompare(right.id));
  const digest = createHash('sha256').update(JSON.stringify({
    calculatorVersion: RETIREMENT_SCENARIO_VERSION,
    portfolio,
    securities,
    currentAge: input.currentAge,
    retirementAge: input.retirementAge,
    lifeExpectancy: input.lifeExpectancy,
    annualWithdrawalAmount: input.annualWithdrawalAmount,
    withdrawalStartAge: input.withdrawalStartAge,
    annualContributionAmount: input.annualContributionAmount ?? 0,
    policy,
    result: {
      metrics: analysis.metrics,
      survivalRate: analysis.stressTest.survivalRate,
      totalSequences: analysis.stressTest.totalSequences,
      depletionPercentiles: analysis.stressTest.depletionPercentiles,
    },
  })).digest('hex').slice(0, 16);
  return `retirement_${policy.type}_${digest}`;
}

function inheritedAssumptions(
  input: RetirementAnalysisInput,
  existing: readonly RetirementScenarioAssumption[]
): RetirementScenarioAssumption[] {
  const existingKeys = new Set(existing.map((assumption) => assumption.key));
  const assumptions: RetirementScenarioAssumption[] = [
    { key: 'current_age', label: 'Current age', value: input.currentAge, origin: 'inherited' },
  ];
  const candidates: RetirementScenarioAssumption[] = [
    {
      key: 'retirement_age',
      label: 'Retirement age',
      value: input.retirementAge ?? input.withdrawalStartAge,
      origin: 'inherited',
    },
    {
      key: 'annual_withdrawal_amount',
      label: 'Starting annual retirement spending in today\'s dollars',
      value: input.annualWithdrawalAmount,
      origin: 'inherited',
    },
    {
      key: 'withdrawal_start_age',
      label: 'Withdrawal start age',
      value: input.withdrawalStartAge,
      origin: 'inherited',
    },
    { key: 'life_expectancy', label: 'Life expectancy', value: input.lifeExpectancy, origin: 'inherited' },
    {
      key: 'pre_withdrawal_contributions',
      label: 'Annual contributions before withdrawals in today\'s dollars',
      value: input.annualContributionAmount ?? 0,
      origin: (input.annualContributionAmount ?? 0) > 0 ? 'inherited' : 'default',
    },
  ];
  assumptions.push(...candidates.filter((assumption) => !existingKeys.has(assumption.key)));
  return assumptions;
}

function unavailable(startedAt: number, reason: string): UnavailableRetirementScenarioExecution {
  return {
    version: RETIREMENT_SCENARIO_VERSION,
    calculator: 'retirement',
    status: 'unavailable',
    computedAt: new Date().toISOString(),
    durationMs: Date.now() - startedAt,
    reason,
  };
}

/**
 * Execute at most two requested withdrawal variants against one inherited
 * retirement baseline. The existing CPI-linked analysis is reused when a
 * requested variant matches it; other variants are deterministic engine calls.
 */
export async function runRetirementScenario(
  snapshot: FinancialContextSnapshot,
  plan: RetirementScenarioPlan,
  analyze: RetirementAnalyzer = analyzeRetirementPortfolio
): Promise<RetirementScenarioExecution> {
  const startedAt = Date.now();
  const computedAt = snapshot.financialSummary?.computedAt;
  const parsedComputedAt = computedAt
    ? (computedAt instanceof Date ? computedAt : new Date(computedAt))
    : null;
  const baselineDate = parsedComputedAt && !Number.isNaN(parsedComputedAt.getTime())
    ? parsedComputedAt.toISOString().slice(0, 10)
    : undefined;
  const baseline = snapshot.retirementAnalysis;
  const stored = baseline?._storedInputParams;
  const holdings = snapshot.investments?.holdings;
  const securities = snapshot.investments?.securities;
  if (!baseline || !stored) {
    return unavailable(startedAt, 'A completed retirement baseline is required before scenarios can be compared.');
  }
  if (!holdings?.length || !securities?.length) {
    return unavailable(startedAt, 'Investment holdings and security details are required to run a retirement scenario.');
  }
  if (
    stored.currentAge == null ||
    stored.retirementAge == null ||
    stored.annualWithdrawalAmount == null ||
    stored.withdrawalStartAge == null
  ) {
    return unavailable(startedAt, 'The retirement baseline is missing one or more required planning inputs.');
  }

  const baseInput: RetirementAnalysisInput = {
    holdings,
    securities,
    currentAge: stored.currentAge,
    retirementAge: stored.retirementAge,
    lifeExpectancy: stored.lifeExpectancy ?? 95,
    annualWithdrawalAmount: stored.annualWithdrawalAmount,
    withdrawalStartAge: stored.withdrawalStartAge,
    annualContributionAmount: 0,
    // Variants must exclude exactly what the baseline excluded, or a scenario
    // comparison would attribute a coverage difference to the change modeled.
    unmodeledInvestments: snapshot.investments?.unmodeledInvestments ?? null,
    // Same reason: a variant must use the baseline snapshot's evidence boundary
    // or a newly published allocation could look like an effect of the scenario.
    asOfDate: baselineDate,
  };
  const baselinePolicy: WithdrawalPolicy = { type: 'historical_cpi' };
  const baselineScenarioId = scenarioId(baseInput, baselinePolicy, baseline as RetirementAnalysisOutput);
  const plannedVariants = [plan.primary, plan.comparison].filter(
    (item): item is PlannedRetirementVariant => Boolean(item)
  );
  if (!plan.comparison) {
    plannedVariants.push({ type: 'historical_cpi' });
  }

  const unique = new Map<string, ReturnType<typeof resolveVariant>>();
  for (const planned of plannedVariants.slice(0, 2)) {
    const resolved = resolveVariant(baseInput, planned);
    const invalidReason = validateVariantInput(resolved.input);
    if (invalidReason) return unavailable(startedAt, invalidReason);
    const key = inputKey(resolved.input, resolved.policy);
    if (!unique.has(key)) {
      unique.set(key, resolved);
    }
  }

  const scenarios: RetirementScenarioResult[] = [];
  for (const resolved of unique.values()) {
    const reusedBaseline = inputKey(resolved.input, resolved.policy) === inputKey(baseInput, baselinePolicy);
    const analysis = reusedBaseline
      ? baseline as RetirementAnalysisOutput
      : await analyze(resolved.input);
    const assumptions = [
      ...resolved.assumptions,
      ...inheritedAssumptions(resolved.input, resolved.assumptions),
    ];
    scenarios.push({
      id: scenarioId(resolved.input, resolved.policy, analysis),
      label: variantLabel(resolved.policy, assumptions),
      withdrawalPolicy: resolved.policy,
      assumptions,
      analysis,
      reusedBaseline,
    });
  }

  return {
    version: RETIREMENT_SCENARIO_VERSION,
    calculator: 'retirement',
    status: 'completed',
    computedAt: new Date().toISOString(),
    durationMs: Date.now() - startedAt,
    baselineScenarioId,
    scenarios,
  };
}

export interface CompactRetirementScenarioResult {
  id: string;
  label: string;
  withdrawalPolicy: WithdrawalPolicy;
  assumptions: RetirementScenarioAssumption[];
  reusedBaseline: boolean;
  metrics: {
    withdrawalRate: number;
    yearsOfExpenses: number;
    projectedPortfolioAtWithdrawalStart: number;
    survivalRate: number;
    totalSequences: number;
    depletionPercentiles: RetirementAnalysisOutput['stressTest']['depletionPercentiles'];
  };
}

export type RetirementScenarioEvidence =
  | UnavailableRetirementScenarioExecution
  | Omit<CompletedRetirementScenarioExecution, 'scenarios'> & {
      scenarios: CompactRetirementScenarioResult[];
    };

export function compactRetirementScenarioExecution(
  execution: RetirementScenarioExecution
): RetirementScenarioEvidence {
  if (execution.status === 'unavailable') return execution;
  return {
    version: execution.version,
    calculator: execution.calculator,
    status: execution.status,
    computedAt: execution.computedAt,
    durationMs: execution.durationMs,
    baselineScenarioId: execution.baselineScenarioId,
    scenarios: execution.scenarios.map((scenario) => ({
      id: scenario.id,
      label: scenario.label,
      withdrawalPolicy: scenario.withdrawalPolicy,
      assumptions: scenario.assumptions,
      reusedBaseline: scenario.reusedBaseline,
      metrics: {
        withdrawalRate: scenario.analysis.metrics.withdrawalRate,
        yearsOfExpenses: scenario.analysis.metrics.yearsOfExpenses,
        projectedPortfolioAtWithdrawalStart: scenario.analysis.metrics.projectedPortfolioAtWithdrawalStart,
        survivalRate: scenario.analysis.stressTest.survivalRate,
        totalSequences: scenario.analysis.stressTest.totalSequences,
        depletionPercentiles: scenario.analysis.stressTest.depletionPercentiles,
      },
    })),
  };
}

function factId(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 80);
}

/** Convert retirement scenario outputs into registry-owned canonical evidence. */
export function retirementScenarioCanonicalFacts(
  execution: RetirementScenarioExecution
): CanonicalFact[] {
  if (execution.status !== 'completed') return [];
  const facts: CanonicalFact[] = [];
  const addInput = (
    id: string,
    label: string,
    value: unknown,
    unit: CanonicalFactUnit,
    scenarioId: string
  ) => {
    if (typeof value !== 'number' || !Number.isFinite(value)) return;
    facts.push({
      id,
      label,
      value,
      unit,
      provenance: {
        kind: 'scenario_input',
        source: `retirementScenario.${scenarioId}.assumptions`,
        scenarioId,
        calculatorId: RETIREMENT_CALCULATOR_ID,
        calculatorVersion: execution.version,
      },
    });
  };
  const addCalculation = (
    id: string,
    label: string,
    value: unknown,
    unit: CanonicalFactUnit,
    scenarioId: string,
    calculation?: { formula: string; inputFactIds: string[] }
  ) => {
    if (typeof value !== 'number' || !Number.isFinite(value)) return;
    facts.push({
      id,
      label,
      value,
      unit,
      provenance: {
        kind: 'scenario_calculation',
        source: `retirementScenario.${scenarioId}`,
        scenarioId,
        calculatorId: RETIREMENT_CALCULATOR_ID,
        calculatorVersion: execution.version,
        ...calculation,
      },
    });
  };

  for (const scenario of execution.scenarios) {
    const prefix = `retirement_scenario_${factId(scenario.id)}`;
    const assumptionUnits: Record<string, CanonicalFactUnit> = {
      current_age: 'age',
      retirement_age: 'age',
      annual_withdrawal_amount: 'usd',
      withdrawal_start_age: 'age',
      life_expectancy: 'age',
      pre_withdrawal_contributions: 'usd',
      annual_growth_rate: 'ratio',
    };
    for (const assumption of scenario.assumptions) {
      const unit = assumptionUnits[assumption.key];
      if (!unit) continue;
      addInput(
        `${prefix}_assumption_${factId(assumption.key)}`,
        `${scenario.label} ${assumption.label.toLowerCase()}`,
        assumption.value,
        unit,
        scenario.id
      );
    }
    addCalculation(`${prefix}_withdrawal_rate`, `${scenario.label} initial withdrawal rate`, scenario.analysis.metrics.withdrawalRate * 100, 'percent', scenario.id);
    addCalculation(`${prefix}_years_of_expenses`, `${scenario.label} years of starting expenses`, scenario.analysis.metrics.yearsOfExpenses, 'years', scenario.id);
    addCalculation(`${prefix}_projected_portfolio_at_withdrawal_start`, `${scenario.label} median projected portfolio at withdrawal start`, scenario.analysis.metrics.projectedPortfolioAtWithdrawalStart, 'usd', scenario.id);
    addCalculation(`${prefix}_survival_rate`, `${scenario.label} historical survival rate`, scenario.analysis.stressTest.survivalRate * 100, 'percent', scenario.id);
    addCalculation(`${prefix}_historical_sequence_count`, `${scenario.label} historical sequence count`, scenario.analysis.stressTest.totalSequences, 'count', scenario.id);
    if (scenario.withdrawalPolicy.type === 'fixed_growth') {
      const growthInputFactId = `${prefix}_assumption_annual_growth_rate`;
      addCalculation(
        `${prefix}_annual_withdrawal_growth`,
        `${scenario.label} rate assumption`,
        scenario.withdrawalPolicy.annualRate * 100,
        'percent',
        scenario.id,
        facts.some((fact) => fact.id === growthInputFactId)
          ? { formula: 'input * 100', inputFactIds: [growthInputFactId] }
          : undefined
      );
    }
    for (const percentile of ['p10', 'p25', 'p50', 'p75', 'p90'] as const) {
      addCalculation(
        `${prefix}_depletion_years_${percentile}`,
        `${scenario.label} ${percentile} years until depletion`,
        scenario.analysis.stressTest.depletionPercentiles[percentile],
        'years',
        scenario.id
      );
    }
  }

  if (execution.scenarios.length >= 2) {
    const [primary, comparison] = execution.scenarios;
    const primaryPrefix = `retirement_scenario_${factId(primary.id)}`;
    const comparisonPrefix = `retirement_scenario_${factId(comparison.id)}`;
    const comparisonId = `${primary.id}_vs_${comparison.id}`;
    addCalculation(
      `retirement_scenario_comparison_${factId(comparisonId)}_survival_rate_gap`,
      `Absolute survival-rate gap between ${primary.label} and ${comparison.label}`,
      Number((Math.abs(primary.analysis.stressTest.survivalRate - comparison.analysis.stressTest.survivalRate) * 100).toFixed(10)),
      'percent',
      comparisonId,
      {
        formula: 'abs(input[0] - input[1])',
        inputFactIds: [`${primaryPrefix}_survival_rate`, `${comparisonPrefix}_survival_rate`],
      }
    );
  }
  return facts;
}

/** Deterministic disclosure for retirement what-if results. */
export function describeRetirementScenarioExecution(
  execution: RetirementScenarioExecution
): string | null {
  if (execution.status === 'unavailable') {
    return `I could not run the requested scenario comparison: ${execution.reason}`;
  }
  if (execution.scenarios.length === 0) return null;

  const labels = execution.scenarios.map((scenario) => scenario.label);
  const assumptionMaps = execution.scenarios.map((scenario) =>
    new Map(scenario.assumptions.map((assumption) => [assumption.key, assumption]))
  );
  const comparisonLedgersAvailable = assumptionMaps.slice(1).every((map) => map.size > 0);
  const commonValue = (key: string): string | number | undefined => {
    const first = assumptionMaps[0].get(key)?.value;
    if (!comparisonLedgersAvailable) return first;
    return assumptionMaps.every((map) => map.get(key)?.value === first) ? first : undefined;
  };
  const annualSpending = commonValue('annual_withdrawal_amount');
  const annualContribution = commonValue('pre_withdrawal_contributions');
  const currentAge = commonValue('current_age');
  const retirementAge = commonValue('retirement_age');
  const withdrawalStartAge = commonValue('withdrawal_start_age');
  const lifeExpectancy = commonValue('life_expectancy');
  const defaults = execution.scenarios.flatMap((scenario) => scenario.assumptions)
    .filter((assumption) => assumption.origin === 'default' && assumption.key === 'annual_growth_rate');

  const heldConstant = [
    typeof annualSpending === 'number'
      ? `starting spending of $${Math.round(annualSpending).toLocaleString('en-US')} a year in today's dollars`
      : null,
    typeof currentAge === 'number' ? `age ${currentAge} today` : null,
    typeof retirementAge === 'number' ? `retirement at ${retirementAge}` : null,
    typeof withdrawalStartAge === 'number' && withdrawalStartAge !== retirementAge
      ? `withdrawals starting at ${withdrawalStartAge}`
      : null,
    typeof lifeExpectancy === 'number' ? `life expectancy ${lifeExpectancy}` : null,
    typeof annualContribution === 'number'
      ? annualContribution > 0
        ? `$${Math.round(annualContribution).toLocaleString('en-US')} a year in pre-withdrawal contributions in today's dollars`
        : 'no additional contributions before withdrawals begin'
      : comparisonLedgersAvailable
        ? null
        : 'no additional contributions before withdrawals begin',
  ].filter((item): item is string => Boolean(item));
  const changedInputs = execution.scenarios.flatMap((scenario) => {
    const currencyKeys = new Set(['annual_withdrawal_amount', 'pre_withdrawal_contributions']);
    const changes = scenario.assumptions
      .filter((assumption) => assumption.origin === 'user' && assumption.key !== 'withdrawal_policy')
      .map((assumption) => `${assumption.label.toLowerCase()} ${
        typeof assumption.value === 'number' && currencyKeys.has(assumption.key)
          ? `$${Math.round(assumption.value).toLocaleString('en-US')}`
          : assumption.value
      }`);
    return changes.length > 0 ? [`${scenario.label}: ${changes.join(', ')}`] : [];
  });
  const changesNotice = changedInputs.length > 0
    ? ` User-supplied variant inputs: ${changedInputs.join('; ')}.`
    : '';
  const defaultNotice = defaults.length > 0
    ? ` The fixed-growth rate was not specified, so I used the disclosed Ask Linc default of ${Number((Number(defaults[0].value) * 100).toFixed(4))}%.`
    : '';
  const action = labels.length > 1
    ? `compared ${labels.join(' with ')}`
    : `ran ${labels[0]}`;
  const heldConstantNotice = heldConstant.length > 0
    ? ` while holding ${heldConstant.join(', ')} constant`
    : '';
  return `Scenario assumptions: ${action}${heldConstantNotice}.${changesNotice}${defaultNotice} Change any assumption and I will re-run it.`;
}

export const retirementScenarioCalculator: ScenarioCalculatorDefinition<
  RetirementScenarioPlan,
  RetirementScenarioExecution,
  RetirementScenarioEvidence
> = {
  id: RETIREMENT_CALCULATOR_ID,
  version: RETIREMENT_SCENARIO_VERSION,
  label: 'Retirement scenarios',
  description: 'Compare retirement timing, spending, contributions, longevity, and withdrawal-growth assumptions.',
  requiredPacks: ['retirement_analysis'],
  supportedOverrides: [
    {
      id: 'withdrawal_policy',
      label: 'Withdrawal policy',
      description: 'Historical CPI-linked, flat nominal, or fixed annual withdrawal growth.',
      valueType: 'enum',
      options: ['historical_cpi', 'flat_nominal', 'fixed_growth'],
    },
    {
      id: 'annual_withdrawal_growth_rate',
      label: 'Annual withdrawal growth',
      description: 'Fixed annual change in nominal withdrawals after withdrawals begin.',
      valueType: 'percentage',
      minimum: -0.2,
      maximum: 0.5,
    },
    {
      id: 'annual_withdrawal_amount',
      label: 'Starting annual retirement spending',
      description: 'Starting retirement spending in today\'s dollars.',
      valueType: 'currency',
      minimum: 1,
      maximum: 100_000_000,
    },
    {
      id: 'annual_contribution_amount',
      label: 'Annual pre-withdrawal contributions',
      description: 'Annual contributions in today\'s dollars before withdrawals begin.',
      valueType: 'currency',
      minimum: 0,
      maximum: 100_000_000,
    },
    {
      id: 'retirement_age',
      label: 'Retirement age',
      description: 'Age at retirement; also becomes withdrawal start age unless separately overridden.',
      valueType: 'age',
      minimum: 30,
      maximum: 100,
    },
    {
      id: 'withdrawal_start_age',
      label: 'Withdrawal start age',
      description: 'Age when modeled retirement withdrawals begin.',
      valueType: 'age',
      minimum: 30,
      maximum: 120,
    },
    {
      id: 'life_expectancy',
      label: 'Life expectancy',
      description: 'Age through which the withdrawal plan is modeled.',
      valueType: 'age',
      minimum: 50,
      maximum: 120,
    },
  ],
  defaults: [
    {
      id: 'withdrawal_policy',
      value: 'historical_cpi',
      description: 'The deployed retirement baseline follows each historical sequence\'s CPI.',
    },
    {
      id: 'annual_withdrawal_growth_rate',
      value: DEFAULT_FIXED_WITHDRAWAL_GROWTH_RATE,
      description: 'Used only when fixed growth is requested without a rate.',
      appliesWhen: 'withdrawal_policy is fixed_growth and no user rate is supplied',
    },
    {
      id: 'annual_contribution_amount',
      value: 0,
      description: 'No additional contributions before withdrawals begin.',
    },
    {
      id: 'life_expectancy',
      value: 95,
      description: 'Used when the completed baseline has no life-expectancy input.',
    },
  ],
  outputs: [
    { id: 'withdrawal_rate', label: 'Initial withdrawal rate', unit: 'percent', scope: 'variant', description: 'Starting spending divided by median real portfolio value at withdrawal start.' },
    { id: 'years_of_expenses', label: 'Years of starting expenses', unit: 'years', scope: 'variant', description: 'Median real withdrawal-start portfolio divided by starting annual spending.' },
    { id: 'projected_portfolio_at_withdrawal_start', label: 'Median portfolio at withdrawal start', unit: 'usd', scope: 'variant', description: 'Median real portfolio value across historical accumulation sequences.' },
    { id: 'survival_rate', label: 'Historical rolling-window survival share', unit: 'percent', scope: 'variant', description: 'Share of overlapping monthly historical windows that fund the complete horizon; the windows are not independent observations.' },
    { id: 'historical_sequence_count', label: 'Historical sequence count', unit: 'count', scope: 'variant', description: 'Number of rolling historical sequences modeled.' },
    { id: 'depletion_years_percentiles', label: 'Years-until-depletion percentiles', unit: 'years', scope: 'variant', description: 'P10, P25, P50, P75, and P90 years until depletion.' },
    { id: 'survival_rate_gap', label: 'Survival-rate gap', unit: 'percent', scope: 'comparison', description: 'Absolute percentage-point gap between two variants.' },
  ],
  planner: {
    jsonSchema: RETIREMENT_SCENARIO_PLAN_JSON_SCHEMA,
    instructions: `When the user asks to run or compare a retirement scenario, set requested=true. A variant can change the withdrawal policy, starting annual retirement spending, annual pre-withdrawal contributions, retirement age, withdrawal start age, or life expectancy. Use historical_cpi when the request changes an input but does not change withdrawal growth. Values must come from the user's words; put the matching short wording in overrides.sources. The overrides object is always present; use null for every absent value and source. If retirementAge changes and withdrawalStartAge is not separately stated, repeat the retirement age as withdrawalStartAge. Policy meanings: historical_cpi follows each sequence's CPI, flat_nominal keeps the same nominal dollars, and fixed_growth applies one fixed annual increase. annualRate is decimal (3% is 0.03); use null when the user gives no fixed-growth rate so application code can disclose its default. Use primary for the requested case and comparison for an explicitly named second case. When there is no retirement scenario, set requested=false, use type=none for both variants, return null for rates and policy sources, and return override objects whose values and sources are all null.`,
    parsePlan: parseRetirementScenarioPlan,
  },
  execution: {
    progressMessage: 'Running the retirement scenarios',
    failureMessage: 'The requested retirement scenario could not be calculated. The existing retirement baseline remains available.',
  },
  execute: runRetirementScenario,
  unavailable,
  compactEvidence: compactRetirementScenarioExecution,
  canonicalFacts: retirementScenarioCanonicalFacts,
  describeAssumptions: describeRetirementScenarioExecution,
};
