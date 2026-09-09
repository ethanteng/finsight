import { getPrismaClient } from '../prisma-client';
import { aggregateTrialFunnel } from './funnel';
import { classifyIntent } from './intent-rules';
import { loadGa4Sessions } from './adapters/ga4-bigquery';
import {
  INTENT_COHORT_IDS,
  FUNNEL_EVENT_NAMES,
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
  SNAPSHOT_ACQUISITION,
  SNAPSHOT_DEVICES,
  SNAPSHOT_PAGES,
  SNAPSHOT_SEO_KEYWORDS,
  SNAPSHOT_VISITORS,
  VERIFIED_SNAPSHOT,
} from './verified-snapshot';

const TRACKING_STARTED_AT = '2026-09-09';

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

function aggregateBreakdown(
  sessions: AnalyticsSession[],
  keyFor: (session: AnalyticsSession) => string,
): BreakdownRow[] {
  const groups = new Map<string, AnalyticsSession[]>();
  for (const session of sessions) {
    const key = keyFor(session) || '(not set)';
    groups.set(key, [...(groups.get(key) || []), session]);
  }
  return [...groups.entries()].map(([key, rows]) => ({
    key,
    label: key,
    sessions: rows.length,
    users: new Set(rows.map(row => row.userId)).size,
    engagedRate: ratio(rows.filter(row => row.engaged).length, rows.length),
    ctaRate: ratio(countSessionEvents(rows, 'start_free_click'), rows.length),
    bounceRate: ratio(rows.filter(row => !row.engaged).length, rows.length),
    pageViewsPerSession: ratio(rows.reduce((sum, row) => sum + row.pageViews, 0), rows.length),
    engagementSeconds: ratio(rows.reduce((sum, row) => sum + row.engagementSeconds, 0), rows.length),
    share: ratio(rows.length, sessions.length),
  })).sort((a, b) => b.sessions - a.sessions);
}

