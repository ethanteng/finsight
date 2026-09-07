/**
 * Quick retirement plan for the unauthenticated landing page.
 *
 * This runs the same deterministic engine the authenticated product runs
 * (`src/retirement-analytics`) against a portfolio the visitor never gave us.
 * Six numbers and an allocation preset are not a portfolio, so everything this
 * module invents is invented in one place, is named in the response, and is
 * shown to the visitor:
 *
 *  - The asset mix is a preset, not their holdings.
 *  - Fund fees, concentration, account types and taxes are unknown and are
 *    therefore not modeled at all rather than guessed at.
 *  - Social Security is modeled as a COLA-indexed income beginning at the age
 *    the visitor entered, which is what the engine's income offset does.
 *
 * The result is a floor-quality answer with its own limits attached, which is
 * the point of the page: the engine is real, the inputs are estimates, and
 * connecting real accounts replaces the estimates.
 */

import {
  analyzeRetirementPortfolio,
  type RetirementAnalysisOutput,
} from '../retirement-analytics';
import type { Holding, Security } from './financial-data-service';

export const RETIREMENT_QUICKPLAN_VERSION = 1 as const;

/** Age at which the model stops. Beyond it nothing is claimed. */
export const DEFAULT_LIFE_EXPECTANCY = 95;
export const DEFAULT_SOCIAL_SECURITY_START_AGE = 67;

export type QuickPlanAllocationId = 'conservative' | 'balanced' | 'growth';

export interface QuickPlanAllocation {
  id: QuickPlanAllocationId;
  label: string;
  description: string;
  /** Fractions of the portfolio; the three sum to 1. */
  usEquity: number;
  bonds: number;
  cash: number;
}

/**
 * Three named mixes rather than a free-form slider: the visitor is picking a
 * shape, not reporting a fact, and a two-decimal input would imply a precision
 * the whole exercise does not have.
 *
 * All three are US stocks, US government bonds and cash, with no international
 * sleeve. That is a deliberate trade, not an oversight. The engine only builds
 * sequences over months where every series it needs exists, and this dataset's
 * international return series starts in 1975. A mix holding international
 * stocks can therefore only be tested against retirements beginning between
 * 1975 and the early 1980s -- the single most favourable stretch in the record,
 * which returns a near-100% survival rate for almost any plan. Dropping the
 * international sleeve buys back 1926 onward: the 1929 crash, the 1937 relapse,
 * and the 1966 and 1973 starts that define what a bad retirement looks like.
 * For a portfolio the visitor has not actually told us about, the longer and
 * harsher record is the more useful one.
 */
export const QUICKPLAN_ALLOCATIONS: Record<QuickPlanAllocationId, QuickPlanAllocation> = {
  conservative: {
    id: 'conservative',
    label: 'Conservative',
    description: '40% US stocks / 50% bonds / 10% cash',
    usEquity: 0.4,
    bonds: 0.5,
    cash: 0.1,
  },
  balanced: {
    id: 'balanced',
    label: 'Balanced',
    description: '60% US stocks / 35% bonds / 5% cash',
    usEquity: 0.6,
    bonds: 0.35,
    cash: 0.05,
  },
  growth: {
    id: 'growth',
    label: 'Growth',
    description: '80% US stocks / 18% bonds / 2% cash',
    usEquity: 0.8,
    bonds: 0.18,
    cash: 0.02,
  },
};

export const DEFAULT_ALLOCATION_ID: QuickPlanAllocationId = 'balanced';

export interface RetirementQuickPlanRequest {
  currentAge: number;
  retirementAge: number;
  /** Investable assets today. Home equity and other illiquid assets are out of scope. */
  investableAssets: number;
  /** Whole-household annual spending in retirement, in today's dollars. */
  annualSpending: number;
  /** Annual saving between now and retirement, in today's dollars. */
  annualContributions: number;
  /** Annual Social Security estimate in today's dollars. */
  socialSecurityAnnual: number;
  socialSecurityStartAge?: number;
  allocation?: QuickPlanAllocationId;
  lifeExpectancy?: number;
}

