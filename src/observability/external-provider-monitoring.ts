import { AsyncLocalStorage } from 'node:async_hooks';
import * as Sentry from '@sentry/node';
import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';

type FetchImplementation = typeof fetch;
type FetchInput = Parameters<FetchImplementation>[0];
type FetchInit = Parameters<FetchImplementation>[1];

interface ExternalRequestMetadata {
  provider: string;
  host: string;
  method: string;
  operation: string;
}

const MONITORED_FETCH = Symbol.for('ask-linc.external-provider-monitored-fetch');
const MONITORED_AXIOS = Symbol.for('ask-linc.external-provider-monitored-axios');
const AXIOS_STARTED_AT = Symbol.for('ask-linc.external-provider-axios-started-at');

const PROVIDERS_BY_HOST: Record<string, string> = {
  'api.search.brave.com': 'brave_search',
  'api.massive.com': 'massive',
  'api.polygon.io': 'massive',
  'api.stlouisfed.org': 'fred',
  'financialmodelingprep.com': 'fmp',
  'api.tiingo.com': 'tiingo',
  'api.rentcast.io': 'rentcast',
  'connect.mailerlite.com': 'mailerlite',
  'api.anthropic.com': 'anthropic',
  'api.openai.com': 'openai',
  'generativelanguage.googleapis.com': 'google_ai',
  'api.plaid.com': 'plaid',
  'production.plaid.com': 'plaid',
  'development.plaid.com': 'plaid',
  'sandbox.plaid.com': 'plaid',
  'api.snaptrade.com': 'snaptrade',
  // Pinned even though `providerForHost` already derives 'public.com' by
  // stripping the `api.` prefix. Call sites name this id verbatim when they
  // declare an expected status, so leaving it implicit means a later remap here
  // would silently stop those suppressions matching rather than fail loudly.
  'api.public.com': 'public.com',
  'api.stripe.com': 'stripe',
  'api.resend.com': 'resend',
};

function shouldIgnoreHost(hostname: string): boolean {
  return hostname === 'localhost'
    || hostname === '127.0.0.1'
    || hostname === '::1'
    || hostname === 'asklinc.com'
    || hostname.endsWith('.asklinc.com')
    || hostname.endsWith('.onrender.com')
    || hostname === 'sentry.io'
    || hostname.endsWith('.sentry.io');
}

function providerForHost(hostname: string): string {
  return PROVIDERS_BY_HOST[hostname]
    ?? hostname.replace(/^api\./, '').replace(/^www\./, '');
}

function coarseOperation(url: URL, method: string): string {
  const pathParts = url.pathname.split('/').filter(Boolean).slice(0, 2);
  const path = pathParts.length > 0 ? `/${pathParts.join('/')}` : '/';
  return `${method} ${path}`;
}

function urlMetadata(requestUrl: string, requestMethod?: string): ExternalRequestMetadata | null {
  try {
    const url = new URL(requestUrl);
    const host = url.hostname.toLowerCase();
    if (!['http:', 'https:'].includes(url.protocol) || shouldIgnoreHost(host)) return null;

    const method = (requestMethod ?? 'GET').toUpperCase();

    return {
      provider: providerForHost(host),
      host,
      method,
      operation: coarseOperation(url, method),
    };
  } catch {
    return null;
  }
}

function requestMetadata(input: FetchInput, init?: FetchInit): ExternalRequestMetadata | null {
  const requestUrl = input instanceof URL
    ? input.toString()
    : typeof input === 'string'
      ? input
      : input.url;
  const requestMethod = typeof input === 'string' || input instanceof URL
    ? undefined
    : input.method;

  return urlMetadata(requestUrl, init?.method ?? requestMethod);
}

/**
 * Provider statuses the surrounding call path treats as an ordinary outcome.
 *
 * Some provider "failures" are load-bearing control flow rather than faults:
 * Public's managed-yield accounts answer `portfolio/v2` with 404 so the caller
 * knows to read tax lots instead, and SnapTrade answers a holdings read with 425
 * until that account's initial sync completes. Both are handled, both leave the
 * user's request succeeding, and both were burying genuine provider failures in
 * Sentry by sheer volume.
 *
 * Scoped to an async region rather than declared as a static (provider, status)
 * allowlist because the fingerprint's operation is deliberately coarse -- the
 * first two path segments -- so a static rule for Public's 404 would also
 * silence a 404 on `/userapigateway/trading/account`, which means the account
 * genuinely is not there. A scope names the one call whose 404 is expected and
 * leaves every other call on the same host reporting normally.
 */
