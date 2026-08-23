import { getProviderRequestTimeoutMs } from '../provider-request-policy';

/**
 * Read-only client for Public.com's personal API.
 *
 * Exists because SnapTrade cannot complete an initial holdings sync for Public's
 * managed-yield products (TREASURY, HIGH_YIELD, BOND_ACCOUNT), which return HTTP
 * 425 "Initial holdings sync not yet completed" indefinitely -- observed for over
 * 40 hours across two users and surviving a full disconnect/reconnect. Public's
 * own API treats those as first-class account types.
 *
 * DELIBERATELY READ-ONLY. The same Public API places, replaces and cancels orders,
 * and the personal secret is not scope-limited, so nothing here may ever call a
 * mutating endpoint. Reachable paths: token mint (POST), `/account`,
 * `/{accountId}/portfolio/v2`, and `/{accountId}/taxlots/unrealized`. A test
 * asserts no order or other mutating path appears in this module.
 */

const PUBLIC_API_BASE_URL = 'https://api.public.com';
const ACCESS_TOKEN_PATH = '/userapiauthservice/personal/access-tokens';
const ACCOUNTS_PATH = '/userapigateway/trading/account';
const PORTFOLIO_PATH = (accountId: string) =>
  `/userapigateway/trading/${encodeURIComponent(accountId)}/portfolio/v2`;
/**
 * Tax lots, used as the balance source for accounts `portfolio/v2` will not serve.
 *
 * Public's managed-yield accounts (TREASURY, BOND_ACCOUNT) 404 on `portfolio/v2`
 * while returning tax lots normally -- verified against the live API. The lots
 * carry `currentValue` per position, so a holdings value is derivable where the
 * portfolio endpoint offers nothing at all.
 */
const TAX_LOTS_PATH = (accountId: string) =>
  `/userapigateway/trading/${encodeURIComponent(accountId)}/taxlots/unrealized`;

/**
 * Access-token validity requested when minting.
 *
 * Public defaults to 15 minutes. A short window is requested deliberately: the
 * token is held only in memory for the duration of one ingestion pass, and a
 * shorter life limits the blast radius if it leaks into a log or a heap dump.
 * Long enough to fetch every account's portfolio, not long enough to be worth
 * caching across requests.
 */
const ACCESS_TOKEN_VALIDITY_MINUTES = 5;

/** Public account types. The last three are why this integration exists. */
export type PublicAccountType =
  | 'BROKERAGE'
  | 'TRADITIONAL_IRA'
  | 'ROTH_IRA'
  | 'ENTITY'
  | 'RIA_ASSET'
  | 'TREASURY'
  | 'HIGH_YIELD'
  | 'BOND_ACCOUNT';

export interface PublicPosition {
  symbol: string | null;
  name: string | null;
  instrumentType: string | null;
  quantity: number | null;
  currentValue: number | null;
  lastPrice: number | null;
}

export interface PublicPortfolio {
  accountId: string;
  accountType: PublicAccountType | string | null;
  /** Institution-reported total. Preferred over summing positions. */
  totalAccountValue: number | null;
  cash: number | null;
  positions: PublicPosition[];
  /**
   * True when the value came from tax lots because `portfolio/v2` would not
   * serve this account. A derived sum of positions rather than a reported
   * total, so it cannot see uninvested cash -- worth carrying so the snapshot
   * can say where the number came from.
   */
  valuedFromTaxLots?: boolean;
  /** Public's valuation date for the lots, when the fallback was used. */
  taxLotsAsOf?: string | null;
}

export interface PublicAccountSummary {
  accountId: string;
  accountType: PublicAccountType | string | null;
}

export class PublicApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    /** True when the secret itself was rejected, so retrying will not help. */
    readonly credentialRejected = false,
  ) {
    super(message);
    this.name = 'PublicApiError';
  }
}

/** Coerce Public's stringified decimals without turning a missing value into 0. */
function numberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = typeof value === 'number' ? value : Number(String(value));
  return Number.isFinite(parsed) ? parsed : null;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

interface PublicRequestInit {
  method: 'GET' | 'POST';
  headers?: Record<string, string>;
  body?: string;
  signal?: AbortSignal;
}

/**
 * Public's structured error fields, for the log line only.
 *
 * Bounded and field-scoped rather than dumping the body: a provider payload can
 * be large and can carry detail that has no business in a log. `code` and
 * `detail` are what Public uses to say what went wrong -- the 425s that motivated
 * this whole integration arrived as `{"code": "3012", "detail": "Initial holdings
 * sync not yet completed"}`.
 */
