# Sentry Environment Variables Template

Copy these variables to your `.env.local` file and fill in the actual values from your Sentry project:

```bash
# Sentry Configuration
# Get these values from your Sentry project settings

# Client-side DSN (public)
NEXT_PUBLIC_SENTRY_DSN=https://your-public-key@your-org.ingest.sentry.io/your-project-id

# Server-side DSN (private)
SENTRY_DSN=https://your-private-key@your-org.ingest.sentry.io/your-project-id

# Sentry organization and project (for source map uploads)
SENTRY_ORG=your-organization-name
SENTRY_PROJECT=your-project-name

# App version for release tracking
NEXT_PUBLIC_APP_VERSION=1.0.0
APP_VERSION=1.0.0

# Sentry auth token (for source map uploads)
SENTRY_AUTH_TOKEN=your-auth-token
```

## How to get these values:

1. Go to [Sentry.io](https://sentry.io) and create a new project
2. Select "Next.js" as your platform
3. Copy the DSN from your project settings
4. Go to Settings > Projects > [Your Project] > API Keys to get your auth token
5. Your org and project names are visible in the URL: `https://sentry.io/organizations/[ORG]/projects/[PROJECT]/`
