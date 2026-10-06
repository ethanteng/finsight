import { Router } from 'express';
import { requireAuth } from '../auth/middleware';
import { getPrismaClient } from '../prisma-client';
import { pendingAdMilestones, recordVisibleAnswer } from '../services/product-milestones';
import { createFixedWindowRateLimit } from './fixed-window-rate-limit';

const router = Router();
router.use(requireAuth);
router.use(createFixedWindowRateLimit({
  limit: 60, trustedHops: 1, keyBy: req => req.user?.id,
}));
router.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });

router.post('/answer-viewed', async (req, res) => {
  const id = req.body?.conversationId;
  if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(id)) {
    return res.status(400).json({ error: 'A valid conversation is required' });
  }
  try {
    // No question, balance, email, or acquisition identifier leaves this endpoint.
    const recorded = await recordVisibleAnswer(req.user!.id, id);
    return res.json({ recorded });
  } catch {
    return res.status(503).json({ error: 'Measurement temporarily unavailable' });
  }
});

router.get('/pending', async (req, res) => {
  try {
    return res.json({ milestones: await pendingAdMilestones(req.user!.id) });
  } catch {
    return res.status(503).json({ error: 'Measurement temporarily unavailable' });
  }
});

router.post('/dispatch-attempted', async (req, res) => {
  const id = req.body?.milestoneId;
  if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(id)) {
    return res.status(400).json({ error: 'A valid milestone is required' });
  }
  try {
    await getPrismaClient().productMilestone.updateMany({
      where: { id, userId: req.user!.id, adDispatchAttemptedAt: null },
      data: { adDispatchAttemptedAt: new Date() },
    });
    return res.sendStatus(204);
  } catch {
    return res.sendStatus(503);
  }
});

export default router;
