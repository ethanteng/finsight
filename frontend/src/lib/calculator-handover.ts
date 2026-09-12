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
