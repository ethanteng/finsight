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
 * mutating endpoint. Only `/account` and `/{accountId}/portfolio/v2` are reachable
 * from this module, and there is a test asserting no order path appears in it.
 */

const PUBLIC_API_BASE_URL = 'https://api.public.com';
const ACCESS_TOKEN_PATH = '/userapiauthservice/personal/access-tokens';
const ACCOUNTS_PATH = '/userapigateway/trading/account';
const PORTFOLIO_PATH = (accountId: string) =>
  `/userapigateway/trading/${encodeURIComponent(accountId)}/portfolio/v2`;

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
