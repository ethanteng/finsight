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
 *
 * The signals have to survive an institution re-labelling its own accounts between Items, which
 * Betterment does on nearly every relink: the same goal came back as
 * "Retirement - Roth IRA" under one Item and "Retirement - Tax-Coordinated Portfolio - Roth IRA"
 * under the next, with a mask where the old Item had none and a subtype of `brokerage` where the
 * old Item said `ira`. Nothing in an exact-match cascade sees through that, so a containment pass
 * matches a name that is the other with words inserted - guarded by mutual exclusivity, so an
 * ambiguous pairing is dropped rather than guessed.
 *
 * Superseding DROPS the previous connection's transactions rather than migrating them. Plaid
 * transaction IDs are Item-scoped, so the replacement Item re-imports the same history under new
 * `plaidTransactionId`s on its first cursor-less `transactionsSync`. Persistence dedupes only on
 * that column, so carrying the old rows across would leave two copies of the same spending and
 * double both expenses and income. The replacement's copy is also the fresher one - it reflects
 * the institution's current categorization and any post-hoc corrections. The tradeoff is that
 * history older than the replacement Item's available window is not carried over.
 */

export type MatchStrategy = 'persistent-id' | 'mask' | 'name' | 'name-containment' | 'balance';

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
  /**
   * When `currentBalance` was observed. Optional: the exchange path fetches both Items moments
   * apart and can omit it. Offline callers (the cleanup script) read balances persisted at
   * different times and must supply it so drifted balances are not treated as evidence.
   */
  balanceObservedAt?: Date | string | null;
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

/**
 * How far apart two balance observations may be and still be comparable. Equal balances are only
 * evidence of identity when both sides were observed in the same sweep; across a longer gap the
 * accounts have simply drifted and equality is coincidence.
 */
const BALANCE_OBSERVATION_WINDOW_MS = 6 * 60 * 60 * 1000;

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
 * Type without subtype. Subtype is not stable across Items - Betterment reported the same goal as
 * `ira` under one Item and `brokerage` under its replacement - so the containment pass scopes on
 * the coarser value. Type itself does stay put, and it is what keeps a checking account from being
 * matched against an investment account.
 */
function baseTypeKey(account: ConnectionAccount): string {
  return (account.type || '').trim().toLowerCase();
}

/**
 * The words of an account name that carry meaning. Separator-only tokens ('-', '&') are dropped so
 * that punctuation drift between two Items ("Retirement - Roth IRA" vs "Retirement Roth IRA") is
 * not mistaken for a difference in the name.
 */
function contentWords(name: string | null | undefined): string[] {
  return normalizeAccountName(name)
    .split(' ')
    .filter(word => /[a-z0-9]/.test(word));
}

/** Greedy subsequence test - `shorter` appears inside `longer` in order, gaps allowed. */
function isWordSubsequence(shorter: string[], longer: string[]): boolean {
  let index = 0;
  for (const word of longer) {
    if (index < shorter.length && shorter[index] === word) index += 1;
  }
  return index === shorter.length;
}

/**
 * How many meaningful words the shorter name must have before containment counts as evidence. A
 * one-word name ("Checking", "Savings") is contained by half the account names a bank issues, and
 * matching on it would let a second, genuinely separate login look like a rename of the first.
 */
const MIN_CONTAINMENT_WORDS = 2;

/**
 * True when one name is the other with extra words inserted - the shape institutions produce when
 * they re-label accounts between Items. Betterment's September relink turned
 * "Retirement - Roth IRA" into "Retirement - Tax-Coordinated Portfolio - Roth IRA" and appended
 * " - Joint Automated Investing" to every goal, which no exact-name comparison can see through.
 */
function namesContainOneAnother(a: ConnectionAccount, b: ConnectionAccount): boolean {
  const aWords = contentWords(a.name);
  const bWords = contentWords(b.name);
  if (aWords.length < MIN_CONTAINMENT_WORDS || bWords.length < MIN_CONTAINMENT_WORDS) return false;
  return aWords.length <= bWords.length
    ? isWordSubsequence(aWords, bWords)
    : isWordSubsequence(bWords, aWords);
}

function distinctPersistentId(account: ConnectionAccount): string {
  const persistentId = (account.persistentAccountId || '').trim();
  return persistentId && persistentId !== account.plaidAccountId ? persistentId : '';
}

/**
 * A stable identifier that DISAGREES is proof the two accounts are different, and outranks any
 * weaker signal that happens to agree. Without this, two logins at one institution that both
 * expose an account named "Checking" would match on name despite reporting different masks - the
 * old connection would look fully covered and be superseded, destroying a real account.
 */
