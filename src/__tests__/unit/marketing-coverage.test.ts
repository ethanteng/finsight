import { parseFirstFullTrackingDate } from '../../marketing-analytics/adapters/ga4-bigquery';

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
});
