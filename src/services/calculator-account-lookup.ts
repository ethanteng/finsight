/**
 * Whether an Ask Linc account already exists for an address a calculator was
 * given.
 *
 * The calculators send a new visitor to signup to see their answer. Someone
 * who already has an account cannot register again (`/auth/register` answers
 * 409), and the "result ready" email states no answer, so handing them off
 * would leave them with no way to see it. Their result is shown on the page
 * and mailed in full instead.
 *
 * This says nothing registration does not already say: it answers 409 for an
 * address that is taken.
 *
 * A failed lookup reads as an existing account. The cost of that mistake is a
 * result shown on the page rather than in Ask Linc; the cost of the other is
 * a visitor stuck at a signup that refuses them.
 */
export async function accountExistsForEmail(email: string): Promise<boolean> {
  try {
    const { getPrismaClient } = await import('../prisma-client');
    const user = await getPrismaClient().user.findUnique({
      where: { email: email.toLowerCase() },
      select: { id: true },
    });
    return user !== null;
  } catch (error) {
    console.error('❌ Calculator account lookup failed:', error);
    return true;
  }
}
