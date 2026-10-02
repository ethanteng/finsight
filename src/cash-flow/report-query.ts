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

/** The cash position covers at most this many chosen accounts. */
const MAX_ACCOUNT_IDS = 20;
const ACCOUNT_ID_MAX_LENGTH = 200;

/** `accounts=a,b` or `accounts=a&accounts=b`: the cash accounts the position covers. */
function accountIdsFrom(value: unknown): string[] | null {
  const raw = (Array.isArray(value) ? value : [value]).filter((item): item is string => typeof item === 'string');
  const ids = Array.from(new Set(raw.flatMap(item => item.split(',')).map(id => id.trim()).filter(Boolean)));
  if (ids.length > MAX_ACCOUNT_IDS || ids.some(id => id.length > ACCOUNT_ID_MAX_LENGTH)) return null;
  return ids;
}

/** Parse `GET /api/cash-flow` query parameters into an engine request. */
export function parseCashFlowQuery(query: Record<string, unknown>): CashFlowQueryResult {
  const accountIds = accountIdsFrom(query.accounts);
  if (accountIds === null) return { ok: false, error: `Choose at most ${MAX_ACCOUNT_IDS} accounts` };
  const accounts = accountIds.length > 0 ? { accountIds } : {};
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
  if (from === undefined && to === undefined) return { ok: true, value: { granularity, horizonMonths, ...accounts } };
  if (from === undefined || to === undefined) return { ok: false, error: 'A custom range needs both from and to' };
  if (!isCalendarDate(from) || !isCalendarDate(to)) return { ok: false, error: 'from and to must be dates (YYYY-MM-DD)' };
  if (from < EARLIEST_DATE) return { ok: false, error: `from must be on or after ${EARLIEST_DATE}` };
  if (to < from) return { ok: false, error: 'to must be on or after from' };
  if (daysBetween(from, to) > MAX_CUSTOM_RANGE_DAYS) return { ok: false, error: 'A custom range can span at most three years' };
  return { ok: true, value: { granularity, horizonMonths, from, to, ...accounts } };
}
