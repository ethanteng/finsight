import { generateKeyPairSync } from 'crypto';
import { buildVisitorReport, landingFor, visitorCohortStarts, VISITOR_MEMBER_LIMIT } from '../../cohort-analytics/visitors';
import {
  buildVisitorQuery,
  loadGa4Visitors,
  toVisitor,
  VISITOR_CAP,
  type Ga4Visitor,
  type Ga4VisitorSession,
} from '../../marketing-analytics/adapters/ga4-visitors';
import { clearVisitorCache, getVisitorReport, visitorDataThrough } from '../../cohort-analytics/visitor-service';
import type { VisitorWindow } from '../../cohort-analytics/types';

const at = (iso: string) => new Date(iso);
const none = { coast_fire_run: 0, retirement_run: 0, cash_flow_check: 0, coffee_widget: 0 };

function session(startedAt: string, overrides: Partial<Ga4VisitorSession> = {}): Ga4VisitorSession {
  return {
    sessionId: startedAt,
    startedAt: at(startedAt),
    sessionNumber: 1,
    landingPage: '/',
    source: '(direct)',
    medium: '(none)',
    campaign: '(not set)',
    channel: 'Direct',
    device: 'desktop',
    country: 'United States',
    pageViews: 2,
    engagementSeconds: 30,
    actions: none,
    quality: 'human',
    ...overrides,
  };
}

function visitor(visitorId: string, sessions: Ga4VisitorSession[], overrides: Partial<Ga4Visitor> = {}): Ga4Visitor {
  return { visitorId, signedUpAt: null, signedInAt: null, operator: false, sessions, ...overrides };
}

// Data through Oct 12; Oct 12 2026 is a Monday, so the weeks are Sep 28, Oct 5, Oct 12.
const now = at('2026-10-13T00:00:00Z');
const weekly: VisitorWindow = {
  landing: 'all', channel: 'all', device: 'all',
  cohortGrain: 'week', periodGrain: 'week', cohortCount: 3, periodCount: 3,
};

function report(visitors: Ga4Visitor[], window: VisitorWindow = weekly, membersFor: string | null = null) {
  return buildVisitorReport({ visitors, window, now, generatedAt: now, reportEnd: '2026-10-12', detail: 'GA4', membersFor });
}

const alice = visitor('alice', [
  session('2026-09-28T10:00:00Z', {
    landingPage: '/coast-fire-calculator', source: 'google', medium: 'cpc', channel: 'Paid', campaign: 'coast_fire',
    actions: { ...none, coast_fire_run: 2 },
  }),
  session('2026-10-06T09:00:00Z', { sessionNumber: 2, actions: { ...none, retirement_run: 1 } }),
], { signedUpAt: at('2026-10-06T12:00:00Z'), signedInAt: at('2026-10-06T12:01:00Z') });

// Late enough on the cohort's first day that his second week has ended too.
const bob = visitor('bob', [
  session('2026-09-28T20:00:00Z', {
    landingPage: '/retirement-calculator', source: 'google', medium: 'organic', channel: 'Organic Search', device: 'mobile',
    actions: { ...none, coffee_widget: 1 },
  }),
]);

const gail = visitor('gail', [
  session('2026-10-05T15:00:00Z', { landingPage: '/cash-flow-forecast', actions: { ...none, cash_flow_check: 1 } }),
], { signedInAt: at('2026-10-05T15:10:00Z') });

const everyone = [
  alice,
  bob,
  gail,
  visitor('operator', [session('2026-09-30T08:00:00Z')], { operator: true }),
  visitor('returning', [session('2026-10-06T08:00:00Z', { sessionNumber: 3 })]),
  visitor('bot', [session('2026-10-07T08:00:00Z', { quality: 'bot' })]),
  visitor('older', [session('2026-09-01T08:00:00Z'), session('2026-10-01T08:00:00Z', { sessionNumber: 2 })]),
  visitor('tomorrow', [session('2026-10-13T02:00:00Z')]),
];

