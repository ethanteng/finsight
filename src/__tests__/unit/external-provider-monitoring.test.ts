import * as Sentry from '@sentry/node';
import axios from 'axios';
import {
  createExternalProviderMonitoringFetch,
  instrumentExternalProviderAxios,
  reportExternalProviderHttpStatus,
} from '../../observability/external-provider-monitoring';

const mockScope = {
  setLevel: jest.fn(),
  setFingerprint: jest.fn(),
  setTags: jest.fn(),
  setContext: jest.fn(),
};

jest.mock('@sentry/node', () => ({
  withScope: jest.fn((callback: jest.Mock) => callback(mockScope)),
  captureMessage: jest.fn(),
}));

describe('external provider monitoring', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it.each([
    ['Brave Search', 'https://api.search.brave.com/res/v1/web/search?q=private+query&key=secret', 429, 'brave_search'],
    ['Polygon', 'https://api.polygon.io/v2/aggs/ticker/AAPL/range/1/day?apiKey=secret', 503, 'polygon'],
  ])('reports %s HTTP failures without request details', async (_label, url, status, provider) => {
    const baseFetch = jest.fn(async () => new Response('{}', { status })) as unknown as typeof fetch;
    const monitoredFetch = createExternalProviderMonitoringFetch(baseFetch);

    const response = await monitoredFetch(url);

    expect(response.status).toBe(status);
    expect(Sentry.withScope).toHaveBeenCalledTimes(1);
    expect(Sentry.captureMessage).toHaveBeenCalledWith(
      `External provider ${provider} returned HTTP ${status}`,
    );

    const serializedContext = JSON.stringify(mockScope.setContext.mock.calls);
    expect(serializedContext).not.toContain('private+query');
    expect(serializedContext).not.toContain('secret');
    expect(serializedContext).not.toContain('AAPL');
    expect(mockScope.setTags).toHaveBeenCalledWith(expect.objectContaining({
      external_provider: true,
      'external_provider.name': provider,
      'http.status_code': String(status),
      'http.status_class': status >= 500 ? '5xx' : '4xx',
    }));
  });

  it('does not report successful provider responses', async () => {
    const baseFetch = jest.fn(async () => new Response('{}', { status: 200 })) as unknown as typeof fetch;
    const monitoredFetch = createExternalProviderMonitoringFetch(baseFetch);

    await monitoredFetch('https://api.polygon.io/v2/aggs/ticker/AAPL');

    expect(Sentry.withScope).not.toHaveBeenCalled();
    expect(Sentry.captureMessage).not.toHaveBeenCalled();
  });

  it('reports network failures and preserves the original rejection', async () => {
    const failure = new TypeError('fetch failed');
    const baseFetch = jest.fn(async () => {
      throw failure;
    }) as unknown as typeof fetch;
    const monitoredFetch = createExternalProviderMonitoringFetch(baseFetch);

    await expect(monitoredFetch('https://api.stlouisfed.org/fred/series/observations'))
      .rejects.toBe(failure);

    expect(Sentry.captureMessage).toHaveBeenCalledWith(
      'External provider fred request failed (network)',
    );
  });

  it('classifies AbortSignal.timeout TimeoutError as timeout, not network', async () => {
    const failure = new DOMException('The operation was aborted due to timeout', 'TimeoutError');
    const baseFetch = jest.fn(async () => {
      throw failure;
    }) as unknown as typeof fetch;
    const monitoredFetch = createExternalProviderMonitoringFetch(baseFetch);

    await expect(monitoredFetch('https://api.search.brave.com/res/v1/web/search'))
      .rejects.toBe(failure);

    expect(Sentry.captureMessage).toHaveBeenCalledWith(
      'External provider brave_search request failed (timeout)',
    );
    expect(mockScope.setTags).toHaveBeenCalledWith(expect.objectContaining({
      'external_provider.failure_kind': 'timeout',
    }));
  });

  it('classifies Axios ECONNABORTED timeouts as timeout', async () => {
    const client = axios.create({
      adapter: async config => {
        throw new axios.AxiosError('timeout of 1ms exceeded', 'ECONNABORTED', config);
      },
    });
    instrumentExternalProviderAxios(client);

    await expect(client.get('https://production.plaid.com/accounts/get')).rejects.toMatchObject({
      code: 'ECONNABORTED',
    });

    expect(Sentry.captureMessage).toHaveBeenCalledWith(
      'External provider plaid request failed (timeout)',
    );
    expect(mockScope.setTags).toHaveBeenCalledWith(expect.objectContaining({
      'external_provider.failure_kind': 'timeout',
    }));
  });

  it('ignores Sentry transport and Ask Linc service responses', async () => {
    const baseFetch = jest.fn(async () => new Response('{}', { status: 500 })) as unknown as typeof fetch;
    const monitoredFetch = createExternalProviderMonitoringFetch(baseFetch);

    await monitoredFetch('https://o123.ingest.us.sentry.io/api/123/envelope/');
    await monitoredFetch('https://api.asklinc.com/internal/health');
    await monitoredFetch('https://finsight-backend-hrel.onrender.com/health');

    expect(Sentry.withScope).not.toHaveBeenCalled();
  });

  it('reports HTTP failures from Axios-based provider SDKs', async () => {
    const client = axios.create({
      adapter: async config => ({
        data: {},
        status: 401,
        statusText: 'Unauthorized',
        headers: {},
        config,
      }),
      validateStatus: () => true,
    });
    instrumentExternalProviderAxios(client);

    const response = await client.get('https://production.plaid.com/accounts/get', {
      params: { access_token: 'must-not-appear' },
    });

    expect(response.status).toBe(401);
    expect(Sentry.captureMessage).toHaveBeenCalledWith(
      'External provider plaid returned HTTP 401',
    );
    expect(JSON.stringify(mockScope.setContext.mock.calls)).not.toContain('must-not-appear');
  });

  it('reports Stripe SDK response events without resource identifiers', () => {
    reportExternalProviderHttpStatus({
      provider: 'stripe',
      host: 'api.stripe.com',
      method: 'POST',
      path: '/v1/customers/cus_private_identifier/subscriptions',
      status: 500,
      durationMs: 240,
    });

    expect(Sentry.captureMessage).toHaveBeenCalledWith(
      'External provider stripe returned HTTP 500',
    );
    expect(JSON.stringify(mockScope.setContext.mock.calls)).not.toContain('cus_private_identifier');
  });
});
