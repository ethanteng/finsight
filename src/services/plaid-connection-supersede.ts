/**
 * Relink reconciliation for Plaid connections.
 *
 * Re-linking an institution through a fresh Link flow produces a NEW Plaid Item with a new
 * item_id and brand-new account_ids for the same logical accounts. The old Item's AccessToken
 * stays active, so every downstream consumer sees both copies: account lists, net worth, and
 * the AI context all double-count the institution.
 *
 * `persistent_account_id` would resolve this, but Plaid only returns it for a subset of
 * institutions (Betterment, for one, returns null). This module matches a previous connection's
 * accounts against the current connection's accounts using a strict cascade of signals, and only
 * supersedes the old connection when the new one covers ALL of its accounts. Partial coverage
 * means the two Items are genuinely different logins at the same institution (e.g. personal and
 * business at the same bank), and both are left active.
 */

export type MatchStrategy = 'persistent-id' | 'mask' | 'name' | 'balance';

export type ConnectionAccount = {
  /** Caller-owned handle (database id for persisted accounts). */
  id: string;
  plaidAccountId: string;
  persistentAccountId?: string | null;
  name: string;
  type: string;
  subtype?: string | null;
  mask?: string | null;
  currentBalance?: number | null;
};

export type AccountMatch = {
  previous: ConnectionAccount;
  current: ConnectionAccount;
  strategy: MatchStrategy;
};

export type MatchResult = {
  matches: AccountMatch[];
  unmatchedPrevious: ConnectionAccount[];
  unmatchedCurrent: ConnectionAccount[];
  /** True when every previous account maps to a distinct current account. */
  fullyCovered: boolean;
};

/** Balances must agree to the cent - this runs right after both Items were fetched. */
const BALANCE_EPSILON = 0.005;

const HTML_ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&apos;': "'",
  '&nbsp;': ' '
};

/**
 * Institutions vary in how they encode account names across Items - Betterment HTML-escapes
 * ampersands in some feeds and not others. Decode and normalize so the same account name from
 * two Items compares equal.
 */
