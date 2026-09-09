import type { BreakdownRow, PageExperienceRow, SeoKeywordRow } from './types';

/**
 * Connector-verified fallback captured from the Ask Linc projects on
 * 2026-09-09. It is deliberately date-bounded and never presented as live.
 * Runtime GA4/BigQuery data replaces the top-line metrics when configured.
 */
export const VERIFIED_SNAPSHOT = {
  capturedAt: '2026-09-09',
  period: { start: '2026-08-12', end: '2026-09-08' },
  previousPeriod: { start: '2026-07-15', end: '2026-08-11' },
  contentsquare: {
    projectId: 530048,
    mappingId: 2975036,
    sessions: 944,
    previousSessions: 338,
    bounceRate: 0.88983,
    previousBounceRate: 0.72189,
    pageViewsPerSession: 1.3379,
    previousPageViewsPerSession: 1.6065,
    engagementSeconds: 106.94,
    previousEngagementSeconds: 2196,
    signupPageReaches: 3,
    checkoutPageReaches: 1,
    verifiedDestinationReaches: 1,
  },
  ubersuggest: {
    projectId: '8213443d9e1a292b307085341f14d4a3641997e8af895add705b0ae7479c1e80',
    rankingKeywords: 46,
    estimatedMonthlyTraffic: 11,
    domainAuthority: 10,
    backlinks: 132,
    referringDomains: 64,
    trackedKeywords: 61,
    topTenKeywords: 0,
    topHundredKeywords: 2,
  },
} as const;

export const SNAPSHOT_ACQUISITION: BreakdownRow[] = [
  { key: 'direct', label: 'Direct / unattributed', sessions: 694, users: null, engagedRate: 0.0937, bounceRate: 0.9063, ctaRate: null, share: 694 / 944, raw: { source: '(direct)', medium: '(none)', channel: 'Direct' } },
  { key: 'google', label: 'Google organic', sessions: 158, users: null, engagedRate: 0.0949, bounceRate: 0.9051, ctaRate: null, share: 158 / 944, raw: { source: 'google', medium: 'organic', channel: 'Organic Search' } },
  { key: 'facebook', label: 'Facebook', sessions: 29, users: null, engagedRate: 0, bounceRate: 1, ctaRate: null, share: 29 / 944, raw: { source: 'facebook', medium: 'referral', channel: 'Organic Social' } },
  { key: 'linkedin', label: 'LinkedIn', sessions: 28, users: null, engagedRate: 0.3214, bounceRate: 0.6786, ctaRate: null, share: 28 / 944, raw: { source: 'linkedin', medium: 'referral', channel: 'Organic Social' } },
  { key: 'self-referral', label: 'asklinc.com self-referral', sessions: 25, users: null, engagedRate: 0.4, bounceRate: 0.6, ctaRate: null, share: 25 / 944, raw: { source: 'asklinc.com', medium: 'referral', channel: 'Self referral' } },
  { key: 'medium', label: 'Medium', sessions: 3, users: null, engagedRate: null, bounceRate: null, ctaRate: null, share: 3 / 944, raw: { source: 'medium.com', medium: 'referral', channel: 'Referral' } },
  { key: 'other', label: 'Other known referrers', sessions: 7, users: null, engagedRate: null, bounceRate: null, ctaRate: null, share: 7 / 944, raw: { channel: 'Other' } },
];

export const SNAPSHOT_DEVICES: BreakdownRow[] = [
  { key: 'desktop', label: 'Desktop', sessions: 630, users: null, engagedRate: 0.1159, bounceRate: 0.8841, ctaRate: null, pageViewsPerSession: 1.381, engagementSeconds: 138.23, share: 630 / 944 },
  { key: 'mobile', label: 'Mobile', sessions: 208, users: null, engagedRate: 0.149, bounceRate: 0.851, ctaRate: null, pageViewsPerSession: 1.38, engagementSeconds: 64.84, share: 208 / 944 },
  { key: 'unknown', label: 'Unknown device', sessions: 103, users: null, engagedRate: 0, bounceRate: 1, ctaRate: null, pageViewsPerSession: 1, engagementSeconds: 2.42, share: 103 / 944 },
  { key: 'tablet', label: 'Tablet', sessions: 3, users: null, engagedRate: 0, bounceRate: 1, ctaRate: null, pageViewsPerSession: null, engagementSeconds: null, share: 3 / 944 },
];

