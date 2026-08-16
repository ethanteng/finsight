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

There is intentionally no public Sentry test page or API route. Verify changes with a controlled one-off event outside production, then inspect the resulting event for unexpected data before enabling or increasing trace sampling.
