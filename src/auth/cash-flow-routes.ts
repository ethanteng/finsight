import express from 'express';
import { requireAuth, type AuthenticatedRequest } from './middleware';
import { parseCashFlowQuery } from '../cash-flow/report-query';
import {
  PLANNED_EVENTS_PER_USER_LIMIT,
  validatePlannedEventInput,
} from '../cash-flow/planned-events';
import {
  countPlannedEvents,
  createPlannedEvent,
  deletePlannedEvent,
  getCashFlowReport,
  listPlannedEvents,
  updatePlannedEvent,
} from '../services/cash-flow-service';

/**
 * Cash flow (beta): history and forecast of cash in and out, plus the planned
 * events that feed the forecast. Every figure is computed by the engine in
 * src/cash-flow; nothing here or in the browser does arithmetic on it.
 */
const router = express.Router();

function eventId(req: AuthenticatedRequest): string {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  return typeof id === 'string' ? id : '';
}

router.get('/', requireAuth, async (req: AuthenticatedRequest, res) => {
  const parsed = parseCashFlowQuery(req.query as Record<string, unknown>);
  if (!parsed.ok) return res.status(400).json({ error: parsed.error });
  try {
    const report = await getCashFlowReport(req.user!.id, parsed.value);
    // Same contract as the Finances overview: no snapshot yet is an empty state, not an error.
    if (!report) return res.status(204).send();
    return res.json(report);
  } catch (error) {
    console.error('Failed to build cash flow report:', error);
    return res.status(500).json({ error: 'Failed to load cash flow' });
  }
});

router.get('/events', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    return res.json({ events: await listPlannedEvents(req.user!.id) });
  } catch (error) {
    console.error('Failed to list planned cash flow events:', error);
    return res.status(500).json({ error: 'Failed to load planned events' });
  }
});

router.post('/events', requireAuth, async (req: AuthenticatedRequest, res) => {
  const validation = validatePlannedEventInput(req.body);
  if (!validation.ok) return res.status(400).json({ error: validation.error });
  try {
    const userId = req.user!.id;
    if (await countPlannedEvents(userId) >= PLANNED_EVENTS_PER_USER_LIMIT) {
      return res.status(409).json({ error: `You can plan up to ${PLANNED_EVENTS_PER_USER_LIMIT} events` });
    }
    return res.status(201).json({ event: await createPlannedEvent(userId, validation.value) });
  } catch (error) {
    console.error('Failed to create planned cash flow event:', error);
    return res.status(500).json({ error: 'Failed to save the event' });
  }
});

router.put('/events/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
  const validation = validatePlannedEventInput(req.body);
  if (!validation.ok) return res.status(400).json({ error: validation.error });
  try {
    const event = await updatePlannedEvent(req.user!.id, eventId(req), validation.value);
    if (!event) return res.status(404).json({ error: 'Event not found' });
    return res.json({ event });
  } catch (error) {
    console.error('Failed to update planned cash flow event:', error);
    return res.status(500).json({ error: 'Failed to save the event' });
  }
});

router.delete('/events/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const deleted = await deletePlannedEvent(req.user!.id, eventId(req));
    if (!deleted) return res.status(404).json({ error: 'Event not found' });
    return res.status(204).send();
  } catch (error) {
    console.error('Failed to delete planned cash flow event:', error);
    return res.status(500).json({ error: 'Failed to delete the event' });
  }
});

export default router;