describe('visitor cohorts', () => {
  it('groups browsers by their first visit and counts what they did before becoming an account', () => {
    const result = report(everyone, weekly, '2026-09-28');
    expect(result.cohorts.map(row => [row.key, row.size])).toEqual([['2026-09-28', 2], ['2026-10-05', 1], ['2026-10-12', 0]]);

    const [first, second] = result.cohorts;
    expect(first.totals).toEqual({
      actions: {
        coast_fire_run: { visitors: 1, count: 2 },
        retirement_run: { visitors: 1, count: 1 },
        cash_flow_check: { visitors: 0, count: 0 },
        coffee_widget: { visitors: 1, count: 1 },
      },
      anyAction: 2,
      returned: 1,
      signedUp: 1,
      signedIn: 0,
    });
    expect(second.totals.signedIn).toBe(1);
    expect(second.totals.actions.cash_flow_check).toEqual({ visitors: 1, count: 1 });
    // Only the cohort asked for lists its visitors.
    expect(result.membersFor).toBe('2026-09-28');
    expect(second.members).toEqual([]);

    // Signups first, then the most active.
    expect(first.members.map(member => member.visitorId)).toEqual(['alice', 'bob']);
    expect(first.members[0]).toMatchObject({
      landing: 'coast_fire_calculator', channel: 'Paid', campaign: 'coast_fire', sessionCount: 2,
      actions: { ...none, coast_fire_run: 2, retirement_run: 1 },
      outcome: 'signed_up', outcomeAt: '2026-10-06T12:00:00.000Z',
    });
    expect(first.members[0].sessions.map(s => s.startedAt)).toEqual(['2026-09-28T10:00:00.000Z', '2026-10-06T09:00:00.000Z']);
    expect(report(everyone, weekly, '2026-10-05').cohorts[1].members[0]).toMatchObject({ visitorId: 'gail', outcome: 'signed_in' });

    expect(result.excluded).toEqual({ operatorBrowsers: 1, automatedSessions: 1, seenBeforeWindow: 1 });
    expect(result.overall.size).toBe(3);
    expect(result.overall.totals.anyAction).toBe(3);
  });

  it('fills each column only once the period has ended, from each visitor’s own start', () => {
    const [first] = report(everyone).cohorts;
    // Alice's week 2 runs from Oct 5 10:00 to Oct 12 10:00; her week 3 is still in progress.
    expect(first.cells.any_action).toEqual([
      { rate: 1, count: 2, eligible: 2 },
      { rate: 0.5, count: 1, eligible: 2 },
      { rate: null, count: 0, eligible: 0 },
    ]);
    expect(first.cells.visited.map(c => c.rate)).toEqual([1, 0.5, null]);
    expect(first.cells.retirement_run.map(c => c.count)).toEqual([0, 1, 0]);
    expect(first.cells.coffee_widget.map(c => c.count)).toEqual([1, 0, 0]);
    // Signing up is cumulative: done by the end of the period.
    expect(first.cells.signed_up.map(c => c.count)).toEqual([0, 1, 0]);
  });

  it('adds cohort cells into the overall row', () => {
    const result = report(everyone);
    expect(result.overall.cells.visited[0]).toEqual({ rate: 1, count: 3, eligible: 3 });
    expect(result.overall.cells.cash_flow_check[0]).toEqual({ rate: 1 / 3, count: 1, eligible: 3 });
  });

  it('filters on the first session’s landing page, channel, campaign and device', () => {
    expect(report(everyone, { ...weekly, landing: 'coast_fire_calculator' }).overall.size).toBe(1);
    expect(report(everyone, { ...weekly, landing: 'cash_flow_forecast' }, '2026-10-05').cohorts[1].members[0].visitorId).toBe('gail');
    expect(report(everyone, { ...weekly, channel: 'organic_search' }, '2026-09-28').cohorts[0].members.map(m => m.visitorId)).toEqual(['bob']);
    expect(report(everyone, { ...weekly, channel: 'paid', campaign: 'coast_fire' }).overall.size).toBe(1);
    expect(report(everyone, { ...weekly, campaign: 'other' }).overall.size).toBe(0);
    expect(report(everyone, { ...weekly, device: 'mobile' }, '2026-09-28').cohorts[0].members.map(m => m.visitorId)).toEqual(['bob']);
  });

  it('lists the most active visitors but counts them all', () => {
    const crowd = Array.from({ length: VISITOR_MEMBER_LIMIT + 1 }, (_, index) =>
      visitor(`v${index}`, [session('2026-09-29T08:00:00Z', { actions: { ...none, coast_fire_run: index === 7 ? 1 : 0 } })]));
    const [first] = report(crowd, weekly, '2026-09-28').cohorts;
    expect(first.size).toBe(VISITOR_MEMBER_LIMIT + 1);
    expect(first.members).toHaveLength(VISITOR_MEMBER_LIMIT);
    expect(first.members[0].visitorId).toBe('v7');
  });

  it('ends on the last complete day, not the empty one the cutoff begins', () => {
    // Data through Oct 12: daily cohorts are Oct 10–12, and Oct 12's visitor is in the last one.
    const daily = report(everyone, { ...weekly, cohortGrain: 'day', periodGrain: 'day', cohortCount: 3 });
    expect(daily.cohorts.map(row => row.key)).toEqual(['2026-10-10', '2026-10-11', '2026-10-12']);
    const late = visitor('late', [session('2026-10-12T23:30:00Z')]);
    const withLate = report([late], { ...weekly, cohortGrain: 'day', periodGrain: 'day', cohortCount: 3 });
    expect(withLate.cohorts.map(row => row.size)).toEqual([0, 0, 1]);
    expect(visitorCohortStarts(now, { cohortGrain: 'week', cohortCount: 2 }).map(d => d.toISOString().slice(0, 10)))
      .toEqual(['2026-10-05', '2026-10-12']);
    // A cutoff on a Monday ends the weeks on the one just finished.
    expect(visitorCohortStarts(at('2026-10-12T00:00:00Z'), { cohortGrain: 'week', cohortCount: 1 })[0].toISOString().slice(0, 10))
      .toBe('2026-10-05');
  });

  it('groups landing pages the way the site labels them', () => {
    expect(landingFor('/coast-fire-calculator')).toBe('coast_fire_calculator');
    expect(landingFor('/retirement-calculator')).toBe('retirement_calculator');
    expect(landingFor('/retirement-calculator/continue')).toBe('retirement_calculator');
    expect(landingFor('/cash-flow-forecast')).toBe('cash_flow_forecast');
    expect(landingFor('/retirement-calculators')).toBe('other');
    expect(landingFor('/')).toBe('other');
  });
});

