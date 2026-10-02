/**
 * How far back the canonical snapshot reads transactions.
 *
 * The provider fetch, the persisted-row fallback, and the summary window must
 * agree. They once read the same variable with different defaults (90 and 365),
 * so an unset variable fetched 90 days and then averaged them over 12 months.
 *
 * Widening this costs no Plaid fees: Transactions is billed per connected Item
 * per month, not per call or per day of history. A connection only has the
 * history Plaid holds for it, so months before that are reported as not covered
 * rather than as zero -- see coverage in transaction-summary-service.
 */
export const DEFAULT_TRANSACTION_HISTORY_DAYS = 365;

/**
 * History requested from Plaid when a connection is first made. Plaid fixes this
 * per Item once Transactions is initialized and keeps every later transaction,
 * so asking for the maximum now is the only way an Item ever has it.
 */
export const PLAID_TRANSACTIONS_DAYS_REQUESTED = 730;

export function transactionHistoryDays(env: typeof process.env = process.env): number {
  const parsed = Number.parseInt(env.TRANSACTION_HISTORY_DAYS ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TRANSACTION_HISTORY_DAYS;
}
