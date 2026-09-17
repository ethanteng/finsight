/**
 * Whether one brokerage account's connection is working.
 *
 * Extracted because two places now render these accounts -- the accounts page's
 * combined list, and SnapTradeButton's own list when it is not headless -- and
 * the rules below are the kind that get quietly re-derived wrong on the second
 * copy. Every one of them exists because of a specific way the naive version
 * lied to users.
 */

export interface SnapTradeAccountHealthInput {
  institution?: string;
  connectionDisabled?: boolean;
  brokerageAuthorizationId?: string;
  /**
   * 'public' when the row comes from the direct Public.com feed rather than
   * from SnapTrade.
   */
  source?: string;
}

export interface SnapTradeConnectionStatus {
  connected: boolean;
  status: string;
  error?: string;
  disabledConnections?: Array<{ authorizationId: string; institutionName: string | null }>;
}

export interface SnapTradeAccountHealth {
  isHealthy: boolean;
  /** What is wrong, naming the brokerage it is wrong for. `null` when nothing is. */
  issue: string | null;
  /** True when the account is read straight from Public, bypassing SnapTrade. */
  isDirect: boolean;
}

export function snapTradeAccountHealth(
  account: SnapTradeAccountHealthInput,
  status: SnapTradeConnectionStatus | null | undefined,
): SnapTradeAccountHealth {
  // Read directly from Public, not through SnapTrade. Applying SnapTrade's
  // health here would report a working feed as broken exactly when the user's
  // SnapTrade link is disabled -- and the direct feed is what still works then.
  const isDirect = account.source === 'public';

  // Health belongs to a brokerage authorization, not to the SnapTrade user.
  // Reading LOGIN_REQUIRED off the *user* status marked every account broken
  // the moment any one connection was disabled, so someone whose Public link
  // needed reconnecting saw their healthy Fidelity accounts reported as broken.
  //
  // `undefined` means SnapTrade could not confirm this authorization's health,
  // which is not the same as knowing it is broken, so only an explicit true
  // counts against the account.
  const connectionDisabled = !isDirect && (
    account.connectionDisabled === true
    || Boolean(
      account.brokerageAuthorizationId
      && status?.disabledConnections?.some(
        connection => connection.authorizationId === account.brokerageAuthorizationId,
      )
    )
  );

  // A whole-user failure -- credentials gone, SnapTrade unreachable -- genuinely
  // does affect every account, so it still applies across the board.
  // LOGIN_REQUIRED deliberately does not: it means *some* authorization is
  // disabled, and which ones is what the per-account flag above answers.
  const connectionUnusable = !isDirect && (
    !status?.connected
    || status?.status === 'error'
    || status?.status === 'ERROR'
  );

  const institutionName = account.institution || 'this brokerage';

  return {
    isHealthy: !connectionDisabled && !connectionUnusable,
    isDirect,
    issue: connectionDisabled
      ? `SnapTrade connection disabled for ${institutionName}. Reconnect to resume updates.`
      : connectionUnusable
        ? (status?.error || 'Connection issue')
        : null,
  };
}
