import { createHash } from 'crypto';
import type { FinancialContextSnapshot } from '../openai/types';
import type { CanonicalFact, CanonicalFactUnit } from '../openai/canonical-facts';
import type { ScenarioCalculatorDefinition } from './calculator-registry';

export const HOME_AFFORDABILITY_CALCULATOR_ID = 'home_affordability' as const;
export const HOME_AFFORDABILITY_SCENARIO_VERSION = 1 as const;

export const DEFAULT_DOWN_PAYMENT_PERCENT = 20;
export const DEFAULT_LOAN_TERM_YEARS = 30;
export const DEFAULT_CLOSING_COST_PERCENT = 3;
export const DEFAULT_MAINTENANCE_PERCENT = 1;
export const DEFAULT_EMERGENCY_FUND_MONTHS = 6;

const HOME_AFFORDABILITY_OVERRIDE_FIELDS = [
  'homePrice',
  'downPaymentAmount',
  'downPaymentPercent',
  'availableCashAmount',
  'mortgageRatePercent',
  'loanTermYears',
  'closingCostsAmount',
  'closingCostPercent',
  'propertyTaxAnnual',
  'homeownersInsuranceAnnual',
  'hoaMonthly',
  'mortgageInsuranceMonthly',
  'maintenanceAnnual',
  'movingAndInitialCosts',
  'currentHousingCostMonthly',
  'retirementContributionMonthly',
  'emergencyFundMonths',
] as const;

export type HomeAffordabilityOverrideField =
  (typeof HOME_AFFORDABILITY_OVERRIDE_FIELDS)[number];

const NULLABLE_NUMBER = { type: ['number', 'null'] as const };
const NULLABLE_STRING = { type: ['string', 'null'] as const };

const PLANNED_HOME_OVERRIDES_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [...HOME_AFFORDABILITY_OVERRIDE_FIELDS, 'sources'],
  properties: {
    ...Object.fromEntries(
      HOME_AFFORDABILITY_OVERRIDE_FIELDS.map((field) => [field, NULLABLE_NUMBER])
    ),
    sources: {
      type: 'object',
      additionalProperties: false,
      required: [...HOME_AFFORDABILITY_OVERRIDE_FIELDS],
      properties: Object.fromEntries(
        HOME_AFFORDABILITY_OVERRIDE_FIELDS.map((field) => [field, NULLABLE_STRING])
      ),
    },
  },
} as const;

const PLANNED_HOME_VARIANT_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['overrides'],
  properties: {
    overrides: PLANNED_HOME_OVERRIDES_JSON_SCHEMA,
  },
} as const;

export const HOME_AFFORDABILITY_SCENARIO_PLAN_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['requested', 'primary', 'comparison'],
  properties: {
    requested: { type: 'boolean' },
    primary: PLANNED_HOME_VARIANT_JSON_SCHEMA,
    comparison: PLANNED_HOME_VARIANT_JSON_SCHEMA,
  },
} as const;

export interface PlannedHomeAffordabilityOverrides {
  homePrice?: number;
  downPaymentAmount?: number;
  downPaymentPercent?: number;
  availableCashAmount?: number;
  mortgageRatePercent?: number;
  loanTermYears?: number;
  closingCostsAmount?: number;
  closingCostPercent?: number;
  propertyTaxAnnual?: number;
  homeownersInsuranceAnnual?: number;
  hoaMonthly?: number;
  mortgageInsuranceMonthly?: number;
  maintenanceAnnual?: number;
  movingAndInitialCosts?: number;
  currentHousingCostMonthly?: number;
  retirementContributionMonthly?: number;
  emergencyFundMonths?: number;
  sources: Partial<Record<HomeAffordabilityOverrideField, string>>;
}

export interface PlannedHomeAffordabilityVariant {
  overrides?: PlannedHomeAffordabilityOverrides;
}

export interface HomeAffordabilityScenarioPlan {
  requested: true;
  primary: PlannedHomeAffordabilityVariant;
  comparison?: PlannedHomeAffordabilityVariant;
}

export type HomeAffordabilityAssumptionOrigin =
  | 'user'
  | 'snapshot'
  | 'external'
  | 'default';

export interface HomeAffordabilityAssumption {
  key: string;
  label: string;
  value: number;
  unit: CanonicalFactUnit;
  origin: HomeAffordabilityAssumptionOrigin;
  source?: string;
}

export type HomeAffordabilityAssessment =
  | 'supported'
  | 'not_supported'
  | 'incomplete';

export interface HomeAffordabilityMetrics {
  homePrice: number;
  downPaymentAmount: number;
  downPaymentPercent: number;
  loanAmount: number;
  principalAndInterestMonthly: number;
  propertyTaxMonthly: number;
  homeownersInsuranceMonthly: number;
  hoaMonthly: number;
  mortgageInsuranceMonthly: number;
  maintenanceMonthly: number;
  allInHousingMonthly: number;
  closingCosts: number;
  movingAndInitialCosts: number;
  upfrontCashNeeded: number;
  cashRemaining?: number;
  monthlyHousingChange?: number;
  postPurchaseMonthlyExpenses?: number;
  postPurchaseMonthlySurplus?: number;
  retirementContributionMonthly?: number;
  surplusAfterRetirementContribution?: number;
  reserveTarget?: number;
  reserveMonths?: number;
  reserveGap?: number;
  reserveBasis?: 'post_purchase' | 'current_spending';
}

export type HomeAffordabilityBindingConstraint =
  | 'upfront_cash'
  | 'monthly_cash_flow'
  | 'retirement_contribution'
  | 'reserve_floor'
  | 'none';

export interface HomeAffordabilityConstraints {
  upfrontCashCovered?: boolean;
  emergencyReserveCovered?: boolean;
  monthlyCashFlowNonnegative?: boolean;
  retirementContributionCovered?: boolean;
}

export interface HomeAffordabilityScenarioResult {
  id: string;
  label: string;
  assumptions: HomeAffordabilityAssumption[];
  metrics: HomeAffordabilityMetrics;
  costCoverage: 'complete' | 'lower_bound';
  missingInputs: string[];
  assessment: HomeAffordabilityAssessment;
  constraints: HomeAffordabilityConstraints;
  /**
   * Which constraint actually blocks the purchase, or `none` when every
   * constraint clears. Absent while the assessment is `incomplete`, because a
   * missing input cannot be ranked against a real shortfall.
   */
  bindingConstraint?: HomeAffordabilityBindingConstraint;
}

/**
 * Order in which a failing constraint is reported as the binding one. Closing
 * is impossible without the upfront cash; a negative operating surplus is
 * structural; preserving the stated retirement contribution outranks the
 * reserve floor, which is a cushion rather than a payment obligation.
 */
const BINDING_CONSTRAINT_PRIORITY: ReadonlyArray<
  [keyof HomeAffordabilityConstraints, HomeAffordabilityBindingConstraint]
> = [
  ['upfrontCashCovered', 'upfront_cash'],
  ['monthlyCashFlowNonnegative', 'monthly_cash_flow'],
  ['retirementContributionCovered', 'retirement_contribution'],
  ['emergencyReserveCovered', 'reserve_floor'],
];

export interface CompletedHomeAffordabilityScenarioExecution {
  version: number;
  calculator: 'home_affordability';
  status: 'completed';
  computedAt: string;
  durationMs: number;
  scenarios: HomeAffordabilityScenarioResult[];
  /** Set when the primary case ran but the requested comparison could not. */
  comparisonUnavailableReason?: string;
}

export interface UnavailableHomeAffordabilityScenarioExecution {
  version: number;
  calculator: 'home_affordability';
  status: 'unavailable';
  computedAt: string;
  durationMs: number;
  reason: string;
}

