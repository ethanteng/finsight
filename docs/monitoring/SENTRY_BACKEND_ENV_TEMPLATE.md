# Backend Sentry Environment Variables

Add these to your backend `.env` file:

```bash
# Sentry Backend Configuration
SENTRY_DSN=your_backend_sentry_dsn_here
NODE_ENV=development  # or production
```

## How to Get Your Backend Sentry DSN:

1. Go to [Sentry.io](https://sentry.io)
2. Navigate to your project
3. Go to **Settings** → **Projects** → **Your Project** → **Client Keys (DSN)**
4. Copy the **DSN** value
5. Paste it as the value for `SENTRY_DSN`

## What This Enables:

✅ **AI Performance Monitoring** - Response times, question lengths, user tiers  
✅ **Error Tracking** - All backend errors captured with context  
✅ **Performance Spans** - Detailed timing data for AI requests  
✅ **User Context** - User IDs, tiers, and request details  
✅ **Cron Job Monitoring** - Background task error tracking  

## Example DSN Format:

```
https://abc123def456@o123456.ingest.sentry.io/789012
```

## Important Notes:

- **Different from Frontend**: This is a separate DSN for your backend
- **Environment**: Set `NODE_ENV` to match your deployment environment
- **Security**: The DSN is safe to include in your code (it's public)
- **Performance**: Currently set to capture 100% of transactions for monitoring
