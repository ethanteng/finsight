import { getPrismaClient } from '../prisma-client';
import { aggregateTrialFunnel } from './funnel';
import { buildBeachheadScorecard } from './beachhead-scorecard';
import { classifyIntent } from './intent-rules';
import { loadGa4Sessions } from './adapters/ga4-bigquery';
import { isIncludedByDefault } from './traffic-quality';
import {
  INTENT_COHORT_IDS,
  FUNNEL_EVENT_NAMES,
  TRAFFIC_QUALITY_VALUES,
  type AnalyticsSession,
  type BreakdownRow,
  type FirstPartySummary,
  type FunnelEventName,
  type IntentCohortId,
  type IntentPerformanceRow,
  type MarketingDashboardReport,
  type MarketingFilters,
  type MetricValue,
} from './types';
import {
  SNAPSHOT_SEO_KEYWORDS,
  VERIFIED_SNAPSHOT,
} from './verified-snapshot';

function dateOnly(date: Date): string { return date.toISOString().slice(0, 10); }
function addDays(value: string, amount: number): string {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return dateOnly(date);
}

function requestedPeriod(days: number) {
  const end = dateOnly(new Date());
  return periodEnding(end, days);
}

function periodEnding(end: string, days: number) {
  const start = addDays(end, -(days - 1));
  const previousEnd = addDays(start, -1);
  const previousStart = addDays(previousEnd, -(days - 1));
  return { start, end, previousStart, previousEnd };
}

const ratio = (numerator: number, denominator: number): number | null => denominator > 0 ? numerator / denominator : null;
const countEvents = (sessions: AnalyticsSession[], event: string) => sessions.reduce((sum, session) => sum + (session.eventCounts[event] || 0), 0);
const countSessionEvents = (sessions: AnalyticsSession[], event: string) => sessions.filter(session => (session.eventCounts[event] || 0) > 0).length;

function percentile(values: number[], quantile: number): number | null {
  if (!values.length) return null;
  const ordered = [...values].sort((a, b) => a - b);
  const position = (ordered.length - 1) * quantile;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return ordered[lower];
  return ordered[lower] + (ordered[upper] - ordered[lower]) * (position - lower);
}

function metric(value: number | null, previous: number | null, unit: MetricValue['unit'], source: string, note?: string): MetricValue {
  return { value, previous, unit, source, ...(note ? { note } : {}) };
}

function splitPeriods(sessions: AnalyticsSession[], period: ReturnType<typeof requestedPeriod>) {
  return {
    current: sessions.filter(session => session.sessionDate >= period.start && session.sessionDate <= period.end),
    previous: sessions.filter(session => session.sessionDate >= period.previousStart && session.sessionDate <= period.previousEnd),
  };
}

function sessionMatches(session: AnalyticsSession, filters: MarketingFilters): boolean {
  const acquisition = session.acquisition;
  if (filters.source && acquisition.source !== filters.source) return false;
  if (filters.channel && acquisition.channel !== filters.channel) return false;
  if (filters.campaign && acquisition.campaign !== filters.campaign) return false;
  if (filters.landingPage && acquisition.landingPage !== filters.landingPage) return false;
  if (filters.device && session.device !== filters.device) return false;
  if (filters.visitorType && session.visitorType !== filters.visitorType) return false;
  if (filters.intent && classifyIntent(acquisition).id !== filters.intent) return false;
  return true;
}

function sessionMatchesTrafficQuality(session: AnalyticsSession, filters: MarketingFilters): boolean {
  if (filters.trafficQuality) return session.trafficQuality === filters.trafficQuality;
  if (filters.includeExcluded) return true;
  return isIncludedByDefault(session.trafficQuality);
}

