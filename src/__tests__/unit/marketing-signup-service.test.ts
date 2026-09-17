import { getMarketingDashboard } from '../../marketing-analytics/service';
import { getPrismaClient } from '../../prisma-client';
import { loadGa4Sessions } from '../../marketing-analytics/adapters/ga4-bigquery';
import { FUNNEL_EVENT_NAMES, type AnalyticsSession } from '../../marketing-analytics/types';

jest.mock('../../prisma-client', () => ({ getPrismaClient: jest.fn() }));
jest.mock('../../marketing-analytics/adapters/ga4-bigquery', () => ({
  ...jest.requireActual('../../marketing-analytics/adapters/ga4-bigquery'), loadGa4Sessions: jest.fn(),
}));
jest.mock('../../services/calculator-lead-report', () => {
  const actual = jest.requireActual('../../services/calculator-lead-report');
  return { ...actual, calculatorLeadSummary: jest.fn(async (_kind, periodStart, periodEndExclusive) =>
    actual.buildCalculatorLeadSummary({ leads: [], accounts: [], periodStart, periodEndExclusive })) };
});

function session(id: string, cta: boolean, complete: boolean): AnalyticsSession {
  const firstEventAt = Object.fromEntries(FUNNEL_EVENT_NAMES
    .filter(event => complete || !['sign_up', 'trial_signup_completed'].includes(event))
    .map((event, index) => [event, (index + 2) * 1_000_000]));
  if (cta) firstEventAt.start_free_click = 1_000_000;
  return {
    id, userId: id, device: 'mobile', sessionDate: '2026-09-24',
    signupOrigin: 'retirement_calculator', signupEntry: cta ? 'calculator_cta' : 'results_email',
    acquisition: { source: 'google', medium: 'organic', channel: 'Organic Search', campaign: '',
      landingPage: '/retirement-calculator', searchTerm: '', creative: '', adId: '', referrer: '' },
    hostname: 'asklinc.com', browser: 'Chrome', operatingSystem: '', country: '', region: '', city: '',
    visitorType: 'new', trafficQuality: 'human', exclusionReasons: [], engaged: true,
    engagementSeconds: 30, pageViews: 2, eventCount: 10, scrollEvents: 0,
    firstEventAt, eventCounts: Object.fromEntries(Object.keys(firstEventAt).map(event => [event, 1])),
  };
}

describe('signup reporting service', () => {
  const coverage = process.env.GA4_SIGNUP_HANDOFF_TRACKING_DATE;
  const users = jest.fn();
  beforeEach(() => {
    jest.mocked(loadGa4Sessions).mockResolvedValue({ state: 'live', reportEnd: '2026-09-24',
      firstFullTrackingDate: '2026-09-10', reportingLagDays: 1, detail: 'fixture', truncated: false,
      sessions: [session('email', false, true), session('cta', true, true), session('abandoned', true, false)] });
    users.mockResolvedValue([{ id: 'seed-only', emailVerified: true, lastLoginAt: null,
      subscriptionStatus: 'trialing', accessTokens: [], publicApiCredential: null,
      financialSummarySnapshot: null, _count: { conversations: 0 } }]);
    jest.mocked(getPrismaClient).mockReturnValue({ user: { findMany: users },
      subscription: { count: jest.fn().mockResolvedValue(0) },
      retirementQuickPlanRun: { groupBy: jest.fn().mockResolvedValue([]) },
    } as unknown as ReturnType<typeof getPrismaClient>);
  });
  afterEach(() => {
    if (coverage === undefined) delete process.env.GA4_SIGNUP_HANDOFF_TRACKING_DATE;
    else process.env.GA4_SIGNUP_HANDOFF_TRACKING_DATE = coverage;
    jest.clearAllMocks();
  });

  it('does not turn unverified v2 coverage into abandonment and excludes seeded activation', async () => {
    delete process.env.GA4_SIGNUP_HANDOFF_TRACKING_DATE;
    const report = await getMarketingDashboard({ days: 7, compare: true });
    expect(report.summary.trialsCompleted.value).toBe(2);
    expect(report.summary.clickToTrialRate.value).toBeNull();
    expect(report.signupOutcomes.rows.every(row => row.signupAbandonmentRate === null)).toBe(true);
    expect(report.firstParty.createdAccountsWithConversation).toBe(0);
    expect(users).toHaveBeenCalledWith(expect.objectContaining({ select: expect.objectContaining({
      _count: { select: { conversations: { where: { origin: 'user' } } } },
    }) }));
  });

  it('separates direct signup handoffs from CTA conversion and fails closed on truncated data', async () => {
    process.env.GA4_SIGNUP_HANDOFF_TRACKING_DATE = '2026-09-18';
    const report = await getMarketingDashboard({ days: 7, compare: true });
    expect(report.summary.trialsCompleted.value).toBe(2);
    expect(report.summary.clickToTrialRate.value).toBe(.5);
    expect(report.signupOutcomes.rows.find(row => row.entry === 'results_email')?.signupAbandonmentRate).toBe(0);
    const loaded = await loadGa4Sessions({ days: 7, compare: true });
    jest.mocked(loadGa4Sessions).mockResolvedValue({ ...loaded, truncated: true });
    const truncated = await getMarketingDashboard({ days: 7, compare: true });
    expect(truncated.signupOutcomes).toMatchObject({ state: 'unavailable', rows: [] });
    expect(truncated.summary.clickToTrialRate.value).toBeNull();
  });

  it('surfaces an invalid GA4_SIGNUP_HANDOFF_TRACKING_DATE instead of blanking rates silently', async () => {
    process.env.GA4_SIGNUP_HANDOFF_TRACKING_DATE = '09/18/2026';
    const report = await getMarketingDashboard({ days: 7, compare: true });
    expect(report.summary.clickToTrialRate.value).toBeNull();
    expect(report.warnings.some(warning =>
      warning.includes('GA4_SIGNUP_HANDOFF_TRACKING_DATE must use YYYY-MM-DD'))).toBe(true);
  });
});
