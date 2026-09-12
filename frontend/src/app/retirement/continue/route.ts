/**
 * The landing point for the link in a retirement results email.
 *
 * It exists so the token in that link never reaches a rendered page. See
 * `lib/calculator-handover` for why, and for the exchange itself.
 */

import type { NextRequest } from 'next/server';
import { handoverRedirect } from '@/lib/calculator-handover-redirect';
import {
  RETIREMENT_REF_COOKIE,
  RETIREMENT_SIGNUP_HREF,
} from '@/lib/retirement-signup-context';

/** The token is per-visitor, so no shared cache may hold the response. */
export const dynamic = 'force-dynamic';

export function GET(request: NextRequest) {
  return handoverRedirect(request, {
    cookieName: RETIREMENT_REF_COOKIE,
    destination: RETIREMENT_SIGNUP_HREF,
  });
}
