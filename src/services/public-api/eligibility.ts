import { getPrismaClient } from '../../prisma-client';

/**
 * Whether a user may configure a direct Public.com API secret.
 *
 * Gated on already holding a Public connection through SnapTrade. This is a
 * stopgap for one broken vendor path, not a general "bring your own brokerage
 * key" feature, and the gate keeps it that way: a user with no Public connection
 * has nothing here to work around, and should not be invited to hand us a
 * tradeable credential.
 *
 * Enforced server-side on every write, not merely hidden in the UI.
 */

/**
 * Institution labels that mean Public.
 *
 * An exact set rather than a prefix match. A prefix rule reading "starts with
 * Public" also matches "Public Storage REIT" and any other brokerage whose name
 * merely begins with the word -- and a false positive here does not just deny
 * eligibility, it drops that brokerage's accounts out of the user's net worth
 * when the direct feed supersedes them. Failing to recognise a re-branded label
 * is the safer error, and shows up as a missing feature rather than missing money.
 *
 * SnapTrade reports "Public" today, verified against production.
 */
const PUBLIC_INSTITUTION_LABELS = new Set([
  'public',
  'public.com',
  'public investing',
  'public holdings',
]);

export function isPublicInstitution(institution: unknown): boolean {
  if (typeof institution !== 'string') return false;
  const normalized = institution.trim().toLowerCase().replace(/\s+/g, ' ');
  return PUBLIC_INSTITUTION_LABELS.has(normalized);
}

export interface PublicEligibility {
  eligible: boolean;
  /** SnapTrade account ids for Public, so callers can suppress them when direct data arrives. */
  snapTradeAccountIds: string[];
  /** True when eligibility rests on an existing credential rather than a SnapTrade link. */
  configured: boolean;
}

/**
 * Resolve eligibility from the user's latest snapshot.
 *
 * Deliberately a database read rather than a live SnapTrade call: this runs on a
 * settings page, and billing a provider request to render a toggle for the many
 * users who have no Public connection would be a poor trade. The snapshot is the
 * same source the finances page renders from, so anyone who can see their Public
 * accounts in the product is eligible here.
 */
export async function getPublicEligibility(userId: string): Promise<PublicEligibility> {
  const prisma = getPrismaClient();
  const snapshot = await prisma.financialSummarySnapshot.findFirst({
    where: { userId },
    select: { accounts: true },
  });

  const accounts = Array.isArray(snapshot?.accounts) ? (snapshot!.accounts as any[]) : [];
  const snapTradeAccountIds = accounts
    .filter(account => account?.source === 'snaptrade' && isPublicInstitution(account?.institution))
    .map(account => String(account?.id || account?.account_id || ''))
    .filter(id => id.length > 0);

  // An existing credential keeps the user eligible on its own. Once the direct
  // feed is live it supersedes SnapTrade's Public accounts, so they leave the
  // snapshot -- and eligibility measured only by their presence would flip to
  // false, locking the user out of replacing their own secret the moment it
  // started working. It also means someone who has since removed the SnapTrade
  // link keeps the direct feed that is now their only source of Public data.
  const credential = await prisma.publicApiCredential.findUnique({
    where: { userId },
    select: { id: true },
  });
  const configured = Boolean(credential);

  return {
    eligible: configured || snapTradeAccountIds.length > 0,
    snapTradeAccountIds,
    configured,
  };
}
