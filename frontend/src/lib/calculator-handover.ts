/**
 * Getting a results-email token from the inbox to the signup page without
 * putting it in a URL.
 *
 * Shared by every calculator that can email someone their result. The token is
 * a 90-day bearer credential for one address and one set of figures, and
 * Google Tag Manager loads in `<head>` on every page and records the URL of
 * every pageview — so a token sitting in the address of a rendered page is
 * handed to analytics and to every other tag in the container.
 *
 * The exchange therefore happens before any page exists. The emailed link
 * lands on a route handler — `calculator-handover-redirect`, kept separate so
 * `next/server` never reaches a browser bundle — which reads the token
 * server-side, moves it into a short-lived first-party cookie scoped to the
 * page that spends it, and redirects to a clean address. This module is the
 * other half: the signup page reads that cookie, exchanges it, and deletes it.
 *
 * A blocked or dropped cookie costs the personalization, not the signup: the
 * destination is a working /getstarted either way.
 */

import { GET_STARTED_HREF } from './site-nav';

/** 24 random bytes, hex encoded — the shape `services/lead-token` mints. */
const TOKEN_PATTERN = /^[a-f0-9]{48}$/;

/** The handover cookie is read once, on the page it redirects to. */
export const HANDOVER_COOKIE_MAX_AGE_SECONDS = 10 * 60;

/** Only /getstarted ever spends one, so only /getstarted is ever sent one. */
export const HANDOVER_COOKIE_PATH = GET_STARTED_HREF;

export function isHandoverToken(value: unknown): value is string {
  return typeof value === 'string' && TOKEN_PATTERN.test(value);
}

/**
 * What a token lookup concluded.
 *
 * The three cases exist because the cookie is the only surviving copy of the
 * token once `/continue` has stripped it from the URL, and whether to spend it
 * depends on whether asking again could ever produce a different answer. A
 * backend that was briefly unreachable is not the same as a token the backend
 * does not know.
 */
export type HandoverLookup<T> =
  | { status: 'resolved'; context: T }
  | { status: 'not-found' }
  | { status: 'unavailable' };

/**
 * Whether the handover cookie should be dropped after this lookup.
 *
 * A resolved or definitively unknown token is spent: asking again cannot
 * change either answer, and leaving it would retry on every visit. A lookup
 * that could not be made keeps the cookie, so a reload retries within its ten
 * minutes rather than silently losing the personalization.
 */
export function isLookupSettled(status: HandoverLookup<unknown>['status']): boolean {
  return status !== 'unavailable';
}

/**
 * Classify a response the lookup could not turn into a context.
 *
 * 404 is the endpoint saying it has no such token, and 400 means the token was
 * not even the right shape; neither improves on a retry. A 429 or a 5xx is the
 * backend asking to be tried later, and so is a network error.
 */
export function lookupStatusForResponse(status: number): 'not-found' | 'unavailable' {
  return status === 404 || status === 400 ? 'not-found' : 'unavailable';
}

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  for (const entry of document.cookie.split(';')) {
    const [key, ...rest] = entry.trim().split('=');
    if (key === name) return decodeURIComponent(rest.join('='));
  }
  return null;
}

/** The emailed link's token, or null for anything that is not one of ours. */
export function readHandoverToken(cookieName: string): string | null {
  const ref = readCookie(cookieName);
  return isHandoverToken(ref) ? ref : null;
}

/**
 * Hand a token to /getstarted from a page on this origin.
 *
 * The emailed route gets here through `/<calculator>/continue`, which reads
 * the token out of the link server-side. The calculator page already holds
 * one — the endpoint it just posted to returned it — so it writes the same
 * cookie directly and skips the round trip. Either way nothing puts the token
 * in the address of a page that renders, which is the whole point of the
 * cookie.
 *
 * The attributes match the ones `handoverRedirect` sets, for the reason
 * `clearHandoverToken` documents below: a mismatched write does not reliably
 * replace a stored cookie.
 *
 * There is no confirming it from here. The cookie is scoped to the path that
 * spends it, so the calculator page cannot read back what it just wrote, and a
 * browser refusing the write says nothing either way. Callers therefore store
 * the signup context in session storage as well: a dropped cookie then costs
 * the address prefill and the saved run, not the tailored signup page.
 */
export function writeHandoverToken(cookieName: string, token: string): void {
  if (typeof document === 'undefined' || !isHandoverToken(token)) return;
  const secure =
    typeof window !== 'undefined' && window.location.protocol === 'https:'
      ? '; Secure'
      : '';
  document.cookie =
    `${cookieName}=${encodeURIComponent(token)}; Path=${HANDOVER_COOKIE_PATH}` +
    `; Max-Age=${HANDOVER_COOKIE_MAX_AGE_SECONDS}; SameSite=Lax${secure}`;
}

/**
 * How someone reached /getstarted carrying a saved run.
 *
 * The cookie looks the same either way, so the destination says which. It
 * separates two funnels that convert differently — one crossed an inbox, the
 * other did not — and keeps `calculator_results_email_cta_opened` counting
 * only the emails it was defined to count.
 */
export const SIGNUP_ENTRY_PARAM = 'entry';
export const SIGNUP_ENTRY_RESULTS_PAGE = 'results_page';

/** The calculator's own signup href, marked as the straight-from-the-page one. */
export function resultsPageSignupHref(signupHref: string): string {
  const separator = signupHref.includes('?') ? '&' : '?';
  return `${signupHref}${separator}${SIGNUP_ENTRY_PARAM}=${SIGNUP_ENTRY_RESULTS_PAGE}`;
}

/**
 * Leave the calculator for signup.
 *
 * A whole document load rather than a client navigation, because the cookie
 * written just above has to be sent with the request /getstarted reads it
 * from. Named rather than written inline at both call sites so that what it
 * does is legible, and so a test can observe it: jsdom implements neither
 * navigation nor a `location` that can be replaced.
 */
export function leaveForSignup(href: string): void {
  if (typeof window === 'undefined') return;
  window.location.assign(href);
}

/**
 * Drop the handover cookie once it has been spent. It expires on its own
 * within minutes; clearing it means a second visit to /getstarted in the same
 * session is an ordinary one rather than a replay of an old link.
 *
 * Attribute matching matters: the continue handler sets `Secure` on HTTPS, and
 * a clearing write that omits it does not reliably replace the stored cookie —
 * which would leave the bearer token readable for the rest of its ten minutes
 * after the page believed it had spent it.
 */
export function clearHandoverToken(cookieName: string): void {
  if (typeof document === 'undefined') return;
  const secure =
    typeof window !== 'undefined' && window.location.protocol === 'https:'
      ? '; Secure'
      : '';
  document.cookie =
    `${cookieName}=; Path=${HANDOVER_COOKIE_PATH}; Max-Age=0; SameSite=Lax${secure}`;
}