export type HomeAffordabilityScenarioExecution =
  | CompletedHomeAffordabilityScenarioExecution
  | UnavailableHomeAffordabilityScenarioExecution;

export type HomeAffordabilityScenarioEvidence = HomeAffordabilityScenarioExecution;

const OVERRIDE_RANGES: Record<HomeAffordabilityOverrideField, {
  minimum: number;
  maximum: number;
  integer?: boolean;
}> = {
  homePrice: { minimum: 10_000, maximum: 100_000_000 },
  downPaymentAmount: { minimum: 0, maximum: 100_000_000 },
  downPaymentPercent: { minimum: 0, maximum: 100 },
  availableCashAmount: { minimum: 0, maximum: 100_000_000 },
  mortgageRatePercent: { minimum: 0, maximum: 30 },
  loanTermYears: { minimum: 1, maximum: 50, integer: true },
  closingCostsAmount: { minimum: 0, maximum: 20_000_000 },
  closingCostPercent: { minimum: 0, maximum: 20 },
  propertyTaxAnnual: { minimum: 0, maximum: 10_000_000 },
  homeownersInsuranceAnnual: { minimum: 0, maximum: 10_000_000 },
  hoaMonthly: { minimum: 0, maximum: 100_000 },
  mortgageInsuranceMonthly: { minimum: 0, maximum: 100_000 },
  maintenanceAnnual: { minimum: 0, maximum: 10_000_000 },
  movingAndInitialCosts: { minimum: 0, maximum: 20_000_000 },
  currentHousingCostMonthly: { minimum: 0, maximum: 1_000_000 },
  retirementContributionMonthly: { minimum: 0, maximum: 1_000_000 },
  emergencyFundMonths: { minimum: 0, maximum: 60 },
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

function roundMoney(value: number): number {
  return Number(value.toFixed(2));
}

function roundPercent(value: number): number {
  return Number(value.toFixed(6));
}

function parseOverrides(value: unknown): PlannedHomeAffordabilityOverrides | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const rawSources = record.sources && typeof record.sources === 'object' && !Array.isArray(record.sources)
    ? record.sources as Record<string, unknown>
    : {};
  const overrides: PlannedHomeAffordabilityOverrides = { sources: {} };

  for (const field of HOME_AFFORDABILITY_OVERRIDE_FIELDS) {
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

  return HOME_AFFORDABILITY_OVERRIDE_FIELDS.some((field) => overrides[field] !== undefined)
    ? overrides
    : undefined;
}

function parseVariant(value: unknown, allowEmpty = false): PlannedHomeAffordabilityVariant | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const overrides = parseOverrides(record.overrides);
  if (!overrides && !allowEmpty) return undefined;
  return { ...(overrides && { overrides }) };
}

/** Validate the semantic planner result without extracting numbers from prose. */
export function parseHomeAffordabilityScenarioPlan(
  value: unknown
): HomeAffordabilityScenarioPlan | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  if (record.requested !== true) return undefined;
  const primary = parseVariant(record.primary, true);
  if (!primary) return undefined;
  const comparison = parseVariant(record.comparison);
  return {
    requested: true,
    primary,
    ...(comparison && { comparison }),
  };
}

function unavailable(
  startedAt: number,
  reason: string
): UnavailableHomeAffordabilityScenarioExecution {
  return {
    version: HOME_AFFORDABILITY_SCENARIO_VERSION,
    calculator: HOME_AFFORDABILITY_CALCULATOR_ID,
    status: 'unavailable',
    computedAt: new Date().toISOString(),
    durationMs: Date.now() - startedAt,
    reason,
  };
}

function applyOverrideLayer(
  target: PlannedHomeAffordabilityOverrides,
  layer: PlannedHomeAffordabilityOverrides | undefined
): PlannedHomeAffordabilityOverrides {
  if (!layer) return target;
  const merged: PlannedHomeAffordabilityOverrides = {
    ...target,
    sources: { ...target.sources },
  };

  for (const field of HOME_AFFORDABILITY_OVERRIDE_FIELDS) {
    const value = layer[field];
    const source = layer.sources[field];
    if (value === undefined || !source) continue;
    merged[field] = value;
    merged.sources[field] = source;
  }

  if (layer.downPaymentAmount !== undefined) {
    delete merged.downPaymentPercent;
    delete merged.sources.downPaymentPercent;
  } else if (layer.downPaymentPercent !== undefined) {
    delete merged.downPaymentAmount;
    delete merged.sources.downPaymentAmount;
  }
  if (layer.closingCostsAmount !== undefined) {
    delete merged.closingCostPercent;
    delete merged.sources.closingCostPercent;
  } else if (layer.closingCostPercent !== undefined) {
    delete merged.closingCostsAmount;
    delete merged.sources.closingCostsAmount;
  }
  return merged;
}

function mortgagePayment(
  principal: number,
  annualRatePercent: number,
  termYears: number
): number {
  if (principal <= 0) return 0;
  const payments = termYears * 12;
  const monthlyRate = annualRatePercent / 100 / 12;
  if (monthlyRate === 0) return principal / payments;
  const growth = (1 + monthlyRate) ** payments;
  return principal * ((monthlyRate * growth) / (growth - 1));
}

interface ResolvedHomeVariant {
  result: HomeAffordabilityScenarioResult;
  key: string;
}