function hasConflictingStableIdentifier(a: ConnectionAccount, b: ConnectionAccount): boolean {
  const aMask = (a.mask || '').trim();
  const bMask = (b.mask || '').trim();
  if (aMask && bMask && aMask !== bMask) return true;

  const aPersistentId = distinctPersistentId(a);
  const bPersistentId = distinctPersistentId(b);
  if (aPersistentId && bPersistentId && aPersistentId !== bPersistentId) return true;

  return false;
}

/**
 * Match by a key that must be unambiguous on BOTH sides. A key held by two previous accounts or
 * two current accounts is skipped rather than guessed - a wrong match deletes a real account and
 * its history.
 */
function observedAt(account: ConnectionAccount): number | null {
  const raw = account.balanceObservedAt;
  if (!raw) return null;
  const parsed = raw instanceof Date ? raw.getTime() : Date.parse(raw);
  return Number.isNaN(parsed) ? null : parsed;
}

/**
 * Equal balances only prove identity when both sides were observed close together. Callers that
 * omit the timestamp are fetching both Items in the same breath, so they are trusted.
 */
function balancesComparable(a: ConnectionAccount, b: ConnectionAccount): boolean {
  const aObserved = observedAt(a);
  const bObserved = observedAt(b);
  if (aObserved === null || bObserved === null) return true;
  return Math.abs(aObserved - bObserved) <= BALANCE_OBSERVATION_WINDOW_MS;
}

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
    if (hasConflictingStableIdentifier(previousAccounts[0], currentAccounts[0])) continue;
    if (strategy === 'balance' && !balancesComparable(previousAccounts[0], currentAccounts[0])) continue;
    matches.push({ previous: previousAccounts[0], current: currentAccounts[0], strategy });
    claimed.previous.add(previousAccounts[0].id);
    claimed.current.add(currentAccounts[0].id);
  }
}

/**
 * Pairwise pass for names that are not equal but contain one another. Unlike `matchByKey` there is
 * no key to bucket on, so ambiguity is ruled out by requiring the pairing to be mutually exclusive:
 * the previous account must contain-or-be-contained-by exactly one candidate on the current side,
 * and that candidate must have exactly one candidate back. Anything less is left unmatched, which
 * costs the user a duplicate connection to remove by hand - the cheap failure. Guessing costs a
 * real account and its history.
 */
