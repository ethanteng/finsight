import { config } from 'dotenv';
import * as Sentry from '@sentry/node';
import { PrismaInstrumentation } from '@prisma/instrumentation';
import {
  scrubSentryBreadcrumb,
  scrubSentryEvent,
  scrubSentrySpan,
} from './observability/sentry-privacy';
import {
  installExternalProviderAxiosMonitoring,
  installExternalProviderFetchMonitoring,
} from './observability/external-provider-monitoring';

if (process.env.NODE_ENV !== 'production') {
  config({ path: '.env.local', quiet: true });
}

function sampleRate(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(1, Math.max(0, parsed)) : fallback;
}

const environment = process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || 'development';
const defaultTraceRate = environment === 'production' ? 0.05 : 0;

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  enabled: Boolean(process.env.SENTRY_DSN) && process.env.NODE_ENV !== 'test',
  environment,
  release: process.env.SENTRY_RELEASE || process.env.RENDER_GIT_COMMIT || process.env.APP_VERSION,
  tracesSampleRate: sampleRate(process.env.SENTRY_TRACES_SAMPLE_RATE, defaultTraceRate),
  enableLogs: false,
  sendDefaultPii: false,
  includeLocalVariables: false,
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
  integrations(defaultIntegrations) {
    const replacedIntegrations = new Set([
      'Console',
      'OpenAI',
      'Anthropic_AI',
      'Google_GenAI',
      'Prisma',
      'VercelAI',
    ]);

    return [
      ...defaultIntegrations.filter(integration => !replacedIntegrations.has(integration.name)),
      Sentry.openAIIntegration({ recordInputs: false, recordOutputs: false }),
      Sentry.anthropicAIIntegration({ recordInputs: false, recordOutputs: false }),
      Sentry.googleGenAIIntegration({ recordInputs: false, recordOutputs: false }),
      Sentry.prismaIntegration({
        prismaInstrumentation: new PrismaInstrumentation(),
      }),
    ];
  },
  beforeBreadcrumb: scrubSentryBreadcrumb,
  beforeSend: scrubSentryEvent,
  beforeSendTransaction: scrubSentryEvent,
  beforeSendSpan: scrubSentrySpan,
});

installExternalProviderFetchMonitoring();
installExternalProviderAxiosMonitoring();
