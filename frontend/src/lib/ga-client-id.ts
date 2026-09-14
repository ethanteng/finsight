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

/** Property cookies contain the active session start, in old GS1 or new GS2 form. */
const GA_SESSION_COOKIE_NAME = /^_ga_[A-Z0-9]+$/;
const GA_SESSION_COOKIE_VALUE = /^GS\d+\.\d+\.(?:s)?(\d+)/;

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

/**
 * Return GA4's numeric session id when its property cookie is available.
 * There is normally one GA4 property on asklinc.com; if analytics is blocked
 * or no session cookie exists, callers preserve attribution without one.
 */
export function readGaSessionId(): string | null {
  if (typeof document === 'undefined') return null;

  for (const entry of document.cookie.split(';')) {
    const separator = entry.indexOf('=');
    if (separator < 0) continue;
    const name = entry.slice(0, separator).trim();
    if (!GA_SESSION_COOKIE_NAME.test(name)) continue;
    const match = GA_SESSION_COOKIE_VALUE.exec(entry.slice(separator + 1).trim());
    if (match?.[1]) return match[1];
  }
  return null;
}
