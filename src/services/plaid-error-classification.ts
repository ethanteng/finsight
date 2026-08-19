/**
 * Plaid error codes that mean a specific person must re-authenticate the
 * connection before it can sync again.
 *
 * These are not provider failures. They fail identically on every run until the
 * user completes Link's update mode, so a scheduled job that treats them as
 * failures stays red indefinitely and its exit code stops carrying information.
 * Report them; do not fail on them.
 *
 * https://plaid.com/docs/errors/item/
 */
const USER_ACTION_REQUIRED_PLAID_ERROR_CODES = new Set([
  'ITEM_LOGIN_REQUIRED',
  'ITEM_LOCKED',
  'INSUFFICIENT_CREDENTIALS',
  'INVALID_CREDENTIALS',
  'INVALID_MFA',
  'INVALID_UPDATED_USERNAME',
  'PENDING_DISCONNECT',
  'PENDING_EXPIRATION',
  'USER_PERMISSION_REVOKED',
  'USER_INPUT_TIMEOUT',
  'ITEM_NOT_SUPPORTED',
]);

/**
 * True when the connection is broken in a way only the account holder can fix.
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
