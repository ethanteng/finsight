import { Router } from 'express';
import { getLlmMetricsSnapshot } from '../observability/llm-metrics';
import { adminAuth } from '../auth/middleware';

const router = Router();

router.get('/', adminAuth, (_req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    note: 'Metrics are process-local and reset on deployment.',
    ...getLlmMetricsSnapshot(),
  });
});

export default router;
