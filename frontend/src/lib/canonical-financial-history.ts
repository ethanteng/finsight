export interface CanonicalFinancialHistoryPoint {
  computedAt: string;
  netWorth: number;
  totalCash: number;
  totalInvestments: number;
  totalDebt: number;
  homeValue: number | null;
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
  return [
    current,
    ...history.filter(point => point.computedAt !== current.computedAt),
  ];
}
