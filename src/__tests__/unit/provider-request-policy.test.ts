import { discardResponseBody, fetchWithBoundedRetry } from '../../data/providers/http-retry';
import {
  getProviderRequestTimeoutMs,
  withTransientProviderRetry,
} from '../../services/provider-request-policy';

describe('provider request policy', () => {
  it('honors positive timeout overrides and rejects invalid values', () => {
    process.env.TEST_PROVIDER_TIMEOUT_MS = '2500';
    expect(getProviderRequestTimeoutMs('TEST_PROVIDER_TIMEOUT_MS')).toBe(2500);
    process.env.TEST_PROVIDER_TIMEOUT_MS = '0';
    expect(getProviderRequestTimeoutMs('TEST_PROVIDER_TIMEOUT_MS', 9000)).toBe(9000);
    delete process.env.TEST_PROVIDER_TIMEOUT_MS;
  });

  it('fails fast when Retry-After exceeds the bounded request budget', async () => {
    const fetchImplementation = jest.fn().mockResolvedValue({
      ok: false,
      status: 429,
      headers: { get: () => '60' },
    });
    const sleep = jest.fn().mockResolvedValue(undefined);

    const response = await fetchWithBoundedRetry('https://example.com', {}, {
      fetchImplementation,
      sleep,
      maxRetryDelayMs: 2000,
    });

    expect(response.status).toBe(429);
    expect(fetchImplementation).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('does not retry non-transient SDK failures', async () => {
    const operation = jest.fn().mockRejectedValue({ status: 400 });
    await expect(withTransientProviderRetry(operation, { sleep: jest.fn() }))
      .rejects.toEqual({ status: 400 });
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('keeps the abort timeout active while the response body is consumed', async () => {
    const body = new ReadableStream<Uint8Array>({
      start() {
        // Intentionally never enqueue — simulate a stalled provider body.
      },
    });
    const fetchImplementation = jest.fn().mockResolvedValue(
      new Response(body, { status: 200, headers: { 'content-type': 'text/plain' } }),
    );

    const response = await fetchWithBoundedRetry('https://example.com/body', {}, {
      fetchImplementation,
      requestTimeoutMs: 40,
      maxAttempts: 1,
    });

    await expect(response.text()).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetchImplementation).toHaveBeenCalledTimes(1);
  });

  it('releases an unread error body instead of holding it until the timeout', async () => {
    let cancelled: unknown;
    const body = new ReadableStream<Uint8Array>({
      start() {
        // Server sent headers and then stalled — nothing to enqueue.
      },
      cancel(reason) {
        cancelled = reason ?? 'cancelled';
      },
    });
    const fetchImplementation = jest.fn().mockResolvedValue(
      new Response(body, { status: 500, statusText: 'Internal Server Error' }),
    );

    const response = await fetchWithBoundedRetry('https://example.com/error', {}, {
      fetchImplementation,
      maxAttempts: 1,
      requestTimeoutMs: 30_000,
    });

    expect(response.ok).toBe(false);
    await discardResponseBody(response);
    expect(cancelled).toBeDefined();
    // A body left unread would keep the attempt's abort timer armed for the
    // full request timeout, so Jest would still be holding a handle here.
  });

  it('tolerates a discarded body that was already consumed', async () => {
    const fetchImplementation = jest.fn().mockResolvedValue(
      new Response('boom', { status: 502 }),
    );

    const response = await fetchWithBoundedRetry('https://example.com/read-then-discard', {}, {
      fetchImplementation,
      maxAttempts: 1,
    });

    await expect(response.text()).resolves.toBe('boom');
    await expect(discardResponseBody(response)).resolves.toBeUndefined();
  });
});
