export const INTENT_COHORT_IDS = [
  'retirement_high_intent',
  'generic_ai_financial_planning',
  'competitor_comparison',
  'savings_net_worth',
  'brand_direct',
  'blog_informational_seo',
  'paid_nonbrand',
  'paid_brand',
  'unknown',
] as const;

export type IntentCohortId = (typeof INTENT_COHORT_IDS)[number];

export const FUNNEL_EVENT_NAMES = [
  'start_free_click',
  'trial_signup_viewed',
  'trial_signup_started',
  'trial_signup_submit',
  'sign_up',
  'trial_verify_viewed',
  'trial_verify_submit',
  'trial_verify_success',
  'trial_login_viewed',
  'trial_login_submit',
  'trial_login_success',
] as const;

export type FunnelEventName = (typeof FUNNEL_EVENT_NAMES)[number];

export const TRAFFIC_QUALITY_VALUES = [
  'human',
  'bot',
  'internal',
  'synthetic',
  'unknown',
] as const;

export type TrafficQuality = (typeof TRAFFIC_QUALITY_VALUES)[number];

export interface AcquisitionFields {
  source: string;
  medium: string;
  channel: string;
  campaign: string;
  landingPage: string;
  searchTerm: string;
  creative: string;
  adId: string;
  referrer: string;
}

export interface AnalyticsUser {
  id: string;
  firstSeenAt: string | null;
  lastSeenAt: string | null;
  sessionIds: string[];
  firstAcquisition: AcquisitionFields | null;
}

export interface AnalyticsEvent {
  name: string;
  occurredAt: number;
  sessionId: string;
  userId: string;
  sourcePage: string | null;
  parameters: Record<string, string | number | boolean | null>;
}

export interface IntentCohort {
  id: IntentCohortId;
  label: string;
  description: string;
  priority: number;
}

export interface AnalyticsSession {
  id: string;
  userId: string;
  sessionDate: string;
  acquisition: AcquisitionFields;
  hostname: string;
  device: string;
  browser: string;
  operatingSystem: string;
  country: string;
  region: string;
  city: string;
  visitorType: 'new' | 'returning' | 'unknown';
  trafficQuality: TrafficQuality;
  exclusionReasons: string[];
  engaged: boolean;
  engagementSeconds: number;
  pageViews: number;
  eventCount: number;
  scrollEvents: number;
  eventCounts: Record<string, number>;
  firstEventAt: Partial<Record<FunnelEventName, number>>;
}

export interface MarketingFilters {
  days: 7 | 28 | 90;
  compare: boolean;
  source?: string;
  channel?: string;
  campaign?: string;
  landingPage?: string;
  device?: string;
  visitorType?: 'new' | 'returning';
  trafficQuality?: TrafficQuality;
  includeExcluded?: boolean;
  intent?: IntentCohortId;
}

export type SourceState = 'live' | 'verified_snapshot' | 'collecting' | 'needs_configuration' | 'unavailable' | 'error';

export interface SourceDiagnostic {
  id: 'ga4' | 'gtm' | 'contentsquare' | 'ubersuggest' | 'first_party' | 'google_ads';
  name: string;
  state: SourceState;
  freshness: string | null;
  detail: string;
}

export interface MetricValue {
  value: number | null;
  previous: number | null;
  unit: 'count' | 'percent' | 'seconds' | 'currency';
  source: string;
  note?: string;
}

export interface NormalizedMetric extends MetricValue {
  id: string;
  label: string;
  periodStart: string;
  periodEnd: string;
  dimensions: Record<string, string>;
}

export interface FunnelStepMetric {
  event: FunnelEventName;
  label: string;
  sessions: number | null;
  users: number | null;
  previousStepRate: number | null;
  abandonmentRate: number | null;
  medianSecondsFromPrevious: number | null;
  coverage: 'complete' | 'partial' | 'collecting' | 'unavailable';
  rawEventSessions?: number;
}

export interface BreakdownRow {
  key: string;
  label: string;
  sessions: number;
  users: number | null;
  engagedRate: number | null;
  ctaRate: number | null;
  bounceRate?: number | null;
  pageViewsPerSession?: number | null;
  engagementSeconds?: number | null;
  medianEngagementSeconds?: number | null;
  p75EngagementSeconds?: number | null;
  share?: number | null;
  raw?: Partial<AcquisitionFields>;
}

export interface IntentPerformanceRow extends BreakdownRow {
  intent: IntentCohortId;
  signupStartRate: number | null;
  accountCreatedRate: number | null;
  trialCompleteRate: number | null;
  activatedUsers: number | null;
}

export interface SeoKeywordRow {
  query: string;
  page: string;
  intent: IntentCohortId;
  position: number | null;
  volume: number | null;
  clicks: number | null;
  impressions: number | null;
  ctr: number | null;
  cpc: number | null;
}

export interface PageExperienceRow {
  page: string;
  sessions: number;
  activityRate: number | null;
  bounceRate: number | null;
  exitRate: number | null;
  scrollReach: number | null;
  interactionSeconds: number | null;
  lcpP75Seconds: number | null;
  warning?: string;
}

export interface FirstPartySummary {
  accountsCreated: number | null;
  accountsCurrentlyVerified: number | null;
  createdAccountsWithLogin: number | null;
  createdAccountsWithConversation: number | null;
  subscriptionsCreated: number | null;
  currentlyTrialingAccounts: number | null;
  note: string;
}

export interface MarketingDashboardReport {
  generatedAt: string;
  requested: MarketingFilters;
  period: { start: string; end: string; previousStart: string; previousEnd: string };
  coverage: {
    eventTrackingStartedAt: string | null;
    fullyObservedThrough: string | null;
    usesFallbackSnapshot: boolean;
  };
  summary: {
    users: MetricValue;
    sessions: MetricValue;
    engagedSessionRate: MetricValue;
    ctaClicks: MetricValue;
    signupStarts: MetricValue;
    trialsCompleted: MetricValue;
    clickToTrialRate: MetricValue;
    paidSpend: MetricValue;
    cac: MetricValue;
  };
  firstParty: FirstPartySummary;
  funnel: FunnelStepMetric[];
  funnelErrors: Array<{ event: string; sessions: number | null; events: number | null; rate: number | null }>;
  acquisition: BreakdownRow[];
  landingPages: PageExperienceRow[];
  devices: BreakdownRow[];
  visitorTypes: BreakdownRow[];
  trafficQuality: {
    rawSessions: number;
    includedSessions: number;
    excludedSessions: number;
    averageEngagementSeconds: number | null;
    medianEngagementSeconds: number | null;
    p75EngagementSeconds: number | null;
    byQuality: Array<{ quality: TrafficQuality; sessions: number; includedByDefault: boolean }>;
    exclusionReasons: Array<{ reason: string; sessions: number }>;
    note: string;
  };
  intents: IntentPerformanceRow[];
  seo: {
    rankingKeywords: number;
    estimatedMonthlyTraffic: number;
    domainAuthority: number;
    backlinks: number;
    referringDomains: number;
    trackedKeywords: number;
    topTenKeywords: number;
    topHundredKeywords: number;
    keywords: SeoKeywordRow[];
  };
  findings: Array<{ severity: 'critical' | 'warning' | 'opportunity' | 'info'; title: string; detail: string; action: string }>;
  diagnostics: SourceDiagnostic[];
  warnings: string[];
  filterOptions: {
    sources: string[];
    channels: string[];
    campaigns: string[];
    landingPages: string[];
    devices: string[];
    visitorTypes: string[];
    trafficQualities: TrafficQuality[];
    intents: IntentCohortId[];
  };
}
