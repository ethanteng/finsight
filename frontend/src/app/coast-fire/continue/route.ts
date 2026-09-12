/**
 * The landing point for the link in a Coast FIRE results email.
 *
 * It exists so the token in that link never reaches a rendered page. Google
 * Tag Manager loads in `<head>` on every page (see app/layout.tsx), and a GA4
 * pageview records the full URL, query string included — so a token sitting in
 * `/getstarted?ref=…` would be handed to analytics and to every other tag in
 * the container. That token is a bearer credential: it resolves to the
 * recipient's address and their seven figures for 90 days.
 *
 * So the exchange happens before any HTML exists. This handler reads the token
 * server-side, moves it into a short-lived first-party cookie scoped to
 * /getstarted, and redirects to a clean URL. The browser never renders a page
 * whose address contains the token, and no third-party tag ever sees it.
 *
 * A blocked or dropped cookie costs the personalization, not the signup: the
 * destination is a working /getstarted either way.
 */

import { NextResponse, type NextRequest } from 'next/server';
import {
  COAST_FIRE_REF_COOKIE,
  COAST_FIRE_REF_COOKIE_MAX_AGE_SECONDS,
  COAST_FIRE_REF_COOKIE_PATH,
  COAST_FIRE_SIGNUP_HREF,
  isCoastFireSignupRef,
} from '@/lib/coast-fire-signup-context';

/** The token is per-visitor, so no shared cache may hold the response. */
export const dynamic = 'force-dynamic';

export function GET(request: NextRequest) {
  const ref = request.nextUrl.searchParams.get('ref');
  const response = NextResponse.redirect(
    new URL(COAST_FIRE_SIGNUP_HREF, request.nextUrl.origin),
    // 302, not 308: the exchange is a one-time action, and a permanent
    // redirect is exactly the kind of thing a browser caches and replays.
    302,
  );

  if (isCoastFireSignupRef(ref)) {
    response.cookies.set(COAST_FIRE_REF_COOKIE, ref, {
      // The signup page reads this from JavaScript to make the exchange, so it
      // cannot be httpOnly. Everything else is tightened instead: it lives for
      // minutes, only on the path that consumes it, and is deleted there.
      httpOnly: false,
      sameSite: 'lax',
      secure: request.nextUrl.protocol === 'https:',
      path: COAST_FIRE_REF_COOKIE_PATH,
      maxAge: COAST_FIRE_REF_COOKIE_MAX_AGE_SECONDS,
    });
  }

  response.headers.set('Cache-Control', 'no-store');
  return response;
}
