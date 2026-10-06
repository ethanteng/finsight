import { Router, type Request, type Response } from 'express';
import { adminAuth } from '../auth/middleware';
import { getActivationReport, getEngagementReport } from '../cohort-analytics/service';
import {
  COHORT_GRAINS,
  COHORT_SEGMENTS,
  type CohortGrain,
  type CohortSegment,
  type CohortWindow,
  type EngagementRule,
} from '../cohort-analytics/types';

const router = Router();
router.use(adminAuth);

const MAX_COHORTS = 90;
const MAX_PERIODS = 90;
const MAX_QUESTIONS = 100;

class InvalidParameter extends Error {}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T, name: string): T {
  if (value === undefined || value === '') return fallback;
  if (typeof value === 'string' && (allowed as readonly string[]).includes(value)) return value as T;
  throw new InvalidParameter(`${name} must be one of ${allowed.join(', ')}`);
}

function wholeNumber(value: unknown, fallback: number, max: number, name: string): number {
  if (value === undefined || value === '') return fallback;
  const parsed = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : NaN;
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > max) {
    throw new InvalidParameter(`${name} must be a whole number from 1 to ${max}`);
  }
  return parsed;
}

function parseWindow(query: Request['query']): CohortWindow {
  if (query.campaign !== undefined && (typeof query.campaign !== 'string' || query.campaign.length > 256)) {
    throw new InvalidParameter('campaign must be at most 256 characters');
  }
  return {
    source: oneOf(query.source, ['all', 'coast_fire_calculator', 'retirement_calculator', 'cash_flow_forecast', 'direct_or_unknown'] as const, 'all', 'source'),
    channel: oneOf(query.channel, ['all', 'google_ads'] as const, 'all', 'channel'),
    campaign: typeof query.campaign === 'string' ? query.campaign.trim() : undefined,
    segment: oneOf<CohortSegment>(query.segment, COHORT_SEGMENTS, 'signup', 'segment'),
    cohortGrain: oneOf<CohortGrain>(query.cohort, COHORT_GRAINS, 'week', 'cohort'),
    periodGrain: oneOf<CohortGrain>(query.period, COHORT_GRAINS, 'week', 'period'),
    cohortCount: wholeNumber(query.cohorts, 12, MAX_COHORTS, 'cohorts'),
    periodCount: wholeNumber(query.periods, 12, MAX_PERIODS, 'periods'),
  };
}

function handle(build: (query: Request['query']) => Promise<unknown>, label: string) {
  return async (req: Request, res: Response) => {
    let report: unknown;
    try {
      report = await build(req.query);
    } catch (error) {
      if (error instanceof InvalidParameter) return res.status(400).json({ error: error.message });
      console.error(`Unable to build the ${label} cohort report:`, error);
      return res.status(500).json({ error: `Unable to build the ${label} cohort report` });
    }
    res.json(report);
  };
}

router.get('/engagement', handle(query => {
  const window = parseWindow(query);
  const rule: EngagementRule = {
    questions: wholeNumber(query.questions, 1, MAX_QUESTIONS, 'questions'),
    per: oneOf<CohortGrain>(query.per, COHORT_GRAINS, window.periodGrain, 'per'),
  };
  return getEngagementReport(window, rule);
}, 'engagement'));

router.get('/activation', handle(query => getActivationReport(parseWindow(query)), 'activation'));

export default router;
