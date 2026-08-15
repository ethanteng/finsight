import express from 'express';
import request from 'supertest';
import aiPerformanceRoutes from '../../routes/ai-performance';

describe('AI performance route', () => {
  const originalAdminEmails = process.env.ADMIN_EMAILS;

  afterEach(() => {
    process.env.ADMIN_EMAILS = originalAdminEmails;
  });

  it('rejects unauthenticated requests', async () => {
    const app = express();
    app.use('/ai/performance', aiPerformanceRoutes);

    const response = await request(app).get('/ai/performance');

    expect(response.status).toBe(401);
  });

  it('returns metrics to an authenticated administrator', async () => {
    process.env.ADMIN_EMAILS = 'admin@example.com';
    const app = express();
    app.use((req: any, _res, next) => {
      req.user = { id: 'admin-1', email: 'admin@example.com', tier: 'premium' };
      next();
    });
    app.use('/ai/performance', aiPerformanceRoutes);

    const response = await request(app).get('/ai/performance');

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('stages');
    expect(response.body).toHaveProperty('quality');
  });
});
