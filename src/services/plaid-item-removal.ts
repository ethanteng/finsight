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

/**
 * The only code that confirms the Item is gone.
 *
 * `INVALID_ACCESS_TOKEN` deliberately does NOT belong here, even though the
 * codebase pairs the two elsewhere for "the user must re-link". That pairing
 * answers a different question. `INVALID_ACCESS_TOKEN` says Plaid rejected the
 * credential we sent -- malformed, corrupted, or issued for another
 * environment -- and says nothing about whether the Item behind it is still
 * live. Counting it as revoked would delete the only credential that could ever
 * revoke that Item, stranding it at Plaid on the strength of an error that never
 * claimed it was gone.
 */
const ALREADY_REMOVED_ERROR_CODES = new Set(['ITEM_NOT_FOUND']);

export interface PlaidItemRemovalResult {
  /** Local AccessToken row id, so callers can report per connection. */
  tokenId: string;
  /** The Item is confirmed not live: either just revoked, or already gone. */
  removed: boolean;
  /** True when Plaid reported the Item was already gone. */
  alreadyRemoved: boolean;
  /**
   * Plaid rejected the credential, so whether the Item survives is unknown.
   * Distinct from an outright failure because retrying will not help -- but the
   * token is still kept, because deleting it would strand a possibly-live Item.
   */
  unconfirmed?: boolean;
  errorCode?: string;
  error?: string;
}

export interface PlaidItemRemovalSummary {
  results: PlaidItemRemovalResult[];
  removed: number;
  alreadyRemoved: number;
  failed: number;
  /** Failures where Plaid rejected the credential, so the Item's fate is unknown. */
  unconfirmed: number;
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
    if (errorCode && ALREADY_REMOVED_ERROR_CODES.has(errorCode)) {
      console.warn(`⚠️ Plaid item for token ${token.id} was already gone (${errorCode}); treating as revoked`);
      return { tokenId: token.id, removed: true, alreadyRemoved: true, errorCode };
    }
    if (errorCode === 'INVALID_ACCESS_TOKEN') {
      // Loud, because no retry resolves it and the Item may well still be live
      // and billable at Plaid with no credential left that can end it.
      console.error(
        `❌ Plaid rejected the access token for ${token.id} (INVALID_ACCESS_TOKEN); ` +
        'its Item may still be live at Plaid and cannot be revoked with this credential'
      );
      return {
        tokenId: token.id,
        removed: false,
        alreadyRemoved: false,
        unconfirmed: true,
        errorCode,
        error: 'Plaid rejected the stored credential for this connection, so it could not be revoked.',
      };
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
    unconfirmed: results.filter(result => result.unconfirmed).length,
    allRevoked: failed === 0,
  };
}
