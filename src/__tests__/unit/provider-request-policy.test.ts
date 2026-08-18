import { fetchWithBoundedRetry } from '../../data/providers/http-retry';
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
});
