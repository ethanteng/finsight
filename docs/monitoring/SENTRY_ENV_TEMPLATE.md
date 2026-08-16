# Sentry environment variables

See `SENTRY_SETUP_README.md` for placement and privacy guidance.

```bash
# Backend runtime
SENTRY_DSN=https://public-key@organization.ingest.sentry.io/project-id
SENTRY_ENVIRONMENT=development
SENTRY_TRACES_SAMPLE_RATE=0

# Frontend runtime
NEXT_PUBLIC_SENTRY_DSN=https://public-key@organization.ingest.sentry.io/project-id
NEXT_PUBLIC_SENTRY_ENVIRONMENT=development
NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE=0

# Frontend build only; never expose this token with NEXT_PUBLIC_
SENTRY_ORG=your-organization
SENTRY_PROJECT=your-project
SENTRY_AUTH_TOKEN=your-source-map-upload-token
```