export const SNAPSHOT_VISITORS: BreakdownRow[] = [
  { key: 'new', label: 'New visitors', sessions: 860, users: null, engagedRate: 0.0756, bounceRate: 0.9244, ctaRate: null, pageViewsPerSession: 1.167, engagementSeconds: 22.17, share: 860 / 944 },
  { key: 'returning', label: 'Returning visitors', sessions: 84, users: null, engagedRate: 0.4643, bounceRate: 0.5357, ctaRate: null, pageViewsPerSession: 3.083, engagementSeconds: 974.9, share: 84 / 944 },
];

export const SNAPSHOT_PAGES: PageExperienceRow[] = [
  { page: 'Blog posts', sessions: 254, activityRate: 0.1515, bounceRate: 0.9407, exitRate: 0.8877, scrollReach: 0.3959, interactionSeconds: 7.76, lcpP75Seconds: 2.868, warning: 'Largest traffic pool, but almost all sessions bounce.' },
  { page: 'Home', sessions: 150, activityRate: 0.4069, bounceRate: 0.8797, exitRate: 0.7273, scrollReach: 0.3663, interactionSeconds: 3.64, lcpP75Seconds: 3.352, warning: 'High-volume landing experience is above the 2.5s LCP target.' },
  { page: 'Comparison pages', sessions: 24, activityRate: 0.4824, bounceRate: 0.8462, exitRate: 0.625, scrollReach: 0.3933, interactionSeconds: 1.04, lcpP75Seconds: 2.512 },
  { page: 'Retirement calculator', sessions: 21, activityRate: 0.2164, bounceRate: 0.9524, exitRate: 0.913, scrollReach: 0.332, interactionSeconds: 12.17, lcpP75Seconds: 1.92, warning: 'People spend time with the tool, then leave; measure edit → Run → CTA with the new events.' },
  { page: 'Blog index', sessions: 11, activityRate: 0.6081, bounceRate: 0.5, exitRate: 0.5294, scrollReach: null, interactionSeconds: null, lcpP75Seconds: null },
  { page: 'Product pages', sessions: 8, activityRate: 0.4306, bounceRate: 0.6667, exitRate: 0.3077, scrollReach: 0.357, interactionSeconds: 2.91, lcpP75Seconds: 3.155 },
  { page: 'Pricing', sessions: 7, activityRate: 0.224, bounceRate: 0.8571, exitRate: 0.8571, scrollReach: 0.58, interactionSeconds: 1.41, lcpP75Seconds: 1.908 },
  { page: 'Signup', sessions: 3, activityRate: 0.3718, bounceRate: null, exitRate: 0.6667, scrollReach: 0.92, interactionSeconds: 0.768, lcpP75Seconds: 14.712, warning: 'Severe p75 load time signal, but based on only three visits.' },
];

export const SNAPSHOT_SEO_KEYWORDS: SeoKeywordRow[] = [
  { query: 'how much savings does average american have', page: 'Average savings article', intent: 'savings_net_worth', position: 16, volume: 4400, clicks: null, impressions: null, ctr: null, cpc: null },
  { query: 'average savings of americans', page: 'Average savings article', intent: 'savings_net_worth', position: 25, volume: 2900, clicks: null, impressions: null, ctr: null, cpc: null },
  { query: 'linc payments', page: '/', intent: 'brand_direct', position: 19, volume: null, clicks: null, impressions: null, ctr: null, cpc: null },
  { query: 'financial calculator ai', page: '/retirement-calculator', intent: 'generic_ai_financial_planning', position: 25, volume: null, clicks: null, impressions: null, ctr: null, cpc: null },
  { query: 'can i retire with 2 million', page: '/can-i-retire-with-2-million', intent: 'retirement_high_intent', position: 50, volume: null, clicks: null, impressions: null, ctr: null, cpc: null },
  { query: 'portfolio risk analysis', page: '/', intent: 'generic_ai_financial_planning', position: 36, volume: null, clicks: null, impressions: null, ctr: null, cpc: null },
];