function aggregateBreakdown(
  sessions: AnalyticsSession[],
  keyFor: (session: AnalyticsSession) => string,
): BreakdownRow[] {
  const groups = new Map<string, AnalyticsSession[]>();
  for (const session of sessions) {
    const key = keyFor(session) || '(not set)';
    const bucket = groups.get(key);
    if (bucket) bucket.push(session);
    else groups.set(key, [session]);
  }
  return [...groups.entries()].map(([key, rows]) => {
    const engagementValues = rows.map(row => row.engagementSeconds);
    return {
    key,
    label: key,
    sessions: rows.length,
    users: new Set(rows.map(row => row.userId)).size,
    engagedRate: ratio(rows.filter(row => row.engaged).length, rows.length),
    ctaRate: ratio(countSessionEvents(rows, 'start_free_click'), rows.length),
    bounceRate: ratio(rows.filter(row => !row.engaged).length, rows.length),
    pageViewsPerSession: ratio(rows.reduce((sum, row) => sum + row.pageViews, 0), rows.length),
    engagementSeconds: ratio(rows.reduce((sum, row) => sum + row.engagementSeconds, 0), rows.length),
    medianEngagementSeconds: percentile(engagementValues, 0.5),
    p75EngagementSeconds: percentile(engagementValues, 0.75),
    share: ratio(rows.length, sessions.length),
    };
  }).sort((a, b) => b.sessions - a.sessions);
}

function summarizeTrafficQuality(
  population: AnalyticsSession[],
): MarketingDashboardReport['trafficQuality'] {
  const included = population.filter(session => isIncludedByDefault(session.trafficQuality));
  const reasons = new Map<string, number>();
  for (const session of population.filter(row => !isIncludedByDefault(row.trafficQuality))) {
    for (const reason of session.exclusionReasons) reasons.set(reason, (reasons.get(reason) || 0) + 1);
  }
  const engagement = included.map(session => session.engagementSeconds);
  return {
    rawSessions: population.length,
    includedSessions: included.length,
    excludedSessions: population.length - population.filter(session => isIncludedByDefault(session.trafficQuality)).length,
    averageEngagementSeconds: ratio(engagement.reduce((sum, value) => sum + value, 0), engagement.length),
    medianEngagementSeconds: percentile(engagement, 0.5),
    p75EngagementSeconds: percentile(engagement, 0.75),
    byQuality: TRAFFIC_QUALITY_VALUES.map(quality => ({
      quality,
      sessions: population.filter(session => session.trafficQuality === quality).length,
      includedByDefault: isIncludedByDefault(quality),
    })).filter(row => row.sessions > 0),
    exclusionReasons: [...reasons.entries()]
      .map(([reason, sessions]) => ({ reason, sessions }))
      .sort((a, b) => b.sessions - a.sessions),
    note: 'Headline metrics exclude confirmed bots, internal/developer traffic, and non-production hostnames. Ambiguous sessions remain included as unknown and visible for audit.',
  };
}

function aggregateIntents(sessions: AnalyticsSession[], conversionCoverageComplete: boolean): IntentPerformanceRow[] {
  const groups = new Map<IntentCohortId, AnalyticsSession[]>();
  for (const session of sessions) {
    const intent = classifyIntent(session.acquisition).id;
    const bucket = groups.get(intent);
    if (bucket) bucket.push(session);
    else groups.set(intent, [session]);
  }
  return [...groups.entries()].map(([intent, rows]) => {
    const label = classifyIntent(rows[0]?.acquisition || {}).label;
    const qualified = conversionCoverageComplete ? aggregateTrialFunnel(rows, 'complete') : null;
    const stepCount = (event: FunnelEventName) => qualified?.find(step => step.event === event)?.sessions ?? 0;
    return {
      intent,
      key: intent,
      label,
      sessions: rows.length,
      users: new Set(rows.map(row => row.userId)).size,
      engagedRate: ratio(rows.filter(row => row.engaged).length, rows.length),
      ctaRate: ratio(countSessionEvents(rows, 'start_free_click'), rows.length),
      signupStartRate: qualified ? ratio(stepCount('trial_signup_started'), rows.length) : null,
      accountCreatedRate: qualified ? ratio(stepCount('sign_up'), rows.length) : null,
      trialCompleteRate: qualified ? ratio(stepCount('trial_login_success'), rows.length) : null,
      // First-party user ids are intentionally not sent to GA4, so there is no
      // honest join for activation yet. Null means unavailable; zero would
      // incorrectly claim nobody activated.
      activatedUsers: null,
      share: ratio(rows.length, sessions.length),
    };
  }).sort((a, b) => b.sessions - a.sessions);
}