export interface QuickPlanScenario {
  id: string;
  label: string;
  /** What this scenario changed relative to what the visitor entered. */
  change: string | null;
  retirementAge: number;
  annualSpending: number;
  /** Share of tested historical sequences in which the money lasted, 0-1. */
  survivalRate: number;
  sequencesTested: number;
  sequencesSurvived: number;
  /** Median portfolio at retirement across sequences, in today's dollars. */
  projectedPortfolioAtRetirement: number;
  /** Spending the portfolio itself must cover in the first year of retirement. */
  firstYearPortfolioWithdrawal: number;
  /** firstYearPortfolioWithdrawal / projectedPortfolioAtRetirement. */
  firstYearWithdrawalRate: number;
  /**
   * Years from retirement until the portfolio was exhausted, among the
   * sequences where it was. Null when every tested sequence lasted.
   */
  depletionYears: { p10: number | null; p25: number | null; p50: number | null } | null;
  primaryObservation: string;
  characteristics: RetirementAnalysisOutput['summary']['characteristics'];
  tradeoffs: RetirementAnalysisOutput['summary']['tradeoffs'];
}

export interface RetirementQuickPlanResult {
  version: number;
  computedAt: string;
  durationMs: number;
  /** True when this exact set of inputs was already computed by this process. */
  cached: boolean;
  inputs: Required<Omit<RetirementQuickPlanRequest, 'allocation'>> & {
    allocation: QuickPlanAllocationId;
  };
  allocation: QuickPlanAllocation & { equityPercent: number };
  history: {
    firstMonth: string;
    lastMonth: string;
    /** Overlapping monthly start windows long enough to cover the whole plan. */
    sequencesTested: number;
    horizonYears: number;
    /**
     * The first and last calendar month a tested plan could begin in. Windows
     * overlap by one month, so the last start is the first plus one month per
     * additional sequence. Stated because it is the honest bound on the answer:
     * nothing outside this range was tested.
     */
    firstStartMonth: string;
    lastStartMonth: string;
  };
  primary: QuickPlanScenario;
  alternatives: QuickPlanScenario[];
  /**
   * Annual spending, in today's dollars at retirement, that this asset mix
   * sustained across the tested history. The solver is bounded to 2%-8% of the
   * starting portfolio, so `p90` at the bound means "at least this", not exactly it.
   */
  sustainableSpending: {
    p10: number;
    p25: number;
    p50: number;
    p75: number;
    p90: number;
    solverFloorRate: number;
    solverCeilingRate: number;
  };
  /** The engine's own methodology statements, passed through verbatim. */
  assumptions: string[];
  /** What this particular run could not know, because the visitor connected nothing. */
  limitations: string[];
}

export class QuickPlanValidationError extends Error {
  constructor(public readonly field: string, message: string) {
    super(message);
    this.name = 'QuickPlanValidationError';
  }
}

interface NumericRule {
  min: number;
  max: number;
  integer?: boolean;
  label: string;
}

const RULES: Record<string, NumericRule> = {
  currentAge: { min: 18, max: 90, integer: true, label: 'Current age' },
  retirementAge: { min: 30, max: 95, integer: true, label: 'Retirement age' },
  investableAssets: { min: 1_000, max: 100_000_000, label: 'Investment assets' },
  annualSpending: { min: 1_000, max: 10_000_000, label: 'Annual spending' },
  annualContributions: { min: 0, max: 5_000_000, label: 'Annual contributions' },
  socialSecurityAnnual: { min: 0, max: 250_000, label: 'Social Security estimate' },
  socialSecurityStartAge: { min: 50, max: 80, integer: true, label: 'Social Security start age' },
  lifeExpectancy: { min: 60, max: 110, integer: true, label: 'Life expectancy' },
};

