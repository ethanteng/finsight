/**
 * Whether an Ask Linc account already exists for an address a calculator was
 * given.
 *
 * The calculators send a new visitor to signup to see their answer. Someone
 * who already has an account cannot register again (`/auth/register` answers
 * 409), so they are sent to sign in instead, where the run is attached.
 *
 * This says nothing registration does not already say: it answers 409 for an
 * address that is taken.
 *
 * A failed lookup reads as a new address. Signup recovers from that mistake:
 * its 409 links an existing account to sign-in with the run. Sign-in cannot
 * recover from the other — a new visitor sent there has no account to open.
 */
export async function accountExistsForEmail(email: string): Promise<boolean> {
  return (await lookupAccountForEmail(email)) ?? false;
}

/**
 * The same lookup, saying when it could not tell: `null` when the database did
 * not answer. For a caller with no later step to recover from a wrong guess —
 * the cash-flow sample request would otherwise enroll an existing customer in
 * a sequence that asks them to start a trial.
 */
export async function lookupAccountForEmail(email: string): Promise<boolean | null> {
  try {
    const { getPrismaClient } = await import('../prisma-client');
    const user = await getPrismaClient().user.findUnique({
      where: { email: email.toLowerCase() },
      select: { id: true },
    });
    return user !== null;
  } catch (error) {
    console.error('❌ Calculator account lookup failed:', error);
    return null;
  }
}