async function firstPartySummary(period: ReturnType<typeof requestedPeriod>): Promise<FirstPartySummary> {
  const prisma = getPrismaClient();
  const start = new Date(`${period.start}T00:00:00.000Z`);
  const endExclusive = new Date(`${addDays(period.end, 1)}T00:00:00.000Z`);
  const users = await prisma.user.findMany({
    where: { createdAt: { gte: start, lt: endExclusive } },
    select: {
      id: true,
      emailVerified: true,
      lastLoginAt: true,
      subscriptionStatus: true,
      accessTokens: {
        where: { isActive: true, supersededAt: null },
        select: { id: true },
        take: 1,
      },
      snapTradeUser: { select: { id: true } },
      publicApiCredential: { select: { id: true } },
      _count: { select: { conversations: true } },
    },
  });
  const subscriptionsCreated = await prisma.subscription.count({
    where: { createdAt: { gte: start, lt: endExclusive } },
  });
  const activatedUserIds = new Set(users.filter(user => user._count.conversations > 0).map(user => user.id));
  return {
      accountsCreated: users.length,
      accountsCurrentlyVerified: users.filter(user => user.emailVerified).length,
      createdAccountsWithLogin: users.filter(user => user.lastLoginAt !== null).length,
      createdAccountsWithConversation: activatedUserIds.size,
      createdAccountsWithFinancialConnection: users.filter(user =>
        user.accessTokens.length > 0 || user.snapTradeUser !== null || user.publicApiCredential !== null
      ).length,
      createdAccountsCurrentlyPaid: users.filter(user => user.subscriptionStatus === 'active').length,
      subscriptionsCreated,
      currentlyTrialingAccounts: users.filter(user => user.subscriptionStatus === 'trialing').length,
    note: 'Live database counts for accounts created in the selected window. Financial connection means an active Plaid connection, SnapTrade registration, or verified Public credential. Verification, latest-login, and current subscription state may have changed later.',
  };
}

function emptyFunnel(): MarketingDashboardReport['funnel'] {
  const labels: Record<FunnelEventName, string> = {
    start_free_click: 'Start free clicked', trial_signup_viewed: 'Signup viewed',
    trial_signup_started: 'Signup started', trial_signup_submit: 'Signup submitted',
    sign_up: 'Account created', trial_verify_viewed: 'Verification viewed',
    trial_verify_submit: 'Verification submitted', trial_verify_success: 'Email verified',
    trial_login_viewed: 'First login viewed', trial_login_submit: 'First login submitted',
    trial_login_success: 'Trial path completed',
  };
  return FUNNEL_EVENT_NAMES.map(event => ({
    event, label: labels[event], sessions: null, users: null,
    previousStepRate: null, abandonmentRate: null, medianSecondsFromPrevious: null,
    coverage: 'collecting' as const,
  }));
}

function filterOptions(sessions: AnalyticsSession[]): MarketingDashboardReport['filterOptions'] {
  const unique = (values: string[]) => [...new Set(values.filter(Boolean))].sort();
  return {
    sources: unique(sessions.map(session => session.acquisition.source)),
    channels: unique(sessions.map(session => session.acquisition.channel)),
    campaigns: unique(sessions.map(session => session.acquisition.campaign).filter(value => value !== '(not set)')),
    landingPages: unique(sessions.map(session => session.acquisition.landingPage)),
    devices: unique(sessions.map(session => session.device)),
    visitorTypes: unique(sessions.map(session => session.visitorType)),
    trafficQualities: [...TRAFFIC_QUALITY_VALUES],
    intents: [...INTENT_COHORT_IDS],
  };
}