describe('GA4 visitor export', () => {
  it('counts each action before the account moment and flags operator browsers', () => {
    const query = buildVisitorQuery('project', 'dataset', { start: '2026-09-28', end: '2026-10-12' });
    expect(query).toContain("_TABLE_SUFFIX BETWEEN FORMAT_DATE('%Y%m%d', DATE_SUB(DATE '2026-09-28', INTERVAL 1 DAY))");
    expect(query).toContain("event_name = 'coast_fire_calculated' AND calculation_trigger = 'submitted' AND event_timestamp < account_at");
    expect(query).toContain("event_name = 'retirement_model_run' AND event_timestamp < account_at");
    expect(query).toContain("event_name = 'cash_flow_check_click'");
    expect(query).toContain("IN ('trycoast.me', 'www.trycoast.me')");
    expect(query).toContain("event_name = 'bmc_widget_opened'");
    expect(query).toContain("event_name = 'internal_browser_marked'");
    expect(query).toContain("r'^https?://[^/]+/admin(?:[/?#]|$)'");
    expect(query).toContain("r'^https?://[^/]+/app(?:[/?#]|$)'");
    expect(query).toContain('WHERE started_at < account_at');
    // One pass over the export: a CTE referenced twice is scanned twice.
    expect(query.match(/FROM raw\b/g)).toHaveLength(1);
    expect(query).toContain(`LIMIT ${VISITOR_CAP + 1}`);
  });

  it('reads a browser row and classifies each session as the marketing pages do', () => {
    const parsed = toVisitor({
      visitor_id: '123.456',
      signed_up_at: '1791800000000000',
      signed_in_at: null,
      operator_browser: '0',
      sessions: JSON.stringify([
        {
          id: '99', t: 1791700000000000, n: 1, lp: 'https://asklinc.com/coast-fire-calculator?utm_campaign=x', host: 'asklinc.com',
          src: null, med: null, cmp: 'coast_fire', ad: true, dev: 'mobile', br: 'Safari', os: 'iOS', ctry: 'United States',
          tt: null, dbg: false, pv: 3, eng: 41000, cf: 2, rr: 0, cc: 0, bmc: 1,
        },
        { id: '100', t: 1791750000000000, n: 2, lp: null, host: 'asklinc.com', dev: 'desktop', br: 'HeadlessChrome', os: 'Linux', pv: 1, eng: 0 },
      ]),
    });
    expect(parsed).toMatchObject({
      visitorId: '123.456',
      signedUpAt: new Date(1791800000000),
      signedInAt: null,
      operator: false,
    });
    expect(parsed?.sessions[0]).toMatchObject({
      sessionId: '99', sessionNumber: 1, landingPage: '/coast-fire-calculator',
      source: 'google', medium: 'cpc', channel: 'Paid', campaign: 'coast_fire', engagementSeconds: 41,
      actions: { coast_fire_run: 2, retirement_run: 0, cash_flow_check: 0, coffee_widget: 1 },
      quality: 'human',
    });
    expect(parsed?.sessions[1]).toMatchObject({ landingPage: '(not set)', quality: 'bot' });
    expect(toVisitor({ visitor_id: 'x', sessions: 'not json' })).toBeNull();
  });
});

