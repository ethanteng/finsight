/**
 * The landing point for the link in a Coast FIRE results email.
 *
 * It exists so the token in that link never reaches a rendered page. See
 * `lib/calculator-handover` for why, and for the exchange itself.
 */

import type { NextRequest } from 'next/server';
import { handoverRedirect } from '@/lib/calculator-handover-redirect';
import { COAST_FIRE_SIGN_IN_HREF } from '@/lib/calculator-lead-attach';
import {
  COAST_FIRE_REF_COOKIE,
  COAST_FIRE_SIGNUP_HREF,
} from '@/lib/coast-fire-signup-context';

/** The token is per-visitor, so no shared cache may hold the response. */
export const dynamic = 'force-dynamic';

export function GET(request: NextRequest) {
  return handoverRedirect(request, {
    cookieName: COAST_FIRE_REF_COOKIE,
    destination: COAST_FIRE_SIGNUP_HREF,
    signInDestination: COAST_FIRE_SIGN_IN_HREF,
  });
}
