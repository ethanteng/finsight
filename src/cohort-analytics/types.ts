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
  source?: 'all' | 'coast_fire_calculator' | 'retirement_calculator' | 'cash_flow_forecast' | 'direct_or_unknown';
  channel?: 'all' | 'google_ads';
  campaign?: string;
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

export interface SourceCoverage {
  recorded: number;
  recovered: number;
  unknown: number;
}

interface CohortReportBase {
  sourceCoverage?: SourceCoverage;
  quality?: QualitySummary;
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

export interface QualitySummary {
  measuredSignups: number;
  unmeasuredSignups: number;
  resultViewed: number;
  meaningfulAnswer: number;
  accountLinked: number;
  returnedEngaged: number;
  returnEligible: number;
  returnMaturedCount: number;
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

/**
 * What a signed-out visitor can do that the Visitors report counts, each from
 * one GA4 event (see `src/marketing-analytics/adapters/ga4-visitors.ts`).
 */
export const VISITOR_ACTIONS = ['coast_fire_run', 'retirement_run', 'cash_flow_check', 'coffee_widget'] as const;
export type VisitorAction = typeof VISITOR_ACTIONS[number];
export type VisitorActionCounts = Record<VisitorAction, number>;

/**
 * What the period grid can show. `visited` is any session in the period;
 * `signed_up` is cumulative, like activation, because it happens once.
 */
export const VISITOR_METRICS = ['any_action', ...VISITOR_ACTIONS, 'visited', 'signed_up'] as const;
export type VisitorMetric = typeof VISITOR_METRICS[number];

/** Where a visitor's first session landed. */
export const VISITOR_LANDINGS = ['all', 'coast_fire_calculator', 'retirement_calculator', 'cash_flow_forecast', 'other'] as const;
export type VisitorLanding = Exclude<typeof VISITOR_LANDINGS[number], 'all'>;

/** GA4 channels, as the marketing adapter groups them, keyed for a query string. */
export const VISITOR_CHANNELS = ['all', 'paid', 'organic_search', 'organic_social', 'direct', 'referral', 'other'] as const;
export type VisitorChannel = Exclude<typeof VISITOR_CHANNELS[number], 'all'>;

export const VISITOR_DEVICES = ['all', 'desktop', 'mobile', 'tablet'] as const;

export interface VisitorWindow {
  /** All filters read the visitor's first session. */
  landing: typeof VISITOR_LANDINGS[number];
  channel: typeof VISITOR_CHANNELS[number];
  campaign?: string;
  device: typeof VISITOR_DEVICES[number];
  cohortGrain: CohortGrain;
  periodGrain: CohortGrain;
  cohortCount: number;
  periodCount: number;
}

export interface VisitorSessionSummary {
  sessionId: string;
  startedAt: string;
  landingPage: string;
  channel: string;
  campaign: string;
  device: string;
  pageViews: number;
  engagementSeconds: number;
  actions: VisitorActionCounts;
}

export type VisitorOutcome = 'signed_up' | 'signed_in';

export interface VisitorMember {
  /** GA4's `user_pseudo_id`: one browser's analytics cookie, not a person. */
  visitorId: string;
  firstSeenAt: string;
  landingPage: string;
  landing: VisitorLanding;
  channel: string;
  source: string;
  medium: string;
  campaign: string;
  device: string;
  country: string;
  sessionCount: number;
  /** Before signing up or in; afterwards the browser belongs to an account. */
  actions: VisitorActionCounts;
  /** `signed_in`: reached the app without signing up in this browser, so an existing account. */
  outcome: VisitorOutcome | null;
  outcomeAt: string | null;
  sessions: VisitorSessionSummary[];
}

/** Everything a cohort did to date, before signing up or in. */
export interface VisitorTotals {
  actions: Record<VisitorAction, { visitors: number; count: number }>;
  anyAction: number;
  /** Visitors with two or more sessions. */
  returned: number;
  signedUp: number;
  signedIn: number;
}

export interface VisitorCohortRow {
  key: string;
  label: string;
  startsAt: string;
  endsAt: string;
  size: number;
  totals: VisitorTotals;
  cells: Record<VisitorMetric, CohortCell[]>;
  /**
   * The most active visitors, at most `memberLimit`, for the cohort the
   * request named (`membersFor`); empty for every other. `size` counts them all.
   */
  members: VisitorMember[];
}

export interface VisitorExclusions {
  /** Browsers that opened `/admin` or were marked as an operator's. */
  operatorBrowsers: number;
  /** Sessions classified as automation or off-host, as on the marketing pages. */
  automatedSessions: number;
  /** Browsers whose first session in this window was not their first ever. */
  seenBeforeWindow: number;
}

export interface VisitorReport extends VisitorWindow {
  kind: 'visitors';
  /** `truncated`: more browsers than one report can hold; nothing is shown rather than an undercount. */
  state: 'live' | 'needs_configuration' | 'error' | 'truncated';
  detail: string;
  /** The newest GA4 daily export table's day, in the property's reporting time zone. */
  reportEnd: string | null;
  /**
   * The newest event in GA4's streaming export, read for the days after
   * `reportEnd`; null when nothing streamed is read. Those days are provisional.
   */
  streamedThrough: string | null;
  /** Periods ending after this are still in progress: the newest streamed event, else midnight after `reportEnd`. */
  dataThrough: string | null;
  generatedAt: string;
  timeZone: 'UTC';
  memberLimit: number;
  /** The cohort whose visitors are listed, if the request named one. */
  membersFor: string | null;
  cohorts: VisitorCohortRow[];
  overall: { size: number; totals: VisitorTotals; cells: Record<VisitorMetric, CohortCell[]> };
  excluded: VisitorExclusions;
  notes: string[];
}
