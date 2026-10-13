import express from 'express';
import request from 'supertest';
import adminCohortRoutes from '../../routes/admin-cohorts';
import { getActivationReport, getEngagementReport } from '../../cohort-analytics/service';
import { getVisitorReport } from '../../cohort-analytics/visitor-service';

jest.mock('../../cohort-analytics/service', () => ({
  getEngagementReport: jest.fn().mockResolvedValue({ kind: 'engagement' }),
  getActivationReport: jest.fn().mockResolvedValue({ kind: 'activation' }),
}));
jest.mock('../../cohort-analytics/visitor-service', () => ({
  getVisitorReport: jest.fn().mockResolvedValue({ kind: 'visitors' }),
}));

describe('admin cohort routes', () => {
  const originalAdminEmails = process.env.ADMIN_EMAILS;

  afterEach(() => {
    process.env.ADMIN_EMAILS = originalAdminEmails;
  });

  function adminApp() {
    process.env.ADMIN_EMAILS = 'admin@example.com';
    const app = express();
    app.use((req: any, _res, next) => {
      req.user = { id: 'admin-1', email: 'admin@example.com', tier: 'premium' };
      next();
    });
    app.use('/admin/cohorts', adminCohortRoutes);
    return app;
  }

  it('rejects unauthenticated requests', async () => {
    const app = express();
    app.use('/admin/cohorts', adminCohortRoutes);

    expect((await request(app).get('/admin/cohorts/engagement')).status).toBe(401);
    expect((await request(app).get('/admin/cohorts/activation')).status).toBe(401);
    expect((await request(app).get('/admin/cohorts/visitors')).status).toBe(401);
    expect(getVisitorReport).not.toHaveBeenCalled();
  });

  it('defaults to weekly signup cohorts with a rule in the column grain', async () => {
    const response = await request(adminApp()).get('/admin/cohorts/engagement?period=month');

    expect(response.status).toBe(200);
    expect(getEngagementReport).toHaveBeenCalledWith(
      { segment: 'signup', cohortGrain: 'week', periodGrain: 'month', cohortCount: 12, periodCount: 12, source: 'all', channel: 'all', campaign: undefined },
      { questions: 1, per: 'month' },
    );
  });

  it('passes every control through', async () => {
    const response = await request(adminApp())
      .get('/admin/cohorts/engagement?segment=paid&cohort=month&period=week&cohorts=6&periods=8&questions=3&per=day&source=coast_fire_calculator&channel=google_ads&campaign=coast_fire');

    expect(response.status).toBe(200);
    expect(getEngagementReport).toHaveBeenCalledWith(
      { segment: 'paid', cohortGrain: 'month', periodGrain: 'week', cohortCount: 6, periodCount: 8, source: 'coast_fire_calculator', channel: 'google_ads', campaign: 'coast_fire' },
      { questions: 3, per: 'day' },
    );
  });

  it.each([
    ['source=other', 'source must be one of all, coast_fire_calculator, retirement_calculator, cash_flow_forecast, direct_or_unknown'],
    ['channel=facebook', 'channel must be one of all, google_ads'],
    ['segment=free', 'segment must be one of signup, trial, paid'],
    ['cohort=year', 'cohort must be one of day, week, month'],
    ['periods=0', 'periods must be a whole number from 1 to 90'],
    ['cohorts=2.5', 'cohorts must be a whole number from 1 to 90'],
    ['questions=101', 'questions must be a whole number from 1 to 100'],
    ['per=hour', 'per must be one of day, week, month'],
  ])('rejects %s', async (query, error) => {
    const response = await request(adminApp()).get(`/admin/cohorts/engagement?${query}`);

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error });
    expect(getEngagementReport).not.toHaveBeenCalled();
  });

  it('serves activation with the same window controls', async () => {
    const response = await request(adminApp()).get('/admin/cohorts/activation?segment=paid&cohort=day&period=day&cohorts=30&periods=14');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ kind: 'activation' });
    expect(getActivationReport).toHaveBeenCalledWith(
      { segment: 'paid', cohortGrain: 'day', periodGrain: 'day', cohortCount: 30, periodCount: 14, source: 'all', channel: 'all', campaign: undefined },
    );
  });

  it('serves visitors with their own filters, defaulting to weekly cohorts of everyone', async () => {
    const response = await request(adminApp()).get('/admin/cohorts/visitors');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ kind: 'visitors' });
    expect(getVisitorReport).toHaveBeenCalledWith(
      { landing: 'all', channel: 'all', campaign: undefined, device: 'all', cohortGrain: 'week', periodGrain: 'week', cohortCount: 12, periodCount: 12 },
      { fresh: false, membersFor: null },
    );
  });

  it('passes every visitor control through, and refresh re-reads the export', async () => {
    const response = await request(adminApp())
      .get('/admin/cohorts/visitors?landing=coast_fire_calculator&channel=paid&campaign=%20coast_fire%20&device=mobile&cohort=day&period=day&cohorts=14&periods=7&refresh=1&members=2026-10-05');

    expect(response.status).toBe(200);
    expect(getVisitorReport).toHaveBeenCalledWith(
      { landing: 'coast_fire_calculator', channel: 'paid', campaign: 'coast_fire', device: 'mobile', cohortGrain: 'day', periodGrain: 'day', cohortCount: 14, periodCount: 7 },
      { fresh: true, membersFor: '2026-10-05' },
    );
  });

  it.each([
    ['landing=blog', 'landing must be one of all, coast_fire_calculator, retirement_calculator, cash_flow_forecast, other'],
    ['channel=google_ads', 'channel must be one of all, paid, organic_search, organic_social, direct, referral, other'],
    ['device=watch', 'device must be one of all, desktop, mobile, tablet'],
    ['cohorts=91', 'cohorts must be a whole number from 1 to 90'],
    ['members=last-week', 'members must be a cohort key (YYYY-MM-DD)'],
  ])('rejects visitors %s', async (query, error) => {
    (getVisitorReport as jest.Mock).mockClear();
    const response = await request(adminApp()).get(`/admin/cohorts/visitors?${query}`);

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error });
    expect(getVisitorReport).not.toHaveBeenCalled();
  });

  it('reports a failure without leaking it', async () => {
    (getActivationReport as jest.Mock).mockRejectedValueOnce(new Error('database down'));
    jest.spyOn(console, 'error').mockImplementation(() => undefined);

    const response = await request(adminApp()).get('/admin/cohorts/activation');

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: 'Unable to build the activation cohort report' });
  });
});
