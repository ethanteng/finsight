/**
 * Putting a calculator run into an account that already exists.
 *
 * Neither calculator shows its result on its own page: every run opens in Ask
 * Linc. A new visitor gets there through signup, where registration seeds the
 * run as the account's first decision. An address that already has an
 * account cannot register, so it signs in instead, and the run is attached to
 * that account here. A visitor already signed in on the calculator page
 * attaches it directly.
 *
 * The server checks the lead's address against the signed-in account, so this
 * attaches nothing for a token that names someone else.
 */

import { COAST_FIRE_SIGNUP_SOURCE } from './coast-fire-signup-context';
import { RETIREMENT_SIGNUP_SOURCE } from './retirement-signup-context';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

/*
 * Sign-in, marked with the calculator it came from so the form can find the
 * stored run. Neither the address nor the token is in the URL: analytics
 * records page addresses. Both come from the stored signup context.
 */
export const COAST_FIRE_SIGN_IN_HREF = `/login?source=${COAST_FIRE_SIGNUP_SOURCE}`;
export const RETIREMENT_SIGN_IN_HREF = `/login?source=${RETIREMENT_SIGNUP_SOURCE}`;

/**
 * Attach a run to the account `authToken` belongs to. True when the account
 * now holds it, including from an earlier attach; false for anything else,
 * which callers treat as "show the result some other way".
 */
export async function attachCalculatorLead(authToken: string, calculatorRef: string): Promise<boolean> {
  try {
    const response = await fetch(`${API_URL}/auth/calculator-lead`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({ calculatorRef }),
    });
    if (!response.ok) return false;
    const body = await response.json().catch(() => null) as { attached?: unknown } | null;
    return body?.attached === true;
  } catch {
    return false;
  }
}

/** The session this browser holds, if any. */
export function readStoredAuthToken(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem('auth_token');
  } catch {
    return null;
  }
}

/** Where a saved calculator run opens. Never the calculator page itself. */
export type CalculatorHandoff = 'app' | 'sign-in' | 'signup';

/**
 * Decide where a saved run goes, attaching it first when there is a session.
 *
 * - A visitor already signed in has it attached to that account and opens
 *   `/app` on it.
 * - An address that already has an account signs in, which attaches it.
 * - Anyone else signs up, which seeds it as the first decision.
 *
 * A session whose account the lead does not name (the visitor typed some
 * other address) attaches nothing, and the run follows the address they typed
 * instead, as if no one were signed in.
 */
export async function chooseCalculatorHandoff(
  calculatorRef: string,
  existingAccount: boolean,
): Promise<CalculatorHandoff> {
  const session = readStoredAuthToken();
  if (session && await attachCalculatorLead(session, calculatorRef)) return 'app';
  return existingAccount ? 'sign-in' : 'signup';
}

/**
 * The signed-in account's address, to prefill the calculator's email form.
 *
 * Prefilling it is what makes the signed-in path attach: the lead names the
 * address typed, and attaching needs it to be this account's.
 */
export async function readSignedInEmail(): Promise<string | null> {
  const session = readStoredAuthToken();
  if (!session) return null;
  try {
    const response = await fetch(`${API_URL}/auth/verify`, {
      headers: { Authorization: `Bearer ${session}` },
    });
    if (!response.ok) return null;
    const body = await response.json().catch(() => null) as { user?: { email?: unknown } } | null;
    return typeof body?.user?.email === 'string' ? body.user.email : null;
  } catch {
    return null;
  }
}