async function readErrorDetail(response: Response): Promise<string | null> {
  try {
    const body: any = await response.json();
    const code = typeof body?.code === 'string' || typeof body?.code === 'number' ? String(body.code) : null;
    const detail = typeof body?.detail === 'string' ? body.detail.slice(0, 200) : null;
    return [code && `code ${code}`, detail].filter(Boolean).join(': ') || null;
  } catch {
    return null;
  }
}

async function requestJson(
  path: string,
  init: PublicRequestInit,
  context: string,
): Promise<any> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), getProviderRequestTimeoutMs('PUBLIC_API_REQUEST_TIMEOUT_MS'));
  let response: Response;
  try {
    response = await fetch(`${PUBLIC_API_BASE_URL}${path}`, { ...init, signal: controller.signal });
  } catch (error) {
    // The provider message can carry the request URL, and for the token call the
    // body carries the secret. Neither may reach a caller or a log line.
    throw new PublicApiError(`Public API request failed while ${context}.`);
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    // Log the status and Public's own error code server-side.
    //
    // The user-facing message stays deliberately opaque, but making the *status*
    // opaque too was a mistake: it left no way to tell a 404 from a 500 without a
    // redeploy, which is exactly the question when one account type works and
    // another does not.
    //
    // Safe for every call except the token mint, whose request body carries the
    // secret -- so that one logs the status alone and never the body. A portfolio
    // request has no body, and its URL holds only an account id we already log.
    const detail = init.method === 'POST' ? null : await readErrorDetail(response);
    console.warn(
      `Public API: ${response.status} while ${context}` +
      (detail ? ` (${detail})` : ''),
    );

    // 401/403 on a personal secret means the secret is wrong or revoked. Anything
    // else is Public being unwell, which a later pass can retry.
    const credentialRejected = response.status === 401 || response.status === 403;
    throw new PublicApiError(
      credentialRejected
        ? 'Public rejected the stored API secret. Generate a new one in Public and re-enter it.'
        : `Public API returned an error (${response.status}) while ${context}.`,
      response.status,
      credentialRejected,
    );
  }

  try {
    return await response.json();
  } catch {
    throw new PublicApiError(`Public API returned an unreadable response while ${context}.`);
  }
}

/**
 * Exchange the user's long-lived personal secret for a short-lived access token.
 *
 * The secret is passed in the request body and never logged. Callers hold the
 * returned token in memory for one pass and discard it.
 */
export async function mintAccessToken(secret: string): Promise<string> {
  const payload = await requestJson(
    ACCESS_TOKEN_PATH,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ validityInMinutes: ACCESS_TOKEN_VALIDITY_MINUTES, secret }),
    },
    'authenticating',
  );
  const token = stringOrNull(payload?.accessToken);
  if (!token) throw new PublicApiError('Public did not return an access token.', undefined, true);
  return token;
}

function authHeaders(accessToken: string): Record<string, string> {
  return { Authorization: `Bearer ${accessToken}` };
}

/** Every account the secret can see. */
export async function listAccounts(accessToken: string): Promise<PublicAccountSummary[]> {
  const payload = await requestJson(
    ACCOUNTS_PATH,
    { method: 'GET', headers: authHeaders(accessToken) },
    'listing accounts',
  );
  const rows = Array.isArray(payload?.accounts) ? payload.accounts : Array.isArray(payload) ? payload : [];
  return rows
    .map((row: any) => ({
      accountId: stringOrNull(row?.accountId) || stringOrNull(row?.id) || '',
      accountType: stringOrNull(row?.accountType),
    }))
    .filter((account: PublicAccountSummary) => account.accountId.length > 0);
}

/**
 * One account's balance and positions.
 *
 * `totalAccountValue` is taken as reported rather than summed from positions:
 * the managed-yield accounts this integration exists for hold their value as a
 * balance rather than as itemized positions, so a sum would report them as zero.
 */