function requireNumber(field: keyof typeof RULES, value: unknown): number {
  const rule = RULES[field];
  const parsed = typeof value === 'string' ? Number(value.replace(/[$,\s]/g, '')) : value;
  if (typeof parsed !== 'number' || !Number.isFinite(parsed)) {
    throw new QuickPlanValidationError(field, `${rule.label} must be a number.`);
  }
  if (rule.integer && !Number.isInteger(parsed)) {
    throw new QuickPlanValidationError(field, `${rule.label} must be a whole number.`);
  }
  if (parsed < rule.min || parsed > rule.max) {
    throw new QuickPlanValidationError(
      field,
      `${rule.label} must be between ${rule.min.toLocaleString('en-US')} and ${rule.max.toLocaleString('en-US')}.`
    );
  }
  return parsed;
}

export function normalizeQuickPlanRequest(raw: unknown): RetirementQuickPlanResult['inputs'] {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new QuickPlanValidationError('body', 'Expected a JSON object of plan inputs.');
  }
  const body = raw as Record<string, unknown>;

  const currentAge = requireNumber('currentAge', body.currentAge);
  const retirementAge = requireNumber('retirementAge', body.retirementAge);
  if (retirementAge < currentAge) {
    throw new QuickPlanValidationError(
      'retirementAge',
      'Retirement age cannot be earlier than your current age.'
    );
  }

  const lifeExpectancy = body.lifeExpectancy == null
    ? DEFAULT_LIFE_EXPECTANCY
    : requireNumber('lifeExpectancy', body.lifeExpectancy);
  if (lifeExpectancy <= retirementAge) {
    throw new QuickPlanValidationError(
      'lifeExpectancy',
      'The planning horizon must end after your retirement age.'
    );
  }

  const socialSecurityAnnual = requireNumber('socialSecurityAnnual', body.socialSecurityAnnual);
  const socialSecurityStartAge = body.socialSecurityStartAge == null
    ? DEFAULT_SOCIAL_SECURITY_START_AGE
    : requireNumber('socialSecurityStartAge', body.socialSecurityStartAge);

  const allocationId = body.allocation == null ? DEFAULT_ALLOCATION_ID : body.allocation;
  if (typeof allocationId !== 'string' || !(allocationId in QUICKPLAN_ALLOCATIONS)) {
    throw new QuickPlanValidationError(
      'allocation',
      `Allocation must be one of: ${Object.keys(QUICKPLAN_ALLOCATIONS).join(', ')}.`
    );
  }

  return {
    currentAge,
    retirementAge,
    investableAssets: requireNumber('investableAssets', body.investableAssets),
    annualSpending: requireNumber('annualSpending', body.annualSpending),
    annualContributions: requireNumber('annualContributions', body.annualContributions),
    socialSecurityAnnual,
    socialSecurityStartAge,
    lifeExpectancy,
    allocation: allocationId as QuickPlanAllocationId,
  };
}

/**
 * Build the four index sleeves the historical engine can actually simulate.
 *
 * Deliberately ticker-free. The classifier reads the declared type and the
 * name, so this resolves offline with no provider lookup, and no visitor of a
 * public page triggers a metadata fetch for a portfolio that does not exist.
 */
function buildSyntheticPortfolio(
  allocation: QuickPlanAllocation,
  investableAssets: number
): { holdings: Holding[]; securities: Security[] } {
  const sleeves: Array<{ id: string; name: string; type: string; weight: number }> = [
    { id: 'quickplan-us-equity', name: 'US Total Stock Market Index', type: 'equity', weight: allocation.usEquity },
    { id: 'quickplan-bonds', name: 'US Government Bond Index', type: 'fixed income', weight: allocation.bonds },
    { id: 'quickplan-cash', name: 'Cash and Cash Equivalents', type: 'cash', weight: allocation.cash },
  ].filter((sleeve) => sleeve.weight > 0);

  const holdings: Holding[] = sleeves.map((sleeve) => ({
    id: sleeve.id,
    account_id: 'quickplan',
    security_id: sleeve.id,
    institution_value: investableAssets * sleeve.weight,
    institution_price: null,
    institution_price_as_of: new Date().toISOString().slice(0, 10),
    cost_basis: null,
    quantity: null,
    iso_currency_code: 'USD',
    security_name: sleeve.name,
    security_type: sleeve.type,
  }));

  const securities: Security[] = sleeves.map((sleeve) => ({
    security_id: sleeve.id,
    name: sleeve.name,
    type: sleeve.type,
    iso_currency_code: 'USD',
  }));

  return { holdings, securities };
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** `1926-07` reads as a database column; `July 1926` reads as a date. */
function readableMonth(month: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) return month;
  return `${MONTH_NAMES[Number(match[2]) - 1]} ${match[1]}`;
}

