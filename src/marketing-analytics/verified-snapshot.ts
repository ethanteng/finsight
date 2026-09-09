import type { SeoKeywordRow } from './types';

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
    raw: {
      sessions: 944,
      bounceRate: 0.88983,
      pageViewsPerSession: 1.3379,
      engagementSeconds: 106.94,
    },
    reportingPopulation: {
      // 944 raw - 291 confirmed/strong automation - 84 owner-confirmed
      // internal sessions. The remaining aggregate is derived from the same
      // connector results and intentionally has no dirty prior-period delta.
      sessions: 569,
      bounceRate: 505 / 569,
      pageViewsPerSession: 712 / 569,
      engagementSeconds: 33.05,
    },
    exclusions: {
      contentsquareFlaggedBots: 232,
      additionalKnownAutomation: 59,
      confirmedInternal: 84,
      total: 375,
    },
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

export const SNAPSHOT_SEO_KEYWORDS: SeoKeywordRow[] = [
  { query: 'how much savings does average american have', page: 'Average savings article', intent: 'savings_net_worth', position: 16, volume: 4400, clicks: null, impressions: null, ctr: null, cpc: null },
  { query: 'average savings of americans', page: 'Average savings article', intent: 'savings_net_worth', position: 25, volume: 2900, clicks: null, impressions: null, ctr: null, cpc: null },
  { query: 'linc payments', page: '/', intent: 'brand_direct', position: 19, volume: null, clicks: null, impressions: null, ctr: null, cpc: null },
  { query: 'financial calculator ai', page: '/retirement-calculator', intent: 'generic_ai_financial_planning', position: 25, volume: null, clicks: null, impressions: null, ctr: null, cpc: null },
  { query: 'can i retire with 2 million', page: '/can-i-retire-with-2-million', intent: 'retirement_high_intent', position: 50, volume: null, clicks: null, impressions: null, ctr: null, cpc: null },
  { query: 'portfolio risk analysis', page: '/', intent: 'generic_ai_financial_planning', position: 36, volume: null, clicks: null, impressions: null, ctr: null, cpc: null },
];
