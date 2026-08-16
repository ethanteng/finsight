import type { Breadcrumb, Event } from '@sentry/nextjs';

const FILTERED = '[Filtered]';
const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const IPV4_RE = /\b(?:\d{1,3}\.){3}\d{1,3}\b/g;
const UUID_RE = /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi;
const BEARER_RE = /\b(Bearer\s+)[A-Z0-9._~+/-]+=*/gi;
const SENSITIVE_KEY_RE = /(?:^|[_-])(authorization|cookie|password|secret|api[_-]?key|access[_-]?token|refresh[_-]?token|user[_-]?id|session[_-]?id|email|ip(?:[_-]?address)?|street|postal|question|answer|prompt|conversation|financial|account[_-]?number|routing[_-]?number)(?:$|[_-])/i;

function stripUrlQuery(value: string): string {
  try {
    const url = new URL(value);
    url.search = '';
    url.hash = '';
    return url.toString();
  } catch {
    return value.split(/[?#]/, 1)[0] ?? value;
  }
}

export function sanitizeSentryText(value: string): string {
  return value
    .replace(EMAIL_RE, '[Filtered email]')
    .replace(IPV4_RE, '[Filtered IP]')
    .replace(UUID_RE, '[Filtered ID]')
    .replace(BEARER_RE, `$1${FILTERED}`)
    .replace(/https?:\/\/[^\s)\]}]+/gi, match => stripUrlQuery(match))
    .replace(/([?&](?:token|key|secret|code|email|address)=)[^&#\s]+/gi, `$1${FILTERED}`);
}

function sanitizeValue(value: unknown, key = '', depth = 0, seen = new WeakSet<object>()): unknown {
  if (SENSITIVE_KEY_RE.test(key)) return FILTERED;
  if (typeof value === 'string') return sanitizeSentryText(value);
  if (value === null || typeof value !== 'object' || depth >= 5) return value;
  if (seen.has(value)) return '[Circular]';

  seen.add(value);
  if (Array.isArray(value)) {
    return value.map(item => sanitizeValue(item, '', depth + 1, seen));
  }

  return Object.fromEntries(
    Object.entries(value).map(([childKey, childValue]) => [
      childKey,
      sanitizeValue(childValue, childKey, depth + 1, seen),
    ]),
  );
}

export function scrubSentryBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb | null {
  if (breadcrumb.category === 'console') return null;

  return {
    ...breadcrumb,
    message: breadcrumb.message ? sanitizeSentryText(breadcrumb.message) : breadcrumb.message,
    data: breadcrumb.data
      ? (sanitizeValue(breadcrumb.data) as Record<string, unknown>)
      : breadcrumb.data,
  };
}

export function scrubSentryEvent<T extends Event>(event: T): T {
  event.user = undefined;

  if (event.request) {
    event.request = {
      method: event.request.method,
    };
  }

  event.message = event.message ? sanitizeSentryText(event.message) : event.message;
  for (const exception of event.exception?.values ?? []) {
    if (exception.value) exception.value = sanitizeSentryText(exception.value);
  }

  event.breadcrumbs = (event.breadcrumbs ?? [])
    .map(scrubSentryBreadcrumb)
    .filter((breadcrumb): breadcrumb is Breadcrumb => breadcrumb !== null);
  event.extra = event.extra
    ? (sanitizeValue(event.extra) as Record<string, unknown>)
    : event.extra;
  event.contexts = event.contexts
    ? (sanitizeValue(event.contexts) as Event['contexts'])
    : event.contexts;
  event.tags = event.tags
    ? (sanitizeValue(event.tags) as Event['tags'])
    : event.tags;

  return event;
}

export function scrubSentrySpan<T extends { data?: Record<string, unknown>; description?: string }>(span: T): T {
  if (span.data) span.data = sanitizeValue(span.data) as Record<string, unknown>;
  if (span.description) span.description = sanitizeSentryText(span.description);
  return span;
}
