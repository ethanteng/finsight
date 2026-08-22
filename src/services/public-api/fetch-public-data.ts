import {
  PublicApiError,
  getPortfolio,
  listAccounts,
  mintAccessToken,
  type PublicPortfolio,
} from './client';
import { mapPublicAccount, mapPublicHoldings, type MappedPublicAccount, type MappedPublicHolding } from './account-mapper';
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
      holdings.push(...mapPublicHoldings(portfolio, observedAt));
    } else {
      errors.push({ accountId: summary.accountId, error: errorMessage(result.reason) });
    }
  });

  // A pass that reached Public at all proves the secret works, even if an
  // individual account errored.
  await recordSuccess(userId);
  if (errors.length > 0) {
    console.warn(`Public API: ${errors.length} account(s) failed for user ${userId}`);
  }

  return { accounts, holdings, errors, credentialRejected: false };
}