function aggregateIntents(sessions: AnalyticsSession[], conversionCoverageComplete: boolean): IntentPerformanceRow[] {
  const groups = new Map<IntentCohortId, AnalyticsSession[]>();
  for (const session of sessions) {
    const intent = classifyIntent(session.acquisition).id;
    groups.set(intent, [...(groups.get(intent) || []), session]);
  }
  return [...groups.entries()].map(([intent, rows]) => {
    const label = classifyIntent(rows[0]?.acquisition || {}).label;
    return {
      intent,
      key: intent,
      label,
      sessions: rows.length,
      users: new Set(rows.map(row => row.userId)).size,
      engagedRate: ratio(rows.filter(row => row.engaged).length, rows.length),
      ctaRate: ratio(countSessionEvents(rows, 'start_free_click'), rows.length),
      signupStartRate: conversionCoverageComplete ? ratio(countSessionEvents(rows, 'trial_signup_started'), rows.length) : null,
      accountCreatedRate: conversionCoverageComplete ? ratio(countSessionEvents(rows, 'sign_up'), rows.length) : null,
      trialCompleteRate: conversionCoverageComplete ? ratio(countSessionEvents(rows, 'trial_login_success'), rows.length) : null,
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
      subscriptionsCreated,
      currentlyTrialingAccounts: users.filter(user => user.subscriptionStatus === 'trialing').length,
    note: 'Live database counts for accounts created in the selected window. Verification, latest-login, and current subscription state are not attribution events and may have changed later.',
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
    intents: [...INTENT_COHORT_IDS],
  };
}

export async function getMarketingDashboard(filters: MarketingFilters): Promise<MarketingDashboardReport> {
  let period = requestedPeriod(filters.days);
  const ga4 = await loadGa4Sessions(filters);
  const hasLiveGa4 = ga4.state === 'live';
  if (hasLiveGa4 && ga4.reportEnd) period = periodEnding(ga4.reportEnd, filters.days);
  const split = splitPeriods(ga4.sessions, period);
  const current = split.current.filter(session => sessionMatches(session, filters));
  const previous = split.previous.filter(session => sessionMatches(session, filters));
  const canUseSnapshot = !hasLiveGa4
    && filters.days === 28
    && !filters.source && !filters.channel && !filters.campaign && !filters.landingPage
    && !filters.device && !filters.visitorType && !filters.intent;
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
      subscriptionsCreated: null,
      currentlyTrialingAccounts: null,
      note: 'The first-party account store could not be read. These values are unavailable, not zero.',
    };
  }
  const funnelCoverage = period.start >= TRACKING_STARTED_AT ? 'complete' : 'partial';
  const funnelSessions = current.filter(session => session.sessionDate >= TRACKING_STARTED_AT);
  const previousFunnelSessions = previous.filter(session => session.sessionDate >= TRACKING_STARTED_AT);
  const previousFunnelCovered = period.previousStart >= TRACKING_STARTED_AT;
  const funnel = hasLiveGa4 ? aggregateTrialFunnel(funnelSessions, funnelCoverage) : emptyFunnel();
  const completed = countSessionEvents(funnelSessions, 'trial_login_success');
  const previousCompleted = previousFunnelCovered ? countSessionEvents(previousFunnelSessions, 'trial_login_success') : null;
  const clicks = countEvents(current, 'start_free_click');
  const previousClicks = countEvents(previous, 'start_free_click');
  const funnelClicks = countSessionEvents(funnelSessions, 'start_free_click');
  const previousFunnelClicks = previousFunnelCovered ? countSessionEvents(previousFunnelSessions, 'start_free_click') : null;
  const acquisition = hasLiveGa4
    ? aggregateBreakdown(current, session => `${session.acquisition.source} / ${session.acquisition.medium}`)
      .map(row => ({ ...row, raw: current.find(session => `${session.acquisition.source} / ${session.acquisition.medium}` === row.key)?.acquisition }))
    : canUseSnapshot ? SNAPSHOT_ACQUISITION : [];
  const landingPages = hasLiveGa4
    ? aggregateBreakdown(current, session => session.acquisition.landingPage).map(row => ({
      page: row.label, sessions: row.sessions, activityRate: row.engagedRate,
      bounceRate: row.bounceRate ?? null, exitRate: null, scrollReach: null,
      interactionSeconds: row.engagementSeconds ?? null, lcpP75Seconds: null,
    }))
    : canUseSnapshot ? SNAPSHOT_PAGES : [];
  const devices = hasLiveGa4 ? aggregateBreakdown(current, session => session.device) : canUseSnapshot ? SNAPSHOT_DEVICES : [];
  const visitorTypes = hasLiveGa4 ? aggregateBreakdown(current, session => session.visitorType) : canUseSnapshot ? SNAPSHOT_VISITORS : [];
  const intents = hasLiveGa4 ? aggregateIntents(current, funnelCoverage === 'complete') : [];
  const rankedIntents = funnelCoverage === 'complete' && completed > 0 ? intents.filter(row => row.sessions >= 10) : [];
  const topConverting = [...rankedIntents].sort((a, b) => (b.trialCompleteRate || 0) - (a.trialCompleteRate || 0))[0];
  const worstHighVolume = [...rankedIntents].sort((a, b) => (a.trialCompleteRate || 0) - (b.trialCompleteRate || 0))[0];

  const warnings = [
    'New no-card funnel events began on September 9, 2026 and cannot be backfilled. Pre-launch absence is not abandonment.',
    'GA4 daily export uses a three-day settling lag; today and the prior three days are intentionally excluded from strict funnel reporting.',
  ];
  if (canUseSnapshot) warnings.push('Top-line web behavior is a connector-verified Contentsquare snapshot for August 12–September 8, not a live runtime feed.');
  if (ga4.truncated) warnings.push('The GA4 query reached its 100,000-session safety cap. Narrow the date range before interpreting totals.');
  if (hasLiveGa4 && funnel.some(step => (step.rawEventSessions || 0) > (step.sessions || 0))) {
    warnings.push('Some downstream funnel events occurred without every earlier event in the same session. Treat these as re-entry or instrumentation gaps, not drop-off.');
  }
  const ga4FreeTrialAccounts = countSessionEvents(funnelSessions, 'sign_up');
  if (hasLiveGa4 && funnelCoverage === 'complete' && firstParty.accountsCreated !== null && firstParty.accountsCreated > ga4FreeTrialAccounts) {
    warnings.push(`First-party records show ${firstParty.accountsCreated} accounts created in this window while GA4 observed ${ga4FreeTrialAccounts} free-trial sign_up sessions. Check flow mix, consent coverage and event delivery before calling the difference abandonment.`);
  }
  const snapshotFindings: MarketingDashboardReport['findings'] = canUseSnapshot ? [
    {
      severity: 'critical',
      title: 'Acquisition is mostly unattributed',
      detail: '694 of 944 recent visits (73.5%) had no referrer, while 25 more were Ask Linc self-referrals. That makes channel and cohort conversion look blurrier than it is.',
      action: 'Preserve UTMs through signup redirects, fix cross-domain/referral exclusions, and audit consent-mode loss before reallocating spend.',
    },
    {
      severity: 'critical',
      title: 'Signup load time is the clearest friction signal',
      detail: 'Contentsquare measured 14.7s p75 LCP on the signup page. The sample is only three visits, so treat it as a high-priority investigation rather than a settled benchmark.',
      action: 'Inspect those sessions and rerun performance measurement after traffic grows; alert if p75 stays above 4s.',
    },
    {
      severity: 'warning',
      title: 'Informational traffic is not crossing into product intent',
      detail: 'Blog posts drove 254 visits with 94.1% bounce. Google organic delivered 158 visits at 90.5% bounce, while the strongest ranking queries are savings benchmarks.',
      action: 'Add article-specific next steps and compare CTA rate by intent rather than measuring every organic visit against the same signup expectation.',
    },
    {
      severity: 'opportunity',
      title: 'The retirement calculator is used, then abandoned',
      detail: 'Its 21 visits showed 56.5s elapsed time and 12.2s interaction, yet 95.2% bounced and 91.3% exited. That pattern suggests value consumption without a strong bridge to the trial.',
      action: 'Use the new edit → Run → result → Start free events to isolate whether loss happens before the result, at the CTA, or after landing on signup.',
    },
    {
      severity: 'warning',
      title: 'A bot/internal-traffic pocket is distorting the top line',
      detail: '103 unknown-device visits were 100% bounce, one page, and 2.4 seconds. Returning-session duration is also implausibly high.',
      action: 'Apply the verified human segment and exclude known internal traffic before using engagement deltas in decisions.',
    },
  ] : [];

  return {
    generatedAt: new Date().toISOString(),
    requested: filters,
    period: displayedPeriod,
    coverage: {
      eventTrackingStartedAt: TRACKING_STARTED_AT,
      fullyObservedThrough: ga4.reportEnd,
      usesFallbackSnapshot: canUseSnapshot,
    },
    summary: {
      users: metric(hasLiveGa4 ? new Set(current.map(session => session.userId)).size : null, hasLiveGa4 ? new Set(previous.map(session => session.userId)).size : null, 'count', hasLiveGa4 ? 'GA4' : 'Unavailable', canUseSnapshot ? 'Contentsquare does not expose a comparable de-duplicated user total here.' : undefined),
      sessions: metric(hasLiveGa4 ? current.length : canUseSnapshot ? VERIFIED_SNAPSHOT.contentsquare.sessions : null, hasLiveGa4 ? previous.length : canUseSnapshot ? VERIFIED_SNAPSHOT.contentsquare.previousSessions : null, 'count', hasLiveGa4 ? 'GA4 BigQuery' : canUseSnapshot ? 'Contentsquare snapshot' : 'Unavailable'),
      engagedSessionRate: metric(hasLiveGa4 ? ratio(current.filter(session => session.engaged).length, current.length) : canUseSnapshot ? 1 - VERIFIED_SNAPSHOT.contentsquare.bounceRate : null, hasLiveGa4 ? ratio(previous.filter(session => session.engaged).length, previous.length) : canUseSnapshot ? 1 - VERIFIED_SNAPSHOT.contentsquare.previousBounceRate : null, 'percent', hasLiveGa4 ? 'GA4 BigQuery' : canUseSnapshot ? 'Contentsquare inverse bounce rate' : 'Unavailable'),
      ctaClicks: metric(hasLiveGa4 ? clicks : null, hasLiveGa4 ? previousClicks : null, 'count', hasLiveGa4 ? 'GA4 BigQuery' : 'Collecting', 'Uses the deployed start_free_click event, not signup-page reach.'),
      signupStarts: metric(hasLiveGa4 ? countSessionEvents(funnelSessions, 'trial_signup_started') : null, hasLiveGa4 && previousFunnelCovered ? countSessionEvents(previousFunnelSessions, 'trial_signup_started') : null, 'count', hasLiveGa4 ? 'GA4 BigQuery · post-instrumentation only' : 'Collecting'),
      trialsCompleted: metric(hasLiveGa4 ? completed : null, hasLiveGa4 ? previousCompleted : null, 'count', hasLiveGa4 ? 'GA4 BigQuery · post-instrumentation only' : 'Collecting', 'A completed no-card path is trial_login_success.'),
      clickToTrialRate: metric(hasLiveGa4 ? ratio(completed, funnelClicks) : null, hasLiveGa4 && previousCompleted !== null && previousFunnelClicks !== null ? ratio(previousCompleted, previousFunnelClicks) : null, 'percent', hasLiveGa4 ? 'GA4 BigQuery · matched coverage' : 'Collecting'),
      paidSpend: metric(null, null, 'currency', 'Unavailable', 'No Google Ads spend connector is available to the runtime.'),
      cac: metric(null, null, 'currency', 'Unavailable', 'Requires paid spend plus an agreed acquisition boundary.'),
    },
    firstParty,
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
    filterOptions: hasLiveGa4 ? filterOptions(ga4.sessions) : {
      sources: SNAPSHOT_ACQUISITION.map(row => row.raw?.source || row.label),
      channels: [...new Set(SNAPSHOT_ACQUISITION.map(row => row.raw?.channel || 'Other'))],
      campaigns: [],
      landingPages: SNAPSHOT_PAGES.map(row => row.page),
      devices: SNAPSHOT_DEVICES.map(row => row.key),
      visitorTypes: ['new', 'returning'],
      intents: [...INTENT_COHORT_IDS],
    },
  };
}
