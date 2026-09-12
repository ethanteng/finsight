/**
 * The server half of the results-email handover: see `calculator-handover`.
 *
 * Separate from that module because it imports `next/server`, which pulls the
 * web Request and Response into whatever loads it. The cookie helpers beside
 * it run in the browser, and a browser bundle must not carry this.
 */

import { NextResponse, type NextRequest } from 'next/server';
import {
  HANDOVER_COOKIE_MAX_AGE_SECONDS,
  HANDOVER_COOKIE_PATH,
  isHandoverToken,
} from './calculator-handover';

/**
 * The redirect a `/<calculator>/continue` route handler returns.
 *
 * `destination` is always one of our own signup URLs, built from a constant
 * rather than from anything in the request, so this can never become an open
 * redirect.
 */
export function handoverRedirect(
  request: NextRequest,
  options: { cookieName: string; destination: string },
): NextResponse {
  const ref = request.nextUrl.searchParams.get('ref');
  const response = NextResponse.redirect(
    new URL(options.destination, request.nextUrl.origin),
    // 302, not 308: the exchange is a one-time action, and a permanent
    // redirect is exactly the kind of thing a browser caches and replays.
    302,
  );

  if (isHandoverToken(ref)) {
    response.cookies.set(options.cookieName, ref, {
      // The signup page reads this from JavaScript to make the exchange, so it
      // cannot be httpOnly. Everything else is tightened instead: it lives for
      // minutes, only on the path that consumes it, and is deleted there.
      httpOnly: false,
      sameSite: 'lax',
      secure: request.nextUrl.protocol === 'https:',
      path: HANDOVER_COOKIE_PATH,
      maxAge: HANDOVER_COOKIE_MAX_AGE_SECONDS,
    });
  }

  response.headers.set('Cache-Control', 'no-store');
  return response;
}
