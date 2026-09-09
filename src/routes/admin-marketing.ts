import { Router, type Request, type Response } from 'express';
import { adminAuth } from '../auth/middleware';
import { INTENT_COHORT_IDS, TRAFFIC_QUALITY_VALUES, type MarketingFilters } from '../marketing-analytics/types';
import { getMarketingDashboard } from '../marketing-analytics/service';

const router = Router();
router.use(adminAuth);

function optional(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

router.get('/', async (req: Request, res: Response) => {
  const days = Number(req.query.days || 28);
  if (![7, 28, 90].includes(days)) return res.status(400).json({ error: 'days must be 7, 28, or 90' });
  const visitorType = optional(req.query.visitorType);
  if (visitorType && visitorType !== 'new' && visitorType !== 'returning') {
    return res.status(400).json({ error: 'visitorType must be new or returning' });
  }
  const intent = optional(req.query.intent);
  if (intent && !INTENT_COHORT_IDS.includes(intent as MarketingFilters['intent'] & string)) {
    return res.status(400).json({ error: 'Unknown intent cohort' });
  }
  const trafficQuality = optional(req.query.trafficQuality);
  if (trafficQuality && !TRAFFIC_QUALITY_VALUES.includes(trafficQuality as MarketingFilters['trafficQuality'] & string)) {
    return res.status(400).json({ error: 'Unknown traffic-quality classification' });
  }
  const filters: MarketingFilters = {
    days: days as MarketingFilters['days'],
    compare: req.query.compare !== 'false',
    source: optional(req.query.source),
    channel: optional(req.query.channel),
    campaign: optional(req.query.campaign),
    landingPage: optional(req.query.landingPage),
    device: optional(req.query.device),
    visitorType: visitorType as MarketingFilters['visitorType'],
    trafficQuality: trafficQuality as MarketingFilters['trafficQuality'],
    includeExcluded: req.query.includeExcluded === 'true',
    intent: intent as MarketingFilters['intent'],
  };
  try {
    res.json(await getMarketingDashboard(filters));
  } catch (error) {
    console.error('Unable to build marketing dashboard:', error);
    res.status(500).json({ error: 'Unable to build the marketing dashboard' });
  }
});

export default router;