function resolveVariant(
  snapshot: FinancialContextSnapshot,
  overrides: PlannedHomeAffordabilityOverrides
): ResolvedHomeVariant | string {
  const rawHomePrice = overrides.homePrice;
  if (rawHomePrice === undefined) {
    return 'A target home price is required to run the affordability calculator.';
  }
  const homePrice = roundMoney(rawHomePrice);

  const assumptions: HomeAffordabilityAssumption[] = [];
  const addAssumption = (
    key: string,
    label: string,
    value: number,
    unit: CanonicalFactUnit,
    origin: HomeAffordabilityAssumptionOrigin,
    source?: string
  ) => assumptions.push({ key, label, value, unit, origin, ...(source && { source }) });

  addAssumption(
    'home_price',
    'Target home price',
    homePrice,
    'usd',
    'user',
    overrides.sources.homePrice
  );

  const downPaymentUsesAmount = overrides.downPaymentAmount !== undefined;
  const requestedDownPaymentPercent = overrides.downPaymentPercent ?? DEFAULT_DOWN_PAYMENT_PERCENT;
  const downPaymentAmount = roundMoney(
    downPaymentUsesAmount
      ? overrides.downPaymentAmount!
      : homePrice * (requestedDownPaymentPercent / 100)
  );
  if (downPaymentAmount > homePrice) {
    return 'The down payment cannot exceed the target home price.';
  }
  const downPaymentPercent = homePrice > 0
    ? (downPaymentAmount / homePrice) * 100
    : 0;
  if (downPaymentUsesAmount) {
    addAssumption(
      'down_payment_amount',
      'Down payment',
      downPaymentAmount,
      'usd',
      'user',
      overrides.sources.downPaymentAmount
    );
  } else {
    addAssumption(
      'down_payment_percent',
      'Down payment rate',
      requestedDownPaymentPercent,
      'percent',
      overrides.downPaymentPercent !== undefined ? 'user' : 'default',
      overrides.sources.downPaymentPercent ?? `${DEFAULT_DOWN_PAYMENT_PERCENT}% planning default`
    );
  }

  const overviewCash = finiteNumber(snapshot.financialSummary?.financialOverview?.totalCash);
  const availableCash = overrides.availableCashAmount !== undefined
    ? roundMoney(overrides.availableCashAmount)
    : overviewCash !== undefined
      ? roundMoney(overviewCash)
      : undefined;
  if (availableCash !== undefined) {
    addAssumption(
      'available_cash',
      'Cash available before purchase',
      availableCash,
      'usd',
      overrides.availableCashAmount !== undefined ? 'user' : 'snapshot',
      overrides.sources.availableCashAmount ?? 'Connected cash balances'
    );
  }

  const marketRate = snapshot.tierContext.marketContext.economicIndicators?.mortgageRate;
  const rawMarketRateValue = finiteNumber(marketRate?.value);
  // A benchmark that arrives as zero or negative is a provider fault. Falling
  // through to it would silently price an interest-free mortgage and attribute
  // it to FRED, so only an explicitly stated rate may be non-positive.
  const marketRateValue = rawMarketRateValue !== undefined && rawMarketRateValue > 0
    ? rawMarketRateValue
    : undefined;
  const resolvedRatePercent = overrides.mortgageRatePercent ?? marketRateValue;
  // The accepted ranges permit a down payment equal to the price, and a zero
  // principal never reaches the rate in `mortgagePayment`. An all-cash purchase
  // must not be made unavailable just because no benchmark loaded.
  const loanAmount = roundMoney(homePrice - downPaymentAmount);
  const mortgageRatePercent = resolvedRatePercent ?? (loanAmount <= 0 ? 0 : undefined);
  if (mortgageRatePercent === undefined || mortgageRatePercent < 0 || mortgageRatePercent > 30) {
    return 'A mortgage rate is required. State a rate or load the current mortgage-rate context.';
  }
  addAssumption(
    'mortgage_rate_percent',
    'Annual mortgage rate',
    mortgageRatePercent,
    'percent',
    resolvedRatePercent === undefined
      ? 'default'
      : overrides.mortgageRatePercent !== undefined ? 'user' : 'external',
    overrides.sources.mortgageRatePercent
      ?? (resolvedRatePercent === undefined
        ? 'No mortgage required for an all-cash purchase'
        : marketRate ? `${marketRate.source}, observation ${marketRate.date}` : undefined)
  );

  const loanTermYears = overrides.loanTermYears ?? DEFAULT_LOAN_TERM_YEARS;
  addAssumption(
    'loan_term_years',
    'Loan term',
    loanTermYears,
    'years',
    overrides.loanTermYears !== undefined ? 'user' : 'default',
    overrides.sources.loanTermYears ?? `${DEFAULT_LOAN_TERM_YEARS}-year fixed planning default`
  );

  const closingUsesAmount = overrides.closingCostsAmount !== undefined;
  const requestedClosingPercent = overrides.closingCostPercent ?? DEFAULT_CLOSING_COST_PERCENT;
  const closingCosts = roundMoney(
    closingUsesAmount
      ? overrides.closingCostsAmount!
      : homePrice * (requestedClosingPercent / 100)
  );
  if (closingUsesAmount) {
    addAssumption(
      'closing_costs_amount',
      'Closing costs',
      closingCosts,
      'usd',
      'user',
      overrides.sources.closingCostsAmount
    );
  } else {
    addAssumption(
      'closing_cost_percent',
      'Closing-cost rate',
      requestedClosingPercent,
      'percent',
      overrides.closingCostPercent !== undefined ? 'user' : 'default',
      overrides.sources.closingCostPercent ?? `${DEFAULT_CLOSING_COST_PERCENT}% planning default`
    );
  }

  const missingRecurringCosts: string[] = [];
  const propertyTaxAnnual = roundMoney(overrides.propertyTaxAnnual ?? 0);
  if (overrides.propertyTaxAnnual === undefined) missingRecurringCosts.push('property taxes');
  addAssumption(
    'property_tax_annual',
    'Annual property taxes included',
    propertyTaxAnnual,
    'usd',
    overrides.propertyTaxAnnual !== undefined ? 'user' : 'default',
    overrides.sources.propertyTaxAnnual ?? 'Not supplied; excluded from the lower-bound cost'
  );

  const homeownersInsuranceAnnual = roundMoney(overrides.homeownersInsuranceAnnual ?? 0);
  if (overrides.homeownersInsuranceAnnual === undefined) {
    missingRecurringCosts.push('homeowners insurance');
  }
  addAssumption(
    'homeowners_insurance_annual',
    'Annual homeowners insurance included',
    homeownersInsuranceAnnual,
    'usd',
    overrides.homeownersInsuranceAnnual !== undefined ? 'user' : 'default',
    overrides.sources.homeownersInsuranceAnnual ?? 'Not supplied; excluded from the lower-bound cost'
  );

  // Round money assumptions to cents before they enter the ledger. Aggregates
  // that use sum(inputs) against these facts must add the same cent values or
  // deterministic validation fails for ordinary price/rate combinations.
  const hoaMonthly = roundMoney(overrides.hoaMonthly ?? 0);
  addAssumption(
    'hoa_monthly',
    'Monthly HOA dues',
    hoaMonthly,
    'usd',
    overrides.hoaMonthly !== undefined ? 'user' : 'default',
    overrides.sources.hoaMonthly ?? 'Assumes no HOA dues unless supplied'
  );

  const mortgageInsuranceMonthly = roundMoney(overrides.mortgageInsuranceMonthly ?? 0);
  if (downPaymentPercent < 20 && overrides.mortgageInsuranceMonthly === undefined) {
    missingRecurringCosts.push('mortgage insurance');
  }
  addAssumption(
    'mortgage_insurance_monthly',
    'Monthly mortgage insurance included',
    mortgageInsuranceMonthly,
    'usd',
    overrides.mortgageInsuranceMonthly !== undefined ? 'user' : 'default',
    overrides.sources.mortgageInsuranceMonthly
      ?? (downPaymentPercent < 20
        ? 'Not supplied; excluded from the lower-bound cost'
        : 'Assumes no mortgage insurance at this down payment')
  );

  const maintenanceAnnual = roundMoney(
    overrides.maintenanceAnnual ?? homePrice * (DEFAULT_MAINTENANCE_PERCENT / 100)
  );
  addAssumption(
    'maintenance_annual',
    'Annual maintenance reserve',
    maintenanceAnnual,
    'usd',
    overrides.maintenanceAnnual !== undefined ? 'user' : 'default',
    overrides.sources.maintenanceAnnual
      ?? `${DEFAULT_MAINTENANCE_PERCENT}% of home price planning default`
  );

  const movingAndInitialCosts = roundMoney(overrides.movingAndInitialCosts ?? 0);
  addAssumption(
    'moving_and_initial_costs',
    'Moving and initial home costs',
    movingAndInitialCosts,
    'usd',
    overrides.movingAndInitialCosts !== undefined ? 'user' : 'default',
    overrides.sources.movingAndInitialCosts ?? 'Assumes no additional moving or immediate repair costs'
  );

  const currentHousingCostMonthly = overrides.currentHousingCostMonthly !== undefined
    ? roundMoney(overrides.currentHousingCostMonthly)
    : undefined;
  if (currentHousingCostMonthly !== undefined) {
    addAssumption(
      'current_housing_cost_monthly',
      'Current monthly housing cost being replaced',
      currentHousingCostMonthly,
      'usd',
      'user',
      overrides.sources.currentHousingCostMonthly
    );
  }

  const emergencyFundMonths = overrides.emergencyFundMonths
    ?? DEFAULT_EMERGENCY_FUND_MONTHS;
  addAssumption(
    'emergency_fund_months',
    'Emergency-fund target',
    emergencyFundMonths,
    'months',
    overrides.emergencyFundMonths !== undefined ? 'user' : 'default',
    overrides.sources.emergencyFundMonths ?? `${DEFAULT_EMERGENCY_FUND_MONTHS}-month planning default`
  );

  const retirementContributionMonthly = overrides.retirementContributionMonthly !== undefined
    ? roundMoney(overrides.retirementContributionMonthly)
    : undefined;
  if (retirementContributionMonthly !== undefined) {
    addAssumption(
      'retirement_contribution_monthly',
      'Monthly take-home-funded retirement contribution to preserve',
      retirementContributionMonthly,
      'usd',
      'user',
      overrides.sources.retirementContributionMonthly
    );
  }

  const rawAverageMonthlyIncome = finiteNumber(snapshot.averageMonthlyIncome);
  const averageMonthlyIncome = rawAverageMonthlyIncome !== undefined
    ? roundMoney(rawAverageMonthlyIncome)
    : undefined;
  if (averageMonthlyIncome !== undefined) {
    addAssumption(
      'average_monthly_income',
      'Average monthly connected-account income',
      averageMonthlyIncome,
      'usd',
      'snapshot',
      'Canonical transaction cash-flow average'
    );
  }
  const observedMonthlyExpenses = finiteNumber(snapshot.averageMonthlyExpense);
  // A stated housing cost above the tracked spending baseline means the two
  // series disagree — housing paid from an unconnected account, or a
  // categorization gap. Subtracting it would understate post-purchase spending,
  // so drop the baseline and report the projection as missing rather than
  // discarding the upfront-cash and monthly-cost results the user can still use.
  const expenseBaselineConflict =
    observedMonthlyExpenses !== undefined &&
    currentHousingCostMonthly !== undefined &&
    currentHousingCostMonthly > observedMonthlyExpenses;
  const averageMonthlyExpenses = expenseBaselineConflict || observedMonthlyExpenses === undefined
    ? undefined
    : roundMoney(observedMonthlyExpenses);
  if (averageMonthlyExpenses !== undefined) {
    addAssumption(
      'average_monthly_expenses',
      'Average monthly connected-account expenses',
      averageMonthlyExpenses,
      'usd',
      'snapshot',
      'Canonical transaction cash-flow average'
    );
  }

  // Money outputs that participate in sum(inputs) facts are rounded to cents
  // first. round(sum(unrounded)) disagrees with sum(round(parts)) often enough
  // (~1 in 5 common price/rate pairs) that canonical validation would throw
  // before the answer model ever runs.
  const principalAndInterestMonthly = roundMoney(mortgagePayment(
    loanAmount,
    mortgageRatePercent,
    loanTermYears
  ));
  const propertyTaxMonthly = roundMoney(propertyTaxAnnual / 12);
  const homeownersInsuranceMonthly = roundMoney(homeownersInsuranceAnnual / 12);
  const maintenanceMonthly = roundMoney(maintenanceAnnual / 12);
  const allInHousingMonthly = roundMoney(
    principalAndInterestMonthly +
    propertyTaxMonthly +
    homeownersInsuranceMonthly +
    hoaMonthly +
    mortgageInsuranceMonthly +
    maintenanceMonthly
  );
  const upfrontCashNeeded = roundMoney(
    downPaymentAmount + closingCosts + movingAndInitialCosts
  );
  const cashRemaining = availableCash === undefined
    ? undefined
    : roundMoney(availableCash - upfrontCashNeeded);
  const monthlyHousingChange = currentHousingCostMonthly === undefined
    ? undefined
    : roundMoney(allInHousingMonthly - currentHousingCostMonthly);
  const postPurchaseMonthlyExpenses =
    averageMonthlyExpenses === undefined || currentHousingCostMonthly === undefined
      ? undefined
      : roundMoney(
          averageMonthlyExpenses - currentHousingCostMonthly + allInHousingMonthly
        );
  const postPurchaseMonthlySurplus =
    averageMonthlyIncome === undefined || postPurchaseMonthlyExpenses === undefined
      ? undefined
      : roundMoney(averageMonthlyIncome - postPurchaseMonthlyExpenses);
  const surplusAfterRetirementContribution =
    postPurchaseMonthlySurplus === undefined || retirementContributionMonthly === undefined
      ? undefined
      : roundMoney(postPurchaseMonthlySurplus - retirementContributionMonthly);

  const reserveBasis = postPurchaseMonthlyExpenses !== undefined
    ? 'post_purchase' as const
    : averageMonthlyExpenses !== undefined
      ? 'current_spending' as const
      : undefined;
  const monthlyReserveExpense = postPurchaseMonthlyExpenses ?? averageMonthlyExpenses;
  const reserveTarget = monthlyReserveExpense === undefined
    ? undefined
    : roundMoney(monthlyReserveExpense * emergencyFundMonths);
  const reserveMonths =
    cashRemaining === undefined || monthlyReserveExpense === undefined || monthlyReserveExpense <= 0
      ? undefined
      : cashRemaining / monthlyReserveExpense;
  const reserveGap = cashRemaining === undefined || reserveTarget === undefined
    ? undefined
    : roundMoney(cashRemaining - reserveTarget);

  const missingInputs = [
    ...missingRecurringCosts,
    ...(availableCash === undefined ? ['available cash'] : []),
    ...(averageMonthlyIncome === undefined ? ['average monthly income'] : []),
    ...(averageMonthlyExpenses === undefined
      ? [expenseBaselineConflict
          ? 'a tracked spending baseline that covers the stated current housing cost'
          : 'average monthly expenses']
      : []),
    ...(currentHousingCostMonthly === undefined ? ['current monthly housing cost'] : []),
  ];
  const complete = missingInputs.length === 0;
  const constraints: HomeAffordabilityConstraints = {
    ...(cashRemaining !== undefined && { upfrontCashCovered: cashRemaining >= 0 }),
    ...(reserveGap !== undefined && { emergencyReserveCovered: reserveGap >= 0 }),
    ...(postPurchaseMonthlySurplus !== undefined && {
      monthlyCashFlowNonnegative: postPurchaseMonthlySurplus >= 0,
    }),
    ...(surplusAfterRetirementContribution !== undefined && {
      retirementContributionCovered: surplusAfterRetirementContribution >= 0,
    }),
  };
  const assessment: HomeAffordabilityAssessment = !complete
    ? 'incomplete'
    : Object.values(constraints).every(Boolean)
      ? 'supported'
      : 'not_supported';
  // Only rank constraints once every input exists; a missing input is not a
  // shortfall and must not be presented as one.
  const bindingConstraint = complete
    ? BINDING_CONSTRAINT_PRIORITY.find(([key]) => constraints[key] === false)?.[1] ?? 'none'
    : undefined;

  const metrics: HomeAffordabilityMetrics = {
    homePrice,
    downPaymentAmount,
    downPaymentPercent: roundPercent(downPaymentPercent),
    loanAmount,
    principalAndInterestMonthly,
    propertyTaxMonthly,
    homeownersInsuranceMonthly,
    hoaMonthly,
    mortgageInsuranceMonthly,
    maintenanceMonthly,
    allInHousingMonthly,
    closingCosts,
    movingAndInitialCosts,
    upfrontCashNeeded,
    ...(cashRemaining !== undefined && { cashRemaining }),
    ...(monthlyHousingChange !== undefined && { monthlyHousingChange }),
    ...(postPurchaseMonthlyExpenses !== undefined && { postPurchaseMonthlyExpenses }),
    ...(postPurchaseMonthlySurplus !== undefined && { postPurchaseMonthlySurplus }),
    ...(retirementContributionMonthly !== undefined && {
      retirementContributionMonthly,
    }),
    ...(surplusAfterRetirementContribution !== undefined && {
      surplusAfterRetirementContribution,
    }),
    ...(reserveTarget !== undefined && { reserveTarget }),
    ...(reserveMonths !== undefined && { reserveMonths: Number(reserveMonths.toFixed(4)) }),
    ...(reserveGap !== undefined && { reserveGap }),
    ...(reserveBasis && { reserveBasis }),
  };
  const key = JSON.stringify({
    version: HOME_AFFORDABILITY_SCENARIO_VERSION,
    assumptions: assumptions.map(({ key: assumptionKey, value }) => [assumptionKey, value]),
    metrics,
  });
  const digest = createHash('sha256').update(key).digest('hex').slice(0, 16);
  const label = `$${Math.round(homePrice).toLocaleString('en-US')} home with ${Number(
    downPaymentPercent.toFixed(2)
  )}% down`;

  return {
    key,
    result: {
      id: `home_affordability_${digest}`,
      label,
      assumptions,
      metrics,
      costCoverage: missingRecurringCosts.length > 0 ? 'lower_bound' : 'complete',
      missingInputs,
      assessment,
      constraints,
      ...(bindingConstraint && { bindingConstraint }),
    },
  };
}

