import { generateKeyPairSync } from 'crypto';
import { loadGa4Sessions, parseFirstFullTrackingDate } from '../../marketing-analytics/adapters/ga4-bigquery';

describe('marketing funnel coverage date', () => {
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
    global.fetch = jest.fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ access_token: 'test-token', expires_in: 3600 }),
      })
      .mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ jobComplete: true, schema: { fields: [] }, rows: [], totalRows: '0' }),
      }) as jest.Mock;

    try {
      const withoutCoverage = await loadGa4Sessions({ days: 28, compare: true });
      expect(withoutCoverage.state).toBe('live');
      expect(withoutCoverage.reportingLagDays).toBe(1);
      expect(withoutCoverage.detail).toContain('1-day availability lag applied');
      expect(withoutCoverage.detail).toContain('late events for up to 3 days');
      expect(withoutCoverage.detail).toContain('strict trial attribution remains unavailable');

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
