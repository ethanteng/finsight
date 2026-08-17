import { createHash } from 'crypto';
import type { FinancialContextSnapshot } from '../openai/types';
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
    { id: 'survival_rate', label: 'Historical survival rate', unit: 'percent', scope: 'variant', description: 'Share of modeled historical sequences that fund the complete horizon.' },
    { id: 'historical_sequence_count', label: 'Historical sequence count', unit: 'count', scope: 'variant', description: 'Number of rolling historical sequences modeled.' },
    { id: 'depletion_years_percentiles', label: 'Years-until-depletion percentiles', unit: 'years', scope: 'variant', description: 'P10, P25, P50, P75, and P90 years until depletion.' },
    { id: 'survival_rate_gap', label: 'Survival-rate gap', unit: 'percent', scope: 'comparison', description: 'Absolute percentage-point gap between two variants.' },
  ],
  planner: {
    jsonSchema: RETIREMENT_SCENARIO_PLAN_JSON_SCHEMA,
    instructions: `When the user asks to run or compare a retirement scenario, set requested=true. A variant can change the withdrawal policy, starting annual retirement spending, annual pre-withdrawal contributions, retirement age, withdrawal start age, or life expectancy. Use historical_cpi when the request changes an input but does not change withdrawal growth. Values must come from the user's words; put the matching short wording in overrides.sources. The overrides object is always present; use null for every absent value and source. If retirementAge changes and withdrawalStartAge is not separately stated, repeat the retirement age as withdrawalStartAge. Policy meanings: historical_cpi follows each sequence's CPI, flat_nominal keeps the same nominal dollars, and fixed_growth applies one fixed annual increase. annualRate is decimal (3% is 0.03); use null when the user gives no fixed-growth rate so application code can disclose its default. Use primary for the requested case and comparison for an explicitly named second case. When there is no retirement scenario, set requested=false, use type=none for both variants, return null for rates and policy sources, and return override objects whose values and sources are all null.`,
    parsePlan: parseRetirementScenarioPlan,
  },
  execute: runRetirementScenario,
  unavailable,
  compactEvidence: compactRetirementScenarioExecution,
};