/** Run one target-home case and, when requested, one comparison case. */
export async function runHomeAffordabilityScenario(
  snapshot: FinancialContextSnapshot,
  plan: HomeAffordabilityScenarioPlan
): Promise<HomeAffordabilityScenarioExecution> {
  const startedAt = Date.now();
  const primaryOverrides = applyOverrideLayer(
    { sources: {} },
    plan.primary.overrides
  );
  const variants = [primaryOverrides];
  if (plan.comparison?.overrides) {
    variants.push(applyOverrideLayer(primaryOverrides, plan.comparison.overrides));
  }

  const scenarios: HomeAffordabilityScenarioResult[] = [];
  const seen = new Set<string>();
  let comparisonUnavailableReason: string | undefined;
  for (const [index, overrides] of variants.slice(0, 2).entries()) {
    const resolved = resolveVariant(snapshot, overrides);
    if (typeof resolved === 'string') {
      // Only the primary case is load-bearing. An unusable comparison is
      // reported alongside a valid primary instead of discarding it.
      if (index === 0) return unavailable(startedAt, resolved);
      comparisonUnavailableReason = resolved;
      continue;
    }
    if (seen.has(resolved.key)) continue;
    seen.add(resolved.key);
    scenarios.push(resolved.result);
  }

  if (scenarios.length === 0) {
    return unavailable(startedAt, 'No valid target-home scenario was supplied.');
  }
  return {
    version: HOME_AFFORDABILITY_SCENARIO_VERSION,
    calculator: HOME_AFFORDABILITY_CALCULATOR_ID,
    status: 'completed',
    computedAt: new Date().toISOString(),
    durationMs: Date.now() - startedAt,
    scenarios,
    ...(comparisonUnavailableReason && { comparisonUnavailableReason }),
  };
}

