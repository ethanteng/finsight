/**
 * Plaid error codes that mean a specific person must re-authenticate the
 * connection before it can sync again.
 *
 * These are not provider failures. They fail identically on every run until the
 * user completes Link's update mode, so a scheduled job that treats them as
 * failures stays red indefinitely and its exit code stops carrying information.
 * Report them; do not fail on them.
 *
 * DELIBERATELY LIMITED to the codes the product can actually walk a user out of.
 * `GET /profile/tokens` deactivates a token for exactly these two
 * (`src/index.ts`), and the profile page offers update-mode Link for
 * `lastError === 'ITEM_LOGIN_REQUIRED'`. Suppressing a code with no recovery
 * path would only trade a red cron for a connection that silently rots: the
 * scheduler goes green, the UI still shows the account as healthy, and the
 * balances quietly go stale. Any other user-fixable code keeps failing the run
 * until someone looks at it.
 *
 * To add a code here, give it a recovery path first — deactivate the token in
 * the status endpoint and surface a reconnect affordance — then add it, in that
 * order.
 *
 * https://plaid.com/docs/errors/item/
 */
const USER_ACTION_REQUIRED_PLAID_ERROR_CODES = new Set([
  'ITEM_LOGIN_REQUIRED',
  // The access_token is dead until the user re-links. Paired with
  // ITEM_LOGIN_REQUIRED in token status handling, so it has the same recovery path.
  'INVALID_ACCESS_TOKEN',
]);

/**
 * True when the connection is broken in a way only the account holder can fix
 * *and* the product can prompt them to fix it.
 *
 * Deliberately keyed on the Plaid error code rather than the human-readable
 * message: Plaid rewords messages, and matching prose would silently start
 * failing runs the day they do. An unknown or missing code returns false, so a
 * genuine provider outage still fails the job.
 */
export function isUserActionRequiredPlaidError(errorCode?: string | null): boolean {
  if (!errorCode) return false;
  return USER_ACTION_REQUIRED_PLAID_ERROR_CODES.has(errorCode);
}

/** Pull Plaid's error code off an SDK/axios error, if it carried one. */
export function extractPlaidErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== 'object') return undefined;
  const code = (error as any).response?.data?.error_code ?? (error as any).error_code;
  return typeof code === 'string' && code.length > 0 ? code : undefined;
}
