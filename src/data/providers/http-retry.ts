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

function numericHeaderValues(value: string | null): Array<number | undefined> {
  if (!value) return [];
  // Positions are meaningful: the nth entry of Limit, Remaining and Reset all
  // describe the same window, so an unparseable entry must hold its slot
  // rather than shifting every later window onto the wrong counter.
  return value.split(',').map(part => {
    const parsed = Number.parseFloat(part.trim());
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
  });
}

function headerValues(response: Response, ...names: string[]): Array<number | undefined> {
  for (const name of names) {
    const raw = response.headers?.get(name);
    if (raw) return numericHeaderValues(raw);
  }
  return [];
}

/**
 * Reset delays, in seconds, for every rate-limit window this response reports
 * as genuinely spent.
 *
 * A window is only spent when it meters something. Brave advertises the
 * unlimited monthly allowance on its paid plans as `Limit 0, Remaining 0` with
 * Reset counting down to the end of the month, which reads as a permanently
 * exhausted window and would park the provider for days at a time.
 */
export function exhaustedWindowResets(response: Response): number[] {
  const resets = headerValues(response, 'x-ratelimit-reset', 'x-rate-limit-reset');
  const remaining = headerValues(response, 'x-ratelimit-remaining', 'x-rate-limit-remaining');
  const limits = headerValues(response, 'x-ratelimit-limit', 'x-rate-limit-limit');

  return resets.flatMap((reset, index) => {
    if (reset === undefined) return [];
    const left = remaining[index];
    if (left === undefined || left >= 1) return [];
    if (limits[index] === 0) return [];
    return [reset];
  });
}

function rateLimitResetDelayMs(response: Response): number | undefined {
  const resets = headerValues(response, 'x-ratelimit-reset', 'x-rate-limit-reset')
    .filter((reset): reset is number => reset !== undefined);
  if (resets.length === 0) return undefined;
  const reportedRemaining = headerValues(response, 'x-ratelimit-remaining', 'x-rate-limit-remaining')
    .filter((left): left is number => left !== undefined);
  const exhaustedResets = exhaustedWindowResets(response);
  // Every exhausted window must reset before another request is safe.
  if (exhaustedResets.length > 0) return Math.max(...exhaustedResets) * 1_000;
  // No window reports itself exhausted, so these headers describe quota that is
  // still available and say nothing about why this attempt failed. Honouring
  // them anyway would replace the intended backoff for a transient 5xx with a
  // full window reset, which usually exceeds maxRetryDelayMs and suppresses the
  // retry entirely. Only a 429 whose Remaining the provider omitted is evidence
  // of an exhausted window.
  if (response.status === 429 && reportedRemaining.length === 0) return Math.min(...resets) * 1_000;
  return undefined;
}

function retryDelayMs(response: Response, attempt: number): number {
  const retryAfter = response.headers?.get('retry-after');
  if (retryAfter) {
    const seconds = Number.parseFloat(retryAfter);
    if (Number.isFinite(seconds)) return Math.max(0, seconds * 1_000);

    const retryAt = Date.parse(retryAfter);
    if (Number.isFinite(retryAt)) return Math.max(0, retryAt - Date.now());
  }
  const resetDelay = rateLimitResetDelayMs(response);
  if (resetDelay !== undefined) return resetDelay;
  return DEFAULT_RETRY_DELAY_MS * (2 ** (attempt - 1));
}

/**
 * Keep the per-attempt abort timer alive until the caller finishes consuming
 * (or cancels) the response body. Clearing the timer when headers arrive would
 * allow a stalled body read to hang indefinitely.
 */
function bindTimeoutToResponse(
  response: Response,
  timeout: ReturnType<typeof setTimeout>,
  signal: AbortSignal,
): Response {
  let cleanedUp = false;
  const cleanup = () => {
    if (cleanedUp) return;
    cleanedUp = true;
    clearTimeout(timeout);
  };

  if (!response.body) {
    cleanup();
    return response;
  }

  // Locking the body means later abort must cancel this reader — body.cancel()
  // alone is a no-op once the stream is locked.
  const reader = response.body.getReader();
  let streamController: ReadableStreamDefaultController<Uint8Array> | undefined;
  const abortError = () => new DOMException('The operation was aborted.', 'AbortError');

  const abortBody = () => {
    void reader.cancel(abortError()).catch(() => undefined);
    try {
      streamController?.error(abortError());
    } catch {
      // Controller may already be closed or errored.
    }
    cleanup();
  };

  if (signal.aborted) {
    abortBody();
  } else {
    signal.addEventListener('abort', abortBody, { once: true });
  }

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      streamController = controller;
      if (signal.aborted) {
        try {
          controller.error(abortError());
        } catch {
          // Already aborted before start completed.
        }
      }
    },
    async pull(controller) {
      try {
        const { done, value } = await reader.read();
        if (done) {
          cleanup();
          controller.close();
          return;
        }
        controller.enqueue(value);
      } catch (error) {
        cleanup();
        controller.error(error);
      }
    },
    cancel(reason) {
      cleanup();
      return reader.cancel(reason);
    },
  });

  return new Response(stream, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}

/**
 * Release a response the caller will not read.
 *
 * The per-attempt abort timer stays armed until the body is read, cancelled, or
 * aborted, so a provider that throws on a non-OK status without touching the
 * body would otherwise hold both the socket and the timer open for the whole
 * timeout window. Callers that *do* read an error body (Brave) must not call
 * this.
 */
export async function discardResponseBody(response: Response): Promise<void> {
  try {
    await response.body?.cancel();
  } catch {
    // Already consumed, locked, or errored — nothing left to release.
  }
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
      clearTimeout(timeout);
      if (attempt === maxAttempts) throw error;
      const delay = DEFAULT_RETRY_DELAY_MS * (2 ** (attempt - 1));
      if (delay > maxRetryDelayMs) throw error;
      await sleep(delay);
      continue;
    }

    if (!retryableStatus(response.status) || attempt === maxAttempts) {
      return bindTimeoutToResponse(response, timeout, controller.signal);
    }

    const delay = retryDelayMs(response, attempt);
    if (delay > maxRetryDelayMs) {
      return bindTimeoutToResponse(response, timeout, controller.signal);
    }

    clearTimeout(timeout);
    await response.body?.cancel().catch(() => undefined);
    await sleep(delay);
  }

  throw new Error('Provider request exhausted its retry policy');
}
