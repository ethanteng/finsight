import express from 'express';
import { requireAuth, type AuthenticatedRequest } from './middleware';
import {
  FORECAST_ADJUSTMENTS_PER_USER_LIMIT,
  validateForecastAdjustmentInput,
} from '../cash-flow/adjustments';
import { forecastAdjustmentTarget } from '../cash-flow/forecast';
import { parseCashFlowQuery } from '../cash-flow/report-query';
import {
  PLANNED_EVENTS_PER_USER_LIMIT,
  validatePlannedEventInput,
} from '../cash-flow/planned-events';
import {
  createPlannedEventWithinLimit,
  deleteForecastAdjustment,
  deletePlannedEvent,
  getCashFlowReport,
  getExpectedMonthly,
  isUserCreditCard,
  listPlannedEvents,
  loadCashFlowModel,
  saveForecastAdjustmentWithinLimit,
  updatePlannedEvent,
} from '../services/cash-flow-service';
import type { PlannedEventInput } from '../cash-flow/planned-events';

/**
 * Cash flow (beta): history and forecast of cash in and out, plus the planned
 * events that feed the forecast. Every figure is computed by the engine in
 * src/cash-flow; nothing here or in the browser does arithmetic on it.
 */
const router = express.Router();

const CARD_NOT_FOUND = 'Choose one of your connected credit cards';

/** A card payment must name one of the user's own connected cards. */
async function cardIsTheUsers(userId: string, input: PlannedEventInput): Promise<boolean> {
  return input.kind !== 'card_payment' || (input.accountId !== null && await isUserCreditCard(userId, input.accountId));
}

function routeId(req: AuthenticatedRequest): string {
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

// The month the forecast expects, which the Finances page shows as monthly
// income and expenses. Built by the same engine as the report above.
router.get('/expected-monthly', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const expected = await getExpectedMonthly(req.user!.id);
    if (!expected) return res.status(204).send();
    return res.json(expected);
  } catch (error) {
    console.error('Failed to build expected monthly cash flow:', error);
    return res.status(500).json({ error: 'Failed to load your expected month' });
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
    if (!await cardIsTheUsers(req.user!.id, validation.value)) return res.status(400).json({ error: CARD_NOT_FOUND });
    const event = await createPlannedEventWithinLimit(req.user!.id, validation.value, PLANNED_EVENTS_PER_USER_LIMIT);
    if (!event) {
      return res.status(409).json({ error: `You can plan up to ${PLANNED_EVENTS_PER_USER_LIMIT} events` });
    }
    return res.status(201).json({ event });
  } catch (error) {
    console.error('Failed to create planned cash flow event:', error);
    return res.status(500).json({ error: 'Failed to save the event' });
  }
});

router.put('/events/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
  const validation = validatePlannedEventInput(req.body);
  if (!validation.ok) return res.status(400).json({ error: validation.error });
  try {
    if (!await cardIsTheUsers(req.user!.id, validation.value)) return res.status(400).json({ error: CARD_NOT_FOUND });
    const event = await updatePlannedEvent(req.user!.id, routeId(req), validation.value);
    if (!event) return res.status(404).json({ error: 'Event not found' });
    return res.json({ event });
  } catch (error) {
    console.error('Failed to update planned cash flow event:', error);
    return res.status(500).json({ error: 'Failed to save the event' });
  }
});

router.delete('/events/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const deleted = await deletePlannedEvent(req.user!.id, routeId(req));
    if (!deleted) return res.status(404).json({ error: 'Event not found' });
    return res.status(204).send();
  } catch (error) {
    console.error('Failed to delete planned cash flow event:', error);
    return res.status(500).json({ error: 'Failed to delete the event' });
  }
});

// Adjustments: the user's choices about what the forecast counts. The item a
// choice names must be in the user's own data, and the server labels it from
// there; a repeat of a saved choice returns the one already saved.
const NOT_IN_FORECAST = 'That isn’t in your forecast anymore. Reload the page and try again.';

router.post('/adjustments', requireAuth, async (req: AuthenticatedRequest, res) => {
  const validation = validateForecastAdjustmentInput(req.body);
  if (!validation.ok) return res.status(400).json({ error: validation.error });
  const input = validation.value;
  try {
    const loaded = await loadCashFlowModel(req.user!.id);
    if (!loaded) return res.status(404).json({ error: NOT_IN_FORECAST });
    const saved = loaded.model.adjustments.find(adjustment =>
      adjustment.kind === input.kind && adjustment.flow === input.flow && adjustment.key === input.key);
    if (saved) return res.json({ adjustment: saved });
    const target = forecastAdjustmentTarget(loaded.model, input);
    if (!target) return res.status(404).json({ error: NOT_IN_FORECAST });
    const result = await saveForecastAdjustmentWithinLimit(req.user!.id, input, target.label, FORECAST_ADJUSTMENTS_PER_USER_LIMIT);
    if (!result) {
      return res.status(409).json({ error: `You can make up to ${FORECAST_ADJUSTMENTS_PER_USER_LIMIT} changes to the forecast` });
    }
    return res.status(result.created ? 201 : 200).json({ adjustment: result.adjustment });
  } catch (error) {
    console.error('Failed to save cash flow forecast adjustment:', error);
    return res.status(500).json({ error: 'Failed to save the change' });
  }
});

router.delete('/adjustments/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const deleted = await deleteForecastAdjustment(req.user!.id, routeId(req));
    if (!deleted) return res.status(404).json({ error: 'Change not found' });
    return res.status(204).send();
  } catch (error) {
    console.error('Failed to delete cash flow forecast adjustment:', error);
    return res.status(500).json({ error: 'Failed to undo the change' });
  }
});

export default router;