/** Advance a `YYYY-MM` month string by `months`. */
function addMonths(month: string, months: number): string {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) return month;
  const ordinal = Number(match[1]) * 12 + (Number(match[2]) - 1) + months;
  const year = Math.floor(ordinal / 12);
  const monthIndex = ordinal - year * 12;
  return `${year}-${String(monthIndex + 1).padStart(2, '0')}`;
}

function survivedCount(survivalRate: number, totalSequences: number): number {
  return Math.round(survivalRate * totalSequences);
}

function toScenario(
  id: string,
  label: string,
  change: string | null,
  retirementAge: number,
  annualSpending: number,
  inputs: RetirementQuickPlanResult['inputs'],
  analysis: RetirementAnalysisOutput
): QuickPlanScenario {
  const projected = analysis.metrics.projectedPortfolioAtWithdrawalStart;
  // Social Security only offsets spending once it starts. When it starts after
  // this scenario's retirement age, the portfolio funds the whole of the first
  // year on its own -- which is exactly the stretch that sequence risk punishes.
  const socialSecurityHasStarted = inputs.socialSecurityStartAge <= retirementAge;
  const firstYearPortfolioWithdrawal = Math.max(
    0,
    annualSpending - (socialSecurityHasStarted ? inputs.socialSecurityAnnual : 0)
  );
  // The engine's maximum drawdown is deliberately not surfaced here. It measures
  // the portfolio's peak-to-trough path including withdrawals, so a sequence
  // that simply ran out of money reports a ~100% "drawdown". On a page that
  // has no room to explain that, the number would read as a market crash.
  const depletion = analysis.stressTest.depletionPercentiles;
  const anyDepletion =
    depletion.p10 != null || depletion.p25 != null || depletion.p50 != null;

  return {
    id,
    label,
    change,
    retirementAge,
    annualSpending,
    survivalRate: analysis.stressTest.survivalRate,
    sequencesTested: analysis.stressTest.totalSequences,
    sequencesSurvived: survivedCount(analysis.stressTest.survivalRate, analysis.stressTest.totalSequences),
    projectedPortfolioAtRetirement: projected,
    firstYearPortfolioWithdrawal,
    firstYearWithdrawalRate: projected > 0 ? firstYearPortfolioWithdrawal / projected : 0,
    depletionYears: anyDepletion
      ? { p10: depletion.p10, p25: depletion.p25, p50: depletion.p50 }
      : null,
    primaryObservation: analysis.summary.primaryObservation,
    characteristics: analysis.summary.characteristics,
    tradeoffs: analysis.summary.tradeoffs,
  };
}

