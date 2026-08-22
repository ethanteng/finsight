import {
  PublicApiError,
  getPortfolio,
  listAccounts,
  mintAccessToken,
  type PublicAccountSummary,
  type PublicPortfolio,
} from './client';
import {
  mapPublicAccount,
  mapPublicHoldings,
  publicAccountId,
  publicAccountKind,
  publicAccountLabel,
  publicAccountSubtype,
  type MappedPublicAccount,
  type MappedPublicHolding,
} from './account-mapper';
import { readSecret, recordFailure, recordSuccess } from './credential-store';

/**
 * Read a user's Public accounts directly, bypassing SnapTrade.
 *
 * Returns null when the user has no stored secret, so callers can treat "not
 * configured" as an ordinary absence rather than a failure.
 */

export interface PublicFetchResult {
  accounts: MappedPublicAccount[];
  holdings: MappedPublicHolding[];
  /** Public account ids that failed, so the snapshot can mark them unavailable. */
  errors: Array<{ accountId: string; error: string }>;
  /** True when the stored secret was rejected and the user must supply a new one. */
  credentialRejected: boolean;
  /**
   * True only after Public accepted the secret, returned an account list
   * (possibly empty), and at least one portfolio read succeeded (or the list
   * was empty). Auth, list, or total portfolio failures leave this false so
   * callers do not suppress SnapTrade's still-working Public brokerage balances.
   */
  observed: boolean;
}

/** Cap concurrent portfolio reads so a multi-account user does not burst Public. */
const PORTFOLIO_CONCURRENCY = 4;

async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T) => Promise<R>,
): Promise<Array<PromiseSettledResult<R>>> {
  const results: Array<PromiseSettledResult<R>> = new Array(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      try {
        results[index] = { status: 'fulfilled', value: await worker(items[index]) };
      } catch (reason) {
        results[index] = { status: 'rejected', reason };
      }
    }
  });
  await Promise.all(runners);
  return results;
}

function errorMessage(error: unknown): string {
  return error instanceof PublicApiError ? error.message : 'Public API request failed.';
}

/**
 * Placeholder for an account Public listed but whose portfolio could not be read.
 *
 * After SnapTrade's Public rows are suppressed, omitting these would silently
 * erase balances that previously existed. A null current balance lets the
 * snapshot mark the account unavailable instead.
 */
function mapFailedPublicAccount(
  summary: PublicAccountSummary,
  observedAt: string,
): MappedPublicAccount {
  const id = publicAccountId(summary.accountId);
  return {
    account_id: id,
    id,
    name: publicAccountLabel(summary.accountType),
    type: publicAccountKind(summary.accountType),
    subtype: publicAccountSubtype(summary.accountType),
    balance: { current: null, iso_currency_code: 'USD' },
    institution: 'Public',
    source: 'public',
    persistentAccountId: id,
    snapshotTimestamp: observedAt,
    lastSyncedAt: observedAt,
    publicAccountType: summary.accountType,
  };
}

export async function fetchPublicData(userId: string): Promise<PublicFetchResult | null> {
  const secret = await readSecret(userId);
  if (!secret) return null;

  let accessToken: string;
  try {
    accessToken = await mintAccessToken(secret);
  } catch (error) {
    const message = errorMessage(error);
    await recordFailure(userId, message);
    return {
      accounts: [],
      holdings: [],
      errors: [],
      credentialRejected: error instanceof PublicApiError ? error.credentialRejected : false,
      observed: false,
    };
  }

  let summaries: Awaited<ReturnType<typeof listAccounts>>;
  try {
    summaries = await listAccounts(accessToken);
  } catch (error) {
    const message = errorMessage(error);
    await recordFailure(userId, message);
    return {
      accounts: [],
      holdings: [],
      errors: [],
      credentialRejected: error instanceof PublicApiError ? error.credentialRejected : false,
      observed: false,
    };
  }

  // One timestamp for the whole pass. A direct read has no provider-side sync to
  // date the value from -- the read is the observation -- and a single stamp keeps
  // every account in one pass carrying the same "as of".
  const observedAt = new Date().toISOString();

  const settled = await mapWithConcurrency(summaries, PORTFOLIO_CONCURRENCY, summary =>
    getPortfolio(accessToken, summary.accountId),
  );

  const accounts: MappedPublicAccount[] = [];
  const holdings: MappedPublicHolding[] = [];
  const errors: Array<{ accountId: string; error: string }> = [];

  settled.forEach((result, index) => {
    const summary = summaries[index];
    if (result.status === 'fulfilled') {
      const portfolio: PublicPortfolio = result.value;
      accounts.push(mapPublicAccount(portfolio, observedAt));
      // Cash products are valued from the account balance. Mapping their
      // positions into the investment portfolio would double-count the same
      // dollars in totalCash and totalInvestments.
      if (publicAccountKind(summary.accountType) !== 'depository') {
        holdings.push(...mapPublicHoldings(portfolio, observedAt));
      }
    } else {
      const message = errorMessage(result.reason);
      errors.push({ accountId: summary.accountId, error: message });
      accounts.push(mapFailedPublicAccount(summary, observedAt));
    }
  });

  // Listing succeeded but every portfolio read failed. Claiming observation
  // here would suppress SnapTrade's still-working Public brokerage and leave
  // only null-balance stubs — the same wipe the auth-failure gate exists to
  // prevent. Leave SnapTrade in place and retry on the next pass.
  if (summaries.length > 0 && errors.length === summaries.length) {
    console.warn(
      `Public API: every portfolio read failed for user ${userId}; ` +
        'leaving SnapTrade Public accounts in place',
    );
    return {
      accounts: [],
      holdings: [],
      errors: [],
      credentialRejected: false,
      observed: false,
    };
  }

  // A pass that returned at least one portfolio proves the secret works, even
  // if an individual account errored.
  await recordSuccess(userId);
  if (errors.length > 0) {
    console.warn(`Public API: ${errors.length} account(s) failed for user ${userId}`);
  }

  return { accounts, holdings, errors, credentialRejected: false, observed: true };
}