describe('loading visitors', () => {
  const originalCredentials = process.env.GA4_BIGQUERY_SERVICE_ACCOUNT_JSON;
  const originalLag = process.env.GA4_REPORTING_LAG_DAYS;
  const originalFetch = global.fetch;

  beforeAll(() => {
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    process.env.GA4_BIGQUERY_SERVICE_ACCOUNT_JSON = JSON.stringify({
      client_email: 'analytics-reader@example.test',
      private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
      project_id: 'analytics-test',
    });
    delete process.env.GA4_REPORTING_LAG_DAYS;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    clearVisitorCache();
  });

  afterAll(() => {
    if (originalCredentials === undefined) delete process.env.GA4_BIGQUERY_SERVICE_ACCOUNT_JSON;
    else process.env.GA4_BIGQUERY_SERVICE_ACCOUNT_JSON = originalCredentials;
    if (originalLag === undefined) delete process.env.GA4_REPORTING_LAG_DAYS;
    else process.env.GA4_REPORTING_LAG_DAYS = originalLag;
  });

  const fields = ['visitor_id', 'signed_up_at', 'signed_in_at', 'operator_browser', 'sessions'].map(name => ({ name }));
  const row = (id: string) => ({ f: [
    { v: id }, { v: null }, { v: null }, { v: '0' },
    { v: JSON.stringify([{ id: '1', t: 1791700000000000, n: 1, lp: 'https://asklinc.com/', host: 'asklinc.com', dev: 'desktop', br: 'Chrome', os: 'Mac', pv: 2, eng: 9000 }]) },
  ] });

  function mockBigQuery(pages: Array<Record<string, unknown>>) {
    const urls: string[] = [];
    global.fetch = jest.fn(async (url: string) => {
      urls.push(String(url));
      if (String(url).includes('oauth2')) return { ok: true, status: 200, json: async () => ({ access_token: 'token', expires_in: 3600 }) };
      const page = pages.shift();
      return { ok: true, status: 200, json: async () => page };
    }) as unknown as typeof fetch;
    return urls;
  }

  it('reads every page of the result rather than only the first', async () => {
    const urls = mockBigQuery([
      { jobComplete: true, jobReference: { jobId: 'job-1' }, schema: { fields }, rows: [row('a')], pageToken: 'next', totalRows: '2' },
      // Later pages may omit schema; fields from the first complete page must still apply.
      { jobComplete: true, rows: [row('b')], totalRows: '2' },
    ]);
    const load = await loadGa4Visitors({ start: '2026-09-28', end: '2026-10-12' });
    expect(load.state).toBe('live');
    expect(load.truncated).toBe(false);
    expect(load.visitors.map(v => v.visitorId)).toEqual(['a', 'b']);
    expect(urls.some(url => url.includes('/queries/job-1?') && url.includes('pageToken=next'))).toBe(true);
  });

  it('says what is missing instead of reporting zero visitors', async () => {
    process.env.GA4_BIGQUERY_SERVICE_ACCOUNT_JSON = '';
    try {
      const load = await loadGa4Visitors({ start: '2026-09-28', end: '2026-10-12' });
      expect(load.state).toBe('needs_configuration');
      const result = await getVisitorReport(weekly);
      expect(result).toMatchObject({ kind: 'visitors', state: 'needs_configuration', cohorts: [] });
    } finally {
      const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
      process.env.GA4_BIGQUERY_SERVICE_ACCOUNT_JSON = JSON.stringify({
        client_email: 'analytics-reader@example.test',
        private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
        project_id: 'analytics-test',
      });
    }
  });

  it('reuses a scan across requests for the same window, and re-reads on refresh', async () => {
    mockBigQuery([
      { jobComplete: true, jobReference: { jobId: 'job-2' }, schema: { fields }, rows: [row('a')], totalRows: '1' },
      { jobComplete: true, jobReference: { jobId: 'job-3' }, schema: { fields }, rows: [row('a')], totalRows: '1' },
    ]);
    const first = await getVisitorReport(weekly);
    const second = await getVisitorReport({ ...weekly, periodGrain: 'day' });
    expect(first.state).toBe('live');
    expect(second.state).toBe('live');
    const queries = (global.fetch as jest.Mock).mock.calls.filter(([url]) => String(url).endsWith('/queries'));
    expect(queries).toHaveLength(1);
    await getVisitorReport(weekly, { fresh: true });
    expect((global.fetch as jest.Mock).mock.calls.filter(([url]) => String(url).endsWith('/queries'))).toHaveLength(2);
  });

  it('dates in-progress periods from the end of the last complete export day', () => {
    expect(visitorDataThrough('2026-10-12').toISOString()).toBe('2026-10-13T00:00:00.000Z');
  });
});