function buildLimitations(
  inputs: RetirementQuickPlanResult['inputs'],
  allocation: QuickPlanAllocation,
  history: RetirementQuickPlanResult['history']
): string[] {
  const limitations = [
    `Every tested plan began in a month between ${readableMonth(history.firstStartMonth)} and ` +
      `${readableMonth(history.lastStartMonth)} — ` +
      `the ${history.sequencesTested} overlapping ${history.horizonYears}-year windows the record is long enough to cover. ` +
      'Overlapping windows share most of their history, so they are not independent trials.',
    'This mix holds no international stocks. The international return series in this dataset starts in 1975, and ' +
      'including it would have limited the test to retirements beginning in the strongest stretch of the record.',
    `Your asset mix is the "${allocation.label}" preset (${allocation.description}), not your actual holdings. ` +
      'Sequence risk depends heavily on the real mix.',
    'Fund fees are not modeled. A portfolio paying 0.75% a year keeps materially less than one paying 0.05%.',
    'Taxes, account types, required minimum distributions, and Roth conversions are not modeled.',
    'Health insurance before Medicare, one-off expenses, and changes in spending over retirement are not modeled — ' +
      'spending is held constant in real terms.',
    'Home equity, rental income, pensions other than the income you entered, and inheritances are not included.',
  ];
  const gapYears = inputs.socialSecurityStartAge - inputs.retirementAge;
  if (gapYears > 0) {
    limitations.push(
      `Social Security is modeled as starting at age ${inputs.socialSecurityStartAge}, so the portfolio funds ` +
        (gapYears === 1
          ? 'the whole year between retiring and claiming on its own.'
          : `all ${gapYears} years between retiring and claiming on its own.`)
    );
  }
  limitations.push(
    'Social Security is treated as a fixed, inflation-adjusted amount you actually receive; no benefit-formula ' +
      'or policy-change modeling is applied.'
  );
  return limitations;
}

/**
 * Run the visitor's plan plus a small set of variants.
 *
 * The variants are fixed, not chosen by a model: retiring later and spending
 * less are the two levers this set of six numbers can actually move, and
 * showing them side by side is the difference between a verdict and an answer.
 */
async function computeRetirementQuickPlan(
  inputs: RetirementQuickPlanResult['inputs']
): Promise<RetirementQuickPlanResult> {
  const startedAt = Date.now();
  const allocation = QUICKPLAN_ALLOCATIONS[inputs.allocation];
  const { holdings, securities } = buildSyntheticPortfolio(allocation, inputs.investableAssets);

  const analyze = (retirementAge: number, annualSpending: number) =>
    analyzeRetirementPortfolio({
      holdings,
      securities,
      currentAge: inputs.currentAge,
      retirementAge,
      withdrawalStartAge: retirementAge,
      lifeExpectancy: inputs.lifeExpectancy,
      annualWithdrawalAmount: annualSpending,
      annualContributionAmount: inputs.annualContributions,
      retirementIncome: inputs.socialSecurityAnnual > 0
        ? { annualAmount: inputs.socialSecurityAnnual, startAge: inputs.socialSecurityStartAge }
        : undefined,
    });

  const primaryAnalysis = await analyze(inputs.retirementAge, inputs.annualSpending);

  const variantPlans: Array<{
    id: string;
    label: string;
    change: string;
    retirementAge: number;
    annualSpending: number;
  }> = [];
  for (const years of [2, 5]) {
    const age = inputs.retirementAge + years;
    if (age < inputs.lifeExpectancy && age <= RULES.retirementAge.max) {
      variantPlans.push({
        id: `retire-at-${age}`,
        label: `Retire at ${age}`,
        change: `${years} more years of work and saving`,
        retirementAge: age,
        annualSpending: inputs.annualSpending,
      });
    }
  }
  const reducedSpending = Math.round(inputs.annualSpending * 0.9);
  if (reducedSpending >= RULES.annualSpending.min) {
    variantPlans.push({
      id: 'spend-10-less',
      label: 'Spend 10% less',
      change: `$${reducedSpending.toLocaleString('en-US')} a year instead of $${inputs.annualSpending.toLocaleString('en-US')}`,
      retirementAge: inputs.retirementAge,
      annualSpending: reducedSpending,
    });
  }

  // Sequentially, yielding between runs. Each run is a few hundred milliseconds
  // of straight CPU on the shared event loop; `Promise.all` would not run them
  // in parallel, it would only fuse them into one unbroken block that stalls
  // every other request behind it.
  const variantAnalyses: RetirementAnalysisOutput[] = [];
  for (const plan of variantPlans) {
    await new Promise<void>((resolve) => setImmediate(resolve));
    variantAnalyses.push(await analyze(plan.retirementAge, plan.annualSpending));
  }

  const primary = toScenario(
    'as-entered',
    `Retire at ${inputs.retirementAge}`,
    null,
    inputs.retirementAge,
    inputs.annualSpending,
    inputs,
    primaryAnalysis
  );
  const alternatives = variantPlans.map((plan, index) =>
    toScenario(plan.id, plan.label, plan.change, plan.retirementAge, plan.annualSpending, inputs, variantAnalyses[index])
  );

  // The solver's rates are per dollar of the portfolio at the moment
  // withdrawals begin, which is the same basis as the projected value, so both
  // stay in today's dollars.
  const rates = primaryAnalysis.metrics.historicalWithdrawalRates;
  const atRetirement = primary.projectedPortfolioAtRetirement;
  const sustainableSpending = {
    p10: rates.p10 * atRetirement,
    p25: rates.p25 * atRetirement,
    p50: rates.p50 * atRetirement,
    p75: rates.p75 * atRetirement,
    p90: rates.p90 * atRetirement,
    solverFloorRate: 0.02,
    solverCeilingRate: 0.08,
  };

  const firstMonth = primaryAnalysis.historicalData?.firstMonth ?? 'unknown';
  const history: RetirementQuickPlanResult['history'] = {
    firstMonth,
    lastMonth: primaryAnalysis.historicalData?.lastMonth ?? 'unknown',
    sequencesTested: primaryAnalysis.stressTest.totalSequences,
    horizonYears: inputs.lifeExpectancy - inputs.currentAge,
    firstStartMonth: firstMonth,
    // Start windows advance one month at a time, so the last one is the first
    // plus one month for every sequence after it.
    lastStartMonth: addMonths(firstMonth, Math.max(0, primaryAnalysis.stressTest.totalSequences - 1)),
  };

  return {
    version: RETIREMENT_QUICKPLAN_VERSION,
    computedAt: new Date().toISOString(),
    durationMs: Date.now() - startedAt,
    cached: false,
    inputs,
    allocation: {
      ...allocation,
      equityPercent: Math.round(allocation.usEquity * 100),
    },
    history,
    primary,
    alternatives,
    sustainableSpending,
    assumptions: primaryAnalysis.dataQuality.assumptions,
    limitations: buildLimitations(inputs, allocation, history),
  };
}

