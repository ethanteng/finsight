const DEFAULT_PROVIDER_REQUEST_TIMEOUT_MS = 15_000;

/** Read a positive provider timeout while rejecting NaN, zero, and negatives. */
export function getProviderRequestTimeoutMs(
  environmentVariable: string,
  fallback = DEFAULT_PROVIDER_REQUEST_TIMEOUT_MS,
): number {
  const parsed = Number.parseInt(process.env[environmentVariable] || '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

async function defaultSleep(milliseconds: number): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, milliseconds));
}

export interface ProviderRetryOptions {
  maxAttempts?: number;
  maxRetryDelayMs?: number;
  sleep?: typeof defaultSleep;
}

function errorStatus(error: unknown): number | undefined {
  if (!error || typeof error !== 'object') return undefined;
  const direct = (error as any).status;
  const nested = (error as any).response?.status;
  return typeof direct === 'number' ? direct : typeof nested === 'number' ? nested : undefined;
}

function retryAfterMs(error: unknown, attempt: number): number {
  const raw = error && typeof error === 'object'
    ? (error as any).response?.headers?.['retry-after']
      ?? (error as any).response?.headers?.get?.('retry-after')
    : undefined;
  if (raw !== undefined) {
    const seconds = Number.parseFloat(String(raw));
    if (Number.isFinite(seconds)) return Math.max(0, seconds * 1_000);
  }
  return 500 * attempt;
}

function isRetryableProviderError(error: unknown): boolean {
  const status = errorStatus(error);
  if (status !== undefined) return status === 408 || status === 429 || status >= 500;
  const code = error && typeof error === 'object' ? String((error as any).code || '') : '';
  return ['ECONNABORTED', 'ECONNRESET', 'ETIMEDOUT', 'ERR_NETWORK'].includes(code);
}

/** Retry idempotent SDK reads only; callers must not wrap mutations. */
export async function withTransientProviderRetry<T>(
  operation: () => Promise<T>,
  options: ProviderRetryOptions = {},
): Promise<T> {
  const maxAttempts = Math.max(1, options.maxAttempts ?? 2);
  const maxRetryDelayMs = Math.max(0, options.maxRetryDelayMs ?? 2_000);
  const sleep = options.sleep ?? defaultSleep;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      if (attempt === maxAttempts || !isRetryableProviderError(error)) throw error;
      const delay = retryAfterMs(error, attempt);
      if (delay > maxRetryDelayMs) throw error;
      await sleep(delay);
    }
  }

  throw new Error('Provider operation exhausted its retry policy');
}
