/**
 * Hand the browser off to a URL outside this app — today, Stripe Checkout.
 *
 * `replace`, not `href`, and that is the whole reason this is a named function
 * rather than an inline statement: a forwarding page must not stay in history.
 * With `href`, backing out of Stripe returns to the page that sent them there,
 * which mints another session and bounces them straight back — a loop the
 * visitor cannot escape with the Back button.
 *
 * Keeping it here also makes the navigation observable in tests. jsdom's
 * `Location` is neither configurable nor writable, so a spy cannot be attached
 * to `window.location.replace` directly.
 */
export function replaceLocation(url: string): void {
  window.location.replace(url);
}
