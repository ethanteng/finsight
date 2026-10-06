export const COHORT_GRAINS = ['day', 'week', 'month'] as const;
export type CohortGrain = typeof COHORT_GRAINS[number];

/**
 * Three starts an account can have, each its own clock:
 * - `signup`: every new account, from account creation.
 * - `trial`: accounts that began a Stripe trial — automatic grant on no-card
 *   signup, "Convert to trial" in the admin panel, or a checkout card trial —
 *   from the trial's start. A no-card signup whose grant failed (or ran without
 *   Stripe configured) carries no trial state until converted by hand.
 * - `paid`: from the first successful charge above zero.
 * An account that goes through all three appears in each, from that start.
 */
export const COHORT_SEGMENTS = ['signup', 'trial', 'paid'] as const;
export type CohortSegment = typeof COHORT_SEGMENTS[number];

export const LINK_SOURCES = ['plaid', 'snaptrade', 'public'] as const;
export type LinkSource = typeof LINK_SOURCES[number];

export interface CohortWindow {
  segment: CohortSegment;
  cohortGrain: CohortGrain;
  periodGrain: CohortGrain;
  /** How many cohorts to show, ending with the one `now` falls in. */
  cohortCount: number;
  /** How many periods after each member's start to show as columns. */
  periodCount: number;
}

/** Engaged in a period means averaging at least `questions` per `per` across it. */
export interface EngagementRule {
  questions: number;
  per: CohortGrain;
}

export interface CohortMember {
  userId: string;
  email: string;
  /** Where this member's clock starts: the segment's own start. */
  startedAt: Date;
  signedUpAt: Date;
  trialStartedAt: Date | null;
  firstChargeAt: Date | null;
  subscriptionStatus: string;
  tier: string;
  lastLoginAt: Date | null;
}

export interface FirstLink {
  at: Date;
  sources: LinkSource[];
}

/**
 * One cohort-by-period cell. Only members whose period has fully elapsed are
 * `eligible`; a period still in progress is not a zero. `rate` is null when no
 * member is eligible yet.
 */
export interface CohortCell {
  rate: number | null;
  count: number;
  eligible: number;
}

export interface MemberSummary {
  userId: string;
  email: string;
  startedAt: string;
  signedUpAt: string;
  trialStartedAt: string | null;
  firstChargeAt: string | null;
  subscriptionStatus: string;
  tier: string;
  lastLoginAt: string | null;
}

export interface MemberEngagementPeriod {
  questions: number;
  required: number;
  engaged: boolean;
}

export interface EngagementMember extends MemberSummary {
  /** Questions asked since `startedAt`. */
  totalQuestions: number;
  /** One entry per column; null while that period is still in progress. */
  periods: Array<MemberEngagementPeriod | null>;
}

export interface ActivationMember extends MemberSummary {
  firstLinkedAt: string | null;
  linkSources: LinkSource[];
  /** The period the first link landed in; 0 when it came before `startedAt`. */
  activatedInPeriod: number | null;
  daysToFirstLink: number | null;
}

export interface CohortRow<Member> {
  key: string;
  label: string;
  startsAt: string;
  endsAt: string;
  size: number;
  cells: CohortCell[];
  members: Member[];
}

export interface ActivationCohortRow extends CohortRow<ActivationMember> {
  activatedToDate: number;
  medianDaysToFirstLink: number | null;
}

export interface CohortExclusions {
  /** Accounts in `ADMIN_EMAILS`, left out of every cohort. */
  operatorAccounts: number;
  /**
   * Paid segment only: accounts Stripe reports as paying with no logged charge
   * to start their clock, so they cannot be placed in a cohort.
   */
  payingWithoutRecordedCharge?: number;
}

interface CohortReportBase {
  segment: CohortSegment;
  cohortGrain: CohortGrain;
  periodGrain: CohortGrain;
  cohortCount: number;
  periodCount: number;
  generatedAt: string;
  timeZone: 'UTC';
  overall: CohortCell[];
  excluded: CohortExclusions;
  notes: string[];
}

export interface EngagementReport extends CohortReportBase {
  kind: 'engagement';
  rule: EngagementRule & {
    /** Whole questions needed in one column; a range when column lengths vary. */
    requiredPerPeriod: { min: number; max: number };
  };
  cohorts: Array<CohortRow<EngagementMember>>;
}

export interface ActivationReport extends CohortReportBase {
  kind: 'activation';
  cohorts: ActivationCohortRow[];
}