export function normalizeAccountName(raw: string | null | undefined): string {
  if (!raw) return '';
  const decoded = raw.replace(/&(amp|lt|gt|quot|#39|apos|nbsp);/g, match => HTML_ENTITIES[match] ?? match);
  return decoded.trim().toLowerCase().replace(/\s+/g, ' ');
}

function typeKey(account: ConnectionAccount): string {
  return `${(account.type || '').trim().toLowerCase()}|${(account.subtype || '').trim().toLowerCase()}`;
}

/**
 * Match by a key that must be unambiguous on BOTH sides. A key held by two previous accounts or
 * two current accounts is skipped rather than guessed - a wrong match migrates transactions onto
 * the wrong account and deletes real data.
 */
function matchByKey(
  previous: ConnectionAccount[],
  current: ConnectionAccount[],
  strategy: MatchStrategy,
  keyOf: (account: ConnectionAccount) => string | null,
  claimed: { previous: Set<string>; current: Set<string> },
  matches: AccountMatch[]
): void {
  const bucket = (accounts: ConnectionAccount[], claimedIds: Set<string>) => {
    const map = new Map<string, ConnectionAccount[]>();
    for (const account of accounts) {
      if (claimedIds.has(account.id)) continue;
      const key = keyOf(account);
      if (!key) continue;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(account);
    }
    return map;
  };

  const previousByKey = bucket(previous, claimed.previous);
  const currentByKey = bucket(current, claimed.current);

  for (const [key, previousAccounts] of previousByKey) {
    const currentAccounts = currentByKey.get(key);
    if (previousAccounts.length !== 1 || !currentAccounts || currentAccounts.length !== 1) continue;
    matches.push({ previous: previousAccounts[0], current: currentAccounts[0], strategy });
    claimed.previous.add(previousAccounts[0].id);
    claimed.current.add(currentAccounts[0].id);
  }
}

export function matchAccountsAcrossConnections(
  previous: ConnectionAccount[],
  current: ConnectionAccount[]
): MatchResult {
  const matches: AccountMatch[] = [];
  const claimed = { previous: new Set<string>(), current: new Set<string>() };

  // 1. Plaid's stable identifier, when the institution provides it.
  matchByKey(previous, current, 'persistent-id', account => {
    const persistentId = (account.persistentAccountId || '').trim();
    if (!persistentId || persistentId === account.plaidAccountId) return null;
    return `persistent:${persistentId}`;
  }, claimed, matches);

  // 2. Last four digits, scoped by account type. Only usable when both Items report a mask.
  matchByKey(previous, current, 'mask', account => {
    const mask = (account.mask || '').trim();
    return mask ? `mask:${typeKey(account)}|${mask}` : null;
  }, claimed, matches);

  // 3. Normalized display name, scoped by account type.
  matchByKey(previous, current, 'name', account => {
    const name = normalizeAccountName(account.name);
    return name ? `name:${typeKey(account)}|${name}` : null;
  }, claimed, matches);

  // 4. Exact balance, scoped by account type. Sound only because both Items were just fetched,
  //    so the same logical account reports the same balance to the cent.
  matchByKey(previous, current, 'balance', account => {
    const balance = account.currentBalance;
    if (balance === null || balance === undefined || Number.isNaN(balance)) return null;
    return `balance:${typeKey(account)}|${Math.round(balance / BALANCE_EPSILON)}`;
  }, claimed, matches);

  const unmatchedPrevious = previous.filter(account => !claimed.previous.has(account.id));
  const unmatchedCurrent = current.filter(account => !claimed.current.has(account.id));

  return {
    matches,
    unmatchedPrevious,
    unmatchedCurrent,
    fullyCovered: previous.length > 0 && unmatchedPrevious.length === 0
  };
}

/** Marker written to AccessToken.lastError so superseded connections are distinguishable from failures. */
export const SUPERSEDED_ERROR_CODE = 'SUPERSEDED_BY_RELINK';

export type SupersededConnection = {
  tokenId: string;
  itemId: string | null;
  accountsRemoved: number;
  transactionsMigrated: number;
  strategies: MatchStrategy[];
};

export type SkippedConnection = {
  tokenId: string;
  itemId: string | null;
  reason: string;
  unmatchedPreviousNames: string[];
};

export type SupersedeReport = {
  superseded: SupersededConnection[];
  skipped: SkippedConnection[];
};

type PrismaLike = {
  account: {
    findMany: (args: any) => Promise<any[]>;
    delete: (args: any) => Promise<any>;
  };
  accessToken: {
    findMany: (args: any) => Promise<any[]>;
    update: (args: any) => Promise<any>;
  };
  transaction: {
    updateMany: (args: any) => Promise<{ count: number }>;
  };
};

function toConnectionAccount(record: any): ConnectionAccount {
  return {
    id: record.id,
    plaidAccountId: record.plaidAccountId,
    persistentAccountId: record.persistentAccountId,
    name: record.name,
    type: record.type,
    subtype: record.subtype,
    mask: record.mask,
    currentBalance: record.currentBalance
  };
}

/**
 * Deactivate any other active connection to `institutionName` whose accounts are fully covered by
 * the connection identified by `keepTokenId`, migrating transactions onto the surviving accounts
 * first. Connections that are not fully covered are reported in `skipped` and left untouched.
 */
export async function supersedeDuplicateInstitutionConnections(options: {
  prisma: PrismaLike;
  userId: string;
  keepTokenId: string;
  institutionName: string;
  dryRun?: boolean;
  log?: (message: string) => void;
}): Promise<SupersedeReport> {
  const { prisma, userId, keepTokenId, institutionName, dryRun = false } = options;
  const log = options.log ?? (() => {});
  const report: SupersedeReport = { superseded: [], skipped: [] };

  const currentRecords = await prisma.account.findMany({
    where: { userId, accessTokenId: keepTokenId },
    select: {
      id: true, plaidAccountId: true, persistentAccountId: true,
      name: true, type: true, subtype: true, mask: true, currentBalance: true
    }
  });
  if (currentRecords.length === 0) {
    log(`   ⏭️  No persisted accounts for the surviving connection yet - skipping supersede check`);
    return report;
  }
  const current = currentRecords.map(toConnectionAccount);

  // Candidate stale connections: other active tokens for this user at the same institution.
  // AccessToken.institutionName is backfilled lazily, so also match via the institution recorded
  // on the token's accounts.
  const otherTokens = await prisma.accessToken.findMany({
    where: { userId, isActive: true, NOT: { id: keepTokenId } },
    select: {
      id: true,
      itemId: true,
      institutionName: true,
      accounts: {
        select: {
          id: true, plaidAccountId: true, persistentAccountId: true, institution: true,
          name: true, type: true, subtype: true, mask: true, currentBalance: true
        }
      }
    }
  });

  for (const token of otherTokens) {
    const accountsAtInstitution = (token.accounts || []).filter(
      (account: any) => account.institution === institutionName
    );
    const isSameInstitution = token.institutionName === institutionName || accountsAtInstitution.length > 0;
    if (!isSameInstitution) continue;

    const previousRecords = accountsAtInstitution.length > 0 ? accountsAtInstitution : token.accounts || [];
    if (previousRecords.length === 0) {
      // An active token at this institution with no accounts of its own is a dead connection.
      log(`   🔻 Deactivating empty duplicate connection ${token.id} (item ${token.itemId})`);
      if (!dryRun) {
        await prisma.accessToken.update({
          where: { id: token.id },
          data: { isActive: false, lastError: SUPERSEDED_ERROR_CODE }
        });
      }
      report.superseded.push({
        tokenId: token.id, itemId: token.itemId, accountsRemoved: 0,
        transactionsMigrated: 0, strategies: []
      });
      continue;
    }

    const previous = previousRecords.map(toConnectionAccount);
    const result = matchAccountsAcrossConnections(previous, current);

    if (!result.fullyCovered) {
      const unmatchedPreviousNames = result.unmatchedPrevious.map(account => account.name);
      log(
        `   ⏭️  Keeping connection ${token.id} (item ${token.itemId}) - the new connection does not ` +
        `cover ${result.unmatchedPrevious.length}/${previous.length} of its accounts ` +
        `(${unmatchedPreviousNames.join(', ')}). Treating it as a separate login.`
      );
      report.skipped.push({
        tokenId: token.id,
        itemId: token.itemId,
        reason: 'partial-coverage',
        unmatchedPreviousNames
      });
      continue;
    }

    let transactionsMigrated = 0;
    if (!dryRun) {
      for (const match of result.matches) {
        const migrated = await prisma.transaction.updateMany({
          where: { accountId: match.previous.id },
          data: { accountId: match.current.id }
        });
        transactionsMigrated += migrated.count;
      }
      for (const match of result.matches) {
        await prisma.account.delete({ where: { id: match.previous.id } });
      }
      await prisma.accessToken.update({
        where: { id: token.id },
        data: { isActive: false, lastError: SUPERSEDED_ERROR_CODE }
      });
    }

    const strategies = [...new Set(result.matches.map(match => match.strategy))];
    log(
      `   ✅ Superseded connection ${token.id} (item ${token.itemId}): removed ` +
      `${result.matches.length} duplicate account(s), migrated ${transactionsMigrated} transaction(s) ` +
      `[matched by ${strategies.join(', ')}]`
    );
    report.superseded.push({
      tokenId: token.id,
      itemId: token.itemId,
      accountsRemoved: result.matches.length,
      transactionsMigrated,
      strategies
    });
  }

  return report;
}
