import express from 'express';
import request from 'supertest';
import adminCohortRoutes from '../../routes/admin-cohorts';
import { getActivationReport, getEngagementReport } from '../../cohort-analytics/service';

jest.mock('../../cohort-analytics/service', () => ({
  getEngagementReport: jest.fn().mockResolvedValue({ kind: 'engagement' }),
  getActivationReport: jest.fn().mockResolvedValue({ kind: 'activation' }),
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
  });

  it('defaults to weekly trial cohorts with a rule in the column grain', async () => {
    const response = await request(adminApp()).get('/admin/cohorts/engagement?period=month');

    expect(response.status).toBe(200);
    expect(getEngagementReport).toHaveBeenCalledWith(
      { segment: 'trial', cohortGrain: 'week', periodGrain: 'month', cohortCount: 12, periodCount: 12 },
      { questions: 1, per: 'month' },
    );
  });

  it('passes every control through', async () => {
    const response = await request(adminApp())
      .get('/admin/cohorts/engagement?segment=paid&cohort=month&period=week&cohorts=6&periods=8&questions=3&per=day');

    expect(response.status).toBe(200);
    expect(getEngagementReport).toHaveBeenCalledWith(
      { segment: 'paid', cohortGrain: 'month', periodGrain: 'week', cohortCount: 6, periodCount: 8 },
      { questions: 3, per: 'day' },
    );
  });

  it.each([
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
      { segment: 'paid', cohortGrain: 'day', periodGrain: 'day', cohortCount: 30, periodCount: 14 },
    );
  });

  it('reports a failure without leaking it', async () => {
    (getActivationReport as jest.Mock).mockRejectedValueOnce(new Error('database down'));
    jest.spyOn(console, 'error').mockImplementation(() => undefined);

    const response = await request(adminApp()).get('/admin/cohorts/activation');

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: 'Unable to build the activation cohort report' });
  });
});
