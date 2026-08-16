import * as Sentry from '@sentry/nextjs';
import { analytics } from '@heycatch/sdk';
import { HEYCATCH_INIT_CONFIG } from './src/lib/heycatch-config';
import { isHeyCatchEnabledPath } from './src/lib/heycatch-paths';
import {
  scrubSentryBreadcrumb,
  scrubSentryEvent,
  scrubSentrySpan,
} from './sentry-privacy';

function sampleRate(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(1, Math.max(0, parsed)) : fallback;
}

const environment = process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT || process.env.NODE_ENV || 'development';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN) && process.env.NODE_ENV !== 'test',
  environment,
  tracesSampleRate: sampleRate(
    process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE,
    environment === 'production' ? 0.05 : 0,
  ),
  enableLogs: false,
  sendDefaultPii: false,
  dataCollection: {
    userInfo: false,
    cookies: false,
    httpHeaders: { request: false, response: false },
    httpBodies: [],
    urlQueryParams: false,
    graphQL: { document: false, variables: false },
    genAI: { inputs: false, outputs: false },
    databaseQueryData: false,
    stackFrameVariables: false,
  },
  beforeBreadcrumb: scrubSentryBreadcrumb,
  beforeSend: scrubSentryEvent,
  beforeSendTransaction: scrubSentryEvent,
  beforeSendSpan: scrubSentrySpan,
});

if (isHeyCatchEnabledPath(globalThis.location.pathname)) {
  analytics.init(HEYCATCH_INIT_CONFIG);
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
