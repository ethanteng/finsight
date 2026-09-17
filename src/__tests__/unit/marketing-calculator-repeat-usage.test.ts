import { buildCalculatorRepeatUsage } from '../../marketing-analytics/calculator-repeat-usage';
import type { AnalyticsSession } from '../../marketing-analytics/types';

// Session identity is grouped by visitor + session id in the BigQuery adapter.
function session(id: string, device: string, retirement: number, coast: number, cta = 0): AnalyticsSession {
  return { id, userId: 'same-user', device, sessionDate: '2026-09-15',
    acquisition: { source: 'google', medium: 'organic', channel: 'Organic Search',
      campaign: '', landingPage: '/', searchTerm: '', creative: '', adId: '', referrer: '' },
    hostname: 'asklinc.com', browser: 'Chrome', operatingSystem: '', country: '', region: '', city: '',
    visitorType: 'returning', trafficQuality: 'human', exclusionReasons: [],
    engaged: true, engagementSeconds: 60, pageViews: 1, eventCount: 20, scrollEvents: 0,
    firstEventAt: {}, eventCounts: {
    retirement_model_run: retirement, coast_fire_calculated: coast,
    start_free_click: cta, retirement_model_clicked: 15, retirement_api_error: 3,
  } };
}

describe('calculator repeat usage', () => {
  const sessions = [
    session('u.1', 'mobile', 1, 0, 1),
    session('u.2', 'mobile', 2, 1),
    session('u.3', 'desktop', 3, 2, 4),
    session('u.4', 'desktop', 5, 0),
    session('u.5', 'tablet', 0, 4, 1),
    session('u.6', 'mobile', 0, 0, 2),
  ];
  it('uses successful runs per session, not per user or clicks, and keeps 4+ as a bucket', () => {
    const result = buildCalculatorRepeatUsage(sessions, true);
    expect(result.rows.find(r => r.calculator === 'retirement' && r.device === 'all')).toEqual({
      calculator: 'retirement', device: 'all', sessions: 4, runs: 11,
      repeatSessions: 3, repeatRate: .75, averageRuns: 2.75,
      distribution: [1, 1, 1, 1], singleRunCtaSessions: 1, repeatRunCtaSessions: 1,
      singleRunCtaRate: 1, repeatRunCtaRate: 1 / 3,
      limitReachedSessions: 0, accountsAfterLimitSessions: 0,
    });
  });
  it('splits devices and allows the same session to use both calculators', () => {
    const result = buildCalculatorRepeatUsage(sessions, true);
    expect(result.rows.find(r => r.calculator === 'retirement' && r.device === 'mobile'))
      .toMatchObject({ sessions: 2, runs: 3, repeatRate: .5, distribution: [1, 1, 0, 0] });
    expect(result.rows.find(r => r.calculator === 'coast_fire' && r.device === 'all'))
      .toMatchObject({ sessions: 3, runs: 7, distribution: [1, 1, 0, 1], repeatRunCtaRate: 1 });
    expect(result.bothCalculators).toEqual([
      { device: 'all', sessions: 2 }, { device: 'desktop', sessions: 1 },
      { device: 'mobile', sessions: 1 }, { device: 'tablet', sessions: 0 },
    ]);
  });
  it('uses null rates for empty denominators and excludes failed-only sessions', () => {
    const result = buildCalculatorRepeatUsage([session('u.1', 'mobile', 0, 0)], true);
    expect(result.rows).toHaveLength(6);
    for (const row of result.rows) expect(row).toMatchObject({
      sessions: 0, runs: 0, repeatRate: null, averageRuns: null,
      singleRunCtaRate: null, repeatRunCtaRate: null, distribution: [0, 0, 0, 0],
    });
  });
  it('does not turn unavailable or truncated exports into zero usage', () => {
    expect(buildCalculatorRepeatUsage(sessions, false)).toMatchObject({
      state: 'unavailable', rows: [], bothCalculators: [],
    });
  });

  it('counts restored locks without runs, once per session, with ordered calculator-specific accounts', () => {
    const restored = session('restored', 'mobile', 0, 0);
    restored.eventCounts.retirement_run_limit_reached = 2;
    restored.firstEventAt = { retirement_run_limit_reached: 10, retirement_account_created: 20 };
    const earlierAccount = session('earlier', 'desktop', 3, 0);
    earlierAccount.eventCounts.retirement_run_limit_reached = 1;
    earlierAccount.firstEventAt = { retirement_run_limit_reached: 20, retirement_account_created: 10 };
    const report = buildCalculatorRepeatUsage([restored, earlierAccount], true);
    expect(report.rows.find(r => r.calculator === 'retirement' && r.device === 'all'))
      .toMatchObject({ sessions: 1, limitReachedSessions: 2, accountsAfterLimitSessions: 1 });
    expect(report.rows.find(r => r.calculator === 'retirement' && r.device === 'mobile'))
      .toMatchObject({ sessions: 0, limitReachedSessions: 1, accountsAfterLimitSessions: 1 });
    expect(report.rows.find(r => r.calculator === 'coast_fire' && r.device === 'all'))
      .toMatchObject({ limitReachedSessions: 0, accountsAfterLimitSessions: 0 });
  });
});
