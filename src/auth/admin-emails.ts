/**
 * The operator allowlist behind `/admin`, read from `ADMIN_EMAILS`.
 *
 * Extracted from `adminAuth` so non-middleware code can ask the same question
 * without importing Express. The first caller is the upgrade CTA: an operator
 * account is comped, and nudging the people who run Ask Linc to buy a
 * subscription is noise.
 *
 * This covers operators only. An account an admin created for somebody else
 * is indistinguishable in the database from an ordinary no-card signup — both
 * are `subscriptionStatus: 'inactive'` with no `Subscription` rows — so a
 * comped user still sees the CTA.
 */
export function adminEmails(): string[] {
  return process.env.ADMIN_EMAILS?.split(',')
    .map(email => email.trim().toLowerCase())
    .filter(email => email.length > 0) || [];
}

export function isAdminOperatorEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const allowed = adminEmails();
  return allowed.length > 0 && allowed.includes(email.toLowerCase());
}
