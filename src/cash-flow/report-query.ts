import { daysBetween, isCalendarDate } from './calendar';
import type { CashFlowReportRequest } from './forecast';
import { isCashFlowGranularity } from './periods';

export const DEFAULT_HORIZON_MONTHS = 6;
export const MAX_HORIZON_MONTHS = 12;
/** A custom range may span at most about three years. */
export const MAX_CUSTOM_RANGE_DAYS = 1100;
const EARLIEST_DATE = '2000-01-01';

export type CashFlowQueryResult =
  | { ok: true; value: CashFlowReportRequest }
  | { ok: false; error: string };

function single(value: unknown): string | undefined {
  if (Array.isArray(value)) return single(value[0]);
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

/** Parse `GET /api/cash-flow` query parameters into an engine request. */
export function parseCashFlowQuery(query: Record<string, unknown>): CashFlowQueryResult {
  const granularity = single(query.granularity) ?? 'month';
  if (!isCashFlowGranularity(granularity)) {
    return { ok: false, error: 'granularity must be week, month, quarter or year' };
  }

  const rawHorizon = single(query.horizonMonths);
  const horizonMonths = rawHorizon === undefined ? DEFAULT_HORIZON_MONTHS : Number(rawHorizon);
  if (!Number.isInteger(horizonMonths) || horizonMonths < 1 || horizonMonths > MAX_HORIZON_MONTHS) {
    return { ok: false, error: `horizonMonths must be a whole number from 1 to ${MAX_HORIZON_MONTHS}` };
  }

  const from = single(query.from);
  const to = single(query.to);
  if (from === undefined && to === undefined) return { ok: true, value: { granularity, horizonMonths } };
  if (from === undefined || to === undefined) return { ok: false, error: 'A custom range needs both from and to' };
  if (!isCalendarDate(from) || !isCalendarDate(to)) return { ok: false, error: 'from and to must be dates (YYYY-MM-DD)' };
  if (from < EARLIEST_DATE) return { ok: false, error: `from must be on or after ${EARLIEST_DATE}` };
  if (to < from) return { ok: false, error: 'to must be on or after from' };
  if (daysBetween(from, to) > MAX_CUSTOM_RANGE_DAYS) return { ok: false, error: 'A custom range can span at most three years' };
  return { ok: true, value: { granularity, horizonMonths, from, to } };
}