export function compactHomeAffordabilityScenarioExecution(
  execution: HomeAffordabilityScenarioExecution
): HomeAffordabilityScenarioEvidence {
  return execution;
}

function factId(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 80);
}

/**
 * Operating expenses exclude transfers and investment trades, so a retirement
 * contribution funded from take-home cash has to be added back as an explicit
 * claim on surplus. Payroll deductions are already reflected in net deposits
 * and must never enter this override.
 */
const RETIREMENT_CONTRIBUTION_CAVEAT =
  'This subtracts the stated take-home-funded retirement contribution once because transfers and investment trades are excluded from operating expenses. '
  + 'Payroll-deducted contributions are already reflected in connected net deposits and must not be entered here.';
const RETIREMENT_BASELINE_NOTICE =
  'Payroll-deducted retirement contributions remain reflected in connected net deposits. '
  + 'A separate take-home-funded retirement contribution is tested only when the user supplies it explicitly.';

function joinCaveats(...parts: Array<string | undefined>): string | undefined {
  const kept = parts.filter((part): part is string => Boolean(part));
  return kept.length > 0 ? kept.join(' ') : undefined;
}

function lowerBoundCaveat(scenario: HomeAffordabilityScenarioResult): string | undefined {
  if (scenario.costCoverage !== 'lower_bound') return undefined;
  const missing = scenario.missingInputs.filter((item) =>
    ['property taxes', 'homeowners insurance', 'mortgage insurance'].includes(item)
  );
  return `This is a lower-bound ownership cost because ${missing.join(', ')} ${
    missing.length === 1 ? 'was' : 'were'
  } not supplied. State that limitation whenever you state this number.`;
}

