const DEFAULT_REQUEST_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_ATTEMPTS = 2;
const DEFAULT_RETRY_DELAY_MS = 1_000;
const DEFAULT_MAX_RETRY_DELAY_MS = 2_000;

type FetchImplementation = typeof fetch;

async function defaultSleep(milliseconds: number): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, milliseconds));
}

type SleepImplementation = typeof defaultSleep;
export type ProviderRequestInit = NonNullable<Parameters<FetchImplementation>[1]>;

export interface BoundedFetchOptions {
  fetchImplementation?: FetchImplementation;
  sleep?: SleepImplementation;
  requestTimeoutMs?: number;
  maxAttempts?: number;
  maxRetryDelayMs?: number;
  beforeAttempt?(): Promise<void>;
}

function retryableStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

function retryDelayMs(response: Response, attempt: number): number {
  const retryAfter = response.headers?.get('retry-after');
  if (retryAfter) {
    const seconds = Number.parseFloat(retryAfter);
    if (Number.isFinite(seconds)) return Math.max(0, seconds * 1_000);

    const retryAt = Date.parse(retryAfter);
    if (Number.isFinite(retryAt)) return Math.max(0, retryAt - Date.now());
  }
  return DEFAULT_RETRY_DELAY_MS * attempt;
}

/**
 * Fetch with an explicit per-attempt timeout and one bounded retry for transient
 * transport, rate-limit, and server failures. The final HTTP response is
 * returned to the provider so it can preserve its endpoint-specific error.
 */
export async function fetchWithBoundedRetry(
  input: string | URL | Request,
  init: ProviderRequestInit = {},
  options: BoundedFetchOptions = {},
): Promise<Response> {
  const fetchImplementation = options.fetchImplementation ?? fetch;
  const sleep = options.sleep ?? defaultSleep;
  const requestTimeoutMs = Math.max(1, options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS);
  const maxAttempts = Math.max(1, options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS);
  const maxRetryDelayMs = Math.max(0, options.maxRetryDelayMs ?? DEFAULT_MAX_RETRY_DELAY_MS);

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    await options.beforeAttempt?.();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);

    let response: Response;
    try {
      response = await fetchImplementation(input, { ...init, signal: controller.signal });
    } catch (error) {
      if (attempt === maxAttempts) throw error;
      const delay = DEFAULT_RETRY_DELAY_MS * attempt;
      if (delay > maxRetryDelayMs) throw error;
      await sleep(delay);
      continue;
    } finally {
      clearTimeout(timeout);
    }

    if (!retryableStatus(response.status) || attempt === maxAttempts) return response;

    const delay = retryDelayMs(response, attempt);
    if (delay > maxRetryDelayMs) return response;
    await response.body?.cancel().catch(() => undefined);
    await sleep(delay);
  }

  throw new Error('Provider request exhausted its retry policy');
}