export async function getPortfolio(accessToken: string, accountId: string): Promise<PublicPortfolio> {
  const payload = await requestJson(
    PORTFOLIO_PATH(accountId),
    { method: 'GET', headers: authHeaders(accessToken) },
    'reading an account portfolio',
  );

  const positions: PublicPosition[] = (Array.isArray(payload?.positions) ? payload.positions : [])
    .map((position: any) => ({
      symbol: stringOrNull(position?.instrument?.symbol),
      name: stringOrNull(position?.instrument?.name),
      instrumentType: stringOrNull(position?.instrument?.type),
      quantity: numberOrNull(position?.quantity),
      currentValue: numberOrNull(position?.currentValue),
      lastPrice: numberOrNull(position?.lastPrice?.lastPrice ?? position?.lastPrice),
    }));

  return {
    accountId: stringOrNull(payload?.accountId) || accountId,
    accountType: stringOrNull(payload?.accountType),
    totalAccountValue: numberOrNull(payload?.totalAccountValue),
    cash: numberOrNull(payload?.cash),
    positions,
  };
}

/**
 * An account's holdings value derived from its unrealized tax lots.
 *
 * Deliberately typed apart from `PublicPortfolio`. This is a *derived* figure --
 * the sum of positions that have lots -- not an institution-reported account
 * total, and any uninvested cash sitting in the account is invisible to it.
 * Keeping the two shapes distinct stops a derived value being mistaken for a
 * reported one further down, which is the same distinction `publicAccountBalance`
 * already draws when it prefers `totalAccountValue` over any sum.
 */
export interface PublicTaxLotHoldings {
  accountId: string;
  /** Public's own valuation date for these lots. Real provenance, unlike a fetch time. */
  asOf: string | null;
  /** Sum of `currentValue` across lots, or null when the account reported none. */
  totalValue: number | null;
  positions: PublicPosition[];
}

export async function getTaxLotHoldings(
  accessToken: string,
  accountId: string,
): Promise<PublicTaxLotHoldings> {
  const payload = await requestJson(
    TAX_LOTS_PATH(accountId),
    { method: 'GET', headers: authHeaders(accessToken) },
    'reading account tax lots',
  );

  const lots: any[] = Array.isArray(payload?.lots) ? payload.lots : [];

  // Aggregate by symbol. Tax lots are per purchase, so one holding routinely
  // appears several times; leaving them split would show a user the same
  // security three times at a third of its size each.
  const bySymbol = new Map<string, PublicPosition>();
  for (const lot of lots) {
    const symbol = stringOrNull(lot?.symbol);
    const name = stringOrNull(lot?.companyName);
    const key = symbol || name;
    if (!key) continue;

    const quantity = numberOrNull(lot?.quantity);
    const currentValue = numberOrNull(lot?.currentValue);
    const lastPrice = numberOrNull(lot?.currentPrice);
    const existing = bySymbol.get(key);
    if (existing) {
      // Keep null when every contribution is missing. `(null ?? 0) + (null ?? 0)`
      // would invent a confident zero for an unknown quantity or value.
      existing.quantity =
        existing.quantity === null && quantity === null
          ? null
          : (existing.quantity ?? 0) + (quantity ?? 0);
      existing.currentValue =
        existing.currentValue === null && currentValue === null
          ? null
          : (existing.currentValue ?? 0) + (currentValue ?? 0);
      // Per-share price is shared across lots of the same symbol; prefer the
      // latest non-null reading rather than accumulating.
      if (lastPrice !== null) existing.lastPrice = lastPrice;
      continue;
    }
    bySymbol.set(key, {
      symbol,
      name,
      // Tax lots do not carry a security type. Left null rather than guessed:
      // asset-class inference already has a documented path for an unresolved
      // type, and inventing one here would launder a guess into that pipeline.
      instrumentType: null,
      quantity,
      currentValue,
      lastPrice,
    });
  }

  const positions = [...bySymbol.values()];
  // Null rather than 0 when nothing was reported. An account with no lots -- a
  // pure cash product such as HIGH_YIELD -- has an unknown value here, not a
  // zero one, and publishing a confident zero is the failure this integration
  // exists to stop. Same for lots that name a symbol but carry no currentValue:
  // summing `(null ?? 0)` would invent zero.
  const reportedValues = positions
    .map(position => position.currentValue)
    .filter((value): value is number => value !== null);
  const totalValue = reportedValues.length > 0
    ? reportedValues.reduce((sum, value) => sum + value, 0)
    : null;

  return {
    accountId: stringOrNull(payload?.accountId) || accountId,
    asOf: stringOrNull(payload?.asOf),
    totalValue,
    positions,
  };
}