/** Convert home-affordability inputs and outputs into canonical scenario evidence. */
export function homeAffordabilityScenarioCanonicalFacts(
  execution: HomeAffordabilityScenarioExecution
): CanonicalFact[] {
  if (execution.status !== 'completed') return [];
  const facts: CanonicalFact[] = [];

  const addInput = (
    id: string,
    label: string,
    value: number,
    unit: CanonicalFactUnit,
    scenarioId: string,
    displayable = true
  ) => facts.push({
    id,
    label,
    value,
    unit,
    ...(!displayable && { displayable: false }),
    provenance: {
      kind: 'scenario_input',
      source: `homeAffordabilityScenario.${scenarioId}.assumptions`,
      scenarioId,
      calculatorId: HOME_AFFORDABILITY_CALCULATOR_ID,
      calculatorVersion: execution.version,
    },
  });

  const addCalculation = (
    id: string,
    label: string,
    value: number | undefined,
    unit: CanonicalFactUnit,
    scenarioId: string,
    formula: string,
    inputFactIds: string[],
    caveat?: string,
    displayable = true
  ) => {
    if (value === undefined || !Number.isFinite(value)) return;
    facts.push({
      id,
      label,
      value,
      unit,
      ...(!displayable && { displayable: false }),
      ...(caveat && { caveat }),
      provenance: {
        kind: 'scenario_calculation',
        source: `homeAffordabilityScenario.${scenarioId}`,
        formula,
        inputFactIds,
        scenarioId,
        calculatorId: HOME_AFFORDABILITY_CALCULATOR_ID,
        calculatorVersion: execution.version,
      },
    });
  };

  for (const scenario of execution.scenarios) {
    const prefix = `home_affordability_scenario_${factId(scenario.id)}`;
    const assumptionIds = new Map<string, string>();
    for (const assumption of scenario.assumptions) {
      const id = `${prefix}_assumption_${factId(assumption.key)}`;
      assumptionIds.set(assumption.key, id);
      const excludedInput =
        (assumption.key === 'property_tax_annual' && scenario.missingInputs.includes('property taxes')) ||
        (assumption.key === 'homeowners_insurance_annual' && scenario.missingInputs.includes('homeowners insurance')) ||
        (assumption.key === 'mortgage_insurance_monthly' && scenario.missingInputs.includes('mortgage insurance')) ||
        (scenario.metrics.loanAmount === 0 &&
          ['mortgage_rate_percent', 'loan_term_years'].includes(assumption.key));
      addInput(
        id,
        `${scenario.label} ${assumption.label.toLowerCase()}`,
        assumption.value,
        assumption.unit,
        scenario.id,
        !excludedInput
      );
    }

    const homePriceId = assumptionIds.get('home_price')!;
    let downPaymentId = assumptionIds.get('down_payment_amount');
    if (!downPaymentId) {
      downPaymentId = `${prefix}_down_payment`;
      addCalculation(
        downPaymentId,
        `${scenario.label} down payment`,
        scenario.metrics.downPaymentAmount,
        'usd',
        scenario.id,
        'input[0] * input[1] / 100',
        [homePriceId, assumptionIds.get('down_payment_percent')!]
      );
    } else {
      addCalculation(
        `${prefix}_down_payment_percent`,
        `${scenario.label} down payment rate`,
        scenario.metrics.downPaymentPercent,
        'percent',
        scenario.id,
        'input[0] / input[1] * 100',
        [downPaymentId, homePriceId]
      );
    }
    const loanAmountId = `${prefix}_loan_amount`;
    addCalculation(
      loanAmountId,
      `${scenario.label} mortgage principal`,
      scenario.metrics.loanAmount,
      'usd',
      scenario.id,
      'input[0] - input[1]',
      [homePriceId, downPaymentId]
    );

    const principalInterestId = `${prefix}_principal_and_interest_monthly`;
    addCalculation(
      principalInterestId,
      `${scenario.label} monthly principal and interest`,
      scenario.metrics.principalAndInterestMonthly,
      'usd',
      scenario.id,
      'amortized_payment(input[0], input[1], input[2])',
      [
        loanAmountId,
        assumptionIds.get('mortgage_rate_percent')!,
        assumptionIds.get('loan_term_years')!,
      ]
    );

    const propertyTaxMonthlyId = `${prefix}_property_tax_monthly`;
    addCalculation(
      propertyTaxMonthlyId,
      `${scenario.label} monthly property taxes included`,
      scenario.metrics.propertyTaxMonthly,
      'usd',
      scenario.id,
      'input / 12',
      [assumptionIds.get('property_tax_annual')!],
      undefined,
      !scenario.missingInputs.includes('property taxes')
    );
    const insuranceMonthlyId = `${prefix}_homeowners_insurance_monthly`;
    addCalculation(
      insuranceMonthlyId,
      `${scenario.label} monthly homeowners insurance included`,
      scenario.metrics.homeownersInsuranceMonthly,
      'usd',
      scenario.id,
      'input / 12',
      [assumptionIds.get('homeowners_insurance_annual')!],
      undefined,
      !scenario.missingInputs.includes('homeowners insurance')
    );
    const maintenanceMonthlyId = `${prefix}_maintenance_monthly`;
    addCalculation(maintenanceMonthlyId, `${scenario.label} monthly maintenance reserve`, scenario.metrics.maintenanceMonthly, 'usd', scenario.id, 'input / 12', [assumptionIds.get('maintenance_annual')!]);

    const recurringCaveat = lowerBoundCaveat(scenario);
    const allInId = `${prefix}_all_in_monthly_housing_cost`;
    addCalculation(
      allInId,
      `${scenario.label} all-in monthly ownership cost`,
      scenario.metrics.allInHousingMonthly,
      'usd',
      scenario.id,
      'sum(inputs)',
      [
        principalInterestId,
        propertyTaxMonthlyId,
        insuranceMonthlyId,
        assumptionIds.get('hoa_monthly')!,
        assumptionIds.get('mortgage_insurance_monthly')!,
        maintenanceMonthlyId,
      ],
      recurringCaveat
    );

    let closingCostId = assumptionIds.get('closing_costs_amount');
    if (!closingCostId) {
      closingCostId = `${prefix}_closing_costs`;
      addCalculation(
        closingCostId,
        `${scenario.label} closing costs`,
        scenario.metrics.closingCosts,
        'usd',
        scenario.id,
        'input[0] * input[1] / 100',
        [homePriceId, assumptionIds.get('closing_cost_percent')!]
      );
    }
    const upfrontId = `${prefix}_upfront_cash_needed`;
    addCalculation(
      upfrontId,
      `${scenario.label} upfront cash needed`,
      scenario.metrics.upfrontCashNeeded,
      'usd',
      scenario.id,
      'sum(inputs)',
      [downPaymentId, closingCostId, assumptionIds.get('moving_and_initial_costs')!]
    );

    const availableCashId = assumptionIds.get('available_cash');
    const cashRemainingId = `${prefix}_cash_remaining`;
    if (availableCashId) {
      addCalculation(
        cashRemainingId,
        `${scenario.label} cash remaining after upfront costs`,
        scenario.metrics.cashRemaining,
        'usd',
        scenario.id,
        'input[0] - input[1]',
        [availableCashId, upfrontId]
      );
    }

    const currentHousingId = assumptionIds.get('current_housing_cost_monthly');
    const averageExpensesId = assumptionIds.get('average_monthly_expenses');
    const averageIncomeId = assumptionIds.get('average_monthly_income');
    const monthlyHousingChangeId = `${prefix}_monthly_housing_change`;
    if (currentHousingId) {
      addCalculation(
        monthlyHousingChangeId,
        `${scenario.label} monthly housing-cost change`,
        scenario.metrics.monthlyHousingChange,
        'usd',
        scenario.id,
        'input[0] - input[1]',
        [allInId, currentHousingId],
        recurringCaveat
      );
    }

    const postPurchaseExpensesId = `${prefix}_post_purchase_monthly_expenses`;
    if (averageExpensesId && currentHousingId) {
      addCalculation(
        postPurchaseExpensesId,
        `${scenario.label} post-purchase monthly expenses`,
        scenario.metrics.postPurchaseMonthlyExpenses,
        'usd',
        scenario.id,
        'input[0] - input[1] + input[2]',
        [averageExpensesId, currentHousingId, allInId],
        recurringCaveat
      );
    }

    const postPurchaseSurplusId = `${prefix}_post_purchase_monthly_surplus`;
    if (averageIncomeId && scenario.metrics.postPurchaseMonthlyExpenses !== undefined) {
      addCalculation(
        postPurchaseSurplusId,
        `${scenario.label} post-purchase monthly operating surplus`,
        scenario.metrics.postPurchaseMonthlySurplus,
        'usd',
        scenario.id,
        'input[0] - input[1]',
        [averageIncomeId, postPurchaseExpensesId],
        recurringCaveat
      );
    }

    const retirementContributionId = assumptionIds.get('retirement_contribution_monthly');
    if (retirementContributionId && scenario.metrics.surplusAfterRetirementContribution !== undefined) {
      addCalculation(
        `${prefix}_surplus_after_retirement_contribution`,
        `${scenario.label} monthly surplus after preserving the stated take-home-funded retirement contribution`,
        scenario.metrics.surplusAfterRetirementContribution,
        'usd',
        scenario.id,
        'input[0] - input[1]',
        [postPurchaseSurplusId, retirementContributionId],
        joinCaveats(recurringCaveat, RETIREMENT_CONTRIBUTION_CAVEAT)
      );
    }

    const reserveExpenseId = scenario.metrics.reserveBasis === 'post_purchase'
      ? postPurchaseExpensesId
      : averageExpensesId;
    const reserveBasisCaveat = scenario.metrics.reserveBasis === 'current_spending'
      ? 'This runway uses current average spending because the current housing cost being replaced was not supplied; it is not a post-purchase expense estimate.'
      : recurringCaveat;
    const reserveTargetId = `${prefix}_reserve_target`;
    if (reserveExpenseId) {
      addCalculation(
        reserveTargetId,
        `${scenario.label} emergency-fund target`,
        scenario.metrics.reserveTarget,
        'usd',
        scenario.id,
        'input[0] * input[1]',
        [reserveExpenseId, assumptionIds.get('emergency_fund_months')!],
        reserveBasisCaveat
      );
    }
    if (availableCashId && reserveExpenseId && scenario.metrics.cashRemaining !== undefined) {
      addCalculation(
        `${prefix}_reserve_months`,
        `${scenario.label} cash runway after upfront costs`,
        scenario.metrics.reserveMonths,
        'months',
        scenario.id,
        'input[0] / input[1]',
        [cashRemainingId, reserveExpenseId],
        reserveBasisCaveat
      );
      addCalculation(
        `${prefix}_reserve_gap`,
        `${scenario.label} cash remaining above or below the emergency-fund target`,
        scenario.metrics.reserveGap,
        'usd',
        scenario.id,
        'input[0] - input[1]',
        [cashRemainingId, reserveTargetId],
        reserveBasisCaveat
      );
    }
  }

  if (execution.scenarios.length >= 2) {
    const [primary, comparison] = execution.scenarios;
    const primaryPrefix = `home_affordability_scenario_${factId(primary.id)}`;
    const comparisonPrefix = `home_affordability_scenario_${factId(comparison.id)}`;
    const comparisonId = `${primary.id}_vs_${comparison.id}`;
    addCalculation(
      `home_affordability_comparison_${factId(comparisonId)}_monthly_cost_gap`,
      `Absolute monthly ownership-cost gap between ${primary.label} and ${comparison.label}`,
      roundMoney(Math.abs(primary.metrics.allInHousingMonthly - comparison.metrics.allInHousingMonthly)),
      'usd',
      comparisonId,
      'abs(input[0] - input[1])',
      [
        `${primaryPrefix}_all_in_monthly_housing_cost`,
        `${comparisonPrefix}_all_in_monthly_housing_cost`,
      ],
      lowerBoundCaveat(primary) ?? lowerBoundCaveat(comparison)
    );
    addCalculation(
      `home_affordability_comparison_${factId(comparisonId)}_upfront_cash_gap`,
      `Absolute upfront-cash gap between ${primary.label} and ${comparison.label}`,
      roundMoney(Math.abs(primary.metrics.upfrontCashNeeded - comparison.metrics.upfrontCashNeeded)),
      'usd',
      comparisonId,
      'abs(input[0] - input[1])',
      [
        `${primaryPrefix}_upfront_cash_needed`,
        `${comparisonPrefix}_upfront_cash_needed`,
      ]
    );
  }
  return facts;
}