interface ExpectedProviderStatus {
  provider: string;
  status: number;
}

const expectedProviderStatuses = new AsyncLocalStorage<ExpectedProviderStatus[]>();

function isExpectedProviderStatus(provider: string, status: number): boolean {
  const expected = expectedProviderStatuses.getStore();
  if (!expected) return false;
  return expected.some(entry => entry.provider === provider && entry.status === status);
}

/**
 * Run `operation` with `expected` provider statuses suppressed from Sentry.
 *
 * Suppression covers HTTP status reporting only. Network and timeout failures
 * still report, because "this endpoint answers 404 by design" says nothing about
 * the provider being unreachable.
 *
 * Nested scopes compose rather than replace: an inner region inherits the outer
 * expectations, so wrapping a narrow call inside an already-scoped pass cannot
 * silently widen or drop what the outer scope allowed.
 */
export function withExpectedProviderStatuses<T>(
  expected: ExpectedProviderStatus[],
  operation: () => Promise<T>,
): Promise<T> {
  const inherited = expectedProviderStatuses.getStore() ?? [];
  return expectedProviderStatuses.run([...inherited, ...expected], operation);
}

function reportHttpFailure(
  metadata: ExternalRequestMetadata,
  status: number,
  durationMs: number,
): void {
  if (isExpectedProviderStatus(metadata.provider, status)) return;

  const statusClass = `${Math.floor(status / 100)}xx`;
  const retryable = status === 408 || status === 429 || status >= 500;

  try {
    Sentry.withScope(scope => {
      scope.setLevel(status >= 500 ? 'error' : 'warning');
      scope.setFingerprint([
        'external-provider-http',
        metadata.provider,
        metadata.operation,
        String(status),
      ]);
      scope.setTags({
        external_provider: true,
        'external_provider.name': metadata.provider,
        'external_provider.operation': metadata.operation,
        'external_provider.retryable': retryable,
        'http.status_code': String(status),
        'http.status_class': statusClass,
      });
      scope.setContext('external_provider', {
        provider: metadata.provider,
        host: metadata.host,
        method: metadata.method,
        operation: metadata.operation,
        status_code: status,
        status_class: statusClass,
        duration_ms: Math.max(0, Math.round(durationMs)),
        retryable,
      });
      Sentry.captureMessage(
        `External provider ${metadata.provider} returned HTTP ${status}`,
      );
    });
  } catch {
    // Observability must never alter provider request behavior.
  }
}

export function reportExternalProviderHttpStatus(options: {
  provider: string;
  host: string;
  method: string;
  path: string;
  status: number;
  durationMs: number;
}): void {
  if (options.status < 400 || options.status > 599) return;

  const metadata = urlMetadata(
    `https://${options.host}${options.path.startsWith('/') ? options.path : `/${options.path}`}`,
    options.method,
  );
  if (!metadata) return;

  reportHttpFailure(
    { ...metadata, provider: options.provider },
    options.status,
    options.durationMs,
  );
}

function isTimeoutFailure(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;

  const err = error as { name?: string; code?: string | number };
  if (err.name === 'TimeoutError' || err.name === 'AbortError') return true;

  const code = typeof err.code === 'string' ? err.code.toUpperCase() : '';
  if (code === 'ECONNABORTED' || code === 'ETIMEDOUT' || code === 'ESOCKETTIMEDOUT') {
    return true;
  }

  return false;
}

