import {
  PublicApiError,
  getPortfolio,
  getTaxLotHoldings,
  listAccounts,
  mintAccessToken,
  type PublicAccountSummary,
  type PublicPortfolio,
} from './client';
import { withExpectedProviderStatuses } from '../../observability/external-provider-monitoring';
import {
  mapPublicAccount,
  mapPublicHoldings,
  publicAccountId,
  publicAccountKind,
  publicAccountLabel,
  publicAccountSubtype,
  publicObservationTime,
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

/**
 * Record a failure against the credential only when the credential is the
 * problem.
 *
 * `lastError` is what makes the profile panel offer to replace the key. A brief
 * Public outage or a timeout says nothing about the stored secret, and inviting
 * a user to rotate a still-valid credential after one is worse than saying
 * nothing: they would revoke a working key to fix a problem it did not cause.
 * Transient failures are logged and left to the next pass; the missing balances
 * already surface through the snapshot's own unavailable-source reporting.
 */
async function noteFailure(userId: string, error: unknown, context: string): Promise<boolean> {
  const rejected = error instanceof PublicApiError && error.credentialRejected;
  if (rejected) {
    await recordFailure(userId, errorMessage(error));
  } else {
    console.warn(`Public API: transient failure while ${context} for user ${userId}`);
  }
  return rejected;
}

/**
 * Read one account, falling back to tax lots when the portfolio endpoint will
 * not serve it.
 *
 * `portfolio/v2` returns 404 for Public's managed-yield accounts -- verified
 * live against TREASURY and BOND_ACCOUNT, both of which carry
 * `tradePermissions: BUY_AND_SELL`, so this is not a matter of them being
 * non-trading accounts. The same accounts return tax lots normally.
 *
 * The fallback is gated on 404 alone. A 500 means Public is briefly unwell and
 * the next pass should retry the real endpoint, not quietly switch to a derived
 * figure and keep serving it as though nothing were wrong.
 */
async function readAccount(
  accessToken: string,
  summary: PublicAccountSummary,
): Promise<PublicPortfolio> {
  try {
    // The 404 caught below is this function's own control flow, not a provider
    // fault, and it fires once per managed-yield account on every ingestion pass.
    // Suppressed here rather than left to alert, so it cannot bury a real Public
    // outage. Scoped to this call alone: a 404 from `listAccounts` or the token
    // mint still means something is genuinely wrong and still reports.
    return await withExpectedProviderStatuses(
      [{ provider: 'public.com', status: 404 }],
      () => getPortfolio(accessToken, summary.accountId),
    );
  } catch (error) {
    if (!(error instanceof PublicApiError) || error.status !== 404) throw error;

    const lots = await getTaxLotHoldings(accessToken, summary.accountId);
    // Empty lots (HIGH_YIELD) or lots with no currentValue are still unknown.
    // Treating that as a successful read would set observed:true with only
    // null-balance stubs and suppress SnapTrade's still-working Public
    // brokerage -- the wipe the all-portfolio-failed gate exists to prevent.
    if (lots.totalValue === null) {
      throw new PublicApiError(
        `Public tax lots returned no holdings value for account ${summary.accountId}.`,
      );
    }
    console.log(
      `Public API: account ${summary.accountId} (${summary.accountType || 'unknown type'}) ` +
      `has no portfolio endpoint; valued from ${lots.positions.length} tax lot position(s)`,
    );
    return {
      accountId: lots.accountId,
      accountType: summary.accountType,
      // A derived sum, not an institution-reported total. `cash` stays null
      // rather than 0 because tax lots say nothing about uninvested cash --
      // claiming zero would understate an account we cannot fully see.
      totalAccountValue: lots.totalValue,
      cash: null,
      positions: lots.positions,
      valuedFromTaxLots: true,
      taxLotsAsOf: lots.asOf,
    };
  }
}

export async function fetchPublicData(userId: string): Promise<PublicFetchResult | null> {
  const secret = await readSecret(userId);
  if (!secret) return null;

  let accessToken: string;
  try {
    accessToken = await mintAccessToken(secret);
  } catch (error) {
    return {
      accounts: [],
      holdings: [],
      errors: [],
      credentialRejected: await noteFailure(userId, error, 'authenticating'),
      observed: false,
    };
  }

  let summaries: Awaited<ReturnType<typeof listAccounts>>;
  try {
    summaries = await listAccounts(accessToken);
  } catch (error) {
    return {
      accounts: [],
      holdings: [],
      errors: [],
      credentialRejected: await noteFailure(userId, error, 'listing accounts'),
      observed: false,
    };
  }

  // One timestamp for the whole pass. A direct read has no provider-side sync to
  // date the value from -- the read is the observation -- and a single stamp keeps
  // every account in one pass carrying the same "as of".
  const observedAt = new Date().toISOString();

  const settled = await mapWithConcurrency(summaries, PORTFOLIO_CONCURRENCY, summary =>
    readAccount(accessToken, summary),
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
        holdings.push(...mapPublicHoldings(portfolio, publicObservationTime(portfolio, observedAt)));
      }
    } else {
      const message = errorMessage(result.reason);
      // Name the account and its type. When one Public product works and another
      // does not, which types failed is the entire diagnosis, and a bare count
      // does not carry it.
      console.warn(
        `Public API: portfolio read failed for account ${summary.accountId} ` +
        `(${summary.accountType || 'unknown type'}): ${message}`,
      );
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
