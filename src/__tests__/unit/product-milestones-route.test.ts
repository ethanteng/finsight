import express from 'express';
import request from 'supertest';
import router from '../../routes/product-milestones';
import { pendingAdMilestones, recordVisibleAnswer } from '../../services/product-milestones';
import { getPrismaClient } from '../../prisma-client';

jest.mock('../../prisma-client', () => ({ getPrismaClient: jest.fn() }));
jest.mock('../../services/product-milestones', () => ({
  pendingAdMilestones: jest.fn(), recordVisibleAnswer: jest.fn(),
}));
jest.mock('../../auth/middleware', () => ({
  requireAuth: (req: any, res: any, next: any) => req.user ? next() : res.sendStatus(401),
}));
const updateMany = jest.fn().mockResolvedValue({ count: 1 });
function app(auth = true) {
  const server = express();
  server.use(express.json());
  if (auth) server.use((req: any, _res, next) => { req.user = { id: 'owner' }; next(); });
  server.use('/milestones', router);
  return server;
}
beforeEach(() => {
  (getPrismaClient as jest.Mock).mockReturnValue({ productMilestone: { updateMany } });
});
it('requires authentication on every endpoint', async () => {
  expect((await request(app(false)).get('/milestones/pending')).status).toBe(401);
  expect((await request(app(false)).post('/milestones/answer-viewed').send({ conversationId: 'c1' })).status).toBe(401);
  expect((await request(app(false)).post('/milestones/dispatch-attempted').send({ milestoneId: 'm1' })).status).toBe(401);
});
it('validates identifiers and derives ownership from authentication', async () => {
  expect((await request(app()).post('/milestones/answer-viewed').send({ conversationId: '../private' })).status).toBe(400);
  (recordVisibleAnswer as jest.Mock).mockResolvedValue(true);
  const response = await request(app()).post('/milestones/answer-viewed').send({ conversationId: 'c1', userId: 'other', success: true });
  expect(response.status).toBe(200);
  expect(response.headers['cache-control']).toBe('no-store');
  expect(recordVisibleAnswer).toHaveBeenCalledWith('owner', 'c1');
});
it('acknowledges only the authenticated users unacknowledged milestone', async () => {
  const response = await request(app()).post('/milestones/dispatch-attempted').send({ milestoneId: 'm1', userId: 'other' });
  expect(response.status).toBe(204);
  expect(updateMany).toHaveBeenCalledWith({
    where: { id: 'm1', userId: 'owner', adDispatchAttemptedAt: null },
    data: { adDispatchAttemptedAt: expect.any(Date) },
  });
});
it('does not expose storage errors or private context', async () => {
  (pendingAdMilestones as jest.Mock).mockRejectedValue(new Error('private connection details'));
  const response = await request(app()).get('/milestones/pending');
  expect(response.status).toBe(503);
  expect(response.body).toEqual({ error: 'Measurement temporarily unavailable' });
});