function reportNetworkFailure(
  metadata: ExternalRequestMetadata,
  error: unknown,
  durationMs: number,
): void {
  const errorName = error instanceof Error ? error.name : 'UnknownError';
  // AbortSignal.timeout() rejects with TimeoutError; AbortController.abort() and
  // many app-level timers reject with AbortError. Axios timeouts use ECONNABORTED/ETIMEDOUT.
  const failureKind = isTimeoutFailure(error) ? 'timeout' : 'network';

  try {
    Sentry.withScope(scope => {
      scope.setLevel('error');
      scope.setFingerprint([
        'external-provider-network',
        metadata.provider,
        metadata.operation,
        failureKind,
      ]);
      scope.setTags({
        external_provider: true,
        'external_provider.name': metadata.provider,
        'external_provider.operation': metadata.operation,
        'external_provider.retryable': true,
        'external_provider.failure_kind': failureKind,
        'http.status_code': '0',
        'http.status_class': 'network',
      });
      scope.setContext('external_provider', {
        provider: metadata.provider,
        host: metadata.host,
        method: metadata.method,
        operation: metadata.operation,
        status_code: 0,
        status_class: 'network',
        duration_ms: Math.max(0, Math.round(durationMs)),
        retryable: true,
        failure_kind: failureKind,
        error_type: errorName,
      });
      Sentry.captureMessage(
        `External provider ${metadata.provider} request failed (${failureKind})`,
      );
    });
  } catch {
    // Observability must never alter provider request behavior.
  }
}

function axiosRequestMetadata(
  client: AxiosInstance,
  config: AxiosRequestConfig,
): ExternalRequestMetadata | null {
  try {
    return urlMetadata(client.getUri(config), config.method);
  } catch {
    return null;
  }
}

export function createExternalProviderMonitoringFetch(
  baseFetch: FetchImplementation,
): FetchImplementation {
  const monitoredFetch = async (
    input: FetchInput,
    init?: FetchInit,
  ): Promise<Response> => {
    const metadata = requestMetadata(input, init);
    const startedAt = Date.now();

    try {
      const response = await baseFetch(input, init);
      if (metadata && response.status >= 400 && response.status <= 599) {
        reportHttpFailure(metadata, response.status, Date.now() - startedAt);
      }
      return response;
    } catch (error) {
      if (metadata) {
        reportNetworkFailure(metadata, error, Date.now() - startedAt);
      }
      throw error;
    }
  };

  Object.defineProperty(monitoredFetch, MONITORED_FETCH, { value: true });
  return monitoredFetch as FetchImplementation;
}

export function installExternalProviderFetchMonitoring(): void {
  const currentFetch = global.fetch as FetchImplementation & { [MONITORED_FETCH]?: boolean };
  if (typeof currentFetch !== 'function' || currentFetch[MONITORED_FETCH]) return;

  global.fetch = createExternalProviderMonitoringFetch(currentFetch.bind(global));
}

export function instrumentExternalProviderAxios(client: AxiosInstance): void {
  const markedClient = client as AxiosInstance & { [MONITORED_AXIOS]?: boolean };
  if (markedClient[MONITORED_AXIOS]) return;

  client.interceptors.request.use(config => {
    Reflect.set(config, AXIOS_STARTED_AT, Date.now());
    return config;
  });

  client.interceptors.response.use(
    response => {
      const metadata = axiosRequestMetadata(client, response.config);
      if (metadata && response.status >= 400 && response.status <= 599) {
        const startedAt = Number(Reflect.get(response.config, AXIOS_STARTED_AT)) || Date.now();
        reportHttpFailure(metadata, response.status, Date.now() - startedAt);
      }
      return response;
    },
    error => {
      if (axios.isAxiosError(error) && error.config) {
        const metadata = axiosRequestMetadata(client, error.config);
        if (metadata) {
          const startedAt = Number(Reflect.get(error.config, AXIOS_STARTED_AT)) || Date.now();
          const durationMs = Date.now() - startedAt;
          const status = error.response?.status;
          if (status && status >= 400 && status <= 599) {
            reportHttpFailure(metadata, status, durationMs);
          } else {
            reportNetworkFailure(metadata, error, durationMs);
          }
        }
      }
      return Promise.reject(error);
    },
  );

  Object.defineProperty(markedClient, MONITORED_AXIOS, { value: true });
}

export function installExternalProviderAxiosMonitoring(): void {
  instrumentExternalProviderAxios(axios);
}
