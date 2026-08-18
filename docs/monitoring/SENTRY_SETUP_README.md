# Sentry monitoring

Ask Linc uses Sentry for error reporting and low-volume performance tracing in the Express backend and Next.js frontend. The integration is intentionally privacy-first because application errors may occur while financial or conversational data is in memory.

## Runtime configuration

Backend variables belong in the root `.env.local` for local development and in the backend deployment environment:

```bash
SENTRY_DSN=https://public-key@organization.ingest.sentry.io/project-id
SENTRY_ENVIRONMENT=development
SENTRY_TRACES_SAMPLE_RATE=0
```

Frontend variables belong in `frontend/.env.local` for local development and in the frontend deployment environment:

```bash
NEXT_PUBLIC_SENTRY_DSN=https://public-key@organization.ingest.sentry.io/project-id
NEXT_PUBLIC_SENTRY_ENVIRONMENT=development
NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE=0
```

Set these server-only variables in the frontend build environment to upload source maps:

```bash
SENTRY_ORG=your-organization
SENTRY_PROJECT=your-project
SENTRY_AUTH_TOKEN=your-source-map-upload-token
```

The default production trace sample rate is 5%. Development and test tracing is off unless explicitly enabled. Error reporting remains enabled whenever a DSN is present outside tests.

## Privacy behavior

The SDK configuration disables default user data, cookies, request and response headers and bodies, URL query strings, GraphQL variables, database query data, AI inputs and outputs, console breadcrumbs, local variables, and Sentry logs. A final event processor also removes user context and filters common secrets, email addresses, IP addresses, financial fields, prompts, and conversations.

Session Replay and the user-feedback widget are not enabled. Do not add them without a separate privacy review and explicit field masking.

Sentry may still derive an IP address at ingestion time. In the Sentry project, enable **Prevent Storing of IP Addresses** and keep server-side data scrubbing enabled as defense in depth.

## Integration points

- `src/instrument.ts` initializes backend monitoring before application modules load.
- `src/index.ts` installs Sentry's Express error handler after all routes.
- `frontend/instrumentation-client.ts` initializes browser monitoring and router transition capture.
- `frontend/instrumentation.ts` registers Node and Edge monitoring and request-error capture.
- `frontend/src/app/global-error.tsx` captures root React rendering failures.
- `frontend/next.config.ts` uploads production source maps when build credentials are present, then removes browser source maps from the build output.

## External provider failures

The backend wraps its outbound `fetch` implementation and the shared Axios client used by
provider SDKs during Sentry startup. HTTP 4xx and 5xx responses, timeouts, and network failures
from external providers are reported as grouped Sentry issues. This covers current integrations
such as Brave Search, Massive, FRED, RentCast, Tiingo, FMP, MailerLite, Plaid,
SnapTrade, Stripe, and the live AI model catalogs, and it automatically covers future providers
that use `fetch` or the shared Axios client.

Provider events use stable tags for `external_provider.name`,
`external_provider.operation`, `http.status_code`, `http.status_class`, and retryability.
HTTP 4xx responses are warnings; HTTP 5xx and network failures are errors. Query strings,
request and response bodies, headers, credentials, full endpoint paths, and user data are never
attached. Sentry transport, Ask Linc services, localhost, and the production health endpoint are
excluded to prevent recursion and false provider alerts.

Useful Sentry searches after deployment:

- All provider failures: `external_provider:true`
- Provider 5xx responses: `external_provider:true http.status_class:5xx`
- Provider 4xx responses: `external_provider:true http.status_class:4xx`
- Network errors and timeouts: `external_provider:true http.status_class:network`
- One provider: `external_provider.name:brave_search` or `external_provider.name:massive`

There is intentionally no public Sentry test page or API route. Verify changes with a controlled one-off event outside production, then inspect the resulting event for unexpected data before enabling or increasing trace sampling.