export async function getMarketingDashboard(filters: MarketingFilters): Promise<MarketingDashboardReport> {
  let period = requestedPeriod(filters.days);
  const ga4 = await loadGa4Sessions(filters);
  const hasLiveGa4 = ga4.state === 'live';
  if (hasLiveGa4 && ga4.reportEnd) period = periodEnding(ga4.reportEnd, filters.days);
  const split = splitPeriods(ga4.sessions, period);
  const currentPopulation = split.current.filter(session => sessionMatches(session, filters));
  const previousPopulation = split.previous.filter(session => sessionMatches(session, filters));
  const current = currentPopulation.filter(session => sessionMatchesTrafficQuality(session, filters));
  const previous = previousPopulation.filter(session => sessionMatchesTrafficQuality(session, filters));
  const canUseSnapshot = !hasLiveGa4
    && filters.days === 28
    && !filters.source && !filters.channel && !filters.campaign && !filters.landingPage
    && !filters.device && !filters.visitorType && !filters.trafficQuality
    && !filters.includeExcluded && !filters.intent;
  const displayedPeriod = canUseSnapshot ? {
    start: VERIFIED_SNAPSHOT.period.start,
    end: VERIFIED_SNAPSHOT.period.end,
    previousStart: VERIFIED_SNAPSHOT.previousPeriod.start,
    previousEnd: VERIFIED_SNAPSHOT.previousPeriod.end,
  } : period;
  let firstPartyState: 'live' | 'error' = 'live';
  let firstParty: FirstPartySummary;
  try {
    firstParty = await firstPartySummary(displayedPeriod);
  } catch (error) {
    firstPartyState = 'error';
    console.error('Marketing dashboard could not read first-party account aggregates:', error);
    firstParty = {
      accountsCreated: null,
      accountsCurrentlyVerified: null,
      createdAccountsWithLogin: null,
      createdAccountsWithConversation: null,
      createdAccountsWithFinancialConnection: null,
      createdAccountsCurrentlyPaid: null,
      subscriptionsCreated: null,
      currentlyTrialingAccounts: null,
      note: 'The first-party account store could not be read. These values are unavailable, not zero.',
    };
  }
  const trackingStartedAt = ga4.firstFullTrackingDate;
  const funnelCoverageComplete = Boolean(trackingStartedAt && period.start >= trackingStartedAt);
  const funnelCoverage = funnelCoverageComplete ? 'complete' : 'partial';
  const funnelSessions = trackingStartedAt
    ? current.filter(session => session.sessionDate >= trackingStartedAt)
    : [];
  const previousFunnelSessions = trackingStartedAt
    ? previous.filter(session => session.sessionDate >= trackingStartedAt)
    : [];
  const previousFunnelCovered = Boolean(trackingStartedAt && period.previousStart >= trackingStartedAt);
  const beachhead = buildBeachheadScorecard({
    current,
    previous,
    ga4Live: hasLiveGa4,
    funnelCoverageComplete,
    previousFunnelCoverageComplete: previousFunnelCovered,
    firstParty,
  });
  const funnel = hasLiveGa4 && trackingStartedAt
    ? aggregateTrialFunnel(funnelSessions, funnelCoverage)
    : emptyFunnel();
  const previousFunnel = hasLiveGa4 && previousFunnelCovered
    ? aggregateTrialFunnel(previousFunnelSessions, 'complete')
    : null;
  const funnelStepCount = (steps: MarketingDashboardReport['funnel'], event: FunnelEventName) =>
    steps.find(step => step.event === event)?.sessions ?? 0;
  const completed = hasLiveGa4 ? funnelStepCount(funnel, 'trial_login_success') : null;
  const previousCompleted = previousFunnel ? funnelStepCount(previousFunnel, 'trial_login_success') : null;
  const clicks = countEvents(current, 'start_free_click');
  const previousClicks = countEvents(previous, 'start_free_click');
  const funnelClicks = hasLiveGa4 ? funnelStepCount(funnel, 'start_free_click') : null;
  const previousFunnelClicks = previousFunnel ? funnelStepCount(previousFunnel, 'start_free_click') : null;
  const signupStarts = hasLiveGa4 ? funnelStepCount(funnel, 'trial_signup_started') : null;
  const previousSignupStarts = previousFunnel ? funnelStepCount(previousFunnel, 'trial_signup_started') : null;
  const acquisition = hasLiveGa4
    ? aggregateBreakdown(current, session => `${session.acquisition.source} / ${session.acquisition.medium}`)
      .map(row => ({ ...row, raw: current.find(session => `${session.acquisition.source} / ${session.acquisition.medium}` === row.key)?.acquisition }))
    : [];
  const landingPages = hasLiveGa4
    ? aggregateBreakdown(current, session => session.acquisition.landingPage).map(row => ({
      page: row.label, sessions: row.sessions, activityRate: row.engagedRate,
      bounceRate: row.bounceRate ?? null, exitRate: null, scrollReach: null,
      interactionSeconds: row.engagementSeconds ?? null, lcpP75Seconds: null,
    }))
    : [];
  const devices = hasLiveGa4 ? aggregateBreakdown(current, session => session.device) : [];
  const visitorTypes = hasLiveGa4 ? aggregateBreakdown(current, session => session.visitorType) : [];
  const trafficQuality = hasLiveGa4
    ? summarizeTrafficQuality(currentPopulation)
    : canUseSnapshot ? {
      rawSessions: VERIFIED_SNAPSHOT.contentsquare.raw.sessions,
      includedSessions: VERIFIED_SNAPSHOT.contentsquare.reportingPopulation.sessions,
      excludedSessions: VERIFIED_SNAPSHOT.contentsquare.exclusions.total,
      averageEngagementSeconds: VERIFIED_SNAPSHOT.contentsquare.reportingPopulation.engagementSeconds,
      medianEngagementSeconds: null,
      p75EngagementSeconds: null,
      byQuality: [
        { quality: 'human' as const, sessions: VERIFIED_SNAPSHOT.contentsquare.reportingPopulation.sessions, includedByDefault: true },
        { quality: 'bot' as const, sessions: VERIFIED_SNAPSHOT.contentsquare.exclusions.contentsquareFlaggedBots + VERIFIED_SNAPSHOT.contentsquare.exclusions.additionalKnownAutomation, includedByDefault: false },
        { quality: 'internal' as const, sessions: VERIFIED_SNAPSHOT.contentsquare.exclusions.confirmedInternal, includedByDefault: false },
      ],
      exclusionReasons: [
        { reason: 'contentsquare_bot_or_known_automation', sessions: VERIFIED_SNAPSHOT.contentsquare.exclusions.contentsquareFlaggedBots + VERIFIED_SNAPSHOT.contentsquare.exclusions.additionalKnownAutomation },
        { reason: 'owner_confirmed_internal', sessions: VERIFIED_SNAPSHOT.contentsquare.exclusions.confirmedInternal },
      ],
      note: 'The verified snapshot excludes 291 automated sessions and 84 owner-confirmed internal sessions. Clean percentile duration requires a new session-level export.',
    } : {
      rawSessions: 0,
      includedSessions: 0,
      excludedSessions: 0,
      averageEngagementSeconds: null,
      medianEngagementSeconds: null,
      p75EngagementSeconds: null,
      byQuality: [],
      exclusionReasons: [],
      note: 'Traffic quality is unavailable for this unpopulated reporting window.',
    };
  const intents = hasLiveGa4 ? aggregateIntents(current, funnelCoverageComplete) : [];
  const rankedIntents = funnelCoverageComplete && (completed || 0) > 0 ? intents.filter(row => row.sessions >= 10) : [];
  const topConverting = [...rankedIntents].sort((a, b) => (b.trialCompleteRate || 0) - (a.trialCompleteRate || 0))[0];
  const worstHighVolume = [...rankedIntents].sort((a, b) => (a.trialCompleteRate || 0) - (b.trialCompleteRate || 0))[0];

  const warnings = trackingStartedAt
    ? [`Strict no-card funnel coverage begins ${trackingStartedAt}. Earlier event absence is not abandonment and cannot be backfilled.`]
    : ['Strict funnel coverage is unavailable until GA4_FIRST_FULL_TRACKING_DATE is set to the first verified, fully instrumented calendar day.'];
  warnings.push(`GA4 daily export uses a ${ga4.reportingLagDays}-day settling lag; newer dates are intentionally excluded from strict funnel reporting.`);
  if (canUseSnapshot) warnings.push('Top-line web behavior is a connector-verified Contentsquare snapshot for August 12–September 8. It excludes 291 automated sessions and 84 owner-confirmed internal sessions; no contaminated prior-period comparison is shown.');
  if (hasLiveGa4 && trafficQuality.excludedSessions > 0) warnings.push(`${trafficQuality.excludedSessions} bot, internal/developer, or non-production sessions are excluded from headline metrics and remain visible in Traffic quality.`);
  if (ga4.truncated) warnings.push('The GA4 query reached its 100,000-session safety cap. Narrow the date range before interpreting totals.');
  if (hasLiveGa4 && funnel.some(step => (step.rawEventSessions || 0) > (step.sessions || 0))) {
    warnings.push('Some downstream funnel events occurred without every earlier event in the same session. Treat these as re-entry or instrumentation gaps, not drop-off.');
  }
  const ga4FreeTrialAccounts = countSessionEvents(funnelSessions, 'sign_up');
  if (hasLiveGa4 && funnelCoverageComplete && firstParty.accountsCreated !== null && firstParty.accountsCreated > ga4FreeTrialAccounts) {
    warnings.push(`First-party records show ${firstParty.accountsCreated} accounts created in this window while GA4 observed ${ga4FreeTrialAccounts} free-trial sign_up sessions. Check flow mix, consent coverage and event delivery before calling the difference abandonment.`);
  }
  const snapshotFindings: MarketingDashboardReport['findings'] = canUseSnapshot ? [
    {
      severity: 'info',
      title: 'Historical traffic quality is corrected',
      detail: 'The reporting population is 569 sessions after excluding 291 automated sessions and all 84 owner-confirmed internal sessions.',
      action: 'Use the included count for headline behavior; the raw and excluded counts remain visible for audit.',
    },
    {
      severity: 'warning',
      title: 'Acquisition awaits GA4 session attribution',
      detail: 'The old Contentsquare referring-page table has been removed from Acquisition. A blank HTTP referrer is not evidence of a direct or unattributed acquisition session.',
      action: 'Use GA4 session source, medium, channel and campaign once the settled BigQuery export is available.',
    },
    {
      severity: 'opportunity',
      title: 'Clean session-level behavior is collecting',
      detail: 'Historical page, device and visitor-type rows could not be exactly recomputed after the exclusions, so they are withheld rather than presented as clean.',
      action: 'Use the live filtered GA4 breakdowns and median/p75 engagement as the new reporting window fills.',
    },
  ] : [];

  return {
    generatedAt: new Date().toISOString(),
    requested: filters,
    period: displayedPeriod,
    coverage: {
      eventTrackingStartedAt: trackingStartedAt,
      fullyObservedThrough: ga4.reportEnd,
      usesFallbackSnapshot: canUseSnapshot,
    },
    summary: {
      users: metric(hasLiveGa4 ? new Set(current.map(session => session.userId)).size : null, hasLiveGa4 ? new Set(previous.map(session => session.userId)).size : null, 'count', hasLiveGa4 ? 'GA4' : 'Unavailable', canUseSnapshot ? 'Contentsquare does not expose a comparable de-duplicated user total here.' : undefined),
      sessions: metric(hasLiveGa4 ? current.length : canUseSnapshot ? VERIFIED_SNAPSHOT.contentsquare.reportingPopulation.sessions : null, hasLiveGa4 ? previous.length : null, 'count', hasLiveGa4 ? 'GA4 BigQuery · quality filtered' : canUseSnapshot ? 'Contentsquare snapshot · quality filtered' : 'Unavailable'),
      engagedSessionRate: metric(hasLiveGa4 ? ratio(current.filter(session => session.engaged).length, current.length) : canUseSnapshot ? 1 - VERIFIED_SNAPSHOT.contentsquare.reportingPopulation.bounceRate : null, hasLiveGa4 ? ratio(previous.filter(session => session.engaged).length, previous.length) : null, 'percent', hasLiveGa4 ? 'GA4 BigQuery · quality filtered' : canUseSnapshot ? 'Contentsquare inverse bounce rate · quality filtered' : 'Unavailable'),
      ctaClicks: metric(hasLiveGa4 ? clicks : null, hasLiveGa4 ? previousClicks : null, 'count', hasLiveGa4 ? 'GA4 BigQuery' : 'Collecting', 'Uses the deployed start_free_click event, not signup-page reach.'),
      signupStarts: metric(signupStarts, previousSignupStarts, 'count', hasLiveGa4 ? 'GA4 BigQuery · post-instrumentation only' : 'Collecting', 'Strict same-session funnel reach for trial_signup_started.'),
      trialsCompleted: metric(completed, previousCompleted, 'count', hasLiveGa4 ? 'GA4 BigQuery · post-instrumentation only' : 'Collecting', 'A completed no-card path is a qualified trial_login_success after every earlier step in the same session.'),
      clickToTrialRate: metric(hasLiveGa4 && funnelClicks !== null ? ratio(completed || 0, funnelClicks) : null, hasLiveGa4 && previousCompleted !== null && previousFunnelClicks !== null ? ratio(previousCompleted, previousFunnelClicks) : null, 'percent', hasLiveGa4 ? 'GA4 BigQuery · matched coverage' : 'Collecting'),
      paidSpend: metric(null, null, 'currency', 'Unavailable', 'No Google Ads spend connector is available to the runtime.'),
      cac: metric(null, null, 'currency', 'Unavailable', 'Requires paid spend plus an agreed acquisition boundary.'),
    },
    firstParty,
    beachhead,
    funnel,
    funnelErrors: ['trial_signup_validation_error', 'trial_signup_registration_error', 'trial_verify_error', 'trial_login_error'].map(event => ({
      event,
      sessions: hasLiveGa4 ? countSessionEvents(funnelSessions, event) : null,
      events: hasLiveGa4 ? countEvents(funnelSessions, event) : null,
      rate: hasLiveGa4 ? ratio(countSessionEvents(funnelSessions, event), countSessionEvents(funnelSessions, event.startsWith('trial_signup') ? 'trial_signup_submit' : event.startsWith('trial_verify') ? 'trial_verify_submit' : 'trial_login_submit')) : null,
    })),
    acquisition,
    landingPages,
    devices,
    visitorTypes,
    trafficQuality,
    intents,
    seo: {
      ...VERIFIED_SNAPSHOT.ubersuggest,
      keywords: SNAPSHOT_SEO_KEYWORDS,
    },
    findings: [
      ...snapshotFindings,
      ...(topConverting ? [{
        severity: 'info' as const,
        title: `Best converting intent: ${topConverting.label}`,
        detail: `${topConverting.sessions} sessions with ${((topConverting.trialCompleteRate || 0) * 100).toFixed(1)}% completed trial paths.`,
        action: 'Compare quality and activation before increasing traffic.',
      }] : []),
      ...(worstHighVolume && worstHighVolume.intent !== topConverting?.intent ? [{
        severity: 'info' as const,
        title: `Worst high-volume intent: ${worstHighVolume.label}`,
        detail: `${worstHighVolume.sessions} sessions with ${((worstHighVolume.trialCompleteRate || 0) * 100).toFixed(1)}% completed trial paths.`,
        action: 'Inspect landing-message match and source quality before changing the funnel.',
      }] : []),
    ],
    diagnostics: [
      { id: 'gtm', name: 'Google Tag Manager', state: 'live', freshness: '2026-09-09', detail: 'Container GTM-PL362L36 v17 publishes the no-card funnel; v16 publishes calculator interactions.' },
      { id: 'ga4', name: 'GA4 + BigQuery', state: ga4.state, freshness: ga4.reportEnd, detail: `Property 519498279. ${ga4.detail}` },
      { id: 'contentsquare', name: 'Contentsquare', state: 'verified_snapshot', freshness: VERIFIED_SNAPSHOT.capturedAt, detail: 'Ask Linc project 530048. Runtime API credentials are not present; frustration/error APIs are outside the current account entitlement.' },
      { id: 'ubersuggest', name: 'Ubersuggest', state: 'verified_snapshot', freshness: VERIFIED_SNAPSHOT.capturedAt, detail: 'asklinc.com project verified through the connected account. Query impressions/clicks require Search Console or GA4/Search Console export.' },
      { id: 'first_party', name: 'First-party accounts', state: firstPartyState, freshness: firstPartyState === 'live' ? new Date().toISOString() : null, detail: firstPartyState === 'live' ? 'Live PostgreSQL account, verification, subscription, login, and conversation state. No marketing attribution is stored in these records.' : 'The account adapter failed; no zero values were substituted.' },
      { id: 'google_ads', name: 'Google Ads', state: 'unavailable', freshness: null, detail: 'Campaign event instrumentation exists, but spend, campaign and creative reporting are not connected to this backend.' },
    ],
    warnings,
    // Snapshot rows are not filterable; exposing options would blank the KPIs
    // with no indication that Contentsquare slices are unsupported.
    filterOptions: hasLiveGa4 ? filterOptions(ga4.sessions) : {
      sources: [],
      channels: [],
      campaigns: [],
      landingPages: [],
      devices: [],
      visitorTypes: [],
      trafficQualities: [],
      intents: [],
    },
  };
}
