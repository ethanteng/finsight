import { generateKeyPairSync } from 'crypto';
import { buildVisitorReport, landingFor, visitorCohortStarts, VISITOR_MEMBER_LIMIT } from '../../cohort-analytics/visitors';
import {
  buildVisitorQuery,
  coverageFromTables,
  loadGa4Visitors,
  scanParts,
  toVisitor,
  VISITOR_CAP,
  type Ga4Connection,
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
  const dailyOnly = { start: '2026-09-28', dailyEnd: '2026-10-12', streamingDays: [] };

  it('counts each action before the account moment and flags operator browsers', () => {
    const query = buildVisitorQuery('project', 'dataset', dailyOnly);
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

  it('reads daily tables through the newest one, from a day before the start', () => {
    const query = buildVisitorQuery('project', 'dataset', dailyOnly);
    expect(query).toContain('FROM `project.dataset.events_*`');
    expect(query).toContain("_TABLE_SUFFIX BETWEEN '20260927' AND '20261012'");
    expect(query).not.toContain('events_intraday_');
  });

  it('adds the streaming tables after the newest daily one', () => {
    const query = buildVisitorQuery('project', 'dataset', { ...dailyOnly, streamingDays: ['2026-10-13', '2026-10-14'] });
    expect(query).toContain("FROM `project.dataset.events_*`\n  WHERE _TABLE_SUFFIX BETWEEN '20260927' AND '20261012'");
    expect(query).toContain("UNION ALL\n  SELECT");
    expect(query).toContain("FROM `project.dataset.events_intraday_*`\n  WHERE _TABLE_SUFFIX BETWEEN '20261013' AND '20261014'");
  });

  it('reads only the tables a short window needs', () => {
    // A window starting after the daily export reads only streaming, from a day before the start.
    const today = scanParts('p', 'd', { start: '2026-10-14', dailyEnd: '2026-10-12', streamingDays: ['2026-10-13', '2026-10-14'] });
    expect(today).toHaveLength(1);
    expect(today[0]).toContain("events_intraday_*`\n  WHERE _TABLE_SUFFIX BETWEEN '20261013' AND '20261014'");
    expect(scanParts('p', 'd', { start: '2026-10-14', dailyEnd: null, streamingDays: [] })).toEqual([]);
  });

  it('finds the newest daily table and the streaming tables after it', () => {
    expect(coverageFromTables([
      'events_20261011', 'events_20261012', 'pseudonymous_users_20261012',
      // GA4 deletes a day's streaming table soon after its daily table lands.
      'events_intraday_20261012', 'events_intraday_20261014', 'events_intraday_20261013',
    ])).toEqual({ dailyEnd: '2026-10-12', streamingDays: ['2026-10-13', '2026-10-14'] });
    expect(coverageFromTables(['events_intraday_20261014'])).toEqual({ dailyEnd: null, streamingDays: ['2026-10-14'] });
    expect(coverageFromTables([])).toEqual({ dailyEnd: null, streamingDays: [] });
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

describe('where the data ends', () => {
  const requestedAt = at('2026-10-14T18:00:00Z');

  it('is the newest streamed event when there is one, never past the request', () => {
    expect(visitorDataThrough({ dailyEnd: '2026-10-12', streamedThrough: at('2026-10-14T17:42:00Z') }, requestedAt)?.toISOString())
      .toBe('2026-10-14T17:42:00.000Z');
    // A browser clock ahead of the server's does not move the cutoff into the future.
    expect(visitorDataThrough({ dailyEnd: '2026-10-12', streamedThrough: at('2026-10-14T19:00:00Z') }, requestedAt)?.toISOString())
      .toBe('2026-10-14T18:00:00.000Z');
  });

  it('is midnight UTC after the newest daily table without streaming, and nothing without either', () => {
    expect(visitorDataThrough({ dailyEnd: '2026-10-12', streamedThrough: null }, requestedAt)?.toISOString()).toBe('2026-10-13T00:00:00.000Z');
    expect(visitorDataThrough({ dailyEnd: null, streamedThrough: null }, requestedAt)).toBeNull();
  });
});

describe('loading visitors', () => {
  const originalCredentials = process.env.GA4_BIGQUERY_SERVICE_ACCOUNT_JSON;
  const originalLag = process.env.GA4_REPORTING_LAG_DAYS;
  const originalFetch = global.fetch;
  const connection: Ga4Connection = { projectId: 'p', datasetId: 'd', location: 'US', token: 't' };

  function useCredentials() {
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    process.env.GA4_BIGQUERY_SERVICE_ACCOUNT_JSON = JSON.stringify({
      client_email: 'analytics-reader@example.test',
      private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
      project_id: 'analytics-test',
    });
  }

  beforeAll(() => {
    useCredentials();
    delete process.env.GA4_REPORTING_LAG_DAYS;
  });

  beforeEach(() => {
    // 11am in Los Angeles: the reporting day is Oct 14, so a one-day lag means Oct 13.
    jest.useFakeTimers({ now: at('2026-10-14T18:00:00Z'), doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });
  });

  afterEach(() => {
    jest.useRealTimers();
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
  const row = (id: string, startedAt = at('2026-10-11T16:00:00Z')) => ({ f: [
    { v: id }, { v: null }, { v: null }, { v: '0' },
    { v: JSON.stringify([{ id: '1', t: startedAt.getTime() * 1000, n: 1, lp: 'https://asklinc.com/', host: 'asklinc.com', dev: 'desktop', br: 'Chrome', os: 'Mac', pv: 2, eng: 9000 }]) },
  ] });
  const result = (rows: unknown[], extra: Record<string, unknown> = {}) =>
    ({ jobComplete: true, jobReference: { jobId: 'job' }, schema: { fields }, rows, totalRows: String(rows.length), ...extra });

  interface Export {
    tables?: string[];
    tablesError?: string;
    newest?: string | null;
    pages?: Array<Record<string, unknown>>;
  }

  /** Answers like BigQuery: table listing, the newest-event query, and the visitor query's pages. */
  function mockBigQuery({ tables = [], tablesError, newest = null, pages = [] }: Export) {
    const calls: Array<{ url: string; query?: string }> = [];
    global.fetch = jest.fn(async (url: string, init?: { body?: string }) => {
      const target = String(url);
      let query: string | undefined;
      try {
        query = init?.body ? (JSON.parse(String(init.body)) as { query?: string }).query : undefined;
      } catch {
        query = undefined; // the OAuth token request is a form, not JSON
      }
      calls.push({ url: target, query });
      const reply = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body });
      if (target.includes('oauth2')) return reply({ access_token: 'token', expires_in: 3600 });
      if (target.includes('/tables?')) {
        return tablesError
          ? reply({ error: { message: tablesError } }, 403)
          : reply({ tables: tables.map(tableId => ({ tableReference: { tableId } })) });
      }
      if (query?.includes('MAX(event_timestamp)')) {
        return reply({ jobComplete: true, jobReference: { jobId: 'newest' }, schema: { fields: [{ name: 'newest' }] }, rows: [{ f: [{ v: newest }] }] });
      }
      return reply(pages.shift());
    }) as unknown as typeof fetch;
    return {
      calls,
      visitorQueries: () => calls.filter(call => call.query && !call.query.includes('MAX(event_timestamp)')),
      listings: () => calls.filter(call => call.url.includes('/tables?')),
    };
  }

  it('reads every page of the result rather than only the first', async () => {
    const { calls } = mockBigQuery({ pages: [
      result([row('a')], { pageToken: 'next', totalRows: '2' }),
      // Later pages may omit schema; fields from the first complete page must still apply.
      { jobComplete: true, rows: [row('b')], totalRows: '2' },
    ] });
    const load = await loadGa4Visitors(connection, { start: '2026-09-28', dailyEnd: '2026-10-12', streamingDays: [] });
    expect(load.state).toBe('live');
    expect(load.truncated).toBe(false);
    expect(load.visitors.map(v => v.visitorId)).toEqual(['a', 'b']);
    expect(calls.some(call => call.url.includes('/queries/job?') && call.url.includes('pageToken=next'))).toBe(true);
  });

  it('reads the streaming export after the daily one, up to its newest event', async () => {
    const { calls, visitorQueries } = mockBigQuery({
      tables: ['events_20261011', 'events_20261012', 'events_intraday_20261013', 'events_intraday_20261014'],
      newest: String(at('2026-10-14T17:42:00Z').getTime() * 1000),
      pages: [result([row('earlier'), row('today', at('2026-10-14T17:30:00Z'))])],
    });
    const report = await getVisitorReport({ ...weekly, cohortGrain: 'day', periodGrain: 'day', cohortCount: 3 });

    expect(report).toMatchObject({
      state: 'live',
      reportEnd: '2026-10-12',
      streamedThrough: '2026-10-14T17:42:00.000Z',
      dataThrough: '2026-10-14T17:42:00.000Z',
    });
    // Today is its own daily cohort, from streamed events.
    expect(report.cohorts.map(row => [row.key, row.size])).toEqual([['2026-10-12', 0], ['2026-10-13', 0], ['2026-10-14', 1]]);
    expect(report.detail).toContain('streaming export through 2026-10-14T17:42:00.000Z');
    expect(report.notes.some(note => note.includes('provisional'))).toBe(true);
    const [query] = visitorQueries();
    expect(query.query).toContain("events_intraday_*`\n  WHERE _TABLE_SUFFIX BETWEEN '20261013' AND '20261014'");
    const newest = calls.find(call => call.query?.includes('MAX(event_timestamp)'));
    expect(newest?.query).toContain("platform = 'WEB'");
    expect(newest?.query).toContain('user_pseudo_id IS NOT NULL');
  });

  it('reads the daily export alone when nothing has streamed', async () => {
    const { visitorQueries } = mockBigQuery({
      tables: ['events_20261012', 'events_intraday_20261013'],
      newest: null,
      pages: [result([row('a')])],
    });
    const report = await getVisitorReport(weekly);

    expect(report).toMatchObject({ state: 'live', reportEnd: '2026-10-12', streamedThrough: null, dataThrough: '2026-10-13T00:00:00.000Z' });
    expect(visitorQueries()[0].query).not.toContain('events_intraday_');
    expect(report.notes.some(note => note.includes('provisional'))).toBe(false);
    expect(report.detail).toContain('have no events yet');
    expect(report.detail).not.toContain('turn on streaming export');
  });

  it('does not report a streamed event later than the request', async () => {
    mockBigQuery({
      tables: ['events_20261012', 'events_intraday_20261014'],
      newest: String(at('2026-10-14T19:00:00Z').getTime() * 1000),
      pages: [result([row('a')])],
    });
    const report = await getVisitorReport(weekly);

    expect(report).toMatchObject({
      state: 'live',
      streamedThrough: '2026-10-14T18:00:00.000Z',
      dataThrough: '2026-10-14T18:00:00.000Z',
    });
    expect(report.detail).toContain('streaming export through 2026-10-14T18:00:00.000Z');
  });

  it('stops listing tables when BigQuery repeats a page token', async () => {
    let listings = 0;
    global.fetch = jest.fn(async (url: string, init?: { body?: string }) => {
      const target = String(url);
      const reply = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body });
      if (target.includes('oauth2')) return reply({ access_token: 'token', expires_in: 3600 });
      if (target.includes('/tables?')) {
        listings += 1;
        if (!target.includes('pageToken=')) {
          return reply({
            tables: [{ tableReference: { tableId: 'pseudonymous_users_20261012' } }],
            nextPageToken: 'again',
          });
        }
        return reply({
          tables: [{ tableReference: { tableId: 'events_20261012' } }],
          nextPageToken: 'again',
        });
      }
      let query: string | undefined;
      try {
        query = init?.body ? (JSON.parse(String(init.body)) as { query?: string }).query : undefined;
      } catch {
        query = undefined;
      }
      if (query?.includes('MAX(event_timestamp)')) {
        return reply({ jobComplete: true, schema: { fields: [{ name: 'newest' }] }, rows: [{ f: [{ v: null }] }] });
      }
      return reply(result([row('a')]));
    }) as unknown as typeof fetch;

    const report = await getVisitorReport(weekly);
    expect(listings).toBe(2);
    expect(report).toMatchObject({ state: 'live', reportEnd: '2026-10-12', streamedThrough: null });
  });

  it('says how to see same-day visits when the dataset has no streaming tables', async () => {
    mockBigQuery({ tables: ['events_20261012'], pages: [result([row('a')])] });
    const report = await getVisitorReport(weekly);

    expect(report.state).toBe('live');
    expect(report.detail).toContain('turn on streaming export in GA4');
  });

  it('falls back to the configured lag when the tables cannot be listed', async () => {
    const { visitorQueries } = mockBigQuery({ tablesError: 'Access Denied: bigquery.tables.list', pages: [result([row('a')])] });
    const report = await getVisitorReport(weekly);

    // Oct 14 in Los Angeles less the one-day lag.
    expect(report).toMatchObject({ state: 'live', reportEnd: '2026-10-13', streamedThrough: null, dataThrough: '2026-10-14T00:00:00.000Z' });
    expect(report.detail).toContain('could not be listed (Access Denied: bigquery.tables.list)');
    expect(visitorQueries()[0].query).not.toContain('events_intraday_');
  });

  it('says so when the export has no tables yet', async () => {
    const { visitorQueries } = mockBigQuery({ tables: [] });
    const report = await getVisitorReport(weekly);

    expect(report).toMatchObject({ state: 'needs_configuration', cohorts: [] });
    expect(report.detail).toContain('no export tables yet');
    expect(visitorQueries()).toHaveLength(0);
  });

  it('says what is missing instead of reporting zero visitors', async () => {
    process.env.GA4_BIGQUERY_SERVICE_ACCOUNT_JSON = '';
    try {
      const result = await getVisitorReport(weekly);
      expect(result).toMatchObject({ kind: 'visitors', state: 'needs_configuration', cohorts: [] });
    } finally {
      useCredentials();
    }
  });

  it('lists the tables again before reading a new scan, so a day GA4 has just moved to its daily table is not lost', async () => {
    const tables = ['events_20261012', 'events_intraday_20261013', 'events_intraday_20261014'];
    const { visitorQueries, listings } = mockBigQuery({
      tables,
      newest: String(at('2026-10-14T17:42:00Z').getTime() * 1000),
      pages: [result([row('a')]), result([row('a')])],
    });
    await getVisitorReport(weekly);
    expect(listings()).toHaveLength(1);

    // GA4 finishes Oct 13's daily table and deletes its streaming one.
    tables.splice(0, tables.length, 'events_20261012', 'events_20261013', 'events_intraday_20261014');
    const report = await getVisitorReport({ ...weekly, cohortCount: 6 });

    expect(listings()).toHaveLength(2);
    expect(report.reportEnd).toBe('2026-10-13');
    const latest = visitorQueries()[1].query ?? '';
    expect(latest).toContain("events_*`\n  WHERE _TABLE_SUFFIX BETWEEN '20260906' AND '20261013'");
    expect(latest).toContain("events_intraday_*`\n  WHERE _TABLE_SUFFIX BETWEEN '20261014' AND '20261014'");
  });

  it('reuses what it read across requests for the same window, and reads again on refresh', async () => {
    const { visitorQueries, listings } = mockBigQuery({
      tables: ['events_20261012'],
      pages: [result([row('a')]), result([row('a')])],
    });
    const first = await getVisitorReport(weekly);
    const second = await getVisitorReport({ ...weekly, periodGrain: 'day' });
    expect(first.state).toBe('live');
    expect(second.state).toBe('live');
    expect(listings()).toHaveLength(1);
    expect(visitorQueries()).toHaveLength(1);

    await getVisitorReport(weekly, { fresh: true });
    expect(listings()).toHaveLength(2);
    expect(visitorQueries()).toHaveLength(2);
  });
});
