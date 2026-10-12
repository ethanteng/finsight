/**
 * Health premiums in a retirement plan: what coverage the household has
 * before Medicare, what it costs, and whether the plan's spending already
 * pays for it.
 *
 * The engine (`retirement-analytics/engine/healthcare.ts`) prices the
 * premiums each year -- marketplace premiums less the premium tax credit that
 * year's income earns, COBRA for 18 months, Medicare's Part B and D from 65.
 * This module resolves the inputs: what the user said in this decision, then
 * Your numbers, then named defaults, each disclosed. Unsaid, coverage before
 * 65 is the marketplace, where anyone can buy it, and the premiums are added
 * on top of the plan's spending; a user who says their spending already
 * includes healthcare gets no premium line at all, so nothing is counted
 * twice.
 */

import type { RetirementHealthcare } from '../retirement-analytics/types';
import { MEDICARE_AGE, type PreMedicareCoverage } from '../retirement-analytics/engine/healthcare';
import {
  PRE_MEDICARE_COVERAGE_CHOICES,
  savedChoice,
  savedNumber,
  type StatedFigures,
} from './stated-figures';

export { MEDICARE_AGE };
export type { PreMedicareCoverage };

/** What the user said about health coverage in this decision. */
export interface StatedHealthcare {
  coverage?: PreMedicareCoverage;
  /** A premium a year per person before 65, in today's dollars. */
  annualPremium?: number;
  /** Whether their spending figure already includes healthcare. */
  inSpending?: boolean;
}

type FigureOrigin = 'stated' | 'saved' | 'default';

export type HealthcareResolution =
  /** Spending already pays for coverage: no premium line. */
  | { kind: 'included'; origin: 'stated' | 'saved'; savedAt?: string }
  | {
    kind: 'counted';
    healthcare: RetirementHealthcare;
    /** Where the spending-includes-it answer came from; `default` means nobody said. */
    inSpendingOrigin: FigureOrigin;
    coverageOrigin: FigureOrigin;
    premiumOrigin?: 'stated' | 'saved';
    /** Whether anyone in the plan reaches withdrawals before 65, so coverage before Medicare matters. */
    preMedicareYears: boolean;
    savedAt?: string;
  };

function isCoverage(value: unknown): value is PreMedicareCoverage {
  return typeof value === 'string' && (PRE_MEDICARE_COVERAGE_CHOICES as readonly string[]).includes(value);
}

/**
 * The plan's premium line, or none when the user's spending already pays for
 * coverage. `preMedicareYears` is whether anyone in the plan starts
 * withdrawals before 65: otherwise only Medicare is counted, and nobody is
 * asked about coverage they will never need.
 */
export function resolveHealthcare(args: {
  stated?: StatedHealthcare;
  statedFigures?: StatedFigures;
  preMedicareYears: boolean;
}): HealthcareResolution {
  const savedInSpending = savedChoice(args.statedFigures, 'healthcareInSpending');
  if (args.stated?.inSpending === true) return { kind: 'included', origin: 'stated' };
  // Your numbers "included" only skips the premium line when this decision
  // did not name coverage or a premium — those statements outrank the save.
  if (
    args.stated?.inSpending === undefined &&
    savedInSpending?.value === 'included' &&
    !isCoverage(args.stated?.coverage) &&
    args.stated?.annualPremium === undefined
  ) {
    return { kind: 'included', origin: 'saved', savedAt: savedInSpending.savedAt };
  }
  // A saved "included" that was outranked is no longer a source: mark the
  // on-top treatment assumed so disclosure says so and the form asks again.
  const inSpendingOrigin: FigureOrigin = args.stated?.inSpending === false
    ? 'stated'
    : savedInSpending?.value === 'included'
      ? 'default'
      : savedInSpending ? 'saved' : 'default';

  const savedCoverage = savedChoice(args.statedFigures, 'preMedicareCoverage');
  const coverage: { value: PreMedicareCoverage; origin: FigureOrigin; savedAt?: string } = isCoverage(args.stated?.coverage)
    ? { value: args.stated!.coverage!, origin: 'stated' }
    : savedCoverage && isCoverage(savedCoverage.value)
      ? { value: savedCoverage.value, origin: 'saved', savedAt: savedCoverage.savedAt }
      : { value: 'marketplace', origin: 'default' };

  const statedPremium = args.stated?.annualPremium;
  const savedPremium = savedNumber(args.statedFigures, 'preMedicareAnnualPremium');
  const premium = statedPremium !== undefined && Number.isFinite(statedPremium) && statedPremium >= 0
    ? { value: statedPremium, origin: 'stated' as const }
    : savedPremium
      ? { value: savedPremium.value, origin: 'saved' as const, savedAt: savedPremium.savedAt }
      : undefined;

  const savedAt = [
    inSpendingOrigin === 'saved' ? savedInSpending?.savedAt : undefined,
    coverage.savedAt,
    premium && 'savedAt' in premium ? premium.savedAt : undefined,
  ].filter((date): date is string => Boolean(date)).sort().pop();

  return {
    kind: 'counted',
    healthcare: {
      coverage: coverage.value,
      // Kept even without years before 65 now: a what-if that retires
      // earlier inherits it.
      ...(premium && { annualPremium: premium.value }),
    },
    inSpendingOrigin,
    coverageOrigin: coverage.origin,
    ...(premium && { premiumOrigin: premium.origin }),
    preMedicareYears: args.preMedicareYears,
    ...(savedAt && { savedAt }),
  };
}

/** Whether anyone in the plan starts withdrawals before Medicare. */
export function hasPreMedicareYears(args: {
  currentAge: number;
  withdrawalStartAge: number;
  partnerAge?: number;
}): boolean {
  if (args.withdrawalStartAge < MEDICARE_AGE) return true;
  if (args.partnerAge === undefined) return false;
  // The partner's age when the user starts withdrawals.
  return args.partnerAge + (args.withdrawalStartAge - args.currentAge) < MEDICARE_AGE;
}
