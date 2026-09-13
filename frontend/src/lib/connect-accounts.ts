/**
 * The deep link that opens Plaid Link on the accounts page.
 *
 * Shared so the in-app "Add accounts" button, any link we hand out elsewhere,
 * and the page that consumes the intent all agree on one spelling.
 */

export const CONNECT_INTENT_PARAM = 'connect';
export const CONNECT_PLAID_INTENT = 'plaid';

/** Link here to land on the accounts page with Plaid Link already opening. */
export const CONNECT_ACCOUNTS_PATH = `/profile?${CONNECT_INTENT_PARAM}=${CONNECT_PLAID_INTENT}`;

/**
 * Legacy in-tab signal for the same intent.
 *
 * Superseded by the query param, and still honored so a navigation that was
 * already in flight when this shipped still opens Plaid Link.
 */
export const CONNECT_ACCOUNTS_STORAGE_KEY = 'wants_to_connect_accounts';
