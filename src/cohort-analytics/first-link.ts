import type { FirstLink, LinkSource } from './types';

/**
 * Everything still on record that says a user linked an account, and when.
 *
 * Disconnecting deletes the rows that recorded a link, so this is a lower bound
 * on who ever linked: a user who connected and later removed everything shows
 * as linked only if a provider-specific history row survived the removal.
 */
export interface FirstLinkEvidence {
  /** Earliest Plaid Item row, whatever its state now (superseded and errored Items were still links). */
  plaidTokenCreatedAt: Date | null;
  /** Earliest `plaid-connection-disconnected` history row. */
  plaidDisconnectedAt: Date | null;
  /**
   * When the user registered with SnapTrade. Registration happens as the first
   * step of connecting a brokerage, so on its own it is only an attempt.
   */
  snapTradeRegisteredAt: Date | null;
  /** A brokerage is visible now: a SnapTrade account in the snapshot, or synced activity. */
  snapTradeConnectedNow: boolean;
  /** Earliest timestamped trace of a brokerage: a renamed account row or a removal in history. */
  snapTradeEvidenceAt: Date | null;
  /** Creation time of a Public credential that has verified at least once. */
  publicVerifiedCredentialAt: Date | null;
  /** Earliest timestamped trace of Public: a renamed account row, or a connect or removal in history. */
  publicEvidenceAt: Date | null;
}

function earliest(...dates: Array<Date | null | undefined>): Date | null {
  let result: Date | null = null;
  for (const date of dates) {
    if (date && (!result || date.getTime() < result.getTime())) result = date;
  }
  return result;
}

export function resolveFirstLink(evidence: FirstLinkEvidence): FirstLink | null {
  const bySource: Array<[LinkSource, Date | null]> = [
    ['plaid', earliest(evidence.plaidTokenCreatedAt, evidence.plaidDisconnectedAt)],
    [
      'snaptrade',
      // Registration alone is an attempt; it dates the link only once a
      // brokerage is seen. It precedes any connection, so it is the best date
      // for one that has no timestamp of its own.
      evidence.snapTradeConnectedNow || evidence.snapTradeEvidenceAt
        ? earliest(evidence.snapTradeRegisteredAt, evidence.snapTradeEvidenceAt)
        : null,
    ],
    ['public', earliest(evidence.publicVerifiedCredentialAt, evidence.publicEvidenceAt)],
  ];
  const found = bySource.filter((entry): entry is [LinkSource, Date] => entry[1] !== null);
  if (found.length === 0) return null;
  return {
    at: earliest(...found.map(([, at]) => at)) as Date,
    sources: found.map(([source]) => source),
  };
}
