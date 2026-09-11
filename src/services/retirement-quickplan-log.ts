/**
 * Recording runs of the public retirement calculator, for pattern analysis.
 *
 * Two rules govern everything here.
 *
 * The calculator must not depend on this. It is an unauthenticated marketing
 * page whose whole promise is an immediate answer, and an analytics table
 * being slow, full, or missing is not a reason to fail a visitor. So every
 * write is fired after the response and its failures are swallowed, loudly
 * enough for logs and no louder.
 *
 * Rejections are recorded as well as answers. A row per successful run would
 * describe only the visitors the calculator already served; the runs it
 * refused are what prompted the logging in the first place.
 */

import type { QuickPlanValidationError } from './retirement-quickplan';
import type { RetirementQuickPlanResult } from './retirement-quickplan';

/** Only what the six boxes contained, so a blank stays distinguishable from a zero. */
export interface SubmittedQuickPlan {
  currentAge: number | null;
  retirementAge: number | null;
  investableAssets: number | null;
  annualSpending: number | null;
  annualContributions: number | null;
  socialSecurityAnnual: number | null;
  socialSecurityStartAge: number | null;
  allocation: string | null;
}

/**
 * Read the raw request body back, without validating it.
 *
 * The stored row has to say what the visitor actually typed, including on a
 * rejection, so this cannot reuse the normalizer: by the time that has run,
 * a rejected value has thrown and an assumed one is indistinguishable from an
 * entered one.
 */
export function readSubmittedPlan(raw: unknown): SubmittedQuickPlan {
  const body = (raw && typeof raw === 'object' && !Array.isArray(raw))
    ? raw as Record<string, unknown>
    : {};

  const numeric = (value: unknown): number | null => {
    if (value === undefined || value === null || value === '') return null;
    const parsed = typeof value === 'string' ? Number(value.replace(/[$,\s]/g, '')) : value;
    return typeof parsed === 'number' && Number.isFinite(parsed) ? parsed : null;
  };

  return {
    currentAge: numeric(body.currentAge),
    retirementAge: numeric(body.retirementAge),
    investableAssets: numeric(body.investableAssets),
    annualSpending: numeric(body.annualSpending),
    annualContributions: numeric(body.annualContributions),
    socialSecurityAnnual: numeric(body.socialSecurityAnnual),
    socialSecurityStartAge: numeric(body.socialSecurityStartAge),
    allocation: typeof body.allocation === 'string' ? body.allocation : null,
  };
}

/**
 * Integers the column expects. A visitor can type an age the model rejects,
 * and that row still has to be storable — the rejection is the interesting part.
 */
function wholeOrNull(value: number | null): number | null {
  return value === null || !Number.isInteger(value) ? null : value;
}

async function write(data: Record<string, unknown>): Promise<void> {
  try {
    const { getPrismaClient } = await import('../prisma-client');
    await getPrismaClient().retirementQuickPlanRun.create({ data: data as never });
  } catch (error) {
    // Never surfaced to the visitor, and never retried: a lost analytics row
    // costs a data point, and anything louder would trade the page's
    // reliability for it.
    console.error('⚠️  Could not record retirement quick plan run:', error);
  }
}

/** Record a run the model answered, in either mode. */
export function recordQuickPlanRun(
  submitted: SubmittedQuickPlan,
  result: RetirementQuickPlanResult
): Promise<void> {
  return write({
    outcome: result.mode,
    assumedFields: result.assumed.map((entry) => entry.field),
    missingFields: result.missing,
    currentAge: wholeOrNull(submitted.currentAge),
    retirementAge: wholeOrNull(submitted.retirementAge),
    investableAssets: submitted.investableAssets,
    annualSpending: submitted.annualSpending,
    annualContributions: submitted.annualContributions,
    socialSecurityAnnual: submitted.socialSecurityAnnual,
    socialSecurityStartAge: wholeOrNull(submitted.socialSecurityStartAge),
    allocation: submitted.allocation,
    survivalRate: result.primary?.survivalRate ?? null,
    projectedPortfolioAtRetiremt: result.primary?.projectedPortfolioAtRetirement ?? null,
    firstYearWithdrawalRate: result.primary?.firstYearWithdrawalRate ?? null,
    sustainableRateP10: result.sustainableSpendingRates.p10,
    sustainableRateP50: result.sustainableSpendingRates.p50,
    sequencesTested: result.history.sequencesTested,
    durationMs: result.durationMs,
    cached: result.cached,
  });
}

/** Record a submission the model refused, and which figure it refused. */
export function recordQuickPlanRejection(
  submitted: SubmittedQuickPlan,
  error: QuickPlanValidationError
): Promise<void> {
  return write({
    outcome: 'rejected',
    rejectedField: error.field,
    assumedFields: [],
    missingFields: [],
    currentAge: wholeOrNull(submitted.currentAge),
    retirementAge: wholeOrNull(submitted.retirementAge),
    investableAssets: submitted.investableAssets,
    annualSpending: submitted.annualSpending,
    annualContributions: submitted.annualContributions,
    socialSecurityAnnual: submitted.socialSecurityAnnual,
    socialSecurityStartAge: wholeOrNull(submitted.socialSecurityStartAge),
    allocation: submitted.allocation,
    cached: false,
  });
}
