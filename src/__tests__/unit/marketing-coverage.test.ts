import { generateKeyPairSync } from 'crypto';
import { buildQuery, loadGa4Sessions, parseFirstFullTrackingDate } from '../../marketing-analytics/adapters/ga4-bigquery';

describe('marketing funnel coverage date', () => {
  it('collects v2 handoffs and skipped verification, preserves method and email attribution, and guards paid signups', () => {
    const sql = buildQuery('test-project', 'analytics_123', {
      start: '2026-09-17', end: '2026-09-23', previousStart: '2026-09-10', previousEnd: '2026-09-16',
    });
    expect(sql).toContain("event_name = 'trial_signup_completed' AND signup_flow = 'free_trial'");
    expect(sql).toContain("event_name = 'trial_verify_skipped' AND signup_flow = 'free_trial'");
    expect(sql).toContain("key = 'completion_method'");
    expect(sql).toContain("completion_method = 'email_link'");
    expect(sql).toContain("signup_origin = 'retirement_calculator' AND signup_entry = 'results_email'");
    expect(sql).toContain("signup_origin = 'coast_fire_calculator' AND signup_entry = 'results_email'");
    expect(sql).toContain("calculation_trigger = 'submitted'");
    for (const calculator of ['retirement', 'coast_fire']) {
      expect(sql).toContain(`event_name = 'sign_up' AND signup_flow = 'free_trial' AND signup_origin = '${calculator}_calculator' AND signup_entry = 'results_page'`);
      expect(sql).toContain(`event_name = 'calculator_run_limit_reached' AND calculator_type = '${calculator}'`);
      expect(sql).toContain(`AS count_${calculator}_page_cta_opened`);
      expect(sql).toContain(`AS count_${calculator}_page_trial_complete`);
    }
    expect(sql).not.toContain("COUNTIF(event_name = 'trial_login_success' AND signup_origin");
  });
  it('leaves coverage unset until a full day has been verified', () => {
    expect(parseFirstFullTrackingDate(undefined)).toEqual({ date: null, error: null });
    expect(parseFirstFullTrackingDate('   ')).toEqual({ date: null, error: null });
  });

  it('accepts and trims an ISO calendar date', () => {
    expect(parseFirstFullTrackingDate(' 2026-09-10 ')).toEqual({
      date: '2026-09-10',
      error: null,
    });
  });

  it('rejects ambiguous or impossible dates', () => {
    expect(parseFirstFullTrackingDate('09/10/2026')).toEqual({
      date: null,
      error: 'GA4_FIRST_FULL_TRACKING_DATE must use YYYY-MM-DD.',
    });
    expect(parseFirstFullTrackingDate('2026-02-30')).toEqual({
      date: null,
      error: 'GA4_FIRST_FULL_TRACKING_DATE must be a real calendar date.',
    });
  });

  it('loads ordinary GA4 sessions before strict-funnel coverage is available', async () => {
    const originalCredentials = process.env.GA4_BIGQUERY_SERVICE_ACCOUNT_JSON;
    const originalCoverage = process.env.GA4_FIRST_FULL_TRACKING_DATE;
    const originalReportingLag = process.env.GA4_REPORTING_LAG_DAYS;
    const originalFetch = global.fetch;
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    process.env.GA4_BIGQUERY_SERVICE_ACCOUNT_JSON = JSON.stringify({
      client_email: 'analytics-reader@example.test',
      private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
      project_id: 'analytics-test',
    });
    delete process.env.GA4_FIRST_FULL_TRACKING_DATE;
    delete process.env.GA4_REPORTING_LAG_DAYS;
    const exportedRow: Record<string, string> = {
      user_pseudo_id: 'visitor', session_id: '123', session_date: '2026-09-17',
      hostname: 'asklinc.com', device: 'mobile', browser: 'Safari',
      landing_page: 'https://asklinc.com/retirement-calculator',
      count_retirement_page_cta_opened: '1', count_retirement_page_account_created: '1',
      count_retirement_page_trial_complete: '1', count_retirement_run_limit_reached: '2',
      first_retirement_run_limit_reached: '100', first_retirement_account_created: '200',
      count_coast_fire_email_cta_opened: '1', count_coast_fire_email_trial_complete: '1',
    };
    global.fetch = jest.fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ access_token: 'test-token', expires_in: 3600 }),
      })
      .mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          jobComplete: true,
          schema: { fields: Object.keys(exportedRow).map(name => ({ name })) },
          rows: [{ f: Object.values(exportedRow).map(v => ({ v })) }], totalRows: '1',
        }),
      }) as jest.Mock;

    try {
      const withoutCoverage = await loadGa4Sessions({ days: 28, compare: true });
      expect(withoutCoverage.state).toBe('live');
      expect(withoutCoverage.reportingLagDays).toBe(1);
      expect(withoutCoverage.detail).toContain('1-day availability lag applied');
      expect(withoutCoverage.detail).toContain('late events for up to 3 days');
      expect(withoutCoverage.detail).toContain('strict trial attribution remains unavailable');
      expect(withoutCoverage.sessions[0].eventCounts).toMatchObject({
        retirement_page_cta_opened: 1, retirement_page_account_created: 1,
        retirement_page_trial_complete: 1, retirement_run_limit_reached: 2,
        coast_fire_page_cta_opened: 0, coast_fire_page_account_created: 0,
        coast_fire_email_cta_opened: 1, coast_fire_email_trial_complete: 1,
      });
      expect(withoutCoverage.sessions[0].firstEventAt).toMatchObject({
        retirement_run_limit_reached: 100, retirement_account_created: 200,
      });
      expect(withoutCoverage.sessions[0].firstEventAt.coast_fire_account_created).toBeUndefined();

      process.env.GA4_FIRST_FULL_TRACKING_DATE = '2999-01-01';
      const beforeCoverage = await loadGa4Sessions({ days: 28, compare: true });
      expect(beforeCoverage.state).toBe('live');
      expect(beforeCoverage.detail).toContain('strict trial attribution begins once');

      process.env.GA4_FIRST_FULL_TRACKING_DATE = 'not-a-date';
      const invalidCoverage = await loadGa4Sessions({ days: 28, compare: true });
      expect(invalidCoverage.state).toBe('live');
      expect(invalidCoverage.firstFullTrackingDate).toBeNull();
      expect(invalidCoverage.detail).toContain('GA4_FIRST_FULL_TRACKING_DATE must use YYYY-MM-DD');
    } finally {
      if (originalCredentials === undefined) delete process.env.GA4_BIGQUERY_SERVICE_ACCOUNT_JSON;
      else process.env.GA4_BIGQUERY_SERVICE_ACCOUNT_JSON = originalCredentials;
      if (originalCoverage === undefined) delete process.env.GA4_FIRST_FULL_TRACKING_DATE;
      else process.env.GA4_FIRST_FULL_TRACKING_DATE = originalCoverage;
      if (originalReportingLag === undefined) delete process.env.GA4_REPORTING_LAG_DAYS;
      else process.env.GA4_REPORTING_LAG_DAYS = originalReportingLag;
      global.fetch = originalFetch;
    }
  });
});
