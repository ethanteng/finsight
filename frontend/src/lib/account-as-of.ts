/**
 * Per-account "as of" line, shared by every surface that renders an account.
 *
 * The Finances page carries one timestamp under its totals, built from the
 * *newest* source in the snapshot. That is the right number for "when did my
 * numbers last move", but it says nothing about any individual account: one
 * connection syncing this morning makes the whole page look current even when
 * another has not been observed in months. Each row therefore carries its own
 * observation time, straight from the snapshot source observation the quality
 * evaluation judged.
 *
 * Returns null when there is nothing honest to say — an older server that does
 * not send the field, or an account the snapshot has no observation for. A row
 * with no line is better than a row dated to a read that never happened.
 */

export interface AccountAsOfShape {
  dataAsOf?: string | null;
  isDataStale?: boolean;
}

export interface AccountAsOf {
  /** Short line for the row, e.g. "Updated Aug 20" or "Updated Nov 23, 2025". */
  label: string;
  /** Full timestamp for the hover title, so the exact time is always reachable. */
  title: string;
  /** The snapshot judged this account's observation older than its own max age. */
  isStale: boolean;
}

export function formatAccountAsOf(account: AccountAsOfShape, now: Date = new Date()): AccountAsOf | null {
  if (!account.dataAsOf) return null;
  const observed = new Date(account.dataAsOf);
  if (Number.isNaN(observed.getTime())) return null;

  // The year is what separates "this looks fine" from "this is nine months old",
  // so it is spelled out whenever the observation is not from the current year.
  const sameYear = observed.getFullYear() === now.getFullYear();
  const label = observed.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
  });

  return {
    label: `Updated ${label}`,
    title: `Provider last reported this account on ${observed.toLocaleString()}`,
    isStale: Boolean(account.isDataStale),
  };
}