function matchByNameContainment(
  previous: ConnectionAccount[],
  current: ConnectionAccount[],
  claimed: { previous: Set<string>; current: Set<string> },
  matches: AccountMatch[]
): void {
  const eligible = (accounts: ConnectionAccount[], claimedIds: Set<string>) =>
    accounts.filter(
      account =>
        !claimedIds.has(account.id) && contentWords(account.name).length >= MIN_CONTAINMENT_WORDS
    );

  const previousPool = eligible(previous, claimed.previous);
  const currentPool = eligible(current, claimed.current);

  const currentCandidates = new Map<string, ConnectionAccount[]>();
  const previousCandidates = new Map<string, ConnectionAccount[]>();

  for (const previousAccount of previousPool) {
    for (const currentAccount of currentPool) {
      if (baseTypeKey(previousAccount) !== baseTypeKey(currentAccount)) continue;
      if (hasConflictingStableIdentifier(previousAccount, currentAccount)) continue;
      if (!namesContainOneAnother(previousAccount, currentAccount)) continue;

      if (!currentCandidates.has(previousAccount.id)) currentCandidates.set(previousAccount.id, []);
      currentCandidates.get(previousAccount.id)!.push(currentAccount);
      if (!previousCandidates.has(currentAccount.id)) previousCandidates.set(currentAccount.id, []);
      previousCandidates.get(currentAccount.id)!.push(previousAccount);
    }
  }

  for (const previousAccount of previousPool) {
    const candidates = currentCandidates.get(previousAccount.id);
    if (!candidates || candidates.length !== 1) continue;
    const currentAccount = candidates[0];
    if ((previousCandidates.get(currentAccount.id) || []).length !== 1) continue;

    matches.push({ previous: previousAccount, current: currentAccount, strategy: 'name-containment' });
    claimed.previous.add(previousAccount.id);
    claimed.current.add(currentAccount.id);
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

  // 4. One name contained in the other, scoped by account type only. This is what survives an
  //    institution re-labelling its accounts between Items, which is otherwise invisible: the
  //    replacement reports no shared mask, no persistent id, and (days later) a drifted balance.
  matchByNameContainment(previous, current, claimed, matches);

  // 5. Exact balance, scoped by account type. Sound only when both sides were observed together,
  //    so the same logical account reports the same balance to the cent - see balancesComparable.
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

/**
 * Written to AccessToken.lastError alongside supersededAt, for operator readability only.
 * Never branch on it: token revalidation clears lastError on any successful Plaid call, and a
 * superseded Item usually still works at Plaid. `supersededAt` is the durable marker.
 */
export const SUPERSEDED_ERROR_CODE = 'SUPERSEDED_BY_RELINK';

export type SupersededConnection = {
  tokenId: string;
  itemId: string | null;
  accountsRemoved: number;
  transactionsDropped: number;
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
  $transaction?: <T>(fn: (tx: PrismaLike) => Promise<T>) => Promise<T>;
  account: {
    findMany: (args: any) => Promise<any[]>;
    delete: (args: any) => Promise<any>;
  };
  accessToken: {
    findMany: (args: any) => Promise<any[]>;
    update: (args: any) => Promise<any>;
  };
  transaction: {
    deleteMany: (args: any) => Promise<{ count: number }>;
  };
};

/**
 * Map a persisted Account row onto the matcher's input shape. Callers must use this rather than
 * passing rows through untyped - it is what carries `balanceObservedAt`, without which the balance
 * pass silently trusts stale balances.
 *
 * The observation time is carried even at exchange time. Only the SURVIVING side is freshly
 * fetched there; the previous side is read from the database and cannot be refreshed - a re-linked
 * Item no longer exposes the old account ids, and the old token is often broken (that is usually
 * why the user re-linked). Comparing a live balance against a weeks-old one is not evidence, so a
 * stale previous side is deliberately left unmatched and preserved rather than matched and deleted.
 */
export function toConnectionAccount(record: any): ConnectionAccount {
  return {
    id: record.id,
    plaidAccountId: record.plaidAccountId,
    persistentAccountId: record.persistentAccountId,
    name: record.name,
    type: record.type,
    subtype: record.subtype,
    mask: record.mask,
    currentBalance: record.currentBalance,
    balanceObservedAt: record.balanceLastFetched ?? record.lastSynced ?? null
  };
}

/**
 * Deactivate any other active connection to `institutionName` whose accounts are fully covered by
 * the connection identified by `keepTokenId`, dropping the superseded accounts' stale transactions
 * (the replacement Item re-imports them). Connections that are not fully covered are reported in
 * `skipped` and left untouched.
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
      name: true, type: true, subtype: true, mask: true, currentBalance: true,
          balanceLastFetched: true, lastSynced: true
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
    where: { userId, isActive: true, supersededAt: null, NOT: { id: keepTokenId } },
    select: {
      id: true,
      itemId: true,
      institutionName: true,
      accounts: {
        select: {
          id: true, plaidAccountId: true, persistentAccountId: true, institution: true,
          name: true, type: true, subtype: true, mask: true, currentBalance: true,
          balanceLastFetched: true, lastSynced: true
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

    // Coverage must be proven for EVERY account on the token, not just the ones tagged with this
    // institution. Legacy rows can have a null institution; deactivating the token on the strength
    // of the tagged subset alone would silently strand those accounts, since both live and
    // persisted ingestion skip a superseded token.
    const previousRecords = token.accounts || [];
    if (previousRecords.length === 0) {
      // An active token at this institution with no accounts of its own is a dead connection.
      log(`   🔻 Deactivating empty duplicate connection ${token.id} (item ${token.itemId})`);
      if (!dryRun) {
        await prisma.accessToken.update({
          where: { id: token.id },
          data: { isActive: false, lastError: SUPERSEDED_ERROR_CODE, supersededAt: new Date() }
        });
      }
      report.superseded.push({
        tokenId: token.id, itemId: token.itemId, accountsRemoved: 0,
        transactionsDropped: 0, strategies: []
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

    let transactionsDropped = 0;
    if (!dryRun) {
      const applySupersede = async (db: PrismaLike) => {
        // Drop, don't migrate: the replacement Item re-imports this history under new ids.
        for (const match of result.matches) {
          const dropped = await db.transaction.deleteMany({
            where: { accountId: match.previous.id }
          });
          transactionsDropped += dropped.count;
        }
        for (const match of result.matches) {
          await db.account.delete({ where: { id: match.previous.id } });
        }
        await db.accessToken.update({
          where: { id: token.id },
          data: { isActive: false, lastError: SUPERSEDED_ERROR_CODE, supersededAt: new Date() }
        });
      };

      if (prisma.$transaction) {
        await prisma.$transaction(applySupersede);
      } else {
        await applySupersede(prisma);
      }
    }

    const strategies = [...new Set(result.matches.map(match => match.strategy))];
    log(
      `   ✅ Superseded connection ${token.id} (item ${token.itemId}): removed ` +
      `${result.matches.length} duplicate account(s), dropped ${transactionsDropped} stale transaction(s) ` +
      `[matched by ${strategies.join(', ')}]`
    );
    report.superseded.push({
      tokenId: token.id,
      itemId: token.itemId,
      accountsRemoved: result.matches.length,
      transactionsDropped,
      strategies
    });
  }

  return report;
}
