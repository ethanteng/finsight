import type { PlaidApi } from 'plaid';
import { extractPlaidErrorCode } from './plaid-error-classification';

/**
 * Revoke a Plaid Item so the connection actually ends at Plaid, not just here.
 *
 * Deleting the local `AccessToken` row only makes us forget the connection. The
 * Item stays live at Plaid: the consent stands, Plaid keeps refreshing it, and
 * it keeps counting against billing. A user who pressed "disconnect" has been
 * told their bank is unlinked while Plaid still holds the grant, which is both a
 * privacy answer we did not actually give and a bill we keep paying. `itemRemove`
 * is the only call that ends it.
 *
 * https://plaid.com/docs/api/items/#itemremove
 */

/** Item is already gone at Plaid, or the token can no longer address it. */
const ALREADY_UNUSABLE_ERROR_CODES = new Set([
  'ITEM_NOT_FOUND',
  // The token cannot be used to remove anything, and re-linking issues a new
  // one, so the Item this token pointed at is unreachable by us either way.
  'INVALID_ACCESS_TOKEN',
]);

export interface PlaidItemRemovalResult {
  /** Local AccessToken row id, so callers can report per connection. */
  tokenId: string;
  removed: boolean;
  /** True when Plaid reported the Item was already gone. */
  alreadyRemoved: boolean;
  errorCode?: string;
  error?: string;
}

export interface PlaidItemRemovalSummary {
  results: PlaidItemRemovalResult[];
  removed: number;
  alreadyRemoved: number;
  failed: number;
  /** True when every Item is confirmed gone at Plaid. */
  allRevoked: boolean;
}

/**
 * Revoke one Item.
 *
 * Not retried. `itemRemove` is a destructive mutation, and the shared retry
 * policy is documented for idempotent reads. A token Plaid no longer recognises
 * counts as success: the caller's goal is that the Item is not live, and one
 * that never existed or can no longer be addressed satisfies that. Treating it
 * as a failure would block the local cleanup that follows and strand the row.
 */
export async function removePlaidItem(
  token: { id: string; token: string },
  plaidClient: PlaidApi,
): Promise<PlaidItemRemovalResult> {
  try {
    await plaidClient.itemRemove({ access_token: token.token });
    return { tokenId: token.id, removed: true, alreadyRemoved: false };
  } catch (error) {
    const errorCode = extractPlaidErrorCode(error);
    if (errorCode && ALREADY_UNUSABLE_ERROR_CODES.has(errorCode)) {
      console.warn(`⚠️ Plaid item for token ${token.id} was already unusable (${errorCode}); treating as revoked`);
      return { tokenId: token.id, removed: true, alreadyRemoved: true, errorCode };
    }
    // The provider message can name internal detail and may reach a user, so
    // only the code travels; the rest stays in the log.
    console.error(`Plaid itemRemove failed for token ${token.id}:`, error);
    return {
      tokenId: token.id,
      removed: false,
      alreadyRemoved: false,
      errorCode,
      error: 'Plaid could not revoke this connection.',
    };
  }
}

/**
 * Revoke several Items, continuing past failures.
 *
 * Deliberately does not stop on the first failure. These callers are deleting a
 * user's data across every connection they have; abandoning the sweep because
 * one bank errored would leave the rest live at Plaid with no record that they
 * still need revoking. `allRevoked` reports whether the sweep was clean so a
 * caller can decide what to tell the user.
 */
export async function removePlaidItems(
  tokens: ReadonlyArray<{ id: string; token: string }>,
  plaidClient: PlaidApi,
): Promise<PlaidItemRemovalSummary> {
  const results: PlaidItemRemovalResult[] = [];
  for (const token of tokens) {
    results.push(await removePlaidItem(token, plaidClient));
  }
  const alreadyRemoved = results.filter(result => result.alreadyRemoved).length;
  const removed = results.filter(result => result.removed).length - alreadyRemoved;
  const failed = results.filter(result => !result.removed).length;
  return {
    results,
    removed,
    alreadyRemoved,
    failed,
    allRevoked: failed === 0,
  };
}