const BINDING_CONSTRAINT_LABELS: Record<HomeAffordabilityBindingConstraint, string> = {
  upfront_cash: 'upfront cash',
  monthly_cash_flow: 'monthly cash flow',
  retirement_contribution: 'the take-home-funded retirement contribution being preserved',
  reserve_floor: 'the emergency-fund floor',
  none: 'no modeled constraint',
};

/** Name the constraints a cleared scenario actually tested, never a fixed list. */
function clearedConstraintLabels(scenario: HomeAffordabilityScenarioResult): string[] {
  return BINDING_CONSTRAINT_PRIORITY
    .filter(([key]) => scenario.constraints[key] === true)
    .map(([, constraint]) => BINDING_CONSTRAINT_LABELS[constraint]);
}

/** Deterministic disclosure appended to every home-affordability result. */
export function describeHomeAffordabilityScenarioExecution(
  execution: HomeAffordabilityScenarioExecution
): string | null {
  if (execution.status === 'unavailable') {
    return `I could not run the requested home-affordability scenario: ${execution.reason}`;
  }
  if (execution.scenarios.length === 0) return null;
  const lowerBoundMissing = Array.from(new Set(execution.scenarios.flatMap((scenario) =>
    scenario.costCoverage === 'lower_bound'
      ? scenario.missingInputs.filter((item) =>
          ['property taxes', 'homeowners insurance', 'mortgage insurance'].includes(item)
        )
      : []
  )));
  const lowerBoundNotice = lowerBoundMissing.length > 0
    ? ` The monthly ownership result is a lower bound because ${lowerBoundMissing.join(', ')} ${
        lowerBoundMissing.length === 1 ? 'was' : 'were'
      } not supplied.`
    : '';
  const incompleteNotice = execution.scenarios.some((scenario) => scenario.assessment === 'incomplete')
    ? ' I did not label the purchase affordable or unaffordable because one or more cash-flow inputs are missing.'
    : '';
  const bindingNotices = execution.scenarios
    .filter((scenario) => scenario.bindingConstraint && scenario.bindingConstraint !== 'none')
    .map((scenario) => `${scenario.label} is limited by ${
      BINDING_CONSTRAINT_LABELS[scenario.bindingConstraint!]
    }`);
  const clearedScenario = execution.scenarios.find(
    (scenario) => scenario.bindingConstraint === 'none'
  );
  const bindingNotice = bindingNotices.length > 0
    ? ` Binding constraint: ${bindingNotices.join('; ')}.`
    : clearedScenario
      ? ` No modeled constraint binds: ${clearedConstraintLabels(clearedScenario).join(', ')} all clear.`
      : '';
  const retirementNotice = execution.scenarios.some(
    (scenario) => scenario.metrics.surplusAfterRetirementContribution !== undefined
  )
    ? ` ${RETIREMENT_CONTRIBUTION_CAVEAT}`
    : ` ${RETIREMENT_BASELINE_NOTICE}`;
  const comparisonNotice = execution.comparisonUnavailableReason
    ? ` I could not run the requested comparison case: ${execution.comparisonUnavailableReason}`
    : '';
  const loanDefault = execution.scenarios.some((scenario) => scenario.metrics.loanAmount > 0)
    ? `a ${DEFAULT_LOAN_TERM_YEARS}-year loan, `
    : '';
  return `Home-affordability assumptions: ${execution.scenarios.map((scenario) => scenario.label).join(' compared with ')}. Defaults are ${loanDefault}${DEFAULT_CLOSING_COST_PERCENT}% closing costs, ${DEFAULT_MAINTENANCE_PERCENT}% annual maintenance, and a ${DEFAULT_EMERGENCY_FUND_MONTHS}-month emergency-fund target when the user did not supply those values.${lowerBoundNotice}${incompleteNotice}${bindingNotice}${retirementNotice}${comparisonNotice} This evaluates household cash flow, not mortgage qualification or loan approval. Change any assumption and I will re-run it.`;
}

export const homeAffordabilityScenarioCalculator: ScenarioCalculatorDefinition<
  HomeAffordabilityScenarioPlan,
  HomeAffordabilityScenarioExecution,
  HomeAffordabilityScenarioEvidence
