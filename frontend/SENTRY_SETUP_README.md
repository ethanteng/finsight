# Sentry Integration Setup Guide

This guide covers the complete setup of Sentry.io for monitoring your Ask Linc application's performance, errors, and user experience.

## What Sentry Provides

- **Error Monitoring**: Automatic capture of JavaScript errors, uncaught exceptions, and unhandled rejections
- **Performance Monitoring**: Track page load times, API calls, and user interactions
- **Session Replay**: Video-like reproductions of user sessions to debug issues faster
- **Structured Logging**: Centralized logging with context and search capabilities
- **User Feedback**: Collect user feedback when errors occur
- **Release Tracking**: Monitor performance and errors across different app versions

## Files Created

1. **`sentry.client.config.ts`** - Client-side Sentry configuration
2. **`sentry.server.config.ts`** - Server-side Sentry configuration  
3. **`sentry.edge.config.ts`** - Edge runtime Sentry configuration
4. **`instrumentation.ts`** - Next.js instrumentation hook
5. **`SentryErrorBoundary.tsx`** - React error boundary component
6. **`/sentry-test`** - Test page to verify integration
7. **`/api/sentry-test`** - API route for testing backend integration

## Environment Variables Required

Add these to your `.env.local` file:

```bash
# Sentry Configuration
NEXT_PUBLIC_SENTRY_DSN=https://your-public-key@your-org.ingest.sentry.io/your-project-id
SENTRY_DSN=https://your-private-key@your-org.ingest.sentry.io/your-project-id
SENTRY_ORG=your-organization-name
SENTRY_PROJECT=your-project-name
SENTRY_AUTH_TOKEN=your-auth-token

# App version for release tracking
NEXT_PUBLIC_APP_VERSION=1.0.0
APP_VERSION=1.0.0
```

## How to Get Sentry Credentials

1. Go to [Sentry.io](https://sentry.io) and create an account
2. Create a new organization (or use existing)
3. Create a new project and select "Next.js" as the platform
4. Copy the DSN from your project settings
5. Go to Settings > Projects > [Your Project] > API Keys
6. Create a new API key with project:write scope
7. Copy the auth token

## Configuration Details

### Client-Side Configuration (`sentry.client.config.ts`)
- Error monitoring with automatic capture
- Performance tracing with browser integration
- Session replay (10% of sessions, 100% of error sessions)
- User feedback integration
- Environment-aware sampling rates

### Server-Side Configuration (`sentry.server.config.ts`)
- Server error monitoring
- API performance tracing
- Structured logging
- Request context capture

### Edge Runtime Configuration (`sentry.edge.config.ts`)
- Edge function monitoring
- Middleware performance tracking
- Lightweight error capture

## Usage Examples

### Error Capturing
```typescript
import * as Sentry from '@sentry/nextjs';

try {
  // Your code here
} catch (error) {
  Sentry.captureException(error, {
    tags: { component: 'UserProfile' },
    extra: { userId: user.id }
  });
}
```

### Performance Tracing
```typescript
import * as Sentry from '@sentry/nextjs';

const result = await Sentry.startSpan(
  {
    op: 'http.client',
    name: 'Fetch User Data',
  },
  async () => {
    const response = await fetch('/api/user');
    return response.json();
  }
);
```

### Structured Logging
```typescript
import * as Sentry from '@sentry/nextjs';

const { logger } = Sentry;

logger.info('User logged in', {
  userId: user.id,
  method: 'email',
  timestamp: new Date().toISOString()
});
```

### User Context
```typescript
import * as Sentry from '@sentry/nextjs';

Sentry.setUser({
  id: user.id,
  email: user.email,
  username: user.username
});

Sentry.setTag('user_type', user.subscriptionTier);
```

## Testing the Integration

1. Start your development server: `npm run dev`
2. Navigate to `/sentry-test` in your browser
3. Test each feature:
   - Click "Throw Frontend Error" to test error monitoring
   - Click "Test API Call" to test performance tracing
   - Click "Test Logging" to test structured logging
   - Click "Set User Context" to test user tracking

4. Check your Sentry dashboard for:
   - Captured errors in the Issues section
   - Performance traces in the Performance section
   - Log messages in the Logs section
   - Session replays in the Replays section

## Production Deployment

### Vercel (Frontend)
1. Add environment variables in Vercel dashboard
2. Sentry will automatically upload source maps during build
3. Monitor deployment health in Sentry releases

### Render (Backend)
1. Add environment variables in Render dashboard
2. Ensure `SENTRY_DSN` is set for backend monitoring
3. Monitor API performance and errors

## Best Practices

1. **Error Boundaries**: Wrap critical components with `SentryErrorBoundary`
2. **Performance Spans**: Create spans for meaningful user interactions
3. **Structured Logging**: Use structured logs instead of console.log
4. **User Context**: Set user information early in the session
5. **Release Tracking**: Update version numbers for each deployment
6. **Sampling Rates**: Adjust sampling rates based on traffic volume

## Monitoring and Alerts

1. **Error Alerts**: Set up alerts for high error rates
2. **Performance Alerts**: Monitor for slow page loads or API calls
3. **User Impact**: Track errors affecting user experience
4. **Release Health**: Monitor performance after deployments

## Troubleshooting

### Common Issues

1. **No data in Sentry**: Check DSN configuration and environment variables
2. **Source maps not working**: Verify auth token and project settings
3. **Performance data missing**: Ensure tracing is enabled and sampling rates are appropriate
4. **Session replays not working**: Check browser compatibility and privacy settings

### Debug Mode
Enable debug mode by adding to your config:
```typescript
Sentry.init({
  debug: true, // Enable debug logging
  // ... other config
});
```

## Security Considerations

1. **DSN Exposure**: Client DSN is public, server DSN should be private
2. **PII Handling**: Review `sendDefaultPii` settings for compliance
3. **Source Maps**: Ensure source maps don't expose sensitive information
4. **User Data**: Be careful with user context and tags

## Support and Resources

- [Sentry Documentation](https://docs.sentry.io/)
- [Next.js Integration Guide](https://docs.sentry.io/platforms/javascript/guides/nextjs/)
- [Sentry Community](https://forum.sentry.io/)
- [Sentry Status Page](https://status.sentry.io/)

## Next Steps

After setup, consider:
1. Setting up custom alerts and notifications
2. Creating performance budgets
3. Implementing error grouping and deduplication
4. Setting up release tracking and deployment monitoring
5. Configuring team access and permissions
