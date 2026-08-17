import { createHash } from 'crypto';
import type { FinancialContextSnapshot } from '../openai/types';
import {
  analyzeRetirementPortfolio,
  type RetirementAnalysisInput,
  type RetirementAnalysisOutput,
  type WithdrawalPolicy,
} from '../retirement-analytics';

export const RETIREMENT_SCENARIO_VERSION = 1 as const;
export const DEFAULT_FIXED_WITHDRAWAL_GROWTH_RATE = 0.03;

const PLANNED_POLICY_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['type', 'annualRate', 'source'],
  properties: {
    type: {
      type: 'string',
      enum: ['none', 'historical_cpi', 'flat_nominal', 'fixed_growth'],
    },
    annualRate: { type: ['number', 'null'] },
    source: { type: ['string', 'null'] },
  },
} as const;

/** Shared strict-schema fragment for the preflight and primary-model tool pass. */
export const RETIREMENT_SCENARIO_PLAN_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['requested', 'primary', 'comparison'],
  properties: {
    requested: { type: 'boolean' },
    primary: PLANNED_POLICY_JSON_SCHEMA,
    comparison: PLANNED_POLICY_JSON_SCHEMA,
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

export interface RetirementScenarioPlan {
  requested: true;
  primary: PlannedWithdrawalPolicy;
  comparison?: PlannedWithdrawalPolicy;
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
  version: typeof RETIREMENT_SCENARIO_VERSION;
  calculator: 'retirement';
  status: 'completed';
  computedAt: string;
  durationMs: number;
  baselineScenarioId: string;
  scenarios: RetirementScenarioResult[];
}

export interface UnavailableRetirementScenarioExecution {
  version: typeof RETIREMENT_SCENARIO_VERSION;
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

function parsePolicy(value: unknown): PlannedWithdrawalPolicy | undefined {
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
  const annualRate = rawRate !== undefined && rawRate > -0.2 && rawRate <= 0.5
    ? rawRate
    : undefined;
  return {
    type,
    ...(type === 'fixed_growth' && annualRate !== undefined && { annualRate }),
    ...(shortSource(record.source) && { source: shortSource(record.source) }),
  };
}

/** Validate the semantic planner/tool result without inferring intent from text. */
export function parseRetirementScenarioPlan(value: unknown): RetirementScenarioPlan | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  if (record.requested !== true) return undefined;
  const primary = parsePolicy(record.primary);
  if (!primary) return undefined;
  const comparison = parsePolicy(record.comparison);
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

function policyKey(policy: WithdrawalPolicy): string {
  return policy.type === 'fixed_growth'
    ? `${policy.type}:${policy.annualRate}`
    : policy.type;
}

function policyLabel(policy: WithdrawalPolicy): string {
  if (policy.type === 'flat_nominal') return 'Flat nominal withdrawals';
  if (policy.type === 'historical_cpi') return 'Historical CPI-linked withdrawals';
  return `${Number((policy.annualRate * 100).toFixed(4))}% annual withdrawal growth`;
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

function inheritedAssumptions(input: RetirementAnalysisInput): RetirementScenarioAssumption[] {
  return [
    { key: 'current_age', label: 'Current age', value: input.currentAge, origin: 'inherited' },
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
      label: 'Additional contributions before withdrawals',
      value: 0,
      origin: 'default',
    },
  ];
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
  };
  const baselinePolicy: WithdrawalPolicy = { type: 'historical_cpi' };
  const baselineScenarioId = scenarioId(baseInput, baselinePolicy, baseline as RetirementAnalysisOutput);
  const inherited = inheritedAssumptions(baseInput);
  const plannedPolicies = [plan.primary, plan.comparison].filter(
    (item): item is PlannedWithdrawalPolicy => Boolean(item)
  );
  if (!plan.comparison) {
    plannedPolicies.push({ type: 'historical_cpi' });
  }

  const unique = new Map<string, ReturnType<typeof resolvePolicy>>();
  for (const planned of plannedPolicies.slice(0, 2)) {
    const resolved = resolvePolicy(planned);
    if (!unique.has(policyKey(resolved.policy))) {
      unique.set(policyKey(resolved.policy), resolved);
    }
  }

  const scenarios: RetirementScenarioResult[] = [];
  for (const resolved of unique.values()) {
    const reusedBaseline = policyKey(resolved.policy) === policyKey(baselinePolicy);
    const analysis = reusedBaseline
      ? baseline as RetirementAnalysisOutput
      : await analyze({ ...baseInput, withdrawalPolicy: resolved.policy });
    scenarios.push({
      id: scenarioId(baseInput, resolved.policy, analysis),
      label: policyLabel(resolved.policy),
      withdrawalPolicy: resolved.policy,
      assumptions: [...resolved.assumptions, ...inherited],
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
