/**
 * The deep link that opens the "Add an account" picker on the accounts page.
 *
 * Shared so the in-app "Add accounts" button, any link we hand out elsewhere,
 * and the page that consumes the intent all agree on one spelling.
 */

export const CONNECT_INTENT_PARAM = 'connect';

/**
 * The intent's value.
 *
 * Still spelled "plaid" although the link now opens the provider-agnostic
 * picker: the value is a wire format, and links minted before the picker
 * existed are still out there. Changing the spelling would break them to buy
 * nothing a comment cannot.
 */
export const CONNECT_ACCOUNTS_INTENT = 'plaid';

/**
 * Link here to land on the accounts page with the institution picker already
 * open. Deliberately not a provider-specific flow: whoever follows this link is
 * usually someone with nothing connected yet, which is exactly the person who
 * cannot be asked whether their institution is a bank or an investment
 * connection.
 */
export const CONNECT_ACCOUNTS_PATH = `/profile?${CONNECT_INTENT_PARAM}=${CONNECT_ACCOUNTS_INTENT}`;

/**
 * Legacy in-tab signal for the same intent.
 *
 * Superseded by the query param, and still honored so a navigation that was
 * already in flight when this shipped still opens the picker.
 */
export const CONNECT_ACCOUNTS_STORAGE_KEY = 'wants_to_connect_accounts';
