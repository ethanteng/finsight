/**
 * The GA4 client id for this browser, read from the `_ga` cookie.
 *
 * A trial converts 30 days after checkout, in a Stripe webhook with no browser
 * present, so that conversion can only reach GA4 through the Measurement
 * Protocol — which needs the client id of the browser that started the signup.
 * Without it GA4 books the purchase as a brand-new user with no session, and
 * the conversion lands under (direct)/(none): revenue with the campaign that
 * earned it thrown away. So we capture the id while the browser is still here
 * and hand it to the backend to replay later.
 */

/** `_ga` holds `GA1.<depth>.<client id>`, e.g. `GA1.1.1234567890.1700000000`. */
const GA_COOKIE_PATTERN = /(?:^|;\s*)_ga=GA1\.\d+\.(\d+\.\d+)(?:;|$)/;

/** A client id is two dot-separated integers; anything else is not one. */
export function isGaClientId(value: unknown): value is string {
  return typeof value === 'string' && /^\d+\.\d+$/.test(value);
}

/**
 * Returns null when analytics never loaded (any host but production), when the
 * visitor blocks cookies, or before GA4 has written the cookie. Callers treat a
 * null as "no attribution available" rather than substituting a placeholder: a
 * made-up client id would invent a user in GA4.
 */
export function readGaClientId(): string | null {
  if (typeof document === 'undefined') return null;

  const match = GA_COOKIE_PATTERN.exec(document.cookie);
  return match && isGaClientId(match[1]) ? match[1] : null;
}
