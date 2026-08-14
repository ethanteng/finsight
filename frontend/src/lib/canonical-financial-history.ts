export interface CanonicalFinancialHistoryPoint {
  computedAt: string;
  observationDate?: string | null;
  netWorth: number;
  totalCash: number;
  totalInvestments: number;
  totalDebt: number;
  homeValue: number | null;
}

export function historyPointDisplayDate(point: CanonicalFinancialHistoryPoint): Date {
  const calendarDate = point.observationDate?.slice(0, 10);
  if (calendarDate && /^\d{4}-\d{2}-\d{2}$/.test(calendarDate)) {
    const [year, month, day] = calendarDate.split('-').map(Number);
    return new Date(year, month - 1, day);
  }
  return new Date(point.computedAt);
}

function localCalendarDate(point: CanonicalFinancialHistoryPoint): string {
  const explicitDate = point.observationDate?.slice(0, 10);
  if (explicitDate && /^\d{4}-\d{2}-\d{2}$/.test(explicitDate)) return explicitDate;
  const date = new Date(point.computedAt);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Add the current canonical point without altering persisted historical rows.
 * Exact computedAt equality identifies the history row written with the same
 * snapshot payload.
 */
export function mergeCanonicalCurrentWithHistory(
  current: CanonicalFinancialHistoryPoint,
  history: readonly CanonicalFinancialHistoryPoint[]
): CanonicalFinancialHistoryPoint[] {
  const currentCalendarDate = localCalendarDate(current);
  return [
    current,
    ...history.filter(point =>
      point.computedAt !== current.computedAt &&
      localCalendarDate(point) !== currentCalendarDate
    ),
  ];
}
