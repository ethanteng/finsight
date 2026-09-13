/**
 * Where to send someone once they have signed in.
 *
 * A deep link into the authenticated app — the Plaid connect link at
 * `/profile?connect=plaid`, for example — has to survive a signed-out visitor
 * being bounced to `/login`, so the original destination rides along in the
 * query string. Anything that comes back out of a query string is
 * attacker-controlled, so it is only ever used after `sanitizePostLoginRedirect`
 * has reduced it to a path on this origin.
 */

export const POST_LOGIN_REDIRECT_PARAM = 'returnTo';
export const DEFAULT_POST_LOGIN_DESTINATION = '/app';

/** Longer than any destination we generate; a cap keeps pathological input out. */
const MAX_REDIRECT_LENGTH = 512;

/** Resolving against a base we own turns "same origin" into an equality check. */
const INTERNAL_ORIGIN = 'https://post-login-redirect.invalid';

/** Signing in only to land back on the sign-in page is a loop, not a destination. */
const EXCLUDED_PREFIXES = ['/login', '/register', '/getstarted', '/forgot-password', '/reset-password'];

/**
 * Reduce an untrusted destination to a path on this origin, or reject it.
 *
 * Returns the path (with query and hash) when it is safe to navigate to, and
 * `null` for anything else — including absolute URLs, which would otherwise
 * make the sign-in page an open redirect.
 */
export function sanitizePostLoginRedirect(value: string | null | undefined): string | null {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_REDIRECT_LENGTH) {
    return null;
  }

  // Browsers strip control characters before resolving a URL, so a tab or
  // newline after the leading slash would survive the prefix check below and
  // then resolve as the protocol-relative "//evil.example".
  if (/[\u0000-\u001f\u007f]/.test(value)) {
    return null;
  }

  // A leading "//" or "/\" is protocol-relative: it looks like a path and
  // resolves to another host.
  if (!value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) {
    return null;
  }

  let url: URL;
  try {
    url = new URL(value, INTERNAL_ORIGIN);
  } catch {
    return null;
  }

  if (url.origin !== INTERNAL_ORIGIN) {
    return null;
  }

  const path = url.pathname.toLowerCase();
  if (EXCLUDED_PREFIXES.some(prefix => path === prefix || path.startsWith(`${prefix}/`))) {
    return null;
  }

  // `new URL` normalizes `/..//evil.example` into pathname `//evil.example`.
  // Returning that string would make the next navigation protocol-relative
  // (`new URL('//evil.example', origin)` → https://evil.example/), so reject
  // anything that is not a single-slash absolute path after normalization.
  const normalized = `${url.pathname}${url.search}${url.hash}`;
  if (!normalized.startsWith('/') || normalized.startsWith('//')) {
    return null;
  }

  return normalized;
}

/** The sign-in URL that returns to `destination`, or a plain one if it fails the check. */
export function loginUrlFor(destination: string): string {
  const safe = sanitizePostLoginRedirect(destination);
  return safe ? `/login?${POST_LOGIN_REDIRECT_PARAM}=${encodeURIComponent(safe)}` : '/login';
}