/**
 * Results are a pure function of the normalized inputs and a checked-in
 * dataset, so a repeat of the same six numbers can be served from memory
 * rather than re-run. Landing-page visitors reach for round numbers, and each
 * miss is roughly a second of CPU on the shared event loop.
 *
 * Bounded, insertion-ordered, and dropped wholesale on process restart, which
 * is also when a new dataset would ship.
 */
const MAX_CACHED_PLANS = 500;
const planCache = new Map<string, RetirementQuickPlanResult>();

export function clearQuickPlanCache(): void {
  planCache.clear();
}

export async function runRetirementQuickPlan(
  request: RetirementQuickPlanRequest | unknown
): Promise<RetirementQuickPlanResult> {
  const inputs = normalizeQuickPlanRequest(request);
  const key = JSON.stringify([
    RETIREMENT_QUICKPLAN_VERSION,
    inputs.currentAge,
    inputs.retirementAge,
    inputs.investableAssets,
    inputs.annualSpending,
    inputs.annualContributions,
    inputs.socialSecurityAnnual,
    inputs.socialSecurityStartAge,
    inputs.lifeExpectancy,
    inputs.allocation,
  ]);

  const hit = planCache.get(key);
  if (hit) return { ...hit, cached: true };

  const result = await computeRetirementQuickPlan(inputs);
  if (planCache.size >= MAX_CACHED_PLANS) {
    const oldest = planCache.keys().next();
    if (!oldest.done) planCache.delete(oldest.value);
  }
  planCache.set(key, result);
  return result;
}