> = {
  id: HOME_AFFORDABILITY_CALCULATOR_ID,
  version: HOME_AFFORDABILITY_SCENARIO_VERSION,
  label: 'Home affordability scenarios',
  description: 'Compare a target home against upfront cash, total monthly ownership cost, operating cash flow, and an emergency-fund floor.',
  requiredPacks: ['market_context'],
  supportedOverrides: [
    { id: 'home_price', label: 'Target home price', description: 'Purchase price of the target home.', valueType: 'currency', minimum: 10_000, maximum: 100_000_000 },
    { id: 'down_payment_amount', label: 'Down payment amount', description: 'Cash down payment; takes precedence over a percentage in the same variant.', valueType: 'currency', minimum: 0, maximum: 100_000_000 },
    { id: 'down_payment_percent', label: 'Down payment percentage', description: 'Down payment as a percentage of home price.', valueType: 'percentage', minimum: 0, maximum: 100 },
    { id: 'available_cash_amount', label: 'Available purchase cash', description: 'Cash available before purchase when it differs from connected cash balances.', valueType: 'currency', minimum: 0, maximum: 100_000_000 },
    { id: 'mortgage_rate_percent', label: 'Mortgage rate', description: 'Annual mortgage rate expressed as percentage points; 6.5% is 6.5.', valueType: 'percentage', minimum: 0, maximum: 30 },
    { id: 'loan_term_years', label: 'Loan term', description: 'Fully amortizing loan term in years.', valueType: 'years', minimum: 1, maximum: 50 },
    { id: 'closing_costs_amount', label: 'Closing costs', description: 'Estimated closing costs as a dollar amount.', valueType: 'currency', minimum: 0, maximum: 20_000_000 },
    { id: 'closing_cost_percent', label: 'Closing-cost rate', description: 'Estimated closing costs as a percentage of home price.', valueType: 'percentage', minimum: 0, maximum: 20 },
    { id: 'property_tax_annual', label: 'Annual property taxes', description: 'Annual property taxes for the target property.', valueType: 'currency', minimum: 0, maximum: 10_000_000 },
    { id: 'homeowners_insurance_annual', label: 'Annual homeowners insurance', description: 'Annual homeowners and required supplementary insurance.', valueType: 'currency', minimum: 0, maximum: 10_000_000 },
    { id: 'hoa_monthly', label: 'Monthly HOA dues', description: 'Monthly HOA or condo-association dues.', valueType: 'currency', minimum: 0, maximum: 100_000 },
    { id: 'mortgage_insurance_monthly', label: 'Monthly mortgage insurance', description: 'Monthly PMI or other mortgage-insurance cost.', valueType: 'currency', minimum: 0, maximum: 100_000 },
    { id: 'maintenance_annual', label: 'Annual maintenance reserve', description: 'Annual reserve for maintenance and repairs.', valueType: 'currency', minimum: 0, maximum: 10_000_000 },
    { id: 'moving_and_initial_costs', label: 'Moving and initial costs', description: 'Moving, furnishing, and immediate repair costs paid at purchase.', valueType: 'currency', minimum: 0, maximum: 20_000_000 },
    { id: 'current_housing_cost_monthly', label: 'Current monthly housing cost', description: 'Current rent or ownership cost that the purchase replaces.', valueType: 'currency', minimum: 0, maximum: 1_000_000 },
    { id: 'retirement_contribution_monthly', label: 'Monthly take-home-funded retirement contribution to preserve', description: 'Monthly IRA or other retirement contribution funded from take-home cash and excluded from the operating-expense baseline.', valueType: 'currency', minimum: 0, maximum: 1_000_000 },
    { id: 'emergency_fund_months', label: 'Emergency-fund target', description: 'Months of post-purchase expenses to retain in cash.', valueType: 'months', minimum: 0, maximum: 60 },
  ],
  defaults: [
    { id: 'down_payment_percent', value: DEFAULT_DOWN_PAYMENT_PERCENT, description: 'Used when no down payment is supplied.' },
    { id: 'loan_term_years', value: DEFAULT_LOAN_TERM_YEARS, description: 'Used when no loan term is supplied.' },
    { id: 'closing_cost_percent', value: DEFAULT_CLOSING_COST_PERCENT, description: 'Planning estimate used when closing costs are not supplied.' },
    { id: 'maintenance_percent', value: DEFAULT_MAINTENANCE_PERCENT, description: 'Annual maintenance reserve as a percentage of home price when no reserve is supplied.' },
    { id: 'emergency_fund_months', value: DEFAULT_EMERGENCY_FUND_MONTHS, description: 'Planning floor used when the user supplies no emergency-fund target.' },
    { id: 'hoa_monthly', value: 0, description: 'Assumes no HOA dues unless supplied.' },
    { id: 'moving_and_initial_costs', value: 0, description: 'Excludes moving and immediate repair costs unless supplied.' },
  ],
  outputs: [
    { id: 'loan_amount', label: 'Mortgage principal', unit: 'usd', scope: 'variant', description: 'Home price less down payment.' },
    { id: 'principal_and_interest_monthly', label: 'Monthly principal and interest', unit: 'usd', scope: 'variant', description: 'Fully amortizing monthly mortgage payment.' },
    { id: 'all_in_housing_monthly', label: 'All-in monthly ownership cost', unit: 'usd', scope: 'variant', description: 'Principal, interest, taxes, insurance, HOA, mortgage insurance, and maintenance included by the assumptions.' },
    { id: 'upfront_cash_needed', label: 'Upfront cash needed', unit: 'usd', scope: 'variant', description: 'Down payment, closing costs, moving costs, and immediate repair costs.' },
    { id: 'cash_remaining', label: 'Cash remaining after purchase', unit: 'usd', scope: 'variant', description: 'Available purchase cash less upfront cash needed.' },
    { id: 'monthly_housing_change', label: 'Monthly housing-cost change', unit: 'usd', scope: 'variant', description: 'New all-in ownership cost less current housing cost.' },
    { id: 'post_purchase_monthly_surplus', label: 'Post-purchase monthly operating surplus', unit: 'usd', scope: 'variant', description: 'Average connected-account income less modeled post-purchase expenses.' },
    { id: 'reserve_months', label: 'Cash runway after purchase', unit: 'months', scope: 'variant', description: 'Cash remaining divided by post-purchase expenses, or current spending when replacement housing cost is missing.' },
    { id: 'reserve_gap', label: 'Emergency-fund gap', unit: 'usd', scope: 'variant', description: 'Cash remaining above or below the selected emergency-fund target.' },
    { id: 'surplus_after_retirement_contribution', label: 'Monthly surplus after preserving take-home retirement contributions', unit: 'usd', scope: 'variant', description: 'Post-purchase operating surplus less the stated take-home-funded retirement contribution excluded from operating expenses.' },
    { id: 'monthly_cost_gap', label: 'Monthly cost gap', unit: 'usd', scope: 'comparison', description: 'Absolute monthly ownership-cost difference between two variants.' },
    { id: 'upfront_cash_gap', label: 'Upfront cash gap', unit: 'usd', scope: 'comparison', description: 'Absolute upfront-cash difference between two variants.' },
  ],
  planner: {
    jsonSchema: HOME_AFFORDABILITY_SCENARIO_PLAN_JSON_SCHEMA,
    instructions: `When the user asks whether a specific home purchase works, or asks to compare two home-price, down-payment, rate, term, or ownership-cost cases, set requested=true. Extract only numbers the user actually stated and put the matching short wording in overrides.sources. Percentage fields use percentage points: 6.5% is 6.5, not 0.065. The primary variant holds the first case. The comparison variant contains only values that differ from the primary; it inherits all other primary values. The application may use connected total cash, average income and expenses, the current FRED 30-year mortgage benchmark, and disclosed planning defaults for absent values. Do not infer property tax, insurance, HOA, PMI, current housing cost, available cash, or the retirement contribution from prose that does not state them. Set retirementContributionMonthly only when the user states a retirement contribution funded from take-home cash, such as a checking-to-IRA transfer, that they want to preserve; transfers and investment trades are excluded from operating expenses, so this value is subtracted once. Do not set it for payroll-deducted 401(k), 403(b), or similar contributions because connected deposits are already net of those deductions. Convert a stated per-paycheck or annual take-home-funded amount only when the user also states the frequency. The overrides object and every field and source are always present; use null for every absent value and source. When no target-home scenario is requested, set requested=false and return null for every override and source in both variants. This calculator evaluates household cash flow, not lender qualification, and does not calculate a maximum qualifying loan.`,
    parsePlan: parseHomeAffordabilityScenarioPlan,
  },
  execution: {
    progressMessage: 'Running the home affordability scenarios',
    failureMessage: 'The requested home affordability scenario could not be calculated.',
  },
  execute: runHomeAffordabilityScenario,
  unavailable,
  compactEvidence: compactHomeAffordabilityScenarioExecution,
  canonicalFacts: homeAffordabilityScenarioCanonicalFacts,
  describeAssumptions: describeHomeAffordabilityScenarioExecution,
};
